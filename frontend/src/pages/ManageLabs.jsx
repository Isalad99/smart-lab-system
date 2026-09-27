// ============================================================================
// 1. IMPORTS & CONFIGURATION
// ============================================================================
import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Paper,
  GridLegacy as Grid,
  Divider,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  InputBase,
  Fade,
  Slide,
  Popover,
} from "@mui/material";
import {
  Search,
  Logout,
  Computer,
  Person,
  PeopleAlt,
  MeetingRoom,
  Add,
  ArrowBack,
  Save,
  Delete,
  Edit,
  Settings,
  Close,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminNavigation from "../components/AdminNavigation";
import { authConfig } from "../utils/auth";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";

// นำเข้า MUI DatePicker
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

const API_URL = import.meta.env.VITE_API_URL;

// ============================================================================
// 2. STATIC DATA
// ============================================================================
const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const SLOT_OPTIONS = [
  { value: 1, label: "08:40 - 11:00" },
  { value: 2, label: "12:00 - 14:20" },
  { value: 3, label: "14:30 - 16:50" },
  { value: 4, label: "17:00 - 19:20" },
];

const getDayLabel = (day, t) => t(`admin.weekday${day}`);

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export default function ManageLabs() {
  const navigate = useNavigate();
  const { currentUser, logout, refreshCurrentUser } = useAuth();
  const { t } = useLanguage();

  // --- User menu (avatar dropdown) ---
  const [anchorEl, setAnchorEl] = useState(null);
  const openUserMenu = Boolean(anchorEl);
  const handleAvatarClick = (e) => setAnchorEl(e.currentTarget);
  const handleCloseUserMenu = () => setAnchorEl(null);
  const handleLogout = () => {
    handleCloseUserMenu();
    logout();
    navigate("/");
  };

  // ============================================================================
  // 4. STATE MANAGEMENT
  // ============================================================================
  const [viewMode, setViewMode] = useState("list");
  const [activeLab, setActiveLab] = useState(null);

  const [labs, setLabs] = useState([]);
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [newLab, setNewLab] = useState({
    name: "",
    code: "",
    capacity: 40,
    location: "",
  });
  const [editFormData, setEditFormData] = useState({
    name: "",
    code: "",
    capacity: 0,
    location: "",
  });

  const [schedules, setSchedules] = useState([]);
  const [openScheduleDialog, setOpenScheduleDialog] = useState(false);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);
  const [currentScheduleId, setCurrentScheduleId] = useState(null);
  const [scheduleFormData, setScheduleFormData] = useState({
    course_code: "",
    course_name: "",
    instructor_name: "",
    day_of_week: "Monday",
    slot_number: 1,
    semester: "1",
    academic_year: "2026",
    valid_from: "",
    valid_until: "",
  });

  // ============================================================================
  // 5. LIFECYCLE & API CALLS
  // ============================================================================
  const fetchLabs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/labs`);
      setLabs(response.data.data);
      setActiveLab((currentLab) => {
        if (!currentLab) return currentLab;
        return (
          response.data.data.find((lab) => lab.id === currentLab.id) ||
          currentLab
        );
      });
    } catch (error) {
      console.error("[API Error] Fetch labs failed:", error);
    }
  }, []);

  useEffect(() => {
    // This effect intentionally loads remote data and updates state asynchronously.
    refreshCurrentUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLabs();
  }, [fetchLabs, refreshCurrentUser]);

  const fetchSchedules = async (labId) => {
    try {
      const response = await axios.get(`${API_URL}/labs/${labId}/schedules`);
      setSchedules(response.data.data);
    } catch (error) {
      console.error("[API Error] Fetch schedules failed:", error);
    }
  };

  // ============================================================================
  // 6. ACTION HANDLERS (LAB MANAGEMENT)
  // ============================================================================
  const handleCreateLab = async () => {
    try {
      await axios.post(`${API_URL}/admin/labs`, newLab, authConfig());
      setOpenCreateDialog(false);
      setNewLab({ name: "", code: "", capacity: 40, location: "" });
      fetchLabs();
    } catch (error) {
      alert(error.response?.data?.detail || t("admin.createFailed"));
    }
  };

  const handleUpdateLab = async () => {
    try {
      await axios.put(
        `${API_URL}/admin/labs/${activeLab.id}`,
        editFormData,
        authConfig(),
      );
      alert(t("admin.updateSucceeded"));
      fetchLabs();
    } catch (error) {
      alert(error.response?.data?.detail || t("admin.updateFailed"));
    }
  };

  const handleDeleteLab = async () => {
    if (
      !window.confirm(
        `${t("admin.confirmDeleteLabPrefix")} ${activeLab.code}?\n${t("admin.confirmDeleteLabSuffix")}`,
      )
    )
      return;

    try {
      await axios.delete(`${API_URL}/admin/labs/${activeLab.id}`, authConfig());
      alert(t("admin.deleteSucceeded"));
      handleGoBack();
      fetchLabs();
    } catch (error) {
      alert(
        `${t("admin.deleteFailed")}: ${error.response?.data?.detail || error.message}`,
      );
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = activeLab.status === "active" ? "disabled" : "active";
    try {
      await axios.put(
        `${API_URL}/admin/labs/${activeLab.id}/status`,
        {
          status: newStatus,
        },
        authConfig(),
      );
      fetchLabs();
    } catch (error) {
      console.error("Status toggle failed:", error);
    }
  };

  // ============================================================================
  // 7. VIEW TRANSITION HANDLERS
  // ============================================================================
  const handleSelectLab = (lab) => {
    setActiveLab(lab);
    setEditFormData({
      name: lab.name,
      code: lab.code,
      capacity: lab.capacity,
      location: lab.location || "",
    });
    setViewMode("detail");
    fetchSchedules(lab.id);
  };

  const handleGoBack = () => {
    setViewMode("list");
    setActiveLab(null);
    setSchedules([]);
  };

  // ============================================================================
  // 8. ACTION HANDLERS (SCHEDULE MANAGEMENT)
  // ============================================================================
  const getSlotFromTime = (timeStr) => {
    if (!timeStr) return 1;
    if (timeStr.startsWith("08:40")) return 1;
    if (timeStr.startsWith("12:00")) return 2;
    if (timeStr.startsWith("14:30")) return 3;
    if (timeStr.startsWith("17:00")) return 4;
    return 1;
  };

  const getSlotDisplayLabel = (timeStr) => {
    const slotValue = getSlotFromTime(timeStr);
    const slotObj = SLOT_OPTIONS.find((s) => s.value === slotValue);
    return slotObj ? slotObj.label : timeStr;
  };

  const handleOpenAddSchedule = () => {
    setIsEditingSchedule(false);
    setCurrentScheduleId(null);
    setScheduleFormData({
      course_code: "",
      course_name: "",
      instructor_name: "",
      day_of_week: "Monday",
      slot_number: 1,
      semester: "1",
      academic_year: "2026",
      valid_from: "",
      valid_until: "",
    });
    setOpenScheduleDialog(true);
  };

  const handleOpenEditSchedule = (sch) => {
    setIsEditingSchedule(true);
    setCurrentScheduleId(sch.id);
    setScheduleFormData({
      course_code: sch.course_code,
      course_name: sch.course_name || "",
      instructor_name: sch.instructor_name || "",
      day_of_week: sch.day_of_week,
      slot_number: getSlotFromTime(sch.start_time),
      semester: sch.semester,
      academic_year: sch.academic_year,
      valid_from: sch.valid_from,
      valid_until: sch.valid_until,
    });
    setOpenScheduleDialog(true);
  };

  const handleSaveSchedule = async () => {
    if (
      !scheduleFormData.course_code ||
      !scheduleFormData.valid_from ||
      !scheduleFormData.valid_until
    ) {
      return alert(t("admin.missingRequiredFields"));
    }

    if (scheduleFormData.valid_from > scheduleFormData.valid_until) {
      return alert(t("admin.invalidScheduleDates"));
    }

    try {
      const payload = { ...scheduleFormData, lab_id: activeLab.id };
      if (isEditingSchedule) {
        await axios.put(
          `${API_URL}/admin/schedules/${currentScheduleId}`,
          payload,
          authConfig(),
        );
      } else {
        await axios.post(`${API_URL}/admin/schedules`, payload, authConfig());
      }
      setOpenScheduleDialog(false);
      fetchSchedules(activeLab.id);
    } catch (error) {
      alert(
        `${t("admin.operationFailed")}: ${error.response?.data?.detail || ""}`,
      );
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm(t("admin.deleteScheduleConfirmation"))) return;
    try {
      await axios.delete(
        `${API_URL}/admin/schedules/${scheduleId}`,
        authConfig(),
      );
      fetchSchedules(activeLab.id);
    } catch {
      alert(t("admin.deleteFailed"));
    }
  };

  // ============================================================================
  // 9. RENDER UI
  // ============================================================================
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
      {/* --- SIDEBAR --- */}
      <Box
        className="sidebar admin-sidebar"
        sx={{
          width: "var(--sidebar-width)",
          bgcolor: "#f0f7ff",
          borderRight: "1px solid #e2efff",
          display: "flex",
          flexDirection: "column",
          position: "sticky",
          top: 0,
          height: "100vh",
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

      {/* --- MAIN AREA --- */}
      <Box
        className="main-area admin-main-area"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        }}
      >
        {/* HEADER */}
        <Box
          className="top-header admin-top-header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 6,
            py: 1,
            bgcolor: "white",
            zIndex: 5,
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {viewMode === "list"
              ? t("admin.manageLabsTitle")
              : t("common.details")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Paper
              className="admin-search-control"
              elevation={0}
              sx={{
                px: 2,
                py: 0.5,
                display: "flex",
                alignItems: "center",
                width: 400,
                height: 44,
              }}
            >
              <Search sx={{ color: "var(--text-muted)", mr: 1.5 }} />
              <InputBase
                placeholder={t("admin.searchLabs")}
                fullWidth
                sx={{ fontSize: "15px", fontWeight: "400" }}
              />
            </Paper>
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
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="subtitle2"
                  fontWeight="700"
                  color="#1e293b"
                >
                  {currentUser?.name || t("common.systemAdmin")}
                </Typography>
                <Typography variant="caption" fontWeight="500" color="#94a3b8">
                  {t("common.administrator")}
                </Typography>
              </Box>
              <IconButton
                onClick={handleAvatarClick}
                sx={{
                  p: 0.8,
                  "&:hover": { bgcolor: "#f1f5f9" },
                }}
              >
                <Avatar
                  sx={{
                    bgcolor: "#0f172a",
                    width: 36,
                    height: 36,
                    boxShadow: "0 4px 10px rgba(0,0,0,0.1)",
                  }}
                >
                  <Person sx={{ fontSize: 20 }} />
                </Avatar>
              </IconButton>

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
                    {currentUser?.email || "admin@smartlab.ac.th"}
                  </Typography>
                  <IconButton size="small" onClick={handleCloseUserMenu}>
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
                    {currentUser?.name || t("common.systemAdmin")}
                  </Typography>
                </Box>

                <Divider />

                {/* ปุ่ม Log out อย่างเดียว */}
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

        {/* CONTENT BODY */}
        <Box
          className="content-area admin-content-area page-content"
          sx={{ p: 6, flex: 1 }}
        >
          {/* ================= VIEW 1: LIST LABS ================= */}
          {!activeLab && (
            <Fade in={viewMode === "list"} timeout={400}>
              <Box>
                <Box
                  className="page-header"
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 4,
                  }}
                >
                  <Typography variant="h6" fontWeight="600" color="#64748b">
                    {t("admin.allLaboratoryRooms")}
                  </Typography>
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<Add />}
                    onClick={() => setOpenCreateDialog(true)}
                    sx={{
                      bgcolor: "#3b82f6",
                      fontWeight: "600",
                      textTransform: "none",
                      borderRadius: 3,
                      px: 3,
                      py: 1.2,
                      transition: "all 0.2s",
                      "&:hover": {
                        bgcolor: "#2563eb",
                        transform: "scale(1.05)",
                      },
                    }}
                  >
                    {t("admin.addLab")}
                  </Button>
                </Box>

                <Grid container spacing={4}>
                  {labs.map((lab) => (
                    <Grid
                      item
                      xs={12}
                      sm={6}
                      lg={4}
                      key={lab.id}
                      sx={{ minWidth: 0 }}
                    >
                      <Paper
                        elevation={0}
                        onClick={() => handleSelectLab(lab)}
                        className="lab-card surface-card"
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          height: "100%",
                          cursor: "pointer",
                          borderRadius: 6,
                          overflow: "hidden",
                          bgcolor: "white",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                          "&:hover": {
                            transform: "translateY(-6px)",
                            boxShadow: "0 20px 40px rgba(59, 130, 246, 0.15)",
                            borderColor: "#93c5fd",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            height: "150px",
                            bgcolor: "#f8fafc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Computer
                            sx={{
                              fontSize: 60,
                              color: "#cbd5e1",
                              transition: "0.3s",
                              "$:hover &": { color: "#3b82f6" },
                            }}
                          />
                        </Box>
                        <Box sx={{ p: 4, flexGrow: 1, minWidth: 0 }}>
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
                              fontWeight="700"
                              color="#1e293b"
                              sx={{
                                minWidth: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {lab.code}
                            </Typography>
                            <Chip
                              label={
                                lab.status === "active"
                                  ? t("common.active")
                                  : t("admin.disabled")
                              }
                              sx={{
                                bgcolor:
                                  lab.status === "active"
                                    ? "#dcfce7"
                                    : "#fee2e2",
                                color:
                                  lab.status === "active"
                                    ? "#16a34a"
                                    : "#ef4444",
                                fontWeight: "700",
                                fontSize: "12px",
                                flexShrink: 0,
                              }}
                              size="small"
                            />
                          </Box>
                          <Typography
                            variant="body2"
                            color="#64748b"
                            fontWeight="400"
                            className="lab-card-name"
                            title={lab.name}
                            sx={{ mt: 1 }}
                          >
                            {lab.name}
                          </Typography>
                          <Divider sx={{ my: 2.5, borderColor: "#f1f5f9" }} />
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              color: "#94a3b8",
                              fontWeight: "500",
                              fontSize: "14px",
                              minWidth: 0,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                minWidth: 0,
                              }}
                            >
                              <PeopleAlt
                                fontSize="small"
                                sx={{ color: "#cbd5e1" }}
                              />{" "}
                              {lab.capacity} {t("admin.users")}
                            </Box>
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
                              📍 {lab.location || "-"}
                            </Box>
                          </Box>
                        </Box>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              </Box>
            </Fade>
          )}

          {/* ================= VIEW 2: LAB DETAILS ================= */}
          {activeLab && (
            <Box>
              <Button
                startIcon={<ArrowBack />}
                onClick={handleGoBack}
                sx={{
                  mb: 4,
                  color: "#64748b",
                  fontWeight: "600",
                  textTransform: "none",
                  transition: "all 0.2s",
                  "&:hover": {
                    color: "#0f172a",
                    bgcolor: "transparent",
                    transform: "translateX(-5px)",
                  },
                }}
              >
                {t("admin.backToAllRooms")}
              </Button>

              <Grid container spacing={5}>
                {/* --- Left Column: Display Info --- */}
                <Grid item xs={12} md={4}>
                  <Slide
                    direction="right"
                    in={viewMode === "detail"}
                    timeout={400}
                    mountOnEnter
                    unmountOnExit
                  >
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 6,
                        overflow: "hidden",
                        border: "1px solid #e2e8f0",
                        bgcolor: "white",
                        boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                      }}
                    >
                      <Box
                        sx={{
                          height: "220px",
                          bgcolor: "#f8fafc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Computer sx={{ fontSize: 90, color: "#cbd5e1" }} />
                      </Box>
                      <Box sx={{ p: 4 }}>
                        <Typography
                          variant="h3"
                          fontWeight="700"
                          color="#1e293b"
                          sx={{ letterSpacing: "-1px" }}
                          gutterBottom
                        >
                          {activeLab.code}
                        </Typography>
                        <Typography
                          variant="body1"
                          color="#64748b"
                          fontWeight="400"
                          sx={{ mb: 4, lineHeight: 1.6 }}
                        >
                          {activeLab.name}
                        </Typography>
                        <Divider sx={{ mb: 3, borderColor: "#f1f5f9" }} />
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 2.5,
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <Avatar
                              sx={{ bgcolor: "#f1f5f9", width: 40, height: 40 }}
                            >
                              <PeopleAlt sx={{ color: "#64748b" }} />
                            </Avatar>
                            <Typography
                              variant="subtitle1"
                              fontWeight="600"
                              color="#334155"
                            >
                              {t("admin.capacity")}: {activeLab.capacity}{" "}
                              {t("admin.users")}
                            </Typography>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 2,
                            }}
                          >
                            <Avatar
                              sx={{ bgcolor: "#f1f5f9", width: 40, height: 40 }}
                            >
                              <MeetingRoom sx={{ color: "#64748b" }} />
                            </Avatar>
                            <Typography
                              variant="subtitle1"
                              fontWeight="600"
                              color="#334155"
                            >
                              {t("admin.location")}: {activeLab.location || "-"}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    </Paper>
                  </Slide>
                </Grid>

                {/* --- Right Column: Forms & Settings --- */}
                <Grid item xs={12} md={8}>
                  <Slide
                    direction="up"
                    in={viewMode === "detail"}
                    timeout={600}
                    mountOnEnter
                    unmountOnExit
                  >
                    <Box
                      sx={{ display: "flex", flexDirection: "column", gap: 4 }}
                    >
                      {/* Section 1: Edit Lab Data */}
                      <Paper
                        elevation={0}
                        sx={{
                          p: 5,
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                          bgcolor: "white",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                        }}
                      >
                        <Typography
                          variant="h6"
                          fontWeight="700"
                          color="#1e293b"
                          sx={{ mb: 3 }}
                        >
                          {t("admin.editLabInformation")}
                        </Typography>
                        <Grid container spacing={3}>
                          <Grid item xs={12} sm={6}>
                            <Typography
                              variant="caption"
                              fontWeight="600"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              {t("admin.labCode")}
                            </Typography>
                            <TextField
                              fullWidth
                              variant="outlined"
                              size="small"
                              value={editFormData.code}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  code: e.target.value,
                                })
                              }
                              sx={{
                                "& .MuiOutlinedInput-root": { borderRadius: 3 },
                              }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Typography
                              variant="caption"
                              fontWeight="600"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              {t("admin.labName")}
                            </Typography>
                            <TextField
                              fullWidth
                              variant="outlined"
                              size="small"
                              value={editFormData.name}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  name: e.target.value,
                                })
                              }
                              sx={{
                                "& .MuiOutlinedInput-root": { borderRadius: 3 },
                              }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Typography
                              variant="caption"
                              fontWeight="600"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              {t("admin.capacity")}
                            </Typography>
                            <TextField
                              type="number"
                              fullWidth
                              variant="outlined"
                              size="small"
                              value={editFormData.capacity}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  capacity: parseInt(e.target.value),
                                })
                              }
                              sx={{
                                "& .MuiOutlinedInput-root": { borderRadius: 3 },
                              }}
                            />
                          </Grid>
                          <Grid item xs={12} sm={6}>
                            <Typography
                              variant="caption"
                              fontWeight="600"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              {t("admin.location")}
                            </Typography>
                            <TextField
                              fullWidth
                              variant="outlined"
                              size="small"
                              value={editFormData.location}
                              onChange={(e) =>
                                setEditFormData({
                                  ...editFormData,
                                  location: e.target.value,
                                })
                              }
                              sx={{
                                "& .MuiOutlinedInput-root": { borderRadius: 3 },
                              }}
                            />
                          </Grid>
                        </Grid>

                        <Box
                          sx={{
                            mt: 4,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Button
                            variant="outlined"
                            color="error"
                            startIcon={<Delete />}
                            onClick={handleDeleteLab}
                            sx={{
                              fontWeight: "600",
                              borderRadius: 3,
                              textTransform: "none",
                              borderWidth: 2,
                              "&:hover": { borderWidth: 2, bgcolor: "#fef2f2" },
                            }}
                          >
                            {t("admin.deleteLab")}
                          </Button>
                          <Button
                            variant="contained"
                            disableElevation
                            startIcon={<Save />}
                            onClick={handleUpdateLab}
                            sx={{
                              bgcolor: "#0f172a",
                              color: "white",
                              fontWeight: "600",
                              px: 4,
                              py: 1.2,
                              borderRadius: 3,
                              textTransform: "none",
                              "&:hover": { bgcolor: "#334155" },
                            }}
                          >
                            {t("admin.saveChanges")}
                          </Button>
                        </Box>
                      </Paper>

                      {/* Section 2: Enable/Disable Access */}
                      <Paper
                        elevation={0}
                        sx={{
                          p: 4,
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                          bgcolor: "#f8fafc",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                        }}
                      >
                        <Box>
                          <Typography
                            variant="subtitle1"
                            fontWeight="700"
                            color="#1e293b"
                          >
                            {activeLab.status === "active"
                              ? t("admin.disableLaboratory")
                              : t("admin.enableLaboratory")}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="#64748b"
                            fontWeight="400"
                            sx={{ mt: 0.5 }}
                          >
                            {activeLab.status === "active"
                              ? t("admin.suspendRoomBookings")
                              : t("admin.allowRoomBookings")}
                          </Typography>
                        </Box>
                        <Button
                          variant={
                            activeLab.status === "active"
                              ? "outlined"
                              : "contained"
                          }
                          disableElevation
                          color={
                            activeLab.status === "active" ? "error" : "success"
                          }
                          onClick={handleToggleStatus}
                          sx={{
                            fontWeight: "600",
                            textTransform: "none",
                            borderRadius: 3,
                            px: 3,
                            py: 1,
                            borderWidth: activeLab.status === "active" ? 2 : 0,
                            "&:hover": {
                              borderWidth:
                                activeLab.status === "active" ? 2 : 0,
                            },
                          }}
                        >
                          {activeLab.status === "active"
                            ? t("admin.disableAccess")
                            : t("admin.enableAccess")}
                        </Button>
                      </Paper>

                      {/* Section 3: Class Schedules Table */}
                      <Paper
                        elevation={0}
                        sx={{
                          p: 5,
                          borderRadius: 6,
                          border: "1px solid #e2e8f0",
                          bgcolor: "white",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
                        }}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            mb: 4,
                          }}
                        >
                          <Box>
                            <Typography
                              variant="h6"
                              fontWeight="700"
                              color="#1e293b"
                            >
                              {t("admin.classSchedules")}
                            </Typography>
                            <Typography
                              variant="body2"
                              color="#94a3b8"
                              fontWeight="400"
                            >
                              {t("admin.classSchedulesHint")}
                            </Typography>
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Add />}
                            onClick={handleOpenAddSchedule}
                            sx={{
                              fontWeight: "600",
                              borderRadius: 3,
                              textTransform: "none",
                              px: 2,
                              py: 1,
                              borderColor: "#cbd5e1",
                              color: "#0f172a",
                            }}
                          >
                            {t("admin.addClass")}
                          </Button>
                        </Box>

                        <TableContainer
                          sx={{ borderRadius: 4, border: "1px solid #e2e8f0" }}
                        >
                          <Table>
                            <TableHead>
                              <TableRow sx={{ bgcolor: "#f8fafc" }}>
                                {[
                                  t("admin.dayOfWeek"),
                                  t("admin.timeSlot"),
                                  t("admin.course"),
                                  t("admin.instructor"),
                                  t("admin.term"),
                                  t("admin.action"),
                                ].map((h, i) => (
                                  <TableCell
                                    key={h}
                                    align={i === 5 ? "right" : "left"}
                                    sx={{
                                      borderBottom: "1px solid #e2e8f0",
                                      color: "#64748b",
                                      fontWeight: "700",
                                      py: 2,
                                    }}
                                  >
                                    {h}
                                  </TableCell>
                                ))}
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {schedules.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={6}
                                    align="center"
                                    sx={{
                                      py: 4,
                                      color: "#94a3b8",
                                      fontWeight: "400",
                                      borderBottom: "none",
                                    }}
                                  >
                                    {t("common.noData")}
                                  </TableCell>
                                </TableRow>
                              ) : (
                                schedules.map((sch) => (
                                  <TableRow
                                    key={sch.id}
                                    sx={{
                                      "& td": {
                                        borderBottom: "1px solid #f1f5f9",
                                      },
                                    }}
                                  >
                                    <TableCell
                                      sx={{
                                        fontWeight: "600",
                                        color: "#334155",
                                      }}
                                    >
                                      {getDayLabel(sch.day_of_week, t)}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {getSlotDisplayLabel(sch.start_time)}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: "600",
                                        color: "#334155",
                                      }}
                                    >
                                      {sch.course_code}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "400",
                                      }}
                                    >
                                      {sch.instructor_name}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "400",
                                      }}
                                    >
                                      {sch.semester}/{sch.academic_year}
                                    </TableCell>
                                    <TableCell align="right">
                                      <IconButton
                                        size="small"
                                        sx={{
                                          color: "#3b82f6",
                                          mr: 1,
                                          bgcolor: "#eff6ff",
                                        }}
                                        onClick={() =>
                                          handleOpenEditSchedule(sch)
                                        }
                                      >
                                        <Edit fontSize="small" />
                                      </IconButton>
                                      <IconButton
                                        size="small"
                                        sx={{
                                          color: "#ef4444",
                                          bgcolor: "#fef2f2",
                                        }}
                                        onClick={() =>
                                          handleDeleteSchedule(sch.id)
                                        }
                                      >
                                        <Delete fontSize="small" />
                                      </IconButton>
                                    </TableCell>
                                  </TableRow>
                                ))
                              )}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      </Paper>
                    </Box>
                  </Slide>
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
      </Box>

      {/* ============================================================================
          10. DIALOGS (Pop-ups)
          ============================================================================ */}

      {/* Dialog: Create New Lab */}
      <Dialog
        open={openCreateDialog}
        onClose={() => setOpenCreateDialog(false)}
        PaperProps={{
          sx: {
            borderRadius: 4,
            p: 2,
            minWidth: 400,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: "700", color: "#0f172a" }}>
          {t("admin.createNewLab")}
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}
        >
          <TextField
            label={t("admin.labCode")}
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.code}
            onChange={(e) => setNewLab({ ...newLab, code: e.target.value })}
            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label={t("admin.labName")}
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.name}
            onChange={(e) => setNewLab({ ...newLab, name: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label={t("admin.capacity")}
            type="number"
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.capacity}
            onChange={(e) =>
              setNewLab({ ...newLab, capacity: parseInt(e.target.value) })
            }
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label={t("admin.location")}
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.location}
            onChange={(e) => setNewLab({ ...newLab, location: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
        </DialogContent>
        <DialogActions sx={{ pb: 1, pr: 2 }}>
          <Button
            onClick={() => setOpenCreateDialog(false)}
            sx={{ color: "#64748b", fontWeight: "600", textTransform: "none" }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleCreateLab}
            variant="contained"
            disableElevation
            sx={{
              bgcolor: "#0f172a",
              fontWeight: "600",
              borderRadius: 3,
              textTransform: "none",
            }}
          >
            {t("admin.createLab")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Add/Edit Class Schedule */}
      <Dialog
        open={openScheduleDialog}
        onClose={() => setOpenScheduleDialog(false)}
        PaperProps={{
          sx: {
            borderRadius: 4,
            p: 2,
            minWidth: 500,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: "700", color: "#0f172a" }}>
          {isEditingSchedule
            ? t("admin.editClassSchedule")
            : t("admin.addClassSchedule")}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
            <Grid item xs={6}>
              <TextField
                label={t("admin.courseCode")}
                fullWidth
                size="small"
                value={scheduleFormData.course_code}
                onChange={(e) =>
                  setScheduleFormData({
                    ...scheduleFormData,
                    course_code: e.target.value,
                  })
                }
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label={t("admin.courseName")}
                fullWidth
                size="small"
                value={scheduleFormData.course_name}
                onChange={(e) =>
                  setScheduleFormData({
                    ...scheduleFormData,
                    course_name: e.target.value,
                  })
                }
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label={t("admin.instructorName")}
                fullWidth
                size="small"
                value={scheduleFormData.instructor_name}
                onChange={(e) =>
                  setScheduleFormData({
                    ...scheduleFormData,
                    instructor_name: e.target.value,
                  })
                }
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Grid>

            <Grid item xs={6}>
              <FormControl
                fullWidth
                size="small"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              >
                <InputLabel>{t("admin.dayOfWeek")}</InputLabel>
                <Select
                  value={scheduleFormData.day_of_week}
                  label={t("admin.dayOfWeek")}
                  onChange={(e) =>
                    setScheduleFormData({
                      ...scheduleFormData,
                      day_of_week: e.target.value,
                    })
                  }
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <MenuItem key={day} value={day}>
                      {getDayLabel(day, t)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6}>
              <FormControl
                fullWidth
                size="small"
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              >
                <InputLabel>{t("admin.timeSlot")}</InputLabel>
                <Select
                  value={scheduleFormData.slot_number}
                  label={t("admin.timeSlot")}
                  onChange={(e) =>
                    setScheduleFormData({
                      ...scheduleFormData,
                      slot_number: e.target.value,
                    })
                  }
                >
                  {SLOT_OPTIONS.map((slot) => (
                    <MenuItem key={slot.value} value={slot.value}>
                      {slot.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={6}>
              <TextField
                label={t("admin.semester")}
                fullWidth
                size="small"
                value={scheduleFormData.semester}
                onChange={(e) =>
                  setScheduleFormData({
                    ...scheduleFormData,
                    semester: e.target.value,
                  })
                }
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                label={t("admin.academicYear")}
                fullWidth
                size="small"
                value={scheduleFormData.academic_year}
                onChange={(e) =>
                  setScheduleFormData({
                    ...scheduleFormData,
                    academic_year: e.target.value,
                  })
                }
                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
              />
            </Grid>

            <LocalizationProvider dateAdapter={AdapterDayjs}>
              <Grid item xs={6}>
                <DatePicker
                  label={t("admin.validFrom")}
                  format="DD/MM/YYYY"
                  value={
                    scheduleFormData.valid_from
                      ? dayjs(scheduleFormData.valid_from)
                      : null
                  }
                  onChange={(newValue) =>
                    setScheduleFormData({
                      ...scheduleFormData,
                      valid_from: newValue ? newValue.format("YYYY-MM-DD") : "",
                    })
                  }
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      sx: { "& .MuiOutlinedInput-root": { borderRadius: 3 } },
                    },
                  }}
                />
              </Grid>
              <Grid item xs={6}>
                <DatePicker
                  label={t("admin.validUntil")}
                  format="DD/MM/YYYY"
                  value={
                    scheduleFormData.valid_until
                      ? dayjs(scheduleFormData.valid_until)
                      : null
                  }
                  onChange={(newValue) =>
                    setScheduleFormData({
                      ...scheduleFormData,
                      valid_until: newValue
                        ? newValue.format("YYYY-MM-DD")
                        : "",
                    })
                  }
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      size: "small",
                      sx: { "& .MuiOutlinedInput-root": { borderRadius: 3 } },
                    },
                  }}
                />
              </Grid>
            </LocalizationProvider>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ pb: 1, pr: 2 }}>
          <Button
            onClick={() => setOpenScheduleDialog(false)}
            sx={{ color: "#64748b", fontWeight: "600", textTransform: "none" }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSaveSchedule}
            variant="contained"
            disableElevation
            sx={{
              bgcolor: "#0f172a",
              fontWeight: "600",
              borderRadius: 3,
              textTransform: "none",
            }}
          >
            {isEditingSchedule ? t("common.save") : t("admin.saveChanges")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
