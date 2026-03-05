/**
 * API Gateway Middleware
 * Week 5 Day 4: API Enhancement
 *
 * Features:
 * - Intelligent rate limiting
 * - Request throttling
 * - API key validation
 * - Request logging
 * - Circuit breaker pattern
 */

import { Request, Response, NextFunction, Router } from 'express';
import { redisClient } from '../utils/redis';

const router = Router();

// ============================================================================
// Types
// ============================================================================

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface RateLimitInfo {
  remaining: number;
  total: number;
  resetAt: Date;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

// ============================================================================
// Rate Limiting
// ============================================================================

const RATE_LIMIT_PREFIX = 'ratelimit';

/**
 * Create rate limiter middleware
 */
export function createRateLimiter(config: RateLimitConfig) {
  const { windowMs, maxRequests, keyGenerator } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = keyGenerator ? keyGenerator(req) : getDefaultKey(req);

    const redisKey = `${RATE_LIMIT_PREFIX}:${key}`;

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old entries
      await redisClient.zremrangebyscore(redisKey, '-inf', windowStart.toString());

      // Count requests in window
      const requestCount = await redisClient.zcard(redisKey);

      if (requestCount >= maxRequests) {
        // Get oldest entry to calculate reset time
        const oldestEntries = await redisClient.zrange(redisKey, 0, 0, 'WITHSCORES');
        const resetAt =
          oldestEntries.length > 1
            ? new Date(parseFloat(oldestEntries[1]) + windowMs)
            : new Date(now + windowMs);

        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetAt.getTime() / 1000).toString(),
          'Retry-After': Math.ceil((resetAt.getTime() - now) / 1000).toString(),
        });

        return res.status(429).json({
          success: false,
          error: 'Too many requests',
          retryAfter: Math.ceil((resetAt.getTime() - now) / 1000),
        });
      }

      // Add current request
      await redisClient.zadd(redisKey, now, `${now}:${Math.random()}`);
      await redisClient.expire(redisKey, Math.ceil(windowMs / 1000));

      // Set headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - requestCount - 1).toString(),
        'X-RateLimit-Reset': Math.ceil((now + windowMs) / 1000).toString(),
      });

      next();
    } catch (error) {
      // On Redis error, allow request but log
      console.error('Rate limiter error:', error);
      next();
    }
  };
}

function getDefaultKey(req: Request): string {
  // Use user ID if authenticated, otherwise IP
  const user = req.user;
  if (user?.id) {
    return `user:${user.id}`;
  }
  return `ip:${req.ip || req.connection.remoteAddress}`;
}

// ============================================================================
// Tiered Rate Limiting
// ============================================================================

interface TieredRateLimitConfig {
  tiers: {
    [key: string]: {
      windowMs: number;
      maxRequests: number;
    };
  };
  defaultTier: string;
  tierResolver: (req: Request) => Promise<string>;
}

/**
 * Create tiered rate limiter (different limits for VIP, etc.)
 */
export function createTieredRateLimiter(config: TieredRateLimitConfig) {
  const { tiers, defaultTier, tierResolver } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tier = await tierResolver(req);
      const tierConfig = tiers[tier] || tiers[defaultTier];

      // Add tier info to headers
      res.set('X-RateLimit-Tier', tier);

      // Create and apply rate limiter for this tier
      const limiter = createRateLimiter({
        windowMs: tierConfig.windowMs,
        maxRequests: tierConfig.maxRequests,
        keyGenerator: (req) => `${getDefaultKey(req)}:${tier}`,
      });

      return limiter(req, res, next);
    } catch (error) {
      console.error('Tiered rate limiter error:', error);
      next();
    }
  };
}

// Pre-configured VIP rate limiter
export const vipRateLimiter = createTieredRateLimiter({
  tiers: {
    STANDARD: { windowMs: 60000, maxRequests: 100 },
    BRONZE: { windowMs: 60000, maxRequests: 150 },
    SILVER: { windowMs: 60000, maxRequests: 200 },
    GOLD: { windowMs: 60000, maxRequests: 300 },
    PLATINUM: { windowMs: 60000, maxRequests: 500 },
  },
  defaultTier: 'STANDARD',
  tierResolver: async (req: Request) => {
    const user = req.user;
    if (!user?.id) return 'STANDARD';

    const vipData = await redisClient.get(`vip:membership:${user.id}`);
    if (vipData) {
      const membership = JSON.parse(vipData);
      return membership.tier || 'STANDARD';
    }
    return 'STANDARD';
  },
});

// ============================================================================
// Circuit Breaker
// ============================================================================

const circuitBreakers = new Map<
  string,
  {
    state: CircuitState;
    failures: number;
    lastFailure: number;
    halfOpenRequests: number;
  }
>();

/**
 * Create circuit breaker middleware
 */
export function createCircuitBreaker(name: string, config: CircuitBreakerConfig) {
  const { failureThreshold, resetTimeout, halfOpenRequests } = config;

  // Initialize circuit
  if (!circuitBreakers.has(name)) {
    circuitBreakers.set(name, {
      state: CircuitState.CLOSED,
      failures: 0,
      lastFailure: 0,
      halfOpenRequests: 0,
    });
  }

  return async (req: Request, res: Response, next: NextFunction) => {
    const circuit = circuitBreakers.get(name);
    if (!circuit) {
      return next();
    }
    const now = Date.now();

    // Check circuit state
    if (circuit.state === CircuitState.OPEN) {
      // Check if we should try half-open
      if (now - circuit.lastFailure >= resetTimeout) {
        circuit.state = CircuitState.HALF_OPEN;
        circuit.halfOpenRequests = 0;
      } else {
        return res.status(503).json({
          success: false,
          error: 'Service temporarily unavailable',
          retryAfter: Math.ceil((resetTimeout - (now - circuit.lastFailure)) / 1000),
        });
      }
    }

    // In half-open, limit requests
    if (circuit.state === CircuitState.HALF_OPEN) {
      if (circuit.halfOpenRequests >= halfOpenRequests) {
        return res.status(503).json({
          success: false,
          error: 'Service recovering, please retry later',
        });
      }
      circuit.halfOpenRequests++;
    }

    // Wrap response to track success/failure
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      if (res.statusCode >= 500) {
        recordFailure(circuit, failureThreshold, now);
      } else if (circuit.state === CircuitState.HALF_OPEN) {
        // Success in half-open, close circuit
        circuit.state = CircuitState.CLOSED;
        circuit.failures = 0;
      }
      return originalJson(body);
    };

    next();
  };
}

function recordFailure(
  circuit: { state: CircuitState; failures: number; lastFailure: number },
  threshold: number,
  now: number,
) {
  circuit.failures++;
  circuit.lastFailure = now;

  if (circuit.failures >= threshold) {
    circuit.state = CircuitState.OPEN;
  }
}

// ============================================================================
// API Key Validation
// ============================================================================

const API_KEY_PREFIX = 'apikey';

interface ApiKeyConfig {
  required?: boolean;
  headerName?: string;
}

/**
 * Validate API key middleware
 */
export function apiKeyValidator(config: ApiKeyConfig = {}) {
  const { required = false, headerName = 'X-API-Key' } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers[headerName.toLowerCase()] as string;

    if (!apiKey) {
      if (required) {
        return res.status(401).json({
          success: false,
          error: 'API key required',
        });
      }
      return next();
    }

    try {
      // Validate API key from Redis
      const keyData = await redisClient.get(`${API_KEY_PREFIX}:${apiKey}`);

      if (!keyData) {
        return res.status(401).json({
          success: false,
          error: 'Invalid API key',
        });
      }

      const keyInfo = JSON.parse(keyData);

      // Check if key is active
      if (!keyInfo.active) {
        return res.status(401).json({
          success: false,
          error: 'API key is inactive',
        });
      }

      // Check expiry
      if (keyInfo.expiresAt && new Date(keyInfo.expiresAt) < new Date()) {
        return res.status(401).json({
          success: false,
          error: 'API key has expired',
        });
      }

      // Attach key info to request
      (req as unknown as Record<string, unknown>).apiKey = keyInfo;

      // Track usage
      await redisClient.incr(
        `${API_KEY_PREFIX}:usage:${apiKey}:${new Date().toISOString().split('T')[0]}`,
      );

      next();
    } catch (error) {
      console.error('API key validation error:', error);
      next();
    }
  };
}

// ============================================================================
// Request Logging
// ============================================================================

interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  userId?: string;
  ip: string;
}

/**
 * Request logger middleware
 */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();

    // Log on response finish
    res.on('finish', async () => {
      const log: RequestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: Date.now() - start,
        userId: req.user?.id,
        ip: req.ip || req.connection.remoteAddress || 'unknown',
      };

      // Store in Redis for analytics
      try {
        const logKey = `logs:api:${new Date().toISOString().split('T')[0]}`;
        await redisClient.lpush(logKey, JSON.stringify(log));
        await redisClient.expire(logKey, 86400 * 7); // Keep 7 days
      } catch (error) {
        // Don't fail request on logging error
        console.error('Request logging error:', error);
      }
    });

    next();
  };
}

// ============================================================================
// Throttling
// ============================================================================

interface ThrottleConfig {
  maxConcurrent: number;
  queueTimeout: number;
}

const requestQueues = new Map<string, number>();

/**
 * Throttle concurrent requests
 */
export function throttle(path: string, config: ThrottleConfig) {
  const { maxConcurrent, queueTimeout } = config;

  return async (req: Request, res: Response, next: NextFunction) => {
    const key = `throttle:${path}`;

    try {
      const current = requestQueues.get(key) || 0;

      if (current >= maxConcurrent) {
        // Queue is full
        return res.status(503).json({
          success: false,
          error: 'Service at capacity, please retry',
          retryAfter: Math.ceil(queueTimeout / 1000),
        });
      }

      // Increment counter
      requestQueues.set(key, current + 1);

      // Decrement on response finish
      res.on('finish', () => {
        const count = requestQueues.get(key) || 1;
        requestQueues.set(key, count - 1);
      });

      next();
    } catch (error) {
      console.error('Throttle error:', error);
      next();
    }
  };
}

// ============================================================================
// Gateway Router Setup
// ============================================================================

// Apply global middleware
router.use(requestLogger());

// Standard rate limiter for all routes
const standardRateLimiter = createRateLimiter({
  windowMs: 60000, // 1 minute
  maxRequests: 100, // 100 requests per minute
});

// Circuit breaker for critical endpoints
const criticalCircuitBreaker = createCircuitBreaker('critical', {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  halfOpenRequests: 3,
});

// Export configured middleware
export const gatewayMiddleware = {
  standard: [standardRateLimiter],
  vip: [vipRateLimiter],
  critical: [standardRateLimiter, criticalCircuitBreaker],
  highTraffic: [
    createRateLimiter({ windowMs: 60000, maxRequests: 200 }),
    throttle('high-traffic', { maxConcurrent: 100, queueTimeout: 5000 }),
  ],
};

export default router;
