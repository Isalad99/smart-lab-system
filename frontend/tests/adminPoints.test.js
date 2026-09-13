import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTestPointEndpoint,
  canRunTestPointAction,
  normalizeTestPoints,
} from "../src/pages/adminPointsTestUtils.js";

test("normalizes test points to the supported 0-100 range", () => {
  assert.equal(normalizeTestPoints(-5), 0);
  assert.equal(normalizeTestPoints(45), 45);
  assert.equal(normalizeTestPoints(150), 100);
  assert.equal(normalizeTestPoints("not-a-number"), 0);
});

test("allows deduction above zero and reset below the maximum", () => {
  assert.equal(canRunTestPointAction(100, "deduct"), true);
  assert.equal(canRunTestPointAction(0, "deduct"), false);
  assert.equal(canRunTestPointAction(70, "reset"), true);
  assert.equal(canRunTestPointAction(100, "reset"), false);
  assert.equal(canRunTestPointAction(70, "reset", true), false);
});

test("builds the two Admin test endpoints without duplicate slashes", () => {
  assert.equal(
    buildTestPointEndpoint("http://localhost:8000/", 12, "deduct"),
    "http://localhost:8000/admin/points/test-deduct/12",
  );
  assert.equal(
    buildTestPointEndpoint("http://localhost:8000", 12, "reset"),
    "http://localhost:8000/admin/points/test-reset/12",
  );
});
