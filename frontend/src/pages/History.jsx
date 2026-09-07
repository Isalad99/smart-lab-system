// ============================================================================
// 1. IMPORTS & CONFIGURATION
// ============================================================================
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Box, Typography, Avatar, IconButton, Paper, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow
} from '@mui/material';
import { 
  Notifications, EventNote, Assignment, History as HistoryIcon, 
  SupportAgent, Logout, Computer, Menu as MenuIcon 
} from '@mui/icons-material';

import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/auth-context';

const API_URL = import.meta.env.VITE_API_URL;

export default function History() {
  const navigate = useNavigate();
  const { currentUser, logout } = useAuth();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [pastBookings, setPastBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMyHistory = useCallback(async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/bookings/user/${currentUser.email}`);
      const allBookings = response.data.data;

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);

      const historyOnly = allBookings.filter(booking => {
        const bookingDate = new Date(booking.booking_date);
        bookingDate.setHours(0, 0, 0, 0);
        return bookingDate.getTime() < todayMidnight.getTime();
      });

      setPastBookings(historyOnly);
    } catch (error) {
      console.error("[API Error] Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    fetchMyHistory();
  }, [currentUser, fetchMyHistory, navigate]);

  const handleLogout = () => {
    logout();
    navigate('/'); 
  };

  const formatDate = (dateString) => {
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-GB', options);
  };

  return (
    <div className="app-layout">
      {isSidebarOpen && <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)}></div>}

      <div className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Computer sx={{ fontSize: 40, color: '#1877f2' }} />
          <div>
            <Typography variant="h6" fontWeight="bold" lineHeight={1.2}>Smart Lab</Typography>
            <Typography variant="caption" color="textSecondary">Reserve Lab to use</Typography>
          </div>
        </div>

        <div className="sidebar-menu">
          <div className="menu-item" onClick={() => navigate('/booking')}>
            <EventNote /> Lab Reserve
          </div>
          <div className="menu-item" onClick={() => navigate('/reserved')}>
            <Assignment /> Reserved
          </div>
          <div className="menu-item active" onClick={() => setIsSidebarOpen(false)}>
            <HistoryIcon /> History
          </div>
        </div>

        <div className="sidebar-menu" style={{ flex: 'none', paddingBottom: '24px' }}>
          <div className="menu-item"><SupportAgent /> Support</div>
          <div className="menu-item" onClick={handleLogout}><Logout /> Log Out</div>
        </div>
      </div>

      <div className="main-area">
        <div className="top-header">
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconButton sx={{ display: { xs: 'block', md: 'none' }, color: '#111827' }} onClick={() => setIsSidebarOpen(true)}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h5" fontWeight="bold" color="#111827" sx={{ display: { xs: 'none', sm: 'block' } }}>
              Booking History
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 3 } }}>
            <IconButton><Notifications sx={{ color: '#111827' }} /></IconButton>
            {currentUser && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderLeft: '1px solid #e2e8f0', pl: { xs: 1, sm: 3 } }}>
                <Box className="profile-text-container" sx={{ textAlign: 'right' }}>
                  <Typography variant="subtitle2" fontWeight="bold" lineHeight={1.2}>{currentUser.name}</Typography>
                  <Typography variant="caption" color="textSecondary">{currentUser.role}</Typography>
                </Box>
                <Avatar sx={{ bgcolor: '#111827', width: 36, height: 36 }}>{currentUser.initial}</Avatar>
              </Box>
            )}
          </Box>
        </div>

        <div className="content-area">
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>
          ) : (
            <Paper elevation={0} sx={{ p: { xs: 2, sm: 4 }, border: '2px solid #cbd5e1', borderRadius: 4, maxWidth: '900px', mx: 'auto', bgcolor: 'white' }}>
              <Typography variant="h6" fontWeight="bold" color="#64748b" sx={{ mb: 3 }}>
                Past Reservations
              </Typography>

              {pastBookings.length > 0 ? (
                <TableContainer>
                  <Table sx={{ minWidth: 600 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>#ID</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Room</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Time</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pastBookings.map((row) => (
                        <TableRow key={row.id} sx={{ '&:last-child td, &:last-child th': { border: 0 }, opacity: 0.8 }}>
                          <TableCell sx={{ color: '#94a3b8' }}>{row.id.toString().padStart(4, '0')}</TableCell>
                          <TableCell sx={{ color: '#64748b' }}>{row.lab_code}</TableCell>
                          <TableCell sx={{ color: '#64748b' }}>{formatDate(row.booking_date)}</TableCell>
                          <TableCell sx={{ color: '#64748b' }}>{row.start_time} - {row.end_time}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Box sx={{ py: 6, textAlign: 'center', bgcolor: '#f8fafc', borderRadius: 3 }}>
                  <Typography variant="body1" color="textSecondary">No past history found.</Typography>
                </Box>
              )}
            </Paper>
          )}
        </div>
      </div>
    </div>
  );
}
