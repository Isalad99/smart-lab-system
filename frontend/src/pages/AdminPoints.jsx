import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputBase,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Popover,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Pagination,
} from "@mui/material";
import {
  Assessment,
  Block,
  CheckCircle,
  Close,
  Computer,
  Group,
  Lock,
  Logout,
  Notifications,
  Person,
  Refresh,
  RemoveCircleOutline,
  Restore,
  Search,
  Visibility,
  WarningAmber,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminUserDetailsDialog from "../components/AdminUserDetailsDialog";
import AdminNavigation from "../components/AdminNavigation";
import { formatDate, formatDateTime } from "../utils/dateFormat";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";
import {
  buildTestPointEndpoint,
  canRunTestPointAction,
} from "./adminPointsTestUtils";

const API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_WARNING_THRESHOLD = 20;

const EMPTY_SUMMARY = {
  total_users: 0,
  average_points: 0,
  low_point_users: 0,
  banned_users: 0,
  booking_allowed: 0,
  zero_point_users: 0,
  pending_point_requests: 0,
};

const stringToColor = (value) => {
  if (!value) return "#cbd5e1";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = value.charCodeAt(index) + ((hash << 5) - hash);
  }
  let color = "#";
  for (let index = 0; index < 3; index += 1) {
    color += `00${((hash >> (index * 8)) & 0xff).toString(16)}`.slice(-2);
  }
  return color;
};

const getInitials = (user) => {
  const initials = `${user.first_name?.[0] || ""}${user.last_name?.[0] || ""}`;
  return initials.toUpperCase() || "U";
};

const getScoreColor = (score, warningThreshold = DEFAULT_WARNING_THRESHOLD) => {
  if (score <= warningThreshold) return "#ef4444";
  if (score < 60) return "#f59e0b";
  return "#10b981";
};

const getRoleLabel = (role, t) =>
  ({
    admin: t("admin.userDetails.roleAdministrator"),
    student: t("admin.userDetails.roleStudent"),
    guest: t("admin.userDetails.roleGuest"),
  })[role] || t("admin.userDetails.roleGuest");

const getRoleColor = (role) =>
  ({
    admin: { bgcolor: "var(--role-admin-bg)", color: "var(--role-admin-text)" },
    student: {
      bgcolor: "var(--role-student-bg)",
      color: "var(--role-student-text)",
    },
    guest: { bgcolor: "var(--role-guest-bg)", color: "var(--role-guest-text)" },
  })[role] || {
    bgcolor: "var(--role-guest-bg)",
    color: "var(--role-guest-text)",
  };

const buildSummary = (userRows, warningThreshold, pendingPointRequests = 0) => {
  const scores = userRows.map((user) =>
    Math.max(0, Math.min(100, Number(user.points) || 0)),
  );
  return {
    total_users: userRows.length,
    average_points: scores.length
      ? Math.round(
          (scores.reduce((total, score) => total + score, 0) / scores.length) *
            10,
        ) / 10
      : 0,
    low_point_users: userRows.filter(
      (user) => Number(user.points) <= warningThreshold,
    ).length,
    banned_users: userRows.filter((user) => user.is_banned).length,
    booking_allowed: userRows.filter((user) => user.booking_allowed).length,
    zero_point_users: userRows.filter((user) => Number(user.points) === 0)
      .length,
    pending_point_requests: pendingPointRequests,
  };
};

export default function AdminPoints() {
  const PAGE_SIZE = 25;
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useLanguage();

  const [anchorEl, setAnchorEl] = useState(null);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [warningThreshold, setWarningThreshold] = useState(
    DEFAULT_WARNING_THRESHOLD,
  );
  const [scoreDate, setScoreDate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("pointsAsc");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetail, setUserDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [detailTab, setDetailTab] = useState(0);
  const [pointRequests, setPointRequests] = useState([]);
  const [requestActionId, setRequestActionId] = useState(null);
  const [testDeductionId, setTestDeductionId] = useState(null);
  const [testResetId, setTestResetId] = useState(null);

  const fetchPoints = useCallback(async () => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.adminLoginRequired"));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const response = await axios.get(`${API_URL}/admin/points`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          page,
          page_size: PAGE_SIZE,
          search: searchTerm || undefined,
          filter,
          sort_by: sortBy,
        },
      });
      const payload = response.data || {};
      const nextWarningThreshold = Number.isFinite(
        Number(payload.points_warning_threshold),
      )
        ? Number(payload.points_warning_threshold)
        : DEFAULT_WARNING_THRESHOLD;
      const userRows = (Array.isArray(payload.data) ? payload.data : []).filter(
        (user) => user.role !== "admin",
      );
      const pendingPointRequests = Array.isArray(payload.point_requests)
        ? payload.point_requests
        : [];
      setRows(userRows);
      setSummary(
        payload.summary ||
          buildSummary(
            userRows,
            nextWarningThreshold,
            pendingPointRequests.length,
          ),
      );
      setWarningThreshold(nextWarningThreshold);
      setScoreDate(payload.score_date || null);
      setPointRequests(pendingPointRequests);
      setTotal(Number(payload.total) || 0);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : t("admin.loadUserPointsFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [filter, page, searchTerm, sortBy, t]);

  useEffect(() => {
    document.title = `${t("admin.pointsTitle")} | Smart Lab Admin`;
  }, [t]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchTerm(searchQuery.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate("/");
  };

  const handleOpenUserDetail = async (user) => {
    const token = localStorage.getItem("access_token");
    setSelectedUser(user);
    setUserDetail(null);
    setDetailTab(0);
    setDetailError("");
    setDetailOpen(true);

    if (!token) {
      setDetailError(t("admin.userDetailLoginRequired"));
      return;
    }

    try {
      setDetailLoading(true);
      const response = await axios.get(
        `${API_URL}/admin/users/${user.user_id}/details`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      setUserDetail(response.data || null);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setDetailError(
        typeof detail === "string" ? detail : t("admin.loadUserDetailFailed"),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseUserDetail = () => {
    setDetailOpen(false);
    setDetailError("");
  };

  const handlePointRequestAction = async (requestId, action) => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.pointRequestLoginRequired"));
      return;
    }

    try {
      setRequestActionId(requestId);
      setError("");
      await axios.post(
        `${API_URL}/admin/points/requests/${requestId}/${action}`,
        null,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchPoints();
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : t("admin.pointRequestActionFailed"),
      );
    } finally {
      setRequestActionId(null);
    }
  };

  const handleTestDeduction = async (user) => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.testDeductionLoginRequired"));
      return;
    }
    if (
      !canRunTestPointAction(
        user.points,
        "deduct",
        testDeductionId === user.user_id || testResetId === user.user_id,
      )
    )
      return;
    if (
      !window.confirm(
        `${t("admin.testDeductionConfirmPrefix")} ${user.name || `${t("common.user")} #${user.user_id}`} ${t("admin.testDeductionConfirmSuffix")}`,
      )
    ) {
      return;
    }

    try {
      setTestDeductionId(user.user_id);
      setError("");
      await axios.post(
        buildTestPointEndpoint(API_URL, user.user_id, "deduct"),
        null,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchPoints();
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : t("admin.testDeductionFailed"),
      );
    } finally {
      setTestDeductionId(null);
    }
  };

  const handleTestReset = async (user) => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setError(t("admin.testResetLoginRequired"));
      return;
    }
    if (
      !canRunTestPointAction(
        user.points,
        "reset",
        testDeductionId === user.user_id || testResetId === user.user_id,
      )
    )
      return;
    if (
      !window.confirm(
        `${t("admin.testResetConfirmPrefix")} ${user.name || `${t("common.user")} #${user.user_id}`} ${t("admin.testResetConfirmSuffix")}`,
      )
    ) {
      return;
    }

    try {
      setTestResetId(user.user_id);
      setError("");
      await axios.post(
        buildTestPointEndpoint(API_URL, user.user_id, "reset"),
        null,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      await fetchPoints();
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : t("admin.testResetFailed"),
      );
    } finally {
      setTestResetId(null);
    }
  };

  const statCards = [
    {
      label: t("admin.allUsers"),
      value: summary.total_users,
      helper: t("admin.accountsInSystem"),
      color: "var(--brand-color)",
      icon: <Group />,
    },
    {
      label: t("admin.averagePoints"),
      value: `${summary.average_points}/100`,
      helper: t("admin.accumulatedPoints"),
      color: "#10b981",
      icon: <Assessment />,
    },
    {
      label: t("admin.belowThreshold"),
      value: summary.low_point_users,
      helper: `${t("admin.belowThreshold")} ${warningThreshold} ${t("common.points")}`,
      color: "#f59e0b",
      icon: <WarningAmber />,
    },
    {
      label: t("admin.bannedUsers"),
      value: summary.banned_users,
      helper: t("admin.activeBans"),
      color: "#ef4444",
      icon: <Lock />,
    },
    {
      label: t("admin.pointRequests"),
      value: summary.pending_point_requests,
      helper: t("admin.pendingUsers"),
      color: "#8b5cf6",
      icon: <Notifications />,
    },
  ];

  return (
    <Box
      className="app-layout admin-layout"
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "var(--bg-color)",
        fontFamily: "var(--font-family-ui)",
      }}
    >
      <Box
        className="sidebar admin-sidebar"
        sx={{
          width: "var(--sidebar-width)",
          bgcolor: "var(--surface-subtle)",
          borderRight: "1px solid var(--border-light)",
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
              bgcolor: "var(--brand-color)",
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
              sx={{ color: "var(--text-dark)", letterSpacing: "-0.5px" }}
            >
              Smart Lab
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "var(--text-muted)",
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
            bgcolor: "var(--surface-elevated)",
            borderBottom: "1px solid var(--border-light)",
            zIndex: 5,
          }}
        >
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "var(--text-dark)", letterSpacing: "-1px" }}
          >
            {t("admin.pointsTitle")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <NotificationBell
              className="admin-notification-button"
              iconColor="var(--text-muted)"
              loadNotifications={false}
            />
            <Divider
              orientation="vertical"
              flexItem
              sx={{ height: 30, my: "auto", bgcolor: "var(--border-light)" }}
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
                  color="var(--text-dark)"
                >
                  {t("common.systemAdmin")}
                </Typography>
                <Typography
                  variant="caption"
                  fontWeight="500"
                  color="var(--text-muted)"
                >
                  {t("common.administrator")}
                </Typography>
              </Box>
              <IconButton
                onClick={(event) => setAnchorEl(event.currentTarget)}
                aria-label={t("common.openMenu")}
                sx={{ p: 0.8, "&:hover": { bgcolor: "var(--surface-subtle)" } }}
              >
                <Avatar
                  sx={{
                    bgcolor: "var(--text-dark)",
                    color: "var(--brand-contrast)",
                    width: 36,
                    height: 36,
                  }}
                >
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
              mb: 4,
              flexWrap: "wrap",
            }}
          >
            <Box className="page-header__copy">
              <Typography
                variant="h4"
                fontWeight="700"
                color="var(--text-dark)"
                sx={{ letterSpacing: "-1px" }}
              >
                {t("admin.userPointsHeading")}
              </Typography>
              <Typography
                variant="body2"
                color="var(--text-gray)"
                sx={{ mt: 0.75 }}
              >
                {t("admin.pointsPageDescription")}
              </Typography>
              <Typography
                variant="caption"
                color="var(--text-muted)"
                sx={{ display: "block", mt: 0.5 }}
              >
                {t("admin.pointSummaryDate")}{" "}
                {formatDate(scoreDate, t("common.locale"))} ·{" "}
                {t("admin.bookingDependsOnBan")}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchPoints}
              disabled={loading}
              sx={{
                borderRadius: 3,
                textTransform: "none",
                fontWeight: "600",
                borderColor: "var(--border-light)",
                color: "var(--brand-color)",
              }}
            >
              {t("admin.refreshData")}
            </Button>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
              {error}
            </Alert>
          )}

          {pointRequests.length > 0 && (
            <Alert
              severity="warning"
              icon={<Notifications />}
              sx={{ mb: 3, borderRadius: 3, alignItems: "flex-start" }}
            >
              <Box sx={{ width: "100%" }}>
                <Typography
                  fontWeight="700"
                  color="var(--warning-color)"
                  sx={{ mb: 1 }}
                >
                  {t("admin.pointRequests")} {pointRequests.length}{" "}
                  {t("admin.pointRequestsCount")}
                </Typography>
                <Box
                  sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}
                >
                  {pointRequests.map((request) => (
                    <Box
                      key={request.id}
                      sx={{
                        display: "flex",
                        alignItems: { xs: "flex-start", sm: "center" },
                        justifyContent: "space-between",
                        gap: 2,
                        flexWrap: "wrap",
                        p: 1.5,
                        bgcolor: "var(--surface-subtle)",
                        borderRadius: 2.5,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          fontWeight="700"
                          color="var(--text-dark)"
                        >
                          {request.name ||
                            `${t("common.user")} #${request.user_id}`}{" "}
                          · {t("admin.requestPoints")}{" "}
                          {request.requested_points || 10} {t("common.points")}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="var(--text-gray)"
                          sx={{ overflowWrap: "anywhere" }}
                        >
                          {request.email ||
                            `${t("common.userId")} #${request.user_id}`}{" "}
                          ·{t("admin.requestSentAt")}{" "}
                          {formatDateTime(
                            request.created_at,
                            t("common.locale"),
                          )}
                        </Typography>
                      </Box>
                      <Box sx={{ display: "flex", gap: 1, flexShrink: 0 }}>
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          startIcon={<CheckCircle />}
                          disabled={requestActionId === request.id}
                          onClick={() =>
                            handlePointRequestAction(request.id, "approve")
                          }
                          sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: "700",
                            boxShadow: "none",
                          }}
                        >
                          {t("common.approved")} +
                          {request.requested_points || 10}
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          startIcon={<Close />}
                          disabled={requestActionId === request.id}
                          onClick={() =>
                            handlePointRequestAction(request.id, "reject")
                          }
                          sx={{
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: "700",
                          }}
                        >
                          {t("common.failed")}
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              </Box>
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 2.5,
              mb: 4,
            }}
          >
            {statCards.map((card) => (
              <Paper
                key={card.label}
                className="surface-card"
                elevation={0}
                sx={{
                  p: 3,
                  borderRadius: 4,
                  border: "1px solid var(--border-light)",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: card.color,
                    width: 48,
                    height: 48,
                    borderRadius: 3,
                  }}
                >
                  {card.icon}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    fontWeight="600"
                    color="var(--text-gray)"
                  >
                    {card.label}
                  </Typography>
                  <Typography
                    variant="h5"
                    fontWeight="700"
                    color="var(--text-dark)"
                  >
                    {card.value}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="var(--text-muted)"
                    noWrap
                  >
                    {card.helper}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>

          <Paper
            className="surface-card data-table-shell"
            elevation={0}
            sx={{
              borderRadius: 4,
              border: "1px solid var(--border-light)",
              overflow: "hidden",
            }}
          >
            <Box
              className="filter-bar"
              sx={{
                p: { xs: 2.5, md: 3 },
                display: "flex",
                alignItems: { xs: "stretch", md: "center" },
                gap: 2,
                flexWrap: "wrap",
                borderBottom: "1px solid var(--border-light)",
              }}
            >
              <Box
                className="search-control"
                sx={{
                  flex: 1,
                  minWidth: 240,
                  display: "flex",
                  alignItems: "center",
                  px: 1.5,
                  py: 0.5,
                }}
              >
                <Search sx={{ color: "var(--text-muted)", mr: 1 }} />
                <InputBase
                  fullWidth
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("admin.searchUsers")}
                  sx={{ fontSize: "14px", fontWeight: "400" }}
                  inputProps={{ "aria-label": t("admin.searchUsers") }}
                />
              </Box>
              <FormControl
                className="admin-filter-control"
                size="small"
                sx={{ minWidth: 170 }}
              >
                <InputLabel id="points-filter-label">
                  {t("admin.pointFilter")}
                </InputLabel>
                <Select
                  labelId="points-filter-label"
                  value={filter}
                  label={t("admin.pointFilter")}
                  onChange={(event) => {
                    setFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="all">{t("admin.allUsersFilter")}</MenuItem>
                  <MenuItem value="low">{t("admin.lowPoints")}</MenuItem>
                  <MenuItem value="banned">{t("admin.bookingBanned")}</MenuItem>
                  <MenuItem value="allowed">
                    {t("admin.bookingAllowed")}
                  </MenuItem>
                </Select>
              </FormControl>
              <FormControl
                className="admin-filter-control"
                size="small"
                sx={{ minWidth: 170 }}
              >
                <InputLabel id="points-sort-label">
                  {t("admin.pointSort")}
                </InputLabel>
                <Select
                  labelId="points-sort-label"
                  value={sortBy}
                  label={t("admin.pointSort")}
                  onChange={(event) => {
                    setSortBy(event.target.value);
                    setPage(1);
                  }}
                >
                  <MenuItem value="pointsAsc">
                    {t("admin.pointsAscending")}
                  </MenuItem>
                  <MenuItem value="pointsDesc">
                    {t("admin.pointsDescending")}
                  </MenuItem>
                  <MenuItem value="name">{t("admin.userNameSort")}</MenuItem>
                </Select>
              </FormControl>
            </Box>

            {loading ? (
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  minHeight: 280,
                }}
              >
                <CircularProgress />
              </Box>
            ) : (
              <TableContainer
                sx={{
                  maxHeight: { xs: "55vh", md: "58vh" },
                  overflowX: "auto",
                  overflowY: "auto",
                  overscrollBehavior: "contain",
                  "& .MuiTableHead-root": {
                    position: "sticky",
                    top: 0,
                    zIndex: 2,
                  },
                }}
              >
                <Table sx={{ minWidth: 1160 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: "var(--surface-subtle)" }}>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                        }}
                      >
                        {t("common.user")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                        }}
                      >
                        {t("common.role")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                          minWidth: 190,
                        }}
                      >
                        {t("admin.accumulatedPoints")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                          minWidth: 140,
                        }}
                      >
                        {t("admin.dailyPoints")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                        }}
                      >
                        {t("admin.bookingRights")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                        }}
                      >
                        {t("admin.lastUpdated")}
                      </TableCell>
                      <TableCell
                        sx={{
                          color: "var(--text-gray)",
                          fontWeight: "700",
                          py: 2,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t("common.actions")}
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          align="center"
                          sx={{ py: 8, color: "var(--text-muted)" }}
                        >
                          {t("admin.pointsTableEmpty")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((user) => {
                        const points = Math.max(
                          0,
                          Math.min(100, Number(user.points) || 0),
                        );
                        const dailyScore = Math.max(
                          0,
                          Math.min(100, Number(user.daily_score) || 0),
                        );
                        const scoreColor = getScoreColor(
                          points,
                          warningThreshold,
                        );
                        const roleColor = getRoleColor(user.role);
                        const testActionBusy =
                          testDeductionId === user.user_id ||
                          testResetId === user.user_id;
                        return (
                          <TableRow
                            key={user.user_id}
                            hover
                            sx={{
                              "& td": {
                                borderBottom: "1px solid var(--border-light)",
                              },
                              "&:hover": { bgcolor: "var(--surface-subtle)" },
                            }}
                          >
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                  minWidth: 230,
                                }}
                              >
                                <Avatar
                                  sx={{
                                    bgcolor: stringToColor(user.name),
                                    width: 40,
                                    height: 40,
                                    fontSize: "14px",
                                    fontWeight: "700",
                                  }}
                                >
                                  {getInitials(user)}
                                </Avatar>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography
                                    variant="subtitle2"
                                    fontWeight="700"
                                    color="var(--text-dark)"
                                    noWrap
                                  >
                                    {user.name || t("common.unknownName")}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="var(--text-gray)"
                                    display="block"
                                    noWrap
                                  >
                                    {user.email}
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="var(--text-muted)"
                                  >
                                    {t("common.userId")} #{user.user_id}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={getRoleLabel(user.role, t)}
                                size="small"
                                sx={{
                                  bgcolor: roleColor.bgcolor,
                                  color: roleColor.color,
                                  fontWeight: "700",
                                }}
                              />
                            </TableCell>
                            <TableCell>
                              <Box sx={{ minWidth: 165 }}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                    mb: 0.75,
                                  }}
                                >
                                  <Typography
                                    fontWeight="700"
                                    color={scoreColor}
                                    className="theme-colored"
                                  >
                                    {points}/100
                                  </Typography>
                                  <Typography
                                    variant="caption"
                                    color="var(--text-muted)"
                                  >
                                    {t("admin.warningWhenAtMost")}{" "}
                                    {warningThreshold}
                                  </Typography>
                                </Box>
                                <LinearProgress
                                  variant="determinate"
                                  value={points}
                                  aria-label={`${t("admin.accumulatedPoints")} ${points} / 100`}
                                  sx={{
                                    height: 7,
                                    borderRadius: 4,
                                    bgcolor: "var(--surface-subtle)",
                                    "& .MuiLinearProgress-bar": {
                                      bgcolor: scoreColor,
                                      borderRadius: 4,
                                    },
                                  }}
                                />
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ minWidth: 115 }}>
                                <Typography
                                  fontWeight="700"
                                  color="var(--text-dark)"
                                >
                                  {dailyScore}/100
                                </Typography>
                                <LinearProgress
                                  variant="determinate"
                                  value={dailyScore}
                                  aria-label={`${t("admin.dailyPoints")} ${dailyScore} / 100`}
                                  sx={{
                                    mt: 0.75,
                                    height: 6,
                                    borderRadius: 4,
                                    bgcolor: "var(--surface-subtle)",
                                    "& .MuiLinearProgress-bar": {
                                      bgcolor: "var(--brand-color)",
                                      borderRadius: 4,
                                    },
                                  }}
                                />
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  gap: 0.75,
                                }}
                              >
                                <Chip
                                  icon={
                                    user.booking_allowed ? (
                                      <CheckCircle />
                                    ) : (
                                      <Block />
                                    )
                                  }
                                  label={
                                    user.booking_allowed
                                      ? t("admin.bookingAllowed")
                                      : t("admin.bookingBanned")
                                  }
                                  size="small"
                                  sx={{
                                    bgcolor: user.booking_allowed
                                      ? "#ecfdf5"
                                      : "#fef2f2",
                                    color: user.booking_allowed
                                      ? "#047857"
                                      : "#b91c1c",
                                    fontWeight: "700",
                                    "& .MuiChip-icon": {
                                      color: "inherit",
                                      fontSize: 16,
                                    },
                                  }}
                                />
                                {user.is_banned && (
                                  <Typography
                                    variant="caption"
                                    color="var(--danger-color)"
                                    fontWeight="600"
                                    className="theme-colored"
                                  >
                                    {t("common.bannedUntil")}{" "}
                                    {formatDate(
                                      user.ban_until,
                                      t("common.locale"),
                                    )}
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell
                              sx={{
                                color: "var(--text-gray)",
                                fontSize: "13px",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatDateTime(
                                user.updated_at,
                                t("common.locale"),
                              )}
                            </TableCell>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  gap: 0.75,
                                }}
                              >
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  startIcon={<RemoveCircleOutline />}
                                  disabled={
                                    !canRunTestPointAction(
                                      points,
                                      "deduct",
                                      testActionBusy,
                                    )
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleTestDeduction(user);
                                  }}
                                  sx={{
                                    borderRadius: 2.5,
                                    textTransform: "none",
                                    fontWeight: "600",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {testDeductionId === user.user_id
                                    ? t("admin.reducingPoints")
                                    : t("admin.reducePointsTest")}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="success"
                                  startIcon={<Restore />}
                                  disabled={
                                    !canRunTestPointAction(
                                      points,
                                      "reset",
                                      testActionBusy,
                                    )
                                  }
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleTestReset(user);
                                  }}
                                  sx={{
                                    borderRadius: 2.5,
                                    textTransform: "none",
                                    fontWeight: "600",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {testResetId === user.user_id
                                    ? t("admin.resettingPoints")
                                    : t("admin.resetPointsTest")}
                                </Button>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<Visibility />}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenUserDetail(user);
                                  }}
                                  sx={{
                                    borderRadius: 2.5,
                                    textTransform: "none",
                                    fontWeight: "600",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {t("admin.viewDetails")}
                                </Button>
                              </Box>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {!loading && (
              <Box
                sx={{
                  px: 3,
                  py: 2,
                  borderTop: "1px solid var(--border-light)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 2,
                  flexWrap: "wrap",
                }}
              >
                <Typography
                  variant="caption"
                  color="var(--text-gray)"
                  fontWeight="500"
                >
                  {t("admin.showing")} {rows.length} {t("admin.of")} {total}{" "}
                  {t("admin.users")}
                </Typography>
                <Typography variant="caption" color="var(--text-muted)">
                  {t("admin.maxPointsHint")}
                </Typography>
                {total > PAGE_SIZE && (
                  <Pagination
                    count={Math.max(1, Math.ceil(total / PAGE_SIZE))}
                    page={page}
                    onChange={(_, nextPage) => setPage(nextPage)}
                    color="primary"
                    size="small"
                  />
                )}
              </Box>
            )}
          </Paper>
        </Box>
      </Box>
      <AdminUserDetailsDialog
        open={detailOpen}
        onClose={handleCloseUserDetail}
        selectedUser={selectedUser}
        detail={userDetail}
        loading={detailLoading}
        error={detailError}
        tab={detailTab}
        onTabChange={(_, nextTab) => setDetailTab(nextTab)}
      />
    </Box>
  );
}
