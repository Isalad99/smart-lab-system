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
  Grid,
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

// ============================================================================
// 2. MAIN COMPONENT
// ============================================================================
export default function Booking() {
  // Contexts & Hooks
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

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
  const [pointsError, setPointsError] = useState("");
  const [pointRequestLoading, setPointRequestLoading] = useState(false);

  // Selection States
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [currentDateObj, setCurrentDateObj] = useState(new Date());
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
      alert(
        "Error: Unable to fetch lab data. Please check backend connection.",
      );
    }
  }, []);

  // Fetch labs on component mount
  useEffect(() => {
    // This effect intentionally loads remote data and updates state asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLabs();
  }, [fetchLabs]);

  useEffect(() => {
    if (!currentUser?.email) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        setPointsError("ไม่สามารถตรวจสอบคะแนนได้ จึงยังไม่อนุญาตให้จอง");
      })
      .finally(() => {
        if (!cancelled) setPointsLoading(false);
      });

    return () => {
      cancelled = true;
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
      alert("Error: Failed to retrieve schedule. Please refresh the page.");
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
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonthJS = new Date(currentYear, currentMonth, 1).getDay();

  // Shift Sunday (0) to the end to start the calendar on Monday
  const emptySlots = firstDayOfMonthJS === 0 ? 6 : firstDayOfMonthJS - 1;

  const monthName = currentDateObj.toLocaleString("en-US", { month: "long" });
  const monthNameShort = currentDateObj.toLocaleString("en-US", {
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

    const selectedDateObj = new Date(currentYear, currentMonth, selectedDate);
    selectedDateObj.setHours(0, 0, 0, 0);

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    if (selectedDateObj.getTime() > todayMidnight.getTime()) return "valid";

    const slotTimeObj = new Date(currentYear, currentMonth, selectedDate);
    slotTimeObj.setHours(
      SLOT_TIMES[slotNumber].hours,
      SLOT_TIMES[slotNumber].minutes,
      0,
      0,
    );

    const now = new Date();

    if (slotTimeObj.getTime() <= now.getTime()) return "passed";

    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    if (slotTimeObj.getTime() < twoHoursFromNow.getTime()) return "too_close";

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
        email: currentUser.email,
        booking_date: dateStr,
        slot_number: selectedTimeSlot,
        purpose: "General Usage", // 🌟 กำหนดค่าเริ่มต้นให้ไปเลยโดยที่ผู้ใช้ไม่ต้องพิมพ์
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
        "Failed to confirm booking";
      alert(`Booking Failed: ${errMsg}`);
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
        typeof detail === "string"
          ? detail
          : "ไม่สามารถส่งคำขอเพิ่มคะแนนได้ กรุณาลองใหม่อีกครั้ง";
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

  const handleNotifClick = (e) => setNotifAnchorEl(e.currentTarget);
  const handleCloseNotifMenu = () => setNotifAnchorEl(null);

  // ยังไม่ต่อกับ backend จริง - รอเชื่อมข้อมูลแจ้งเตือนทีหลัง
  const notifications = [];

  // ============================================================================
  // 7. RENDER HELPERS
  // ============================================================================

  // Date validation setup for calendar rendering
  const todayMidnightForCalendar = new Date();
  todayMidnightForCalendar.setHours(0, 0, 0, 0);
  const maxDateMidnight = new Date();
  maxDateMidnight.setHours(0, 0, 0, 0);
  maxDateMidnight.setDate(maxDateMidnight.getDate() + 2); // Max booking window = 2 days

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
            <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>
              Smart Lab
            </Typography>
            <Typography variant="caption" color="textSecondary">
              Reserve Lab to use
            </Typography>
          </div>
        </div>

        <div className="sidebar-menu">
          <div
            className="menu-item active"
            onClick={() => setIsSidebarOpen(false)}
          >
            <EventNote /> Lab Reserve
          </div>
          <div className="menu-item" onClick={() => navigate("/reserved")}>
            <Assignment /> Reserved
          </div>
          <div className="menu-item" onClick={() => navigate("/history")}>
            <History /> History
          </div>
        </div>

        <div
          className="sidebar-menu"
          style={{ flex: "none", paddingBottom: "24px" }}
        >
          <div className="menu-item" onClick={() => setIsSupportOpen(true)}>
            <SupportAgent /> Support
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
              fontWeight="bold"
              color="#111827"
              sx={{ display: { xs: "none", sm: "block" } }}
            >
              Lab Reserve
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
                placeholder="Search by code, name, or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={!!selectedRoom}
              />
            </div>
            <IconButton sx={{ display: { xs: "block", md: "none" } }}>
              <Search sx={{ color: "#111827" }} />
            </IconButton>
            <IconButton onClick={handleNotifClick}>
              <Badge
                variant="dot"
                color="error"
                overlap="circular"
                invisible={!notifications.some((n) => n.unread)}
              >
                <Notifications sx={{ color: "#111827" }} />
              </Badge>
            </IconButton>

            {/* Notification Popover (UI only, ยังไม่มีข้อมูลจริง) */}
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
                  bgcolor: "#eff6ff",
                  color: "#0f172a",
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
                <Typography fontSize="16px" fontWeight="700">
                  การแจ้งเตือน
                </Typography>
              </Box>

              {/* Scrollable notification list */}
              <Box sx={{ overflowY: "auto", px: 1, pb: 1 }}>
                {notifications.length === 0 ? (
                  <Box sx={{ py: 4, textAlign: "center" }}>
                    <Typography fontSize="13px" sx={{ color: "#64748b" }}>
                      ยังไม่มีการแจ้งเตือน
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
                        "&:hover": { bgcolor: "rgba(0, 0, 0, 0.04)" },
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
                        {n.title.charAt(0)}
                      </Avatar>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          fontSize="13.5px"
                          fontWeight="600"
                          sx={{
                            color: "#1e293b",
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
                          sx={{ color: "#475569", mt: 0.3 }}
                        >
                          {n.subtitle}
                        </Typography>
                        <Typography
                          fontSize="12px"
                          sx={{ color: "#64748b", mt: 0.3 }}
                        >
                          {n.time}
                        </Typography>
                      </Box>

                      <IconButton
                        size="small"
                        sx={{ color: "#94a3b8", mt: 0.5 }}
                      >
                        <MoreVertIcon sx={{ fontSize: 18 }} />
                      </IconButton>
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
                    fontWeight="bold"
                    lineHeight={1.2}
                  >
                    {currentUser.name}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {currentUser.role}
                  </Typography>
                </Box>

                {/* ปุ่ม Avatar สำหรับกดเปิด Popover */}
                <IconButton
                  onClick={handleAvatarClick}
                  sx={{ p: 0.5, "&:hover": { bgcolor: "#f1f5f9" } }}
                >
                  <Avatar
                    sx={{
                      bgcolor: "#111827",
                      width: 36,
                      height: 36,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    }}
                  >
                    {currentUser.initial || currentUser.name?.charAt(0)}
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
                      fontWeight="600"
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
                      {currentUser.initial || currentUser.name?.charAt(0)}
                    </Avatar>

                    <Typography
                      sx={{ mt: 1.5, color: "#1e293b" }}
                      fontWeight="700"
                      fontSize="18px"
                    >
                      Hi, {currentUser.name}
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
                        fontWeight: "700",
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
                      Manage your Account
                    </Button>
                  </Box>

                  <Divider />

                  {/* Menu Action List */}
                  <Box sx={{ px: 1, py: 1 }}>
                    <Box
                      onClick={() => {
                        handleCloseUserMenu();
                        navigate("/profile");
                      }}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        px: 1.5,
                        py: 1,
                        borderRadius: 2,
                        cursor: "pointer",
                        "&:hover": { bgcolor: "#f8fafc" },
                      }}
                    >
                      <Settings sx={{ fontSize: 20, color: "#64748b" }} />
                      <Typography
                        fontSize="13px"
                        fontWeight="700"
                        color="#1e293b"
                      >
                        Setting
                      </Typography>
                    </Box>
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
                        fontWeight="700"
                        color="#ef4444"
                      >
                        Log out
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
                    fontWeight="bold"
                    lineHeight={1.2}
                    color="textSecondary"
                  >
                    Guest User
                  </Typography>
                  <Typography variant="caption" color="primary.main">
                    Click to Log in
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
          className="content-area"
          style={{ position: "relative", overflowX: "hidden" }}
        >
          {/* VIEW 1: ROOM SELECTION */}
          {!selectedRoom && (
            <Fade in={!selectedRoom} timeout={400}>
              <Box>
                <Typography variant="h6" fontWeight="bold" sx={{ mb: 3 }}>
                  {searchQuery
                    ? `Search Results for "${searchQuery}"`
                    : "Select a Lab Room"}
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
                          <Box sx={{ p: 3, flexGrow: 1, bgcolor: "white" }}>
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
                                fontWeight="bold"
                                color="#1e293b"
                              >
                                {room.code}
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
                                    room.status === "active"
                                      ? "Available"
                                      : "Maintenance"
                                  }
                                  color={
                                    room.status === "active"
                                      ? "success"
                                      : "error"
                                  }
                                  size="small"
                                  sx={{ fontWeight: "bold" }}
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
                              {room.name}
                            </Typography>
                            <Divider sx={{ my: 2 }} />
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                color: "#64748b",
                                minWidth: 0,
                              }}
                            >
                              <Box
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
                                <Typography variant="body2" fontWeight="bold">
                                  {room.capacity} Users
                                </Typography>
                              </Box>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1,
                                }}
                              >
                                Location: {room.location || "-"}
                              </Box>
                            </Box>
                          </Box>
                        </Paper>
                      </Grid>
                    ))
                  ) : (
                    <Grid item xs={12}>
                      <Paper
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
                          fontWeight="bold"
                        >
                          No labs found matching "{searchQuery}"
                        </Typography>
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          sx={{ mt: 1 }}
                        >
                          Try adjusting your search keywords.
                        </Typography>
                        <Button
                          variant="outlined"
                          onClick={() => setSearchQuery("")}
                          sx={{
                            mt: 2,
                            borderRadius: 2,
                            textTransform: "none",
                            fontWeight: "bold",
                          }}
                        >
                          Clear Search
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
                      fontWeight: "bold",
                      transition: "all 0.2s",
                      "&:hover": {
                        color: "#0f172a",
                        bgcolor: "transparent",
                        transform: "translateX(-5px)",
                      },
                    }}
                  >
                    Back to all rooms
                  </Button>

                  <Paper
                    elevation={0}
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
                        fontWeight="bold"
                        color="#0f172a"
                        sx={{ mb: 1 }}
                      >
                        {selectedRoom.code}
                      </Typography>
                      <Typography
                        variant="body1"
                        color="textSecondary"
                        sx={{ mb: 3, lineHeight: 1.6 }}
                      >
                        {selectedRoom.name}
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
                          <Typography fontWeight="bold">
                            Capacity: {selectedRoom.capacity} Users
                          </Typography>
                        </Box>
                        <Box
                          sx={{ display: "flex", alignItems: "center", gap: 2 }}
                        >
                          <Avatar sx={{ bgcolor: "#f1f5f9", color: "#64748b" }}>
                            <PcIcon />
                          </Avatar>
                          <Typography fontWeight="bold">
                            Location: {selectedRoom.location || "-"}
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
                      <Typography variant="h6" fontWeight="bold">
                        1. Select Date
                      </Typography>
                      <Chip
                        label="Advance booking up to 2 days"
                        size="small"
                        sx={{
                          bgcolor: "#eff6ff",
                          color: "#2563eb",
                          fontWeight: "bold",
                        }}
                      />
                    </Box>
                    <Paper
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
                          fontWeight="bold"
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
                        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map(
                          (day) => (
                            <Typography
                              key={day}
                              variant="caption"
                              fontWeight="bold"
                              color="#94a3b8"
                              sx={{ mb: 1 }}
                            >
                              {day}
                            </Typography>
                          ),
                        )}

                        {[...Array(emptySlots)].map((_, i) => (
                          <Box key={`empty-${i}`} />
                        ))}

                        {[...Array(daysInMonth)].map((_, i) => {
                          const dayNumber = i + 1;
                          const isSelected = dayNumber === selectedDate;

                          const iterationDate = new Date(
                            currentYear,
                            currentMonth,
                            dayNumber,
                          );
                          iterationDate.setHours(0, 0, 0, 0);
                          const isPastDate =
                            iterationDate.getTime() <
                            todayMidnightForCalendar.getTime();
                          const isTooFarDate =
                            iterationDate.getTime() > maxDateMidnight.getTime();
                          const isDisabledDate = isPastDate || isTooFarDate;

                          return (
                            <IconButton
                              key={dayNumber}
                              onClick={() => handleSelectDate(dayNumber)}
                              disabled={isDisabledDate}
                              sx={{
                                width: { xs: 32, sm: 40 },
                                height: { xs: 32, sm: 40 },
                                margin: "auto",
                                bgcolor: isSelected ? "#3b82f6" : "transparent",
                                color: isSelected
                                  ? "white"
                                  : isDisabledDate
                                    ? "#cbd5e1"
                                    : "#334155",
                                transition: "all 0.2s",
                                "&:hover": {
                                  bgcolor: isDisabledDate
                                    ? "transparent"
                                    : isSelected
                                      ? "#2563eb"
                                      : "#f1f5f9",
                                  transform: isDisabledDate
                                    ? "none"
                                    : "scale(1.1)",
                                },
                              }}
                            >
                              <Typography
                                variant="body2"
                                fontWeight={isSelected ? "bold" : "normal"}
                              >
                                {dayNumber}
                              </Typography>
                            </IconButton>
                          );
                        })}
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
                        <Typography variant="h6" fontWeight="bold">
                          2. Select Time
                        </Typography>
                        <Chip
                          label="Requires 2 hours advance notice"
                          size="small"
                          sx={{
                            bgcolor: "#fff7ed",
                            color: "#d97706",
                            fontWeight: "bold",
                          }}
                        />
                      </Box>
                      <Paper
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
                                  fullWidth
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
                                    borderRadius: 3,
                                    fontWeight: "bold",
                                    textTransform: "none",
                                    fontSize: "15px",
                                    display: "flex",
                                    flexDirection: "column",
                                    borderColor:
                                      !isDisabled && !isSelected
                                        ? "#cbd5e1"
                                        : "transparent",
                                    color: isSelected
                                      ? "white"
                                      : isDisabled
                                        ? "#94a3b8"
                                        : "#334155",
                                    bgcolor: isSelected
                                      ? "#3b82f6"
                                      : isDisabled
                                        ? "#f8fafc"
                                        : "white",
                                    "&:hover": {
                                      borderColor: "#3b82f6",
                                      bgcolor:
                                        !isDisabled && !isSelected
                                          ? "#eff6ff"
                                          : "",
                                    },
                                  }}
                                >
                                  <span>
                                    {SLOT_DISPLAY_MAPPING[slotNumber]}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontWeight: "normal",
                                      marginTop: "4px",
                                    }}
                                  >
                                    {isClass && "Reserved for Class"}
                                    {isFull && "Fully Booked"}
                                    {!isTimeValid &&
                                      isAvailable &&
                                      timeStatus === "too_close" &&
                                      "Too Close (Wait 2 hours)"}
                                    {!isTimeValid &&
                                      isAvailable &&
                                      timeStatus === "passed" &&
                                      "Time Passed"}
                                    {isAvailable &&
                                    isTimeValid &&
                                    slotInfo?.remaining_seats !== undefined
                                      ? `${slotInfo.remaining_seats} Seats Left`
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
                        <Typography variant="h6" fontWeight="bold">
                          3. Confirm Your Booking
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
                              จองห้องไม่ได้: {pointStatus.booking_block_reason}
                            </Typography>
                            {Number(pointStatus.points) === 0 &&
                              (pointStatus.point_request?.status ===
                              "pending" ? (
                                <Typography variant="body2" sx={{ mt: 0.5 }}>
                                  ส่งคำขอเพิ่ม{" "}
                                  {pointStatus.point_request.requested_points ||
                                    pointStatus.point_request_amount ||
                                    10}{" "}
                                  คะแนนแล้ว กรุณารอ Admin พิจารณา
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
                                    fontWeight: "700",
                                  }}
                                >
                                  {pointRequestLoading
                                    ? "กำลังส่งคำขอ..."
                                    : `ติดต่อ Admin เพื่อขอเพิ่ม ${pointStatus.point_request_amount || 10} คะแนน`}
                                </Button>
                              ))}
                          </Box>
                        </Alert>
                      ) : null}

                      <Paper
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
                            fontWeight="bold"
                          >
                            YOUR SELECTION
                          </Typography>
                          <Typography
                            variant="h6"
                            fontWeight="bold"
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
                            fontWeight: "bold",
                            width: { xs: "100%", sm: "auto" },
                            transition: "all 0.2s",
                            "&:hover": {
                              bgcolor: "#0369a1",
                              transform: "scale(1.03)",
                            },
                          }}
                        >
                          {currentUser ? "Confirm Booking" : "Log in to Book"}
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
            fontWeight="800"
            color="#0f172a"
            gutterBottom
          >
            Booking Confirmed!
          </Typography>
          <Typography
            variant="body1"
            color="#64748b"
            sx={{ mb: 3, lineHeight: 1.6 }}
          >
            Your reservation for <strong>{selectedRoom?.code}</strong> on{" "}
            <strong>
              {monthNameShort} {selectedDate}
            </strong>{" "}
            at <strong>{SLOT_DISPLAY_MAPPING[selectedTimeSlot]}</strong> has
            been successfully confirmed.
          </Typography>
          <Button
            fullWidth
            variant="contained"
            onClick={handleCloseSuccessDialog}
            sx={{
              borderRadius: 3,
              py: 1.5,
              fontWeight: "700",
              fontSize: "1rem",
              bgcolor: "#0f172a",
              textTransform: "none",
              "&:hover": { bgcolor: "#334155" },
            }}
          >
            Got it, thanks!
          </Button>
        </DialogContent>
      </Dialog>
      <SupportModal
        open={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
        user={currentUser}
      />
    </div>
  );
}
