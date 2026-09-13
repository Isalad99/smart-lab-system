"""Shared Backend helpers for Agent policy serialization and validation."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

import models
from sqlalchemy.orm import Session


DEFAULT_MATCH_TYPE = "process_name_or_title"
SUPPORTED_MATCH_TYPES = frozenset(
    {
        "process_name",
        "process_name_or_title",
        "exe_path",
        "window_title",
    }
)


def normalize_compact(value: Any) -> str:
    """Normalize names/titles for case-insensitive, punctuation-tolerant matching."""

    return "".join(
        character
        for character in str(value or "").casefold()
        if character.isalnum()
    )


def normalize_process_name(value: Any) -> str:
    """Return a process basename without a Windows .exe suffix."""

    raw_value = str(value or "").strip().replace("/", "\\")
    basename = raw_value.rsplit("\\", 1)[-1]
    if basename.casefold().endswith(".exe"):
        basename = basename[:-4]
    return normalize_compact(basename)


def normalize_path(value: Any) -> str:
    """Normalize a Windows executable path for exact comparison."""

    return str(value or "").strip().strip('"').replace("/", "\\").casefold().rstrip("\\")


def serialize_rule(app: models.BlacklistedApp, include_created_at: bool = False) -> dict[str, Any]:
    """Serialize a DB row without returning an ORM object to the Agent."""

    match_type = (getattr(app, "match_type", None) or DEFAULT_MATCH_TYPE).strip().casefold()
    if match_type not in SUPPORTED_MATCH_TYPES:
        match_type = DEFAULT_MATCH_TYPE

    result: dict[str, Any] = {
        "id": app.id,
        "app_name": app.app_name,
        "description": app.description,
        "match_type": match_type,
        "match_value": (
            getattr(app, "match_value", None) or app.app_name
        ).strip(),
        "enabled": bool(getattr(app, "enabled", True)),
    }
    if include_created_at:
        result["created_at"] = app.created_at
    return result


def get_policy_rules(db: Session, enabled_only: bool = True) -> list[dict[str, Any]]:
    query = db.query(models.BlacklistedApp)
    if enabled_only:
        query = query.filter(models.BlacklistedApp.enabled.is_(True))
    apps = query.order_by(models.BlacklistedApp.id.asc()).all()
    return [serialize_rule(app) for app in apps]


def build_policy(rules: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a deterministic policy payload and short content version."""

    canonical = json.dumps(
        rules,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    version = hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16]
    return {"version": version, "data": rules}


def find_matching_rule(
    rules: list[dict[str, Any]],
    *,
    process_name: Optional[str] = None,
    exe_path: Optional[str] = None,
    window_title: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """Validate Agent evidence against the active policy rules."""

    normalized_process = normalize_process_name(process_name)
    normalized_exe_path = normalize_path(exe_path)
    normalized_title = normalize_compact(window_title)

    for rule in rules:
        if rule.get("enabled") is False:
            continue

        match_type = rule.get("match_type") or DEFAULT_MATCH_TYPE
        match_value = str(rule.get("match_value") or rule.get("app_name") or "")
        if not match_value:
            continue

        if match_type in {"process_name", "process_name_or_title"}:
            if normalized_process and normalized_process == normalize_process_name(match_value):
                return rule
            if (
                match_type == "process_name_or_title"
                and normalized_title
                and normalize_compact(match_value) in normalized_title
            ):
                return rule
        elif match_type == "exe_path":
            if normalized_exe_path and normalized_exe_path == normalize_path(match_value):
                return rule
        elif match_type == "window_title":
            if normalized_title and normalize_compact(match_value) in normalized_title:
                return rule

    return None
