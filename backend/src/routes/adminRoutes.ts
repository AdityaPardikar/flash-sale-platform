import express, { RequestHandler } from 'express';
import {
  adminLogin,
  adminLogout,
  refreshAccessToken,
  getCurrentAdmin,
  enableTwoFactor,
  verifyTwoFactor,
} from '../controllers/adminAuthController';
import {
  getDashboardOverview,
  getTodayStats,
  getLiveSaleMetrics,
} from '../services/adminMetricsService';
import AdminAnalyticsController from '../controllers/adminAnalyticsController';
import {
  requireAdmin,
  requireSuperAdmin,
  requirePermission,
  AdminPermission,
} from '../middleware/adminAuth';

const router = express.Router();

// Type helper for casting handlers
// @ts-ignore - Legitimate type adaptation for Express handlers
const handler = (fn: any): RequestHandler => fn as RequestHandler;

/**
 * Admin Authentication Routes (Public)
 */

// POST /api/admin/auth/login - Admin login
router.post('/auth/login', handler(adminLogin));

// POST /api/admin/auth/logout - Admin logout (requires auth)
router.post('/auth/logout', requireAdmin, handler(adminLogout));

// POST /api/admin/auth/refresh - Refresh access token
router.post('/auth/refresh', handler(refreshAccessToken));

// GET /api/admin/auth/me - Get current admin profile
router.get('/auth/me', requireAdmin, handler(getCurrentAdmin));

// POST /api/admin/auth/2fa/enable - Enable 2FA
router.post('/auth/2fa/enable', requireAdmin, handler(enableTwoFactor));

// POST /api/admin/auth/2fa/verify - Verify and complete 2FA setup
router.post('/auth/2fa/verify', requireAdmin, handler(verifyTwoFactor));

/**
 * Admin Dashboard Routes (Protected)
 */

// GET /api/admin/overview - Dashboard overview metrics
router.get('/overview', requireAdmin, handler(getDashboardOverview));

// GET /api/admin/stats/today - Today's performance stats
router.get('/stats/today', requireAdmin, handler(getTodayStats));

// GET /api/admin/stats/today - Today's performance stats
router.get('/stats/today', requireAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Today stats endpoint - to be implemented',
  });
});

/**
 * Flash Sale Management Routes (Protected)
 */

// GET /api/admin/sales - List all flash sales
router.get(
  '/sales',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Sales list endpoint - to be implemented',
    });
  }
);

// GET /api/admin/sales/metrics - Get all sales metrics
router.get(
  '/sales/metrics',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'All sales metrics endpoint - to be implemented',
    });
  }
);

// POST /api/admin/sales - Create flash sale
router.post('/sales', requireAdmin, requirePermission(AdminPermission.CREATE_SALE), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Create sale endpoint - to be implemented',
  });
});

// PUT /api/admin/sales/:id - Update flash sale
router.put('/sales/:id', requireAdmin, requirePermission(AdminPermission.EDIT_SALE), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Update sale endpoint - to be implemented',
  });
});

// PATCH /api/admin/sales/:saleId/status - Update sale status
router.patch(
  '/sales/:saleId/status',
  requireAdmin,
  requirePermission(AdminPermission.EDIT_SALE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Update sale status endpoint - to be implemented',
    });
  }
);

// DELETE /api/admin/sales/:id - Delete flash sale
router.delete(
  '/sales/:id',
  requireAdmin,
  requirePermission(AdminPermission.DELETE_SALE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Delete sale endpoint - to be implemented',
    });
  }
);

// GET /api/admin/sales/:id/metrics - Get sale performance metrics
router.get(
  '/sales/:saleId/metrics',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  getLiveSaleMetrics
);

/**
 * Queue Management Routes (Protected)
 */

// GET /api/admin/queues - List all active queues
router.get('/queues', requireAdmin, requirePermission(AdminPermission.MANAGE_QUEUE), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Queues list endpoint - to be implemented',
  });
});

// GET /api/admin/sales/:saleId/queue - Get queue details for a sale
router.get(
  '/sales/:saleId/queue',
  requireAdmin,
  requirePermission(AdminPermission.MANAGE_QUEUE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Queue details endpoint - to be implemented',
    });
  }
);

// POST /api/admin/queues/:saleId/admit - Manually admit users
router.post(
  '/queues/:saleId/admit',
  requireAdmin,
  requirePermission(AdminPermission.ADMIT_USERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Admit users endpoint - to be implemented',
    });
  }
);

// POST /api/admin/queue/remove - Remove user from queue
router.post(
  '/queue/remove',
  requireAdmin,
  requirePermission(AdminPermission.MANAGE_QUEUE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Remove user from queue endpoint - to be implemented',
    });
  }
);

// DELETE /api/admin/queues/:saleId/user/:userId - Remove specific user from queue
router.delete(
  '/queues/:saleId/user/:userId',
  requireAdmin,
  requirePermission(AdminPermission.MANAGE_QUEUE),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Remove user from queue endpoint - to be implemented',
    });
  }
);

/**
 * User Management Routes (Protected)
 */

// GET /api/admin/users - List users with pagination
router.get('/users', requireAdmin, requirePermission(AdminPermission.VIEW_USERS), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Users list endpoint - to be implemented',
  });
});

// GET /api/admin/users/:id - Get user details
router.get(
  '/users/:id',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'User details endpoint - to be implemented',
    });
  }
);

// GET /api/admin/users/:userId/activity - Get user activity logs
router.get(
  '/users/:userId/activity',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_USERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'User activity logs endpoint - to be implemented',
    });
  }
);

// PATCH /api/admin/users/:id/status - Update user status
router.patch(
  '/users/:id/status',
  requireAdmin,
  requirePermission(AdminPermission.EDIT_USERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Update user status endpoint - to be implemented',
    });
  }
);

/**
 * Order Management Routes (Protected)
 */

// GET /api/admin/orders - List orders with filters
router.get('/orders', requireAdmin, requirePermission(AdminPermission.VIEW_ORDERS), (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Orders list endpoint - to be implemented',
  });
});

// PATCH /api/admin/orders/:id/status - Update order status
router.patch(
  '/orders/:id/status',
  requireAdmin,
  requirePermission(AdminPermission.CANCEL_ORDERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Update order status endpoint - to be implemented',
    });
  }
);

// POST /api/admin/orders/:id/cancel - Cancel order
router.post(
  '/orders/:id/cancel',
  requireAdmin,
  requirePermission(AdminPermission.CANCEL_ORDERS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Cancel order endpoint - to be implemented',
    });
  }
);

/**
 * Analytics Routes (Protected)
 */

// GET /api/admin/analytics/sales - Sales analytics
router.get(
  '/analytics/sales',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Sales analytics endpoint - to be implemented',
    });
  }
);

// GET /api/admin/analytics/users - User behavior analytics
router.get(
  '/analytics/users',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'User analytics endpoint - to be implemented',
    });
  }
);

// GET /api/admin/analytics/queue - Queue performance analytics
router.get(
  '/analytics/queue',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Queue analytics endpoint - to be implemented',
    });
  }
);

// GET /api/admin/reports/performance - Performance report
router.get(
  '/reports/performance',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Performance report endpoint - to be implemented',
    });
  }
);

/**
 * System Admin Routes (Super Admin Only)
 */

// GET /api/admin/system/admins - List all admin users
router.get('/system/admins', requireSuperAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Admin users list endpoint - to be implemented',
  });
});

// POST /api/admin/system/admins - Create new admin user
router.post('/system/admins', requireSuperAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Create admin endpoint - to be implemented',
  });
});

// PATCH /api/admin/system/admins/:id - Update admin user
router.patch('/system/admins/:id', requireSuperAdmin, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Update admin endpoint - to be implemented',
  });
});

/**
 * Analytics Routes (Protected)
 */

// GET /api/admin/analytics/sales - Sales analytics
router.get(
  '/analytics/sales',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getSalesAnalytics)
);

// GET /api/admin/analytics/users - User behavior analytics
router.get(
  '/analytics/users',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getUserAnalytics)
);

// GET /api/admin/analytics/queue - Queue performance analytics
router.get(
  '/analytics/queue',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getQueueAnalytics)
);

// GET /api/admin/analytics/funnel - Conversion funnel analytics
router.get(
  '/analytics/funnel',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getFunnelAnalytics)
);

// GET /api/admin/analytics/revenue - Revenue analytics
router.get(
  '/analytics/revenue',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getRevenueAnalytics)
);

// GET /api/admin/analytics/events - Raw analytics events
router.get(
  '/analytics/events',
  requireAdmin,
  requirePermission(AdminPermission.VIEW_ANALYTICS),
  handler(AdminAnalyticsController.getEvents)
);

export default router;
