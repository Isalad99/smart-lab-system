import os

import models
from database import SessionLocal, engine
from sqlalchemy.orm import Session
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEFAULT_ROLES = [
    {"name": "admin",   "display_name": "Administrator"},
    {"name": "student", "display_name": "University Student"},
    {"name": "guest",   "display_name": "Guest User"},
]

DEFAULT_LABS = [
    {
        "name": "Smart Lab Center 1",
        "code": "LAB01",
        "capacity": 30,
        "location": "Building 5, Room 501",
        "status": "active",
    }
]

TEST_STUDENT_EMAIL = os.getenv("SEED_TEST_STUDENT_EMAIL", "student.test@bumail.net")
TEST_STUDENT_ID = os.getenv("SEED_TEST_STUDENT_ID", "TEST0001")
ADMIN_PASSWORD = os.getenv("SEED_ADMIN_PASSWORD")
TEST_STUDENT_PASSWORD = os.getenv("SEED_TEST_STUDENT_PASSWORD")

DEFAULT_BLACKLIST = [
    {
        "app_name": "BitTorrent",
        "description": "ห้ามใช้โปรแกรมโหลดไฟล์ละเมิดลิขสิทธิ์",
        "match_type": "process_name_or_title",
        "match_value": "bittorrent",
    },
    {
        "app_name": "CheatEngine",
        "description": "ห้ามใช้โปรแกรมดัดแปลงหน่วยความจำ",
        "match_type": "process_name_or_title",
        "match_value": "cheatengine",
    },
    {
        "app_name": "GenshinImpact",
        "description": "ไม่อนุญาตให้เล่นเกม Genshin ขณะใช้งานห้องแล็บ",
        "match_type": "process_name_or_title",
        "match_value": "genshinimpact",
    },
    {
        "app_name": "StarRail",
        "description": "ไม่อนุญาตให้ขึ้นรถไฟ Star Rail ในเวลาเรียนครับกัปตัน!",
        "match_type": "process_name_or_title",
        "match_value": "starrail",
    },
]


def seed_roles(db: Session) -> None:
    for role_data in DEFAULT_ROLES:
        exists = db.query(models.Role).filter(models.Role.name == role_data["name"]).first()
        if not exists:
            db.add(models.Role(**role_data))
            print(f"  + role: {role_data['name']}")


def seed_labs(db: Session) -> None:
    for lab_data in DEFAULT_LABS:
        exists = db.query(models.Lab).filter(models.Lab.code == lab_data["code"]).first()
        if not exists:
            db.add(models.Lab(**lab_data))
            print(f"  + lab: {lab_data['code']}")


def seed_blacklisted_apps(db: Session) -> None:
    for app in DEFAULT_BLACKLIST:
        existing = db.query(models.BlacklistedApp).filter(
            models.BlacklistedApp.app_name == app["app_name"]
        ).first()
        if not existing:
            db.add(models.BlacklistedApp(**app))
            print(f"  + blacklist: {app['app_name']}")
        else:
            # update description in case we changed the wording
            existing.description = app["description"]


def seed_users(db: Session) -> None:
    admin_email = "admin@smartlab.com"
    admin_role = db.query(models.Role).filter(models.Role.name == "admin").first()
    admin_user = db.query(models.User).filter(models.User.email == admin_email).first()
    if not admin_user:
        if not ADMIN_PASSWORD:
            raise ValueError("SEED_ADMIN_PASSWORD is required to create the admin user.")
        admin_user = models.User(
            first_name="System",
            last_name="Admin",
            email=admin_email,
            password=pwd_context.hash(ADMIN_PASSWORD),
        )
        db.add(admin_user)
        db.flush()
        print(f"  + admin: {admin_email}")

    if admin_role and admin_role not in admin_user.roles:
        admin_user.roles.append(admin_role)

    student_role = db.query(models.Role).filter(models.Role.name == "student").first()
    test_student = db.query(models.User).filter(
        models.User.email == TEST_STUDENT_EMAIL
    ).first()
    if not test_student:
        if not TEST_STUDENT_PASSWORD:
            raise ValueError(
                "SEED_TEST_STUDENT_PASSWORD is required to create the test student."
            )
        test_student = models.User(
            first_name="Test",
            last_name="Student",
            email=TEST_STUDENT_EMAIL,
            password=pwd_context.hash(TEST_STUDENT_PASSWORD),
        )
        db.add(test_student)
        db.flush()
        print(f"  + test student: {TEST_STUDENT_EMAIL}")

    if student_role and student_role not in test_student.roles:
        test_student.roles.append(student_role)

    student_record = db.query(models.Student).filter(
        models.Student.user_id == test_student.id
    ).first()
    if not student_record:
        existing_student_id = db.query(models.Student).filter(
            models.Student.student_id == TEST_STUDENT_ID
        ).first()
        if existing_student_id and existing_student_id.user_id != test_student.id:
            raise ValueError(
                f"Student ID {TEST_STUDENT_ID} belongs to another user."
            )
        db.add(models.Student(
            student_id=TEST_STUDENT_ID,
            user_id=test_student.id,
            faculty="Test Faculty",
            department="Test Department",
            is_active=True,
        ))
        print(f"  + student record: {TEST_STUDENT_ID}")

    for seeded_user in (admin_user, test_student):
        points_record = db.query(models.UserPoints).filter(
            models.UserPoints.user_id == seeded_user.id,
        ).first()
        if not points_record:
            db.add(models.UserPoints(user_id=seeded_user.id, points=100))
            print(f"  + initial points: {seeded_user.email}")


def seed_data() -> None:
    print("Running seed...")
    models.Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_roles(db)
        seed_labs(db)
        seed_blacklisted_apps(db)
        db.flush()  # flush before seed_users so roles are available for lookup

        seed_users(db)

        db.commit()
        print("Seed complete.")
    except Exception as e:
        db.rollback()
        print(f"Seed failed: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()
