import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Paper,
  CircularProgress,
  Divider,
  Chip,
  Grid,
  LinearProgress,
  Popover,
  Button,
  Alert,
} from "@mui/material";
import {
  Notifications,
  EventNote,
  Assignment,
  History,
  SupportAgent,
  Logout,
  Computer,
  Menu as MenuIcon,
  Email,
  Phone,
  School,
  Badge,
  CalendarMonth,
  Star,
  Person,
  Settings,
  Close,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";

const API_URL = import.meta.env.VITE_API_URL;

const FACULTY_NAMES = {
  business: "School of Business Administration",
  communication: "School of Communication Arts",
  engineering: "School of Engineering",
  it: "School of Information Technology and Innovation",
  architecture: "School of Architecture",
  humanities: "School of Humanities",
  finearts: "School of Fine and Applied Arts",
  law: "School of Law",
  accounting: "School of Accounting",
  economics: "School of Economics",
};

const POINT_REASON_LABELS = {
  daily_bonus: "Daily bonus",
  no_show: "ไม่มาตามการจอง",
  forbidden_app: "ใช้โปรแกรมต้องห้าม",
  late_cancel: "ยกเลิกการจองกระชั้นชิด",
  complete_session: "จบการใช้งานปกติ",
  admin_grant: "Admin อนุมัติเพิ่มคะแนน",
};

export default function Profile() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pointLogs, setPointLogs] = useState([]);
  const [pointsError, setPointsError] = useState("");
  const [pointRequestLoading, setPointRequestLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      navigate("/");
      return;
    }
    fetchProfile();
  }, [currentUser, navigate]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError("");
      setPointsError("");
      const token = localStorage.getItem("access_token");
      const headers = { Authorization: `Bearer ${token}` };

      const [profileResult, pointsResult, logsResult] = await Promise.allSettled([
        axios.get(`${API_URL}/users/me`, { headers }),
        axios.get(`${API_URL}/users/me/points`, { headers }),
        axios.get(`${API_URL}/users/me/points/logs?limit=20`, { headers }),
      ]);

      if (profileResult.status !== "fulfilled") {
        throw profileResult.reason;
      }

      const profileData = profileResult.value.data;
      const pointData =
        pointsResult.status === "fulfilled"
          ? pointsResult.value.data
          : { points: null, daily_score: null, points_loaded: false };

      if (pointsResult.status !== "fulfilled") {
        setPointsError("ไม่สามารถโหลดข้อมูลคะแนนได้ กรุณาลองใหม่อีกครั้ง");
      }
      setProfile({ ...profileData, ...pointData });
      setPointLogs(
        logsResult.status === "fulfilled" ? logsResult.value.data.data || [] : [],
      );
    } catch (err) {
      setError("ไม่สามารถโหลดข้อมูลโปรไฟล์ได้");
      console.error("[Profile] fetch failed:", err);
    } finally {
      setLoading(false);
    }
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

  const handlePointRequest = async () => {
    const token = localStorage.getItem("access_token");
    if (!token || numericPoints !== 0 || profile?.point_request?.status === "pending") return;

    try {
      setPointRequestLoading(true);
      const response = await axios.post(
        `${API_URL}/users/me/points/request`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const request = response.data?.point_request;
      if (request) {
        setProfile((currentProfile) => ({
          ...currentProfile,
          point_request: request,
          can_request_points: false,
        }));
      }
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      const message = typeof detail === "string" ? detail : "ไม่สามารถส่งคำขอเพิ่มคะแนนได้ กรุณาลองใหม่อีกครั้ง";
      window.alert(message);
    } finally {
      setPointRequestLoading(false);
    }
  };

  const formatDate = (d) =>
    d
      ? new Date(d).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "—";

  const roleColor =
    profile?.role === "student"
      ? "#3b82f6"
      : profile?.role === "admin"
        ? "#8b5cf6"
        : "#f59e0b";

  const roleLabel =
    profile?.role === "student"
      ? "นักศึกษา"
      : profile?.role === "admin"
        ? "ผู้ดูแลระบบ"
        : "บุคคลทั่วไป";

  const numericPoints =
    profile?.points == null ? null : Number(profile.points);
  const pointWarningThreshold = Number(profile?.points_warning_threshold) || 20;
  const pointRequestAmount = Number(profile?.point_request_amount) || 10;
  const pointRequest = profile?.point_request;
  const pointColor =
    numericPoints == null || !Number.isFinite(numericPoints)
      ? "#94a3b8"
      : numericPoints >= 80
        ? "#10b981"
        : numericPoints >= 60
          ? "#f59e0b"
          : "#ef4444";

  return (
    <div className="app-layout">
      {isSidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* sidebar */}
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
          <div className="menu-item" onClick={() => navigate("/booking")}>
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
          <div className="menu-item">
            <SupportAgent /> Support
          </div>
        </div>
      </div>

      <div className="main-area">
        {/* header */}
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
              My Profile
            </Typography>
          </Box>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: { xs: 1, sm: 3 },
            }}
          >
            <IconButton>
              <Notifications sx={{ color: "#111827" }} />
            </IconButton>
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
                <Box sx={{ textAlign: "right" }}>
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
                <Box sx={{ textAlign: "right" }}>
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

        {/* content */}
        <div className="content-area">
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", mt: 10 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Box sx={{ textAlign: "center", mt: 10 }}>
              <Typography color="error">{error}</Typography>
            </Box>
          ) : (
            profile && (
              <Box sx={{ maxWidth: "900px", mx: "auto", px: { xs: 0, sm: 2 } }}>
                {pointsError ? (
                  <Alert severity="error" sx={{ mb: 3 }}>
                    {pointsError}
                  </Alert>
                ) : numericPoints !== null &&
                  (profile.is_banned || numericPoints < 80) ? (
                  <Alert
                    severity={numericPoints === 0 || profile.is_banned ? "error" : "warning"}
                    sx={{ mb: 3 }}
                  >
                    {numericPoints === 0 ? (
                      <Box>
                        <Typography fontWeight="700">
                          คะแนนของคุณเหลือ 0 คะแนน จึงไม่สามารถจองห้องได้
                        </Typography>
                        {pointRequest?.status === "pending" ? (
                          <Typography variant="body2" sx={{ mt: 0.5 }}>
                            ส่งคำขอเพิ่ม {pointRequest.requested_points || pointRequestAmount} คะแนนแล้ว กรุณารอ Admin พิจารณา
                          </Typography>
                        ) : (
                          <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SupportAgent />}
                            onClick={handlePointRequest}
                            disabled={pointRequestLoading || profile.can_request_points === false}
                            sx={{ mt: 1.25, borderColor: "currentColor", color: "inherit", textTransform: "none", fontWeight: "700" }}
                          >
                            {pointRequestLoading ? "กำลังส่งคำขอ..." : `ติดต่อ Admin เพื่อขอเพิ่ม ${pointRequestAmount} คะแนน`}
                          </Button>
                        )}
                      </Box>
                    ) : profile.is_banned ? (
                      `บัญชีถูกระงับการจองถึง ${new Date(profile.ban_until).toLocaleString("th-TH")}`
                    ) : numericPoints <= pointWarningThreshold ? (
                      `คำเตือน: คะแนนเหลือ ${numericPoints} คะแนน ใกล้ถึง 0 และขณะนี้ไม่สามารถจองห้องได้`
                    ) : (
                      `คะแนนเหลือ ${numericPoints} คะแนน ต่ำกว่าเกณฑ์ 80 คะแนน จึงไม่สามารถจองห้องได้`
                    )}
                  </Alert>
                ) : null}
                <Grid container spacing={3}>
                  {/* ── LEFT COLUMN ── */}
                  <Grid item xs={12} md={4}>
                    {/* avatar card */}
                    <Paper
                      elevation={0}
                      sx={{
                        borderRadius: 4,
                        border: "1px solid #e2e8f0",
                        overflow: "hidden",
                        bgcolor: "white",
                      }}
                    >
                      {/* color banner */}
                      <Box
                        sx={{ height: 80, bgcolor: roleColor, opacity: 0.12 }}
                      />
                      <Box
                        sx={{ px: 3, pb: 3, mt: "-48px", textAlign: "center" }}
                      >
                        <Avatar
                          src={
                            profile.profile_pic
                              ? `${API_URL}/${profile.profile_pic}`
                              : undefined
                          }
                          sx={{
                            width: 96,
                            height: 96,
                            border: "4px solid white",
                            mx: "auto",
                            bgcolor: "#1e293b",
                            fontSize: 36,
                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                          }}
                        >
                          {!profile.profile_pic &&
                            profile.first_name?.charAt(0).toUpperCase()}
                        </Avatar>

                        <Typography
                          variant="h6"
                          fontWeight="bold"
                          color="#0f172a"
                          sx={{ mt: 1.5 }}
                        >
                          {profile.first_name} {profile.last_name}
                        </Typography>

                        <Chip
                          label={roleLabel}
                          size="small"
                          sx={{
                            mt: 0.5,
                            mb: 2,
                            bgcolor: `${roleColor}18`,
                            color: roleColor,
                            fontWeight: "bold",
                            fontSize: "12px",
                          }}
                        />

                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 0.75,
                            color: "#94a3b8",
                          }}
                        >
                          <CalendarMonth sx={{ fontSize: 14 }} />
                          <Typography variant="caption">
                            เข้าร่วมเมื่อ {formatDate(profile.created_at)}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>

                    {/* stats card */}
                    <Paper
                      elevation={0}
                      sx={{
                        mt: 3,
                        p: 3,
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        bgcolor: "white",
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        color="#94a3b8"
                        sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                      >
                        สถิติการใช้งาน
                      </Typography>
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-around",
                          mt: 2,
                          textAlign: "center",
                        }}
                      >
                        <Box>
                          <Typography
                            variant="h3"
                            fontWeight="800"
                            color="#1e293b"
                            lineHeight={1}
                          >
                            {profile.stats?.total_bookings ?? 0}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="#94a3b8"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            การจอง
                          </Typography>
                        </Box>
                        <Divider
                          orientation="vertical"
                          flexItem
                          sx={{ mx: 2 }}
                        />
                        <Box>
                          <Typography
                            variant="h3"
                            fontWeight="800"
                            lineHeight={1}
                            color={pointColor}
                          >
                            {numericPoints ?? "—"}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="#94a3b8"
                            sx={{ mt: 0.5, display: "block" }}
                          >
                            คะแนน
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  </Grid>

                  {/* ── RIGHT COLUMN ── */}
                  <Grid item xs={12} md={8}>
                    <Paper
                      elevation={0}
                      sx={{
                        p: 4,
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        bgcolor: "white",
                        mb: 3,
                      }}
                    >
                      <Typography
                        variant="caption"
                        fontWeight="bold"
                        color="#94a3b8"
                        sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                      >
                        ข้อมูลส่วนตัว
                      </Typography>

                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2.5,
                          mt: 2.5,
                        }}
                      >
                        {/* email */}
                        <InfoRow
                          icon={
                            <Email sx={{ color: "#3b82f6", fontSize: 18 }} />
                          }
                          iconBg="#eff6ff"
                          label="อีเมล"
                          value={profile.email}
                        />

                        {/* student */}
                        {profile.role === "student" && (
                          <>
                            <InfoRow
                              icon={
                                <Badge
                                  sx={{ color: "#3b82f6", fontSize: 18 }}
                                />
                              }
                              iconBg="#eff6ff"
                              label="รหัสนักศึกษา"
                              value={profile.student_id || "—"}
                            />
                            <InfoRow
                              icon={
                                <School
                                  sx={{ color: "#3b82f6", fontSize: 18 }}
                                />
                              }
                              iconBg="#eff6ff"
                              label="คณะ / สาขา"
                              value={
                                FACULTY_NAMES[profile.faculty] ||
                                profile.faculty ||
                                "—"
                              }
                              sub={profile.department}
                            />
                          </>
                        )}

                        {/* guest */}
                        {profile.role === "guest" && (
                          <InfoRow
                            icon={
                              <Phone sx={{ color: "#f59e0b", fontSize: 18 }} />
                            }
                            iconBg="#fff7ed"
                            label="เบอร์โทรศัพท์"
                            value={profile.phone || "—"}
                          />
                        )}
                      </Box>
                    </Paper>

                    {/* point card */}
                    <Paper
                      elevation={0}
                      sx={{
                        p: 4,
                        border: "1px solid #e2e8f0",
                        borderRadius: 4,
                        bgcolor: "white",
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          mb: 2.5,
                        }}
                      >
                        <Star sx={{ color: "#f59e0b", fontSize: 20 }} />
                        <Typography
                          variant="caption"
                          fontWeight="bold"
                          color="#94a3b8"
                          sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                        >
                          คะแนนของฉัน
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                          mb: 1,
                        }}
                      >
                        <Typography variant="body2" color="#64748b">
                          คะแนนปัจจุบัน
                        </Typography>
                        <Typography
                          variant="h6"
                          fontWeight="bold"
                          color={pointColor}
                        >
                          {numericPoints ?? "—"}{" "}
                          <Typography
                            component="span"
                            variant="body2"
                            color="#94a3b8"
                          >
                            / 100
                          </Typography>
                        </Typography>
                      </Box>

                      <LinearProgress
                        variant="determinate"
                        value={numericPoints == null ? 0 : Math.max(0, Math.min(100, numericPoints))}
                        sx={{
                          height: 10,
                          borderRadius: 5,
                          mb: 2,
                          bgcolor: numericPoints == null ? "#e2e8f0" : "#f1f5f9",
                          "& .MuiLinearProgress-bar": {
                            borderRadius: 5,
                            bgcolor: pointColor,
                          },
                        }}
                      />

                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          mb: 2,
                        }}
                      >
                        <Typography variant="body2" color="#64748b">
                          คะแนนวันนี้
                        </Typography>
                        <Typography variant="body2" fontWeight="bold" color="#334155">
                          {profile.daily_score ?? "—"} / 100
                        </Typography>
                      </Box>

                      {pointsError ? (
                        <Chip
                          label="ยังตรวจสอบสถานะไม่ได้"
                          size="small"
                          sx={{
                            bgcolor: "#f1f5f9",
                            color: "#64748b",
                            fontWeight: "bold",
                          }}
                        />
                      ) : pointRequest?.status === "pending" ? (
                        <Chip
                          label="ส่งคำขอเพิ่มคะแนนแล้ว — รอ Admin พิจารณา"
                          size="small"
                          sx={{
                            bgcolor: "#fff7ed",
                            color: "#c2410c",
                            fontWeight: "bold",
                          }}
                        />
                      ) : profile.is_banned ? (
                        <Chip
                          label={`ถูกระงับถึง ${new Date(profile.ban_until).toLocaleDateString("th-TH")}`}
                          size="small"
                          sx={{
                            bgcolor: "#fef2f2",
                            color: "#ef4444",
                            fontWeight: "bold",
                          }}
                        />
                      ) : numericPoints !== null && numericPoints < 80 ? (
                        <Chip
                          label="คะแนนต่ำกว่าเกณฑ์ — จองไม่ได้"
                          size="small"
                          sx={{
                            bgcolor: "#fff7ed",
                            color: "#c2410c",
                            fontWeight: "bold",
                          }}
                        />
                      ) : (
                        <Chip
                          label="สถานะปกติ"
                          size="small"
                          sx={{
                            bgcolor: "#f0fdf4",
                            color: "#16a34a",
                            fontWeight: "bold",
                          }}
                        />
                      )}

                      <Divider sx={{ my: 3 }} />
                      <Typography variant="subtitle2" fontWeight="bold" color="#334155" sx={{ mb: 1.5 }}>
                        ประวัติการเปลี่ยนคะแนน
                      </Typography>
                      {pointLogs.length === 0 ? (
                        <Typography variant="body2" color="#94a3b8">
                          ยังไม่มีประวัติการเปลี่ยนคะแนน
                        </Typography>
                      ) : (
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
                          {pointLogs.map((log) => {
                            const isPositive = log.change > 0;
                            return (
                              <Box
                                key={log.id}
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  gap: 2,
                                  p: 1.25,
                                  borderRadius: 2,
                                  bgcolor: "#f8fafc",
                                }}
                              >
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography variant="body2" fontWeight="600" color="#334155" noWrap>
                                    {POINT_REASON_LABELS[log.reason] || log.reason}
                                  </Typography>
                                  <Typography variant="caption" color="#94a3b8" noWrap>
                                    {log.note || "—"} · {log.created_at ? new Date(log.created_at).toLocaleString("th-TH") : "—"}
                                  </Typography>
                                </Box>
                                <Typography
                                  variant="body2"
                                  fontWeight="bold"
                                  color={isPositive ? "#16a34a" : "#dc2626"}
                                  sx={{ flexShrink: 0 }}
                                >
                                  {isPositive ? "+" : ""}{log.change}
                                </Typography>
                              </Box>
                            );
                          })}
                        </Box>
                      )}
                    </Paper>
                  </Grid>
                </Grid>
              </Box>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── reusable info row ────────────────────────────────────────────────────────
function InfoRow({ icon, iconBg, label, value, sub }) {
  return (
    <Box sx={{ display: "flex", alignItems: "flex-start", gap: 2 }}>
      <Avatar sx={{ bgcolor: iconBg, width: 38, height: 38, flexShrink: 0 }}>
        {icon}
      </Avatar>
      <Box>
        <Typography
          variant="caption"
          color="#94a3b8"
          fontWeight="bold"
          sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          fontWeight="600"
          color="#1e293b"
          sx={{ mt: 0.2 }}
        >
          {value}
        </Typography>
        {sub && (
          <Typography variant="caption" color="#64748b">
            {sub}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
