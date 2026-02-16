/**
 * PWA Install Banner Component
 * Week 5 Day 5: PWA Implementation
 */

import React from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, promptInstall, dismiss } = usePWAInstall();

  // Don't show if already installed
  if (isInstalled) {
    return null;
  }

  // iOS-specific instructions
  if (isIOS && !isInstalled) {
    return (
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-4 z-50 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <p className="font-semibold">Install Flash Sale App</p>
              <p className="text-sm opacity-90">
                Tap <span className="inline-block px-2 py-0.5 bg-white/20 rounded">Share</span> then{' '}
                <span className="inline-block px-2 py-0.5 bg-white/20 rounded">
                  Add to Home Screen
                </span>
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="px-4 py-2 text-white/80 hover:text-white transition-colors"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // Standard install prompt
  if (!isInstallable) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-red-500 to-pink-500 text-white p-4 z-50 shadow-lg animate-slide-up">
      <div className="max-w-4xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <p className="font-semibold">Install Flash Sale App</p>
            <p className="text-sm opacity-90">Get instant access to flash sales, even offline!</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={dismiss}
            className="px-4 py-2 text-white/80 hover:text-white transition-colors"
          >
            Not now
          </button>
          <button
            onClick={promptInstall}
            className="px-6 py-2 bg-white text-red-500 font-semibold rounded-full hover:bg-gray-100 transition-colors"
          >
            Install
          </button>
        </div>
      </div>
    </div>
  );
};

export default PWAInstallBanner;
