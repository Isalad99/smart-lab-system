import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, Paper, Grid, Button, IconButton, CircularProgress, Divider, Chip
} from '@mui/material';
import { 
  ArrowBack, CheckCircle, Cancel, PersonOutline, Phone, Email
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

export default function VerifyUsers() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pendingUsers, setPendingUsers] = useState([]);

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(`${API_URL}/admin/users/pending`);
      setPendingUsers(res.data.data || []);
    } catch (error) {
      console.error("Failed to fetch pending users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (userId, action) => {
    if (action === 'reject' && !window.confirm("Are you sure you want to reject and delete this user?")) return;
    
    try {
      await axios.put(`${API_URL}/admin/users/${userId}/verify`, { action });
      fetchPendingUsers(); // รีเฟรชข้อมูลหลังกด
    } catch (error) {
      alert(`Failed to ${action} user.`);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 3, md: 6 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton onClick={() => navigate('/admin')} sx={{ bgcolor: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <ArrowBack />
        </IconButton>
        <Box>
          <Typography variant="h4" fontWeight="800" color="#1e293b">Verify Guest Users</Typography>
          <Typography variant="body2" color="#64748b">Review and approve external users before they can book labs.</Typography>
        </Box>
      </Box>

      {/* Content */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
      ) : pendingUsers.length === 0 ? (
        <Paper elevation={0} sx={{ p: 8, textAlign: 'center', borderRadius: 4, border: '1px dashed #cbd5e1', bgcolor: 'transparent' }}>
          <PersonOutline sx={{ fontSize: 64, color: '#94a3b8', mb: 2 }} />
          <Typography variant="h6" color="#64748b" fontWeight="700">No Pending Verifications</Typography>
          <Typography variant="body2" color="#94a3b8">All guest accounts are up to date.</Typography>
        </Paper>
      ) : (
        <Grid container spacing={4}>
          {pendingUsers.map((user) => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={user.id}>
              <Paper elevation={0} sx={{ borderRadius: 6, overflow: 'hidden', border: '1px solid #e2e8f0', transition: '0.3s', '&:hover': { transform: 'translateY(-5px)', boxShadow: '0 20px 40px rgba(0,0,0,0.05)' } }}>
                
                {/* 🌟 ดึงรูปภาพจาก Backend */}
                <Box 
                  sx={{ 
                    height: 250, width: '100%', bgcolor: '#e2e8f0', 
                    backgroundImage: user.profile_pic ? `url(${API_URL}/${user.profile_pic})` : 'none',
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {!user.profile_pic && <Typography color="#94a3b8">No Image</Typography>}
                </Box>

                <Box sx={{ p: 3 }}>
                  <Typography variant="h6" fontWeight="800" color="#1e293b" sx={{ mb: 0.5 }}>
                    {user.first_name} {user.last_name}
                  </Typography>
                  <Chip label="Guest User" size="small" sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: '700', mb: 2 }} />
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#475569' }}>
                      <Email fontSize="small" sx={{ color: '#94a3b8' }} />
                      <Typography variant="body2" noWrap>{user.email}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: '#475569' }}>
                      <Phone fontSize="small" sx={{ color: '#94a3b8' }} />
                      <Typography variant="body2">{user.phone || 'No phone provided'}</Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ mb: 2 }} />

                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      fullWidth variant="outlined" color="error" startIcon={<Cancel />}
                      onClick={() => handleVerify(user.id, 'reject')}
                      sx={{ borderRadius: 3, fontWeight: '700', textTransform: 'none' }}
                    >
                      Reject
                    </Button>
                    <Button 
                      fullWidth variant="contained" color="success" startIcon={<CheckCircle />}
                      onClick={() => handleVerify(user.id, 'approve')}
                      sx={{ borderRadius: 3, fontWeight: '700', textTransform: 'none', boxShadow: 'none' }}
                    >
                      Approve
                    </Button>
                  </Box>
                </Box>
              </Paper>
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}