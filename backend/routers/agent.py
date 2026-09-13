import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Form
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models
from database import get_db
from policy import build_policy, find_matching_rule, get_policy_rules
from routers.points import apply_point_event, mark_due_no_shows

router = APIRouter(tags=["Hardware Agent"])

STALE_SESSION_AFTER = timedelta(minutes=2)
MAX_IDEMPOTENCY_KEY_LENGTH = 128
VALID_END_REASONS = {
    "logout",
    "violation",
    "stale_cleanup",
    "shutdown",
    "error",
    "admin",
}


@router.get("/agent/policy")
def get_agent_policy(db: Session = Depends(get_db)):
    """Return the active, versioned policy used by Windows Agents."""

    return build_policy(get_policy_rules(db))


def _clean_device_mac(value: Optional[str]) -> Optional[str]:
    cleaned = (value or "").strip().lower()
    return cleaned or None


def _clean_idempotency_key(value: Optional[str], field_name: str) -> Optional[str]:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if len(cleaned) > MAX_IDEMPOTENCY_KEY_LENGTH:
        raise HTTPException(status_code=422, detail=f"{field_name} is too long.")
    return cleaned


def _same_session_identity(access_log, user_id, lab_id, device_mac) -> bool:
    return (
        access_log.user_id == user_id
        and access_log.lab_id == lab_id
        and _clean_device_mac(access_log.device_mac) == device_mac
    )


def _cleanup_stale_sessions(db: Session) -> int:
    """Close sessions whose Agent has stopped sending heartbeats."""
    now_naive = datetime.now()
    now_utc = datetime.now(timezone.utc)
    stale_before_utc = now_utc - STALE_SESSION_AFTER
    stale_entry_before = now_naive - STALE_SESSION_AFTER

    stale_filter = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.session_status == "active",
        models.LabAccessLog.exit_time.is_(None),
        or_(
            and_(
                models.LabAccessLog.last_heartbeat_at.is_not(None),
                models.LabAccessLog.last_heartbeat_at < stale_before_utc,
            ),
            and_(
                models.LabAccessLog.last_heartbeat_at.is_(None),
                models.LabAccessLog.entry_time < stale_entry_before,
            ),
        ),
    )
    return stale_filter.update(
        {
            models.LabAccessLog.session_status: "abandoned",
            models.LabAccessLog.end_reason: "stale_cleanup",
            models.LabAccessLog.exit_time: now_naive,
        },
        synchronize_session=False,
    )


def _require_active_session(access_log: models.LabAccessLog) -> None:
    if access_log.session_status != "active" or access_log.exit_time is not None:
        raise HTTPException(status_code=409, detail="Session is no longer active.")


def _parse_usage_time(value: Optional[str], fallback: datetime) -> datetime:
    """Parse an Agent timestamp while keeping compatibility with old payloads."""
    if not value:
        return fallback

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid usage timestamp.") from exc

    # The current Supabase columns are timestamp without time zone. Normalize an
    # explicitly supplied offset before storing it in those columns.
    if parsed.tzinfo:
        parsed = parsed.astimezone().replace(tzinfo=None)
    return parsed


@router.post("/agent/start-session")
def start_session(
    email: str = Form(...),
    lab_code: str = Form(...),
    device: str = Form(...),
    device_mac: Optional[str] = Form(None),
    client_session_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    user = db.query(models.User).filter(models.User.email == email).first()
    lab = db.query(models.Lab).filter(models.Lab.code == lab_code).first()

    if not user or not lab:
        raise HTTPException(status_code=404, detail="Invalid credentials.")

    if _cleanup_stale_sessions(db):
        # Persist stale-session cleanup before any recovery response. Without
        # this commit, an early return below could roll the cleanup back.
        db.commit()

    mark_due_no_shows(db)

    resolved_device_name = (device or "").strip() or None
    resolved_device_mac = _clean_device_mac(device_mac)
    if not resolved_device_name:
        raise HTTPException(status_code=422, detail="device is required.")
    if not resolved_device_mac:
        raise HTTPException(status_code=422, detail="device_mac is required.")

    resolved_client_session_id = _clean_idempotency_key(
        client_session_id,
        "client_session_id",
    )

    if resolved_client_session_id:
        existing_request = db.query(models.LabAccessLog).filter(
            models.LabAccessLog.client_session_id == resolved_client_session_id,
        ).first()
        if existing_request:
            if existing_request.session_status == "active" and existing_request.exit_time is None:
                if _same_session_identity(
                    existing_request,
                    user.id,
                    lab.id,
                    resolved_device_mac,
                ):
                    return {"session_id": existing_request.id, "recovered": True}
                raise HTTPException(
                    status_code=409,
                    detail="Client session key belongs to another active session.",
                )
            raise HTTPException(
                status_code=409,
                detail="Session request is already closed.",
            )

    active_user_session = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.user_id == user.id,
        models.LabAccessLog.session_status == "active",
        models.LabAccessLog.exit_time.is_(None),
    ).first()
    if active_user_session:
        # Recover an orphaned active row when the original response was lost.
        # A different lab or device remains a real conflict.
        if _same_session_identity(
            active_user_session,
            user.id,
            lab.id,
            resolved_device_mac,
        ):
            return {"session_id": active_user_session.id, "recovered": True}
        raise HTTPException(
            status_code=409,
            detail="This user already has an active lab session.",
        )

    active_device_session = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.session_status == "active",
        models.LabAccessLog.exit_time.is_(None),
        func.lower(func.btrim(models.LabAccessLog.device_mac)) == resolved_device_mac,
    ).first()
    if active_device_session:
        raise HTTPException(
            status_code=409,
            detail="This device already has an active lab session.",
        )

    now = datetime.now()
    matching_booking = db.query(models.Booking).filter(
        models.Booking.user_id == user.id,
        models.Booking.lab_id == lab.id,
        models.Booking.booking_date == now.date(),
        models.Booking.start_time <= now.time(),
        models.Booking.end_time >= now.time(),
        models.Booking.status == "reserved",
    ).order_by(models.Booking.start_time.asc()).first()
    if matching_booking:
        matching_booking.status = "attended"
        matching_booking.checked_in_at = now

    new_log = models.LabAccessLog(
        lab_id=lab.id,
        user_id=user.id,
        booking_id=matching_booking.id if matching_booking else None,
        entry_time=datetime.now(),
        access_type="manual",
        status="success",
        device_used=resolved_device_name,
        device_mac=resolved_device_mac,
        client_session_id=resolved_client_session_id,
        session_status="active",
        last_heartbeat_at=datetime.now(timezone.utc),
    )
    try:
        db.add(new_log)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if resolved_client_session_id:
            recovered_session = db.query(models.LabAccessLog).filter(
                models.LabAccessLog.client_session_id == resolved_client_session_id,
                models.LabAccessLog.session_status == "active",
                models.LabAccessLog.exit_time.is_(None),
            ).first()
            if recovered_session and _same_session_identity(
                recovered_session,
                user.id,
                lab.id,
                resolved_device_mac,
            ):
                return {"session_id": recovered_session.id, "recovered": True}
        raise HTTPException(
            status_code=409,
            detail="This user or device already has an active lab session.",
        ) from exc
    db.refresh(new_log)
    return {"session_id": new_log.id}


@router.post("/agent/log-usage")
def log_usage(
    session_id: int = Form(...),
    usage_data: str = Form(...),
    device_name: Optional[str] = Form(None),
    device_mac: Optional[str] = Form(None),
    # Backward-compatible names used by the unmerged Agent refactor.
    device: Optional[str] = Form(None),
    mac: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    access_log = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.id == session_id
    ).first()
    if not access_log:
        raise HTTPException(status_code=404, detail="Session not found.")

    try:
        logs = json.loads(usage_data)
        if not isinstance(logs, list):
            raise HTTPException(status_code=422, detail="usage_data must be a JSON list.")

        now = datetime.now()
        # Keep accepting legacy payload fields while using the Session as the
        # canonical source for device identity.
        resolved_device_name = (
            access_log.device_used or device_name or device or ""
        ).strip() or None
        resolved_device_mac = (
            access_log.device_mac or device_mac or mac or ""
        ).strip() or None

        parsed_logs = []
        for item in logs:
            if not isinstance(item, dict) or not str(item.get("name", "")).strip():
                raise HTTPException(status_code=422, detail="Each usage item needs a name.")

            event_id = _clean_idempotency_key(item.get("event_id"), "event_id")

            usage_start = _parse_usage_time(item.get("started_at"), now)
            usage_end = _parse_usage_time(item.get("ended_at"), usage_start)
            if usage_end < usage_start:
                raise HTTPException(
                    status_code=422,
                    detail="Usage end time cannot be before start time.",
                )

            try:
                duration = max(0, int(item.get("duration", 0)))
            except (TypeError, ValueError) as exc:
                raise HTTPException(status_code=422, detail="Invalid usage duration.") from exc

            # Old Agents only sent a total duration. New Agents send timestamps
            # as well; calculate a duration when it was omitted or zero.
            if duration == 0 and usage_end > usage_start:
                duration = int((usage_end - usage_start).total_seconds())

            parsed_logs.append({
                "event_id": event_id,
                "program_name": str(item["name"]).strip(),
                "duration_seconds": duration,
                "usage_start_time": usage_start,
                "usage_end_time": usage_end,
            })

        # New Agents use event_id, so queued events can be delivered after a
        # timeout or after stale cleanup. Legacy requests without event_id
        # still require an active session for backward compatibility.
        session_is_active = (
            access_log.session_status == "active"
            and access_log.exit_time is None
        )
        if not session_is_active and not all(item["event_id"] for item in parsed_logs):
            _require_active_session(access_log)

        created_count = 0
        duplicate_count = 0
        for item in parsed_logs:
            event_id = item["event_id"]
            if event_id:
                existing = db.query(models.ProgramUsageLog).filter(
                    models.ProgramUsageLog.event_id == event_id,
                ).first()
                if existing:
                    if existing.lab_access_log_id != session_id:
                        raise HTTPException(
                            status_code=409,
                            detail="Usage event belongs to another session.",
                        )
                    duplicate_count += 1
                    continue

            db.add(models.ProgramUsageLog(
                lab_access_log_id=session_id,
                program_name=item["program_name"],
                duration_seconds=item["duration_seconds"],
                usage_start_time=item["usage_start_time"],
                usage_end_time=item["usage_end_time"],
                device_name=resolved_device_name,
                device_mac=resolved_device_mac,
                event_id=event_id,
            ))
            created_count += 1

        db.commit()
        return {
            "message": "Data logged successfully.",
            "count": len(logs),
            "created_count": created_count,
            "duplicate_count": duplicate_count,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/agent/log-violation")
def log_violation(
    session_id: int = Form(...),
    program_name: str = Form(...),
    reason: Optional[str] = Form(None),
    action_taken: str = Form("logout"),
    event_id: Optional[str] = Form(None),
    process_name: Optional[str] = Form(None),
    exe_path: Optional[str] = Form(None),
    window_title: Optional[str] = Form(None),
    detection_source: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    access_log = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.id == session_id
    ).first()
    if not access_log:
        raise HTTPException(status_code=404, detail="Session not found.")

    cleaned_program_name = program_name.strip()
    if not cleaned_program_name:
        raise HTTPException(status_code=422, detail="program_name is required.")

    resolved_event_id = _clean_idempotency_key(event_id, "event_id")
    if resolved_event_id:
        existing = db.query(models.UsageViolation).filter(
            models.UsageViolation.event_id == resolved_event_id,
        ).first()
        if existing:
            if existing.lab_access_log_id != session_id:
                raise HTTPException(
                    status_code=409,
                    detail="Violation event belongs to another session.",
                )
            return {
                "message": "Violation already logged.",
                "violation_id": existing.id,
            }

    active_policy = build_policy(get_policy_rules(db))
    matched_rule = find_matching_rule(
        active_policy["data"],
        # These fallbacks keep the endpoint compatible with older Agents that
        # only sent program_name and did not include evidence fields.
        process_name=(process_name or cleaned_program_name).strip(),
        exe_path=exe_path,
        window_title=(window_title or cleaned_program_name).strip(),
    )
    if matched_rule is None:
        raise HTTPException(
            status_code=422,
            detail="Violation does not match an active blacklist rule.",
        )

    session_is_active = (
        access_log.session_status == "active"
        and access_log.exit_time is None
    )
    if not session_is_active and not resolved_event_id:
        _require_active_session(access_log)

    violation = models.UsageViolation(
        lab_access_log_id=session_id,
        program_name=cleaned_program_name,
        reason=reason.strip() if reason else None,
        action_taken=action_taken.strip() or "logout",
        detected_at=datetime.now(),
        event_id=resolved_event_id,
        process_name=process_name.strip() if process_name else None,
        exe_path=exe_path.strip() if exe_path else None,
        window_title=window_title.strip() if window_title else None,
        detection_source=detection_source.strip() if detection_source else None,
        policy_version=active_policy["version"],
        matched_rule_id=matched_rule.get("id"),
    )
    point_result = None
    try:
        db.add(violation)
        db.flush()
        point_event_id = f"violation:{resolved_event_id or violation.id}"
        point_result = apply_point_event(
            access_log.user_id,
            "forbidden_app",
            db,
            note=f"ตรวจพบโปรแกรมต้องห้าม: {cleaned_program_name}",
            event_id=point_event_id,
            source_type="usage_violation",
            source_id=violation.id,
            effective_at=violation.detected_at,
            commit=False,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if resolved_event_id:
            existing = db.query(models.UsageViolation).filter(
                models.UsageViolation.event_id == resolved_event_id,
            ).first()
            if existing and existing.lab_access_log_id == session_id:
                return {
                    "message": "Violation already logged.",
                    "violation_id": existing.id,
                }
        raise HTTPException(status_code=409, detail="Duplicate violation event.") from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to record violation and points.") from exc
    db.refresh(violation)
    return {
        "message": "Violation logged successfully.",
        "violation_id": violation.id,
        "points": point_result,
    }


@router.post("/agent/heartbeat")
def heartbeat(
    session_id: int = Form(...),
    device_mac: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    access_log = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.id == session_id
    ).first()
    if not access_log:
        raise HTTPException(status_code=404, detail="Session not found.")

    _require_active_session(access_log)

    reported_mac = _clean_device_mac(device_mac)
    stored_mac = _clean_device_mac(access_log.device_mac)
    if reported_mac and stored_mac and reported_mac != stored_mac:
        raise HTTPException(status_code=409, detail="Device does not match session.")

    heartbeat_at = datetime.now(timezone.utc)
    access_log.last_heartbeat_at = heartbeat_at
    db.commit()
    return {
        "message": "Heartbeat accepted.",
        "session_id": session_id,
        "last_heartbeat_at": heartbeat_at,
    }


@router.post("/agent/end-session")
def end_session(
    session_id: int = Form(...),
    end_reason: str = Form("logout"),
    db: Session = Depends(get_db),
):
    access_log = db.query(models.LabAccessLog).filter(
        models.LabAccessLog.id == session_id
    ).with_for_update().first()
    if not access_log:
        raise HTTPException(status_code=404, detail="Session not found.")

    cleaned_reason = (end_reason or "logout").strip().lower()
    if cleaned_reason not in VALID_END_REASONS:
        raise HTTPException(status_code=422, detail="Invalid session end reason.")

    was_active = access_log.session_status == "active" and access_log.exit_time is None
    changed = False
    point_result = None
    if access_log.exit_time is None:
        access_log.exit_time = datetime.now()
        changed = True

    if access_log.session_status == "active":
        access_log.session_status = (
            "abandoned" if cleaned_reason == "stale_cleanup" else "completed"
        )
        access_log.end_reason = cleaned_reason
        changed = True

    if was_active and changed:
        booking = access_log.booking
        if booking:
            booking.checked_out_at = access_log.exit_time
            if booking.status in {"reserved", "attended"}:
                booking.status = "completed"
                if not booking.checked_in_at:
                    booking.checked_in_at = access_log.entry_time

        if cleaned_reason in {"logout", "shutdown"}:
            point_result = apply_point_event(
                access_log.user_id,
                "complete_session",
                db,
                note=f"จบการใช้งานห้องจาก session #{access_log.id}",
                event_id=f"session:{access_log.id}:complete",
                source_type="lab_access_log",
                source_id=access_log.id,
                effective_at=access_log.exit_time,
                commit=False,
            )

    if changed:
        db.commit()

    return {
        "message": "Session ended successfully.",
        "session_id": session_id,
        "session_status": access_log.session_status,
        "end_reason": access_log.end_reason,
        "points": point_result,
    }
