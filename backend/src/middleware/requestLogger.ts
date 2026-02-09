/**
 * Request Logger Middleware
 * Day 5: Monitoring, Logging & Alerting
 * Logs all incoming HTTP requests with timing and details
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import { recordResponseTime } from '../services/healthCheckService';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      startTime?: number;
    }
  }
}

/**
 * Main request logging middleware
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate unique request ID
  req.requestId = req.headers['x-request-id'] as string || uuidv4();
  req.startTime = Date.now();
  
  // Set request context for logger
  const userId = (req as any).user?.id;
  logger.setRequestContext(req.requestId, userId);
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Log request start
  logger.debug(`Request start: ${req.method} ${req.originalUrl}`, {
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined
  });
  
  // Override res.json to capture response
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    logResponse(req, res, body);
    return originalJson(body);
  };
  
  // Handle response finish event
  res.on('finish', () => {
    const duration = Date.now() - (req.startTime || Date.now());
    recordResponseTime(duration);
    
    // Don't double-log if json was called
    if (!res.headersSent) {
      logResponse(req, res);
    }
    
    logger.clearRequestContext();
  });
  
  // Handle errors
  res.on('error', (error: Error) => {
    const duration = Date.now() - (req.startTime || Date.now());
    
    logger.error(`Request error: ${req.method} ${req.originalUrl}`, {
      duration,
      error: error.message,
      stack: error.stack
    });
    
    logger.clearRequestContext();
  });
  
  next();
};

/**
 * Log response details
 */
function logResponse(req: Request, res: Response, body?: any): void {
  const duration = Date.now() - (req.startTime || Date.now());
  const level = res.statusCode >= 500 ? 'error' : 
                res.statusCode >= 400 ? 'warn' : 'info';
  
  const logData = {
    method: req.method,
    url: req.originalUrl,
    statusCode: res.statusCode,
    duration,
    ip: req.ip || req.socket.remoteAddress,
    requestId: req.requestId,
    userId: (req as any).user?.id,
    contentLength: res.get('Content-Length')
  };
  
  // Log based on status code
  if (level === 'error') {
    logger.error(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
  } else if (level === 'warn') {
    logger.warn(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
  } else {
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`, logData);
  }
}

/**
 * Error logging middleware (should be used after routes)
 */
export const errorLogger = (err: Error, req: Request, res: Response, next: NextFunction) => {
  const duration = Date.now() - (req.startTime || Date.now());
  
  logger.error(`Unhandled error: ${err.message}`, {
    method: req.method,
    url: req.originalUrl,
    duration,
    requestId: req.requestId,
    ip: req.ip || req.socket.remoteAddress,
    error: err.message,
    stack: err.stack
  });
  
  next(err);
};

/**
 * Skip logging for certain paths (health checks, etc.)
 */
export const skipLoggingPaths = [
  '/api/health/live',
  '/api/health/ready',
  '/favicon.ico'
];

/**
 * Conditional request logger that skips certain paths
 */
export const conditionalRequestLogger = (req: Request, res: Response, next: NextFunction) => {
  if (skipLoggingPaths.some(path => req.path === path)) {
    return next();
  }
  return requestLogger(req, res, next);
};

export default requestLogger;
