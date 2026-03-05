/**
 * WebSocket Context Provider
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * React context for managing WebSocket connections with:
 * - Automatic connection/disconnection lifecycle
 * - Authentication token forwarding
 * - Reconnection handling with exponential backoff
 * - Connection state management
 * - Multiple namespace support (default, queue, notifications)
 * - Event subscription hooks
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';

// ─── Types ──────────────────────────────────────────────────

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'error';

export interface WebSocketContextType {
  // Connection state
  socket: Socket | null;
  connectionState: ConnectionState;
  isConnected: boolean;
  latency: number;
  reconnectAttempts: number;

  // Actions
  connect: () => void;
  disconnect: () => void;
  joinSaleRoom: (saleId: string) => void;
  leaveSaleRoom: (saleId: string) => void;

  // Event helpers
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  off: (event: string, handler: (...args: unknown[]) => void) => void;
  emit: (event: string, data?: unknown) => void;
}

// ─── Context ────────────────────────────────────────────────

const WebSocketContext = createContext<WebSocketContextType | null>(null);

// ─── Config ─────────────────────────────────────────────────

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3000';
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const LATENCY_CHECK_INTERVAL = 15000;

// ─── Provider ───────────────────────────────────────────────

interface WebSocketProviderProps {
  children: ReactNode;
  autoConnect?: boolean;
}

export function WebSocketProvider({ children, autoConnect = true }: WebSocketProviderProps) {
  const socketRef = useRef<Socket | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [latency, setLatency] = useState(0);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get auth token from localStorage
  const getToken = useCallback((): string | null => {
    try {
      return localStorage.getItem('auth_token');
    } catch {
      return null;
    }
  }, []);

  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    // Cleanup any existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
    }

    setConnectionState('connecting');

    const token = getToken();

    const socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: false, // We handle reconnection ourselves
      timeout: 10000,
      auth: token ? { token } : undefined,
    });

    // ── Connection Events ──────────────────────────────

    socket.on('connect', () => {
      setConnectionState('connected');
      setReconnectAttempts(0);
      startLatencyCheck(socket);
    });

    socket.on('disconnect', (reason) => {
      setConnectionState('disconnected');
      stopLatencyCheck();

      // Auto-reconnect for certain disconnect reasons
      if (reason === 'io server disconnect') {
        // Server initiated disconnect - don't auto reconnect
        return;
      }
      scheduleReconnect();
    });

    socket.on('connect_error', (_error) => {
      setConnectionState('error');
      scheduleReconnect();
    });

    // Heartbeat ACK for latency measurement
    socket.on('heartbeat:ack', (data: { timestamp: number }) => {
      if (data?.timestamp) {
        setLatency(Date.now() - data.timestamp);
      }
    });

    // Server heartbeat
    socket.on('heartbeat', () => {
      socket.emit('heartbeat');
    });

    socketRef.current = socket;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getToken]);

  // Disconnect
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    stopLatencyCheck();

    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnectionState('disconnected');
    setReconnectAttempts(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconnection with exponential backoff
  const scheduleReconnect = useCallback(() => {
    setReconnectAttempts((prev) => {
      const next = prev + 1;
      if (next > MAX_RECONNECT_ATTEMPTS) {
        setConnectionState('error');
        return prev;
      }

      setConnectionState('reconnecting');

      const delay = Math.min(INITIAL_RECONNECT_DELAY * Math.pow(2, next - 1), MAX_RECONNECT_DELAY);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);

      return next;
    });
  }, [connect]);

  // Latency checking
  const startLatencyCheck = useCallback((socket: Socket) => {
    stopLatencyCheck();
    latencyIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { timestamp: Date.now() });
      }
    }, LATENCY_CHECK_INTERVAL);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopLatencyCheck = useCallback(() => {
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current);
      latencyIntervalRef.current = null;
    }
  }, []);

  // ── Room Management ──────────────────────────────────

  const joinSaleRoom = useCallback((saleId: string) => {
    socketRef.current?.emit('join:sale', saleId);
  }, []);

  const leaveSaleRoom = useCallback((saleId: string) => {
    socketRef.current?.emit('leave:sale', saleId);
  }, []);

  // ── Event Helpers ────────────────────────────────────

  const on = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.on(event, handler as (...args: unknown[]) => void);
  }, []);

  const off = useCallback((event: string, handler: (...args: unknown[]) => void) => {
    socketRef.current?.off(event, handler as (...args: unknown[]) => void);
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socketRef.current?.emit(event, data);
  }, []);

  // ── Lifecycle ────────────────────────────────────────

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  // ── Context Value ────────────────────────────────────

  const value: WebSocketContextType = {
    socket: socketRef.current,
    connectionState,
    isConnected: connectionState === 'connected',
    latency,
    reconnectAttempts,
    connect,
    disconnect,
    joinSaleRoom,
    leaveSaleRoom,
    on,
    off,
    emit,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────

export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export default WebSocketContext;
