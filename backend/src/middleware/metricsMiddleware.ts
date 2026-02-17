/**
 * Metrics Middleware
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Express middleware that instruments every HTTP request with:
 * - Request duration histograms
 * - Request/error counters by route, method, status
 * - Active connection tracking
 * - Middleware execution timing
 */

import { Request, Response, NextFunction } from 'express';
import { metricsService } from '../services/metricsService';

/**
 * Core metrics middleware – wraps each request to record
 * duration, status, and active connections.
 */
export const metricsMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Track active connections
  metricsService.trackActiveConnection(1);

  const startHr = process.hrtime.bigint();

  // Intercept response finish to record metrics
  res.on('finish', () => {
    const endHr = process.hrtime.bigint();
    const durationSec = Number(endHr - startHr) / 1e9;

    // Determine the matched route pattern (Express sets req.route after matching)
    const route = getRoutePattern(req);

    metricsService.recordHttpRequest(req.method, route, res.statusCode, durationSec);
    metricsService.trackActiveConnection(-1);
  });

  // If connection closes prematurely, still decrement
  res.on('close', () => {
    if (!res.writableFinished) {
      metricsService.trackActiveConnection(-1);
    }
  });

  next();
};

/**
 * Middleware timing wrapper – wraps a named middleware function so its
 * execution time is automatically recorded to the metrics service.
 *
 * Usage:
 *   app.use(timedMiddleware('auth', authMiddleware));
 */
export function timedMiddleware(
  name: string,
  fn: (req: Request, res: Response, next: NextFunction) => void
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const wrappedNext: NextFunction = (err?: any) => {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      metricsService.recordMiddleware(name, durationSec);
      if (err) return next(err);
      next();
    };

    try {
      fn(req, res, wrappedNext);
    } catch (error) {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      metricsService.recordMiddleware(name, durationSec);
      next(error);
    }
  };
}

/**
 * Extracts a normalised route pattern from the Express request.
 * Falls back to the raw path (with IDs replaced) when no route is matched.
 */
function getRoutePattern(req: Request): string {
  // Express attaches req.route when a route handler matches
  if (req.route?.path) {
    const basePath = req.baseUrl || '';
    const routePath = typeof req.route.path === 'string' ? req.route.path : '';
    return `${basePath}${routePath}`;
  }

  // Fallback: normalise the URL (strip query, replace IDs)
  const path = req.originalUrl?.split('?')[0] || req.path || '/';
  return path
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
}

export default metricsMiddleware;
