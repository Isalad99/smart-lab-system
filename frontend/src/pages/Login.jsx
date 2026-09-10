import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Alert,
  CircularProgress,
  Box,
  Divider,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import LanguageIcon from "@mui/icons-material/Language";
import { useAuth } from "../context/auth-context";
import { loginLocales } from "../utils/locales";

const API_URL = import.meta.env.VITE_API_URL;

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // default ภาษาไทย — กดปุ่มมุมขวาบนเพื่อสลับเป็น EN
  const [lang, setLang] = useState("th");
  const t = loginLocales[lang];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [apiError, setApiError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    document.title = t.tabTitle;
  }, [t]);

  const handleLogin = async () => {
    let isValid = true;
    setApiError("");
    setIsPending(false);

    if (!email) {
      setEmailError(t.errEmail);
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError(t.errEmailFormat);
      isValid = false;
    } else {
      setEmailError("");
    }

    if (!password) {
      setPasswordError(t.errPassword);
      isValid = false;
    } else {
      setPasswordError("");
    }

    if (!isValid) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("username", email);
      params.append("password", password);

      const response = await axios.post(`${API_URL}/login`, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      login(response.data.access_token);

      const base64Url = response.data.access_token.split(".")[1];
      const base64Safe = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64Safe));

      if (payload.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/booking");
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setIsPending(true);
        setApiError(err.response?.data?.detail || t.pendingMsg);
      } else {
        setApiError(err.response?.data?.detail || t.invalidMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper" style={{ position: "relative" }}>
      {/* ปุ่มสลับภาษา มุมขวาบน */}
      <Box sx={{ position: "absolute", top: 24, right: 24, zIndex: 10 }}>
        <Button
          onClick={() => setLang((prev) => (prev === "th" ? "en" : "th"))}
          startIcon={<LanguageIcon />}
          variant="outlined"
          size="small"
          sx={{
            color: "#64748b",
            borderColor: "#e2e8f0",
            bgcolor: "white",
            fontWeight: "bold",
            borderRadius: 2,
            textTransform: "none",
            "&:hover": { bgcolor: "#f8fafc", borderColor: "#cbd5e1" },
          }}
        >
          {lang === "th" ? "English" : "ภาษาไทย"}
        </Button>
      </Box>

      <div className="login-container">
        {/* ฝั่งซ้าย: banner */}
        <div className="login-banner">
          <h1 className="login-banner-title">
            {lang === "th" ? (
              <>
                สำรวจห้องแล็บ
                <br />
                ที่คุณ
                <br />
                <span style={{ color: "#1877f2" }}>ต้องการ</span>
              </>
            ) : (
              <>
                Explore
                <br />
                the labs
                <br />
                <span style={{ color: "#1877f2" }}>you need.</span>
              </>
            )}
          </h1>
        </div>

        {/* ฝั่งขวา: ฟอร์ม login */}
        <div className="login-form-section">
          <div className="login-form-content">
            <h2 className="login-title">{t.pageTitle}</h2>

            {apiError && (
              <Alert
                severity={isPending ? "warning" : "error"}
                icon={
                  isPending ? (
                    <HourglassEmptyIcon fontSize="inherit" />
                  ) : undefined
                }
                sx={{ mb: 3, borderRadius: "8px", fontWeight: "600" }}
              >
                {apiError}
              </Alert>
            )}

            <TextField
              fullWidth
              label={t.emailLabel}
              variant="outlined"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!emailError}
              helperText={emailError}
              sx={{ mb: 2 }}
            />

            <TextField
              fullWidth
              label={t.passwordLabel}
              type={showPassword ? "text" : "password"}
              variant="outlined"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={!!passwordError}
              helperText={passwordError}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{ mb: 3 }}
            />

            <Button
              fullWidth
              variant="contained"
              onClick={handleLogin}
              disabled={loading}
              sx={{
                height: "48px",
                fontSize: "1.1rem",
                fontWeight: "bold",
                borderRadius: "24px",
                textTransform: "none",
                backgroundColor: "#1877f2",
                "&:hover": { backgroundColor: "#166fe5" },
                mb: 2,
              }}
            >
              {loading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                t.loginBtn
              )}
            </Button>

            <Box sx={{ textAlign: "center", mb: 3 }}>
              <a
                href="#"
                style={{
                  color: "#1877f2",
                  textDecoration: "none",
                  fontSize: "0.95rem",
                }}
              >
                {t.forgotPassword}
              </a>
            </Box>

            <Divider sx={{ mb: 3 }} />

            <Button
              fullWidth
              variant="outlined"
              onClick={() => navigate("/register")}
              sx={{
                height: "48px",
                fontSize: "1.05rem",
                fontWeight: "bold",
                borderRadius: "24px",
                textTransform: "none",
                color: "#1877f2",
                borderColor: "#1877f2",
                "&:hover": {
                  borderColor: "#166fe5",
                  backgroundColor: "#e7f3ff",
                },
              }}
            >
              {t.createAccount}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
