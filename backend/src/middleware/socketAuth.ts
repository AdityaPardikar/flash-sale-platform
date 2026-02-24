/**
 * Socket Authentication Middleware
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * JWT-based authentication for Socket.IO connections.
 * Supports both mandatory and optional authentication
 * with role-based access for admin namespace.
 */

import { Socket } from 'socket.io';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { logger } from '../utils/logger';

const socketAuthLogger = logger.child('socket-auth');

// ─── Types ──────────────────────────────────────────────────

export interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  isAuthenticated: boolean;
}

// ─── Middleware ─────────────────────────────────────────────

/**
 * Mandatory authentication middleware for Socket.IO.
 * Rejects connections without a valid JWT token.
 */
export function socketAuthRequired(socket: Socket, next: (err?: Error) => void): void {
  const token = extractToken(socket);

  if (!token) {
    socketAuthLogger.warn('Socket connection rejected: no token', {
      socketId: socket.id,
      ip: socket.handshake.address,
    });
    return next(new Error('Authentication required'));
  }

  const payload = verifyToken(token);
  if (!payload) {
    socketAuthLogger.warn('Socket connection rejected: invalid token', {
      socketId: socket.id,
      ip: socket.handshake.address,
    });
    return next(new Error('Invalid or expired token'));
  }

  // Attach user data to socket
  (socket as any).userId = payload.userId;
  (socket as any).userEmail = payload.email;
  (socket as any).isAuthenticated = true;

  socketAuthLogger.debug('Socket authenticated', {
    socketId: socket.id,
    userId: payload.userId,
  });

  next();
}

/**
 * Optional authentication middleware for Socket.IO.
 * Allows both authenticated and guest connections.
 * Attaches user data if token is provided and valid.
 */
export function socketAuthOptional(socket: Socket, next: (err?: Error) => void): void {
  const token = extractToken(socket);

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      (socket as any).userId = payload.userId;
      (socket as any).userEmail = payload.email;
      (socket as any).isAuthenticated = true;

      socketAuthLogger.debug('Socket authenticated (optional)', {
        socketId: socket.id,
        userId: payload.userId,
      });
    } else {
      (socket as any).isAuthenticated = false;
      socketAuthLogger.debug('Socket token invalid, continuing as guest', {
        socketId: socket.id,
      });
    }
  } else {
    (socket as any).isAuthenticated = false;
  }

  next();
}

/**
 * Admin authentication middleware for Socket.IO.
 * Requires a valid token AND admin flag in handshake auth.
 */
export function socketAdminAuth(socket: Socket, next: (err?: Error) => void): void {
  const token = extractToken(socket);
  const isAdmin = socket.handshake.auth?.isAdmin === true;

  if (!token || !isAdmin) {
    socketAuthLogger.warn('Admin socket connection rejected', {
      socketId: socket.id,
      hasToken: !!token,
      isAdmin,
    });
    return next(new Error('Admin authentication required'));
  }

  const payload = verifyToken(token);
  if (!payload) {
    return next(new Error('Invalid or expired admin token'));
  }

  (socket as any).userId = payload.userId;
  (socket as any).userEmail = payload.email;
  (socket as any).isAuthenticated = true;

  socketAuthLogger.info('Admin socket authenticated', {
    socketId: socket.id,
    userId: payload.userId,
  });

  next();
}

// ─── Helpers ────────────────────────────────────────────────

/**
 * Extract JWT token from socket handshake.
 * Checks auth.token, auth.authorization, and query parameters.
 */
function extractToken(socket: Socket): string | null {
  // Check handshake auth object
  const authToken = socket.handshake.auth?.token;
  if (authToken) return authToken;

  // Check authorization header style
  const authHeader = socket.handshake.auth?.authorization;
  if (authHeader && typeof authHeader === 'string') {
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return authHeader;
  }

  // Check query parameters (fallback)
  const queryToken = socket.handshake.query?.token;
  if (queryToken && typeof queryToken === 'string') {
    return queryToken;
  }

  return null;
}
