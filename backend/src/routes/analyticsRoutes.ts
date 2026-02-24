/**
 * Analytics Routes
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Public-facing analytics API endpoints (separate from admin analytics).
 * Provides executive summaries, revenue analytics, traffic patterns,
 * CSV exports, and more.
 */

import { Router, RequestHandler } from 'express';
import AnalyticsController from '../controllers/analyticsController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Type helper
const handler = (fn: any): RequestHandler => fn as RequestHandler;

/**
 * Executive Summary
 * GET /api/v1/analytics/executive-summary?startDate=...&endDate=...
 */
router.get('/executive-summary', authMiddleware, handler(AnalyticsController.getExecutiveSummary));

/**
 * Revenue Analytics
 * GET /api/v1/analytics/revenue?startDate=...&endDate=...&compareStart=...&compareEnd=...
 */
router.get('/revenue', authMiddleware, handler(AnalyticsController.getRevenue));

/**
 * Sale Performance
 * GET /api/v1/analytics/sale-performance?startDate=...&endDate=...&limit=10
 */
router.get('/sale-performance', authMiddleware, handler(AnalyticsController.getSalePerformance));

/**
 * User Retention & Segmentation
 * GET /api/v1/analytics/user-retention?startDate=...&endDate=...
 */
router.get('/user-retention', authMiddleware, handler(AnalyticsController.getUserRetention));

/**
 * Traffic Patterns
 * GET /api/v1/analytics/traffic?startDate=...&endDate=...
 */
router.get('/traffic', authMiddleware, handler(AnalyticsController.getTrafficPatterns));

/**
 * Inventory Turnover Analysis
 * GET /api/v1/analytics/inventory-turnover?startDate=...&endDate=...
 */
router.get(
  '/inventory-turnover',
  authMiddleware,
  handler(AnalyticsController.getInventoryTurnover)
);

/**
 * CSV Export
 * GET /api/v1/analytics/export/:type?startDate=...&endDate=...
 * Types: revenue, sales, users
 */
router.get('/export/:type', authMiddleware, handler(AnalyticsController.exportCSV));

export default router;
