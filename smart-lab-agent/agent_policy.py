"""Policy normalization and matching helpers for the Windows Agent.

The helpers in this module intentionally have no GUI or network dependency so
that policy behavior can be tested without starting the Agent window.
"""

from __future__ import annotations

from typing import Any, Optional


SUPPORTED_MATCH_TYPES = frozenset(
    {
        "process_name",
        "process_name_or_title",
        "exe_path",
        "window_title",
    }
)


DEFAULT_FALLBACK_RULES = [
    {
        "id": None,
        "app_name": "BitTorrent",
        "match_type": "process_name_or_title",
        "match_value": "bittorrent",
        "enabled": True,
    },
    {
        "id": None,
        "app_name": "CheatEngine",
        "match_type": "process_name_or_title",
        "match_value": "cheatengine",
        "enabled": True,
    },
    {
        "id": None,
        "app_name": "GenshinImpact",
        "match_type": "process_name_or_title",
        "match_value": "genshinimpact",
        "enabled": True,
    },
    {
        "id": None,
        "app_name": "GenshinImpact",
        "match_type": "window_title",
        "match_value": "genshin",
        "enabled": True,
    },
    {
        "id": None,
        "app_name": "StarRail",
        "match_type": "process_name_or_title",
        "match_value": "starrail",
        "enabled": True,
    },
    {
        "id": None,
        "app_name": "StarRail",
        "match_type": "window_title",
        "match_value": "star rail",
        "enabled": True,
    },
]


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


def normalize_rules(raw_rules: Any) -> list[dict[str, Any]]:
    """Validate and normalize the policy payload returned by the Backend."""

    if not isinstance(raw_rules, list):
        return []

    rules: list[dict[str, Any]] = []
    for raw_rule in raw_rules:
        if not isinstance(raw_rule, dict) or raw_rule.get("enabled") is False:
            continue

        app_name = str(raw_rule.get("app_name") or "").strip()
        match_type = str(
            raw_rule.get("match_type") or "process_name_or_title"
        ).strip().casefold()
        match_value = str(raw_rule.get("match_value") or app_name).strip()
        if not app_name or not match_value or match_type not in SUPPORTED_MATCH_TYPES:
            continue

        rules.append(
            {
                "id": raw_rule.get("id"),
                "app_name": app_name,
                "match_type": match_type,
                "match_value": match_value,
                "enabled": True,
            }
        )

    return rules


def find_process_match(
    rules: list[dict[str, Any]],
    process_name: Any,
    exe_path: Optional[Any] = None,
) -> Optional[dict[str, Any]]:
    """Find an exact process-name or executable-path policy match."""

    normalized_process = normalize_process_name(process_name)
    normalized_exe_path = normalize_path(exe_path)

    for rule in rules:
        match_type = rule["match_type"]
        match_value = rule["match_value"]
        if match_type in {"process_name", "process_name_or_title"}:
            if normalized_process and normalized_process == normalize_process_name(match_value):
                return rule
        elif match_type == "exe_path":
            if normalized_exe_path and normalized_exe_path == normalize_path(match_value):
                return rule

    return None


def find_window_match(
    rules: list[dict[str, Any]],
    window_title: Any,
) -> Optional[dict[str, Any]]:
    """Find a configured window-title policy match."""

    normalized_title = normalize_compact(window_title)
    if not normalized_title:
        return None

    for rule in rules:
        if rule["match_type"] not in {"window_title", "process_name_or_title"}:
            continue
        normalized_value = normalize_compact(rule["match_value"])
        if normalized_value and normalized_value in normalized_title:
            return rule

    return None
