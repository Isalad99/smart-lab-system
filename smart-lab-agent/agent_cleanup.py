"""Best-effort cleanup for a shared Windows Lab workstation.

The cleanup deliberately targets only known browser data locations and the
current Windows user's application processes. Database history and the Agent's
durable outbox are never touched here.
"""

from __future__ import annotations

import ctypes
import getpass
import os
import shutil
import sqlite3
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Optional

import psutil


GRACEFUL_CLOSE_SECONDS = 10
FORCE_CLOSE_WAIT_SECONDS = 3

# These processes belong to the Windows shell or desktop infrastructure. They
# must remain alive so that the next Lab user still gets a usable desktop.
PROTECTED_PROCESS_NAMES = frozenset(
    {
        "explorer.exe",
        "dwm.exe",
        "ctfmon.exe",
        "sihost.exe",
        "startmenuexperiencehost.exe",
        "shellexperiencehost.exe",
        "searchhost.exe",
        "runtimebroker.exe",
        "textinputhost.exe",
        "applicationframehost.exe",
        "taskhostw.exe",
        "securityhealthsystray.exe",
    }
)

CHROMIUM_PROFILE_FILES = (
    "Cookies",
    "Cookies-journal",
    "Cookies-shm",
    "Cookies-wal",
    "History",
    "History-journal",
    "History-shm",
    "History-wal",
    "Login Data",
    "Login Data-journal",
    "Login Data-shm",
    "Login Data-wal",
    "Login Data For Account",
    "Login Data For Account-journal",
    "Login Data For Account-shm",
    "Login Data For Account-wal",
    "Shortcuts",
    "Shortcuts-journal",
    "Shortcuts-shm",
    "Shortcuts-wal",
    "Top Sites",
    "Top Sites-journal",
    "Top Sites-shm",
    "Top Sites-wal",
    "Visited Links",
    "Web Data",
    "Web Data-journal",
    "Web Data-shm",
    "Web Data-wal",
    "Current Session",
    "Current Tabs",
    "Last Session",
    "Last Tabs",
)

CHROMIUM_PROFILE_PATHS = (
    "Network/Cookies",
    "Network/Cookies-journal",
    "Network/Cookies-shm",
    "Network/Cookies-wal",
)

CHROMIUM_PROFILE_DIRECTORIES = (
    "Cache",
    "Code Cache",
    "DawnCache",
    "GPUCache",
    "Media Cache",
    "File System",
    "IndexedDB",
    "Local Storage",
    "Session Storage",
    "Sessions",
    "Service Worker",
    "Storage",
    "WebStorage",
    "blob_storage",
)

FIREFOX_PROFILE_FILES = (
    "cookies.sqlite",
    "cookies.sqlite-shm",
    "cookies.sqlite-wal",
    "formhistory.sqlite",
    "formhistory.sqlite-shm",
    "formhistory.sqlite-wal",
    "logins.json",
    "key4.db",
    "sessionstore.jsonlz4",
    "recovery.jsonlz4",
    "webappsstore.sqlite",
    "webappsstore.sqlite-shm",
    "webappsstore.sqlite-wal",
)

FIREFOX_PROFILE_DIRECTORIES = (
    "cache2",
    "startupCache",
    "thumbnails",
    "sessionstore-backups",
    "storage",
)


@dataclass
class CleanupReport:
    """Counts from one cleanup run without exposing user file names."""

    closed_processes: int = 0
    force_closed_processes: int = 0
    removed_browser_items: int = 0
    removed_downloads: int = 0
    errors: list[str] = field(default_factory=list)


def _as_path(value: os.PathLike[str] | str) -> Path:
    return Path(value).expanduser()


def _is_within(path: Path, root: Path) -> bool:
    try:
        path.resolve(strict=False).relative_to(root.resolve(strict=False))
        return True
    except ValueError:
        return False


def _record_error(report: CleanupReport, category: str) -> None:
    if category not in report.errors:
        report.errors.append(category)


class SessionCleanupManager:
    """Close the old user's apps and remove session-created local data."""

    def __init__(
        self,
        *,
        protected_pid: Optional[int] = None,
        user_home: Optional[os.PathLike[str] | str] = None,
        chromium_roots: Optional[Iterable[os.PathLike[str] | str]] = None,
        firefox_roots: Optional[Iterable[os.PathLike[str] | str]] = None,
        download_roots: Optional[Iterable[os.PathLike[str] | str]] = None,
        graceful_close_seconds: int = GRACEFUL_CLOSE_SECONDS,
    ) -> None:
        self.protected_pid = protected_pid or os.getpid()
        self.user_home = _as_path(
            user_home
            or os.getenv("USERPROFILE")
            or Path.home()
        )
        local_app_data = _as_path(
            os.getenv("LOCALAPPDATA")
            or self.user_home / "AppData" / "Local"
        )
        roaming_app_data = _as_path(
            os.getenv("APPDATA")
            or self.user_home / "AppData" / "Roaming"
        )

        if chromium_roots is None:
            chromium_roots = (
                local_app_data / "Google" / "Chrome" / "User Data",
                local_app_data / "Microsoft" / "Edge" / "User Data",
                local_app_data / "BraveSoftware" / "Brave-Browser" / "User Data",
                local_app_data / "Vivaldi" / "User Data",
                roaming_app_data / "Opera Software",
            )
        if firefox_roots is None:
            firefox_roots = (
                roaming_app_data / "Mozilla" / "Firefox" / "Profiles",
                local_app_data / "Mozilla" / "Firefox" / "Profiles",
            )
        if download_roots is None:
            download_roots = (self.user_home / "Downloads",)

        self.chromium_roots = [_as_path(path) for path in chromium_roots]
        self.firefox_roots = [_as_path(path) for path in firefox_roots]
        self.download_roots = [_as_path(path) for path in download_roots]
        self.graceful_close_seconds = max(0, int(graceful_close_seconds))
        self.download_snapshot = self._snapshot_downloads()

    def _snapshot_downloads(self) -> set[Path]:
        snapshot: set[Path] = set()
        for root in self.download_roots:
            if not root.is_dir():
                continue
            try:
                snapshot.update(
                    path.resolve(strict=False)
                    for path in root.rglob("*")
                    if path.is_file()
                )
            except OSError:
                continue
        return snapshot

    @staticmethod
    def _current_user_names() -> set[str]:
        raw_user = os.getenv("USERNAME") or getpass.getuser()
        normalized = raw_user.casefold()
        return {normalized, normalized.rsplit("\\", 1)[-1]}

    def _belongs_to_current_user(self, process: psutil.Process) -> bool:
        try:
            username = process.info.get("username") or process.username()
        except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
            return False
        if not username:
            return False
        normalized = str(username).casefold()
        account_name = normalized.rsplit("\\", 1)[-1]
        return normalized in self._current_user_names() or account_name in self._current_user_names()

    def _candidate_processes(self) -> list[psutil.Process]:
        candidates: list[psutil.Process] = []
        for process in psutil.process_iter(["pid", "name", "username"]):
            try:
                if process.pid == self.protected_pid:
                    continue
                process_name = (process.info.get("name") or "").casefold()
                if process_name in PROTECTED_PROCESS_NAMES:
                    continue
                if self._belongs_to_current_user(process):
                    candidates.append(process)
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                continue
        return candidates

    @staticmethod
    def _request_close_windows(process_ids: set[int]) -> None:
        """Ask visible app windows to close before using a hard process stop."""
        if os.name != "nt" or not process_ids:
            return

        try:
            from ctypes import wintypes

            user32 = ctypes.windll.user32
            callback_type = ctypes.WINFUNCTYPE(
                ctypes.c_bool,
                wintypes.HWND,
                wintypes.LPARAM,
            )
            user32.IsWindowVisible.argtypes = [wintypes.HWND]
            user32.IsWindowVisible.restype = ctypes.c_bool
            user32.GetWindowThreadProcessId.argtypes = [
                wintypes.HWND,
                ctypes.POINTER(wintypes.DWORD),
            ]
            user32.GetWindowThreadProcessId.restype = wintypes.DWORD
            user32.PostMessageW.argtypes = [
                wintypes.HWND,
                wintypes.UINT,
                wintypes.WPARAM,
                wintypes.LPARAM,
            ]
            user32.PostMessageW.restype = ctypes.c_bool

            wm_close = 0x0010

            @callback_type
            def callback(window_handle, _lparam):
                if not user32.IsWindowVisible(window_handle):
                    return True
                process_id = wintypes.DWORD()
                user32.GetWindowThreadProcessId(
                    window_handle,
                    ctypes.byref(process_id),
                )
                if process_id.value in process_ids:
                    user32.PostMessageW(window_handle, wm_close, 0, 0)
                return True

            user32.EnumWindows(callback, 0)
        except (AttributeError, OSError, TypeError):
            # The hard-stop fallback below still prevents a stale app from
            # blocking the next Lab user.
            return

    @staticmethod
    def _running(process: psutil.Process) -> bool:
        try:
            return process.is_running()
        except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
            return False

    def close_user_applications(self, report: CleanupReport) -> None:
        """Close same-user applications while preserving the desktop shell."""
        if os.name != "nt":
            return

        candidates = self._candidate_processes()
        if not candidates:
            return

        process_ids = {process.pid for process in candidates}
        self._request_close_windows(process_ids)

        deadline = time.monotonic() + self.graceful_close_seconds
        while time.monotonic() < deadline:
            if not any(self._running(process) for process in candidates):
                break
            time.sleep(0.25)

        alive = [process for process in candidates if self._running(process)]
        report.closed_processes += len(candidates) - len(alive)
        if not alive:
            return

        for process in alive:
            try:
                process.terminate()
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                continue

        gone, still_alive = psutil.wait_procs(
            alive,
            timeout=FORCE_CLOSE_WAIT_SECONDS,
        )
        report.closed_processes += len(gone)
        for process in still_alive:
            try:
                process.kill()
                report.force_closed_processes += 1
            except (psutil.AccessDenied, psutil.NoSuchProcess, psutil.ZombieProcess):
                _record_error(report, "process_close")

    @staticmethod
    def _profile_directories(root: Path) -> list[Path]:
        if not root.is_dir():
            return []
        try:
            return [
                child
                for child in root.iterdir()
                if child.is_dir()
                and not child.is_symlink()
                and child.name.casefold() not in {"system profile", "guest profile"}
            ]
        except OSError:
            return []

    @staticmethod
    def _remove_path(
        path: Path,
        root: Path,
        report: CleanupReport,
        category: str,
    ) -> bool:
        if not _is_within(path, root):
            _record_error(report, category)
            return False
        try:
            if path.is_symlink() or path.is_file():
                path.unlink()
            elif path.is_dir():
                shutil.rmtree(path)
            else:
                return False
            return True
        except (OSError, shutil.Error):
            _record_error(report, category)
            return False

    def _clear_chromium_profile(
        self,
        profile: Path,
        report: CleanupReport,
    ) -> None:
        for relative_path in CHROMIUM_PROFILE_FILES + CHROMIUM_PROFILE_PATHS:
            if self._remove_path(profile / relative_path, profile, report, "browser_data"):
                report.removed_browser_items += 1
        for directory_name in CHROMIUM_PROFILE_DIRECTORIES:
            if self._remove_path(profile / directory_name, profile, report, "browser_data"):
                report.removed_browser_items += 1

    @staticmethod
    def _sqlite_tables(connection: sqlite3.Connection) -> set[str]:
        rows = connection.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
        return {str(row[0]) for row in rows}

    def _clear_firefox_history(
        self,
        places_path: Path,
        profile: Path,
        report: CleanupReport,
    ) -> None:
        if not places_path.is_file():
            return

        changed = False
        connection: Optional[sqlite3.Connection] = None
        try:
            connection = sqlite3.connect(places_path, timeout=5)
            connection.execute("PRAGMA busy_timeout = 5000")
            tables = self._sqlite_tables(connection)
            with connection:
                if "moz_historyvisits" in tables:
                    connection.execute("DELETE FROM moz_historyvisits")
                    changed = True
                if "moz_inputhistory" in tables:
                    connection.execute("DELETE FROM moz_inputhistory")
                    changed = True
                if "moz_places" in tables:
                    if "moz_bookmarks" in tables:
                        connection.execute(
                            """
                            DELETE FROM moz_places
                            WHERE id NOT IN (
                                SELECT fk FROM moz_bookmarks WHERE fk IS NOT NULL
                            )
                            """
                        )
                    else:
                        connection.execute("DELETE FROM moz_places")
                    changed = True
            if changed:
                connection.execute("VACUUM")
        except sqlite3.Error:
            _record_error(report, "firefox_history")
        finally:
            if connection is not None:
                connection.close()

        if changed:
            for suffix in ("-shm", "-wal"):
                self._remove_path(
                    Path(f"{places_path}{suffix}"),
                    profile,
                    report,
                    "firefox_history",
                )

    def _clear_firefox_profile(
        self,
        profile: Path,
        report: CleanupReport,
    ) -> None:
        places_path = profile / "places.sqlite"
        self._clear_firefox_history(places_path, profile, report)
        for filename in FIREFOX_PROFILE_FILES:
            if self._remove_path(profile / filename, profile, report, "browser_data"):
                report.removed_browser_items += 1
        for directory_name in FIREFOX_PROFILE_DIRECTORIES:
            if self._remove_path(profile / directory_name, profile, report, "browser_data"):
                report.removed_browser_items += 1

    def clear_browser_data(self, report: CleanupReport) -> None:
        """Remove login/session/history/cache data while preserving setup files."""
        for root in self.chromium_roots:
            for profile in self._profile_directories(root):
                self._clear_chromium_profile(profile, report)

        for root in self.firefox_roots:
            for profile in self._profile_directories(root):
                self._clear_firefox_profile(profile, report)

    def clear_new_downloads(self, report: CleanupReport) -> None:
        """Delete only files that appeared after this Session started."""
        for root in self.download_roots:
            if not root.is_dir():
                continue
            try:
                current_files = [
                    path
                    for path in root.rglob("*")
                    if path.is_file()
                ]
            except OSError:
                _record_error(report, "downloads")
                continue

            for path in current_files:
                if path.resolve(strict=False) in self.download_snapshot:
                    continue
                if self._remove_path(path, root, report, "downloads"):
                    report.removed_downloads += 1

    def cleanup(self) -> CleanupReport:
        """Run process, browser and session-download cleanup in safe order."""
        report = CleanupReport()
        self.close_user_applications(report)
        self.clear_browser_data(report)
        self.clear_new_downloads(report)
        return report
