import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Fade,
  IconButton,
  InputBase,
  Paper,
  Popover,
  Typography,
} from "@mui/material";
import {
  ArrowBack,
  Cancel,
  CheckCircle,
  Close,
  Computer,
  Email,
  Logout,
  PendingActions,
  Person,
  PersonOutline,
  Phone,
  Search,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminNavigation from "../components/AdminNavigation";
import { authConfig } from "../utils/auth";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";

const API_URL = import.meta.env.VITE_API_URL;

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

const getProfileImage = (profilePic) => {
  if (!profilePic) return "";
  if (/^https?:\/\//i.test(profilePic)) return profilePic;
  return `${API_URL}/${profilePic.replace(/^\/+/, "")}`;
};

export default function VerifyUsers() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useLanguage();

  const [anchorEl, setAnchorEl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState(null);
  const [error, setError] = useState("");

  const fetchPendingUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const response = await axios.get(
        `${API_URL}/admin/users/pending`,
        authConfig(),
      );
      setPendingUsers(response.data?.data || []);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : t("admin.pendingUsersLoadFailed"),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    document.title = `${t("admin.verifyTitle")} | Smart Lab Admin`;
    fetchPendingUsers();
  }, [fetchPendingUsers, t]);

  const handleVerify = async (userId, action) => {
    if (
      action === "reject" &&
      !window.confirm(t("admin.rejectUserConfirmation"))
    ) {
      return;
    }

    try {
      setProcessingId(userId);
      setError("");
      await axios.put(
        `${API_URL}/admin/users/${userId}/verify`,
        { action },
        authConfig(),
      );
      await fetchPendingUsers();
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(
        typeof detail === "string" ? detail : t("admin.verifyUserFailed"),
      );
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pendingUsers;

    return pendingUsers.filter((user) => {
      const searchableText =
        `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""} ${user.phone || ""}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [pendingUsers, searchQuery]);

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
      {/* SIDEBAR */}
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

      {/* MAIN AREA */}
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
        {/* HEADER */}
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              onClick={() => navigate("/admin")}
              sx={{
                display: { xs: "inline-flex", md: "none" },
                color: "#64748b",
              }}
              aria-label={t("common.back")}
            >
              <ArrowBack />
            </IconButton>
            <Typography
              variant="h5"
              fontWeight="700"
              sx={{ color: "#1e293b", letterSpacing: "-1px" }}
            >
              {t("admin.verifyTitle")}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Paper
              className="admin-search-control"
              elevation={0}
              sx={{
                px: 2,
                py: 0.5,
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                width: { sm: 220, md: 360 },
                height: 44,
              }}
            >
              <Search sx={{ color: "var(--text-muted)", mr: 1.5 }} />
              <InputBase
                placeholder={t("admin.searchPendingUsers")}
                fullWidth
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                sx={{ fontSize: "14px", fontWeight: "400" }}
                inputProps={{ "aria-label": t("admin.searchPendingUsers") }}
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

        {/* CONTENT */}
        <Box
          className="content-area admin-content-area page-content"
          sx={{ p: { xs: 3, md: 6 }, flex: 1 }}
        >
          <Fade in timeout={400}>
            <Box>
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
                <Box>
                  <Typography
                    variant="h4"
                    fontWeight="700"
                    color="#1e293b"
                    sx={{ letterSpacing: "-1px" }}
                  >
                    {t("admin.verifyHeading")}
                  </Typography>
                  <Typography variant="body2" color="#64748b" sx={{ mt: 0.75 }}>
                    {t("admin.verifySubtitle")}
                  </Typography>
                </Box>
                <Chip
                  icon={<PendingActions />}
                  label={`${pendingUsers.length} ${t("admin.pending")}`}
                  sx={{
                    bgcolor: "#fff7ed",
                    color: "#c2410c",
                    fontWeight: "700",
                    borderRadius: 2.5,
                    "& .MuiChip-icon": { color: "inherit" },
                  }}
                />
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <Paper
                  className="surface-card"
                  elevation={0}
                  sx={{
                    minHeight: 320,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    borderRadius: 5,
                    border: "1px solid #e2e8f0",
                  }}
                >
                  <CircularProgress />
                </Paper>
              ) : pendingUsers.length === 0 ? (
                <Paper
                  className="surface-card empty-state"
                  elevation={0}
                  sx={{
                    p: { xs: 5, md: 8 },
                    textAlign: "center",
                    borderRadius: 5,
                    border: "1px dashed #cbd5e1",
                    bgcolor: "transparent",
                  }}
                >
                  <PersonOutline
                    sx={{ fontSize: 64, color: "#94a3b8", mb: 2 }}
                  />
                  <Typography variant="h6" color="#64748b" fontWeight="600">
                    {t("admin.noPendingVerifications")}
                  </Typography>
                  <Typography variant="body2" color="#94a3b8">
                    {t("admin.allGuestsUpToDate")}
                  </Typography>
                </Paper>
              ) : filteredUsers.length === 0 ? (
                <Paper
                  className="surface-card empty-state"
                  elevation={0}
                  sx={{
                    p: { xs: 5, md: 8 },
                    textAlign: "center",
                    borderRadius: 5,
                    border: "1px dashed #cbd5e1",
                    bgcolor: "transparent",
                  }}
                >
                  <Search sx={{ fontSize: 56, color: "#94a3b8", mb: 2 }} />
                  <Typography variant="h6" color="#64748b" fontWeight="600">
                    {t("admin.noMatchingGuestUsers")}
                  </Typography>
                  <Typography variant="body2" color="#94a3b8">
                    {t("admin.adjustGuestSearch")}
                  </Typography>
                </Paper>
              ) : (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "minmax(0, 1fr)",
                      sm: "repeat(auto-fill, minmax(280px, 300px))",
                    },
                    justifyContent: { xs: "center", sm: "start" },
                    alignItems: "start",
                    gap: 2.5,
                  }}
                >
                  {filteredUsers.map((user) => {
                    const imageUrl = getProfileImage(user.profile_pic);
                    const isProcessing = processingId === user.id;
                    return (
                      <Paper
                        key={user.id}
                        className="surface-card"
                        elevation={0}
                        sx={{
                          width: "100%",
                          maxWidth: 300,
                          justifySelf: { xs: "center", sm: "start" },
                          height: 380,
                          display: "flex",
                          flexDirection: "column",
                          borderRadius: 5,
                          overflow: "hidden",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 14px 30px rgba(15,23,42,0.06)",
                          transition: "0.3s",
                          "&:hover": {
                            transform: "translateY(-4px)",
                            boxShadow: "0 18px 35px rgba(15,23,42,0.08)",
                          },
                        }}
                      >
                        <Box
                          sx={{
                            height: 160,
                            minHeight: 160,
                            width: "100%",
                            bgcolor: "#e2e8f0",
                            backgroundImage: imageUrl
                              ? `url(${imageUrl})`
                              : "none",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {!imageUrl && (
                            <Avatar
                              sx={{
                                bgcolor: stringToColor(
                                  `${user.first_name} ${user.last_name}`,
                                ),
                                width: 82,
                                height: 82,
                                fontSize: 28,
                                fontWeight: "700",
                              }}
                            >
                              {getInitials(user)}
                            </Avatar>
                          )}
                        </Box>

                        <Box
                          sx={{
                            p: 2,
                            flex: 1,
                            minHeight: 0,
                            display: "flex",
                            flexDirection: "column",
                          }}
                        >
                          <Box
                            sx={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              gap: 1,
                              mb: 0.75,
                            }}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Typography
                                variant="h6"
                                fontWeight="700"
                                color="#1e293b"
                                noWrap
                              >
                                {user.first_name} {user.last_name}
                              </Typography>
                              <Typography variant="caption" color="#94a3b8">
                                User ID #{user.id}
                              </Typography>
                            </Box>
                            <Chip
                              label={t("admin.guestUser")}
                              size="small"
                              sx={{
                                bgcolor: "#f1f5f9",
                                color: "#64748b",
                                fontWeight: "600",
                                flexShrink: 0,
                              }}
                            />
                          </Box>

                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 1.5,
                              mb: 3,
                              mt: 2,
                            }}
                          >
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                color: "#475569",
                                minWidth: 0,
                              }}
                            >
                              <Email
                                fontSize="small"
                                sx={{ color: "#94a3b8", flexShrink: 0 }}
                              />
                              <Typography variant="body2" noWrap>
                                {user.email}
                              </Typography>
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1.5,
                                color: "#475569",
                              }}
                            >
                              <Phone
                                fontSize="small"
                                sx={{ color: "#94a3b8" }}
                              />
                              <Typography variant="body2" noWrap>
                                {user.phone || t("common.noPhone")}
                              </Typography>
                            </Box>
                          </Box>

                          <Divider sx={{ mb: 2, mt: "auto" }} />

                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                              fullWidth
                              variant="outlined"
                              color="error"
                              startIcon={<Cancel />}
                              disabled={isProcessing}
                              onClick={() => handleVerify(user.id, "reject")}
                              sx={{
                                borderRadius: 3,
                                fontWeight: "600",
                                textTransform: "none",
                              }}
                            >
                              {t("admin.reject")}
                            </Button>
                            <Button
                              fullWidth
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle />}
                              disabled={isProcessing}
                              onClick={() => handleVerify(user.id, "approve")}
                              sx={{
                                borderRadius: 3,
                                fontWeight: "600",
                                textTransform: "none",
                                boxShadow: "none",
                              }}
                            >
                              {isProcessing
                                ? t("admin.saving")
                                : t("admin.approve")}
                            </Button>
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>
              )}
            </Box>
          </Fade>
        </Box>
      </Box>
    </Box>
  );
}
