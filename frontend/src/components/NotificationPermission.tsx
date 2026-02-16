/**
 * Notification Permission Component
 * Week 5 Day 5: PWA Implementation
 */

import React, { useState, useEffect } from 'react';
import { pushNotificationService } from '../utils/pushNotifications';

interface NotificationPermissionProps {
  onPermissionChange?: (permission: NotificationPermission) => void;
}

export const NotificationPermission: React.FC<NotificationPermissionProps> = ({
  onPermissionChange,
}) => {
  const [permission, setPermission] = useState<NotificationPermission>(
    pushNotificationService.getPermission()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Show banner after a delay if permission is default
    if (permission === 'default') {
      const timer = setTimeout(() => setShowBanner(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [permission]);

  const handleRequestPermission = async () => {
    setIsLoading(true);

    try {
      const newPermission = await pushNotificationService.requestPermission();
      setPermission(newPermission);
      onPermissionChange?.(newPermission);

      if (newPermission === 'granted') {
        // Initialize push notifications
        await pushNotificationService.initialize();
      }
    } catch (error) {
      console.error('Failed to request permission:', error);
    } finally {
      setIsLoading(false);
      setShowBanner(false);
    }
  };

  // Already granted or denied
  if (permission !== 'default' || !showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-white rounded-xl shadow-2xl p-6 z-50 border border-gray-200">
      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-red-500 to-pink-500 rounded-full flex items-center justify-center">
          <span className="text-2xl">🔔</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 mb-1">Don't Miss Flash Sales!</h3>
          <p className="text-sm text-gray-600 mb-4">
            Get notified when sales start, your queue position updates, or when it's your turn to
            buy.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBanner(false)}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Maybe Later
            </button>
            <button
              onClick={handleRequestPermission}
              disabled={isLoading}
              className="px-4 py-2 bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Enabling...' : 'Enable Notifications'}
            </button>
          </div>
        </div>
        <button
          onClick={() => setShowBanner(false)}
          className="text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default NotificationPermission;
