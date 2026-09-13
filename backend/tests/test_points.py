import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
# Always isolate the test module from any developer or deployment database URL.
os.environ["SQLALCHEMY_DATABASE_URL"] = "sqlite:///:memory:"

import models  # noqa: E402
from database import Base  # noqa: E402
from routers import points  # noqa: E402


@compiles(JSONB, "sqlite")
def compile_jsonb_for_sqlite(_type, _compiler, **_kwargs):
    return "TEXT"


TEST_TABLES = [
    Base.metadata.tables[name]
    for name in (
        "users",
        "roles",
        "user_roles",
        "user_points",
        "user_daily_scores",
        "point_policies",
        "point_logs",
        "point_requests",
        "ban_records",
    )
]


class PointSystemTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine, tables=TEST_TABLES)
        self.session = sessionmaker(bind=self.engine)()
        self.admin, self.student = self._seed_users()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def _seed_users(self):
        admin = models.User(
            first_name="System",
            last_name="Admin",
            email="admin@example.test",
            password="hashed",
        )
        student = models.User(
            first_name="Test",
            last_name="Student",
            email="student@example.test",
            password="hashed",
        )
        admin_role = models.Role(name="admin")
        student_role = models.Role(name="student")
        self.session.add_all([admin, student, admin_role, student_role])
        self.session.flush()
        self.session.add_all([
            models.UserRole(user_id=admin.id, role_id=admin_role.id),
            models.UserRole(user_id=student.id, role_id=student_role.id),
            models.UserPoints(user_id=student.id, points=100),
        ])
        self.session.commit()
        return admin, student

    def _point_record(self):
        return self.session.query(models.UserPoints).filter_by(user_id=self.student.id).one()

    def _policy(self):
        return self.session.query(models.PointPolicy).filter_by(id=1).one()

    def test_policy_defaults_are_created_and_can_change_future_events(self):
        policy = points.get_or_create_point_policy(self.session)
        self.assertEqual(policy.daily_bonus, 1)
        self.assertEqual(policy.booking_min_points, 80)

        payload = points.PointPolicyUpdate(
            daily_bonus=3,
            complete_session=6,
            no_show=-8,
            forbidden_app=-12,
            late_cancel=-4,
            point_request_amount=15,
            booking_min_points=70,
            warning_threshold=15,
            ban_level_1_below=15,
            ban_level_1_days=30,
            ban_level_2_below=30,
            ban_level_2_days=7,
            ban_level_3_below=50,
            ban_level_3_days=5,
            ban_level_4_below=70,
            ban_level_4_days=2,
        )
        response = points.update_point_policy(payload, self.admin, self.session)
        self.assertEqual(response["data"]["complete_session"], 6)
        self.assertEqual(response["data"]["booking_min_points"], 70)
        self.assertEqual(response["data"]["updated_by"], self.admin.id)

        self._point_record().points = 50
        self.session.commit()
        event = points.apply_point_event(
            self.student.id,
            "complete_session",
            self.session,
            event_id="session:policy-test",
        )
        self.assertEqual(event["change"], 6)
        self.assertEqual(event["after"], 56)
        restriction = points.get_booking_restriction(self.student.id, self.session)
        self.assertEqual(restriction["booking_min_points"], 70)
        self.assertEqual(restriction["points_warning_threshold"], 15)

    def test_policy_rejects_invalid_threshold_order(self):
        policy = points.get_or_create_point_policy(self.session)
        values = {
            field_name: getattr(policy, field_name)
            for field_name in points.DEFAULT_POINT_POLICY
        }
        values["ban_level_2_below"] = values["ban_level_1_below"]
        with self.assertRaises(HTTPException) as context:
            points.update_point_policy(
                points.PointPolicyUpdate(**values),
                self.admin,
                self.session,
            )
        self.assertEqual(context.exception.status_code, 422)

    def test_admin_test_deduction_is_logged_and_reset_restores_score(self):
        with patch.object(points, "mark_due_no_shows", return_value=0):
            deduction = points.test_deduct_user_points(self.student.id, self.admin, self.session)
            reset = points.reset_test_user_points(self.student.id, self.admin, self.session)

        self.assertEqual(deduction["points"]["after"], 90)
        self.assertEqual(reset["points"]["before"], 90)
        self.assertEqual(reset["points"]["after"], 100)
        self.assertEqual(reset["points"]["change"], 10)
        self.assertTrue(reset["reset_applied"])
        self.assertEqual(self._point_record().points, 100)
        reasons = [
            row.reason
            for row in self.session.query(models.PointLog).order_by(models.PointLog.id).all()
        ]
        self.assertEqual(reasons, ["admin_test_deduction", "admin_test_reset"])

    def test_reset_clears_only_test_bans(self):
        self._point_record().points = 80
        self.session.commit()

        with patch.object(points, "mark_due_no_shows", return_value=0):
            points.test_deduct_user_points(self.student.id, self.admin, self.session)

        test_ban = self.session.query(models.BanRecord).filter_by(user_id=self.student.id).one()
        self.assertIn(points.TEST_BAN_MARKER, test_ban.reason)

        real_ban = models.BanRecord(
            user_id=self.student.id,
            ban_until=datetime.now(timezone.utc) + timedelta(days=1),
            reason="manual Admin review",
        )
        self.session.add(real_ban)
        self.session.commit()

        reset = points.reset_test_user_points(self.student.id, self.admin, self.session)

        self.assertEqual(reset["cleared_test_bans"], 1)
        remaining_reasons = [
            row.reason
            for row in self.session.query(models.BanRecord).filter_by(user_id=self.student.id).all()
        ]
        self.assertEqual(remaining_reasons, ["manual Admin review"])
        self.assertIsNotNone(reset["points"]["ban_until"])

    def test_reset_is_idempotent_after_score_is_restored(self):
        with patch.object(points, "mark_due_no_shows", return_value=0):
            points.test_deduct_user_points(self.student.id, self.admin, self.session)
            first_reset = points.reset_test_user_points(self.student.id, self.admin, self.session)
            log_count = self.session.query(models.PointLog).count()
            second_reset = points.reset_test_user_points(self.student.id, self.admin, self.session)

        self.assertTrue(first_reset["reset_applied"])
        self.assertFalse(second_reset["reset_applied"])
        self.assertEqual(second_reset["points"]["change"], 0)
        self.assertEqual(self.session.query(models.PointLog).count(), log_count)

    def test_reset_rejects_a_user_without_a_recent_test_action(self):
        points.apply_point_event(
            self.student.id,
            "daily_bonus",
            self.session,
            event_id="daily:test",
        )

        with self.assertRaises(HTTPException) as context:
            points.reset_test_user_points(self.student.id, self.admin, self.session)

        self.assertEqual(context.exception.status_code, 409)

    def test_admin_cannot_use_test_points_on_another_admin(self):
        other_admin = models.User(
            first_name="Other",
            last_name="Admin",
            email="other-admin@example.test",
            password="hashed",
        )
        admin_role = self.session.query(models.Role).filter_by(name="admin").one()
        self.session.add(other_admin)
        self.session.flush()
        self.session.add(models.UserRole(user_id=other_admin.id, role_id=admin_role.id))
        self.session.commit()

        with patch.object(points, "mark_due_no_shows", return_value=0):
            with self.assertRaises(HTTPException) as context:
                points.test_deduct_user_points(other_admin.id, self.admin, self.session)

        self.assertEqual(context.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
