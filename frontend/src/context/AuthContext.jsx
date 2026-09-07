import React, { useState } from 'react';
import { AuthContext } from './auth-context';

function readStoredUser() {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(window.atob(base64).split('').map((character) => {
      return '%' + ('00' + character.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    const decoded = JSON.parse(jsonPayload);
    if (typeof decoded.sub !== 'string' || !decoded.sub.includes('@')) {
      throw new Error('Token subject is missing.');
    }

    return {
      name: decoded.sub.split('@')[0],
      role: decoded.role === 'student' ? 'Student' : 'Guest',
      email: decoded.sub,
      initial: decoded.sub.charAt(0).toUpperCase(),
    };
  } catch (error) {
    console.error('Invalid token format', error);
    localStorage.removeItem('access_token');
    return null;
  }
}

// 2. สร้าง Provider เพื่อห่อหุ้มแอปพลิเคชัน
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(readStoredUser);
  const loading = false;

  const login = (token) => {
    localStorage.setItem('access_token', token);
    setCurrentUser(readStoredUser());
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
