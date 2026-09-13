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
  Assessment,
  Block,
  Cancel,
  CheckCircle,
  Close,
  Computer,
  ConfirmationNumber,
  Dashboard as DashIcon,
  Email,
  HowToReg,
  Logout,
  MeetingRoom,
  Notifications,
  PendingActions,
  Person,
  PersonOutline,
  Phone,
  Search,
  Settings,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";

const API_URL = import.meta.env.VITE_API_URL;

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
    text: "User Points",
    icon: <Assessment sx={{ fontSize: 20 }} />,
    path: "/admin/points",
  },
  {
    text: "Point Criteria",
    icon: <Settings sx={{ fontSize: 20 }} />,
    path: "/admin/points/policy",
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
  return `${API_URL}/${profilePic.replace(/^\/+/, "")}`;
};

export default function VerifyUsers() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

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
      const response = await axios.get(`${API_URL}/admin/users/pending`);
      setPendingUsers(response.data?.data || []);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "ไม่สามารถโหลดรายการผู้ใช้ที่รอตรวจสอบได้");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    document.title = "Verify Users | Smart Lab Admin";
    fetchPendingUsers();
  }, [fetchPendingUsers]);

  const handleVerify = async (userId, action) => {
    if (action === "reject" && !window.confirm("Are you sure you want to reject and delete this user?")) {
      return;
    }

    try {
      setProcessingId(userId);
      setError("");
      await axios.put(`${API_URL}/admin/users/${userId}/verify`, { action });
      await fetchPendingUsers();
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(typeof detail === "string" ? detail : `Failed to ${action} user.`);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return pendingUsers;

    return pendingUsers.filter((user) => {
      const searchableText = `${user.first_name || ""} ${user.last_name || ""} ${user.email || ""} ${user.phone || ""}`.toLowerCase();
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
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "#fcfdfe",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* SIDEBAR */}
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

      {/* MAIN AREA */}
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflowX: "hidden", minWidth: 0 }}>
        {/* HEADER */}
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton onClick={() => navigate("/admin")} sx={{ display: { xs: "inline-flex", md: "none" }, color: "#64748b" }} aria-label="Back to dashboard">
              <ArrowBack />
            </IconButton>
            <Typography variant="h5" fontWeight="800" sx={{ color: "#1e293b", letterSpacing: "-1px" }}>
              Verify Users
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Paper
              elevation={0}
              sx={{
                bgcolor: "#f1f5f9",
                px: 2,
                py: 0.5,
                borderRadius: 4,
                display: { xs: "none", sm: "flex" },
                alignItems: "center",
                width: { sm: 220, md: 360 },
                height: 44,
              }}
            >
              <Search sx={{ color: "#94a3b8", mr: 1.5 }} />
              <InputBase
                placeholder="Search pending users..."
                fullWidth
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                sx={{ fontSize: "14px", fontWeight: "500" }}
                inputProps={{ "aria-label": "Search pending users" }}
              />
            </Paper>
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
              <IconButton onClick={(event) => setAnchorEl(event.currentTarget)} aria-label="Open admin menu" sx={{ p: 0.8, "&:hover": { bgcolor: "#f1f5f9" } }}>
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
                    width: 280,
                    borderRadius: 4,
                    boxShadow: "0 20px 45px rgba(15,23,42,0.16)",
                    border: "1px solid #e2e8f0",
                  },
                }}
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

        {/* CONTENT */}
        <Box sx={{ p: { xs: 3, md: 6 }, flex: 1 }}>
          <Fade in timeout={400}>
            <Box>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: { xs: "flex-start", sm: "center" }, gap: 2, mb: 4, flexWrap: "wrap" }}>
                <Box>
                  <Typography variant="h4" fontWeight="800" color="#1e293b" sx={{ letterSpacing: "-1px" }}>
                    Verify Guest Users
                  </Typography>
                  <Typography variant="body2" color="#64748b" sx={{ mt: 0.75 }}>
                    Review and approve external users before they can book labs.
                  </Typography>
                </Box>
                <Chip
                  icon={<PendingActions />}
                  label={`${pendingUsers.length} Pending`}
                  sx={{ bgcolor: "#fff7ed", color: "#c2410c", fontWeight: "800", borderRadius: 2.5, "& .MuiChip-icon": { color: "inherit" } }}
                />
              </Box>

              {error && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
                  {error}
                </Alert>
              )}

              {loading ? (
                <Paper elevation={0} sx={{ minHeight: 320, display: "flex", justifyContent: "center", alignItems: "center", borderRadius: 5, border: "1px solid #e2e8f0" }}>
                  <CircularProgress />
                </Paper>
              ) : pendingUsers.length === 0 ? (
                <Paper elevation={0} sx={{ p: { xs: 5, md: 8 }, textAlign: "center", borderRadius: 5, border: "1px dashed #cbd5e1", bgcolor: "transparent" }}>
                  <PersonOutline sx={{ fontSize: 64, color: "#94a3b8", mb: 2 }} />
                  <Typography variant="h6" color="#64748b" fontWeight="700">
                    No Pending Verifications
                  </Typography>
                  <Typography variant="body2" color="#94a3b8">
                    All guest accounts are up to date.
                  </Typography>
                </Paper>
              ) : filteredUsers.length === 0 ? (
                <Paper elevation={0} sx={{ p: { xs: 5, md: 8 }, textAlign: "center", borderRadius: 5, border: "1px dashed #cbd5e1", bgcolor: "transparent" }}>
                  <Search sx={{ fontSize: 56, color: "#94a3b8", mb: 2 }} />
                  <Typography variant="h6" color="#64748b" fontWeight="700">
                    No Matching Users
                  </Typography>
                  <Typography variant="body2" color="#94a3b8">
                    Try a different name, email, or phone number.
                  </Typography>
                </Paper>
              ) : (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 3 }}>
                  {filteredUsers.map((user) => {
                    const imageUrl = getProfileImage(user.profile_pic);
                    const isProcessing = processingId === user.id;
                    return (
                      <Paper
                        key={user.id}
                        elevation={0}
                        sx={{ borderRadius: 5, overflow: "hidden", border: "1px solid #e2e8f0", transition: "0.3s", "&:hover": { transform: "translateY(-4px)", boxShadow: "0 18px 35px rgba(15,23,42,0.08)" } }}
                      >
                        <Box
                          sx={{
                            height: 220,
                            width: "100%",
                            bgcolor: "#e2e8f0",
                            backgroundImage: imageUrl ? `url(${imageUrl})` : "none",
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {!imageUrl && (
                            <Avatar sx={{ bgcolor: stringToColor(`${user.first_name} ${user.last_name}`), width: 82, height: 82, fontSize: 28, fontWeight: "800" }}>
                              {getInitials(user)}
                            </Avatar>
                          )}
                        </Box>

                        <Box sx={{ p: 3 }}>
                          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1, mb: 1 }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="h6" fontWeight="800" color="#1e293b" noWrap>
                                {user.first_name} {user.last_name}
                              </Typography>
                              <Typography variant="caption" color="#94a3b8">
                                User ID #{user.id}
                              </Typography>
                            </Box>
                            <Chip label="Guest User" size="small" sx={{ bgcolor: "#f1f5f9", color: "#64748b", fontWeight: "700", flexShrink: 0 }} />
                          </Box>

                          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 3, mt: 2 }}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "#475569", minWidth: 0 }}>
                              <Email fontSize="small" sx={{ color: "#94a3b8", flexShrink: 0 }} />
                              <Typography variant="body2" noWrap>
                                {user.email}
                              </Typography>
                            </Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "#475569" }}>
                              <Phone fontSize="small" sx={{ color: "#94a3b8" }} />
                              <Typography variant="body2">
                                {user.phone || "No phone provided"}
                              </Typography>
                            </Box>
                          </Box>

                          <Divider sx={{ mb: 2 }} />

                          <Box sx={{ display: "flex", gap: 1 }}>
                            <Button
                              fullWidth
                              variant="outlined"
                              color="error"
                              startIcon={<Cancel />}
                              disabled={isProcessing}
                              onClick={() => handleVerify(user.id, "reject")}
                              sx={{ borderRadius: 3, fontWeight: "700", textTransform: "none" }}
                            >
                              Reject
                            </Button>
                            <Button
                              fullWidth
                              variant="contained"
                              color="success"
                              startIcon={<CheckCircle />}
                              disabled={isProcessing}
                              onClick={() => handleVerify(user.id, "approve")}
                              sx={{ borderRadius: 3, fontWeight: "700", textTransform: "none", boxShadow: "none" }}
                            >
                              {isProcessing ? "Saving..." : "Approve"}
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
