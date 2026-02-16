/**
 * Offline Status Indicator Component
 * Week 5 Day 5: PWA Implementation
 */

import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

interface OfflineIndicatorProps {
  showOnlineConfirmation?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  showOnlineConfirmation = true,
}) => {
  const { isOnline, wasOffline } = useOnlineStatus();

  // Show "back online" message briefly
  if (isOnline && wasOffline && showOnlineConfirmation) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-green-500 text-white py-2 px-4 text-center z-50 animate-slide-down">
        <span className="inline-flex items-center gap-2">
          <span className="text-lg">✓</span>
          You're back online! Syncing data...
        </span>
      </div>
    );
  }

  // Show offline indicator
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-yellow-900 py-2 px-4 text-center z-50">
        <span className="inline-flex items-center gap-2">
          <span className="text-lg">📡</span>
          You're offline. Some features may be limited.
        </span>
      </div>
    );
  }

  return null;
};

export default OfflineIndicator;
