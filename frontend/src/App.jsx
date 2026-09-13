import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { AuthProvider } from './context/AuthContext'; 

import Login from './pages/Login';
import Register from './pages/Register';
import Booking from './pages/Booking';
import Admin from './pages/Admin';
import AdminPoints from './pages/AdminPoints';
import AdminPointPolicy from './pages/AdminPointPolicy';
import ManageLabs from './pages/ManageLabs';
import Reserved from './pages/Reserved';
import History from './pages/History';
import VerifyUsers from './pages/VerifyUsers';
import BlacklistManager from './pages/BlacklistManager';
import Profile from './pages/Profile';
import TicketManager from './pages/TicketManager';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <CssBaseline /> 
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/register" element={<Register />} />
            <Route path="/reserved" element={<Reserved />} />
            <Route path="/history" element={<History />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/points" element={<AdminPoints />} />
            <Route path="/admin/points/policy" element={<AdminPointPolicy />} />
            <Route path="/manage-labs" element={<ManageLabs />} />
            <Route path="/verify-users" element={<VerifyUsers />} />
            <Route path="/blacklist" element={<BlacklistManager />} />
            <Route path="/profile" element={<Profile />} />   {/* ← ย้ายขึ้นมาก่อน * */}
            <Route path="/ticket" element={<TicketManager />} />
            <Route path="*" element={<Navigate to="/" replace />} />
            
          </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
