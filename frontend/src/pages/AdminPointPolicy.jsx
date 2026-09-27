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
  Logout,
  Person,
  Refresh,
  Save,
  Settings,
  WarningAmber,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminNavigation from "../components/AdminNavigation";
import { formatDateTime } from "../utils/dateFormat";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";
import {
  DEFAULT_POINT_POLICY,
  normalizePointPolicy,
  serializePointPolicy,
  validatePointPolicy,
} from "./adminPointPolicyUtils";

const API_URL = import.meta.env.VITE_API_URL;

const POINT_SECTIONS = [
  {
    titleKey: "admin.pointEarnedTitle",
    descriptionKey: "admin.pointEarnedDescription",
    icon: <CheckCircle sx={{ color: "#10b981" }} />,
    fields: [
      {
        name: "daily_bonus",
        labelKey: "admin.dailyBonusPolicy",
        helperTextKey: "admin.dailyBonusPolicyHint",
        min: 0,
        max: 10,
      },
      {
        name: "complete_session",
        labelKey: "admin.completeSessionPolicy",
        helperTextKey: "admin.completeSessionPolicyHint",
        min: 0,
        max: 20,
      },
    ],
  },
  {
    titleKey: "admin.pointDeductedTitle",
    descriptionKey: "admin.pointDeductedDescription",
    icon: <WarningAmber sx={{ color: "#f59e0b" }} />,
    fields: [
      {
        name: "no_show",
        labelKey: "admin.noShowPolicy",
        helperTextKey: "admin.noShowPolicyHint",
        min: -100,
        max: 0,
      },
      {
        name: "forbidden_app",
        labelKey: "admin.forbiddenProgramPolicy",
        helperTextKey: "admin.forbiddenProgramPolicyHint",
        min: -100,
        max: 0,
      },
      {
        name: "late_cancel",
        labelKey: "admin.lateCancelPolicy",
        helperTextKey: "admin.lateCancelPolicyHint",
        min: -100,
        max: 0,
      },
    ],
  },
  {
    titleKey: "admin.recoveryAndBookingTitle",
    descriptionKey: "admin.recoveryAndBookingDescription",
    icon: <Assessment sx={{ color: "#3b82f6" }} />,
    fields: [
      {
        name: "point_request_amount",
        labelKey: "admin.pointsReturnedOnApproval",
        helperTextKey: "admin.pointsReturnedHint",
        min: 1,
        max: 100,
      },
      {
        name: "warning_threshold",
        labelKey: "admin.warningThresholdLabel",
        helperTextKey: "admin.warningThresholdHint",
        min: 0,
        max: 100,
      },
    ],
  },
];

const BAN_LEVELS = [
  {
    labelKey: "admin.banLevelOne",
    threshold: "ban_level_1_below",
    days: "ban_level_1_days",
  },
  {
    labelKey: "admin.banLevelTwo",
    threshold: "ban_level_2_below",
    days: "ban_level_2_days",
  },
  {
    labelKey: "admin.banLevelThree",
    threshold: "ban_level_3_below",
    days: "ban_level_3_days",
  },
  {
    labelKey: "admin.banLevelFour",
    threshold: "ban_level_4_below",
    days: "ban_level_4_days",
  },
];

const getErrorMessage = (requestError, fallback) => {
  const detail = requestError.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

function PolicyNumberField({ field, value, onChange }) {
  const { t } = useLanguage();
  return (
    <TextField
      fullWidth
      type="number"
      label={t(field.labelKey)}
      value={value}
      onChange={(event) => onChange(field.name, event.target.value)}
      helperText={t(field.helperTextKey)}
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
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [anchorEl, setAnchorEl] = useState(null);
  const [policy, setPolicy] = useState(() =>
    normalizePointPolicy(DEFAULT_POINT_POLICY),
  );
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchPolicy = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.policyAdminLoginRequired"));
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
      setError(getErrorMessage(requestError, t("admin.loadPolicyFailed")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    document.title = `${t("admin.policyTitle")} | Smart Lab Admin`;
    fetchPolicy();
  }, [fetchPolicy, t]);

  const handleFieldChange = (fieldName, value) => {
    setPolicy((currentPolicy) => ({ ...currentPolicy, [fieldName]: value }));
    setError("");
    setSuccess("");
  };

  const handleSave = async () => {
    const validationError = validatePointPolicy(policy);
    if (validationError) {
      setError(t(validationError));
      setSuccess("");
      return;
    }

    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.policySaveAdminLoginRequired"));
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
      setSuccess(t("admin.policySaved"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("admin.savePolicyFailed")));
      setSuccess("");
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefaults = () => {
    setPolicy(normalizePointPolicy(DEFAULT_POINT_POLICY));
    setError("");
    setSuccess(t("admin.policyDefaultsRestored"));
  };

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate("/");
  };

  return (
    <Box
      className="app-layout admin-layout"
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "#fcfdfe",
        fontFamily: "var(--font-family-ui)",
      }}
    >
      <Box
        className="sidebar admin-sidebar"
        sx={{
          width: "var(--sidebar-width)",
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
        <Box
          className="sidebar-logo"
          sx={{ p: 4, display: "flex", gap: 2, alignItems: "center" }}
        >
          <Box
            className="admin-brand-mark"
            sx={{
              bgcolor: "#000",
              p: 1,
              borderRadius: 2.5,
              display: "flex",
              boxShadow: "0 4px 10px rgba(0,0,0,0.2)",
            }}
          >
            <Computer sx={{ color: "white", fontSize: 28 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight="700"
              sx={{ color: "#0f172a", letterSpacing: "-0.5px" }}
            >
              Smart Lab
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#64748b",
                fontWeight: "400",
                display: "block",
                mt: -0.5,
              }}
            >
              {t("common.adminDashboard")}
            </Typography>
          </Box>
        </Box>

        <AdminNavigation />
      </Box>

      <Box
        className="main-area admin-main-area"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
          minWidth: 0,
        }}
      >
        <Box
          className="top-header admin-top-header"
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
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {t("admin.policyTitle")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <NotificationBell
              className="admin-notification-button"
              iconColor="#64748b"
              loadNotifications={false}
            />
            <Divider
              orientation="vertical"
              flexItem
              sx={{ height: 30, my: "auto", bgcolor: "#e2e8f0" }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box
                sx={{
                  textAlign: "right",
                  display: { xs: "none", sm: "block" },
                }}
              >
                <Typography
                  variant="subtitle2"
                  fontWeight="700"
                  color="#1e293b"
                >
                  {t("common.systemAdmin")}
                </Typography>
                <Typography variant="caption" fontWeight="500" color="#94a3b8">
                  {t("common.administrator")}
                </Typography>
              </Box>
              <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                aria-label={t("common.openMenu")}
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
                PaperProps={{
                  sx: {
                    mt: 1.5,
                    width: 320,
                    borderRadius: 5,
                    boxShadow: "0 20px 45px rgba(15,23,42,0.16)",
                    border: "1px solid #e2e8f0",
                    overflow: "hidden",
                  },
                }}
              >
                {/* Header: อีเมล + ปุ่มปิด */}
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    px: 2,
                    pt: 1.5,
                  }}
                >
                  <Typography
                    fontSize="13px"
                    fontWeight="500"
                    color="#64748b"
                    sx={{ pl: 0.5 }}
                  >
                    admin@smartlab.ac.th
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setAnchorEl(null)}
                    aria-label={t("common.closeMenu")}
                  >
                    <Close sx={{ fontSize: 18, color: "#64748b" }} />
                  </IconButton>
                </Box>

                {/* Avatar + ชื่อผู้ใช้ */}
                <Box sx={{ textAlign: "center", px: 3, pb: 3, pt: 0.5 }}>
                  <Box sx={{ position: "relative", display: "inline-block" }}>
                    <Avatar
                      sx={{
                        bgcolor: "#0f172a",
                        width: 84,
                        height: 84,
                        mx: "auto",
                        boxShadow:
                          "0 0 0 4px #eff6ff, 0 8px 20px rgba(59,130,246,0.25)",
                      }}
                    >
                      <Person sx={{ fontSize: 40 }} />
                    </Avatar>
                  </Box>

                  <Typography
                    sx={{ mt: 1.5, color: "#1e293b" }}
                    fontWeight="600"
                    fontSize="18px"
                  >
                    {t("common.systemAdmin")}
                  </Typography>
                </Box>

                <Divider />

                {/* ปุ่ม Log out */}
                <Box sx={{ px: 1, py: 1 }}>
                  <Box
                    onClick={handleLogout}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      px: 1.5,
                      py: 1,
                      borderRadius: 2,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "#fef2f2" },
                    }}
                  >
                    <Logout sx={{ fontSize: 20, color: "#ef4444" }} />
                    <Typography
                      fontSize="13px"
                      fontWeight="600"
                      color="#ef4444"
                    >
                      {t("common.logout")}
                    </Typography>
                  </Box>
                </Box>
              </Popover>
            </Box>
          </Box>
        </Box>

        <Box
          className="content-area admin-content-area page-content"
          sx={{ p: { xs: 3, md: 6 }, flex: 1 }}
        >
          <Box
            className="page-header"
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 2,
              mb: 3,
              flexWrap: "wrap",
            }}
          >
            <Box className="page-header__copy">
              <Typography
                variant="h4"
                fontWeight="700"
                color="#1e293b"
                sx={{ letterSpacing: "-1px" }}
              >
                {t("admin.pointPolicyHeading")}
              </Typography>
              <Typography variant="body2" color="#64748b" sx={{ mt: 0.75 }}>
                {t("admin.pointPolicySubtitle")}
              </Typography>
              <Typography
                variant="caption"
                color="#94a3b8"
                sx={{ display: "block", mt: 0.5 }}
              >
                {t("admin.lastUpdated")}{" "}
                {formatDateTime(lastUpdated, t("common.locale"), {
                  fallback: t("common.noData"),
                })}{" "}
                · 100 {t("common.points")}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchPolicy}
              disabled={loading || saving}
              sx={{
                borderRadius: 3,
                textTransform: "none",
                fontWeight: "600",
                borderColor: "#cbd5e1",
                color: "#475569",
              }}
            >
              {t("admin.refreshData")}
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>
            {t("admin.pointPolicyInfo")}
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>
              {success}
            </Alert>
          )}

          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 360,
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {POINT_SECTIONS.map((section) => (
                <Paper
                  key={section.titleKey}
                  className="surface-card"
                  elevation={0}
                  sx={{
                    p: { xs: 2.5, md: 3.5 },
                    borderRadius: 4,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 1.5,
                      mb: 2.5,
                    }}
                  >
                    <Avatar sx={{ bgcolor: "#f8fafc", width: 42, height: 42 }}>
                      {section.icon}
                    </Avatar>
                    <Box>
                      <Typography variant="h6" fontWeight="700" color="#1e293b">
                        {t(section.titleKey)}
                      </Typography>
                      <Typography variant="body2" color="#64748b">
                        {t(section.descriptionKey)}
                      </Typography>
                    </Box>
                  </Box>
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: 2.5,
                    }}
                  >
                    {section.fields.map((field) => (
                      <PolicyNumberField
                        key={field.name}
                        field={field}
                        value={policy[field.name]}
                        onChange={handleFieldChange}
                      />
                    ))}
                  </Box>
                </Paper>
              ))}

              <Paper
                className="surface-card"
                elevation={0}
                sx={{
                  p: { xs: 2.5, md: 3.5 },
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 1.5,
                    mb: 1,
                  }}
                >
                  <Avatar sx={{ bgcolor: "#fff7ed", width: 42, height: 42 }}>
                    <Block sx={{ color: "#f97316" }} />
                  </Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight="700" color="#1e293b">
                      {t("admin.bookingBanCriteria")}
                    </Typography>
                    <Typography variant="body2" color="#64748b">
                      {t("admin.banCriteriaDescription")}
                    </Typography>
                  </Box>
                </Box>
                <Alert severity="warning" sx={{ my: 2.5, borderRadius: 2.5 }}>
                  {t("admin.banThresholdOrderWarning")}
                </Alert>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                    gap: 2.5,
                  }}
                >
                  {BAN_LEVELS.map((level) => (
                    <Paper
                      key={level.label}
                      className="surface-card surface-card--subtle"
                      elevation={0}
                      sx={{
                        p: 2.5,
                        borderRadius: 3,
                        bgcolor: "#f8fafc",
                        border: "1px solid #eef2f7",
                      }}
                    >
                      <Typography
                        variant="subtitle2"
                        fontWeight="700"
                        color="#334155"
                        sx={{ mb: 2 }}
                      >
                        {t(level.labelKey)}
                      </Typography>
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 1.5,
                        }}
                      >
                        <TextField
                          type="number"
                          label={t("admin.pointThreshold")}
                          value={policy[level.threshold]}
                          onChange={(event) =>
                            handleFieldChange(
                              level.threshold,
                              event.target.value,
                            )
                          }
                          slotProps={{
                            htmlInput: { min: 1, max: 100, step: 1 },
                          }}
                        />
                        <TextField
                          type="number"
                          label={t("admin.suspensionDays")}
                          value={policy[level.days]}
                          onChange={(event) =>
                            handleFieldChange(level.days, event.target.value)
                          }
                          slotProps={{
                            htmlInput: { min: 0, max: 365, step: 1 },
                          }}
                        />
                      </Box>
                    </Paper>
                  ))}
                </Box>
              </Paper>

              <Paper
                className="surface-card surface-card--info"
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  border: "1px solid #dbeafe",
                  bgcolor: "#eff6ff",
                }}
              >
                <Box
                  sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}
                >
                  <Settings sx={{ color: "#2563eb", mt: 0.25 }} />
                  <Box>
                    <Typography
                      variant="subtitle2"
                      fontWeight="700"
                      color="#1e3a8a"
                    >
                      {t("admin.policyScope")}
                    </Typography>
                    <Typography variant="body2" color="#1e40af">
                      {t("admin.testActionsFixedPolicy")}
                    </Typography>
                  </Box>
                </Box>
              </Paper>

              <Box
                sx={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 1.5,
                  flexWrap: "wrap",
                }}
              >
                <Button
                  variant="outlined"
                  onClick={handleRestoreDefaults}
                  disabled={saving}
                  sx={{
                    borderRadius: 3,
                    textTransform: "none",
                    fontWeight: "600",
                  }}
                >
                  {t("admin.restoreDefaults")}
                </Button>
                <Button
                  variant="contained"
                  startIcon={
                    saving ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <Save />
                    )
                  }
                  onClick={handleSave}
                  disabled={saving}
                  sx={{
                    borderRadius: 3,
                    textTransform: "none",
                    fontWeight: "700",
                    px: 3,
                    boxShadow: "none",
                  }}
                >
                  {saving ? t("admin.saving") : t("admin.savePolicy")}
                </Button>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
