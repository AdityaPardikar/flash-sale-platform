/**
 * Analytics Controller
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Handles API requests for advanced analytics aggregation,
 * executive summaries, CSV exports, and trend analysis.
 */

import { Request, Response } from 'express';
import { analyticsAggregator, DateRange } from '../services/analyticsAggregator';

function parseDateRange(req: Request): DateRange | null {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return null;
  return {
    start: new Date(startDate as string),
    end: new Date(endDate as string),
  };
}

function parseComparisonRange(req: Request): DateRange | undefined {
  const { compareStart, compareEnd } = req.query;
  if (!compareStart || !compareEnd) return undefined;
  return {
    start: new Date(compareStart as string),
    end: new Date(compareEnd as string),
  };
}

class AnalyticsController {
  /**
   * GET /api/v1/analytics/executive-summary
   * Executive dashboard with KPIs, alerts, and top sales
   */
  static async getExecutiveSummary(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const summary = await analyticsAggregator.getExecutiveSummary(range);
      res.json({ success: true, data: summary });
    } catch (error) {
      console.error('Error getting executive summary:', error);
      res.status(500).json({ error: 'Failed to fetch executive summary' });
    }
  }

  /**
   * GET /api/v1/analytics/revenue
   * Detailed revenue analytics with optional period comparison
   */
  static async getRevenue(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const comparisonRange = parseComparisonRange(req);
      const snapshot = await analyticsAggregator.getRevenueSnapshot(range, comparisonRange);
      res.json({ success: true, data: snapshot });
    } catch (error) {
      console.error('Error getting revenue analytics:', error);
      res.status(500).json({ error: 'Failed to fetch revenue analytics' });
    }
  }

  /**
   * GET /api/v1/analytics/sale-performance
   * Sale-level performance metrics
   */
  static async getSalePerformance(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const limit = parseInt(req.query.limit as string, 10) || 10;
      const performances = await analyticsAggregator.getSalePerformances(range, limit);
      res.json({ success: true, data: performances });
    } catch (error) {
      console.error('Error getting sale performance:', error);
      res.status(500).json({ error: 'Failed to fetch sale performance' });
    }
  }

  /**
   * GET /api/v1/analytics/user-retention
   * User retention, growth, and segmentation
   */
  static async getUserRetention(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const retention = await analyticsAggregator.getUserRetention(range);
      res.json({ success: true, data: retention });
    } catch (error) {
      console.error('Error getting user retention:', error);
      res.status(500).json({ error: 'Failed to fetch user retention' });
    }
  }

  /**
   * GET /api/v1/analytics/traffic
   * Traffic patterns and peak usage analysis
   */
  static async getTrafficPatterns(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const patterns = await analyticsAggregator.getTrafficPatterns(range);
      res.json({ success: true, data: patterns });
    } catch (error) {
      console.error('Error getting traffic patterns:', error);
      res.status(500).json({ error: 'Failed to fetch traffic patterns' });
    }
  }

  /**
   * GET /api/v1/analytics/inventory-turnover
   * Inventory movement and turnover analysis
   */
  static async getInventoryTurnover(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const turnover = await analyticsAggregator.getInventoryTurnover(range);
      res.json({ success: true, data: turnover });
    } catch (error) {
      console.error('Error getting inventory turnover:', error);
      res.status(500).json({ error: 'Failed to fetch inventory turnover' });
    }
  }

  /**
   * GET /api/v1/analytics/export/:type
   * Export analytics data as CSV
   */
  static async exportCSV(req: Request, res: Response): Promise<void> {
    try {
      const range = parseDateRange(req);
      if (!range) {
        res.status(400).json({ error: 'startDate and endDate query parameters required' });
        return;
      }

      const { type } = req.params;
      let data: Record<string, any>[] = [];
      let filename = '';

      switch (type) {
        case 'revenue': {
          const snapshot = await analyticsAggregator.getRevenueSnapshot(range);
          data = snapshot.revenueByDay.map((d) => ({
            date: d.date,
            revenue: d.revenue.toFixed(2),
            orders: d.orders,
          }));
          filename = `revenue-${range.start.toISOString().split('T')[0]}-to-${range.end.toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'sales': {
          const performances = await analyticsAggregator.getSalePerformances(range, 100);
          data = performances.map((p) => ({
            sale_id: p.saleId,
            product: p.productName,
            views: p.totalViews,
            queue_joins: p.queueJoins,
            purchases: p.purchases,
            revenue: p.revenue.toFixed(2),
            conversion_rate: p.conversionRate.toFixed(2),
            inventory_sold: p.inventorySoldPercent.toFixed(1),
          }));
          filename = `sale-performance-${range.start.toISOString().split('T')[0]}-to-${range.end.toISOString().split('T')[0]}.csv`;
          break;
        }
        case 'users': {
          const retention = await analyticsAggregator.getUserRetention(range);
          data = retention.usersBySegment.map((s) => ({
            segment: s.segment,
            user_count: s.count,
            revenue: s.revenue.toFixed(2),
          }));
          filename = `user-segments-${range.start.toISOString().split('T')[0]}-to-${range.end.toISOString().split('T')[0]}.csv`;
          break;
        }
        default:
          res
            .status(400)
            .json({ error: `Unknown export type: ${type}. Valid types: revenue, sales, users` });
          return;
      }

      const csvData = analyticsAggregator.generateCSV(data, filename);
      const csvString = analyticsAggregator.formatCSVString(csvData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csvString);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      res.status(500).json({ error: 'Failed to export data' });
    }
  }
}

export default AnalyticsController;
