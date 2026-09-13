import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_POINT_POLICY,
  normalizePointPolicy,
  serializePointPolicy,
  validatePointPolicy,
} from "../src/pages/adminPointPolicyUtils.js";

test("normalizes an incomplete policy with safe defaults", () => {
  const policy = normalizePointPolicy({ daily_bonus: 4 });

  assert.equal(policy.daily_bonus, 4);
  assert.equal(policy.complete_session, DEFAULT_POINT_POLICY.complete_session);
  assert.equal(policy.booking_min_points, DEFAULT_POINT_POLICY.booking_min_points);
});

test("serializes numeric form values for the API", () => {
  const payload = serializePointPolicy({
    ...DEFAULT_POINT_POLICY,
    daily_bonus: "3",
    no_show: "-8",
  });

  assert.equal(payload.daily_bonus, 3);
  assert.equal(payload.no_show, -8);
  assert.equal(typeof payload.booking_min_points, "number");
});

test("rejects policy values that make thresholds ambiguous", () => {
  assert.match(
    validatePointPolicy({
      ...DEFAULT_POINT_POLICY,
      warning_threshold: DEFAULT_POINT_POLICY.booking_min_points,
    }),
    /แจ้งเตือน/,
  );

  assert.match(
    validatePointPolicy({
      ...DEFAULT_POINT_POLICY,
      ban_level_2_below: DEFAULT_POINT_POLICY.ban_level_1_below,
    }),
    /Ban/,
  );
});

test("accepts the default policy", () => {
  assert.equal(validatePointPolicy(DEFAULT_POINT_POLICY), "");
});
