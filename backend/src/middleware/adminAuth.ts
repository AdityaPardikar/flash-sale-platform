import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

export interface AdminUser {
  id: string;
  email: string;
  role: 'admin' | 'super_admin';
  permissions: string[];
}

export interface AuthenticatedRequest extends Request {
  adminUser?: AdminUser;
}

/**
 * Admin Authentication Middleware
 * Validates JWT tokens and verifies admin role
 */
export const requireAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as AdminUser & { role: string };

    // Check if user has admin role
    if (!decoded.role || !['admin', 'super_admin'].includes(decoded.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions. Admin access required.',
      });
      return;
    }

    // Attach admin user to request
    req.adminUser = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role as 'admin' | 'super_admin',
      permissions: decoded.permissions || [],
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired. Please log in again.',
      });
      return;
    }

    if (error instanceof jwt.JsonWebTokenError) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authentication token',
      });
      return;
    }

    console.error('Admin auth middleware error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication verification failed',
    });
  }
};

/**
 * Super Admin Middleware
 * Requires super_admin role for sensitive operations
 */
export const requireSuperAdmin = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // First validate admin authentication
    await requireAdmin(req, res, () => {});

    // Check for super_admin role
    if (req.adminUser?.role !== 'super_admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Super admin access required for this operation',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Super admin auth error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authorization verification failed',
    });
  }
};

/**
 * Permission-based Middleware Factory
 * Checks if admin has specific permission
 */
export const requirePermission = (permission: string) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      // First validate admin authentication
      await requireAdmin(req, res, () => {});

      // Super admins have all permissions
      if (req.adminUser?.role === 'super_admin') {
        next();
        return;
      }

      // Check if admin has required permission
      if (!req.adminUser?.permissions.includes(permission)) {
        res.status(403).json({
          error: 'Forbidden',
          message: `Missing required permission: ${permission}`,
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Permission verification failed',
      });
    }
  };
};

/**
 * Available Admin Permissions
 */
export enum AdminPermission {
  // Flash Sale Management
  CREATE_SALE = 'create_sale',
  EDIT_SALE = 'edit_sale',
  DELETE_SALE = 'delete_sale',
  ACTIVATE_SALE = 'activate_sale',

  // User Management
  VIEW_USERS = 'view_users',
  EDIT_USERS = 'edit_users',
  BAN_USERS = 'ban_users',

  // Queue Management
  MANAGE_QUEUE = 'manage_queue',
  ADMIT_USERS = 'admit_users',

  // Order Management
  VIEW_ORDERS = 'view_orders',
  CANCEL_ORDERS = 'cancel_orders',
  PROCESS_REFUNDS = 'process_refunds',

  // Analytics
  VIEW_ANALYTICS = 'view_analytics',
  EXPORT_DATA = 'export_data',

  // System Configuration
  MANAGE_SETTINGS = 'manage_settings',
  VIEW_LOGS = 'view_logs',
  MANAGE_ADMINS = 'manage_admins',
}

/**
 * Rate Limiting for Admin Endpoints
 * Separate from user rate limits for better security
 */
export const adminRateLimitBypass = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  // Admin users bypass standard rate limits
  // but have their own stricter monitoring
  if (req.adminUser) {
    // Log admin activity for audit trail
    console.log(`Admin activity: ${req.adminUser.email} - ${req.method} ${req.path}`);
  }
  next();
};
