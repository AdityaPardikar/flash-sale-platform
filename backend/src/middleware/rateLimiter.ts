/**
 * Rate Limiter Middleware
 * Day 6: Performance Optimization & Caching
 * Redis-based rate limiting with per-user and per-endpoint limits
 */

import { Request, Response, NextFunction } from 'express';
import redis from '../utils/redis';
import { getRateLimitForPath, RateLimitConfig, RATE_LIMITS } from '../utils/rateLimitConfig';
import { logger } from '../utils/logger';

/**
 * Rate limit info stored in Redis
 */
interface RateLimitInfo {
  count: number;
  resetTime: number;
}

/**
 * Generate rate limit key based on request and config
 */
function generateKey(req: Request, config: RateLimitConfig): string {
  const prefix = 'rate_limit';
  const path = req.path.replace(/[^a-zA-Z0-9]/g, '_');
  
  switch (config.keyGenerator) {
    case 'ip':
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      return `${prefix}:ip:${ip}:${path}`;
    
    case 'user':
      const userId = (req as any).user?.id;
      if (!userId) {
        const fallbackIp = req.ip || req.socket.remoteAddress || 'unknown';
        return `${prefix}:ip:${fallbackIp}:${path}`;
      }
      return `${prefix}:user:${userId}:${path}`;
    
    case 'combined':
    default:
      const combUserId = (req as any).user?.id;
      const combIp = req.ip || req.socket.remoteAddress || 'unknown';
      if (combUserId) {
        return `${prefix}:combined:${combUserId}:${combIp}:${path}`;
      }
      return `${prefix}:combined:anon:${combIp}:${path}`;
  }
}

/**
 * Check if user is admin and should skip rate limiting
 */
function shouldSkipForAdmin(req: Request, config: RateLimitConfig): boolean {
  if (!config.skipAdmin) return false;
  
  const user = (req as any).user;
  return user?.role === 'admin' || user?.isAdmin === true;
}

/**
 * Main rate limiter middleware factory
 */
export function rateLimiter(configName?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get appropriate config
    const config = configName 
      ? RATE_LIMITS[configName] || RATE_LIMITS.general
      : getRateLimitForPath(req.path);

    // Check if admin should skip
    if (shouldSkipForAdmin(req, config)) {
      return next();
    }

    const key = generateKey(req, config);
    const now = Date.now();

    try {
      // Get current rate limit info from Redis
      const currentData = await redis.get(key);
      let info: RateLimitInfo;

      if (currentData) {
        info = JSON.parse(currentData);
        
        // Check if window has expired
        if (now > info.resetTime) {
          // Start new window
          info = {
            count: 1,
            resetTime: now + config.windowMs,
          };
        } else {
          // Increment count
          info.count++;
        }
      } else {
        // First request in this window
        info = {
          count: 1,
          resetTime: now + config.windowMs,
        };
      }

      // Calculate remaining requests and reset time
      const remaining = Math.max(0, config.maxRequests - info.count);
      const resetSeconds = Math.ceil((info.resetTime - now) / 1000);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime / 1000));
      res.setHeader('X-RateLimit-Reset-After', resetSeconds);

      // Check if limit exceeded
      if (info.count > config.maxRequests) {
        res.setHeader('Retry-After', resetSeconds);
        
        logger.warn('Rate limit exceeded', {
          key,
          ip: req.ip,
          userId: (req as any).user?.id,
          path: req.path,
          count: info.count,
          limit: config.maxRequests,
        });

        return res.status(429).json({
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded',
          retryAfter: resetSeconds,
        });
      }

      // Store updated info
      const ttlMs = Math.ceil((info.resetTime - now) / 1000);
      await redis.setex(key, ttlMs, JSON.stringify(info));

      next();
    } catch (error) {
      // On Redis error, allow the request but log the error
      logger.error('Rate limiter error', {
        key,
        error: (error as Error).message,
      });
      next();
    }
  };
}

/**
 * Create a specific rate limiter for a route
 */
export function createRateLimiter(options: Partial<RateLimitConfig>) {
  const config: RateLimitConfig = {
    windowMs: options.windowMs || 60 * 1000,
    maxRequests: options.maxRequests || 100,
    message: options.message,
    skipAdmin: options.skipAdmin ?? true,
    keyGenerator: options.keyGenerator || 'combined',
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipForAdmin(req, config)) {
      return next();
    }

    const key = generateKey(req, config);
    const now = Date.now();

    try {
      const currentData = await redis.get(key);
      let info: RateLimitInfo;

      if (currentData) {
        info = JSON.parse(currentData);
        if (now > info.resetTime) {
          info = { count: 1, resetTime: now + config.windowMs };
        } else {
          info.count++;
        }
      } else {
        info = { count: 1, resetTime: now + config.windowMs };
      }

      const remaining = Math.max(0, config.maxRequests - info.count);
      const resetSeconds = Math.ceil((info.resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(info.resetTime / 1000));

      if (info.count > config.maxRequests) {
        res.setHeader('Retry-After', resetSeconds);
        return res.status(429).json({
          error: 'Too Many Requests',
          message: config.message || 'Rate limit exceeded',
          retryAfter: resetSeconds,
        });
      }

      const ttlMs = Math.ceil((info.resetTime - now) / 1000);
      await redis.setex(key, ttlMs, JSON.stringify(info));

      next();
    } catch (error) {
      logger.error('Rate limiter error', { error: (error as Error).message });
      next();
    }
  };
}

/**
 * Pre-configured rate limiters for common use cases
 */
export const rateLimiters = {
  general: rateLimiter('general'),
  auth: rateLimiter('auth'),
  register: rateLimiter('register'),
  queueJoin: rateLimiter('queueJoin'),
  order: rateLimiter('order'),
  admin: rateLimiter('admin'),
  health: rateLimiter('health'),
  export: rateLimiter('export'),
  search: rateLimiter('search'),
};

/**
 * Global rate limiter that applies to all routes
 */
export const globalRateLimiter = rateLimiter();

/**
 * Strict rate limiter for sensitive operations
 */
export const strictRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  message: 'This action is rate limited. Please try again later.',
  skipAdmin: false,
});

export default {
  rateLimiter,
  createRateLimiter,
  rateLimiters,
  globalRateLimiter,
  strictRateLimiter,
};
