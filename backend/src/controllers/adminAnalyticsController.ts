/**
 * Admin Analytics Controller
 * Handles API requests for analytics reports and queries
 */

import { Request, Response } from 'express';
import { getAnalyticsCollector } from '../services/analyticsCollector';
import { TimeSeriesAggregator } from '../utils/timeSeriesAggregator';
import { EventType } from '../models/analyticsEvent';

export class AdminAnalyticsController {
  /**
   * GET /api/admin/analytics/sales
   * Sales analytics for a specific sale or time period
   */
  static async getSalesAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { saleId, startDate, endDate, bucket = 'hour' } = req.query;
      const collector = getAnalyticsCollector();

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'startDate and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get events
      const events = await collector.getEvents(start, end);
      const filteredEvents = saleId
        ? TimeSeriesAggregator.filterBySale(events, saleId as string)
        : events;

      // Aggregate by bucket
      const aggregations = TimeSeriesAggregator.aggregateEvents(
        filteredEvents,
        bucket as 'minute' | 'hour' | 'day'
      );

      // Calculate sales metrics
      const viewers = new Set(
        filteredEvents
          .filter((e) => e.event_type === 'sale_view' && e.user_id)
          .map((e) => e.user_id!)
      ).size;

      const purchasers = new Set(
        filteredEvents
          .filter((e) => e.event_type === 'user_purchase_complete' && e.user_id)
          .map((e) => e.user_id!)
      ).size;

      const conversionRate = viewers > 0 ? (purchasers / viewers) * 100 : 0;

      const salesMetrics = {
        time_period: { start, end },
        total_views: filteredEvents.filter((e) => e.event_type === 'sale_view').length,
        unique_viewers: viewers,
        queue_joins: filteredEvents.filter((e) => e.event_type === 'user_join_queue').length,
        checkout_starts: filteredEvents.filter((e) => e.event_type === 'user_checkout_start')
          .length,
        purchases: filteredEvents.filter((e) => e.event_type === 'user_purchase_complete').length,
        total_revenue: filteredEvents
          .filter((e) => e.event_type === 'user_purchase_complete' && e.amount)
          .reduce((sum, e) => sum + (e.amount || 0), 0),
        conversion_rate: conversionRate,
        aggregations: Array.from(aggregations.values()),
      };

      res.json({
        success: true,
        data: salesMetrics,
      });
    } catch (error) {
      console.error('Error getting sales analytics:', error);
      res.status(500).json({ error: 'Failed to fetch sales analytics' });
    }
  }

  /**
   * GET /api/admin/analytics/users
   * User behavior analytics
   */
  static async getUserAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate } = req.query;
      const collector = getAnalyticsCollector();

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'startDate and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get events
      const events = await collector.getEvents(start, end);

      // Calculate user metrics
      const uniqueUsers = new Set(events.filter((e) => e.user_id).map((e) => e.user_id!));

      const pageViewEvents = events.filter(
        (e) =>
          e.event_type === 'page_view' ||
          e.event_type === 'product_view' ||
          e.event_type === 'sale_view'
      );

      const queueJoins = events.filter((e) => e.event_type === 'user_join_queue');

      const purchases = events.filter((e) => e.event_type === 'user_purchase_complete');

      // Calculate devices and locations
      const devices = new Map<string, number>();
      const countries = new Map<string, number>();
      const browsers = new Map<string, number>();

      for (const event of events) {
        if (event.os) {
          devices.set(event.os, (devices.get(event.os) || 0) + 1);
        }
        if (event.country) {
          countries.set(event.country, (countries.get(event.country) || 0) + 1);
        }
        if (event.browser) {
          browsers.set(event.browser, (browsers.get(event.browser) || 0) + 1);
        }
      }

      const userAnalytics = {
        time_period: { start, end },
        total_active_users: uniqueUsers.size,
        page_views: pageViewEvents.length,
        avg_pages_per_user: uniqueUsers.size > 0 ? pageViewEvents.length / uniqueUsers.size : 0,
        queue_join_rate: uniqueUsers.size > 0 ? (queueJoins.length / uniqueUsers.size) * 100 : 0,
        purchase_rate: uniqueUsers.size > 0 ? (purchases.length / uniqueUsers.size) * 100 : 0,
        device_breakdown: Object.fromEntries(devices),
        country_breakdown: Object.fromEntries(countries),
        browser_breakdown: Object.fromEntries(browsers),
      };

      res.json({
        success: true,
        data: userAnalytics,
      });
    } catch (error) {
      console.error('Error getting user analytics:', error);
      res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
  }

  /**
   * GET /api/admin/analytics/queue
   * Queue performance metrics
   */
  static async getQueueAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { queueId, saleId, startDate, endDate } = req.query;
      const collector = getAnalyticsCollector();

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'startDate and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get events
      let events = await collector.getEvents(start, end);

      if (queueId) {
        events = events.filter((e) => e.queue_id === queueId);
      } else if (saleId) {
        events = events.filter((e) => e.sale_id === saleId);
      }

      // Calculate queue metrics
      const queueJoinEvents = events.filter((e) => e.event_type === 'user_join_queue');
      const queueDropEvents = events.filter((e) => e.event_type === 'user_leave_queue');
      const queueAdmittedEvents = events.filter((e) => e.event_type === 'queue_user_admitted');

      const waitTimes = events
        .filter((e) => e.wait_time_ms !== undefined)
        .map((e) => e.wait_time_ms!)
        .sort((a, b) => a - b);

      const avgWaitTime =
        waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

      const medianWaitTime = waitTimes.length > 0 ? waitTimes[Math.floor(waitTimes.length / 2)] : 0;

      const queueAnalytics = {
        time_period: { start, end },
        total_joined: queueJoinEvents.length,
        total_dropped: queueDropEvents.length,
        total_admitted: queueAdmittedEvents.length,
        avg_wait_time_ms: avgWaitTime,
        median_wait_time_ms: medianWaitTime,
        max_wait_time_ms: waitTimes.length > 0 ? waitTimes[waitTimes.length - 1] : 0,
        min_wait_time_ms: waitTimes.length > 0 ? waitTimes[0] : 0,
        drop_rate:
          queueJoinEvents.length > 0 ? (queueDropEvents.length / queueJoinEvents.length) * 100 : 0,
        admission_rate:
          queueJoinEvents.length > 0
            ? (queueAdmittedEvents.length / queueJoinEvents.length) * 100
            : 0,
      };

      res.json({
        success: true,
        data: queueAnalytics,
      });
    } catch (error) {
      console.error('Error getting queue analytics:', error);
      res.status(500).json({ error: 'Failed to fetch queue analytics' });
    }
  }

  /**
   * GET /api/admin/analytics/funnel
   * Conversion funnel analysis
   */
  static async getFunnelAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { saleId, startDate, endDate } = req.query;
      const collector = getAnalyticsCollector();

      if (!saleId || !startDate || !endDate) {
        res.status(400).json({
          error: 'saleId, startDate, and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get events for the sale
      const events = await collector.getEvents(start, end);
      const saleEvents = events.filter((e) => e.sale_id === saleId);

      // Calculate funnel
      const funnel = TimeSeriesAggregator.calculateConversionFunnel(saleEvents, saleId as string);

      res.json({
        success: true,
        data: funnel,
      });
    } catch (error) {
      console.error('Error getting funnel analytics:', error);
      res.status(500).json({ error: 'Failed to fetch funnel analytics' });
    }
  }

  /**
   * GET /api/admin/analytics/revenue
   * Revenue analytics
   */
  static async getRevenueAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      const collector = getAnalyticsCollector();

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'startDate and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get purchase events
      const events = await collector.getEvents(start, end, 'user_purchase_complete' as EventType);

      // Calculate revenue metrics
      const totalRevenue = events
        .filter((e) => e.amount)
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      const totalOrders = events.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const amounts = events
        .filter((e) => e.amount)
        .map((e) => e.amount!)
        .sort((a, b) => a - b);

      const medianOrderValue = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;

      // Group by product and currency
      const byProduct = new Map<string, number>();
      const byCurrency = new Map<string, number>();

      for (const event of events) {
        if (event.product_id && event.amount) {
          byProduct.set(event.product_id, (byProduct.get(event.product_id) || 0) + event.amount);
        }
        if (event.currency && event.amount) {
          byCurrency.set(event.currency, (byCurrency.get(event.currency) || 0) + event.amount);
        }
      }

      const revenueAnalytics = {
        time_period: { start, end },
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        median_order_value: medianOrderValue,
        revenue_by_product: Object.fromEntries(byProduct),
        revenue_by_currency: Object.fromEntries(byCurrency),
      };

      res.json({
        success: true,
        data: revenueAnalytics,
      });
    } catch (error) {
      console.error('Error getting revenue analytics:', error);
      res.status(500).json({ error: 'Failed to fetch revenue analytics' });
    }
  }

  /**
   * GET /api/admin/analytics/events
   * Get raw events with filtering
   */
  static async getEvents(req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, eventType, saleId, userId, limit = 100 } = req.query;
      const collector = getAnalyticsCollector();

      if (!startDate || !endDate) {
        res.status(400).json({
          error: 'startDate and endDate query parameters required',
        });
        return;
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      // Get events
      let events = await collector.getEvents(
        start,
        end,
        eventType as EventType | undefined,
        parseInt(limit as string, 10)
      );

      // Filter
      if (saleId) {
        events = TimeSeriesAggregator.filterBySale(events, saleId as string);
      }
      if (userId) {
        events = events.filter((e) => e.user_id === userId);
      }

      res.json({
        success: true,
        data: {
          total: events.length,
          events,
        },
      });
    } catch (error) {
      console.error('Error getting events:', error);
      res.status(500).json({ error: 'Failed to fetch events' });
    }
  }
}

export default AdminAnalyticsController;
