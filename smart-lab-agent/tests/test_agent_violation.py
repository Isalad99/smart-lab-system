import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from agent_violation import ViolationState


class ViolationStateTests(unittest.TestCase):
    def setUp(self):
        self.start = datetime(2026, 9, 12, 10, 0, 0)

    def test_first_two_detections_can_receive_grace(self):
        state = ViolationState()

        first = state.register_detection(self.start)
        self.assertEqual(first.number, 1)
        self.assertFalse(first.must_terminate)

        state.grant_grace(self.start)
        self.assertIsNone(
            state.register_detection(self.start + timedelta(seconds=299))
        )

        second_time = self.start + timedelta(seconds=300)
        second = state.register_detection(second_time)
        self.assertEqual(second.number, 2)
        self.assertFalse(second.must_terminate)

    def test_third_detection_must_terminate(self):
        state = ViolationState()

        first = state.register_detection(self.start)
        state.grant_grace(self.start)
        second_time = self.start + timedelta(seconds=300)
        second = state.register_detection(second_time)
        state.grant_grace(second_time)

        third = state.register_detection(second_time + timedelta(seconds=300))

        self.assertEqual(first.number, 1)
        self.assertEqual(second.number, 2)
        self.assertEqual(third.number, 3)
        self.assertTrue(third.must_terminate)

    def test_reset_clears_attempts_and_grace(self):
        state = ViolationState()
        state.register_detection(self.start)
        state.grant_grace(self.start)

        state.reset()

        self.assertEqual(state.attempts, 0)
        self.assertIsNone(state.grace_until)
        attempt = state.register_detection(self.start)
        self.assertEqual(attempt.number, 1)


if __name__ == "__main__":
    unittest.main()
