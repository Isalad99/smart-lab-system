import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  InputBase,
  IconButton,
  Avatar,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Divider,
  Popover,
} from "@mui/material";
import {
  Search,
  Notifications,
  Dashboard as DashIcon,
  ConfirmationNumber,
  Logout,
  Person,
  Group,
  Computer,
  MeetingRoom,
  PendingActions,
  SupportAgent,
  HowToReg,
  Block,
  Settings,
  Close,
  CameraAlt,
} from "@mui/icons-material";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";

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

// generates a consistent hex color from any string — used for avatar backgrounds
const stringToColor = (string) => {
  if (!string) return "#ccc";
  let hash = 0;
  for (let i = 0; i < string.length; i += 1)
    hash = string.charCodeAt(i) + ((hash << 5) - hash);
  let color = "#";
  for (let i = 0; i < 3; i += 1)
    color += `00${((hash >> (i * 8)) & 0xff).toString(16)}`.slice(-2);
  return color;
};

export default function Admin() {
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

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRequests: 0,
    activeUsers: 0,
    pendingApprovals: 0,
  });
  const [recentReservations, setRecentReservations] = useState([]);

  // set tab title once on mount
  useEffect(() => {
    document.title = "Dashboard | Smart Lab Admin";
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [bookingsRes, usersRes, pendingRes] = await Promise.all([
        axios.get(`${API_URL}/bookings`),
        axios.get(`${API_URL}/users`),
        axios.get(`${API_URL}/admin/users/pending`),
      ]);

      const bookings = bookingsRes.data?.data || [];
      const users = usersRes.data?.data || [];
      const pending = pendingRes.data?.data || [];

      // backend already returns newest-first, but sort locally as a safety net
      const sorted = [...bookings].sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
      );

      setRecentReservations(sorted.slice(0, 10));
      setStats({
        totalRequests: bookings.length,
        activeUsers: users.length,
        pendingApprovals: pending.length,
      });
    } catch (error) {
      console.error("[Admin] failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const STATS_DATA = [
    {
      label: "Total Requests",
      v: stats.totalRequests,
      c: "#3b82f6",
      i: <Person />,
    },
    { label: "Active Users", v: stats.activeUsers, c: "#10b981", i: <Group /> },
    {
      label: "Pending Users",
      v: stats.pendingApprovals,
      c: "#f59e0b",
      i: <PendingActions />,
      path: "/verify-users",
    },
    { label: "Support Tickets", v: 0, c: "#ef4444", i: <SupportAgent /> },
  ];

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "#fcfdfe",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* sidebar */}
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
                  borderRadius: 5,
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

      {/* main content */}
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        }}
      >
        {/* top header */}
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
            Dashboard
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
              <InputBase placeholder="Search..." fullWidth />
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

        <Box sx={{ p: 6, overflowY: "auto" }}>
          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                height: "50vh",
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* stat cards — clicking Pending Users navigates to the verify page */}
              <Grid container spacing={4} sx={{ mb: 6 }}>
                {STATS_DATA.map((s, idx) => (
                  <Grid item xs={12} sm={6} md={3} key={idx}>
                    <Paper
                      elevation={0}
                      onClick={() => s.path && navigate(s.path)}
                      sx={{
                        p: 4,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        gap: 3,
                        border: "1px solid #e2e8f0",
                        cursor: s.path ? "pointer" : "default",
                        transition: "0.2s",
                        "&:hover": s.path
                          ? {
                              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
                              transform: "translateY(-2px)",
                            }
                          : {},
                      }}
                    >
                      <Avatar
                        sx={{
                          bgcolor: s.c,
                          width: 64,
                          height: 64,
                          borderRadius: 4,
                        }}
                      >
                        {s.i}
                      </Avatar>
                      <Box>
                        <Typography
                          variant="body2"
                          sx={{ color: "#94a3b8", fontWeight: "700" }}
                        >
                          {s.label}
                        </Typography>
                        <Typography
                          variant="h3"
                          fontWeight="800"
                          color="#1e293b"
                        >
                          {s.v}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>
                ))}
              </Grid>

              {/* recent reservations table — shows latest 10 */}
              <Grid container spacing={5}>
                <Grid item xs={12}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 5,
                      borderRadius: 6,
                      border: "1px solid #e2e8f0",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                    }}
                  >
                    <Typography
                      variant="h5"
                      fontWeight="800"
                      color="#1e293b"
                      sx={{ mb: 4 }}
                    >
                      Recent Reservations
                    </Typography>
                    <TableContainer>
                      <Table>
                        <TableHead>
                          <TableRow sx={{ bgcolor: "#f8fafc" }}>
                            {["User", "Room", "Date", "Time"].map((h) => (
                              <TableCell
                                key={h}
                                sx={{
                                  color: "#64748b",
                                  fontWeight: "800",
                                  py: 2,
                                  borderBottom: "1px solid #e2e8f0",
                                }}
                              >
                                {h}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {recentReservations.length > 0 ? (
                            recentReservations.map((row) => {
                              // user/lab are eager-loaded by the backend — null-check just in case
                              const firstName =
                                row.user?.first_name || "Unknown";
                              const lastName = row.user?.last_name || "";
                              const userName =
                                `${firstName} ${lastName}`.trim();
                              const labCode = row.lab?.code || "-";

                              return (
                                <TableRow
                                  key={row.id}
                                  sx={{
                                    "& td": {
                                      borderBottom: "1px solid #f1f5f9",
                                    },
                                  }}
                                >
                                  <TableCell>
                                    <Box
                                      sx={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 2,
                                      }}
                                    >
                                      <Avatar
                                        sx={{
                                          bgcolor: stringToColor(userName),
                                          width: 38,
                                          height: 38,
                                        }}
                                      >
                                        {userName.charAt(0)}
                                      </Avatar>
                                      <Typography
                                        variant="subtitle1"
                                        fontWeight="700"
                                        color="#334155"
                                      >
                                        {userName}
                                      </Typography>
                                    </Box>
                                  </TableCell>
                                  <TableCell
                                    sx={{ color: "#475569", fontWeight: "600" }}
                                  >
                                    {labCode}
                                  </TableCell>
                                  <TableCell
                                    sx={{ color: "#475569", fontWeight: "600" }}
                                  >
                                    {row.booking_date || "-"}
                                  </TableCell>
                                  <TableCell
                                    sx={{ color: "#475569", fontWeight: "600" }}
                                  >
                                    {row.start_time || "-"}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                align="center"
                                sx={{ py: 4, color: "#94a3b8" }}
                              >
                                No recent reservations found.
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              </Grid>
            </>
          )}
        </Box>
      </Box>
    </Box>
  );
}
