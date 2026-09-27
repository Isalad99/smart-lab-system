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
  Logout,
  Computer,
  Person,
  Add,
  Save,
  Delete,
  Edit,
  Block,
  Settings,
  Close,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminNavigation from "../components/AdminNavigation";
import { authConfig } from "../utils/auth";
import { formatDate } from "../utils/dateFormat";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";

const API_URL = import.meta.env.VITE_API_URL;

const EMPTY_FORM = { app_name: "", description: "" };

export default function BlacklistManager() {
  const navigate = useNavigate();
  const { logout } = useAuth();
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

  const [blacklist, setBlacklist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [openDialog, setOpenDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    document.title = `${t("admin.blacklistTitle")} | Smart Lab Admin`;
    fetchBlacklist();
  }, [t]);

  // --- API ---

  const fetchBlacklist = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/blacklist`, authConfig());
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
      setFormError(t("admin.appNameRequired"));
      return;
    }
    try {
      if (isEditing) {
        await axios.put(
          `${API_URL}/admin/blacklist/${currentId}`,
          formData,
          authConfig(),
        );
      } else {
        await axios.post(`${API_URL}/admin/blacklist`, formData, authConfig());
      }
      setOpenDialog(false);
      fetchBlacklist();
    } catch (err) {
      setFormError(
        err.response?.data?.detail || t("admin.blacklistOperationFailed"),
      );
    }
  };

  const handleDelete = async (id, appName) => {
    if (
      !window.confirm(`${t("admin.confirmRemoveBlacklistItem")}: ${appName}?`)
    )
      return;
    try {
      await axios.delete(`${API_URL}/admin/blacklist/${id}`, authConfig());
      fetchBlacklist();
    } catch (err) {
      alert(err.response?.data?.detail || t("admin.deleteBlacklistFailed"));
    }
  };

  // --- derived data ---

  const filtered = blacklist.filter(
    (item) =>
      (item.app_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  // ============================================================================
  // RENDER
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
      {/* SIDEBAR */}
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

      {/* MAIN AREA */}
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
            bgcolor: "var(--surface-elevated)",
            borderBottom: "1px solid #e2e8f0",
            zIndex: 5,
          }}
        >
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {t("admin.blacklistTitle")}
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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
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
                  {t("common.systemAdmin")}
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
          sx={{ p: 6, flex: 1 }}
        >
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
                <Typography variant="h6" fontWeight="600" color="#64748b">
                  {blacklist.length} {t("admin.programsBlocked")}
                </Typography>
                <Button
                  variant="contained"
                  disableElevation
                  startIcon={<Add />}
                  onClick={handleOpenAdd}
                  sx={{
                    bgcolor: "#ef4444",
                    fontWeight: "600",
                    textTransform: "none",
                    borderRadius: 3,
                    px: 3,
                    py: 1.5,
                    whiteSpace: "nowrap",
                    transition: "all 0.2s",
                    "&:hover": { bgcolor: "#dc2626", transform: "scale(1.05)" },
                  }}
                >
                  {t("admin.addBlockedProgram")}
                </Button>
              </Box>

              {/* Blacklist Table */}
              <Paper
                className="surface-card data-table-shell"
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
                  <Typography variant="h6" fontWeight="700" color="#1e293b">
                    {t("admin.blockedProgramHeading")}
                  </Typography>
                </Box>

                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#f8fafc" }}>
                        {[
                          "#",
                          t("admin.programName"),
                          t("admin.description"),
                          t("common.date"),
                          t("common.actions"),
                        ].map((h, i) => (
                          <TableCell
                            key={h}
                            align={i === 4 ? "right" : "left"}
                            sx={{
                              color: "#64748b",
                              fontWeight: "700",
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
                            sx={{ py: 6, color: "#94a3b8", fontWeight: "500" }}
                          >
                            {t("common.loading")}
                          </TableCell>
                        </TableRow>
                      ) : filtered.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            align="center"
                            sx={{ py: 6, color: "#94a3b8", fontWeight: "500" }}
                          >
                            {searchQuery
                              ? `${t("admin.noMatchingUsers")}: "${searchQuery}"`
                              : t("admin.noBlockedPrograms")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((item, index) => (
                          <TableRow
                            key={item.id}
                            sx={{
                              backgroundColor: "var(--card-bg)",
                              "& td": {
                                borderBottom: "1px solid var(--border-light)",
                              },
                              "&:hover": {
                                backgroundColor: "var(--surface-subtle)",
                              },
                            }}
                          >
                            {/* Index */}
                            <TableCell
                              sx={{
                                color: "#cbd5e1",
                                fontWeight: "600",
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
                                    fontWeight="700"
                                    color="#1e293b"
                                  >
                                    {item.app_name || t("admin.unknownProgram")}
                                  </Typography>
                                  <Chip
                                    label={t("common.inactive")}
                                    size="small"
                                    sx={{
                                      bgcolor: "#fef2f2",
                                      color: "#ef4444",
                                      fontWeight: "600",
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
                                fontWeight: "400",
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
                                  {t("admin.description")}
                                </span>
                              )}
                            </TableCell>

                            {/* Created at */}
                            <TableCell
                              sx={{
                                color: "#94a3b8",
                                fontWeight: "500",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {formatDate(item.created_at, t("common.locale"), {
                                fallback: "-",
                              })}
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
            fontWeight: "700",
            color: "#0f172a",
            display: "flex",
            alignItems: "center",
            gap: 1.5,
          }}
        >
          <Block sx={{ color: "#ef4444" }} />
          {isEditing ? t("admin.editProgram") : t("admin.addProgram")}
        </DialogTitle>

        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 3, pt: 2 }}
        >
          <TextField
            label={t("admin.programName")}
            fullWidth
            size="small"
            value={formData.app_name}
            onChange={(e) => {
              setFormData({ ...formData, app_name: e.target.value });
              setFormError("");
            }}
            sx={{ mt: 1, "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          <TextField
            label={t("admin.description")}
            fullWidth
            multiline
            rows={3}
            size="small"
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            placeholder={t("admin.blockedProgramPlaceholder")}
            sx={{ "& .MuiOutlinedInput-root": { borderRadius: 3 } }}
          />
          {formError && (
            <Typography variant="caption" color="error" fontWeight="500">
              {formError}
            </Typography>
          )}
        </DialogContent>

        <DialogActions sx={{ pb: 1, pr: 2, gap: 1 }}>
          <Button
            onClick={() => setOpenDialog(false)}
            sx={{ color: "#64748b", fontWeight: "600", textTransform: "none" }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disableElevation
            startIcon={isEditing ? <Save /> : <Add />}
            sx={{
              bgcolor: "#ef4444",
              fontWeight: "600",
              borderRadius: 3,
              textTransform: "none",
              "&:hover": { bgcolor: "#dc2626" },
            }}
          >
            {isEditing ? t("common.save") : t("admin.addProgram")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
