import React, { useEffect, useState } from 'react';
import { useToast, Toast, ToastType } from '../contexts/ToastContext';

// ─── Icons per type ──────────────────────────────────────────

const icons: Record<ToastType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
};

const bgColors: Record<ToastType, string> = {
  success: 'from-green-600/90 to-green-700/90 border-green-400/30',
  error: 'from-red-600/90 to-red-700/90 border-red-400/30',
  warning: 'from-yellow-600/90 to-yellow-700/90 border-yellow-400/30',
  info: 'from-blue-600/90 to-blue-700/90 border-blue-400/30',
};

// ─── Single Toast Item ───────────────────────────────────────

const ToastItem: React.FC<{ toast: Toast; onDismiss: (id: string) => void }> = ({
  toast,
  onDismiss,
}) => {
  const [isExiting, setIsExiting] = useState(false);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  useEffect(() => {
    // Start exit animation 300ms before auto-removal
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      const timer = setTimeout(() => setIsExiting(true), Math.max(duration - 300, 0));
      return () => clearTimeout(timer);
    }
  }, [toast.duration]);

  return (
    <div
      className={`
        flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md shadow-2xl
        bg-gradient-to-r ${bgColors[toast.type]}
        transition-all duration-300 ease-in-out
        ${isExiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}
      `}
      role="alert"
    >
      <span className="text-xl flex-shrink-0 mt-0.5">{icons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm">{toast.title}</p>
        {toast.message && (
          <p className="text-white/80 text-xs mt-1 leading-relaxed">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 text-white/60 hover:text-white transition-colors p-1"
        aria-label="Dismiss notification"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

// ─── Toast Container ─────────────────────────────────────────

/**
 * ToastContainer — Renders all active toasts
 * Week 8 Day 2: Toast System
 *
 * Place this component once at the root of the app.
 * Toasts appear in the top-right corner with stacking and exit animations.
 */
const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto animate-slideDown">
          <ToastItem toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;
