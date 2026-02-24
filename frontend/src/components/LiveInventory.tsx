/**
 * Live Inventory Component
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * Real-time inventory counter with:
 * - Live stock level updates via WebSocket
 * - Visual progress bar with dynamic coloring
 * - Low stock urgency indicators
 * - Sold out state handling
 * - Animated transitions
 */

import React from 'react';
import { useInventoryUpdates } from '../hooks/useSocket';

// ─── Types ──────────────────────────────────────────────────

interface LiveInventoryProps {
  saleId: string;
  initialRemaining?: number;
  initialTotal?: number;
  showProgressBar?: boolean;
  compact?: boolean;
}

// ─── Component ──────────────────────────────────────────────

export function LiveInventory({
  saleId,
  initialRemaining,
  initialTotal,
  showProgressBar = true,
  compact = false,
}: LiveInventoryProps) {
  const { inventory, isSoldOut, isLowStock, isConnected } = useInventoryUpdates(saleId);

  const remaining = inventory?.remaining ?? initialRemaining ?? 0;
  const total = inventory?.total ?? initialTotal ?? 0;
  const percent = total > 0 ? (remaining / total) * 100 : 0;

  // Dynamic color based on stock level
  const getColor = () => {
    if (isSoldOut || remaining === 0)
      return { bg: 'bg-gray-200', fill: 'bg-gray-400', text: 'text-gray-600' };
    if (percent <= 5) return { bg: 'bg-red-100', fill: 'bg-red-500', text: 'text-red-700' };
    if (percent <= 10)
      return { bg: 'bg-orange-100', fill: 'bg-orange-500', text: 'text-orange-700' };
    if (percent <= 25)
      return { bg: 'bg-yellow-100', fill: 'bg-yellow-500', text: 'text-yellow-700' };
    return { bg: 'bg-green-100', fill: 'bg-green-500', text: 'text-green-700' };
  };

  const colors = getColor();

  // Sold out state
  if (isSoldOut || remaining === 0) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full">
          <span className="w-2 h-2 bg-gray-400 rounded-full" />
          <span className="text-sm font-semibold text-gray-600">Sold Out</span>
        </div>
      </div>
    );
  }

  // Compact mode
  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${colors.bg}`}>
          {isLowStock && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />}
          <span className={`text-xs font-semibold ${colors.text}`}>{remaining} left</span>
        </div>
        {!isConnected && (
          <span className="text-xs text-gray-400" title="Not connected to live updates">
            ●
          </span>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${colors.text}`}>
            {remaining} of {total} remaining
          </span>
          {isLowStock && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 animate-pulse">
              Low Stock!
            </span>
          )}
        </div>
        {isConnected ? (
          <span className="flex items-center gap-1 text-xs text-green-600">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            Live
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-gray-400">
            <span className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
            Offline
          </span>
        )}
      </div>

      {/* Progress bar */}
      {showProgressBar && (
        <div className={`w-full h-2.5 rounded-full ${colors.bg} overflow-hidden`}>
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${colors.fill}`}
            style={{ width: `${Math.max(percent, 1)}%` }}
          />
        </div>
      )}

      {/* Urgency message */}
      {isLowStock && remaining > 0 && (
        <p className="text-xs text-red-600 font-medium animate-pulse">
          ⚡ Hurry! Only {remaining} items left — selling fast!
        </p>
      )}
    </div>
  );
}

export default LiveInventory;
