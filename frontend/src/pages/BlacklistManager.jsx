import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Avatar,
  IconButton,
  Paper,
  Divider,
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
  InputBase,
  Fade,
  Chip,
  Popover,
} from "@mui/material";
import {
  Search,
  Notifications,
  ConfirmationNumber,
  Logout,
  Computer,
  Person,
  Dashboard as DashIcon,
  MeetingRoom,
  Add,
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

const EMPTY_FORM = { app_name: "", description: "" };

export default function BlacklistManager() {
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

  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchBlacklist();
  }, []);

  // --- API ---

  const fetchBlacklist = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/blacklist`);
      setBlacklist(res.data.data || []);
    } catch (err) {
      console.error("[Blacklist] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setIsEditing(false);
    setCurrentId(null);
    setFormData(EMPTY_FORM);
    setFormError("");
    setOpenDialog(true);
  };

  const handleOpenEdit = (item) => {
    setIsEditing(true);
    setCurrentId(item.id);
    setFormData({
      app_name: item.app_name,
      description: item.description || "",
    });
    setFormError("");
    setOpenDialog(true);
  };

  const handleSave = async () => {
    if (!formData.app_name.trim()) {
      setFormError("App name is required.");
      return;
    }
    try {
      if (isEditing) {
        await axios.put(`${API_URL}/admin/blacklist/${currentId}`, formData);
      } else {
        await axios.post(`${API_URL}/admin/blacklist`, formData);
      }
      setOpenDialog(false);
      fetchBlacklist();
    } catch (err) {
      setFormError(err.response?.data?.detail || "Operation failed.");
    }
  };

  const handleDelete = async (id, appName) => {
    if (!window.confirm(`Remove "${appName}" from the blacklist?`)) return;
    try {
      await axios.delete(`${API_URL}/admin/blacklist/${id}`);
      fetchBlacklist();
    } catch (err) {
      alert(err.response?.data?.detail || "Delete failed.");
    }
  };

  // --- derived data ---

  const filtered = blacklist.filter(
    (item) =>
      item.app_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  // ============================================================================
  // RENDER
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
      {/* SIDEBAR */}
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

      {/* MAIN AREA */}
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
            borderBottom: "1px solid #e2e8f0",
            zIndex: 5,
          }}
        >
          <Typography
            variant="h5"
            fontWeight="800"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            Blacklist Manager
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
                placeholder="Search blacklisted apps..."
                fullWidth
                sx={{ fontSize: "15px", fontWeight: "500" }}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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

        {/* CONTENT */}
        <Box sx={{ p: 6, flex: 1 }}>
          <Fade in timeout={400}>
            <Box>
              {/* Add button row */}
              <Box
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  mb: 5,
                }}
              >
                <Typography variant="h6" fontWeight="700" color="#64748b">
                  {blacklist.length} app{blacklist.length !== 1 ? "s" : ""}{" "}
                  blocked
                </Typography>
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={<Add />}
                  onClick={handleOpenAdd}
                  sx={{
                    bgcolor: "#ef4444",
                    fontWeight: "700",
                    textTransform: "none",
                    borderRadius: 3,
                    px: 3,
                    py: 1.5,
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "#dc2626", transform: "scale(1.05)" },
                  }}
                >
                  Add App
                </Button>
              </Box>

              {/* Blacklist Table */}
              <Paper
                elevation={0}
                sx={{
                  borderRadius: 6,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                }}
              >
                <Box
                  sx={{
                    px: 5,
                    py: 3.5,
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Block sx={{ color: "#ef4444", fontSize: 22 }} />
                  <Typography variant="h6" fontWeight="800" color="#1e293b">
                    Blacklisted Applications
                  </Typography>
                </Box>

                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#f8fafc" }}>
                        {[
                          "#",
                          "App Name",
                          "Reason / Description",
                          "Added On",
                          "Actions",
                        ].map((h, i) => (
                          <TableCell
                            key={h}
                            align={i === 4 ? "right" : "left"}
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
                      {loading ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            align="center"
                            sx={{ py: 6, color: "#94a3b8", fontWeight: "600" }}
                          >
                            Loading...
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            align="center"
                            sx={{ py: 6, color: "#94a3b8", fontWeight: "600" }}
                          >
                            {searchQuery
                              ? `No results for "${searchQuery}"`
                              : "No blacklisted apps yet."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((item, index) => (
                          <TableRow
                            key={item.id}
                            sx={{
                              "& td": { borderBottom: "1px solid #f1f5f9" },
                              "&:hover": { bgcolor: "#fafafa" },
                            }}
                          >
                            {/* Index */}
                            <TableCell
                              sx={{
                                color: "#cbd5e1",
                                fontWeight: "700",
                                width: 50,
                              }}
                            >
                              {index + 1}
                            </TableCell>

                            {/* App name + badge */}
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
                                    bgcolor: "#fef2f2",
                                    width: 38,
                                    height: 38,
                                    borderRadius: 2,
                                  }}
                                >
                                  <Block
                                    sx={{ color: "#ef4444", fontSize: 18 }}
                                  />
                                </Avatar>
                                <Box>
                                  <Typography
                                    variant="subtitle2"
                                    fontWeight="800"
                                    color="#1e293b"
                                  >
                                    {item.app_name}
                                  </Typography>
                                  <Chip
                                    label="Blocked"
                                    size="small"
                                    sx={{
                                      bgcolor: "#fef2f2",
                                      color: "#ef4444",
                                      fontWeight: "700",
                                      fontSize: "10px",
                                      height: 18,
                                      mt: 0.3,
                                    }}
                                  />
                                </Box>
                              </Box>
                            </TableCell>

                            {/* Description */}
                            <TableCell
                              sx={{
                                color: "#64748b",
                                fontWeight: "500",
                                maxWidth: 400,
                              }}
                            >
                              {item.description || (
                                <span
                                  style={{
                                    color: "#cbd5e1",
                                    fontStyle: "italic",
                                  }}
                                >
                                  No reason provided
                                </span>
                              )}
                            </TableCell>

                            {/* Created at */}
                            <TableCell
                              sx={{
                                color: "#94a3b8",
                                fontWeight: "600",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.created_at
                                ? new Date(item.created_at).toLocaleDateString(
                                    "en-GB",
                                  )
                                : "-"}
                            </TableCell>

                            {/* Actions */}
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                onClick={() => handleOpenEdit(item)}
                                sx={{
                                  color: "#3b82f6",
                                  mr: 1,
                                  bgcolor: "#eff6ff",
                                  "&:hover": { bgcolor: "#dbeafe" },
                                }}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={() =>
                                  handleDelete(item.id, item.app_name)
                                }
                                sx={{
                                  color: "#ef4444",
                                  bgcolor: "#fef2f2",
                                  "&:hover": { bgcolor: "#fee2e2" },
                                }}
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
          </Fade>
        </Box>
      </Box>

      {/* DIALOG: Add / Edit */}
      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        PaperProps={{
          sx: {
            borderRadius: 4,
            p: 2,
            minWidth: 460,
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
          },
        }}
      >
        <DialogTitle
          sx={{
            fontWeight: "800",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Block sx={{ color: "#ef4444" }} />
          {isEditing ? "Edit Blacklisted App" : "Add App to Blacklist"}
        </DialogTitle>

        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}
        >
          <TextField
            label="App Name"
            fullWidth
            size="small"
            value={formData.app_name}
            onChange={(e) => {
              setFormData({ ...formData, app_name: e.target.value });
              setFormError("");
            }}
            disabled={isEditing} // app_name is the unique key — edit description only
            helperText={
              isEditing ? "App name cannot be changed after creation." : ""
            }
            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label="Reason / Description"
            fullWidth
            multiline
            rows={3}
            size="small"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder="e.g. ห้ามใช้โปรแกรมโหลดไฟล์ละเมิดลิขสิทธิ์"
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          {formError && (
            <Typography variant="caption" color="error" fontWeight="600">
              {formError}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ pb: 1, pr: 2, gap: 1 }}>
          <Button
            onClick={() => setOpenDialog(false)}
            sx={{ color: "#64748b", fontWeight: "700", textTransform: "none" }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disableElevation
            startIcon={isEditing ? <Save /> : <Add />}
            sx={{
              bgcolor: "#ef4444",
              fontWeight: "700",
              borderRadius: 3,
              textTransform: "none",
              "&:hover": { bgcolor: "#dc2626" },
            }}
          >
            {isEditing ? "Save Changes" : "Add to Blacklist"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
