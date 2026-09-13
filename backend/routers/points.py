from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from routers.users import get_current_user

router = APIRouter(tags=["Point System"])

MAX_POINTS = 100
BOOKING_MIN_POINTS = 80
POINT_WARNING_THRESHOLD = 20
POINT_REQUEST_AMOUNT = 10
ADMIN_TEST_DEDUCTION = 10
ADMIN_TEST_RESET_POINTS = MAX_POINTS
TEST_BAN_MARKER = "[admin_test]"
NO_SHOW_GRACE = timedelta(minutes=15)
MAX_EVENT_ID_LENGTH = 256

# ── กฎการเปลี่ยนคะแนน ────────────────────────────────────────────────────────
POINT_RULES = {
    "daily_bonus": +1,       # คะแนนประจำวัน
    "no_show": -5,          # จองแล้วไม่มา
    "forbidden_app": -10,   # เปิดโปรแกรมต้องห้ามในแล็บ
    "late_cancel": -3,      # ยกเลิกก่อนเวลา < 1 ชม.
    "complete_session": +2,  # จบ session ปกติ
    "admin_grant": +10,      # Admin อนุมัติคำขอเพิ่มคะแนน
    "admin_test_deduction": -10,  # ปุ่มทดสอบของ Admin เท่านั้น
    "admin_test_reset": 0,   # เปลี่ยนแบบ dynamic กลับไปที่ 100 สำหรับการทดสอบ
}

# ตรวจจาก threshold ต่ำสุดก่อน เพื่อให้ 10 คะแนนได้ Ban 30 วัน ไม่ใช่ 2 วัน
BAN_RULES = [
    {"below": 20, "ban_days": 30},
    {"below": 40, "ban_days": 7},
    {"below": 60, "ban_days": 5},
    {"below": 80, "ban_days": 2},
]

# These are the initial values for the single row in ``point_policies``.
# Test-only deduction/reset values intentionally stay fixed and are not
# configurable from the Admin page.
DEFAULT_POINT_POLICY = {
    "daily_bonus": 1,
    "complete_session": 2,
    "no_show": -5,
    "forbidden_app": -10,
    "late_cancel": -3,
    "point_request_amount": POINT_REQUEST_AMOUNT,
    "booking_min_points": BOOKING_MIN_POINTS,
    "warning_threshold": POINT_WARNING_THRESHOLD,
    "ban_level_1_below": 20,
    "ban_level_1_days": 30,
    "ban_level_2_below": 40,
    "ban_level_2_days": 7,
    "ban_level_3_below": 60,
    "ban_level_3_days": 5,
    "ban_level_4_below": 80,
    "ban_level_4_days": 2,
}


class PointPolicyUpdate(BaseModel):
    daily_bonus: int = Field(..., ge=0, le=10)
    complete_session: int = Field(..., ge=0, le=20)
    no_show: int = Field(..., ge=-100, le=0)
    forbidden_app: int = Field(..., ge=-100, le=0)
    late_cancel: int = Field(..., ge=-100, le=0)
    point_request_amount: int = Field(..., ge=1, le=100)
    booking_min_points: int = Field(..., ge=1, le=MAX_POINTS)
    warning_threshold: int = Field(..., ge=0, le=MAX_POINTS)
    ban_level_1_below: int = Field(..., ge=1, le=MAX_POINTS)
    ban_level_1_days: int = Field(..., ge=0, le=365)
    ban_level_2_below: int = Field(..., ge=1, le=MAX_POINTS)
    ban_level_2_days: int = Field(..., ge=0, le=365)
    ban_level_3_below: int = Field(..., ge=1, le=MAX_POINTS)
    ban_level_3_days: int = Field(..., ge=0, le=365)
    ban_level_4_below: int = Field(..., ge=1, le=MAX_POINTS)
    ban_level_4_days: int = Field(..., ge=0, le=365)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_aware(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _as_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone().replace(tzinfo=None)
    return value


def _clamp_score(value: Optional[int]) -> int:
    return min(MAX_POINTS, max(0, int(value if value is not None else MAX_POINTS)))


def _policy_value(policy: Optional[models.PointPolicy], field_name: str) -> int:
    default_value = DEFAULT_POINT_POLICY[field_name]
    if policy is None:
        return default_value
    value = getattr(policy, field_name, None)
    return int(value if value is not None else default_value)


def _point_rules(policy: Optional[models.PointPolicy] = None) -> dict:
    return {
        "daily_bonus": _policy_value(policy, "daily_bonus"),
        "no_show": _policy_value(policy, "no_show"),
        "forbidden_app": _policy_value(policy, "forbidden_app"),
        "late_cancel": _policy_value(policy, "late_cancel"),
        "complete_session": _policy_value(policy, "complete_session"),
        "admin_grant": _policy_value(policy, "point_request_amount"),
        "admin_test_deduction": ADMIN_TEST_DEDUCTION * -1,
        "admin_test_reset": 0,
    }


def _ban_rules(policy: Optional[models.PointPolicy] = None) -> list[dict]:
    if policy is None:
        return [rule.copy() for rule in BAN_RULES]
    return [
        {
            "below": _policy_value(policy, "ban_level_1_below"),
            "ban_days": _policy_value(policy, "ban_level_1_days"),
        },
        {
            "below": _policy_value(policy, "ban_level_2_below"),
            "ban_days": _policy_value(policy, "ban_level_2_days"),
        },
        {
            "below": _policy_value(policy, "ban_level_3_below"),
            "ban_days": _policy_value(policy, "ban_level_3_days"),
        },
        {
            "below": _policy_value(policy, "ban_level_4_below"),
            "ban_days": _policy_value(policy, "ban_level_4_days"),
        },
    ]


def _serialize_point_policy(policy: models.PointPolicy) -> dict:
    return {
        "max_points": MAX_POINTS,
        **{
            field_name: _policy_value(policy, field_name)
            for field_name in DEFAULT_POINT_POLICY
        },
        "updated_by": policy.updated_by,
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
    }


def get_or_create_point_policy(db: Session) -> models.PointPolicy:
    """Return the persisted policy, creating the default row for legacy DBs."""
    policy = db.query(models.PointPolicy).filter(
        models.PointPolicy.id == 1,
    ).first()
    if policy:
        return policy

    policy = models.PointPolicy(id=1, **DEFAULT_POINT_POLICY)
    db.add(policy)
    db.flush()
    return policy


def _validate_point_policy_values(values: dict) -> None:
    thresholds = [
        values["ban_level_1_below"],
        values["ban_level_2_below"],
        values["ban_level_3_below"],
        values["ban_level_4_below"],
    ]
    if thresholds != sorted(set(thresholds)):
        raise HTTPException(
            status_code=422,
            detail="Ban score thresholds must be strictly increasing.",
        )
    if values["warning_threshold"] >= values["booking_min_points"]:
        raise HTTPException(
            status_code=422,
            detail="Warning threshold must be lower than the booking threshold.",
        )
    if values["ban_level_4_below"] > values["booking_min_points"]:
        raise HTTPException(
            status_code=422,
            detail="The highest ban threshold cannot exceed the booking threshold.",
        )


def _warning_level(
    points: int,
    policy: Optional[models.PointPolicy] = None,
) -> str:
    warning_threshold = _policy_value(policy, "warning_threshold")
    booking_min_points = _policy_value(policy, "booking_min_points")
    if points == 0:
        return "zero"
    if points <= warning_threshold:
        return "critical"
    if points < booking_min_points:
        return "warning"
    return "normal"


def _clean_event_id(value: Optional[str]) -> Optional[str]:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if len(cleaned) > MAX_EVENT_ID_LENGTH:
        raise ValueError("event_id is too long")
    return cleaned


def _serialize_point_request(
    request: models.PointRequest,
    user: Optional[models.User] = None,
) -> dict:
    result = {
        "id": request.id,
        "user_id": request.user_id,
        "requested_points": request.requested_points,
        "status": request.status,
        "user_message": request.user_message,
        "admin_note": request.admin_note,
        "reviewed_by": request.reviewed_by,
        "reviewed_at": request.reviewed_at,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
    }
    if user is not None:
        result.update({
            "name": f"{user.first_name} {user.last_name}".strip(),
            "email": user.email,
        })
    return result


def _get_latest_point_request(
    user_id: int,
    db: Session,
) -> Optional[models.PointRequest]:
    return db.query(models.PointRequest).filter(
        models.PointRequest.user_id == user_id,
    ).order_by(models.PointRequest.id.desc()).first()


def _get_pending_point_request(
    user_id: int,
    db: Session,
) -> Optional[models.PointRequest]:
    return db.query(models.PointRequest).filter(
        models.PointRequest.user_id == user_id,
        models.PointRequest.status == "pending",
    ).order_by(models.PointRequest.id.desc()).first()


def is_admin_user(user_id: int, db: Session) -> bool:
    return db.query(models.Role.id).join(
        models.UserRole,
        models.UserRole.role_id == models.Role.id,
    ).filter(
        models.UserRole.user_id == user_id,
        models.Role.name == "admin",
    ).first() is not None


def _require_user_access(
    target_user_id: int,
    current_user: models.User,
    db: Session,
) -> None:
    if current_user.id != target_user_id and not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="You cannot view another user's points.")


def get_or_create_points(user_id: int, db: Session) -> models.UserPoints:
    """ดึงบัญชีคะแนนและสร้างด้วย 100 คะแนนเมื่อเป็น user legacy"""
    record = db.query(models.UserPoints).filter(
        models.UserPoints.user_id == user_id,
    ).with_for_update().first()
    if not record:
        record = models.UserPoints(user_id=user_id, points=MAX_POINTS)
        db.add(record)
        db.flush()
    return record


def get_or_create_daily_score(
    user_id: int,
    score_date: date,
    db: Session,
) -> models.UserDailyScore:
    record = db.query(models.UserDailyScore).filter(
        models.UserDailyScore.user_id == user_id,
        models.UserDailyScore.score_date == score_date,
    ).with_for_update().first()
    if not record:
        record = models.UserDailyScore(
            user_id=user_id,
            score_date=score_date,
            score=MAX_POINTS,
        )
        db.add(record)
        db.flush()
    return record


def _get_active_ban(user_id: int, db: Session) -> Optional[models.BanRecord]:
    return db.query(models.BanRecord).filter(
        models.BanRecord.user_id == user_id,
        models.BanRecord.ban_until > _now_utc(),
    ).order_by(models.BanRecord.ban_until.desc()).first()


def apply_ban_if_needed(
    user_id: int,
    points: int,
    db: Session,
    event_reason: Optional[str] = None,
    policy: Optional[models.PointPolicy] = None,
) -> Optional[int]:
    """สร้างประวัติ Ban เฉพาะเมื่อ Ban ใหม่ยาวกว่าที่กำลังใช้อยู่"""
    ban_days = next(
        (rule["ban_days"] for rule in sorted(_ban_rules(policy), key=lambda item: item["below"])
         if points < rule["below"]),
        None,
    )
    if ban_days is None or ban_days <= 0:
        return None

    proposed_until = _now_utc() + timedelta(days=ban_days)
    active_ban = _get_active_ban(user_id, db)
    active_until = _as_aware(active_ban.ban_until) if active_ban else None
    remaining = active_until - _now_utc() if active_until else None
    if active_until is None or remaining < timedelta(days=ban_days) - timedelta(minutes=1):
        ban_reason = f"คะแนนต่ำกว่าเกณฑ์ ({points} คะแนน)"
        if event_reason == "admin_test_deduction":
            ban_reason = f"{ban_reason} {TEST_BAN_MARKER}"
        db.add(models.BanRecord(
            user_id=user_id,
            ban_until=proposed_until,
            reason=ban_reason,
        ))
    return ban_days


def is_user_banned(user_id: int, db: Session) -> Optional[datetime]:
    """คืนเวลาสิ้นสุด Ban ที่ยังมีผลอยู่นานที่สุด"""
    active_ban = _get_active_ban(user_id, db)
    return active_ban.ban_until if active_ban else None


def _existing_point_event_response(
    existing: models.PointLog,
    resolved_event_id: str,
    user_id: int,
    db: Session,
) -> dict:
    if existing.user_id != user_id:
        raise ValueError("event_id is already associated with another user")
    ban_until = is_user_banned(user_id, db)
    return {
        "before": existing.points_before,
        "after": existing.points_after,
        "change": existing.change,
        "daily_score_before": existing.daily_score_before,
        "daily_score_after": existing.daily_score_after,
        "score_date": existing.score_date,
        "ban_days": None,
        "ban_until": ban_until,
        "event_id": resolved_event_id,
        "idempotent": True,
    }


def apply_point_event(
    user_id: int,
    reason: str,
    db: Session,
    note: Optional[str] = None,
    event_id: Optional[str] = None,
    source_type: Optional[str] = None,
    source_id: Optional[int] = None,
    effective_at: Optional[datetime] = None,
    commit: bool = True,
    change_override: Optional[int] = None,
    policy: Optional[models.PointPolicy] = None,
) -> dict:
    """Apply one idempotent point event to total and daily balances.

    ``commit=False`` lets Agent/session workflows commit the audit row and
    point event atomically in one transaction.
    """
    resolved_event_id = _clean_event_id(event_id)
    if resolved_event_id:
        existing = db.query(models.PointLog).filter(
            models.PointLog.event_id == resolved_event_id,
        ).first()
        if existing:
            if existing.reason != reason:
                raise ValueError("event_id is already associated with another point event")
            return _existing_point_event_response(existing, resolved_event_id, user_id, db)

    policy = policy or get_or_create_point_policy(db)
    configured_change = _point_rules(policy).get(reason)
    if configured_change is None:
        raise ValueError(f"Unknown reason: {reason}")
    if change_override is None:
        change = configured_change
    else:
        if reason not in {"admin_grant", "admin_test_reset"}:
            raise ValueError("change_override is only supported for point grants and test reset")
        change = int(change_override)
        if change < 0:
            raise ValueError("Point grants and test reset cannot reduce points")

    if not db.query(models.User.id).filter(models.User.id == user_id).first():
        raise ValueError(f"User {user_id} not found")

    record = get_or_create_points(user_id, db)
    # A concurrent request may have inserted the same event while this call
    # waited for the user's point row lock. Re-check after acquiring the lock
    # so daily bonuses and other idempotent events cannot be applied twice.
    if resolved_event_id:
        existing = db.query(models.PointLog).filter(
            models.PointLog.event_id == resolved_event_id,
        ).first()
        if existing:
            if existing.reason != reason:
                raise ValueError("event_id is already associated with another point event")
            return _existing_point_event_response(existing, resolved_event_id, user_id, db)

    before = _clamp_score(record.points)
    after = _clamp_score(before + change)
    record.points = after
    record.updated_at = _now_utc()

    event_time = _as_aware(effective_at) or _now_utc()
    score_date = event_time.date()
    daily_record = get_or_create_daily_score(user_id, score_date, db)
    daily_before = _clamp_score(daily_record.score)
    daily_after = _clamp_score(daily_before + change)
    daily_record.score = daily_after
    daily_record.updated_at = event_time

    point_log = models.PointLog(
        user_id=user_id,
        change=change,
        reason=reason,
        note=note,
        event_id=resolved_event_id,
        source_type=source_type,
        source_id=source_id,
        points_before=before,
        points_after=after,
        daily_score_before=daily_before,
        daily_score_after=daily_after,
        score_date=score_date,
        created_at=event_time,
    )
    db.add(point_log)
    # A recovery grant or another positive event must not create a fresh ban
    # while the system is trying to help the user recover. Negative events
    # remain the source of new/extended score-based bans.
    ban_days = apply_ban_if_needed(
        user_id,
        after,
        db,
        event_reason=reason,
        policy=policy,
    ) if change < 0 else None

    if commit:
        db.commit()
    else:
        db.flush()

    return {
        "before": before,
        "after": after,
        "change": change,
        "daily_score_before": daily_before,
        "daily_score_after": daily_after,
        "score_date": score_date,
        "ban_days": ban_days,
        "ban_until": is_user_banned(user_id, db),
        "event_id": resolved_event_id,
        "idempotent": False,
    }


def ensure_daily_bonus(
    user_id: int,
    db: Session,
    effective_at: Optional[datetime] = None,
    commit: bool = False,
    policy: Optional[models.PointPolicy] = None,
) -> dict:
    """Grant one +1 daily bonus the first time the user is processed that day."""
    if _get_pending_point_request(user_id, db):
        # Keep a zero-point account stable while Admin is deciding on the
        # user's recovery request; otherwise the daily bonus could make the
        # request ineligible before it is reviewed.
        return {"skipped": True, "reason": "pending_point_request"}

    # A zero-point account must remain visible as zero so the user can submit
    # the recovery request. Daily bonus is intentionally not a way to bypass
    # the zero-point recovery flow.
    current_record = get_or_create_points(user_id, db)
    if _clamp_score(current_record.points) == 0:
        return {"skipped": True, "reason": "zero_points"}

    event_time = _as_aware(effective_at) or _now_utc()
    score_date = event_time.date().isoformat()
    return apply_point_event(
        user_id,
        "daily_bonus",
        db,
        note=f"Daily bonus ประจำวัน {score_date}",
        event_id=f"daily:{user_id}:{score_date}",
        source_type="daily_bonus",
        effective_at=event_time,
        commit=commit,
        policy=policy,
    )


def deduct_points(
    user_id: int,
    reason: str,
    db: Session,
    note: Optional[str] = None,
) -> dict:
    """Backward-compatible wrapper for internal callers and manual tests."""
    return apply_point_event(user_id, reason, db, note=note)


def mark_due_no_shows(
    db: Session,
    now: Optional[datetime] = None,
    commit: bool = True,
    policy: Optional[models.PointPolicy] = None,
) -> int:
    """Mark expired reserved bookings and charge each booking once.

    The row lock plus deterministic event id keeps repeated API calls safe.
    The application calls this opportunistically; a scheduler can call the
    admin reconcile endpoint if no traffic occurs after a slot ends.
    """
    policy = policy or get_or_create_point_policy(db)
    now_naive = _as_naive(now or datetime.now())
    candidates = db.query(models.Booking).filter(
        models.Booking.status == "reserved",
        models.Booking.booking_date <= now_naive.date(),
    ).with_for_update().all()

    changed_count = 0
    for booking in candidates:
        if not booking.end_time:
            continue
        due_at = datetime.combine(booking.booking_date, booking.end_time) + NO_SHOW_GRACE
        if due_at > now_naive:
            continue

        booking.status = "no_show"
        booking.no_show_at = now_naive
        apply_point_event(
            booking.user_id,
            "no_show",
            db,
            note=f"ไม่เข้าร่วมการจองห้อง #{booking.id}",
            event_id=f"booking:{booking.id}:no_show",
            source_type="booking",
            source_id=booking.id,
            effective_at=now_naive,
            commit=False,
            policy=policy,
        )
        changed_count += 1

    if commit:
        db.commit()
    return changed_count


def get_booking_restriction(user_id: int, db: Session) -> dict:
    policy = get_or_create_point_policy(db)
    ensure_daily_bonus(user_id, db, policy=policy)
    record = get_or_create_points(user_id, db)
    points = _clamp_score(record.points)
    if record.points != points:
        record.points = points
    ban_until = is_user_banned(user_id, db)
    reasons = []
    booking_min_points = _policy_value(policy, "booking_min_points")
    if points < booking_min_points:
        reasons.append(f"คะแนน {points} ต่ำกว่าเกณฑ์ {booking_min_points}")
    if ban_until:
        reasons.append("บัญชีถูกระงับการจองชั่วคราว")

    return {
        "points": points,
        "booking_min_points": booking_min_points,
        "booking_allowed": not reasons,
        "booking_block_reason": " และ ".join(reasons) if reasons else None,
        "is_banned": ban_until is not None,
        "ban_until": ban_until,
        "warning_level": _warning_level(points, policy),
        "points_warning_threshold": _policy_value(policy, "warning_threshold"),
        "point_request_amount": _policy_value(policy, "point_request_amount"),
    }


def _get_daily_score(user_id: int, score_date: date, db: Session) -> int:
    record = db.query(models.UserDailyScore).filter(
        models.UserDailyScore.user_id == user_id,
        models.UserDailyScore.score_date == score_date,
    ).first()
    return _clamp_score(record.score) if record else MAX_POINTS


def _points_response(user_id: int, db: Session) -> dict:
    restriction = get_booking_restriction(user_id, db)
    today = _now_utc().date()
    latest_request = _get_latest_point_request(user_id, db)
    pending_request = latest_request and latest_request.status == "pending"
    return {
        "user_id": user_id,
        **restriction,
        "daily_score": _get_daily_score(user_id, today, db),
        "daily_score_date": today,
        "points_warning_threshold": restriction["points_warning_threshold"],
        "point_request_amount": restriction["point_request_amount"],
        "point_request": _serialize_point_request(latest_request) if latest_request else None,
        "can_request_points": restriction["points"] == 0 and not pending_request,
    }


def _get_user_or_404(user_id: int, db: Session) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _get_primary_role_name(user_id: int, db: Session) -> str:
    role_names = [row[0] for row in db.query(models.Role.name).join(
        models.UserRole,
        models.Role.id == models.UserRole.role_id,
    ).filter(models.UserRole.user_id == user_id).all()]
    role_priority = {"admin": 0, "student": 1, "guest": 2}
    return min(role_names, key=lambda role: role_priority.get(role, 99)) if role_names else "guest"


def _format_time(value) -> Optional[str]:
    return value.strftime("%H:%M") if value else None


def _serialize_point_log(log: models.PointLog) -> dict:
    return {
        "id": log.id,
        "change": log.change,
        "reason": log.reason,
        "note": log.note,
        "points_before": log.points_before,
        "points_after": log.points_after,
        "daily_score_before": log.daily_score_before,
        "daily_score_after": log.daily_score_after,
        "score_date": log.score_date,
        "source_type": log.source_type,
        "source_id": log.source_id,
        "created_at": log.created_at,
    }


def _logs_response(user_id: int, db: Session, limit: int, before_id: Optional[int]) -> dict:
    query = db.query(models.PointLog).filter(models.PointLog.user_id == user_id)
    if before_id is not None:
        query = query.filter(models.PointLog.id < before_id)

    logs = query.order_by(
        models.PointLog.id.desc(),
    ).limit(limit + 1).all()
    has_more = len(logs) > limit
    logs = logs[:limit]
    next_cursor = str(logs[-1].id) if has_more and logs else None

    return {
        "data": [
            _serialize_point_log(log)
            for log in logs
        ],
        "has_more": has_more,
        "next_cursor": next_cursor,
    }


@router.get("/users/me/points")
def get_my_points(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policy = get_or_create_point_policy(db)
    mark_due_no_shows(db, policy=policy)
    result = _points_response(current_user.id, db)
    db.commit()  # persist a legacy user's initial account if one was created
    return result


@router.get("/users/{user_id}/points")
def get_user_points(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_user_or_404(user_id, db)
    _require_user_access(user_id, current_user, db)
    mark_due_no_shows(db)
    result = _points_response(user_id, db)
    db.commit()
    return result


@router.get("/users/me/points/logs")
def get_my_point_logs(
    limit: int = Query(30, ge=1, le=100),
    before_id: Optional[int] = Query(None, gt=0),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_due_no_shows(db)
    ensure_daily_bonus(current_user.id, db)
    result = _logs_response(current_user.id, db, limit, before_id)
    db.commit()
    return result


@router.get("/users/{user_id}/points/logs")
def get_point_logs(
    user_id: int,
    limit: int = Query(30, ge=1, le=100),
    before_id: Optional[int] = Query(None, gt=0),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_user_or_404(user_id, db)
    _require_user_access(user_id, current_user, db)
    mark_due_no_shows(db)
    ensure_daily_bonus(user_id, db)
    result = _logs_response(user_id, db, limit, before_id)
    db.commit()
    return result


@router.get("/users/me/points/daily")
def get_my_daily_scores(
    limit: int = Query(30, ge=1, le=100),
    before_date: Optional[date] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_due_no_shows(db)
    ensure_daily_bonus(current_user.id, db)
    query = db.query(models.UserDailyScore).filter(
        models.UserDailyScore.user_id == current_user.id,
    )
    if before_date:
        query = query.filter(models.UserDailyScore.score_date < before_date)
    rows = query.order_by(models.UserDailyScore.score_date.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    result = {
        "data": [
            {"score_date": row.score_date, "score": _clamp_score(row.score)}
            for row in rows
        ],
        "has_more": has_more,
        "next_cursor": rows[-1].score_date if has_more and rows else None,
    }
    db.commit()
    return result


@router.post("/admin/points/reconcile-no-shows")
def reconcile_no_shows(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin access required.")
    return {"processed": mark_due_no_shows(db)}


@router.get("/admin/points")
def get_all_user_points(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current point status for every user for the Admin dashboard."""
    if not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin access required.")

    policy = get_or_create_point_policy(db)
    mark_due_no_shows(db, policy=policy)

    today = _now_utc().date()
    rows = db.query(models.User, models.UserPoints).outerjoin(
        models.UserPoints,
        models.UserPoints.user_id == models.User.id,
    ).filter(
        ~models.User.roles.any(models.Role.name == "admin"),
    ).order_by(models.User.id.asc()).all()

    user_ids = [user.id for user, _ in rows]
    role_names = {}
    pending_requests = {}

    if user_ids:
        role_rows = db.query(models.UserRole.user_id, models.Role.name).join(
            models.Role,
            models.Role.id == models.UserRole.role_id,
        ).filter(models.UserRole.user_id.in_(user_ids)).all()
        role_priority = {"admin": 0, "student": 1, "guest": 2}
        for user_id, role_name in role_rows:
            current_role = role_names.get(user_id)
            if current_role is None or role_priority.get(role_name, 99) < role_priority.get(current_role, 99):
                role_names[user_id] = role_name

        request_rows = db.query(models.PointRequest, models.User).join(
            models.User,
            models.User.id == models.PointRequest.user_id,
        ).filter(
            models.PointRequest.user_id.in_(user_ids),
            models.PointRequest.status == "pending",
        ).order_by(models.PointRequest.created_at.asc(), models.PointRequest.id.asc()).all()
        pending_requests = {
            request.user_id: (request, user)
            for request, user in request_rows
        }

    result = []
    for user, point_record in rows:
        ensure_daily_bonus(user.id, db, policy=policy)
        point_record = get_or_create_points(user.id, db)
        points = _clamp_score(point_record.points if point_record else MAX_POINTS)
        ban_until = is_user_banned(user.id, db)
        daily_score = _get_daily_score(user.id, today, db)
        request_row = pending_requests.get(user.id)
        result.append({
            "user_id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "name": f"{user.first_name} {user.last_name}".strip(),
            "email": user.email,
            "role": role_names.get(user.id, "guest"),
            "points": points,
            "daily_score": daily_score,
            "daily_score_date": today,
            "booking_allowed": points >= _policy_value(policy, "booking_min_points") and ban_until is None,
            "is_banned": ban_until is not None,
            "ban_until": ban_until,
            "warning_level": _warning_level(points, policy),
            "points_warning_threshold": _policy_value(policy, "warning_threshold"),
            "point_request_amount": _policy_value(policy, "point_request_amount"),
            "point_request": _serialize_point_request(*request_row) if request_row else None,
            "updated_at": point_record.updated_at if point_record else None,
        })

    scores = [item["points"] for item in result]
    db.commit()
    return {
        "data": result,
        "score_date": today,
        "booking_min_points": _policy_value(policy, "booking_min_points"),
        "points_warning_threshold": _policy_value(policy, "warning_threshold"),
        "point_request_amount": _policy_value(policy, "point_request_amount"),
        "point_requests": [
            _serialize_point_request(request, user)
            for request, user in pending_requests.values()
        ],
        "summary": {
            "total_users": len(result),
            "average_points": round(sum(scores) / len(scores), 1) if scores else 0,
            "below_booking_threshold": sum(
                item["points"] < _policy_value(policy, "booking_min_points") for item in result
            ),
            "banned_users": sum(item["is_banned"] for item in result),
            "booking_allowed": sum(item["booking_allowed"] for item in result),
            "zero_point_users": sum(item["points"] == 0 for item in result),
            "pending_point_requests": len(pending_requests),
        },
    }


@router.post("/users/me/points/request")
def create_point_request(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Let a user at zero points ask Admin for a one-time +10 grant."""
    if is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admins do not need to request points.")

    mark_due_no_shows(db)
    record = get_or_create_points(current_user.id, db)
    points = _clamp_score(record.points)
    if points != 0:
        raise HTTPException(
            status_code=409,
            detail=f"Point requests are available only when your score is 0 (current: {points}).",
        )

    existing = _get_pending_point_request(current_user.id, db)
    if existing:
        return {
            "message": "Your point request is already pending Admin review.",
            "point_request": _serialize_point_request(existing),
        }

    policy = get_or_create_point_policy(db)
    request = models.PointRequest(
        user_id=current_user.id,
        requested_points=_policy_value(policy, "point_request_amount"),
        status="pending",
        user_message="ขอเพิ่มคะแนนเพื่อกลับมาใช้งานห้องแล็บ",
    )
    try:
        db.add(request)
        db.commit()
        db.refresh(request)
    except IntegrityError as exc:
        db.rollback()
        existing = _get_pending_point_request(current_user.id, db)
        if existing:
            return {
                "message": "Your point request is already pending Admin review.",
                "point_request": _serialize_point_request(existing),
            }
        raise HTTPException(status_code=409, detail="Unable to create the point request.") from exc

    return {
        "message": "Point request sent to Admin.",
        "point_request": _serialize_point_request(request),
    }


def _require_admin(current_user: models.User, db: Session) -> None:
    if not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin access required.")


@router.get("/admin/points/policy")
def get_point_policy(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the active point policy and its initial defaults for Admin UI."""
    _require_admin(current_user, db)
    policy = get_or_create_point_policy(db)
    result = _serialize_point_policy(policy)
    db.commit()
    return {"data": result, "defaults": DEFAULT_POINT_POLICY}


@router.put("/admin/points/policy")
def update_point_policy(
    payload: PointPolicyUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Persist new point rules for future events and booking decisions."""
    _require_admin(current_user, db)
    values = payload.model_dump()
    _validate_point_policy_values(values)

    policy = db.query(models.PointPolicy).filter(
        models.PointPolicy.id == 1,
    ).with_for_update().first()
    if not policy:
        policy = models.PointPolicy(id=1, **DEFAULT_POINT_POLICY)
        db.add(policy)

    for field_name, value in values.items():
        setattr(policy, field_name, value)
    policy.updated_by = current_user.id
    policy.updated_at = _now_utc()
    db.commit()
    db.refresh(policy)
    return {
        "message": "Point policy updated.",
        "data": _serialize_point_policy(policy),
        "defaults": DEFAULT_POINT_POLICY,
    }


def _clear_test_bans(user_id: int, db: Session) -> int:
    """Remove only bans explicitly created by the Admin test deduction flow."""
    test_bans = db.query(models.BanRecord).filter(
        models.BanRecord.user_id == user_id,
        models.BanRecord.reason.like(f"%{TEST_BAN_MARKER}"),
    ).all()
    for ban in test_bans:
        db.delete(ban)
    return len(test_bans)


@router.post("/admin/points/test-deduct/{user_id}")
def test_deduct_user_points(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Deduct a fixed amount for testing the low/zero-point user flow."""
    _require_admin(current_user, db)
    target_user = _get_user_or_404(user_id, db)
    if is_admin_user(target_user.id, db):
        raise HTTPException(status_code=404, detail="User not found.")

    mark_due_no_shows(db)
    point_result = apply_point_event(
        target_user.id,
        "admin_test_deduction",
        db,
        note=f"Admin test: ลด {ADMIN_TEST_DEDUCTION} คะแนน โดย Admin #{current_user.id}",
        source_type="admin_test",
        source_id=current_user.id,
        commit=True,
    )
    return {
        "message": f"Test deduction applied: -{ADMIN_TEST_DEDUCTION} points.",
        "user_id": target_user.id,
        "points": point_result,
    }


@router.post("/admin/points/test-reset/{user_id}")
def reset_test_user_points(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Restore a user's score after the Admin test flow without hiding history."""
    _require_admin(current_user, db)
    target_user = _get_user_or_404(user_id, db)
    if is_admin_user(target_user.id, db):
        raise HTTPException(status_code=404, detail="User not found.")

    points_record = get_or_create_points(target_user.id, db)
    latest_log = db.query(models.PointLog).filter(
        models.PointLog.user_id == target_user.id,
    ).order_by(models.PointLog.id.desc()).first()
    if not latest_log or latest_log.reason not in {
        "admin_test_deduction",
        "admin_test_reset",
    }:
        raise HTTPException(
            status_code=409,
            detail="Test reset is available only immediately after an Admin test point action.",
        )

    if _get_pending_point_request(target_user.id, db):
        raise HTTPException(
            status_code=409,
            detail="Reject the pending point request before resetting test points.",
        )

    before = _clamp_score(points_record.points)
    if before == ADMIN_TEST_RESET_POINTS:
        cleared_test_bans = _clear_test_bans(target_user.id, db)
        db.commit()
        return {
            "message": "Test points are already reset.",
            "user_id": target_user.id,
            "reset_applied": False,
            "cleared_test_bans": cleared_test_bans,
            "points": {
                "before": before,
                "after": before,
                "change": 0,
                "ban_until": is_user_banned(target_user.id, db),
            },
        }

    point_result = apply_point_event(
        target_user.id,
        "admin_test_reset",
        db,
        note=f"Admin test: Reset คะแนนกลับเป็น {ADMIN_TEST_RESET_POINTS} โดย Admin #{current_user.id}",
        source_type="admin_test",
        source_id=current_user.id,
        change_override=ADMIN_TEST_RESET_POINTS - before,
        commit=False,
    )
    cleared_test_bans = _clear_test_bans(target_user.id, db)
    db.commit()
    point_result["ban_until"] = is_user_banned(target_user.id, db)
    return {
        "message": f"Test points reset to {ADMIN_TEST_RESET_POINTS}.",
        "user_id": target_user.id,
        "reset_applied": True,
        "cleared_test_bans": cleared_test_bans,
        "points": point_result,
    }


@router.post("/admin/points/requests/{request_id}/approve")
def approve_point_request(
    request_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user, db)
    request = db.query(models.PointRequest).filter(
        models.PointRequest.id == request_id,
    ).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Point request not found.")
    if request.status == "approved":
        return {
            "message": "Point request was already approved.",
            "point_request": _serialize_point_request(request),
        }
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This point request is no longer pending.")

    points_record = get_or_create_points(request.user_id, db)
    if _clamp_score(points_record.points) != 0:
        raise HTTPException(
            status_code=409,
            detail="The user no longer has 0 points. Refresh the request before approving it.",
        )

    reviewed_at = _now_utc()
    point_result = apply_point_event(
        request.user_id,
        "admin_grant",
        db,
        note=f"Admin อนุมัติคำขอเพิ่มคะแนน #{request.id}",
        event_id=f"point-request:{request.id}:approved",
        source_type="point_request",
        source_id=request.id,
        effective_at=reviewed_at,
        change_override=request.requested_points,
        commit=False,
    )
    request.status = "approved"
    request.reviewed_by = current_user.id
    request.reviewed_at = reviewed_at
    request.admin_note = f"อนุมัติเพิ่ม {request.requested_points} คะแนน"
    db.commit()
    db.refresh(request)
    return {
        "message": f"Approved +{request.requested_points} points.",
        "point_request": _serialize_point_request(request),
        "points": point_result,
    }


@router.post("/admin/points/requests/{request_id}/reject")
def reject_point_request(
    request_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user, db)
    request = db.query(models.PointRequest).filter(
        models.PointRequest.id == request_id,
    ).with_for_update().first()
    if not request:
        raise HTTPException(status_code=404, detail="Point request not found.")
    if request.status == "rejected":
        return {
            "message": "Point request was already rejected.",
            "point_request": _serialize_point_request(request),
        }
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="This point request is no longer pending.")

    request.status = "rejected"
    request.reviewed_by = current_user.id
    request.reviewed_at = _now_utc()
    request.admin_note = "Admin ไม่อนุมัติคำขอเพิ่มคะแนน"
    db.commit()
    db.refresh(request)
    return {
        "message": "Point request rejected.",
        "point_request": _serialize_point_request(request),
    }


@router.get("/admin/points/low")
def get_low_point_users(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin access required.")

    policy = get_or_create_point_policy(db)
    mark_due_no_shows(db, policy=policy)
    rows = db.query(models.UserPoints, models.User).join(
        models.User,
        models.User.id == models.UserPoints.user_id,
    ).filter(
        models.UserPoints.points < _policy_value(policy, "booking_min_points"),
        ~models.User.roles.any(models.Role.name == "admin"),
    ).order_by(models.UserPoints.points.asc()).all()

    result = []
    for points, user in rows:
        ban_until = is_user_banned(points.user_id, db)
        result.append({
            "user_id": points.user_id,
            "email": user.email,
            "name": f"{user.first_name} {user.last_name}",
            "points": points.points,
            "is_banned": ban_until is not None,
            "ban_until": ban_until,
        })
    return {"data": result}


@router.get("/admin/users/{user_id}/details")
def get_admin_user_details(
    user_id: int,
    limit: int = Query(50, ge=1, le=100),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return safe profile and activity history for one non-admin user."""
    if not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Admin access required.")

    user = _get_user_or_404(user_id, db)
    role = _get_primary_role_name(user.id, db)
    if role == "admin":
        raise HTTPException(status_code=404, detail="User not found.")

    mark_due_no_shows(db)
    ensure_daily_bonus(user.id, db)

    student = db.query(models.Student).filter(
        models.Student.user_id == user.id,
    ).first()
    passport = db.query(models.UserPassport).filter(
        models.UserPassport.user_id == user.id,
    ).first()
    account_active = student.is_active if role == "student" and student else True
    if role == "guest" and passport:
        account_active = passport.is_active

    profile = {
        "id": user.id,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "email": user.email,
        "profile_pic": user.profile_pic,
        "role": role,
        "account_status": "active" if account_active else "pending",
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "student_id": student.student_id if student else None,
        "faculty": student.faculty if student else None,
        "department": student.department if student else None,
        "phone": passport.phone if passport else None,
    }

    points_record = db.query(models.UserPoints).filter(
        models.UserPoints.user_id == user.id,
    ).first()
    points = _clamp_score(points_record.points if points_record else MAX_POINTS)
    today = _now_utc().date()
    daily_score = _get_daily_score(user.id, today, db)
    ban_until = is_user_banned(user.id, db)
    latest_request = _get_latest_point_request(user.id, db)
    policy = get_or_create_point_policy(db)
    point_status = {
        "points": points,
        "daily_score": daily_score,
        "daily_score_date": today,
        "booking_min_points": _policy_value(policy, "booking_min_points"),
        "points_warning_threshold": _policy_value(policy, "warning_threshold"),
        "point_request_amount": _policy_value(policy, "point_request_amount"),
        "booking_allowed": points >= _policy_value(policy, "booking_min_points") and ban_until is None,
        "is_banned": ban_until is not None,
        "ban_until": ban_until,
        "warning_level": _warning_level(points, policy),
        "point_request": _serialize_point_request(latest_request) if latest_request else None,
    }

    bookings_query = db.query(models.Booking, models.Lab).join(
        models.Lab,
        models.Booking.lab_id == models.Lab.id,
    ).filter(
        models.Booking.user_id == user.id,
    )
    bookings = bookings_query.order_by(
        models.Booking.booking_date.desc(),
        models.Booking.start_time.desc(),
        models.Booking.id.desc(),
    ).limit(limit).all()

    session_query = db.query(models.LabAccessLog, models.Lab).join(
        models.Lab,
        models.LabAccessLog.lab_id == models.Lab.id,
    ).filter(
        models.LabAccessLog.user_id == user.id,
    )
    sessions = session_query.order_by(
        models.LabAccessLog.entry_time.desc(),
        models.LabAccessLog.id.desc(),
    ).limit(limit).all()

    program_rows = db.query(
        models.ProgramUsageLog,
        models.LabAccessLog,
        models.Lab,
    ).join(
        models.LabAccessLog,
        models.ProgramUsageLog.lab_access_log_id == models.LabAccessLog.id,
    ).join(
        models.Lab,
        models.LabAccessLog.lab_id == models.Lab.id,
    ).filter(
        models.LabAccessLog.user_id == user.id,
    ).order_by(
        models.ProgramUsageLog.usage_start_time.desc(),
        models.ProgramUsageLog.id.desc(),
    ).limit(limit).all()

    violation_rows = db.query(
        models.UsageViolation,
        models.LabAccessLog,
        models.Lab,
    ).join(
        models.LabAccessLog,
        models.UsageViolation.lab_access_log_id == models.LabAccessLog.id,
    ).join(
        models.Lab,
        models.LabAccessLog.lab_id == models.Lab.id,
    ).filter(
        models.LabAccessLog.user_id == user.id,
    ).order_by(
        models.UsageViolation.detected_at.desc(),
        models.UsageViolation.id.desc(),
    ).limit(limit).all()

    daily_score_rows = db.query(models.UserDailyScore).filter(
        models.UserDailyScore.user_id == user.id,
    ).order_by(
        models.UserDailyScore.score_date.desc(),
    ).limit(limit).all()

    db.commit()
    return {
        "profile": profile,
        "points": point_status,
        "point_request": _serialize_point_request(latest_request) if latest_request else None,
        "point_history": _logs_response(user.id, db, limit, None)["data"],
        "daily_scores": [
            {"score_date": row.score_date, "score": _clamp_score(row.score)}
            for row in daily_score_rows
        ],
        "bookings": [
            {
                "id": booking.id,
                "lab_code": lab.code,
                "lab_name": lab.name,
                "booking_date": booking.booking_date,
                "start_time": _format_time(booking.start_time),
                "end_time": _format_time(booking.end_time),
                "purpose": booking.purpose,
                "total_participants": booking.total_participants,
                "status": booking.status,
                "checked_in_at": booking.checked_in_at,
                "checked_out_at": booking.checked_out_at,
                "cancelled_at": booking.cancelled_at,
                "cancellation_reason": booking.cancellation_reason,
                "no_show_at": booking.no_show_at,
                "created_at": booking.created_at,
            }
            for booking, lab in bookings
        ],
        "sessions": [
            {
                "id": access_log.id,
                "lab_code": lab.code,
                "lab_name": lab.name,
                "booking_id": access_log.booking_id,
                "entry_time": access_log.entry_time,
                "exit_time": access_log.exit_time,
                "access_type": access_log.access_type,
                "status": access_log.status,
                "session_status": access_log.session_status,
                "end_reason": access_log.end_reason,
                "device_used": access_log.device_used,
                "device_mac": access_log.device_mac,
                "last_heartbeat_at": access_log.last_heartbeat_at,
            }
            for access_log, lab in sessions
        ],
        "program_usage": [
            {
                "id": usage.id,
                "session_id": access_log.id,
                "lab_code": lab.code,
                "lab_name": lab.name,
                "program_name": usage.program_name,
                "usage_start_time": usage.usage_start_time,
                "usage_end_time": usage.usage_end_time,
                "duration_seconds": usage.duration_seconds,
                "device_name": usage.device_name,
                "device_mac": usage.device_mac,
                "event_id": usage.event_id,
                "created_at": usage.created_at,
            }
            for usage, access_log, lab in program_rows
        ],
        "violations": [
            {
                "id": violation.id,
                "session_id": access_log.id,
                "lab_code": lab.code,
                "lab_name": lab.name,
                "program_name": violation.program_name,
                "detected_at": violation.detected_at,
                "reason": violation.reason,
                "action_taken": violation.action_taken,
                "process_name": violation.process_name,
                "exe_path": violation.exe_path,
                "window_title": violation.window_title,
                "detection_source": violation.detection_source,
                "policy_version": violation.policy_version,
                "matched_rule_id": violation.matched_rule_id,
                "event_id": violation.event_id,
            }
            for violation, access_log, lab in violation_rows
        ],
        "summary": {
            "total_bookings": bookings_query.count(),
            "total_sessions": session_query.count(),
            "total_program_usage": db.query(models.ProgramUsageLog).join(
                models.LabAccessLog,
                models.ProgramUsageLog.lab_access_log_id == models.LabAccessLog.id,
            ).filter(models.LabAccessLog.user_id == user.id).count(),
            "total_violations": db.query(models.UsageViolation).join(
                models.LabAccessLog,
                models.UsageViolation.lab_access_log_id == models.LabAccessLog.id,
            ).filter(models.LabAccessLog.user_id == user.id).count(),
            "total_point_events": db.query(models.PointLog).filter(
                models.PointLog.user_id == user.id,
            ).count(),
        },
    }
