import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Popover,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Close, Computer, Logout, Person } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/auth-context";
import AdminNavigation from "../components/AdminNavigation";
import { authConfig } from "../utils/auth";
import { formatDateTime } from "../utils/dateFormat";
import { useLanguage } from "../context/language-context.js";
import NotificationBell from "../components/NotificationBell";

const API_URL = import.meta.env.VITE_API_URL;

const STATUS_LABELS = {
  active: "active",
  maintenance: "maintenance",
  revoked: "revoked",
};

export default function AdminDevices() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [anchorEl, setAnchorEl] = useState(null);
  const [devices, setDevices] = useState([]);
  const [labs, setLabs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingDeviceId, setSavingDeviceId] = useState(null);
  const [notice, setNotice] = useState({
    open: false,
    message: "",
    severity: "success",
  });

  const showNotice = (message, severity = "success") => {
    setNotice({ open: true, message, severity });
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [devicesResponse, labsResponse] = await Promise.all([
        axios.get(`${API_URL}/admin/lab-devices`, authConfig()),
        axios.get(`${API_URL}/labs`),
      ]);
      setDevices(devicesResponse.data?.data || []);
      setLabs(labsResponse.data?.data || []);
    } catch (requestError) {
      setError(requestError.response?.data?.detail || t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    document.title = `${t("admin.devicesTitle")} | Smart Lab Admin`;
    fetchData();
  }, [fetchData, t]);

  const handleSaveDevice = async (device) => {
    try {
      setSavingDeviceId(device.id);
      await axios.put(
        `${API_URL}/admin/lab-devices/${device.id}`,
        {
          status: device.status,
          lab_id: device.lab.id,
          device_name: device.device_name,
        },
        authConfig(),
      );
      showNotice(t("admin.deviceRegistered"));
      await fetchData();
    } catch (requestError) {
      showNotice(
        requestError.response?.data?.detail || t("admin.deviceSaveFailed"),
        "error",
      );
    } finally {
      setSavingDeviceId(null);
    }
  };

  const updateDevice = (deviceId, field, value) => {
    setDevices((current) =>
      current.map((device) => {
        if (device.id !== deviceId) return device;
        if (field === "lab_id") {
          const lab = labs.find((item) => item.id === Number(value));
          return lab ? { ...device, lab } : device;
        }
        return { ...device, [field]: value };
      }),
    );
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

      <Box
        className="main-area admin-main-area"
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflowX: "hidden",
        }}
      >
        <Box
          className="top-header admin-top-header"
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 6,
            py: 1,
            bgcolor: "white",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <Typography
            variant="h5"
            fontWeight="700"
            sx={{ color: "#1e293b", letterSpacing: "-1px" }}
          >
            {t("admin.devicesTitle")}
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
            <Box sx={{ textAlign: "right" }}>
              <Typography variant="subtitle2" fontWeight="700" color="#1e293b">
                {t("common.systemAdmin")}
              </Typography>
              <Typography variant="caption" fontWeight="500" color="#94a3b8">
                {t("common.administrator")}
              </Typography>
            </Box>
            <IconButton
              onClick={(event) => setAnchorEl(event.currentTarget)}
              sx={{ p: 0.8 }}
            >
              <Avatar sx={{ bgcolor: "#0f172a", width: 36, height: 36 }}>
                <Person sx={{ fontSize: 20 }} />
              </Avatar>
            </IconButton>
          </Box>
        </Box>

        <Box
          className="content-area admin-content-area page-content"
          sx={{ p: { xs: 2, md: 5 }, flex: 1 }}
        >
          <Box
            className="page-header"
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: { xs: "flex-start", md: "center" },
              gap: 2,
              mb: 3,
              flexDirection: { xs: "column", md: "row" },
            }}
          >
            <Box>
              <Typography variant="h4" fontWeight="700" color="#0f172a">
                {t("admin.deviceHeading")}
              </Typography>
              <Typography color="#64748b" sx={{ mt: 0.5 }}>
                {t("admin.deviceSubtitle")}
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}
          <Paper
            className="surface-card data-table-shell"
            elevation={0}
            sx={{
              border: "1px solid #e2e8f0",
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <TableContainer sx={{ overflowX: "auto" }}>
              <Table sx={{ minWidth: 980 }}>
                <TableHead sx={{ bgcolor: "#f8fafc" }}>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t("admin.machine")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t("user.lab")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t("common.status")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t("admin.agent")}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>
                      {t("admin.lastSignal")}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {t("admin.manage")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 7 }}>
                        <CircularProgress size={28} />
                      </TableCell>
                    </TableRow>
                  ) : devices.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        align="center"
                        sx={{ py: 7, color: "#94a3b8" }}
                      >
                        {t("admin.noDevices")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    devices.map((device) => (
                      <TableRow key={device.id} hover>
                        <TableCell>
                          <Typography fontWeight={600} color="#1e293b">
                            {device.device_name}
                          </Typography>
                          <Typography variant="caption" color="#94a3b8">
                            {device.device_id}
                          </Typography>
                          <Typography
                            variant="caption"
                            display="block"
                            color="#94a3b8"
                          >
                            {device.device_mac || t("common.noMac")}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 210 }}>
                          <FormControl size="small" fullWidth>
                            <Select
                              value={device.lab.id}
                              onChange={(event) =>
                                updateDevice(
                                  device.id,
                                  "lab_id",
                                  event.target.value,
                                )
                              }
                            >
                              {labs.map((lab) => (
                                <MenuItem key={lab.id} value={lab.id}>
                                  {lab.code} — {lab.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell sx={{ minWidth: 155 }}>
                          <Select
                            size="small"
                            value={device.status}
                            onChange={(event) =>
                              updateDevice(
                                device.id,
                                "status",
                                event.target.value,
                              )
                            }
                          >
                            {Object.keys(STATUS_LABELS).map((value) => (
                              <MenuItem key={value} value={value}>
                                {t(`common.${value}`)}
                              </MenuItem>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          {device.agent_version || t("common.source")}
                        </TableCell>
                        <TableCell>
                          {formatDateTime(
                            device.last_seen_at,
                            t("common.locale"),
                            { fallback: "" },
                          ) || t("common.noSignal")}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={savingDeviceId === device.id}
                            onClick={() => handleSaveDevice(device)}
                            sx={{ textTransform: "none", borderRadius: 2 }}
                          >
                            {savingDeviceId === device.id
                              ? t("admin.savingDevice")
                              : t("admin.saveDevice")}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Box>
      </Box>

      <Snackbar
        open={notice.open}
        autoHideDuration={3500}
        onClose={() => setNotice((current) => ({ ...current, open: false }))}
      >
        <Alert
          severity={notice.severity}
          onClose={() => setNotice((current) => ({ ...current, open: false }))}
        >
          {notice.message}
        </Alert>
      </Snackbar>
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
          <IconButton size="small" onClick={() => setAnchorEl(null)}>
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
            <Typography fontSize="13px" fontWeight="600" color="#ef4444">
              {t("common.logout")}
            </Typography>
          </Box>
        </Box>
      </Popover>
    </Box>
  );
}
