import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import axios from 'axios';

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      const token = localStorage.getItem('adminAccessToken');
      if (token) {
        await axios.post(
          '/api/admin/auth/logout',
          {},
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage
      localStorage.removeItem('adminAccessToken');
      localStorage.removeItem('adminRefreshToken');
      localStorage.removeItem('adminUser');

      // Redirect to login
      navigate('/admin/login');
    }
  };

  const menuItems = [
    {
      section: 'Dashboard',
      items: [
        { name: 'Overview', path: '/admin/dashboard', icon: '📊' },
        { name: 'Analytics', path: '/admin/analytics', icon: '📈' },
      ],
    },
    {
      section: 'Flash Sales',
      items: [
        { name: 'All Sales', path: '/admin/sales', icon: '⚡' },
        { name: 'Create Sale', path: '/admin/sales/create', icon: '➕' },
        { name: 'Live Sales', path: '/admin/sales/live', icon: '🔴' },
      ],
    },
    {
      section: 'Management',
      items: [
        { name: 'Queue Management', path: '/admin/queues', icon: '👥' },
        { name: 'User Management', path: '/admin/users', icon: '👤' },
        { name: 'Order Management', path: '/admin/orders', icon: '📦' },
      ],
    },
    {
      section: 'System',
      items: [
        { name: 'System Logs', path: '/admin/logs', icon: '📝' },
        { name: 'Performance', path: '/admin/performance', icon: '⚙️' },
        { name: 'Settings', path: '/admin/settings', icon: '🔧' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Menu Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {isOpen ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          )}
        </svg>
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-64 bg-gradient-to-b from-purple-900 via-blue-900 to-purple-800
          transform transition-transform duration-300 ease-in-out z-40
          lg:translate-x-0
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Header */}
          <div className="p-6 border-b border-white/10">
            <div className="flex items-center space-x-3">
              <div className="bg-white/10 rounded-lg p-2">
                <span className="text-2xl">⚡</span>
              </div>
              <div>
                <h1 className="text-white font-bold text-lg">Flash Sale</h1>
                <p className="text-blue-200 text-xs">Admin Portal</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
            {menuItems.map((section, idx) => (
              <div key={idx}>
                <h3 className="px-3 text-xs font-semibold text-blue-300 uppercase tracking-wider mb-2">
                  {section.section}
                </h3>
                <div className="space-y-1">
                  {section.items.map((item, itemIdx) => (
                    <NavLink
                      key={itemIdx}
                      to={item.path}
                      onClick={() => setIsOpen(false)}
                      className={({ isActive }: { isActive: boolean }) =>
                        `flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200
                        ${
                          isActive
                            ? 'bg-white/20 text-white shadow-lg'
                            : 'text-blue-100 hover:bg-white/10 hover:text-white'
                        }`
                      }
                    >
                      <span className="text-xl">{item.icon}</span>
                      <span className="font-medium">{item.name}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Logout Button */}
          <div className="p-4 border-t border-white/10">
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 
                       bg-red-500/20 hover:bg-red-500/30 text-red-100 rounded-lg
                       transition-colors duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoggingOut ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <span>Logging out...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  <span>Logout</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
