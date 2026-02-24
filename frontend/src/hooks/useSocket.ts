/**
 * Enhanced WebSocket Hook
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * Replaces the basic useSocket hook with a comprehensive implementation:
 * - Uses WebSocketContext for shared connection
 * - Event subscription with auto-cleanup
 * - Typed event handlers
 * - Sale-specific room subscriptions
 * - Connection state awareness
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { useWebSocket, ConnectionState } from '../contexts/WebSocketContext';

// ─── Types ──────────────────────────────────────────────────

export interface UseSocketOptions {
  /** Auto-join a sale room on mount */
  saleId?: string;
  /** Events to subscribe to on mount */
  events?: Record<string, (...args: any[]) => void>;
}

export interface UseSocketReturn {
  isConnected: boolean;
  connectionState: ConnectionState;
  latency: number;
  reconnectAttempts: number;
  joinSaleRoom: (saleId: string) => void;
  leaveSaleRoom: (saleId: string) => void;
  emit: (event: string, data?: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
}

// ─── Hook ───────────────────────────────────────────────────

export function useSocket(options: UseSocketOptions = {}): UseSocketReturn {
  const ws = useWebSocket();
  const { saleId, events } = options;
  const subscribedRef = useRef(false);

  // Auto-join sale room
  useEffect(() => {
    if (saleId && ws.isConnected) {
      ws.joinSaleRoom(saleId);
      return () => {
        ws.leaveSaleRoom(saleId);
      };
    }
  }, [saleId, ws.isConnected, ws.joinSaleRoom, ws.leaveSaleRoom]);

  // Auto-subscribe to events
  useEffect(() => {
    if (events && ws.isConnected && !subscribedRef.current) {
      Object.entries(events).forEach(([event, handler]) => {
        ws.on(event, handler);
      });
      subscribedRef.current = true;

      return () => {
        Object.entries(events).forEach(([event, handler]) => {
          ws.off(event, handler);
        });
        subscribedRef.current = false;
      };
    }
  }, [events, ws.isConnected, ws.on, ws.off]);

  return {
    isConnected: ws.isConnected,
    connectionState: ws.connectionState,
    latency: ws.latency,
    reconnectAttempts: ws.reconnectAttempts,
    joinSaleRoom: ws.joinSaleRoom,
    leaveSaleRoom: ws.leaveSaleRoom,
    emit: ws.emit,
    on: ws.on,
    off: ws.off,
  };
}

// ─── Specialized Hooks ──────────────────────────────────────

/**
 * Hook for subscribing to real-time inventory updates for a sale.
 */
export function useInventoryUpdates(saleId: string) {
  const [inventory, setInventory] = useState<{
    remaining: number;
    total: number;
    percentRemaining: number;
  } | null>(null);

  const [isSoldOut, setIsSoldOut] = useState(false);
  const [isLowStock, setIsLowStock] = useState(false);

  const { isConnected } = useSocket({
    saleId,
    events: {
      'inventory:updated': (data: any) => {
        setInventory({
          remaining: data.remaining,
          total: data.total,
          percentRemaining: data.percentRemaining,
        });
        setIsLowStock(data.percentRemaining <= 10);
      },
      'inventory:soldout': () => {
        setIsSoldOut(true);
        setInventory((prev) => (prev ? { ...prev, remaining: 0, percentRemaining: 0 } : null));
      },
      'inventory:low': () => {
        setIsLowStock(true);
      },
    },
  });

  return { inventory, isSoldOut, isLowStock, isConnected };
}

/**
 * Hook for subscribing to queue position updates.
 */
export function useQueuePosition(saleId: string) {
  const [position, setPosition] = useState<number | null>(null);
  const [estimatedWait, setEstimatedWait] = useState<number | null>(null);
  const [isYourTurn, setIsYourTurn] = useState(false);

  useSocket({
    saleId,
    events: {
      'queue:position': (data: any) => {
        if (data.position !== undefined) {
          setPosition(data.position);
          setEstimatedWait(data.estimatedWaitMs || null);
        }
      },
      'queue:yourTurn': () => {
        setIsYourTurn(true);
        setPosition(0);
      },
    },
  });

  return { position, estimatedWait, isYourTurn };
}

/**
 * Hook for subscribing to sale lifecycle events.
 */
export function useSaleEvents(saleId?: string) {
  const [saleState, setSaleState] = useState<{
    isActive: boolean;
    secondsRemaining?: number;
    message?: string;
  }>({ isActive: false });

  useSocket({
    saleId,
    events: {
      'sale:started': (data: any) => {
        if (!saleId || data.saleId === saleId) {
          setSaleState({ isActive: true, message: 'Sale is live!' });
        }
      },
      'sale:ended': (data: any) => {
        if (!saleId || data.saleId === saleId) {
          setSaleState({ isActive: false, message: 'Sale has ended' });
        }
      },
      'sale:countdown': (data: any) => {
        if (!saleId || data.saleId === saleId) {
          setSaleState((prev) => ({
            ...prev,
            secondsRemaining: data.secondsRemaining,
          }));
        }
      },
    },
  });

  return saleState;
}

export default useSocket;
