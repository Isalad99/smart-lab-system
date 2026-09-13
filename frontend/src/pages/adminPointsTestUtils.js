export const TEST_POINTS_MAX = 100;

export function normalizeTestPoints(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(TEST_POINTS_MAX, numericValue));
}

export function canRunTestPointAction(points, action, busy = false) {
  if (busy) return false;

  const normalizedPoints = normalizeTestPoints(points);
  if (action === "deduct") return normalizedPoints > 0;
  if (action === "reset") return normalizedPoints < TEST_POINTS_MAX;
  return false;
}

export function buildTestPointEndpoint(apiUrl, userId, action) {
  if (action !== "deduct" && action !== "reset") {
    throw new Error(`Unsupported test point action: ${action}`);
  }

  const baseUrl = String(apiUrl || "").replace(/\/+$/, "");
  return `${baseUrl}/admin/points/test-${action}/${encodeURIComponent(userId)}`;
}
