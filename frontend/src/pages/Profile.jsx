import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Avatar, IconButton, Paper, CircularProgress,
  Divider, Chip, Grid, LinearProgress
} from '@mui/material';
import {
  Notifications, EventNote, Assignment, History,
  SupportAgent, Logout, Computer, Menu as MenuIcon,
  Email, Phone, School, Badge, CalendarMonth, Star
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/auth-context';

const API_URL = import.meta.env.VITE_API_URL;

const FACULTY_NAMES = {
  business:      'School of Business Administration',
  communication: 'School of Communication Arts',
  engineering:   'School of Engineering',
  it:            'School of Information Technology and Innovation',
  architecture:  'School of Architecture',
  humanities:    'School of Humanities',
  finearts:      'School of Fine and Applied Arts',
  law:           'School of Law',
  accounting:    'School of Accounting',
  economics:     'School of Economics',
};

export default function Profile() {
  const navigate              = useNavigate();
  const { currentUser, logout } = useAuth();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [profile, setProfile]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState('');

  useEffect(() => {
    if (!currentUser) { navigate('/'); return; }
    fetchProfile();
  }, [currentUser, navigate]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const token   = localStorage.getItem('access_token');
      const headers = { Authorization: `Bearer ${token}` };

      const profileRes = await axios.get(`${API_URL}/users/me`, { headers });
      const profileData = profileRes.data;

      try {
        const pointsRes = await axios.get(`${API_URL}/users/${profileData.id}/points`, { headers });
        setProfile({ ...profileData, ...pointsRes.data });
      } catch {
        // ถ้า points ยังไม่มีใน DB ก็ใช้ profile อย่างเดียวก่อน
        setProfile({ ...profileData, points: 100, is_banned: false });
      }
    } catch (err) {
      setError('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้');
      console.error('[Profile] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const roleColor = profile?.role === 'student' ? '#3b82f6'
    : profile?.role === 'admin'   ? '#8b5cf6'
    : '#f59e0b';

  const roleLabel = profile?.role === 'student' ? 'นักศึกษา'
    : profile?.role === 'admin'   ? 'ผู้ดูแลระบบ'
    : 'บุคคลทั่วไป';

  const pointColor = (profile?.points ?? 100) >= 80 ? '#10b981'
    : (profile?.points ?? 100) >= 60 ? '#f59e0b'
    : '#ef4444';

  return (
    <div className="app-layout">
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />}

      {/* sidebar */}
      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Computer sx={{ fontSize: 40, color: '#1877f2' }} />
          <div>
            <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>Smart Lab</Typography>
            <Typography variant="caption" color="textSecondary">Reserve Lab to use</Typography>
          </div>
        </div>
        <div className="sidebar-menu">
          <div className="menu-item" onClick={() => navigate('/booking')}><EventNote /> Lab Reserve</div>
          <div className="menu-item" onClick={() => navigate('/reserved')}><Assignment /> Reserved</div>
          <div className="menu-item" onClick={() => navigate('/history')}><History /> History</div>
        </div>
        <div className="sidebar-menu" style={{ flex: 'none', paddingBottom: '24px' }}>
          <div className="menu-item"><SupportAgent /> Support</div>
          <div className="menu-item" onClick={handleLogout}><Logout /> Log Out</div>
        </div>
      </div>

      <div className="main-area">
        {/* header */}
        <div className="top-header">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton sx={{ display: { xs: 'block', md: 'none' }, color: '#111827' }} onClick={() => setIsSidebarOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h5" fontWeight="bold" color="#111827" sx={{ display: { xs: 'none', sm: 'block' } }}>
              My Profile
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 3 } }}>
            <IconButton><Notifications sx={{ color: '#111827' }} /></IconButton>
            {currentUser && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderLeft: '1px solid #e2e8f0', pl: { xs: 1, sm: 3 } }}>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="subtitle2" fontWeight="bold" lineHeight={1.2}>{currentUser.name}</Typography>
                  <Typography variant="caption" color="textSecondary">{currentUser.role}</Typography>
                </Box>
                <Avatar sx={{ bgcolor: '#111827', width: 36, height: 36 }}>{currentUser.initial}</Avatar>
              </Box>
            )}
          </Box>
        </div>

        {/* content */}
        <div className="content-area">
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
          ) : error ? (
            <Box sx={{ textAlign: 'center', mt: 10 }}>
              <Typography color="error">{error}</Typography>
            </Box>
          ) : profile && (
            <Box sx={{ maxWidth: '900px', mx: 'auto', px: { xs: 0, sm: 2 } }}>
              <Grid container spacing={3}>

                {/* ── LEFT COLUMN ── */}
                <Grid item xs={12} md={4}>

                  {/* avatar card */}
                  <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid #e2e8f0', overflow: 'hidden', bgcolor: 'white' }}>
                    {/* color banner */}
                    <Box sx={{ height: 80, bgcolor: roleColor, opacity: 0.12 }} />
                    <Box sx={{ px: 3, pb: 3, mt: '-48px', textAlign: 'center' }}>
                      <Avatar
                        src={profile.profile_pic ? `${API_URL}/${profile.profile_pic}` : undefined}
                        sx={{ width: 96, height: 96, border: '4px solid white', mx: 'auto', bgcolor: '#1e293b', fontSize: 36, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      >
                        {!profile.profile_pic && profile.first_name?.charAt(0).toUpperCase()}
                      </Avatar>

                      <Typography variant="h6" fontWeight="bold" color="#0f172a" sx={{ mt: 1.5 }}>
                        {profile.first_name} {profile.last_name}
                      </Typography>

                      <Chip
                        label={roleLabel}
                        size="small"
                        sx={{ mt: 0.5, mb: 2, bgcolor: `${roleColor}18`, color: roleColor, fontWeight: 'bold', fontSize: '12px' }}
                      />

                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, color: '#94a3b8' }}>
                        <CalendarMonth sx={{ fontSize: 14 }} />
                        <Typography variant="caption">เข้าร่วมเมื่อ {formatDate(profile.created_at)}</Typography>
                      </Box>
                    </Box>
                  </Paper>

                  {/* stats card */}
                  <Paper elevation={0} sx={{ mt: 3, p: 3, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: 'white' }}>
                    <Typography variant="caption" fontWeight="bold" color="#94a3b8" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      สถิติการใช้งาน
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'space-around', mt: 2, textAlign: 'center' }}>
                      <Box>
                        <Typography variant="h3" fontWeight="800" color="#1e293b" lineHeight={1}>
                          {profile.stats?.total_bookings ?? 0}
                        </Typography>
                        <Typography variant="caption" color="#94a3b8" sx={{ mt: 0.5, display: 'block' }}>การจอง</Typography>
                      </Box>
                      <Divider orientation="vertical" flexItem sx={{ mx: 2 }} />
                      <Box>
                        <Typography variant="h3" fontWeight="800" lineHeight={1} color={pointColor}>
                          {profile.points ?? 100}
                        </Typography>
                        <Typography variant="caption" color="#94a3b8" sx={{ mt: 0.5, display: 'block' }}>คะแนน</Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>

                {/* ── RIGHT COLUMN ── */}
                <Grid item xs={12} md={8}>
                  <Paper elevation={0} sx={{ p: 4, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: 'white', mb: 3 }}>
                    <Typography variant="caption" fontWeight="bold" color="#94a3b8" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                      ข้อมูลส่วนตัว
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, mt: 2.5 }}>

                      {/* email */}
                      <InfoRow icon={<Email sx={{ color: '#3b82f6', fontSize: 18 }} />} iconBg="#eff6ff" label="อีเมล" value={profile.email} />

                      {/* student */}
                      {profile.role === 'student' && (<>
                        <InfoRow icon={<Badge sx={{ color: '#3b82f6', fontSize: 18 }} />} iconBg="#eff6ff" label="รหัสนักศึกษา" value={profile.student_id || '—'} />
                        <InfoRow
                          icon={<School sx={{ color: '#3b82f6', fontSize: 18 }} />} iconBg="#eff6ff"
                          label="คณะ / สาขา"
                          value={FACULTY_NAMES[profile.faculty] || profile.faculty || '—'}
                          sub={profile.department}
                        />
                      </>)}

                      {/* guest */}
                      {profile.role === 'guest' && (
                        <InfoRow icon={<Phone sx={{ color: '#f59e0b', fontSize: 18 }} />} iconBg="#fff7ed" label="เบอร์โทรศัพท์" value={profile.phone || '—'} />
                      )}

                    </Box>
                  </Paper>

                  {/* point card */}
                  <Paper elevation={0} sx={{ p: 4, border: '1px solid #e2e8f0', borderRadius: 4, bgcolor: 'white' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5 }}>
                      <Star sx={{ color: '#f59e0b', fontSize: 20 }} />
                      <Typography variant="caption" fontWeight="bold" color="#94a3b8" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                        คะแนนของฉัน
                      </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
                      <Typography variant="body2" color="#64748b">คะแนนปัจจุบัน</Typography>
                      <Typography variant="h6" fontWeight="bold" color={pointColor}>
                        {profile.points ?? 100} <Typography component="span" variant="body2" color="#94a3b8">/ 100</Typography>
                      </Typography>
                    </Box>

                    <LinearProgress
                      variant="determinate"
                      value={profile.points ?? 100}
                      sx={{
                        height: 10, borderRadius: 5, mb: 2,
                        bgcolor: '#f1f5f9',
                        '& .MuiLinearProgress-bar': { borderRadius: 5, bgcolor: pointColor },
                      }}
                    />

                    {profile.is_banned ? (
                      <Chip
                        label={`ถูกระงับถึง ${new Date(profile.ban_until).toLocaleDateString('th-TH')}`}
                        size="small"
                        sx={{ bgcolor: '#fef2f2', color: '#ef4444', fontWeight: 'bold' }}
                      />
                    ) : (
                      <Chip
                        label="สถานะปกติ"
                        size="small"
                        sx={{ bgcolor: '#f0fdf4', color: '#16a34a', fontWeight: 'bold' }}
                      />
                    )}
                  </Paper>
                </Grid>

              </Grid>
            </Box>
          )}
        </div>
      </div>
    </div>
  );
}

// ── reusable info row ────────────────────────────────────────────────────────
function InfoRow({ icon, iconBg, label, value, sub }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
      <Avatar sx={{ bgcolor: iconBg, width: 38, height: 38, flexShrink: 0 }}>{icon}</Avatar>
      <Box>
        <Typography variant="caption" color="#94a3b8" fontWeight="bold" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Typography>
        <Typography variant="body2" fontWeight="600" color="#1e293b" sx={{ mt: 0.2 }}>{value}</Typography>
        {sub && <Typography variant="caption" color="#64748b">{sub}</Typography>}
      </Box>
    </Box>
  );
}
