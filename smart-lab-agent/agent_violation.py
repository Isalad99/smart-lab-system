"""State machine for the Agent's forbidden-application grace period."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional


DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_WARNING_SECONDS = 5
DEFAULT_GRACE_SECONDS = 5 * 60


@dataclass(frozen=True)
class ViolationAttempt:
    """The result of registering one forbidden-application detection."""

    number: int
    must_terminate: bool


class ViolationState:
    """Track warning attempts and the current five-minute grace period."""

    def __init__(
        self,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        grace_seconds: int = DEFAULT_GRACE_SECONDS,
    ) -> None:
        self.max_attempts = max(1, int(max_attempts))
        self.grace_seconds = max(1, int(grace_seconds))
        self.attempts = 0
        self.grace_until: Optional[datetime] = None

    def reset(self) -> None:
        self.attempts = 0
        self.grace_until = None

    def is_grace_active(self, now: datetime) -> bool:
        return self.grace_until is not None and now < self.grace_until

    def clear_expired_grace(self, now: datetime) -> bool:
        if self.grace_until is None or now < self.grace_until:
            return False
        self.grace_until = None
        return True

    def register_detection(self, now: datetime) -> Optional[ViolationAttempt]:
        """Register a detection unless the session is still in its grace period."""

        self.clear_expired_grace(now)
        if self.is_grace_active(now):
            return None

        self.attempts = min(self.max_attempts, self.attempts + 1)
        return ViolationAttempt(
            number=self.attempts,
            must_terminate=self.attempts >= self.max_attempts,
        )

    def grant_grace(self, now: datetime) -> datetime:
        self.grace_until = now + timedelta(seconds=self.grace_seconds)
        return self.grace_until
