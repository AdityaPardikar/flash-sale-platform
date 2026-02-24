/**
 * Connection Status Component
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * Visual indicator for WebSocket connection state:
 * - Connected / Disconnected / Reconnecting / Error states
 * - Latency display
 * - Reconnection attempt counter
 * - Expandable details panel
 * - Auto-hide when connected (optional)
 */

import React, { useState, useEffect } from 'react';
import { useWebSocket, ConnectionState } from '../contexts/WebSocketContext';

// ─── Types ──────────────────────────────────────────────────

interface ConnectionStatusProps {
  /** Show detailed info when expanded */
  showDetails?: boolean;
  /** Auto-hide after connection established */
  autoHide?: boolean;
  /** Delay before auto-hiding (ms) */
  autoHideDelay?: number;
  /** Position on screen */
  position?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
  /** Compact mode - just the dot */
  compact?: boolean;
}

// ─── State Config ───────────────────────────────────────────

const stateConfig: Record<
  ConnectionState,
  {
    color: string;
    bgColor: string;
    borderColor: string;
    label: string;
    icon: string;
    pulse: boolean;
  }
> = {
  connected: {
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    label: 'Connected',
    icon: '●',
    pulse: false,
  },
  connecting: {
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    label: 'Connecting...',
    icon: '◌',
    pulse: true,
  },
  disconnected: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    label: 'Disconnected',
    icon: '○',
    pulse: false,
  },
  reconnecting: {
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
    label: 'Reconnecting...',
    icon: '◐',
    pulse: true,
  },
  error: {
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    label: 'Connection Error',
    icon: '✕',
    pulse: false,
  },
};

const positionClasses: Record<string, string> = {
  'top-right': 'top-4 right-4',
  'bottom-right': 'bottom-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'top-left': 'top-4 left-4',
};

// ─── Component ──────────────────────────────────────────────

export function ConnectionStatus({
  showDetails = false,
  autoHide = true,
  autoHideDelay = 3000,
  position = 'bottom-right',
  compact = false,
}: ConnectionStatusProps) {
  const { connectionState, latency, reconnectAttempts, connect, disconnect } = useWebSocket();
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  const config = stateConfig[connectionState];

  // Auto-hide after connected
  useEffect(() => {
    if (autoHide && connectionState === 'connected') {
      const timer = setTimeout(() => setIsVisible(false), autoHideDelay);
      return () => clearTimeout(timer);
    }
    // Show when not connected
    setIsVisible(true);
  }, [connectionState, autoHide, autoHideDelay]);

  if (!isVisible && !isExpanded) {
    // Show a tiny dot when hidden
    return (
      <button
        onClick={() => {
          setIsVisible(true);
          setIsExpanded(true);
        }}
        className={`fixed ${positionClasses[position]} z-50 w-3 h-3 rounded-full transition-all hover:scale-150 ${
          connectionState === 'connected' ? 'bg-green-500' : 'bg-red-500'
        } ${config.pulse ? 'animate-pulse' : ''}`}
        title={config.label}
        aria-label={`Connection status: ${config.label}`}
      />
    );
  }

  // Compact mode - just status dot and label
  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full ${config.bgColor} border ${config.borderColor}`}
        title={`Latency: ${latency}ms`}
      >
        <span className={`text-xs ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}>
          {config.icon}
        </span>
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
        {connectionState === 'connected' && latency > 0 && (
          <span className="text-xs text-gray-500">{latency}ms</span>
        )}
      </div>
    );
  }

  // Full floating status
  return (
    <div className={`fixed ${positionClasses[position]} z-50 transition-all duration-300`}>
      <div
        className={`rounded-lg border shadow-lg ${config.bgColor} ${config.borderColor} overflow-hidden min-w-[200px]`}
      >
        {/* Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full flex items-center justify-between px-3 py-2 hover:opacity-80 transition-opacity`}
        >
          <div className="flex items-center gap-2">
            <span className={`text-sm ${config.color} ${config.pulse ? 'animate-pulse' : ''}`}>
              {config.icon}
            </span>
            <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          </div>
          <div className="flex items-center gap-2">
            {connectionState === 'connected' && latency > 0 && (
              <span className="text-xs text-gray-500">{latency}ms</span>
            )}
            {reconnectAttempts > 0 && connectionState === 'reconnecting' && (
              <span className="text-xs text-yellow-600">Attempt {reconnectAttempts}</span>
            )}
            <span className="text-xs text-gray-400">{isExpanded ? '▲' : '▼'}</span>
          </div>
        </button>

        {/* Expanded details */}
        {isExpanded && showDetails && (
          <div className="px-3 pb-3 border-t border-gray-200 space-y-2 pt-2">
            <div className="grid grid-cols-2 gap-1 text-xs">
              <span className="text-gray-500">Status:</span>
              <span className={`font-medium ${config.color}`}>{connectionState}</span>

              <span className="text-gray-500">Latency:</span>
              <span className="font-medium">{latency > 0 ? `${latency}ms` : 'N/A'}</span>

              {reconnectAttempts > 0 && (
                <>
                  <span className="text-gray-500">Retries:</span>
                  <span className="font-medium">{reconnectAttempts}</span>
                </>
              )}

              <span className="text-gray-500">Transport:</span>
              <span className="font-medium">WebSocket</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              {connectionState === 'error' || connectionState === 'disconnected' ? (
                <button
                  onClick={connect}
                  className="flex-1 px-2 py-1 text-xs font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
                >
                  Reconnect
                </button>
              ) : connectionState === 'connected' ? (
                <button
                  onClick={disconnect}
                  className="flex-1 px-2 py-1 text-xs font-medium text-gray-600 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                >
                  Disconnect
                </button>
              ) : null}
              <button
                onClick={() => {
                  setIsExpanded(false);
                  setIsVisible(false);
                }}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Hide
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConnectionStatus;
