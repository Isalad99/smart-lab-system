// ============================================================================
// 1. IMPORTS & CONFIGURATION
// ============================================================================
import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Paper,
  Button,
  GridLegacy as Grid,
  Divider,
  Slide,
  Fade,
  Chip,
  Alert,
  Dialog,
  DialogContent,
  Popover,
  Badge,
} from "@mui/material";
import {
  Search,
  Notifications,
  EventNote,
  Assignment,
  History,
  SupportAgent,
  ConfirmationNumber,
  Logout,
  Computer,
  Person,
  ChevronLeft,
  ChevronRight,
  PeopleAlt,
  Computer as PcIcon,
  Menu as MenuIcon,
  ArrowBack,
  CheckCircle,
  Settings,
  Close,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import { useLanguage } from "../context/language-context.js";
import { formatDateTime } from "../utils/dateFormat";
import { getPointReasonLabel } from "../utils/pointReason";
import {
  getLabCalendarDate,
  getLabDateReference,
  getLabNowParts,
  getLabNowReference,
} from "../utils/labTime";
import SupportModal from "./SupportModal";

// API Endpoint configuration
const API_URL = import.meta.env.VITE_API_URL;

// Mapping for display texts
const SLOT_DISPLAY_MAPPING = {
  1: "08:40 - 11:00 AM",
  2: "12:00 - 14:20 PM",
  3: "14:30 - 16:50 PM",
  4: "17:00 - 19:20 PM",
};

// Mapping for actual time calculation logic
const SLOT_TIMES = {
  1: { hours: 8, minutes: 40 },
  2: { hours: 12, minutes: 0 },
  3: { hours: 14, minutes: 30 },
  4: { hours: 17, minutes: 0 },
};

// Admin point actions stay available in the Profile audit history, but do not
// appear in the User notification bell.
const HIDDEN_POINT_NOTIFICATION_REASONS = new Set([
  "admin_grant",
  "admin_test_deduction",
  "admin_test_reset",
]);

// localStorage key prefix used to remember which point-log notification the user last saw
const LAST_SEEN_POINT_LOG_KEY = "last_seen_point_log_id";

// ============================================================================
// 2. MAIN COMPONENT
// ============================================================================
export default function Booking() {
  // Contexts & Hooks
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();

  // ============================================================================
  // 3. STATE MANAGEMENT
  // ============================================================================

  // UI States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [successDialogOpen, setSuccessDialogOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  // Data States
  const [labs, setLabs] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [pointStatus, setPointStatus] = useState(null);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointLogs, setPointLogs] = useState([]);
  const [lastSeenLogId, setLastSeenLogId] = useState(
    () => Number(localStorage.getItem(LAST_SEEN_POINT_LOG_KEY)) || 0,
  );
  const [pointsError, setPointsError] = useState("");
  const [pointRequestLoading, setPointRequestLoading] = useState(false);

  // Selection States
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [currentDateObj, setCurrentDateObj] = useState(getLabCalendarDate);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);

  // ============================================================================
  // 4. LIFECYCLE & API CALLS
  // ============================================================================

  /**
   * Fetches all available lab rooms from the backend.
   */
  const fetchLabs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/labs`);
      setLabs(response.data.data);
    } catch (error) {
      console.error("[API Error] Failed to fetch labs:", error);
      alert(t("user.unableToFetchLabs"));
    }
  }, [t]);

  // Fetch labs on component mount
  useEffect(() => {
    // This effect intentionally loads remote data and updates state asynchronously.
    fetchLabs();
  }, [fetchLabs]);

  useEffect(() => {
    if (!currentUser?.email) {
      setPointStatus(null);
      setPointsError("");
      return undefined;
    }

    let cancelled = false;
    const token = localStorage.getItem("access_token");
    setPointsLoading(true);
    setPointsError("");

    axios
      .get(`${API_URL}/users/me/points`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((response) => {
        if (!cancelled) setPointStatus(response.data);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("[API Error] Failed to fetch point status:", error);
        setPointStatus(null);
        setPointsError(t("user.unableToCheckPoints"));
      })
      .finally(() => {
        if (!cancelled) setPointsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.email, t]);

  // Fetch recent point-change history to populate the notification bell.
  useEffect(() => {
    if (!currentUser?.email) {
      setPointLogs([]);
      return undefined;
    }

    const token = localStorage.getItem("access_token");

    // สร้างฟังก์ชันสำหรับดึงประวัติแจ้งเตือน
    const fetchPointLogs = async () => {
      try {
        const response = await axios.get(
          `${API_URL}/users/me/points/logs?limit=10&notifications_only=true`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        setPointLogs(response.data?.data || []);
      } catch (error) {
        console.error("[API Error] Failed to fetch point logs:", error);
      }
    };

    // 1. เรียกทำงานทันที 1 ครั้งเมื่อเข้าหน้าเว็บ
    fetchPointLogs();

    // 2. ตั้งเวลาให้ดึงข้อมูลใหม่ทุกๆ 15,000 มิลลิวินาที (15 วินาที)
    const intervalId = setInterval(fetchPointLogs, 15000);

    // 3. ล้าง Interval เมื่อออกจากหน้าเพื่อป้องกัน Memory Leak
    return () => {
      clearInterval(intervalId);
    };
  }, [currentUser?.email]);

  /**
   * Fetches availability for a specific lab room on a given date.
   * @param {number} labId - The ID of the selected lab
   * @param {number} year - The selected year
   * @param {number} monthIndex - The selected month (0-11)
   * @param {number} dayNumber - The selected day (1-31)
   */
  const fetchAvailability = async (labId, year, monthIndex, dayNumber) => {
    const dateStr = getFormattedDateString(year, monthIndex, dayNumber);
    try {
      const response = await axios.get(
        `${API_URL}/labs/${labId}/availability`,
        {
          params: { target_date: dateStr },
        },
      );
      setAvailability(response.data.slots);
    } catch (error) {
      console.error("[API Error] Failed to fetch availability:", error);
      alert(t("user.unableToFetchSchedule"));
      setAvailability(null);
    }
  };

  // ============================================================================
  // 5. MEMOIZATION & COMPUTED VALUES
  // ============================================================================

  /** * Filters the lab list based on the search query.
   */
  const filteredLabs = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return labs.filter(
      (lab) =>
        (lab.name?.toLowerCase() || "").includes(query) ||
        (lab.code?.toLowerCase() || "").includes(query) ||
        (lab.location?.toLowerCase() || "").includes(query),
    );
  }, [labs, searchQuery]);

  // Date Math for Calendar Rendering
  const currentYear = currentDateObj.getFullYear();
  const currentMonth = currentDateObj.getMonth();
  const daysInMonth = new Date(
    Date.UTC(currentYear, currentMonth + 1, 0),
  ).getUTCDate();
  const firstDayOfMonthJS = new Date(
    Date.UTC(currentYear, currentMonth, 1),
  ).getUTCDay();

  // Shift Sunday (0) to the end to start the calendar on Monday
  const emptySlots = firstDayOfMonthJS === 0 ? 6 : firstDayOfMonthJS - 1;

  const locale = t("common.locale");
  const monthName = currentDateObj.toLocaleString(locale, { month: "long" });
  const monthNameShort = currentDateObj.toLocaleString(locale, {
    month: "short",
  });

  /**
   * Formats year, month, and day into YYYY-MM-DD string format.
   */
  const getFormattedDateString = useCallback((year, monthIndex, day) => {
    const padMonth = String(monthIndex + 1).padStart(2, "0");
    const padDay = String(day).padStart(2, "0");
    return `${year}-${padMonth}-${padDay}`;
  }, []);

  /**
   * Validates if the selected time slot can be booked based on the 2-hour advance rule.
   * @returns {"valid" | "passed" | "too_close"}
   */
  const checkSlotTimeValidity = (slotNumber) => {
    if (!selectedDate) return "valid";

    const { year: labYear, month: labMonth, day: labDay } = getLabNowParts();
    const selectedDateReference = getLabDateReference(
      currentYear,
      currentMonth,
      selectedDate,
    );
    const todayReference = getLabDateReference(labYear, labMonth - 1, labDay);

    if (selectedDateReference > todayReference) return "valid";

    const slotTimeReference = getLabDateReference(
      currentYear,
      currentMonth,
      selectedDate,
      SLOT_TIMES[slotNumber].hours,
      SLOT_TIMES[slotNumber].minutes,
    );
    const nowReference = getLabNowReference();

    if (slotTimeReference <= nowReference) return "passed";

    if (slotTimeReference < nowReference + 2 * 60 * 60 * 1000) {
      return "too_close";
    }

    return "valid";
  };

  // ============================================================================
  // 6. ACTION HANDLERS
  // ============================================================================

  /**
   * Clears the current selection states during the booking process.
   */
  const resetSelections = () => {
    setSelectedDate(null);
    setSelectedTimeSlot(null);
    setAvailability(null);
  };

  const handlePrevMonth = () => {
    setCurrentDateObj(new Date(currentYear, currentMonth - 1, 1));
    resetSelections();
  };

  const handleNextMonth = () => {
    setCurrentDateObj(new Date(currentYear, currentMonth + 1, 1));
    resetSelections();
  };

  const handleSelectRoom = (room) => {
    if (room.status !== "active") return;
    setSelectedRoom(room);
    setSearchQuery("");
    resetSelections();
  };

  const handleBackToRooms = () => {
    setSelectedRoom(null);
    resetSelections();
  };

  const handleSelectDate = (dayNumber) => {
    setSelectedDate(dayNumber);
    setSelectedTimeSlot(null);
    setAvailability(null);
    fetchAvailability(selectedRoom.id, currentYear, currentMonth, dayNumber);
  };

  /**
   * Sends the booking payload to the backend API.
   */
  const handleConfirmBooking = async () => {
    if (!selectedDate || !selectedTimeSlot) return;

    const dateStr = getFormattedDateString(
      currentYear,
      currentMonth,
      selectedDate,
    );

    try {
      const payload = {
        lab_id: selectedRoom.id,
        booking_date: dateStr,
        slot_number: selectedTimeSlot,
        purpose: t("user.generalUsagePurpose"),
        total_participants: 1,
      };

      const token = localStorage.getItem("access_token");
      await axios.post(`${API_URL}/bookings`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSuccessDialogOpen(true);
    } catch (error) {
      const detail = error.response?.data?.detail;
      const errMsg =
        (typeof detail === "string" ? detail : detail?.message) ||
        t("user.bookingFailed");
      alert(`${t("user.bookingFailed")}: ${errMsg}`);
    }
  };

  const handlePointRequest = async () => {
    const token = localStorage.getItem("access_token");
    if (
      !token ||
      Number(pointStatus?.points) !== 0 ||
      pointStatus?.point_request?.status === "pending"
    ) {
      return;
    }

    try {
      setPointRequestLoading(true);
      const response = await axios.post(
        `${API_URL}/users/me/points/request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const request = response.data?.point_request;
      if (request) {
        setPointStatus((currentStatus) => ({
          ...currentStatus,
          point_request: request,
          can_request_points: false,
        }));
      }
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      const message =
        typeof detail === "string" ? detail : t("user.pointRequestFailed");
      alert(message);
    } finally {
      setPointRequestLoading(false);
    }
  };

  const handleCloseSuccessDialog = () => {
    setSuccessDialogOpen(false);
    handleBackToRooms();
  };

  // Add User Menu Popover States
  const [anchorEl, setAnchorEl] = useState(null);
  const openUserMenu = Boolean(anchorEl);

  const handleAvatarClick = (e) => setAnchorEl(e.currentTarget);
  const handleCloseUserMenu = () => setAnchorEl(null);

  const handleLogoutAction = () => {
    handleCloseUserMenu();
    logout();
    navigate("/");
  };

  // Add Notification Popover States (UI only - no data yet)
  const [notifAnchorEl, setNotifAnchorEl] = useState(null);
  const openNotifMenu = Boolean(notifAnchorEl);

  const visiblePointLogs = useMemo(
    () =>
      pointLogs.filter(
        (log) => !HIDDEN_POINT_NOTIFICATION_REASONS.has(log.reason),
      ),
    [pointLogs],
  );

  const handleNotifClick = (e) => {
    setNotifAnchorEl(e.currentTarget);
    // Mark all currently loaded point-change notifications as seen.
    if (visiblePointLogs.length > 0) {
      const latestId = Math.max(...visiblePointLogs.map((log) => log.id));
      if (latestId > lastSeenLogId) {
        setLastSeenLogId(latestId);
        localStorage.setItem(LAST_SEEN_POINT_LOG_KEY, String(latestId));
      }
    }
  };
  const handleCloseNotifMenu = () => setNotifAnchorEl(null);

  // Notifications are derived from the user's point-change history.
  const notifications = useMemo(
    () =>
      visiblePointLogs.map((log) => {
        const isPositive = log.change > 0;
        const reasonLabel = getPointReasonLabel(log.reason, t);
        return {
          id: log.id,
          title: `${reasonLabel} ${isPositive ? "+" : ""}${log.change} ${t("common.points")}`,
          subtitle: log.note || "—",
          time: formatDateTime(log.created_at, t("common.locale"), {
            fallback: "—",
            includeSeconds: true,
          }),
          color: isPositive ? "#16a34a" : "#dc2626",
          iconText: isPositive ? "+" : "-",
          unread: log.id > lastSeenLogId,
        };
      }),
    [visiblePointLogs, lastSeenLogId, t],
  );

  // ============================================================================
  // 7. RENDER HELPERS
  // ============================================================================

  // Date validation setup for calendar rendering
  const { year: labYear, month: labMonth, day: labDay } = getLabNowParts();
  const todayMidnightForCalendar = getLabDateReference(
    labYear,
    labMonth - 1,
    labDay,
  );
  const maxDateMidnight = todayMidnightForCalendar + 2 * 24 * 60 * 60 * 1000;

  // ============================================================================
  // 8. RENDER UI
  // ============================================================================
  return (
    <div className="app-layout">
      {/* OVERLAY (Mobile) */}
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* SIDEBAR */}
      <div className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <Computer sx={{ fontSize: 40, color: "#1877f2" }} />
          <div>
            <Typography variant="h6" fontWeight="600" lineHeight={1.2}>
              <span className="font-baseline-text">Smart Lab</span>
            </Typography>
            <Typography variant="caption" color="textSecondary">
              <span className="font-baseline-text">
                {t("common.brandTagline")}
              </span>
            </Typography>
          </div>
        </div>

        <div className="sidebar-menu">
          <div
            className="menu-item active"
            onClick={() => setIsSidebarOpen(false)}
          >
            <EventNote />{" "}
            <span className="font-baseline-text">{t("common.labReserve")}</span>
          </div>
          <div className="menu-item" onClick={() => navigate("/reserved")}>
            <Assignment />{" "}
            <span className="font-baseline-text">{t("common.reserved")}</span>
          </div>
          <div className="menu-item" onClick={() => navigate("/history")}>
            <History />{" "}
            <span className="font-baseline-text">{t("common.history")}</span>
          </div>
          <div className="menu-item" onClick={() => navigate("/my-tickets")}>
            <ConfirmationNumber />{" "}
            <span className="font-baseline-text">{t("common.myTickets")}</span>
          </div>
        </div>

        <div
          className="sidebar-menu"
          style={{ flex: "none", paddingBottom: "24px" }}
        >
          <div className="menu-item" onClick={() => setIsSupportOpen(true)}>
            <SupportAgent />{" "}
            <span className="font-baseline-text">{t("common.support")}</span>
          </div>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="main-area">
        {/* HEADER */}
        <div className="top-header">
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <IconButton
              sx={{ display: { xs: "block", md: "none" }, color: "#111827" }}
              onClick={() => setIsSidebarOpen(true)}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h5"
              fontWeight="700"
              color="#111827"
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              <span className="font-baseline-text">{t("user.pageTitle")}</span>
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1, sm: 3 },
            }}
          >
            <div className="search-bar">
              <Search sx={{ color: "#94a3b8" }} />
              <input
                type="text"
                placeholder={t("user.searchRooms")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={!!selectedRoom}
              />
            </div>
            <IconButton sx={{ display: { xs: "block", md: "none" } }}>
              <Search sx={{ color: "#111827" }} />
            </IconButton>
            <IconButton
              className="header-notification-button"
              onClick={handleNotifClick}
              aria-label={t("common.notifications")}
            >
              <Badge
                variant="dot"
                color="error"
                overlap="circular"
                invisible={!notifications.some((n) => n.unread)}
              >
                <Notifications sx={{ color: "#111827" }} />
              </Badge>
            </IconButton>

            {/* Notification Popover */}
            <Popover
              anchorEl={notifAnchorEl}
              open={openNotifMenu}
              onClose={handleCloseNotifMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
              PaperProps={{
                sx: {
                  mt: 1.5,
                  width: 380,
                  maxWidth: "92vw",
                  maxHeight: 520,
                  borderRadius: 3,
                  bgcolor: "var(--card-bg)",
                  color: "var(--text-dark)",
                  border: "1px solid var(--border-light)",
                  boxShadow: "0 20px 45px rgba(15,23,42,0.35)",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                },
              }}
            >
              {/* Header */}
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 2.5,
                  py: 2,
                  flexShrink: 0,
                }}
              >
                <Typography fontSize="16px" fontWeight="600">
                  {t("common.notifications")}
                </Typography>
              </Box>

              {/* Scrollable notification list */}
              <Box sx={{ overflowY: "auto", px: 1, pb: 1 }}>
                {notifications.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: "center" }}>
                    <Typography
                      fontSize="13px"
                      sx={{ color: "var(--text-gray)" }}
                    >
                      {t("common.noNotifications")}
                    </Typography>
                  </Box>
                ) : (
                  notifications.map((n) => (
                    <Box
                      key={n.id}
                      sx={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 1.5,
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "var(--surface-subtle)" },
                      }}
                    >
                      {/* Unread dot */}
                      <Box sx={{ pt: 1.2 }}>
                        {n.unread ? (
                          <Box
                            sx={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              bgcolor: "#2563eb",
                            }}
                          />
                        ) : (
                          <Box sx={{ width: 8, height: 8 }} />
                        )}
                      </Box>

                      <Avatar
                        sx={{
                          bgcolor: n.color,
                          width: 36,
                          height: 36,
                          fontSize: 14,
                        }}
                      >
                        {n.iconText}
                      </Avatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          fontSize="13.5px"
                          fontWeight="500"
                          sx={{
                            color: "var(--text-dark)",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {n.title}
                        </Typography>
                        <Typography
                          fontSize="12px"
                          sx={{ color: "var(--text-gray)", mt: 0.3 }}
                        >
                          {n.subtitle}
                        </Typography>
                        <Typography
                          fontSize="12px"
                          sx={{ color: "var(--text-muted)", mt: 0.3 }}
                        >
                          {n.time}
                        </Typography>
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </Popover>

            {/* Profile Section */}
            {currentUser ? (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  borderLeft: "1px solid #e2e8f0",
                  pl: { xs: 1, sm: 3 },
                }}
              >
                {/* ข้อความชื่อผู้ใช้ */}
                <Box
                  className="profile-text-container"
                  sx={{ textAlign: "right" }}
                >
                  <Typography
                    variant="subtitle2"
                    fontWeight="600"
                    lineHeight={1.2}
                  >
                    <span className="font-baseline-text">
                      {currentUser.name}
                    </span>
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    <span className="font-baseline-text">
                      {currentUser.role}
                    </span>
                  </Typography>
                </Box>

                {/* ปุ่ม Avatar สำหรับกดเปิด Popover */}
                <IconButton
                  onClick={handleAvatarClick}
                  sx={{ p: 0.5, "&:hover": { bgcolor: "#f1f5f9" } }}
                >
                  <Avatar
                    className="profile-avatar"
                    sx={{
                      bgcolor: "#111827",
                      width: 36,
                      height: 36,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    <span className="avatar-initial">
                      {currentUser.initial || currentUser.name?.charAt(0)}
                    </span>
                  </Avatar>
                </IconButton>

                {/* Popover Card */}
                <Popover
                  anchorEl={anchorEl}
                  open={openUserMenu}
                  onClose={handleCloseUserMenu}
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
                      {currentUser.email}
                    </Typography>
                    <IconButton size="small" onClick={handleCloseUserMenu}>
                      <Close sx={{ fontSize: 18, color: "#64748b" }} />
                    </IconButton>
                  </Box>

                  {/* Profile Main Body */}
                  <Box sx={{ textAlign: "center", px: 3, pb: 3, pt: 0.5 }}>
                    <Avatar
                      className="profile-avatar profile-avatar--large"
                      sx={{
                        bgcolor: "#0f172a",
                        width: 84,
                        height: 84,
                        mx: "auto",
                        fontSize: "32px",
                        boxShadow:
                          "0 0 0 4px #eff6ff, 0 8px 20px rgba(59,130,246,0.25)",
                      }}
                    >
                      <span className="avatar-initial">
                        {currentUser.initial || currentUser.name?.charAt(0)}
                      </span>
                    </Avatar>

                    <Typography
                      sx={{ mt: 1.5, color: "#1e293b" }}
                      fontWeight="600"
                      fontSize="18px"
                    >
                      {t("common.greeting")}, {currentUser.name}
                    </Typography>

                    <Button
                      variant="outlined"
                      onClick={() => {
                        handleCloseUserMenu();
                        navigate("/profile");
                      }}
                      sx={{
                        mt: 2,
                        borderRadius: 20,
                        textTransform: "none",
                        fontWeight: "600",
                        fontSize: "13px",
                        px: 2.5,
                        py: 0.6,
                        color: "#3b82f6",
                        borderColor: "#cbd8f5",
                        "&:hover": {
                          borderColor: "#3b82f6",
                          bgcolor: "#eff6ff",
                        },
                      }}
                    >
                      {t("common.manageAccount")}
                    </Button>
                  </Box>

                  <Divider />

                  {/* Menu Action List */}
                  <Box sx={{ px: 1, py: 1 }}>
                    <Box
                      onClick={handleLogoutAction}
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
            ) : (
              /* กรณี Guest User (กดแล้วพาไปหน้า Login) */
              <Box
                onClick={() => navigate("/")}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  borderLeft: "1px solid #e2e8f0",
                  pl: { xs: 1, sm: 3 },
                  cursor: "pointer",
                  transition: "0.2s",
                  "&:hover": { opacity: 0.7 },
                }}
              >
                <Box
                  className="profile-text-container"
                  sx={{ textAlign: "right" }}
                >
                  <Typography
                    variant="subtitle2"
                    fontWeight="600"
                    lineHeight={1.2}
                    color="textSecondary"
                  >
                    {t("common.guestUser")}
                  </Typography>
                  <Typography variant="caption" color="primary.main">
                    {t("common.login")}
                  </Typography>
                </Box>
                <Avatar sx={{ bgcolor: "#cbd5e1", width: 36, height: 36 }}>
                  <Person sx={{ color: "#64748b" }} />
                </Avatar>
              </Box>
            )}
          </Box>
        </div>

        {/* CONTENT AREA */}
        <div
          className="content-area page-content"
          style={{ position: "relative", overflowX: "hidden" }}
        >
          {/* VIEW 1: ROOM SELECTION */}
          {!selectedRoom && (
            <Fade in={!selectedRoom} timeout={400}>
              <Box>
                <Typography
                  variant="h6"
                  fontWeight="600"
                  color="#64748b"
                  sx={{ mb: 3 }}
                >
                  <span className="font-baseline-text">
                    {searchQuery
                      ? `${t("user.searchResults")}: "${searchQuery}"`
                      : t("user.selectLabRoom")}
                  </span>
                </Typography>
                <Grid container spacing={3}>
                  {filteredLabs.length > 0 ? (
                    filteredLabs.map((room) => (
                      <Grid
                        item
                        xs={12}
                        sm={6}
                        lg={4}
                        key={room.id}
                        sx={{ minWidth: 0 }}
                      >
                        <Paper
                          elevation={0}
                          onClick={() => handleSelectRoom(room)}
                          className="room-card lab-card"
                          sx={{
                            opacity: room.status === "active" ? 1 : 0.6,
                            pointerEvents:
                              room.status === "active" ? "auto" : "none",
                          }}
                        >
                          <Box
                            className="room-card__visual"
                            sx={{
                              height: "140px",
                              bgcolor: "#e0f2fe",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Computer sx={{ fontSize: 60, color: "#3b82f6" }} />
                          </Box>
                          <Box
                            className="room-card__content"
                            sx={{ p: 3, flexGrow: 1, bgcolor: "white" }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                minWidth: 0,
                              }}
                            >
                              <Typography
                                variant="h5"
                                fontWeight="600"
                                color="#1e293b"
                              >
                                <span className="font-baseline-text">
                                  {room.code}
                                </span>
                              </Typography>
                              <span
                                className={
                                  room.status === "active"
                                    ? "animated-chip"
                                    : ""
                                }
                              >
                                <Chip
                                  label={
                                    <span className="font-baseline-text">
                                      {room.status === "active"
                                        ? t("user.available")
                                        : t("user.maintenance")}
                                    </span>
                                  }
                                  color={
                                    room.status === "active"
                                      ? "success"
                                      : "error"
                                  }
                                  size="small"
                                  sx={{ fontWeight: "600" }}
                                />
                              </span>
                            </Box>
                            <Typography
                              variant="body2"
                              color="#64748b"
                              className="lab-card-name"
                              title={room.name}
                              sx={{ mt: 1 }}
                            >
                              <span className="font-baseline-text">
                                {room.name}
                              </span>
                            </Typography>
                            <Divider sx={{ my: 2 }} />
                            <Box
                              className="room-card-meta"
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                color: "#64748b",
                                minWidth: 0,
                              }}
                            >
                              <Box
                                className="room-card-meta__capacity"
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                  minWidth: 0,
                                  overflowWrap: "anywhere",
                                  textAlign: "right",
                                }}
                              >
                                <PeopleAlt fontSize="small" />
                                <Typography variant="body2" fontWeight="600">
                                  <span className="font-baseline-text">
                                    {room.capacity} {t("user.users")}
                                  </span>
                                </Typography>
                              </Box>
                              <Box
                                className="room-card-meta__location"
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                <span className="font-baseline-text">
                                  {t("user.location")}: {room.location || "-"}
                                </span>
                              </Box>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    ))
                  ) : (
                    <Grid item xs={12}>
                      <Paper
                        className="surface-card empty-state"
                        elevation={0}
                        sx={{
                          p: 5,
                          textAlign: "center",
                          border: "1px dashed #cbd5e1",
                          borderRadius: 4,
                          bgcolor: "#f8fafc",
                        }}
                      >
                        <Typography
                          variant="h6"
                          color="textSecondary"
                          fontWeight="600"
                        >
                          {t("user.noLabsMatching")} "{searchQuery}"
                        </Typography>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mt: 1 }}
                        >
                          {t("user.adjustSearch")}
                        </Typography>
                        <Button
                          variant="outlined"
                          onClick={() => setSearchQuery("")}
                          sx={{
                            mt: 2,
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: "600",
                          }}
                        >
                          {t("user.clearSearch")}
                        </Button>
                      </Paper>
                    </Grid>
                  )}
                </Grid>
              </Box>
            </Fade>
          )}

          {/* VIEW 2: BOOKING PROCESS */}
          {selectedRoom && (
            <Box
              sx={{
                display: "flex",
                flexDirection: { xs: "column", lg: "row" },
                gap: 4,
                height: "100%",
              }}
            >
              {/* Left Panel: Selected Room Info */}
              <Slide
                direction="right"
                in={!!selectedRoom}
                mountOnEnter
                unmountOnExit
                timeout={400}
              >
                <Box sx={{ flex: "1", maxWidth: { lg: "380px" } }}>
                  <Button
                    startIcon={<ArrowBack />}
                    onClick={handleBackToRooms}
                    sx={{
                      mb: 2,
                      color: "#64748b",
                      textTransform: "none",
                      fontWeight: "600",
                      transition: "all 0.2s",
                      "&:hover": {
                        color: "#0f172a",
                        bgcolor: "transparent",
                        transform: "translateX(-5px)",
                      },
                    }}
                  >
                    {t("user.backToRooms")}
                  </Button>

                  <Paper
                    elevation={0}
                    className="room-card selected-room-card"
                    sx={{
                      border: "2px solid #b5dbff",
                      borderRadius: 4,
                      overflow: "hidden",
                    }}
                  >
                    <Box
                      sx={{
                        height: "220px",
                        bgcolor: "#e0f2fe",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Computer sx={{ fontSize: 80, color: "#3b82f6" }} />
                    </Box>
                    <Box sx={{ p: 4 }}>
                      <Typography
                        variant="h4"
                        fontWeight="600"
                        color="#0f172a"
                        sx={{ mb: 1 }}
                      >
                        <span className="font-baseline-text">
                          {selectedRoom.code}
                        </span>
                      </Typography>
                      <Typography
                        variant="body1"
                        color="textSecondary"
                        sx={{ mb: 3, lineHeight: 1.6 }}
                      >
                        <span className="font-baseline-text">
                          {selectedRoom.name}
                        </span>
                      </Typography>
                      <Divider sx={{ mb: 3 }} />
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          color: "#475569",
                        }}
                      >
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Avatar sx={{ bgcolor: "#f1f5f9", color: "#64748b" }}>
                            <PeopleAlt />
                          </Avatar>
                          <Typography fontWeight="600">
                            {t("user.capacity")}: {selectedRoom.capacity}{" "}
                            {t("user.users")}
                          </Typography>
                        </Box>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Avatar sx={{ bgcolor: "#f1f5f9", color: "#64748b" }}>
                            <PcIcon />
                          </Avatar>
                          <Typography fontWeight="600">
                            {t("user.location")}: {selectedRoom.location || "-"}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>
                  </Paper>
                </Box>
              </Slide>

              {/* Right Panel: Calendar & Time Slots */}
              <Slide
                direction="up"
                in={!!selectedRoom}
                mountOnEnter
                unmountOnExit
                timeout={600}
              >
                <Box
                  sx={{
                    flex: "2",
                    display: "flex",
                    flexDirection: "column",
                    gap: 3,
                  }}
                >
                  {/* STEP 1: CALENDAR */}
                  <Box>
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 2,
                      }}
                    >
                      <Typography variant="h6" fontWeight="600">
                        1. {t("user.selectDate")}
                      </Typography>
                      <Chip
                        label={t("user.advanceBooking")}
                        size="small"
                        sx={{
                          bgcolor: "#eff6ff",
                          color: "#2563eb",
                          fontWeight: "600",
                        }}
                      />
                    </Box>
                    <Paper
                      className="surface-card"
                      elevation={0}
                      sx={{
                        p: { xs: 2, sm: 4 },
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 3,
                        }}
                      >
                        <Typography
                          variant="h6"
                          fontWeight="600"
                          color="#1e293b"
                        >
                          {monthName} {currentYear}
                        </Typography>
                        <Box>
                          <IconButton onClick={handlePrevMonth} size="small">
                            <ChevronLeft />
                          </IconButton>
                          <IconButton onClick={handleNextMonth} size="small">
                            <ChevronRight />
                          </IconButton>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: "repeat(7, 1fr)",
                          gap: 1,
                          textAlign: "center",
                        }}
                      >
                        {t("user.weekdaysShort").map((day) => (
                          <Typography
                            key={day}
                            variant="caption"
                            fontWeight="600"
                            color="#94a3b8"
                            sx={{ mb: 1 }}
                          >
                            {day}
                          </Typography>
                        ))}

                        {[...Array(emptySlots)].map((_, i) => (
                          <Box key={`empty-${i}`} />
                        ))}

                        {[...Array(daysInMonth)].map((_, i) => {
                          const dayNumber = i + 1;
                          const isSelected = dayNumber === selectedDate;

                          const iterationDate = getLabDateReference(
                            currentYear,
                            currentMonth,
                            dayNumber,
                          );
                          const isPastDate =
                            iterationDate < todayMidnightForCalendar;
                          const isTooFarDate = iterationDate > maxDateMidnight;
                          const isDisabledDate = isPastDate || isTooFarDate;

                          return (
                            <IconButton
                              key={dayNumber}
                              className={`booking-calendar-day ${
                                isSelected
                                  ? "booking-calendar-day--selected"
                                  : isDisabledDate
                                    ? "booking-calendar-day--unavailable"
                                    : "booking-calendar-day--selectable"
                              }`}
                              aria-label={`${dayNumber} ${monthName} ${currentYear}, ${t(
                                isDisabledDate
                                  ? "user.dateOutsideBookingWindow"
                                  : "user.dateSelectable",
                              )}`}
                              onClick={() => handleSelectDate(dayNumber)}
                              disabled={isDisabledDate}
                              sx={{
                                width: { xs: 32, sm: 40 },
                                height: { xs: 32, sm: 40 },
                                margin: "auto",
                                padding: 0,
                              }}
                            >
                              <Typography
                                className="booking-calendar-day-number"
                                variant="body2"
                                fontWeight={
                                  isSelected || !isDisabledDate ? 600 : 300
                                }
                              >
                                {dayNumber}
                              </Typography>
                            </IconButton>
                          );
                        })}
                      </Box>
                      <Box
                        role="note"
                        aria-label={`${t("user.dateSelectable")}; ${t(
                          "user.dateOutsideBookingWindow",
                        )}`}
                        sx={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: { xs: 1.5, sm: 3 },
                          mt: 2.5,
                          pt: 2,
                          borderTop: "1px solid var(--border-light)",
                        }}
                      >
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Box
                            aria-hidden="true"
                            sx={{
                              width: 16,
                              height: 16,
                              flexShrink: 0,
                              borderRadius: "50%",
                              bgcolor: "var(--brand-soft)",
                              border: "1px solid var(--brand-color)",
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {t("user.dateSelectable")}
                          </Typography>
                        </Box>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 1 }}
                        >
                          <Box
                            aria-hidden="true"
                            sx={{
                              width: 16,
                              height: 16,
                              flexShrink: 0,
                              borderRadius: "50%",
                              bgcolor: "var(--surface-subtle)",
                              border: "1px solid var(--border-light)",
                            }}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {t("user.dateOutsideBookingWindow")}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  </Box>

                  {/* STEP 2: TIME SLOTS GRID */}
                  <Fade in={!!selectedDate} timeout={500}>
                    <Box sx={{ display: selectedDate ? "block" : "none" }}>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Typography variant="h6" fontWeight="600">
                          2. {t("user.selectTime")}
                        </Typography>
                        <Chip
                          label={t("user.requiresNotice")}
                          size="small"
                          sx={{
                            bgcolor: "#fff7ed",
                            color: "#d97706",
                            fontWeight: "600",
                          }}
                        />
                      </Box>
                      <Paper
                        className="surface-card"
                        elevation={0}
                        sx={{
                          p: 3,
                          border: "1px solid #e2e8f0",
                          borderRadius: 4,
                        }}
                      >
                        <Grid container spacing={2}>
                          {[1, 2, 3, 4].map((slotNumber) => {
                            const slotInfo = availability?.[slotNumber];
                            const isAvailable =
                              slotInfo?.status === "available";
                            const isClass = slotInfo?.status === "class";
                            const isFull = slotInfo?.status === "full";

                            const timeStatus =
                              checkSlotTimeValidity(slotNumber);
                            const isTimeValid = timeStatus === "valid";

                            const isSelected = selectedTimeSlot === slotNumber;
                            const isDisabled = !isAvailable || !isTimeValid;

                            return (
                              <Grid item xs={12} sm={6} key={slotNumber}>
                                <Button
                                  className="booking-time-slot"
                                  fullWidth
                                  aria-pressed={isSelected}
                                  onClick={() =>
                                    isAvailable &&
                                    isTimeValid &&
                                    setSelectedTimeSlot(slotNumber)
                                  }
                                  variant={
                                    isSelected ? "contained" : "outlined"
                                  }
                                  disabled={isDisabled}
                                  sx={{
                                    py: 2,
                                    borderRadius: "var(--radius-control)",
                                    fontWeight: "600",
                                    textTransform: "none",
                                    fontSize: "15px",
                                    display: "flex",
                                    flexDirection: "column",
                                    borderColor: "var(--border-light)",
                                    color: isSelected
                                      ? "var(--brand-contrast)"
                                      : isDisabled
                                        ? "var(--text-muted)"
                                        : "var(--text-dark)",
                                    bgcolor: isSelected
                                      ? "var(--brand-color)"
                                      : "var(--surface-subtle)",
                                    "&:hover": {
                                      borderColor: !isDisabled
                                        ? "var(--brand-color)"
                                        : "var(--border-light)",
                                      bgcolor:
                                        !isDisabled && !isSelected
                                          ? "var(--brand-soft)"
                                          : isSelected
                                            ? "var(--brand-hover)"
                                            : "var(--surface-subtle)",
                                    },
                                  }}
                                >
                                  <span>
                                    {SLOT_DISPLAY_MAPPING[slotNumber]}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "300",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {isClass && t("user.reservedForClass")}
                                    {isFull && t("user.fullyBooked")}
                                    {!isTimeValid &&
                                      isAvailable &&
                                      timeStatus === "too_close" &&
                                      t("user.tooClose")}
                                    {!isTimeValid &&
                                      isAvailable &&
                                      timeStatus === "passed" &&
                                      t("user.timePassed")}
                                    {isAvailable &&
                                    isTimeValid &&
                                    slotInfo?.remaining_seats !== undefined
                                      ? `${slotInfo.remaining_seats} ${t("user.seatsLeft")}`
                                      : ""}
                                  </span>
                                </Button>
                              </Grid>
                            );
                          })}
                        </Grid>
                      </Paper>
                    </Box>
                  </Fade>

                  {/* STEP 3: ACTION CONFIRMATION (เอาช่องกรอก Purpose ออก) */}
                  <Slide
                    direction="up"
                    in={!!selectedTimeSlot}
                    mountOnEnter
                    unmountOnExit
                  >
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 2 }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <Typography variant="h6" fontWeight="600">
                          3. {t("user.confirmYourBooking")}
                        </Typography>
                      </Box>

                      {currentUser && pointsError ? (
                        <Alert severity="error">{pointsError}</Alert>
                      ) : null}
                      {currentUser && pointStatus?.booking_allowed === false ? (
                        <Alert
                          severity={
                            Number(pointStatus.points) === 0
                              ? "error"
                              : "warning"
                          }
                        >
                          <Box>
                            <Typography>
                              {t("user.bookingBlockedByPolicy")}
                            </Typography>
                            {Number(pointStatus.points) === 0 &&
                              (pointStatus.point_request?.status ===
                              "pending" ? (
                                <Typography variant="body2" sx={{ mt: 0.5 }}>
                                  {t("user.pointRequestSentPrefix")}{" "}
                                  {pointStatus.point_request.requested_points ||
                                    pointStatus.point_request_amount ||
                                    10}{" "}
                                  {t("user.requestSubmitted")}
                                </Typography>
                              ) : (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<SupportAgent />}
                                  onClick={handlePointRequest}
                                  disabled={
                                    pointRequestLoading ||
                                    pointStatus.can_request_points === false
                                  }
                                  sx={{
                                    mt: 1.25,
                                    borderColor: "currentColor",
                                    color: "inherit",
                                    textTransform: "none",
                                    fontWeight: "600",
                                  }}
                                >
                                  {pointRequestLoading
                                    ? t("user.sendingRequest")
                                    : `${t("user.contactAdmin")} ${pointStatus.point_request_amount || 10} ${t("common.points")}`}
                                </Button>
                              ))}
                          </Box>
                        </Alert>
                      ) : null}

                      <Paper
                        className="surface-card surface-card--info"
                        elevation={0}
                        sx={{
                          p: { xs: 2, md: 3 },
                          bgcolor: "#e0f2fe",
                          borderRadius: 4,
                          display: "flex",
                          flexDirection: { xs: "column", sm: "row" },
                          justifyContent: "space-between",
                          alignItems: { xs: "flex-start", sm: "center" },
                          gap: 2,
                          border: "1px solid #bae6fd",
                        }}
                      >
                        <Box>
                          <Typography
                            variant="caption"
                            color="textSecondary"
                            fontWeight="600"
                          >
                            {t("user.yourSelection")}
                          </Typography>
                          <Typography
                            variant="h6"
                            fontWeight="600"
                            color="#0c4a6e"
                          >
                            {selectedRoom?.code} • {monthNameShort}{" "}
                            {selectedDate},{" "}
                            {SLOT_DISPLAY_MAPPING[selectedTimeSlot]}
                          </Typography>
                        </Box>

                        <Button
                          variant="contained"
                          onClick={
                            currentUser
                              ? handleConfirmBooking
                              : () => navigate("/")
                          }
                          disabled={Boolean(
                            currentUser &&
                            (pointsLoading ||
                              pointsError ||
                              !pointStatus?.booking_allowed),
                          )}
                          sx={{
                            bgcolor: "#0284c7",
                            color: "white",
                            px: 4,
                            py: 1.5,
                            borderRadius: 3,
                            fontWeight: "600",
                            width: { xs: "100%", sm: "auto" },
                            transition: "all 0.2s",
                            "&:hover": {
                              bgcolor: "#0369a1",
                              transform: "scale(1.03)",
                            },
                          }}
                        >
                          {currentUser
                            ? t("user.confirmBooking")
                            : t("user.loginToBook")}
                        </Button>
                      </Paper>
                    </Box>
                  </Slide>
                </Box>
              </Slide>
            </Box>
          )}
        </div>
      </div>

      {/* ============================================================================
          9. DIALOGS & MODALS
          ============================================================================ */}
      <Dialog
        open={successDialogOpen}
        onClose={handleCloseSuccessDialog}
        PaperProps={{
          sx: {
            borderRadius: 4,
            p: 3,
            textAlign: "center",
            maxWidth: 400,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          },
        }}
      >
        <DialogContent
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            pb: 1,
          }}
        >
          <Box
            sx={{
              bgcolor: "#dcfce7",
              p: 2,
              borderRadius: "50%",
              display: "inline-flex",
              mb: 3,
            }}
          >
            <CheckCircle sx={{ fontSize: 64, color: "#16a34a" }} />
          </Box>
          <Typography
            variant="h5"
            fontWeight="700"
            color="#0f172a"
            gutterBottom
          >
            {t("user.bookingConfirmed")}
          </Typography>
          <Typography
            variant="body1"
            color="#64748b"
            sx={{ mb: 3, lineHeight: 1.6 }}
          >
            {t("user.reservationConfirmed")}{" "}
            <strong>{selectedRoom?.code}</strong>
            <br />
            {t("user.bookingDate")}:{" "}
            <strong>
              {monthNameShort} {selectedDate}
            </strong>
            <br />
            {t("user.bookingTime")}:{" "}
            <strong>{SLOT_DISPLAY_MAPPING[selectedTimeSlot]}</strong>
          </Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={handleCloseSuccessDialog}
            sx={{
              borderRadius: 3,
              py: 1.5,
              fontWeight: "600",
              fontSize: "1rem",
              bgcolor: "#0f172a",
              textTransform: "none",
              "&:hover": { bgcolor: "#334155" },
            }}
          >
            {t("user.gotIt")}
          </Button>
        </DialogContent>
      </Dialog>
      <SupportModal
        open={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />
    </div>
  );
}
