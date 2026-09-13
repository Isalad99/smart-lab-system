export const DEFAULT_POINT_POLICY = Object.freeze({
  daily_bonus: 1,
  complete_session: 2,
  no_show: -5,
  forbidden_app: -10,
  late_cancel: -3,
  point_request_amount: 10,
  booking_min_points: 80,
  warning_threshold: 20,
  ban_level_1_below: 20,
  ban_level_1_days: 30,
  ban_level_2_below: 40,
  ban_level_2_days: 7,
  ban_level_3_below: 60,
  ban_level_3_days: 5,
  ban_level_4_below: 80,
  ban_level_4_days: 2,
});

export const POLICY_FIELD_NAMES = Object.keys(DEFAULT_POINT_POLICY);

const FIELD_RANGES = {
  daily_bonus: [0, 10],
  complete_session: [0, 20],
  no_show: [-100, 0],
  forbidden_app: [-100, 0],
  late_cancel: [-100, 0],
  point_request_amount: [1, 100],
  booking_min_points: [1, 100],
  warning_threshold: [0, 100],
  ban_level_1_below: [1, 100],
  ban_level_1_days: [0, 365],
  ban_level_2_below: [1, 100],
  ban_level_2_days: [0, 365],
  ban_level_3_below: [1, 100],
  ban_level_3_days: [0, 365],
  ban_level_4_below: [1, 100],
  ban_level_4_days: [0, 365],
};

export function normalizePointPolicy(value) {
  const source = value || {};
  return POLICY_FIELD_NAMES.reduce((result, fieldName) => {
    result[fieldName] = source[fieldName] ?? DEFAULT_POINT_POLICY[fieldName];
    return result;
  }, {});
}

export function serializePointPolicy(values) {
  return POLICY_FIELD_NAMES.reduce((result, fieldName) => {
    result[fieldName] = Number(values[fieldName]);
    return result;
  }, {});
}

export function validatePointPolicy(values) {
  for (const fieldName of POLICY_FIELD_NAMES) {
    const rawValue = values[fieldName];
    const numericValue = Number(rawValue);
    if (rawValue === "" || rawValue === null || !Number.isInteger(numericValue)) {
      return "กรุณากรอกค่าเป็นจำนวนเต็มให้ครบทุกช่อง";
    }

    const [minimum, maximum] = FIELD_RANGES[fieldName];
    if (numericValue < minimum || numericValue > maximum) {
      return `ค่า ${fieldName} ต้องอยู่ระหว่าง ${minimum} ถึง ${maximum}`;
    }
  }

  const thresholds = [
    Number(values.ban_level_1_below),
    Number(values.ban_level_2_below),
    Number(values.ban_level_3_below),
    Number(values.ban_level_4_below),
  ];
  if (thresholds.some((threshold, index) => index > 0 && threshold <= thresholds[index - 1])) {
    return "เกณฑ์คะแนนสำหรับ Ban ต้องเรียงจากน้อยไปมากและไม่ซ้ำกัน";
  }
  if (Number(values.warning_threshold) >= Number(values.booking_min_points)) {
    return "เกณฑ์แจ้งเตือนต้องน้อยกว่าเกณฑ์การจอง";
  }
  if (Number(values.ban_level_4_below) > Number(values.booking_min_points)) {
    return "เกณฑ์ Ban ระดับสูงสุดต้องไม่มากกว่าเกณฑ์การจอง";
  }
  return "";
}
