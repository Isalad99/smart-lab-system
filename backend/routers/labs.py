from datetime import datetime, timedelta, time, date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from urllib.parse import unquote

import models, schemas
from database import get_db
from routers.points import (
    apply_point_event,
    get_booking_restriction,
    is_admin_user,
    mark_due_no_shows,
)
from routers.users import get_current_user

router = APIRouter(tags=["Lab Management & Booking"])

VALID_TIME_SLOTS = {
    1: {"start": time(8, 40), "end": time(11, 0)},
    2: {"start": time(12, 0), "end": time(14, 20)},
    3: {"start": time(14, 30), "end": time(16, 50)},
    4: {"start": time(17, 0), "end": time(19, 20)}
}

# =========================================================
# PHASE 1: LABORATORY MANAGEMENT (CRUD)
# =========================================================

@router.get("/labs")
def get_all_labs(db: Session = Depends(get_db)):
    labs = db.query(models.Lab).all()
    return {"data": labs}

@router.post("/admin/labs")
def create_lab(lab: schemas.LabCreate, db: Session = Depends(get_db)):
    existing_lab = db.query(models.Lab).filter(models.Lab.code == lab.code).first()
    if existing_lab:
        raise HTTPException(status_code=400, detail="Lab code already exists.")
    
    new_lab = models.Lab(name=lab.name, code=lab.code, capacity=lab.capacity, location=lab.location, status="active")
    db.add(new_lab)
    db.commit()
    db.refresh(new_lab)
    return {"message": "Lab created successfully.", "lab": new_lab}

@router.put("/admin/labs/{lab_id}/status")
def update_lab_status(lab_id: int, status_update: schemas.LabStatusUpdate, db: Session = Depends(get_db)):
    lab = db.query(models.Lab).filter(models.Lab.id == lab_id).first()
    if not lab: raise HTTPException(status_code=404, detail="Lab not found.")
    lab.status = status_update.status
    db.commit()
    return {"message": f"Lab status updated to {status_update.status}."}

@router.put("/admin/labs/{lab_id}/capacity")
def update_lab_capacity(lab_id: int, cap_update: schemas.LabCapacityUpdate, db: Session = Depends(get_db)):
    lab = db.query(models.Lab).filter(models.Lab.id == lab_id).first()
    if not lab: raise HTTPException(status_code=404, detail="Lab not found.")
    lab.capacity = cap_update.capacity
    db.commit()
    return {"message": f"Lab capacity updated to {cap_update.capacity} seats."}

@router.put("/admin/labs/{lab_id}")
def update_lab_details(lab_id: int, lab_update: schemas.LabUpdate, db: Session = Depends(get_db)):
    lab = db.query(models.Lab).filter(models.Lab.id == lab_id).first()
    if not lab: raise HTTPException(status_code=404, detail="Lab not found.")
    
    if lab.code != lab_update.code:
        existing = db.query(models.Lab).filter(models.Lab.code == lab_update.code).first()
        if existing: raise HTTPException(status_code=400, detail="Lab code is already in use.")

    lab.name = lab_update.name
    lab.code = lab_update.code
    lab.capacity = lab_update.capacity
    lab.location = lab_update.location
    db.commit()
    return {"message": "Lab details updated successfully."}

@router.delete("/admin/labs/{lab_id}")
def delete_lab(lab_id: int, db: Session = Depends(get_db)):
    lab = db.query(models.Lab).filter(models.Lab.id == lab_id).first()
    if not lab: raise HTTPException(status_code=404, detail="Lab not found.")
    
    db.query(models.ClassSchedule).filter(models.ClassSchedule.lab_id == lab_id).delete()
    db.query(models.Booking).filter(models.Booking.lab_id == lab_id).delete()
    db.delete(lab)
    db.commit()
    return {"message": "Lab deleted successfully."}

# =========================================================
# PHASE 2: CLASS SCHEDULE MANAGEMENT
# =========================================================

@router.post("/admin/schedules")
def create_schedule(schedule: schemas.ScheduleCreate, db: Session = Depends(get_db)):
    if schedule.slot_number not in VALID_TIME_SLOTS:
        raise HTTPException(status_code=400, detail="Invalid slot number (must be 1-4).")
    slot_times = VALID_TIME_SLOTS[schedule.slot_number]

    existing_class = db.query(models.ClassSchedule).filter(
        models.ClassSchedule.lab_id == schedule.lab_id, models.ClassSchedule.day_of_week == schedule.day_of_week,
        models.ClassSchedule.start_time == slot_times["start"], models.ClassSchedule.semester == schedule.semester,
        models.ClassSchedule.academic_year == schedule.academic_year
    ).first()
    if existing_class: raise HTTPException(status_code=400, detail=f"Time slot conflicts with course {existing_class.course_code}.")

    new_schedule = models.ClassSchedule(
        lab_id=schedule.lab_id, course_code=schedule.course_code, course_name=schedule.course_name,
        instructor_name=schedule.instructor_name, start_time=slot_times["start"], end_time=slot_times["end"],
        day_of_week=schedule.day_of_week, semester=schedule.semester, academic_year=schedule.academic_year,
        valid_from=schedule.valid_from, valid_until=schedule.valid_until
    )
    db.add(new_schedule)
    db.commit()
    return {"message": "Schedule created successfully."}

@router.get("/labs/{lab_id}/schedules")
def get_lab_schedules(lab_id: int, semester: str = None, year: str = None, db: Session = Depends(get_db)):
    query = db.query(models.ClassSchedule).filter(models.ClassSchedule.lab_id == lab_id)
    if semester: query = query.filter(models.ClassSchedule.semester == semester)
    if year: query = query.filter(models.ClassSchedule.academic_year == year)
    return {"data": query.all()}

@router.delete("/admin/schedules/{schedule_id}")
def delete_schedule(schedule_id: int, db: Session = Depends(get_db)):
    schedule = db.query(models.ClassSchedule).filter(models.ClassSchedule.id == schedule_id).first()
    if not schedule: raise HTTPException(status_code=404, detail="Schedule not found.")
    db.delete(schedule)
    db.commit()
    return {"message": "Schedule deleted successfully."}

# =========================================================
# PHASE 3: SEAT-BASED BOOKING SYSTEM
# =========================================================

# 🌟 เพิ่ม GET /bookings เพื่อให้หน้า Admin Dashboard ดึงรายการไปแสดงผลได้
@router.get("/bookings")
def get_all_bookings(db: Session = Depends(get_db)):
    """Fetch all bookings for Admin Dashboard"""
    mark_due_no_shows(db)
    bookings = db.query(models.Booking)\
        .options(
            joinedload(models.Booking.user),
            joinedload(models.Booking.lab)
        )\
        .order_by(models.Booking.created_at.desc())\
        .all()
    return {"data": bookings}

@router.get("/labs/{lab_id}/availability")
def check_availability(lab_id: int, target_date: date, db: Session = Depends(get_db)):
    mark_due_no_shows(db)
    lab = db.query(models.Lab).filter(models.Lab.id == lab_id).first()
    if not lab: raise HTTPException(status_code=404, detail="Lab not found.")
    max_seats = lab.capacity or 0 

    if lab.status != "active":
        return {
            "date": target_date, "status": "closed", 
            "slots": {1: {"status": "disabled", "remaining_seats": 0}, 2: {"status": "disabled", "remaining_seats": 0}, 3: {"status": "disabled", "remaining_seats": 0}, 4: {"status": "disabled", "remaining_seats": 0}}
        }

    day_name = target_date.strftime("%A")
    classes = db.query(models.ClassSchedule).filter(
        models.ClassSchedule.lab_id == lab_id, models.ClassSchedule.day_of_week == day_name,
        models.ClassSchedule.valid_from <= target_date, models.ClassSchedule.valid_until >= target_date
    ).all()
    class_times = [c.start_time for c in classes]

    bookings = db.query(models.Booking).filter(
        models.Booking.lab_id == lab_id, 
        models.Booking.booking_date == target_date,
        models.Booking.status.in_(["reserved", "attended", "completed"]),
    ).all()

    availability = {}
    for slot, times in VALID_TIME_SLOTS.items():
        if times["start"] in class_times:
            availability[slot] = {"status": "class", "remaining_seats": 0}
        else:
            seats_taken = sum([b.total_participants for b in bookings if b.start_time == times["start"]])
            remaining = max_seats - seats_taken
            availability[slot] = {"status": "full" if remaining <= 0 else "available", "remaining_seats": max(0, remaining)} 

    return {"lab_id": lab_id, "date": target_date, "day": day_name, "total_capacity": max_seats, "slots": availability}

@router.post("/bookings")
def create_booking(
    booking: schemas.BookingCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_due_no_shows(db)
    now = datetime.now() 
    if booking.slot_number not in VALID_TIME_SLOTS: raise HTTPException(status_code=400, detail="Invalid slot number (must be 1-4).")
    
    slot_times = VALID_TIME_SLOTS[booking.slot_number]
    booking_start_datetime = datetime.combine(booking.booking_date, slot_times["start"])

    if booking_start_datetime <= now:
        raise HTTPException(status_code=400, detail="This time slot has already passed.")

    if booking_start_datetime < now + timedelta(hours=2):
        raise HTTPException(status_code=400, detail="Must book at least 2 hours in advance.")
        
    if booking.booking_date > now.date() + timedelta(days=2):
        raise HTTPException(status_code=400, detail="Cannot book more than 2 days in advance.")
    
    if booking.email.lower() != current_user.email.lower() and not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="Booking email does not match the signed-in user.")

    user = db.query(models.User).filter(models.User.id == current_user.id).first()
    if not user: raise HTTPException(status_code=404, detail="User not found.")

    restriction = get_booking_restriction(user.id, db)
    if not restriction["booking_allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "Booking is unavailable because the account does not meet the point requirement.",
                **restriction,
            },
        )

    lab = db.query(models.Lab).filter(models.Lab.id == booking.lab_id).first()
    if not lab or lab.status != "active": raise HTTPException(status_code=400, detail="Lab is currently closed.")

    user_duplicate = db.query(models.Booking).filter(
        models.Booking.user_id == user.id,
        models.Booking.booking_date == booking.booking_date,
        models.Booking.start_time == slot_times["start"],
        models.Booking.status.in_(["reserved", "attended", "completed"]),
    ).first()
    
    if user_duplicate:
        raise HTTPException(status_code=400, detail="You have already booked a seat in this time slot.")

    class_exists = db.query(models.ClassSchedule).filter(
        models.ClassSchedule.lab_id == booking.lab_id, models.ClassSchedule.day_of_week == booking.booking_date.strftime("%A"),
        models.ClassSchedule.start_time == slot_times["start"], models.ClassSchedule.valid_from <= booking.booking_date,
        models.ClassSchedule.valid_until >= booking.booking_date
    ).first()
    if class_exists: raise HTTPException(status_code=400, detail="Time slot conflicts with a scheduled class.")
        
    existing_bookings = db.query(models.Booking).filter(
        models.Booking.lab_id == booking.lab_id, 
        models.Booking.booking_date == booking.booking_date,
        models.Booking.start_time == slot_times["start"],
        models.Booking.status.in_(["reserved", "attended", "completed"]),
    ).all()
    
    seats_taken = sum([b.total_participants for b in existing_bookings])
    if booking.total_participants > (lab.capacity - seats_taken):
        raise HTTPException(status_code=400, detail=f"Not enough seats available. ({(lab.capacity - seats_taken)} seats left)")

    new_booking = models.Booking(
        lab_id=booking.lab_id, user_id=user.id, booking_date=booking.booking_date,
        start_time=slot_times["start"], end_time=slot_times["end"], purpose=booking.purpose,
        total_participants=booking.total_participants,
        status="reserved",
    )
    db.add(new_booking)
    db.commit()
    db.refresh(new_booking)
    return {
        "message": f"Booking successful for {booking.total_participants} seat(s).",
        "booking_id": new_booking.id,
    }

@router.get("/bookings/user/{email}")
def get_user_bookings(
    email: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_due_no_shows(db)
    clean_email = unquote(email).strip()
    if clean_email.lower() != current_user.email.lower() and not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="You cannot view another user's bookings.")

    user = db.query(models.User).filter(models.User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{clean_email}' not found")
    
    bookings = db.query(models.Booking, models.Lab)\
        .join(models.Lab, models.Booking.lab_id == models.Lab.id)\
        .filter(models.Booking.user_id == user.id)\
        .order_by(models.Booking.booking_date.desc(), models.Booking.start_time.desc())\
        .all()
    
    result = []
    for booking, lab in bookings:
        result.append({
            "id": booking.id,
            "lab_code": lab.code,
            "lab_name": lab.name,
            "booking_date": booking.booking_date,
            "start_time": booking.start_time.strftime("%H:%M"),
            "end_time": booking.end_time.strftime("%H:%M"),
            "purpose": booking.purpose,
            "status": booking.status,
            "checked_in_at": booking.checked_in_at,
            "checked_out_at": booking.checked_out_at,
            "cancelled_at": booking.cancelled_at,
            "cancellation_reason": booking.cancellation_reason,
            "no_show_at": booking.no_show_at,
        })
        
    return {"data": result}

@router.delete("/bookings/{booking_id}")
def cancel_booking(
    booking_id: int,
    email: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    mark_due_no_shows(db)
    clean_email = unquote(email).strip()
    if clean_email.lower() != current_user.email.lower() and not is_admin_user(current_user.id, db):
        raise HTTPException(status_code=403, detail="You cannot cancel another user's booking.")

    user = db.query(models.User).filter(models.User.email == clean_email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{clean_email}' not found")
    
    booking = db.query(models.Booking).filter(
        models.Booking.id == booking_id, 
        models.Booking.user_id == user.id
    ).first()
    
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found or unauthorized")

    if booking.status != "reserved":
        raise HTTPException(status_code=409, detail=f"Booking cannot be cancelled from status '{booking.status}'.")

    now = datetime.now()
    booking_start = datetime.combine(booking.booking_date, booking.start_time)
    if now >= booking_start:
        raise HTTPException(status_code=409, detail="Booking has already started and cannot be cancelled.")

    is_late_cancel = now < booking_start and booking_start - now < timedelta(hours=1)
    booking.status = "cancelled"
    booking.cancelled_at = now
    booking.cancellation_reason = "user_cancelled"

    point_result = None
    if is_late_cancel:
        point_result = apply_point_event(
            booking.user_id,
            "late_cancel",
            db,
            note=f"ยกเลิกการจองห้อง #{booking.id} ล่วงหน้าน้อยกว่า 1 ชั่วโมง",
            event_id=f"booking:{booking.id}:late_cancel",
            source_type="booking",
            source_id=booking.id,
            effective_at=now,
            commit=False,
        )

    db.commit()
    return {"message": "Booking cancelled successfully.", "points": point_result}
