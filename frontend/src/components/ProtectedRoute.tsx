import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * ProtectedRoute — Admin Auth Guard
 * Week 8 Day 1: Routing Overhaul
 *
 * Checks for adminAccessToken in localStorage.
 * Redirects unauthenticated users to /admin/login with a return URL.
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const location = useLocation();
  const token = localStorage.getItem('adminAccessToken');

  if (!token) {
    // Redirect to admin login, preserving the intended destination
    return <Navigate to="/admin/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
