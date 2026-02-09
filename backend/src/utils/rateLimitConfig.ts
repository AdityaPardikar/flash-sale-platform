/**
 * Rate Limit Configuration
 * Day 6: Performance Optimization & Caching
 * Configuration for endpoint-specific rate limits
 */

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  message?: string;    // Custom error message
  skipAdmin?: boolean; // Skip rate limiting for admins
  keyGenerator?: 'ip' | 'user' | 'combined';
}

/**
 * Rate limit configurations for different endpoint groups
 */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // General API - 100 requests per minute
  general: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    message: 'Too many requests, please try again later.',
    skipAdmin: true,
    keyGenerator: 'combined',
  },

  // Auth endpoints - 5 requests per minute (prevent brute force)
  auth: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: 'Too many authentication attempts, please try again later.',
    skipAdmin: false,
    keyGenerator: 'ip',
  },

  // Registration - 3 requests per hour per IP
  register: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 3,
    message: 'Too many registration attempts, please try again later.',
    skipAdmin: false,
    keyGenerator: 'ip',
  },

  // Queue join - 10 requests per minute
  queueJoin: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many queue join attempts, please wait before trying again.',
    skipAdmin: true,
    keyGenerator: 'user',
  },

  // Order creation - 5 requests per minute
  order: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    message: 'Too many order attempts, please wait before trying again.',
    skipAdmin: true,
    keyGenerator: 'user',
  },

  // Admin endpoints - 200 requests per minute
  admin: {
    windowMs: 60 * 1000,
    maxRequests: 200,
    message: 'Admin rate limit exceeded.',
    skipAdmin: false, // Never skip for admin endpoints
    keyGenerator: 'user',
  },

  // Health checks - 60 requests per minute (monitoring tools)
  health: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    message: 'Health check rate limit exceeded.',
    skipAdmin: true,
    keyGenerator: 'ip',
  },

  // WebSocket connection - 10 per minute
  websocket: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    message: 'Too many connection attempts.',
    skipAdmin: true,
    keyGenerator: 'combined',
  },

  // Data export - 2 per hour (expensive operation)
  export: {
    windowMs: 60 * 60 * 1000,
    maxRequests: 2,
    message: 'Data export rate limit exceeded. Please try again later.',
    skipAdmin: false,
    keyGenerator: 'user',
  },

  // Search - 30 requests per minute
  search: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    message: 'Too many search requests.',
    skipAdmin: true,
    keyGenerator: 'combined',
  },
};

/**
 * Get rate limit config by name
 */
export function getRateLimitConfig(name: string): RateLimitConfig {
  return RATE_LIMITS[name] || RATE_LIMITS.general;
}

/**
 * Check if a path should use a specific rate limit
 */
export function getRateLimitForPath(path: string): RateLimitConfig {
  // Auth endpoints
  if (path.includes('/auth/login') || path.includes('/auth/refresh')) {
    return RATE_LIMITS.auth;
  }
  if (path.includes('/auth/register')) {
    return RATE_LIMITS.register;
  }

  // Queue endpoints
  if (path.includes('/queue/join') || path.includes('/queue/enter')) {
    return RATE_LIMITS.queueJoin;
  }

  // Order endpoints
  if (path.includes('/orders') && !path.includes('/admin/')) {
    return RATE_LIMITS.order;
  }

  // Admin endpoints
  if (path.includes('/admin/')) {
    return RATE_LIMITS.admin;
  }

  // Health endpoints
  if (path.includes('/health')) {
    return RATE_LIMITS.health;
  }

  // Export endpoints
  if (path.includes('/export')) {
    return RATE_LIMITS.export;
  }

  // Search endpoints
  if (path.includes('/search')) {
    return RATE_LIMITS.search;
  }

  // Default to general rate limit
  return RATE_LIMITS.general;
}

export default RATE_LIMITS;
