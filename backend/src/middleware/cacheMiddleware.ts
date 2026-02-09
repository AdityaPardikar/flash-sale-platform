/**
 * Cache Middleware
 * Day 6: Performance Optimization & Caching
 * Express middleware for automatic response caching
 */

import { Request, Response, NextFunction } from 'express';
import cacheService from '../services/cacheService';
import { CACHE_TTL } from '../utils/cacheKeys';
import { logger } from '../utils/logger';

interface CacheOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  condition?: (req: Request) => boolean;
  tags?: string[];
}

/**
 * Generate default cache key from request
 */
function defaultKeyGenerator(req: Request): string {
  const userId = (req as any).user?.id || 'anonymous';
  const query = Object.keys(req.query).length > 0 
    ? `:${Buffer.from(JSON.stringify(req.query)).toString('base64').slice(0, 32)}`
    : '';
  return `http:${req.method}:${req.path}:${userId}${query}`;
}

/**
 * Express middleware for caching GET responses
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl = CACHE_TTL.DEFAULT,
    keyGenerator = defaultKeyGenerator,
    condition = () => true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Check condition
    if (!condition(req)) {
      return next();
    }

    const cacheKey = keyGenerator(req);

    try {
      // Try to get from cache
      const cached = await cacheService.get<{
        body: any;
        contentType: string;
        statusCode: number;
      }>(cacheKey);

      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('Content-Type', cached.contentType || 'application/json');
        return res.status(cached.statusCode || 200).json(cached.body);
      }
    } catch (error) {
      logger.debug('Cache read error, proceeding without cache', {
        key: cacheKey,
        error: (error as Error).message,
      });
    }

    // Cache miss - intercept the response
    const originalJson = res.json.bind(res);
    
    res.json = (body: any) => {
      // Cache the response
      const cacheData = {
        body,
        contentType: res.get('Content-Type') || 'application/json',
        statusCode: res.statusCode,
      };

      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        cacheService.set(cacheKey, cacheData, ttl).catch((err) => {
          logger.debug('Cache write error', { key: cacheKey, error: err.message });
        });
      }

      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Cache specific route patterns
 */
export const cacheConfigs = {
  // Product list - cache for 1 hour
  products: cacheMiddleware({
    ttl: CACHE_TTL.PRODUCT,
    keyGenerator: (req) => `products:list:${JSON.stringify(req.query)}`,
  }),

  // Single product - cache for 1 hour
  product: cacheMiddleware({
    ttl: CACHE_TTL.PRODUCT,
    keyGenerator: (req) => `products:${req.params.id}`,
  }),

  // Flash sale list - cache for 5 minutes
  flashSales: cacheMiddleware({
    ttl: CACHE_TTL.FLASH_SALE,
    keyGenerator: (req) => `flash_sales:list:${JSON.stringify(req.query)}`,
  }),

  // Active flash sales - cache for 1 minute
  activeFlashSales: cacheMiddleware({
    ttl: CACHE_TTL.SHORT,
    keyGenerator: () => 'flash_sales:active',
  }),

  // Analytics - cache for 1 hour
  analytics: cacheMiddleware({
    ttl: CACHE_TTL.ANALYTICS,
    keyGenerator: (req) => `analytics:${req.path}:${JSON.stringify(req.query)}`,
  }),
};

/**
 * Middleware to invalidate cache on write operations
 */
export function cacheInvalidator(pattern: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Invalidate after the response is sent
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const deletedCount = await cacheService.delPattern(pattern);
          logger.debug('Cache invalidated', { pattern, deletedCount });
        } catch (error) {
          logger.debug('Cache invalidation error', {
            pattern,
            error: (error as Error).message,
          });
        }
      }
    });

    next();
  };
}

/**
 * Middleware to add cache control headers
 */
export function cacheControl(maxAge: number = 0, options: {
  private?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  mustRevalidate?: boolean;
} = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const directives: string[] = [];

    if (options.noStore) {
      directives.push('no-store');
    } else if (options.noCache) {
      directives.push('no-cache');
    } else {
      directives.push(options.private ? 'private' : 'public');
      directives.push(`max-age=${maxAge}`);
      
      if (options.mustRevalidate) {
        directives.push('must-revalidate');
      }
    }

    res.setHeader('Cache-Control', directives.join(', '));
    next();
  };
}

/**
 * No cache middleware for sensitive routes
 */
export const noCache = cacheControl(0, { noStore: true, noCache: true });

/**
 * Short cache for semi-dynamic content
 */
export const shortCache = cacheControl(60, { private: true }); // 1 minute

/**
 * Long cache for static content
 */
export const longCache = cacheControl(3600, { mustRevalidate: true }); // 1 hour

export default {
  cacheMiddleware,
  cacheConfigs,
  cacheInvalidator,
  cacheControl,
  noCache,
  shortCache,
  longCache,
};
