import React, { ReactNode } from 'react';
import Sidebar from './Sidebar';
import AdminHeader from './AdminHeader';

interface AdminLayoutProps {
  children: ReactNode;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="lg:ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <AdminHeader />

        {/* Page Content */}
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-4 px-6">
          <div className="max-w-7xl mx-auto">
            <p className="text-sm text-gray-500 text-center">
              © 2026 Flash Sale Platform. All rights reserved.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default AdminLayout;
