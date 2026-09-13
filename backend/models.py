from sqlalchemy import BigInteger, Column, Integer, String, DateTime, Boolean, ForeignKey, Date, Time, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base


class UserOTP(Base):
    __tablename__ = "user_otps"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True, nullable=False)
    otp_code = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    profile_pic = Column(String, nullable=True)
    face_embedding = Column(JSONB, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    roles = relationship("Role", secondary="user_roles", back_populates="users")
    bookings = relationship("Booking", back_populates="user", cascade="all, delete-orphan")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    faculty = Column(String, nullable=True)     # คณะ
    department = Column(String, nullable=True)  # สาขาวิชา
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class UserPassport(Base):
    # guest users only — is_active=False means pending admin approval
    __tablename__ = "user_passport"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    phone = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False)
    display_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    users = relationship("User", secondary="user_roles", back_populates="roles")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    role_id = Column(Integer, ForeignKey("roles.id"), primary_key=True)


class Lab(Base):
    __tablename__ = "labs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    code = Column(String, unique=True, index=True, nullable=False)
    capacity = Column(Integer, default=0)
    location = Column(String, nullable=True)
    status = Column(String, default="active")  # active | inactive | maintenance
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    bookings = relationship("Booking", back_populates="lab", cascade="all, delete-orphan")
    schedules = relationship("ClassSchedule", back_populates="lab", cascade="all, delete-orphan")


class BlacklistedApp(Base):
    __tablename__ = "blacklisted_apps"

    id = Column(Integer, primary_key=True, index=True)
    app_name = Column(String, unique=True, nullable=False)
    description = Column(String, nullable=True)
    match_type = Column(
        String,
        nullable=False,
        default="process_name_or_title",
        server_default="process_name_or_title",
    )
    match_value = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LabAccessLog(Base):
    __tablename__ = "lab_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    lab_id = Column(Integer, ForeignKey("labs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    booking_id = Column(BigInteger, ForeignKey("bookings.id"), nullable=True, index=True)
    entry_time = Column(DateTime(timezone=True), server_default=func.now())
    exit_time = Column(DateTime(timezone=True), nullable=True)
    access_type = Column(String, nullable=False)  # entry | manual
    status = Column(String, nullable=False)        # success | denied
    device_used = Column(String, nullable=True)
    device_mac = Column(String, nullable=True)
    client_session_id = Column(String, nullable=True, index=True)
    session_status = Column(
        Text,
        nullable=False,
        default="active",
        server_default="active",
    )  # active | completed | abandoned
    end_reason = Column(Text, nullable=True)
    last_heartbeat_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    booking = relationship("Booking", back_populates="access_logs")


class ProgramUsageLog(Base):
    __tablename__ = "program_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    lab_access_log_id = Column(Integer, ForeignKey("lab_access_logs.id"), nullable=False)
    program_name = Column(String, nullable=False)
    usage_start_time = Column(DateTime(timezone=True), nullable=False)
    usage_end_time = Column(DateTime(timezone=True), nullable=False)
    duration_seconds = Column(Integer, nullable=False, default=0)
    device_name = Column(String, nullable=True)
    device_mac = Column(String, nullable=True)
    event_id = Column(String, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UsageViolation(Base):
    """Immutable audit record for a forbidden application detected in a session."""

    __tablename__ = "usage_violations"

    id = Column(BigInteger, primary_key=True, index=True)
    lab_access_log_id = Column(
        BigInteger,
        ForeignKey("lab_access_logs.id"),
        nullable=False,
    )
    program_usage_log_id = Column(
        BigInteger,
        ForeignKey("program_usage_logs.id"),
        nullable=True,
    )
    program_name = Column(String, nullable=False)
    detected_at = Column(DateTime, server_default=func.now(), nullable=False)
    reason = Column(Text, nullable=True)
    action_taken = Column(String, nullable=False, default="logout")
    event_id = Column(String, nullable=True, index=True)
    process_name = Column(String, nullable=True)
    exe_path = Column(Text, nullable=True)
    window_title = Column(Text, nullable=True)
    detection_source = Column(String, nullable=True)
    policy_version = Column(String, nullable=True)
    matched_rule_id = Column(BigInteger, nullable=True)


class ClassSchedule(Base):
    __tablename__ = "class_schedules"

    id = Column(Integer, primary_key=True, index=True)
    lab_id = Column(Integer, ForeignKey("labs.id"), nullable=False)
    course_code = Column(String, index=True, nullable=False)
    course_name = Column(String, nullable=True)
    instructor_name = Column(String, nullable=True)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    day_of_week = Column(String, nullable=False)  # Monday, Tuesday, ...
    semester = Column(String, nullable=False)
    academic_year = Column(String, nullable=False)
    valid_from = Column(Date, nullable=False)
    valid_until = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    lab = relationship("Lab", back_populates="schedules")


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    lab_id = Column(Integer, ForeignKey("labs.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    booking_date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    purpose = Column(Text, nullable=True)
    total_participants = Column(Integer, nullable=False, default=1)
    status = Column(
        String,
        nullable=False,
        default="reserved",
        server_default="reserved",
        index=True,
    )  # reserved | attended | completed | cancelled | no_show
    checked_in_at = Column(DateTime(timezone=True), nullable=True)
    checked_out_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_reason = Column(String, nullable=True)
    no_show_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="bookings")
    lab = relationship("Lab", back_populates="bookings")
    access_logs = relationship("LabAccessLog", back_populates="booking")


class UserDailyScore(Base):
    __tablename__ = "user_daily_scores"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    score_date = Column(Date, primary_key=True)
    score = Column(Integer, nullable=False, default=100)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", backref="daily_scores")


class UserPoints(Base):
    __tablename__ = "user_points"

    user_id    = Column(Integer, ForeignKey("users.id"), primary_key=True)
    points     = Column(Integer, default=100, nullable=False)  # เริ่มที่ 100
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    user = relationship("User", backref="points_record")


class PointPolicy(Base):
    """The single Admin-managed configuration for the point system."""

    __tablename__ = "point_policies"

    id = Column(Integer, primary_key=True, default=1)
    daily_bonus = Column(Integer, nullable=False, default=1)
    complete_session = Column(Integer, nullable=False, default=2)
    no_show = Column(Integer, nullable=False, default=-5)
    forbidden_app = Column(Integer, nullable=False, default=-10)
    late_cancel = Column(Integer, nullable=False, default=-3)
    point_request_amount = Column(Integer, nullable=False, default=10)
    booking_min_points = Column(Integer, nullable=False, default=80)
    warning_threshold = Column(Integer, nullable=False, default=20)
    ban_level_1_below = Column(Integer, nullable=False, default=20)
    ban_level_1_days = Column(Integer, nullable=False, default=30)
    ban_level_2_below = Column(Integer, nullable=False, default=40)
    ban_level_2_days = Column(Integer, nullable=False, default=7)
    ban_level_3_below = Column(Integer, nullable=False, default=60)
    ban_level_3_days = Column(Integer, nullable=False, default=5)
    ban_level_4_below = Column(Integer, nullable=False, default=80)
    ban_level_4_days = Column(Integer, nullable=False, default=2)
    updated_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class PointLog(Base):
    __tablename__ = "point_logs"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    change     = Column(Integer, nullable=False)   # -5, +1 etc.
    reason     = Column(String, nullable=False)    # point event reason
    note       = Column(String, nullable=True)     # รายละเอียดเพิ่ม เช่น ชื่อโปรแกรมที่โดน detect
    event_id   = Column(String, nullable=True, index=True)
    source_type = Column(String, nullable=True)
    source_id = Column(BigInteger, nullable=True)
    points_before = Column(Integer, nullable=True)
    points_after = Column(Integer, nullable=True)
    daily_score_before = Column(Integer, nullable=True)
    daily_score_after = Column(Integer, nullable=True)
    score_date = Column(Date, nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PointRequest(Base):
    __tablename__ = "point_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    requested_points = Column(Integer, nullable=False, default=10, server_default="10")
    status = Column(
        String,
        nullable=False,
        default="pending",
        server_default="pending",
        index=True,
    )  # pending | approved | rejected
    user_message = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    reviewed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class BanRecord(Base):
    __tablename__ = "ban_records"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    ban_until  = Column(DateTime(timezone=True), nullable=False)
    reason     = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True) # หรือ ForeignKey("users.id") ถ้ามีการเชื่อม Relation
    subject = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(50), default="open") # สถานะเริ่มต้นคือ open
    created_at = Column(DateTime(timezone=True), server_default=func.now())
