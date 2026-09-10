import React, { useState, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import Webcam from 'react-webcam';
import {
  TextField, Button, IconButton, InputAdornment, Box, Typography, Alert, CircularProgress,
  Checkbox, FormControlLabel, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Select, FormControl, InputLabel, FormHelperText
} from '@mui/material';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CancelIcon from '@mui/icons-material/Cancel';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AppRegistrationIcon from '@mui/icons-material/AppRegistration';
import LanguageIcon from '@mui/icons-material/Language';
import { registerLocales } from '../utils/locales';
import { BU_FACULTIES } from '../utils/buFaculties';

const API_URL = import.meta.env.VITE_API_URL;
const videoConstraints = { width: 400, height: 400, facingMode: 'user' };

export default function Register() {
  const navigate = useNavigate();

  // default ภาษาไทย
  const [lang, setLang] = useState('th');
  const t = registerLocales[lang];

  const [step, setStep]           = useState(1);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const [accountType, setAccountType]       = useState('general');
  const [consentChecked, setConsentChecked] = useState(false);
  const [showPassword, setShowPassword]     = useState(false);
  const [formData, setFormData] = useState({
    first_name: '', last_name: '', email: '', otp: '', password: '', student_id: '', phone: '',
  });

  const [faceImage, setFaceImage]       = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [openCamera, setOpenCamera]     = useState(false);
  const webcamRef = useRef(null);

  // คณะ/สาขา สำหรับนักศึกษา BU — department list จะ reset ทุกครั้งที่เปลี่ยนคณะ
  const [selectedFaculty, setSelectedFaculty]       = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const availableDepartments = BU_FACULTIES.find(f => f.id === selectedFaculty)?.departments || [];

  // อัปเดต tab title ทุกครั้งที่ step หรือภาษาเปลี่ยน
  useEffect(() => {
    document.title = t.tabTitles[step];
  }, [step, t]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (error) setError('');
    if (success) setSuccess('');
  };

  const toggleLanguage = () => {
    setLang(prev => prev === 'th' ? 'en' : 'th');
    setError('');
    setSuccess('');
  };

  // step 1 — ส่งอีเมลขอ OTP
  const handleRequestOTP = async (e) => {
    e.preventDefault();
    if (!formData.email) return setError(t.errEmailReq);
    setLoading(true); setError(''); setSuccess('');
    try {
      const response = await axios.post(`${API_URL}/request-otp`, { email: formData.email });
      setAccountType(response.data.account_type);
      setSuccess(response.data.message);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.detail || 'Connection error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // step 2 — ยืนยัน OTP
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    if (!formData.otp) return setError(t.errOtpReq);
    setLoading(true); setError(''); setSuccess('');
    try {
      await axios.post(`${API_URL}/verify-otp`, { email: formData.email, otp: formData.otp });
      setSuccess(lang === 'th' ? 'ยืนยัน OTP สำเร็จ' : 'OTP Verified Successfully.');
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // step 3 — validate แล้วไป step 4
  const handleGoToStep4 = (e) => {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!formData.first_name || !formData.last_name || !formData.password) return setError(t.errFieldsReq);
    if (accountType === 'student' && (!selectedFaculty || !selectedDepartment)) return setError(t.errFieldsReq);
    if (accountType === 'general' && !consentChecked) return setError(t.errConsent);
    setStep(4);
  };

  // step 4 — ส่งข้อมูลทั้งหมดพร้อมภาพใบหน้า
  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    if (!faceImage) return setError(t.errFaceReq);
    setLoading(true); setError('');

    const submitData = new FormData();
    submitData.append('email', formData.email);
    submitData.append('otp', formData.otp);
    submitData.append('password', formData.password);
    submitData.append('first_name', formData.first_name);
    submitData.append('last_name', formData.last_name);
    submitData.append('face_image', faceImage);
    if (accountType === 'student') {
      submitData.append('student_id', formData.student_id);
      submitData.append('faculty', selectedFaculty);
      submitData.append('department', selectedDepartment);
    } else {
      submitData.append('phone', formData.phone);
    }

    try {
      const response = await axios.post(`${API_URL}/register`, submitData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      alert(response.data.message);
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please contact support.');
    } finally {
      setLoading(false);
    }
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      fetch(imageSrc).then(res => res.blob()).then(blob => {
        setFaceImage(new File([blob], 'face_capture.jpg', { type: 'image/jpeg' }));
      });
      setImagePreview(imageSrc);
      setOpenCamera(false);
    }
  }, [webcamRef]);

  const handleImageUpload = (e) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setFaceImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  // [DEV ONLY] bypass handlers — removed automatically in production build
  const bypassStep1 = () => {
    setFormData(prev => ({ ...prev, email: 'dev.bypass@test.com' }));
    setAccountType('general');
    setError(''); setSuccess('');
    setStep(2);
  };
  const bypassStep2 = () => {
    setFormData(prev => ({ ...prev, otp: '123456' }));
    setError(''); setSuccess('');
    setStep(3);
  };
  const bypassStep3 = () => {
    setFormData(prev => ({ ...prev, first_name: 'Dev', last_name: 'Bypass', password: 'Test@1234', phone: '0812345678', student_id: 'STU000001' }));
    setConsentChecked(true);
    setError(''); setSuccess('');
    setStep(4);
  };
  const bypassStep4 = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 400; canvas.height = 400;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#9e9e9e';
    ctx.beginPath(); ctx.arc(200, 160, 80, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(200, 340, 120, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#757575'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('[DEV BYPASS FACE]', 200, 390);
    canvas.toBlob((blob) => { setFaceImage(new File([blob], 'bypass_face.jpg', { type: 'image/jpeg' })); }, 'image/jpeg');
    setImagePreview(canvas.toDataURL('image/jpeg'));
  };

  // shared input styles
  const inputSx = {
    '& .MuiOutlinedInput-root': { borderRadius: '10px' },
    '& .MuiInputLabel-root': { fontSize: '0.95rem' },
  };
  const primaryBtnSx = {
    height: '52px', fontSize: '0.95rem', fontWeight: 600,
    borderRadius: '10px', textTransform: 'none', letterSpacing: '0.3px',
  };
  const outlinedBtnSx = {
    height: '52px', fontSize: '0.95rem', fontWeight: 600,
    borderRadius: '10px', textTransform: 'none', borderWidth: '1.5px', letterSpacing: '0.3px',
  };

  // dev bypass button ที่แสดงใต้ทุก step (เฉพาะ non-production)
  const DevBypass = ({ onClick, label }) =>
    process.env.NODE_ENV !== 'production' ? (
      <Box sx={{ mt: 3, pt: 2, borderTop: '1px dashed #f59e0b' }}>
        <Button fullWidth variant="outlined" size="small" onClick={onClick}
          sx={{ color: '#d97706', borderColor: '#f59e0b', textTransform: 'none', fontWeight: 'bold', borderRadius: 2 }}>
          ⚡ {label}
        </Button>
      </Box>
    ) : null;

  // ---- step renders ----

  const renderStep1 = () => (
    <>
      <h1 className="login-title">{t.step1Title}</h1>
      <p className="login-subtitle">{t.step1Sub}</p>
      <form onSubmit={handleRequestOTP}>
        <TextField fullWidth label={t.emailLabel} name="email" type="email" variant="outlined"
          value={formData.email} onChange={handleChange} sx={{ mb: 3, ...inputSx }} />
        <Button fullWidth type="submit" variant="contained" disabled={loading}
          endIcon={!loading && <ArrowForwardIcon />} sx={{ ...primaryBtnSx, py: 1.5 }}>
          {loading ? <CircularProgress size={24} color="inherit" /> : t.reqOtpBtn}
        </Button>
      </form>
      <DevBypass onClick={bypassStep1} label="DEV: Skip to Step 2" />
    </>
  );

  const renderStep2 = () => (
    <>
      <h1 className="login-title">{t.step2Title}</h1>
      <p className="login-subtitle">{t.step2Sub} <b>{formData.email}</b></p>
      <form onSubmit={handleVerifyOTP}>
        <TextField fullWidth label={t.otpLabel} name="otp" type="text" variant="outlined"
          inputProps={{ maxLength: 6 }} value={formData.otp} onChange={handleChange} sx={{ mb: 4, ...inputSx }} />
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button fullWidth variant="outlined" onClick={() => setStep(1)} startIcon={<ArrowBackIcon />} sx={outlinedBtnSx}>
            {t.changeEmailBtn}
          </Button>
          <Button fullWidth type="submit" variant="contained" disabled={loading}
            endIcon={!loading && <ArrowForwardIcon />} sx={primaryBtnSx}>
            {loading ? <CircularProgress size={24} color="inherit" /> : t.verifyBtn}
          </Button>
        </Box>
      </form>
      <DevBypass onClick={bypassStep2} label="DEV: Skip to Step 3" />
    </>
  );

  const renderStep3 = () => (
    <>
      <h1 className="login-title">{t.step3Title}</h1>
      <p className="login-subtitle">{t.step3Sub} <strong>{accountType === 'student' ? t.roleStudent : t.roleGuest}</strong></p>
      <form onSubmit={handleGoToStep4}>
        <Box sx={{ display: 'flex', gap: 2, mb: 2.5 }}>
          <TextField fullWidth label={t.firstName} name="first_name" variant="outlined"
            value={formData.first_name} onChange={handleChange} sx={inputSx} />
          <TextField fullWidth label={t.lastName} name="last_name" variant="outlined"
            value={formData.last_name} onChange={handleChange} sx={inputSx} />
        </Box>

        <TextField fullWidth label={t.emailLabel} name="email" variant="outlined"
          value={formData.email} disabled sx={{ mb: 2.5, ...inputSx }} />

        {accountType === 'student' && (
          <Box sx={{ px: 2.5, pt: 2, pb: 2.5, mb: 2.5, bgcolor: '#f0f7ff', borderRadius: '10px', border: '1px solid #cce3ff' }}>
            <Typography variant="caption" color="primary" fontWeight="bold" sx={{ fontSize: '0.85rem' }}>{t.uniDetails}</Typography>
            <TextField fullWidth label={t.studentId} name="student_id" size="small"
              value={formData.student_id} onChange={handleChange} sx={{ mt: 1.5, mb: 2, bgcolor: 'white', ...inputSx }} />

            {/* คณะ */}
            <FormControl fullWidth size="small" sx={{ mb: 2, bgcolor: 'white', ...inputSx }}>
              <InputLabel>{t.selectFaculty}</InputLabel>
              <Select
                value={selectedFaculty}
                label={t.selectFaculty}
                onChange={(e) => {
                  setSelectedFaculty(e.target.value);
                  setSelectedDepartment(''); // reset สาขาทุกครั้งที่เปลี่ยนคณะ
                }}
              >
                {BU_FACULTIES.map((f) => (
                  <MenuItem key={f.id} value={f.id}>
                    {lang === 'th' ? f.name_th : f.name_en}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* สาขา — แสดงเมื่อเลือกคณะแล้ว */}
            <FormControl fullWidth size="small" disabled={!selectedFaculty} sx={{ bgcolor: 'white', ...inputSx }}>
              <InputLabel>{t.selectDepartment}</InputLabel>
              <Select
                value={selectedDepartment}
                label={t.selectDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
              >
                {availableDepartments.map((d) => (
                  <MenuItem key={d.id} value={d.id}>
                    {lang === 'th' ? d.name_th : d.name_en}
                  </MenuItem>
                ))}
              </Select>
              {!selectedFaculty && <FormHelperText>{lang === 'th' ? 'เลือกคณะก่อน' : 'Select a faculty first'}</FormHelperText>}
            </FormControl>
          </Box>
        )}

        {accountType === 'general' && (
          <Box sx={{ px: 2.5, pt: 2, pb: 2.5, mb: 2.5, bgcolor: '#fff5f5', borderRadius: '10px', border: '1px solid #ffd6d6' }}>
            <Typography variant="caption" color="error" fontWeight="bold" sx={{ fontSize: '0.85rem' }}>{t.guestDetails}</Typography>
            <TextField fullWidth label={t.phoneNum} name="phone" size="small" type="tel"
              value={formData.phone} onChange={handleChange} sx={{ mt: 1.5, mb: 1.5, bgcolor: 'white', ...inputSx }} />
            <FormControlLabel
              control={<Checkbox checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} color="error" size="small" />}
              label={<Typography variant="body2" color="textSecondary" sx={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{t.consentText}</Typography>}
              sx={{ alignItems: 'flex-start' }}
            />
          </Box>
        )}

        <TextField
          fullWidth label={t.password} name="password" type={showPassword ? 'text' : 'password'}
          variant="outlined" value={formData.password} onChange={handleChange}
          sx={{ mb: 3.5, ...inputSx }} inputProps={{ maxLength: 50 }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                  {showPassword ? <VisibilityOff /> : <Visibility />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />

        <Button fullWidth type="submit" variant="contained" endIcon={<ArrowForwardIcon />} sx={primaryBtnSx}>
          {t.nextFaceSetup}
        </Button>
      </form>
      <DevBypass onClick={bypassStep3} label="DEV: Skip to Step 4" />
    </>
  );

  const renderStep4 = () => (
    <>
      <h1 className="login-title">{t.step4Title}</h1>
      <p className="login-subtitle">{t.step4Sub}</p>
      <form onSubmit={handleCompleteRegistration}>

        {/* preview หรือ placeholder ใบหน้า */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
          {imagePreview ? (
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={imagePreview} alt="Face Capture"
                style={{ width: '180px', height: '180px', borderRadius: '50%', objectFit: 'cover', border: '4px solid #e2e8f0', display: 'block' }}
              />
              <IconButton
                onClick={() => { setImagePreview(null); setFaceImage(null); }}
                size="small"
                sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'white', boxShadow: '0 2px 6px rgba(0,0,0,0.15)', '&:hover': { bgcolor: '#fee2e2' } }}
              >
                <CancelIcon color="error" fontSize="small" />
              </IconButton>
            </Box>
          ) : (
            <Box sx={{ width: '180px', height: '180px', borderRadius: '50%', border: '2px dashed #cbd5e1', bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              <CameraAltIcon sx={{ fontSize: 40, color: '#cbd5e1' }} />
              <Typography variant="caption" color="textSecondary" align="center" sx={{ px: 2, lineHeight: 1.4 }}>
                {t.faceInst}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ปุ่มเปิดกล้อง / อัปโหลด — height เท่ากันทั้งคู่ */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <Button
            variant="outlined" fullWidth color="success"
            startIcon={<CameraAltIcon />}
            onClick={() => setOpenCamera(true)}
            sx={{ height: '48px', borderRadius: '10px', textTransform: 'none', fontWeight: 'bold', fontSize: '0.9rem' }}
          >
            {t.openCam}
          </Button>
          <Button
            variant="outlined" component="label" fullWidth
            startIcon={<CloudUploadIcon />}
            sx={{ height: '48px', borderRadius: '10px', textTransform: 'none', fontWeight: 'bold', fontSize: '0.9rem' }}
          >
            {t.uploadImg}
            <input hidden accept="image/*" type="file" onChange={handleImageUpload} />
          </Button>
        </Box>

        <Alert severity="info" sx={{ mb: 3, borderRadius: '8px', '& .MuiAlert-message': { fontSize: '0.875rem' } }}>
          {t.camNote}
        </Alert>

        {/* ปุ่ม Back และ Submit — flex-basis ทำให้ Back แคบกว่า Submit */}
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setStep(3)}
            startIcon={<ArrowBackIcon />}
            sx={{ ...outlinedBtnSx, flexBasis: '35%', flexShrink: 0 }}
          >
            {t.backBtn}
          </Button>
          <Button
            fullWidth type="submit" variant="contained"
            disabled={loading || !faceImage}
            sx={primaryBtnSx}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : t.completeBtn}
          </Button>
        </Box>

      </form>
      <DevBypass onClick={bypassStep4} label="DEV: Generate mock face image" />
    </>
  );

  return (
    <div className="login-wrapper" style={{ position: 'relative' }}>

      {/* ปุ่มสลับภาษา มุมขวาบน */}
      <Box sx={{ position: 'absolute', top: 24, right: 24, zIndex: 10 }}>
        <Button
          onClick={toggleLanguage}
          startIcon={<LanguageIcon />}
          variant="outlined"
          size="small"
          sx={{
            color: '#64748b', borderColor: '#e2e8f0', bgcolor: 'white',
            fontWeight: 'bold', borderRadius: 2, textTransform: 'none',
            '&:hover': { bgcolor: '#f8fafc', borderColor: '#cbd5e1' },
          }}
        >
          {lang === 'th' ? 'English' : 'ภาษาไทย'}
        </Button>
      </Box>

      <div className="login-container">

        {/* ฝั่งซ้าย: banner */}
        <div className="login-banner">
          <AppRegistrationIcon sx={{ fontSize: 72, color: 'var(--banner-title)', mb: 2 }} />
          <h2 className="login-banner-title">{t.bannerTitle}</h2>
          <p className="login-banner-subtitle">{t.bannerSub}</p>
        </div>

        {/* ฝั่งขวา: multi-step form */}
        <div className="login-form-section">
          <div className="login-form-content">
            {error   && <Alert severity="error"   sx={{ mb: 3, borderRadius: '8px' }}>{error}</Alert>}
            {success && step !== 4 && <Alert severity="success" sx={{ mb: 3, borderRadius: '8px' }}>{success}</Alert>}

            {step === 1 && renderStep1()}
            {step === 2 && renderStep2()}
            {step === 3 && renderStep3()}
            {step === 4 && renderStep4()}

            {step !== 4 && (
              <div className="login-links">
                <RouterLink to="/login" className="login-link">
                  {t.alreadyAccount} <b>{t.loginHere}</b>
                </RouterLink>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* กล้องถ่ายภาพ dialog */}
      <Dialog open={openCamera} onClose={() => setOpenCamera(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 'bold' }}>{t.camTitle}</DialogTitle>
        <DialogContent sx={{ p: 0, position: 'relative' }}>
          <Webcam audio={false} ref={webcamRef} screenshotFormat="image/jpeg"
            videoConstraints={videoConstraints} style={{ width: '100%', height: '100%', display: 'block' }} />
          {/* วงรีช่วยตำแหน่งใบหน้า */}
          <Box sx={{ position: 'absolute', top: '15%', left: '15%', right: '15%', bottom: '15%', border: '3px dashed white', borderRadius: '50%', pointerEvents: 'none' }} />
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', p: 2 }}>
          <Button variant="contained" color="success" onClick={capture} startIcon={<CameraAltIcon />}>{t.captureBtn}</Button>
          <Button variant="outlined" color="error" onClick={() => setOpenCamera(false)}>{t.cancelBtn}</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}