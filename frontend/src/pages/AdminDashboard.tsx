import React from 'react';
import { Outlet } from 'react-router-dom';
import AdminLayout from '../components/AdminLayout';

const AdminDashboard: React.FC = () => {
  return (
    <AdminLayout>
      <Outlet />
    </AdminLayout>
  );
};

export default AdminDashboard;
