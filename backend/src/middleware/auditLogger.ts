/**
 * Audit Logger Middleware
 * Day 7: Security Hardening & Audit System
 * Automatic audit logging for sensitive operations
 */

import { Request, Response, NextFunction } from 'express';
import auditLogService from '../services/auditLogService';
import { AuditAction } from '../models/auditLog';
import { removeSensitiveFields } from '../utils/sanitizer';
import { logger } from '../utils/logger';

/**
 * Audit configuration for routes
 */
interface AuditConfig {
  action: AuditAction;
  entityType: string;
  getEntityId?: (req: Request) => string | null;
  includeBody?: boolean;
  includeSensitive?: boolean;
}

/**
 * Route to audit action mapping
 */
const auditRoutes = new Map<string, AuditConfig>();

// Auth routes
auditRoutes.set('POST:/api/auth/login', { 
  action: AuditAction.USER_LOGIN, 
  entityType: 'user',
  getEntityId: () => null,
  includeBody: false,
});
auditRoutes.set('POST:/api/auth/logout', { 
  action: AuditAction.USER_LOGOUT, 
  entityType: 'user',
});
auditRoutes.set('POST:/api/auth/register', { 
  action: AuditAction.USER_CREATED, 
  entityType: 'user',
  includeBody: false,
});

// User routes
auditRoutes.set('PUT:/api/users/:id', {
  action: AuditAction.USER_UPDATED,
  entityType: 'user',
  getEntityId: (req) => req.params.id,
  includeBody: true,
});
auditRoutes.set('DELETE:/api/users/:id', {
  action: AuditAction.USER_DELETED,
  entityType: 'user',
  getEntityId: (req) => req.params.id,
});

// Product routes
auditRoutes.set('POST:/api/products', {
  action: AuditAction.PRODUCT_CREATED,
  entityType: 'product',
  includeBody: true,
});
auditRoutes.set('PUT:/api/products/:id', {
  action: AuditAction.PRODUCT_UPDATED,
  entityType: 'product',
  getEntityId: (req) => req.params.id,
  includeBody: true,
});
auditRoutes.set('DELETE:/api/products/:id', {
  action: AuditAction.PRODUCT_DELETED,
  entityType: 'product',
  getEntityId: (req) => req.params.id,
});

// Flash sale routes
auditRoutes.set('POST:/api/flash-sales', {
  action: AuditAction.SALE_CREATED,
  entityType: 'flash_sale',
  includeBody: true,
});
auditRoutes.set('PUT:/api/flash-sales/:id', {
  action: AuditAction.SALE_UPDATED,
  entityType: 'flash_sale',
  getEntityId: (req) => req.params.id,
  includeBody: true,
});
auditRoutes.set('DELETE:/api/flash-sales/:id', {
  action: AuditAction.SALE_DELETED,
  entityType: 'flash_sale',
  getEntityId: (req) => req.params.id,
});
auditRoutes.set('POST:/api/flash-sales/:id/start', {
  action: AuditAction.SALE_STARTED,
  entityType: 'flash_sale',
  getEntityId: (req) => req.params.id,
});
auditRoutes.set('POST:/api/flash-sales/:id/end', {
  action: AuditAction.SALE_ENDED,
  entityType: 'flash_sale',
  getEntityId: (req) => req.params.id,
});

// Queue routes
auditRoutes.set('POST:/api/queue/join', {
  action: AuditAction.QUEUE_JOINED,
  entityType: 'queue',
  includeBody: true,
});
auditRoutes.set('POST:/api/queue/leave', {
  action: AuditAction.QUEUE_LEFT,
  entityType: 'queue',
});

// Order routes
auditRoutes.set('POST:/api/orders', {
  action: AuditAction.ORDER_CREATED,
  entityType: 'order',
  includeBody: true,
});
auditRoutes.set('POST:/api/orders/:id/complete', {
  action: AuditAction.ORDER_COMPLETED,
  entityType: 'order',
  getEntityId: (req) => req.params.id,
});
auditRoutes.set('POST:/api/orders/:id/cancel', {
  action: AuditAction.ORDER_CANCELLED,
  entityType: 'order',
  getEntityId: (req) => req.params.id,
});

// Admin routes
auditRoutes.set('POST:/api/admin/settings', {
  action: AuditAction.SETTINGS_CHANGED,
  entityType: 'settings',
  includeBody: true,
});

/**
 * Match route pattern with actual path
 */
function matchRoute(method: string, path: string): AuditConfig | null {
  // Try exact match first
  const exactKey = `${method}:${path}`;
  if (auditRoutes.has(exactKey)) {
    return auditRoutes.get(exactKey)!;
  }

  // Try pattern matching for parameterized routes
  for (const [pattern, config] of auditRoutes.entries()) {
    const [patternMethod, patternPath] = pattern.split(':');
    
    if (patternMethod !== method) continue;
    
    // Convert route pattern to regex
    const regexPattern = patternPath
      .replace(/:[^/]+/g, '[^/]+')
      .replace(/\//g, '\\/');
    
    const regex = new RegExp(`^${regexPattern}$`);
    
    if (regex.test(path)) {
      return config;
    }
  }

  return null;
}

/**
 * Main audit logger middleware
 * Automatically logs auditable actions
 */
export function auditLogger() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const config = matchRoute(req.method, req.path);
    
    if (!config) {
      return next();
    }

    // Store original end function
    const originalEnd = res.end;
    const originalJson = res.json;
    
    let responseBody: any;

    // Override json to capture response
    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    // Override end to log after response
    res.end = function(chunk?: any, encoding?: any, callback?: any) {
      // Call original end first
      const result = originalEnd.call(this, chunk, encoding, callback);

      // Log asynchronously after response
      setImmediate(async () => {
        try {
          const user = (req as any).user;
          const userId = user?.id;
          
          if (!userId && config.action !== AuditAction.USER_LOGIN) {
            // Skip logging for unauthenticated requests (except login)
            return;
          }

          // Only log successful or meaningful responses
          const statusCode = res.statusCode;
          if (statusCode >= 400) {
            // Log failed attempts for security-sensitive actions
            if ([AuditAction.USER_LOGIN, AuditAction.SETTINGS_CHANGED].includes(config.action)) {
              await auditLogService.logAction({
                userId: userId || 'anonymous',
                action: `${config.action}_FAILED`,
                entityType: config.entityType,
                entityId: config.getEntityId?.(req) || null,
                ipAddress: req.ip || req.socket.remoteAddress || null,
                userAgent: req.headers['user-agent'] || null,
                changes: {
                  statusCode,
                  error: responseBody?.error || responseBody?.message,
                },
              });
            }
            return;
          }

          // Prepare changes object
          let changes: Record<string, any> = {};
          
          if (config.includeBody && req.body) {
            changes = config.includeSensitive 
              ? { ...req.body }
              : removeSensitiveFields(req.body);
          }

          // Add response data if available
          if (responseBody?.id) {
            changes.resultId = responseBody.id;
          }

          // Log the action
          await auditLogService.logAction({
            userId: userId || responseBody?.user?.id || 'system',
            action: config.action,
            entityType: config.entityType,
            entityId: config.getEntityId?.(req) || responseBody?.id || null,
            ipAddress: req.ip || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
            changes: Object.keys(changes).length > 0 ? changes : null,
          });
        } catch (error) {
          logger.error('Audit logging failed', {
            path: req.path,
            method: req.method,
            error: (error as Error).message,
          });
        }
      });

      return result;
    };

    next();
  };
}

/**
 * Manual audit log helper for custom logging
 */
export async function logAuditEvent(
  req: Request,
  action: AuditAction | string,
  entityType: string,
  entityId: string | null,
  changes?: Record<string, any>
) {
  const user = (req as any).user;
  
  await auditLogService.logAction({
    userId: user?.id || 'anonymous',
    action,
    entityType,
    entityId,
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.headers['user-agent'] || null,
    changes: changes || null,
  });
}

/**
 * Decorator-style audit wrapper for controller functions
 */
export function withAudit(
  action: AuditAction | string,
  entityType: string,
  getEntityId?: (req: Request, result: any) => string | null
) {
  return function(
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function(req: Request, res: Response, next: NextFunction) {
      try {
        // Store original json
        const originalJson = res.json.bind(res);
        let responseData: any;

        res.json = function(data: any) {
          responseData = data;
          return originalJson(data);
        };

        await originalMethod.call(this, req, res, next);

        // Log after successful response
        if (res.statusCode < 400) {
          const user = (req as any).user;
          const entityId = getEntityId?.(req, responseData) || responseData?.id || null;

          await auditLogService.logAction({
            userId: user?.id || 'system',
            action,
            entityType,
            entityId,
            ipAddress: req.ip || null,
            userAgent: req.headers['user-agent'] || null,
            changes: null,
          });
        }
      } catch (error) {
        next(error);
      }
    };

    return descriptor;
  };
}

export default auditLogger;
