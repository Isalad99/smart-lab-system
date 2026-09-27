import { useState } from "react";
import {
  Close,
  Computer,
  Logout,
  Menu as MenuIcon,
  Person,
} from "@mui/icons-material";
import {
  Avatar,
  Box,
  Divider,
  IconButton,
  Popover,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/auth-context";
import { useLanguage } from "../context/language-context.js";
import AdminNavigation from "./AdminNavigation";
import NotificationBell from "./NotificationBell";

export default function AdminShell({ title, children }) {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);

  const handleLogout = () => {
    setAnchorEl(null);
    logout();
    navigate("/");
  };

  return (
    <Box className="app-layout admin-layout">
      {isSidebarOpen && (
        <Box
          className="sidebar-overlay"
          onClick={() => setIsSidebarOpen(false)}
          role="presentation"
        />
      )}

      <Box className={`sidebar admin-sidebar ${isSidebarOpen ? "open" : ""}`}>
        <Box className="sidebar-logo">
          <Box className="admin-brand-mark">
            <Computer sx={{ color: "white", fontSize: 28 }} />
          </Box>
          <Box>
            <Typography
              variant="h6"
              fontWeight="700"
              className="admin-brand-title"
            >
              Smart Lab
            </Typography>
            <Typography variant="caption" className="admin-brand-subtitle">
              {t("common.adminDashboard")}
            </Typography>
          </Box>
        </Box>

        <AdminNavigation onNavigate={() => setIsSidebarOpen(false)} />
      </Box>

      <Box className="main-area admin-main-area">
        <Box className="top-header admin-top-header">
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <IconButton
              className="admin-menu-toggle"
              onClick={() => setIsSidebarOpen(true)}
              aria-label={t("common.openMenu")}
            >
              <MenuIcon />
            </IconButton>
            <Typography
              variant="h5"
              fontWeight="700"
              className="admin-page-heading"
            >
              {title}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <NotificationBell
              className="admin-notification-button"
              iconColor="#64748b"
              loadNotifications={false}
            />
            <Divider
              orientation="vertical"
              flexItem
              className="admin-header-divider"
            />
            <Box className="admin-user-summary">
              <Typography variant="subtitle2" fontWeight="700">
                {currentUser?.name || t("common.systemAdmin")}
              </Typography>
              <Typography variant="caption" fontWeight="500">
                {currentUser?.role || t("common.administrator")}
              </Typography>
            </Box>
            <IconButton
              onClick={(event) => setAnchorEl(event.currentTarget)}
              aria-label={t("common.profile")}
              sx={{ p: 0.8 }}
            >
              <Avatar className="admin-avatar">
                {currentUser?.initial || <Person sx={{ fontSize: 20 }} />}
              </Avatar>
            </IconButton>
          </Box>
        </Box>

        <Box className="content-area admin-content-area">{children}</Box>
      </Box>

      {/* Popover การ์ดโปรไฟล์รูปแบบ Admin */}
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
            {currentUser?.email || "admin@smartlab.ac.th"}
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
            {currentUser?.name || t("common.systemAdmin")}
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
