"""Durable local delivery queue for the Smart Lab Agent.

The Agent must keep telemetry when the Backend is temporarily unreachable.
SQLite is part of the Python standard library, so this module adds no runtime
dependency to the lab PCs.
"""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Optional


class AgentOutbox:
    """Persist pending Agent requests and login-attempt identifiers locally."""

    def __init__(self, db_path: Optional[str] = None):
        if db_path:
            self.path = os.path.abspath(db_path)
            data_dir = os.path.dirname(self.path) or os.getcwd()
        else:
            data_dir = os.getenv("SMART_LAB_AGENT_DATA_DIR")
            if not data_dir:
                data_dir = (
                    os.getenv("LOCALAPPDATA")
                    or os.getenv("APPDATA")
                    or os.path.join(os.path.expanduser("~"), ".smart_lab_agent")
                )
            data_dir = os.path.join(data_dir, "SmartLabAgent")
            self.path = os.path.join(data_dir, "outbox.sqlite3")

        os.makedirs(data_dir, exist_ok=True)
        self._lock = threading.RLock()
        self._initialize()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA synchronous=FULL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._lock, self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS outbox (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    kind TEXT NOT NULL,
                    session_id INTEGER,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at TEXT NOT NULL,
                    last_error TEXT
                );

                CREATE INDEX IF NOT EXISTS idx_outbox_due
                    ON outbox (next_attempt_at, id);

                CREATE INDEX IF NOT EXISTS idx_outbox_session
                    ON outbox (session_id, id);

                CREATE TABLE IF NOT EXISTS session_attempts (
                    client_session_id TEXT PRIMARY KEY,
                    email TEXT NOT NULL,
                    lab_code TEXT NOT NULL,
                    device TEXT NOT NULL,
                    device_mac TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_session_attempts_lookup
                    ON session_attempts (email, lab_code, device_mac, created_at);

                CREATE TABLE IF NOT EXISTS policy_cache (
                    policy_name TEXT PRIMARY KEY,
                    version TEXT,
                    payload TEXT NOT NULL,
                    saved_at TEXT NOT NULL
                );
                """
            )

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def enqueue(
        self,
        kind: str,
        payload: dict[str, Any],
        session_id: Optional[int] = None,
        event_id: Optional[str] = None,
    ) -> str:
        """Insert a request once and return its stable idempotency key."""

        resolved_event_id = (event_id or uuid.uuid4().hex).strip()
        if not resolved_event_id:
            raise ValueError("event_id cannot be empty")

        payload_json = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        now = self._now().isoformat()
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO outbox (
                    event_id, kind, session_id, payload, created_at, next_attempt_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (resolved_event_id, kind, session_id, payload_json, now, now),
            )
        return resolved_event_id

    def pending(self, limit: int = 10) -> list[dict[str, Any]]:
        safe_limit = max(1, min(int(limit), 100))
        now = self._now().isoformat()
        with self._lock, self._connect() as connection:
            rows = connection.execute(
                """
                SELECT id, event_id, kind, session_id, payload, attempts, last_error
                FROM outbox
                WHERE next_attempt_at <= ?
                ORDER BY id
                LIMIT ?
                """,
                (now, safe_limit),
            ).fetchall()
        return [dict(row) for row in rows]

    def has_pending_for_session(self, session_id: int) -> bool:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT 1 FROM outbox WHERE session_id = ? LIMIT 1",
                (session_id,),
            ).fetchone()
        return row is not None

    def pending_count(self) -> int:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT COUNT(*) AS count FROM outbox").fetchone()
        return int(row["count"])

    def mark_sent(self, event_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM outbox WHERE event_id = ?", (event_id,))

    def mark_failed(
        self,
        event_id: str,
        error: str,
        retry_after_seconds: Optional[int] = None,
    ) -> None:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT attempts FROM outbox WHERE event_id = ?",
                (event_id,),
            ).fetchone()
            if row is None:
                return

            delay = retry_after_seconds
            if delay is None:
                delay = min(300, 2 ** min(int(row["attempts"]), 8))
            next_attempt = self._now() + timedelta(seconds=max(1, int(delay)))
            connection.execute(
                """
                UPDATE outbox
                SET attempts = attempts + 1,
                    next_attempt_at = ?,
                    last_error = ?
                WHERE event_id = ?
                """,
                (next_attempt.isoformat(), str(error or "unknown")[:500], event_id),
            )

    def get_or_create_session_attempt(
        self,
        email: str,
        lab_code: str,
        device: str,
        device_mac: str,
        max_age_hours: int = 24,
    ) -> str:
        """Reuse a recent start request if its response may have been lost."""

        normalized = (
            email.strip(),
            lab_code.strip(),
            device.strip(),
            device_mac.strip().lower(),
        )
        cutoff = (self._now() - timedelta(hours=max_age_hours)).isoformat()
        with self._lock, self._connect() as connection:
            row = connection.execute(
                """
                SELECT client_session_id
                FROM session_attempts
                WHERE email = ?
                  AND lab_code = ?
                  AND device_mac = ?
                  AND created_at >= ?
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (normalized[0], normalized[1], normalized[3], cutoff),
            ).fetchone()
            if row is not None:
                return str(row["client_session_id"])

            client_session_id = uuid.uuid4().hex
            connection.execute(
                """
                INSERT INTO session_attempts (
                    client_session_id, email, lab_code, device, device_mac, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (client_session_id, *normalized, self._now().isoformat()),
            )
            return client_session_id

    def clear_session_attempt(self, client_session_id: str) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                "DELETE FROM session_attempts WHERE client_session_id = ?",
                (client_session_id,),
            )

    def save_policy_cache(
        self,
        policy_name: str,
        payload: dict[str, Any],
        version: Optional[str] = None,
    ) -> None:
        """Persist the last known-good Agent policy for offline recovery."""

        now = self._now().isoformat()
        payload_json = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO policy_cache (policy_name, version, payload, saved_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(policy_name) DO UPDATE SET
                    version = excluded.version,
                    payload = excluded.payload,
                    saved_at = excluded.saved_at
                """,
                (policy_name, version, payload_json, now),
            )

    def load_policy_cache(self, policy_name: str) -> Optional[dict[str, Any]]:
        """Load a cached policy, returning None when it is missing or invalid."""

        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT version, payload, saved_at FROM policy_cache WHERE policy_name = ?",
                (policy_name,),
            ).fetchone()
        if row is None:
            return None

        try:
            payload = json.loads(row["payload"])
        except (TypeError, ValueError):
            return None
        if not isinstance(payload, dict):
            return None

        payload.setdefault("version", row["version"])
        payload["cached_at"] = row["saved_at"]
        return payload
