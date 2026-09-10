// ============================================================================
// 1. IMPORTS & CONFIGURATION
// ============================================================================
import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Paper,
  Grid,
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
  Notifications,
  ConfirmationNumber,
  Logout,
  Computer,
  Person,
  PeopleAlt,
  Dashboard as DashIcon,
  MeetingRoom,
  Add,
  ArrowBack,
  Save,
  Delete,
  Edit,
  HowToReg,
  Block,
  Settings,
  Close,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

// นำเข้า MUI DatePicker
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs from "dayjs";

const API_URL = import.meta.env.VITE_API_URL;

// ============================================================================
// 2. STATIC DATA
// ============================================================================
const SIDE_MENU_ITEMS = [
  {
    text: "Dashboard",
    icon: <DashIcon sx={{ fontSize: 20 }} />,
    path: "/admin",
  },
  {
    text: "Manage Labs",
    icon: <MeetingRoom sx={{ fontSize: 20 }} />,
    path: "/manage-labs",
  },
  {
    text: "Verify Users",
    icon: <HowToReg sx={{ fontSize: 20 }} />,
    path: "/verify-users",
  },
  {
    text: "Blacklist",
    icon: <Block sx={{ fontSize: 20 }} />,
    path: "/blacklist",
  },
  {
    text: "Ticket",
    icon: <ConfirmationNumber sx={{ fontSize: 20 }} />,
    path: "/ticket",
  },
];

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

// ============================================================================
// 3. MAIN COMPONENT
// ============================================================================
export default function ManageLabs() {
  const navigate = useNavigate();
  const location = useLocation();

  // --- User menu (avatar dropdown) ---
  const [anchorEl, setAnchorEl] = useState(null);
  const openUserMenu = Boolean(anchorEl);
  const handleAvatarClick = (e) => setAnchorEl(e.currentTarget);
  const handleCloseUserMenu = () => setAnchorEl(null);
  const handleLogout = () => {
    handleCloseUserMenu();
    navigate("/login");
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
  useEffect(() => {
    fetchLabs();
  }, []);

  const fetchLabs = async () => {
    try {
      const response = await axios.get(`${API_URL}/labs`);
      setLabs(response.data.data);
      if (activeLab) {
        const updatedLab = response.data.data.find(
          (l) => l.id === activeLab.id,
        );
        if (updatedLab) setActiveLab(updatedLab);
      }
    } catch (error) {
      console.error("[API Error] Fetch labs failed:", error);
    }
  };

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
      await axios.post(`${API_URL}/admin/labs`, newLab);
      setOpenCreateDialog(false);
      setNewLab({ name: "", code: "", capacity: 40, location: "" });
      fetchLabs();
    } catch (error) {
      alert(error.response?.data?.detail || "Create lab failed");
    }
  };

  const handleUpdateLab = async () => {
    try {
      await axios.put(`${API_URL}/admin/labs/${activeLab.id}`, editFormData);
      alert("Updated successfully!");
      fetchLabs();
    } catch (error) {
      alert(error.response?.data?.detail || "Update failed");
    }
  };

  const handleDeleteLab = async () => {
    if (
      !window.confirm(
        `⚠️ Are you sure you want to permanently delete ${activeLab.code}?\nThis will also delete all associated schedules. This action cannot be undone.`,
      )
    )
      return;

    try {
      await axios.delete(`${API_URL}/admin/labs/${activeLab.id}`);
      alert("Lab deleted successfully!");
      handleGoBack();
      fetchLabs();
    } catch (error) {
      alert(`Delete failed: ${error.response?.data?.detail || error.message}`);
    }
  };

  const handleToggleStatus = async () => {
    const newStatus = activeLab.status === "active" ? "disabled" : "active";
    try {
      await axios.put(`${API_URL}/admin/labs/${activeLab.id}/status`, {
        status: newStatus,
      });
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
      return alert("Missing required fields");
    }

    try {
      const payload = { ...scheduleFormData, lab_id: activeLab.id };
      if (isEditingSchedule) {
        await axios.put(
          `${API_URL}/admin/schedules/${currentScheduleId}`,
          payload,
        );
      } else {
        await axios.post(`${API_URL}/admin/schedules`, payload);
      }
      setOpenScheduleDialog(false);
      fetchSchedules(activeLab.id);
    } catch (error) {
      alert(`Operation failed: ${error.response?.data?.detail}`);
    }
  };

  const handleDeleteSchedule = async (scheduleId) => {
    if (!window.confirm("Are you sure you want to delete this schedule?"))
      return;
    try {
      await axios.delete(`${API_URL}/admin/schedules/${scheduleId}`);
      fetchSchedules(activeLab.id);
    } catch (error) {
      alert("Delete failed");
    }
  };

  // ============================================================================
  // 9. RENDER UI
  // ============================================================================
  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "#fcfdfe",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* --- SIDEBAR --- */}
      <Box
        sx={{
          width: "240px",
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
        <Box sx={{ p: 4, display: "flex", gap: 2, alignItems: "center" }}>
          <Box
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
              fontWeight="800"
              sx={{ color: "#0f172a", letterSpacing: "-0.5px" }}
            >
              Smart Lab
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: "#64748b",
                fontWeight: "500",
                display: "block",
                mt: -0.5,
              }}
            >
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
                    color: isActive ? "#3b82f6" : "#64748b",
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

      {/* --- MAIN AREA --- */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        }}
      >
        {/* HEADER */}
        <Box
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
            fontWeight="800"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {viewMode === "list" ? "Manage Labs" : "Lab Details"}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Paper
              elevation={0}
              sx={{
                bgcolor: "#f1f5f9",
                px: 2,
                py: 0.5,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                width: 400,
                height: 44,
              }}
            >
              <Search sx={{ color: "#94a3b8", mr: 1.5 }} />
              <InputBase
                placeholder="Search labs...."
                fullWidth
                sx={{ fontSize: "15px", fontWeight: "500" }}
              />
            </Paper>
            <IconButton sx={{ bgcolor: "#f8fafc" }}>
              <Notifications sx={{ color: "#64748b" }} />
            </IconButton>
            <Divider
              orientation="vertical"
              flexItem
              sx={{ height: 30, my: "auto", bgcolor: "#e2e8f0" }}
            />
            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  variant="subtitle2"
                  fontWeight="800"
                  color="#1e293b"
                >
                  System Admin
                </Typography>
                <Typography variant="caption" fontWeight="600" color="#94a3b8">
                  Administrator
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
                {/* header: identity email + close */}
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
                    admin@smartlab.ac.th
                  </Typography>
                  <IconButton size="small" onClick={handleCloseUserMenu}>
                    <Close sx={{ fontSize: 18, color: "#64748b" }} />
                  </IconButton>
                </Box>

                {/* avatar + greeting */}
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
                    fontWeight="700"
                    fontSize="18px"
                  >
                    Hi, System Admin
                  </Typography>

                  <Button
                    variant="outlined"
                    onClick={handleCloseUserMenu}
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

                {/* settings + sign out */}
                <Box sx={{ px: 1, py: 1 }}>
                  <Box
                    onClick={handleCloseUserMenu}
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
                      fontWeight="700"
                      color="#ef4444"
                    >
                      Log out
                    </Typography>
                  </Box>
                </Box>
              </Popover>
            </Box>
          </Box>
        </Box>

        {/* CONTENT BODY */}
        <Box sx={{ p: 6, flex: 1 }}>
          {/* ================= VIEW 1: LIST LABS ================= */}
          {!activeLab && (
            <Fade in={viewMode === "list"} timeout={400}>
              <Box>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    mb: 4,
                  }}
                >
                  <Typography variant="h6" fontWeight="700" color="#64748b">
                    All Laboratory Rooms
                  </Typography>
                  <Button
                    variant="contained"
                    disableElevation
                    startIcon={<Add />}
                    onClick={() => setOpenCreateDialog(true)}
                    sx={{
                      bgcolor: "#3b82f6",
                      fontWeight: "700",
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
                    Add New Lab
                  </Button>
                </Box>

                <Grid container spacing={4}>
                  {labs.map((lab) => (
                    <Grid item xs={12} sm={6} lg={4} key={lab.id}>
                      <Paper
                        elevation={0}
                        onClick={() => handleSelectLab(lab)}
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
                        <Box sx={{ p: 4, flexGrow: 1 }}>
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Typography
                              variant="h5"
                              fontWeight="800"
                              color="#1e293b"
                            >
                              {lab.code}
                            </Typography>
                            <Chip
                              label={
                                lab.status === "active" ? "Active" : "Disabled"
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
                                fontWeight: "800",
                                fontSize: "12px",
                              }}
                              size="small"
                            />
                          </Box>
                          <Typography
                            variant="body2"
                            color="#64748b"
                            fontWeight="500"
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
                              fontWeight: "600",
                              fontSize: "14px",
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                              }}
                            >
                              <PeopleAlt
                                fontSize="small"
                                sx={{ color: "#cbd5e1" }}
                              />{" "}
                              {lab.capacity} Users
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
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
                  fontWeight: "700",
                  textTransform: "none",
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
                          fontWeight="800"
                          color="#1e293b"
                          sx={{ letterSpacing: "-1px" }}
                          gutterBottom
                        >
                          {activeLab.code}
                        </Typography>
                        <Typography
                          variant="body1"
                          color="#64748b"
                          fontWeight="500"
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
                              fontWeight="700"
                              color="#334155"
                            >
                              Capacity: {activeLab.capacity} Users
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
                              fontWeight="700"
                              color="#334155"
                            >
                              Location: {activeLab.location || "-"}
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
                          fontWeight="800"
                          color="#1e293b"
                          sx={{ mb: 3 }}
                        >
                          Edit Lab Information
                        </Typography>
                        <Grid container spacing={3}>
                          <Grid item xs={12} sm={6}>
                            <Typography
                              variant="caption"
                              fontWeight="700"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              Lab Code
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
                              fontWeight="700"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              Lab Name
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
                              fontWeight="700"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              Capacity
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
                              fontWeight="700"
                              color="#94a3b8"
                              sx={{
                                mb: 1,
                                display: "block",
                                textTransform: "uppercase",
                              }}
                            >
                              Location
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
                              fontWeight: "700",
                              borderRadius: 3,
                              textTransform: "none",
                              borderWidth: 2,
                              "&:hover": { borderWidth: 2, bgcolor: "#fef2f2" },
                            }}
                          >
                            Delete Lab
                          </Button>
                          <Button
                            variant="contained"
                            disableElevation
                            startIcon={<Save />}
                            onClick={handleUpdateLab}
                            sx={{
                              bgcolor: "#0f172a",
                              color: "white",
                              fontWeight: "700",
                              px: 4,
                              py: 1.2,
                              borderRadius: 3,
                              textTransform: "none",
                              "&:hover": { bgcolor: "#334155" },
                            }}
                          >
                            Save Changes
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
                            fontWeight="800"
                            color="#1e293b"
                          >
                            {activeLab.status === "active"
                              ? "Disable this laboratory"
                              : "Enable this laboratory"}
                          </Typography>
                          <Typography
                            variant="body2"
                            color="#64748b"
                            fontWeight="500"
                            sx={{ mt: 0.5 }}
                          >
                            {activeLab.status === "active"
                              ? "Suspend bookings for this room."
                              : "Allow bookings for this room."}
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
                            fontWeight: "700",
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
                            ? "Disable Access"
                            : "Enable Access"}
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
                              fontWeight="800"
                              color="#1e293b"
                            >
                              Class Schedules
                            </Typography>
                            <Typography
                              variant="body2"
                              color="#94a3b8"
                              fontWeight="500"
                            >
                              Slots added here will be locked for student
                              booking.
                            </Typography>
                          </Box>
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<Add />}
                            onClick={handleOpenAddSchedule}
                            sx={{
                              fontWeight: "700",
                              borderRadius: 3,
                              textTransform: "none",
                              px: 2,
                              py: 1,
                              borderColor: "#cbd5e1",
                              color: "#0f172a",
                            }}
                          >
                            Add Class
                          </Button>
                        </Box>

                        <TableContainer
                          sx={{ borderRadius: 4, border: "1px solid #e2e8f0" }}
                        >
                          <Table>
                            <TableHead>
                              <TableRow sx={{ bgcolor: "#f8fafc" }}>
                                {[
                                  "Day",
                                  "Time Slot",
                                  "Course",
                                  "Instructor",
                                  "Term",
                                  "Action",
                                ].map((h, i) => (
                                  <TableCell
                                    key={h}
                                    align={i === 5 ? "right" : "left"}
                                    sx={{
                                      borderBottom: "1px solid #e2e8f0",
                                      color: "#64748b",
                                      fontWeight: "800",
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
                                      fontWeight: "500",
                                      borderBottom: "none",
                                    }}
                                  >
                                    No classes scheduled for this lab.
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
                                        fontWeight: "700",
                                        color: "#334155",
                                      }}
                                    >
                                      {sch.day_of_week}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {getSlotDisplayLabel(sch.start_time)}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        fontWeight: "700",
                                        color: "#334155",
                                      }}
                                    >
                                      {sch.course_code}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "500",
                                      }}
                                    >
                                      {sch.instructor_name}
                                    </TableCell>
                                    <TableCell
                                      sx={{
                                        color: "#64748b",
                                        fontWeight: "500",
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
        <DialogTitle sx={{ fontWeight: "800", color: "#0f172a" }}>
          Create New Lab
        </DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}
        >
          <TextField
            label="Lab Code"
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.code}
            onChange={(e) => setNewLab({ ...newLab, code: e.target.value })}
            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label="Lab Name"
            fullWidth
            variant="outlined"
            size="small"
            value={newLab.name}
            onChange={(e) => setNewLab({ ...newLab, name: e.target.value })}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label="Capacity"
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
            label="Location"
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
            sx={{ color: "#64748b", fontWeight: "700", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateLab}
            variant="contained"
            disableElevation
            sx={{
              bgcolor: "#0f172a",
              fontWeight: "700",
              borderRadius: 3,
              textTransform: "none",
            }}
          >
            Create Lab
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
        <DialogTitle sx={{ fontWeight: "800", color: "#0f172a" }}>
          {isEditingSchedule ? "Edit Class Schedule" : "Add Class Schedule"}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
            <Grid item xs={6}>
              <TextField
                label="Course Code"
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
                label="Course Name"
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
                label="Instructor Name"
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
                <InputLabel>Day of Week</InputLabel>
                <Select
                  value={scheduleFormData.day_of_week}
                  label="Day of Week"
                  onChange={(e) =>
                    setScheduleFormData({
                      ...scheduleFormData,
                      day_of_week: e.target.value,
                    })
                  }
                >
                  {DAYS_OF_WEEK.map((day) => (
                    <MenuItem key={day} value={day}>
                      {day}
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
                <InputLabel>Time Slot</InputLabel>
                <Select
                  value={scheduleFormData.slot_number}
                  label="Time Slot"
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
                label="Semester"
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
                label="Academic Year"
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
                  label="Valid From"
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
                  label="Valid Until"
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
            sx={{ color: "#64748b", fontWeight: "700", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveSchedule}
            variant="contained"
            disableElevation
            sx={{
              bgcolor: "#0f172a",
              fontWeight: "700",
              borderRadius: 3,
              textTransform: "none",
            }}
          >
            {isEditingSchedule ? "Update Schedule" : "Save Schedule"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
