import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputBase,
  InputLabel,
  MenuItem,
  Paper,
  Popover,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import {
  AdminPanelSettings,
  Close,
  Computer,
  Edit,
  Logout,
  Person,
  Refresh,
  Save,
  Search,
  Settings,
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

const ROLE_COLORS = {
  admin: { backgroundColor: "#f3e8ff", color: "#7e22ce" },
  student: { backgroundColor: "#eff6ff", color: "#2563eb" },
  guest: { backgroundColor: "#f1f5f9", color: "#64748b" },
};

const getRoleColor = (roleName) =>
  ROLE_COLORS[roleName] || { backgroundColor: "#ecfeff", color: "#0f766e" };

const getRoleLabel = (role, t) =>
  role?.display_name || role?.name || t("admin.noRoleAssigned");

const getErrorMessage = (error, fallback) => {
  const detail = error.response?.data?.detail;
  return typeof detail === "string" ? detail : fallback;
};

function RoleChip({ role }) {
  const { t } = useLanguage();
  const colors = getRoleColor(role?.name);
  return (
    <Chip
      size="small"
      icon={<AdminPanelSettings sx={{ fontSize: 16 }} />}
      label={getRoleLabel(role, t)}
      sx={{
        backgroundColor: colors.backgroundColor,
        color: colors.color,
        fontWeight: 600,
        "& .MuiChip-icon": { color: colors.color },
      }}
    />
  );
}

export default function RoleManagement() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();

  const [anchorEl, setAnchorEl] = useState(null);
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [savingUserId, setSavingUserId] = useState(null);
  const [editingRole, setEditingRole] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [savingRole, setSavingRole] = useState(false);

  const fetchRoleData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const requestConfig = authConfig();
      const [rolesResponse, usersResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/roles`, requestConfig),
        axios.get(`${API_URL}/admin/roles/users`, requestConfig),
      ]);
      setRoles(
        Array.isArray(rolesResponse.data?.data) ? rolesResponse.data.data : [],
      );
      setUsers(
        Array.isArray(usersResponse.data?.data) ? usersResponse.data.data : [],
      );
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("admin.unableToLoadRoles")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    document.title = `${t("admin.rolesTitle")} | Smart Lab Admin`;
    fetchRoleData();
  }, [fetchRoleData, t]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const searchable = [
        user.first_name,
        user.last_name,
        user.email,
        user.role,
        user.role_display_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return matchesRole && (!query || searchable.includes(query));
    });
  }, [roleFilter, searchQuery, users]);

  const assignedUsers = users.filter((user) => user.roles?.length > 0).length;
  const systemRoles = roles.filter((role) => role.is_system).length;

  const handleRoleAssignment = async (userId, roleId) => {
    try {
      setSavingUserId(userId);
      setError("");
      setSuccess("");
      const response = await axios.put(
        `${API_URL}/admin/roles/users/${userId}`,
        { role_id: Number(roleId) },
        authConfig(),
      );
      const updatedUser = response.data?.data;
      if (updatedUser) {
        setUsers((currentUsers) =>
          currentUsers.map((user) => (user.id === userId ? updatedUser : user)),
        );
      }
      setRoles((currentRoles) =>
        currentRoles.map((role) => {
          const nextCount =
            role.user_count +
            (updatedUser?.role === role.name ? 1 : 0) -
            (users.find((user) => user.id === userId)?.role === role.name
              ? 1
              : 0);
          return { ...role, user_count: Math.max(0, nextCount) };
        }),
      );
      setSuccess(t("admin.roleChanged"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("admin.unableToChangeRole")));
    } finally {
      setSavingUserId(null);
    }
  };

  const openEditDialog = (role) => {
    setEditingRole(role);
    setDisplayName(role.display_name || role.name);
    setError("");
    setSuccess("");
  };

  const handleSaveRole = async () => {
    if (!editingRole || !displayName.trim()) return;
    try {
      setSavingRole(true);
      setError("");
      setSuccess("");
      const response = await axios.put(
        `${API_URL}/admin/roles/${editingRole.id}`,
        { display_name: displayName.trim() },
        authConfig(),
      );
      const updatedRole = response.data?.data;
      if (updatedRole) {
        setRoles((currentRoles) =>
          currentRoles.map((role) =>
            role.id === updatedRole.id ? updatedRole : role,
          ),
        );
        setUsers((currentUsers) =>
          currentUsers.map((user) => ({
            ...user,
            role_display_name:
              user.role === updatedRole.name
                ? updatedRole.display_name
                : user.role_display_name,
            roles: user.roles?.map((role) =>
              role.id === updatedRole.id
                ? { ...role, display_name: updatedRole.display_name }
                : role,
            ),
          })),
        );
      }
      setEditingRole(null);
      setSuccess(t("admin.roleNameSaved"));
    } catch (requestError) {
      setError(getErrorMessage(requestError, t("admin.unableToSaveRoleName")));
    } finally {
      setSavingRole(false);
    }
  };

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
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {t("admin.rolesTitle")}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
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

        <Box
          className="content-area admin-content-area page-content"
          sx={{ p: { xs: 3, md: 6 }, flex: 1 }}
        >
          <Box
            className="page-header"
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", sm: "center" },
              gap: 2,
              mb: 3,
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
                {t("admin.rolesHeading")}
              </Typography>
              <Typography variant="body2" color="#64748b" sx={{ mt: 0.75 }}>
                {t("admin.rolesSubtitle")}
              </Typography>
            </Box>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={fetchRoleData}
              disabled={loading}
              sx={{
                borderRadius: 3,
                textTransform: "none",
                fontWeight: "600",
                borderColor: "#cbd5e1",
                color: "#475569",
              }}
            >
              {t("admin.refreshData")}
            </Button>
          </Box>

          <Alert severity="info" sx={{ mb: 3, borderRadius: 3 }}>
            {t("admin.roleKeyInfo")}
          </Alert>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 3 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mb: 3, borderRadius: 3 }}>
              {success}
            </Alert>
          )}

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
              gap: 2,
              mb: 3,
            }}
          >
            {[
              {
                labelKey: "admin.allRolesSummary",
                value: roles.length,
                color: "#3b82f6",
                icon: <AdminPanelSettings />,
              },
              {
                labelKey: "admin.usersWithRole",
                value: assignedUsers,
                color: "#10b981",
                icon: <Person />,
              },
              {
                labelKey: "admin.systemRolesSummary",
                value: systemRoles,
                color: "#8b5cf6",
                icon: <Settings />,
              },
            ].map((card) => (
              <Paper
                key={card.labelKey}
                className="surface-card"
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    width: 46,
                    height: 46,
                    borderRadius: 3,
                    bgcolor: `${card.color}15`,
                    color: card.color,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {card.icon}
                </Box>
                <Box>
                  <Typography variant="body2" color="#64748b" fontWeight="500">
                    {t(card.labelKey)}
                  </Typography>
                  <Typography variant="h5" color="#0f172a" fontWeight="700">
                    {card.value}
                  </Typography>
                </Box>
              </Paper>
            ))}
          </Box>

          {loading ? (
            <Box sx={{ minHeight: 360, display: "grid", placeItems: "center" }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <Paper
                className="surface-card data-table-shell"
                elevation={0}
                sx={{
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    p: { xs: 2.5, md: 3 },
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <Typography variant="h6" fontWeight="700" color="#1e293b">
                    {t("admin.rolesInSystem")}
                  </Typography>
                  <Typography variant="body2" color="#64748b" sx={{ mt: 0.5 }}>
                    {t("admin.roleDisplayNameInfo")}
                  </Typography>
                </Box>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#f8fafc" }}>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("common.role")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("admin.roleDisplayName")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("admin.roleUsers")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("admin.roleType")}
                        </TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 700, color: "#64748b" }}
                        >
                          {t("admin.manage")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {roles.map((role) => (
                        <TableRow key={role.id} hover>
                          <TableCell>
                            <Chip
                              label={role.name}
                              size="small"
                              variant="outlined"
                              sx={{ fontWeight: 600, borderRadius: 2 }}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 600, color: "#334155" }}>
                            {getRoleLabel(role, t)}
                          </TableCell>
                          <TableCell sx={{ color: "#475569", fontWeight: 600 }}>
                            {role.user_count}
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={
                                role.is_system
                                  ? t("admin.systemRole")
                                  : t("admin.customRole")
                              }
                              size="small"
                              sx={{
                                bgcolor: role.is_system ? "#eff6ff" : "#f1f5f9",
                                color: role.is_system ? "#2563eb" : "#64748b",
                                fontWeight: 600,
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              startIcon={<Edit />}
                              size="small"
                              onClick={() => openEditDialog(role)}
                              sx={{
                                textTransform: "none",
                                fontWeight: 600,
                                borderRadius: 2,
                              }}
                            >
                              {t("common.edit")}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {!roles.length && (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            align="center"
                            sx={{ py: 5, color: "#94a3b8" }}
                          >
                            {t("admin.noRoles")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper
                className="surface-card data-table-shell"
                elevation={0}
                sx={{
                  borderRadius: 4,
                  border: "1px solid #e2e8f0",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    p: { xs: 2.5, md: 3 },
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  <Typography variant="h6" fontWeight="700" color="#1e293b">
                    {t("admin.assignRole")}
                  </Typography>
                  <Typography variant="body2" color="#64748b" sx={{ mt: 0.5 }}>
                    {t("admin.roleChangeDescription")}
                  </Typography>
                  <Box
                    sx={{ display: "flex", gap: 1.5, mt: 2, flexWrap: "wrap" }}
                  >
                    <Box
                      className="search-control admin-search-control"
                      sx={{
                        flex: "1 1 280px",
                        minWidth: 220,
                        px: 1.5,
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                      }}
                    >
                      <Search sx={{ color: "var(--text-muted)" }} />
                      <InputBase
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t("admin.searchUsers")}
                        sx={{ flex: 1, py: 0.75 }}
                      />
                    </Box>
                    <FormControl
                      className="admin-filter-control"
                      size="small"
                      sx={{ minWidth: 180 }}
                    >
                      <InputLabel id="role-filter-label">
                        {t("common.role")}
                      </InputLabel>
                      <Select
                        labelId="role-filter-label"
                        value={roleFilter}
                        label={t("common.role")}
                        onChange={(event) => setRoleFilter(event.target.value)}
                      >
                        <MenuItem value="all">{t("common.allRoles")}</MenuItem>
                        {roles.map((role) => (
                          <MenuItem key={role.id} value={role.name}>
                            {getRoleLabel(role, t)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                </Box>
                <TableContainer sx={{ overflowX: "auto" }}>
                  <Table>
                    <TableHead>
                      <TableRow sx={{ bgcolor: "#f8fafc" }}>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("common.user")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("admin.currentRole")}
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, color: "#64748b" }}>
                          {t("admin.createdAt")}
                        </TableCell>
                        <TableCell
                          sx={{
                            fontWeight: 700,
                            color: "#64748b",
                            minWidth: 210,
                          }}
                        >
                          {t("admin.changeRole")}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUsers.map((user) => {
                        const currentRole = user.roles?.[0];
                        const isSelf = user.email === currentUser?.email;
                        return (
                          <TableRow key={user.id} hover>
                            <TableCell>
                              <Box
                                sx={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 1.5,
                                }}
                              >
                                <Avatar
                                  sx={{
                                    width: 34,
                                    height: 34,
                                    bgcolor: getRoleColor(user.role).color,
                                    fontSize: 14,
                                    fontWeight: 700,
                                  }}
                                >
                                  {(
                                    user.first_name?.[0] ||
                                    user.email?.[0] ||
                                    "U"
                                  ).toUpperCase()}
                                </Avatar>
                                <Box>
                                  <Typography fontWeight={600} color="#334155">
                                    {`${user.first_name || ""} ${user.last_name || ""}`.trim() ||
                                      t("common.unknownName")}
                                  </Typography>
                                  <Typography variant="caption" color="#94a3b8">
                                    {user.email}
                                  </Typography>
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell>
                              <RoleChip
                                role={
                                  currentRole || {
                                    name: user.role,
                                    display_name: user.role_display_name,
                                  }
                                }
                              />
                            </TableCell>
                            <TableCell sx={{ color: "#64748b" }}>
                              {formatDate(user.created_at, t("common.locale"))}
                            </TableCell>
                            <TableCell>
                              <Select
                                size="small"
                                fullWidth
                                value={currentRole?.id || ""}
                                disabled={isSelf || savingUserId === user.id}
                                displayEmpty
                                onChange={(event) =>
                                  handleRoleAssignment(
                                    user.id,
                                    event.target.value,
                                  )
                                }
                                renderValue={(selected) => {
                                  const selectedRole = roles.find(
                                    (role) => role.id === selected,
                                  );
                                  return selectedRole
                                    ? getRoleLabel(selectedRole, t)
                                    : t("admin.selectRole");
                                }}
                              >
                                {roles
                                  .filter((role) => role.assignable)
                                  .map((role) => (
                                    <MenuItem key={role.id} value={role.id}>
                                      {getRoleLabel(role, t)}
                                    </MenuItem>
                                  ))}
                              </Select>
                              {isSelf && (
                                <Typography variant="caption" color="#94a3b8">
                                  {t("admin.cannotChangeSelf")}
                                </Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {!filteredUsers.length && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            align="center"
                            sx={{ py: 5, color: "#94a3b8" }}
                          >
                            {t("admin.noMatchingUsers")}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog
        open={Boolean(editingRole)}
        onClose={() => !savingRole && setEditingRole(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          {t("admin.editRoleTitle")}
        </DialogTitle>
        <DialogContent>
          <TextField
            label={t("admin.roleKey")}
            value={editingRole?.name || ""}
            fullWidth
            disabled
            sx={{ mt: 1, mb: 2 }}
          />
          <TextField
            label={t("admin.roleDisplayName")}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            fullWidth
            autoFocus
            inputProps={{ maxLength: 100 }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5 }}>
          <Button
            onClick={() => setEditingRole(null)}
            disabled={savingRole}
            sx={{ textTransform: "none", color: "#64748b" }}
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="contained"
            startIcon={<Save />}
            onClick={handleSaveRole}
            disabled={savingRole || !displayName.trim()}
            sx={{ textTransform: "none", borderRadius: 2.5, boxShadow: "none" }}
          >
            {savingRole ? t("admin.saving") : t("common.save")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
