import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Popover,
  TextField,
  Typography,
} from "@mui/material";
import {
  Assessment,
  Block,
  CheckCircle,
  Close,
  Computer,
  ConfirmationNumber,
  Dashboard as DashIcon,
  HowToReg,
  Logout,
  MeetingRoom,
  Notifications,
  Person,
  Refresh,
  Save,
  Settings,
  WarningAmber,
} from "@mui/icons-material";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import {
  DEFAULT_POINT_POLICY,
  normalizePointPolicy,
  serializePointPolicy,
  validatePointPolicy,
} from "./adminPointPolicyUtils";

const API_URL = import.meta.env.VITE_API_URL;

const SIDE_MENU_ITEMS = [
  { text: "Dashboard", icon: <DashIcon sx={{ fontSize: 20 }} />, path: "/admin" },
  { text: "Manage Labs", icon: <MeetingRoom sx={{ fontSize: 20 }} />, path: "/manage-labs" },
  { text: "Verify Users", icon: <HowToReg sx={{ fontSize: 20 }} />, path: "/verify-users" },
  { text: "User Points", icon: <Assessment sx={{ fontSize: 20 }} />, path: "/admin/points" },
  { text: "Point Criteria", icon: <Settings sx={{ fontSize: 20 }} />, path: "/admin/points/policy" },
  { text: "Blacklist", icon: <Block sx={{ fontSize: 20 }} />, path: "/blacklist" },
  { text: "Ticket", icon: <ConfirmationNumber sx={{ fontSize: 20 }} />, path: "/ticket" },
];

const POINT_SECTIONS = [
  {
    title: "คะแนนที่ได้รับ",
    description: "กำหนดคะแนนที่จะเพิ่มให้ผู้ใช้จากกิจกรรมปกติ",
    icon: <CheckCircle sx={{ color: "#10b981" }} />,
    fields: [
      {
        name: "daily_bonus",
        label: "Daily bonus",
        helperText: "คะแนนที่ได้รับเมื่อระบบประมวลผลการใช้งานวันใหม่ (0–10)",
        min: 0,
        max: 10,
      },
      {
        name: "complete_session",
        label: "จบ Session ปกติ",
        helperText: "คะแนนเมื่อออกจาก Session ตามปกติ (0–20)",
        min: 0,
        max: 20,
      },
    ],
  },
  {
    title: "คะแนนที่ถูกหัก",
    description: "ค่าต้องเป็นติดลบหรือศูนย์ เพื่อป้องกันการเพิ่มคะแนนจากเหตุการณ์ผิดกฎ",
    icon: <WarningAmber sx={{ color: "#f59e0b" }} />,
    fields: [
      {
        name: "no_show",
        label: "ไม่มาตามนัด (No-show)",
        helperText: "หักเมื่อหมดเวลาจองและไม่เข้าใช้งาน (-100 ถึง 0)",
        min: -100,
        max: 0,
      },
      {
        name: "forbidden_app",
        label: "ใช้โปรแกรมต้องห้าม",
        helperText: "หักเมื่อ Agent ตรวจพบโปรแกรมผิดกฎ (-100 ถึง 0)",
        min: -100,
        max: 0,
      },
      {
        name: "late_cancel",
        label: "ยกเลิกช้า",
        helperText: "หักเมื่อยกเลิกการจองใกล้เวลาใช้งาน (-100 ถึง 0)",
        min: -100,
        max: 0,
      },
    ],
  },
  {
    title: "การกู้คะแนนและการจอง",
    description: "กำหนดจำนวนแต้มที่ขอคืนได้ รวมถึงเกณฑ์แจ้งเตือนและเกณฑ์อนุญาตให้จอง",
    icon: <Assessment sx={{ color: "#3b82f6" }} />,
    fields: [
      {
        name: "point_request_amount",
        label: "คะแนนที่คืนเมื่ออนุมัติคำขอ",
        helperText: "จำนวนแต้มที่ผู้ใช้ขอคืนเมื่อคะแนนเป็น 0 (1–100)",
        min: 1,
        max: 100,
      },
      {
        name: "warning_threshold",
        label: "เกณฑ์แจ้งเตือน",
        helperText: "แจ้งเตือนระดับวิกฤตเมื่อคะแนนไม่เกินค่านี้ (0–100)",
        min: 0,
        max: 100,
      },
      {
        name: "booking_min_points",
        label: "เกณฑ์ขั้นต่ำสำหรับจองห้อง",
        helperText: "ผู้ใช้ต้องมีคะแนนอย่างน้อยค่านี้และไม่ติด Ban (1–100)",
        min: 1,
        max: 100,
      },
    ],
  },
];

const BAN_LEVELS = [
  { label: "ระดับ 1 · ต่ำกว่าเกณฑ์วิกฤต", threshold: "ban_level_1_below", days: "ban_level_1_days" },
  { label: "ระดับ 2 · คะแนนต่ำ", threshold: "ban_level_2_below", days: "ban_level_2_days" },
  { label: "ระดับ 3 · คะแนนเริ่มเตือน", threshold: "ban_level_3_below", days: "ban_level_3_days" },
  { label: "ระดับ 4 · ต่ำกว่าเกณฑ์จอง", threshold: "ban_level_4_below", days: "ban_level_4_days" },
];

const getErrorMessage = (requestError, fallback) => {
  const detail = requestError.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

const formatDateTime = (value) => {
  if (!value) return "ยังไม่มีข้อมูล";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "ยังไม่มีข้อมูล";
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function PolicyNumberField({ field, value, onChange }) {
  return (
    <TextField
      fullWidth
      type="number"
      label={field.label}
      value={value}
      onChange={(event) => onChange(field.name, event.target.value)}
      helperText={field.helperText}
      slotProps={{
        htmlInput: {
          min: field.min,
          max: field.max,
          step: 1,
        },
      }}
      sx={{
        "& .MuiFormHelperText-root": {
          minHeight: 40,
          lineHeight: 1.35,
        },
      }}
    />
  );
}

export default function AdminPointPolicy() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState(null);
  const [policy, setPolicy] = useState(() => normalizePointPolicy(DEFAULT_POINT_POLICY));
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchPolicy = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError("กรุณาเข้าสู่ระบบด้วยบัญชี Admin ก่อนปรับเกณฑ์คะแนน");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`${API_URL}/admin/points/policy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = response.data?.data || {};
      setPolicy(normalizePointPolicy(data));
      setLastUpdated(data.updated_at || null);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "ไม่สามารถโหลดเกณฑ์คะแนนได้"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Point Criteria | Smart Lab Admin";
    fetchPolicy();
  }, [fetchPolicy]);

  const handleFieldChange = (fieldName, value) => {
    setPolicy((currentPolicy) => ({ ...currentPolicy, [fieldName]: value }));
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    const validationError = validatePointPolicy(policy);
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      setError("กรุณาเข้าสู่ระบบด้วยบัญชี Admin ก่อนบันทึกเกณฑ์คะแนน");
      return;
    }

    try {
      setSaving(true);
      setError("");
      const response = await axios.put(
        `${API_URL}/admin/points/policy`,
        serializePointPolicy(policy),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = response.data?.data || policy;
      setPolicy(normalizePointPolicy(data));
      setLastUpdated(data.updated_at || new Date().toISOString());
      setSuccess("บันทึกเกณฑ์คะแนนเรียบร้อยแล้ว มีผลกับเหตุการณ์ใหม่หลังจากนี้");
    } catch (requestError) {
      setError(getErrorMessage(requestError, "ไม่สามารถบันทึกเกณฑ์คะแนนได้"));
      setSuccess("");
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    setPolicy(normalizePointPolicy(DEFAULT_POINT_POLICY));
    setError("");
    setSuccess("คืนค่าเริ่มต้นในฟอร์มแล้ว กดบันทึกเกณฑ์คะแนนเพื่อใช้งานจริง");
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate("/");
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "#fcfdfe", fontFamily: "'Inter', sans-serif" }}>
      <Box
        sx={{
          width: 240,
          bgcolor: "#f0f7ff",
          borderRight: "1px solid #e2efff",
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <Box sx={{ p: 4, display: "flex", gap: 2, alignItems: "center" }}>
          <Box sx={{ bgcolor: "#000", p: 1, borderRadius: 2.5, display: "flex", boxShadow: "0 4px 10px rgba(0,0,0,0.2)" }}>
            <Computer sx={{ color: "white", fontSize: 28 }} />
          </Box>
          <Box>
            <Typography variant="h6" fontWeight="800" sx={{ color: "#0f172a", letterSpacing: "-0.5px" }}>
              Smart Lab
            </Typography>
            <Typography variant="caption" sx={{ color: "#64748b", fontWeight: "500", display: "block", mt: -0.5 }}>
              Admin Dashboard
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: 2, mt: 4 }}>
          {SIDE_MENU_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Button
                key={item.text}
                fullWidth
                onClick={() => navigate(item.path)}
                startIcon={item.icon}
                sx={{
                  justifyContent: "flex-start",
                  py: 1,
                  px: 2.5,
                  mb: 0.5,
                  bgcolor: isActive ? "white" : "transparent",
                  color: isActive ? "#3b82f6" : "#94a3b8",
                  fontWeight: isActive ? "700" : "600",
                  boxShadow: isActive ? "0 10px 25px rgba(0,0,0,0.03)" : "none",
                  borderRadius: 4,
                  textTransform: "none",
                  transition: "0.3s",
                  "&:hover": {
                    bgcolor: isActive ? "white" : "transparent",
                    color: "#3b82f6",
                    transform: "translateX(5px)",
                  },
                }}
              >
                {item.text}
              </Button>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "hidden", minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 2,
            px: { xs: 3, md: 6 },
            py: 1.5,
            bgcolor: "white",
            borderBottom: "1px solid #e2e8f0",
            zIndex: 5,
          }}
        >
          <Typography variant="h5" fontWeight="800" sx={{ color: "#1e293b", letterSpacing: "-1px" }}>
            Point Criteria
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton sx={{ bgcolor: "#f8fafc" }} aria-label="Notifications">
              <Notifications sx={{ color: "#64748b" }} />
            </IconButton>
            <Divider orientation="vertical" flexItem sx={{ height: 30, my: "auto", bgcolor: "#e2e8f0" }} />
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
                <Typography variant="subtitle2" fontWeight="800" color="#1e293b">
                  System Admin
                </Typography>
                <Typography variant="caption" fontWeight="600" color="#94a3b8">
                  Administrator
                </Typography>
              </Box>
              <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                aria-label="Open admin menu"
                sx={{ p: 0.8, "&:hover": { bgcolor: "#f1f5f9" } }}
              >
                <Avatar sx={{ bgcolor: "#0f172a", width: 36, height: 36 }}>
                  <Person sx={{ fontSize: 20 }} />
                </Avatar>
              </IconButton>
              <Popover
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={() => setAnchorEl(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                transformOrigin={{ vertical: "top", horizontal: "right" }}
                slotProps={{ paper: { sx: { mt: 1.5, width: 280, borderRadius: 4, boxShadow: "0 20px 45px rgba(15,23,42,0.16)", border: "1px solid #e2e8f0" } } }}
              >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2, pt: 1.5 }}>
                  <Typography fontSize="13px" fontWeight="600" color="#64748b">
                    admin@smartlab.ac.th
                  </Typography>
                  <IconButton size="small" onClick={() => setAnchorEl(null)} aria-label="Close menu">
                    <Close sx={{ fontSize: 18, color: "#64748b" }} />
                  </IconButton>
                </Box>
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Button fullWidth onClick={handleLogout} startIcon={<Logout />} sx={{ justifyContent: "flex-start", color: "#ef4444", fontWeight: "700", textTransform: "none", borderRadius: 2 }}>
                    Log out
                  </Button>
                </Box>
              </Popover>
            </Box>
          </Box>
        </Box>

        <Box sx={{ p: { xs: 3, md: 6 }, flex: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Box>
              <Typography variant="h4" fontWeight="800" color="#1e293b" sx={{ letterSpacing: "-1px" }}>
                ปรับเกณฑ์คะแนน
              </Typography>
              <Typography variant="body2" color="#64748b" sx={{ mt: 0.75 }}>
                ตั้งค่าคะแนนที่ใช้กับการตรวจจับ การจบ Session การแจ้งเตือน และสิทธิ์การจองของผู้ใช้
              </Typography>
              <Typography variant="caption" color="#94a3b8" sx={{ display: "block", mt: 0.5 }}>
                แก้ไขล่าสุด {formatDateTime(lastUpdated)} · คะแนนสูงสุดยังคงที่ 100 คะแนน
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchPolicy}
              disabled={loading || saving}
              sx={{ borderRadius: 3, textTransform: "none", fontWeight: "700", borderColor: "#cbd5e1", color: "#475569" }}
            >
              รีเฟรชข้อมูล
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>
            ค่าใหม่จะมีผลกับเหตุการณ์คะแนนและการตรวจสอบสิทธิ์การจองในครั้งถัดไป ประวัติคะแนนเดิมจะไม่ถูกแก้ไข
          </Alert>

          {error && <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>{success}</Alert>}

          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 360 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {POINT_SECTIONS.map((section) => (
                <Paper key={section.title} elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 4, border: "1px solid #e2e8f0" }}>
                  <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 2.5 }}>
                    <Avatar sx={{ bgcolor: "#f8fafc", width: 42, height: 42 }}>{section.icon}</Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight="800" color="#1e293b">{section.title}</Typography>
                      <Typography variant="body2" color="#64748b">{section.description}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 2.5 }}>
                    {section.fields.map((field) => (
                      <PolicyNumberField key={field.name} field={field} value={policy[field.name]} onChange={handleFieldChange} />
                    ))}
                  </Box>
                </Paper>
              ))}

              <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3.5 }, borderRadius: 4, border: "1px solid #e2e8f0" }}>
                <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5, mb: 1 }}>
                  <Avatar sx={{ bgcolor: "#fff7ed", width: 42, height: 42 }}><Block sx={{ color: "#f97316" }} /></Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight="800" color="#1e293b">เกณฑ์การระงับการจอง</Typography>
                    <Typography variant="body2" color="#64748b">คะแนนต่ำกว่าแต่ละระดับจะถูกระงับตามจำนวนวันที่กำหนด หากใส่ 0 วันจะไม่สร้าง Ban ในระดับนั้น</Typography>
                  </Box>
                </Box>
                <Alert severity="warning" sx={{ my: 2.5, borderRadius: 2.5 }}>
                  Threshold ต้องเรียงจากน้อยไปมาก และ threshold สูงสุดต้องไม่เกินเกณฑ์ขั้นต่ำสำหรับจองห้อง
                </Alert>
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 2.5 }}>
                  {BAN_LEVELS.map((level) => (
                    <Paper key={level.label} elevation={0} sx={{ p: 2.5, borderRadius: 3, bgcolor: "#f8fafc", border: "1px solid #eef2f7" }}>
                      <Typography variant="subtitle2" fontWeight="800" color="#334155" sx={{ mb: 2 }}>{level.label}</Typography>
                      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
                        <TextField
                          type="number"
                          label="ต่ำกว่า (คะแนน)"
                          value={policy[level.threshold]}
                          onChange={(event) => handleFieldChange(level.threshold, event.target.value)}
                          slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }}
                        />
                        <TextField
                          type="number"
                          label="ระงับ (วัน)"
                          value={policy[level.days]}
                          onChange={(event) => handleFieldChange(level.days, event.target.value)}
                          slotProps={{ htmlInput: { min: 0, max: 365, step: 1 } }}
                        />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Paper>

              <Paper elevation={0} sx={{ p: 2.5, borderRadius: 4, border: "1px solid #dbeafe", bgcolor: "#eff6ff" }}>
                <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
                  <Settings sx={{ color: "#2563eb", mt: 0.25 }} />
                  <Box>
                    <Typography variant="subtitle2" fontWeight="800" color="#1e3a8a">ขอบเขตของการตั้งค่า</Typography>
                    <Typography variant="body2" color="#1e40af">
                      ปุ่มลดคะแนน/Reset สำหรับ Test ยังคงใช้ค่า -10 และ 100 แบบคงที่ เพื่อป้องกันการทดสอบเปลี่ยนไปตาม policy จริง
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1.5, flexWrap: "wrap" }}>
                <Button variant="outlined" onClick={handleRestoreDefaults} disabled={saving} sx={{ borderRadius: 3, textTransform: "none", fontWeight: "700" }}>
                  คืนค่าเริ่มต้นในฟอร์ม
                </Button>
                <Button variant="contained" startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <Save />} onClick={handleSave} disabled={saving} sx={{ borderRadius: 3, textTransform: "none", fontWeight: "800", px: 3, boxShadow: "none" }}>
                  {saving ? "กำลังบันทึก..." : "บันทึกเกณฑ์คะแนน"}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
