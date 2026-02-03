import React, { useState, useEffect } from 'react';

interface AdminUser {
  id: number;
  email: string;
  role: string;
}

const AdminHeader: React.FC = () => {
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Load admin user from localStorage
    const storedUser = localStorage.getItem('adminUser');
    if (storedUser) {
      try {
        setAdminUser(JSON.parse(storedUser));
      } catch (error) {
        console.error('Error parsing admin user:', error);
      }
    }

    // Update time every second
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Left Side - Time */}
          <div className="flex items-center space-x-4">
            <div>
              <p className="text-2xl font-bold text-gray-900">{formatTime(currentTime)}</p>
              <p className="text-sm text-gray-500">{formatDate(currentTime)}</p>
            </div>
          </div>

          {/* Right Side - Admin Info */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {/* Notification Badge */}
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Admin User */}
            <div className="flex items-center space-x-3 border-l pl-4 border-gray-200">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">
                  {adminUser?.email || 'Admin User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {adminUser?.role?.replace('_', ' ') || 'Administrator'}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-md">
                {adminUser?.email?.charAt(0).toUpperCase() || 'A'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
