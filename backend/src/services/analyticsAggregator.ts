/**
 * Analytics Aggregator Service
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Provides advanced data aggregation, trend analysis, and report generation
 * for the admin analytics dashboard. Builds on existing analyticsCollector
 * and timeSeriesAggregator with higher-level business intelligence features.
 */

import pool from '../utils/database';
import { getAnalyticsCollector } from './analyticsCollector';
import { TimeSeriesAggregator } from '../utils/timeSeriesAggregator';

// ─── Interfaces ───────────────────────────────────────────────

export interface DateRange {
  start: Date;
  end: Date;
}

export interface RevenueSnapshot {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  medianOrderValue: number;
  revenueByDay: Array<{ date: string; revenue: number; orders: number }>;
  revenueByProduct: Array<{
    productId: string;
    productName: string;
    revenue: number;
    units: number;
  }>;
  comparisonPeriod?: {
    totalRevenue: number;
    totalOrders: number;
    revenueChange: number;
    orderChange: number;
  };
}

export interface SalePerformance {
  saleId: string;
  productName: string;
  totalViews: number;
  uniqueViewers: number;
  queueJoins: number;
  reservations: number;
  purchases: number;
  revenue: number;
  conversionRate: number;
  avgTimeToConversion: number;
  peakConcurrentUsers: number;
  inventorySoldPercent: number;
}

export interface UserRetention {
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  retentionRate: number;
  churnRate: number;
  avgSessionDuration: number;
  avgPagesPerSession: number;
  usersBySegment: Array<{ segment: string; count: number; revenue: number }>;
}

export interface TrafficPattern {
  hourlyDistribution: Array<{ hour: number; requests: number; uniqueUsers: number }>;
  dailyDistribution: Array<{ day: string; requests: number; uniqueUsers: number }>;
  peakHour: number;
  peakDay: string;
  avgRequestsPerMinute: number;
}

export interface InventoryTurnover {
  totalProducts: number;
  avgTurnoverRate: number;
  fastMoving: Array<{ productId: string; name: string; turnoverRate: number }>;
  slowMoving: Array<{ productId: string; name: string; turnoverRate: number }>;
  outOfStock: number;
  lowStock: number;
}

export interface ExecutiveSummary {
  kpis: {
    totalRevenue: number;
    revenueGrowth: number;
    totalOrders: number;
    orderGrowth: number;
    avgOrderValue: number;
    totalUsers: number;
    userGrowth: number;
    conversionRate: number;
    activeSales: number;
  };
  topPerformingSales: SalePerformance[];
  revenueTimeline: Array<{ date: string; revenue: number }>;
  alerts: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }>;
}

export interface CSVExportData {
  headers: string[];
  rows: string[][];
  filename: string;
}

// ─── Service ──────────────────────────────────────────────────

class AnalyticsAggregator {
  /**
   * Generate a comprehensive revenue snapshot for a date range
   */
  async getRevenueSnapshot(
    range: DateRange,
    comparisonRange?: DateRange
  ): Promise<RevenueSnapshot> {
    try {
      // Query orders within date range
      const orderQuery = `
        SELECT
          o.id, o.total_amount, o.created_at, o.product_id, o.quantity,
          p.name as product_name
        FROM orders o
        LEFT JOIN products p ON o.product_id = p.id
        WHERE o.created_at BETWEEN $1 AND $2
          AND o.status IN ('completed', 'processing')
        ORDER BY o.created_at ASC
      `;
      const orderResult = await pool.query(orderQuery, [range.start, range.end]);
      const orders = orderResult.rows;

      const amounts = orders
        .map((o: any) => parseFloat(o.total_amount || '0'))
        .sort((a: number, b: number) => a - b);
      const totalRevenue = amounts.reduce((sum: number, a: number) => sum + a, 0);
      const totalOrders = orders.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const medianOrderValue = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;

      // Revenue by day
      const dailyMap = new Map<string, { revenue: number; orders: number }>();
      for (const order of orders) {
        const day = new Date(order.created_at).toISOString().split('T')[0];
        const entry = dailyMap.get(day) || { revenue: 0, orders: 0 };
        entry.revenue += parseFloat(order.total_amount || '0');
        entry.orders += 1;
        dailyMap.set(day, entry);
      }
      const revenueByDay = Array.from(dailyMap.entries())
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date));

      // Revenue by product
      const productMap = new Map<string, { productName: string; revenue: number; units: number }>();
      for (const order of orders) {
        const pid = order.product_id || 'unknown';
        const entry = productMap.get(pid) || {
          productName: order.product_name || 'Unknown',
          revenue: 0,
          units: 0,
        };
        entry.revenue += parseFloat(order.total_amount || '0');
        entry.units += order.quantity || 1;
        productMap.set(pid, entry);
      }
      const revenueByProduct = Array.from(productMap.entries())
        .map(([productId, data]) => ({ productId, ...data }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20);

      const snapshot: RevenueSnapshot = {
        totalRevenue,
        totalOrders,
        avgOrderValue,
        medianOrderValue,
        revenueByDay,
        revenueByProduct,
      };

      // Comparison period
      if (comparisonRange) {
        const compResult = await pool.query(orderQuery, [
          comparisonRange.start,
          comparisonRange.end,
        ]);
        const compOrders = compResult.rows;
        const compRevenue = compOrders.reduce(
          (sum: number, o: any) => sum + parseFloat(o.total_amount || '0'),
          0
        );
        snapshot.comparisonPeriod = {
          totalRevenue: compRevenue,
          totalOrders: compOrders.length,
          revenueChange: compRevenue > 0 ? ((totalRevenue - compRevenue) / compRevenue) * 100 : 0,
          orderChange:
            compOrders.length > 0
              ? ((totalOrders - compOrders.length) / compOrders.length) * 100
              : 0,
        };
      }

      return snapshot;
    } catch (error) {
      console.error('Error generating revenue snapshot:', error);
      return {
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        medianOrderValue: 0,
        revenueByDay: [],
        revenueByProduct: [],
      };
    }
  }

  /**
   * Get sale performance metrics across all or specific sales
   */
  async getSalePerformances(range: DateRange, limit: number = 10): Promise<SalePerformance[]> {
    try {
      const query = `
        SELECT
          fs.id as sale_id,
          p.name as product_name,
          fs.quantity_available,
          COALESCE(fs.quantity_available - fs.quantity_remaining, 0) as quantity_sold,
          fs.flash_price
        FROM flash_sales fs
        LEFT JOIN products p ON fs.product_id = p.id
        WHERE fs.start_time BETWEEN $1 AND $2
           OR fs.end_time BETWEEN $1 AND $2
        ORDER BY fs.start_time DESC
        LIMIT $3
      `;
      const result = await pool.query(query, [range.start, range.end, limit]);

      const performances: SalePerformance[] = [];
      for (const sale of result.rows) {
        // Get analytics events for this sale
        const eventsQuery = `
          SELECT event_type, COUNT(*) as cnt, COUNT(DISTINCT user_id) as unique_users
          FROM analytics_events
          WHERE sale_id = $1 AND created_at BETWEEN $2 AND $3
          GROUP BY event_type
        `;
        const eventsResult = await pool.query(eventsQuery, [sale.sale_id, range.start, range.end]);
        const eventCounts = new Map(
          eventsResult.rows.map((r: any) => [
            r.event_type,
            { count: parseInt(r.cnt), unique: parseInt(r.unique_users) },
          ])
        );

        const views = eventCounts.get('sale_view')?.count || 0;
        const uniqueViewers = eventCounts.get('sale_view')?.unique || 0;
        const queueJoins =
          eventCounts.get('queue_join')?.count || eventCounts.get('user_join_queue')?.count || 0;
        const reservations = eventCounts.get('reservation_made')?.count || 0;
        const purchases =
          eventCounts.get('purchase_complete')?.count ||
          eventCounts.get('user_purchase_complete')?.count ||
          0;

        const quantitySold = sale.quantity_sold || 0;
        const revenue = quantitySold * parseFloat(sale.flash_price || '0');
        const conversionRate = views > 0 ? (purchases / views) * 100 : 0;
        const inventorySoldPercent =
          sale.quantity_available > 0 ? (quantitySold / sale.quantity_available) * 100 : 0;

        performances.push({
          saleId: sale.sale_id,
          productName: sale.product_name || 'Unknown',
          totalViews: views,
          uniqueViewers,
          queueJoins,
          reservations,
          purchases,
          revenue,
          conversionRate,
          avgTimeToConversion: 0, // Would need event timestamps to calculate
          peakConcurrentUsers: uniqueViewers,
          inventorySoldPercent,
        });
      }

      return performances.sort((a, b) => b.revenue - a.revenue);
    } catch (error) {
      console.error('Error getting sale performances:', error);
      return [];
    }
  }

  /**
   * User retention and growth analysis
   */
  async getUserRetention(range: DateRange): Promise<UserRetention> {
    try {
      // Total users
      const totalQuery = `SELECT COUNT(*) as total FROM users WHERE created_at <= $1`;
      const totalResult = await pool.query(totalQuery, [range.end]);
      const totalUsers = parseInt(totalResult.rows[0]?.total || '0');

      // New users in range
      const newQuery = `SELECT COUNT(*) as new_count FROM users WHERE created_at BETWEEN $1 AND $2`;
      const newResult = await pool.query(newQuery, [range.start, range.end]);
      const newUsers = parseInt(newResult.rows[0]?.new_count || '0');

      // Active users (users with events in range)
      const activeQuery = `
        SELECT COUNT(DISTINCT user_id) as active_count
        FROM analytics_events
        WHERE user_id IS NOT NULL AND created_at BETWEEN $1 AND $2
      `;
      const activeResult = await pool.query(activeQuery, [range.start, range.end]);
      const activeUsers = parseInt(activeResult.rows[0]?.active_count || '0');

      // Returning users (active but not new)
      const returningUsers = Math.max(0, activeUsers - newUsers);
      const retentionRate = totalUsers > 0 ? (returningUsers / totalUsers) * 100 : 0;
      const churnRate = 100 - retentionRate;

      // User segments based on purchase behavior
      const segmentQuery = `
        SELECT
          CASE
            WHEN purchase_count >= 10 THEN 'VIP'
            WHEN purchase_count >= 5 THEN 'Loyal'
            WHEN purchase_count >= 1 THEN 'Active'
            ELSE 'Browser'
          END as segment,
          COUNT(*) as user_count,
          COALESCE(SUM(total_spent), 0) as segment_revenue
        FROM (
          SELECT
            u.id,
            COUNT(o.id) as purchase_count,
            COALESCE(SUM(CAST(o.total_amount AS DECIMAL)), 0) as total_spent
          FROM users u
          LEFT JOIN orders o ON u.id = o.user_id AND o.status = 'completed'
          GROUP BY u.id
        ) user_stats
        GROUP BY segment
        ORDER BY segment_revenue DESC
      `;
      const segmentResult = await pool.query(segmentQuery);
      const usersBySegment = segmentResult.rows.map((r: any) => ({
        segment: r.segment,
        count: parseInt(r.user_count),
        revenue: parseFloat(r.segment_revenue || '0'),
      }));

      return {
        totalUsers,
        newUsers,
        returningUsers,
        retentionRate,
        churnRate,
        avgSessionDuration: 0, // Would need session tracking
        avgPagesPerSession: 0,
        usersBySegment,
      };
    } catch (error) {
      console.error('Error getting user retention:', error);
      return {
        totalUsers: 0,
        newUsers: 0,
        returningUsers: 0,
        retentionRate: 0,
        churnRate: 100,
        avgSessionDuration: 0,
        avgPagesPerSession: 0,
        usersBySegment: [],
      };
    }
  }

  /**
   * Analyze traffic patterns (hourly and daily)
   */
  async getTrafficPatterns(range: DateRange): Promise<TrafficPattern> {
    try {
      // Hourly distribution
      const hourlyQuery = `
        SELECT
          EXTRACT(HOUR FROM created_at) as hour,
          COUNT(*) as requests,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics_events
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY EXTRACT(HOUR FROM created_at)
        ORDER BY hour
      `;
      const hourlyResult = await pool.query(hourlyQuery, [range.start, range.end]);
      const hourlyDistribution = Array.from({ length: 24 }, (_, i) => {
        const row = hourlyResult.rows.find((r: any) => parseInt(r.hour) === i);
        return {
          hour: i,
          requests: parseInt(row?.requests || '0'),
          uniqueUsers: parseInt(row?.unique_users || '0'),
        };
      });

      // Daily distribution
      const dailyQuery = `
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') as day,
          COUNT(*) as requests,
          COUNT(DISTINCT user_id) as unique_users
        FROM analytics_events
        WHERE created_at BETWEEN $1 AND $2
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
        ORDER BY day
      `;
      const dailyResult = await pool.query(dailyQuery, [range.start, range.end]);
      const dailyDistribution = dailyResult.rows.map((r: any) => ({
        day: r.day,
        requests: parseInt(r.requests),
        uniqueUsers: parseInt(r.unique_users),
      }));

      // Find peaks
      const peakHourEntry = hourlyDistribution.reduce(
        (max, h) => (h.requests > max.requests ? h : max),
        hourlyDistribution[0]
      );
      const peakDayEntry =
        dailyDistribution.length > 0
          ? dailyDistribution.reduce(
              (max, d) => (d.requests > max.requests ? d : max),
              dailyDistribution[0]
            )
          : { day: 'N/A', requests: 0 };

      // Avg requests per minute
      const totalMinutes = (range.end.getTime() - range.start.getTime()) / (1000 * 60);
      const totalRequests = hourlyDistribution.reduce((sum, h) => sum + h.requests, 0);
      const avgRequestsPerMinute = totalMinutes > 0 ? totalRequests / totalMinutes : 0;

      return {
        hourlyDistribution,
        dailyDistribution,
        peakHour: peakHourEntry?.hour || 0,
        peakDay: peakDayEntry?.day || 'N/A',
        avgRequestsPerMinute,
      };
    } catch (error) {
      console.error('Error getting traffic patterns:', error);
      return {
        hourlyDistribution: Array.from({ length: 24 }, (_, i) => ({
          hour: i,
          requests: 0,
          uniqueUsers: 0,
        })),
        dailyDistribution: [],
        peakHour: 0,
        peakDay: 'N/A',
        avgRequestsPerMinute: 0,
      };
    }
  }

  /**
   * Inventory turnover analysis
   */
  async getInventoryTurnover(range: DateRange): Promise<InventoryTurnover> {
    try {
      const query = `
        SELECT
          p.id as product_id,
          p.name,
          COALESCE(SUM(fs.quantity_available), 0) as total_available,
          COALESCE(SUM(fs.quantity_available - COALESCE(fs.quantity_remaining, fs.quantity_available)), 0) as total_sold
        FROM products p
        LEFT JOIN flash_sales fs ON p.id = fs.product_id
          AND fs.start_time BETWEEN $1 AND $2
        GROUP BY p.id, p.name
        ORDER BY total_sold DESC
      `;
      const result = await pool.query(query, [range.start, range.end]);

      const products = result.rows.map((r: any) => {
        const available = parseInt(r.total_available || '0');
        const sold = parseInt(r.total_sold || '0');
        return {
          productId: r.product_id,
          name: r.name,
          totalAvailable: available,
          totalSold: sold,
          turnoverRate: available > 0 ? (sold / available) * 100 : 0,
        };
      });

      const avgTurnoverRate =
        products.length > 0
          ? products.reduce((sum, p) => sum + p.turnoverRate, 0) / products.length
          : 0;

      return {
        totalProducts: products.length,
        avgTurnoverRate,
        fastMoving: products
          .filter((p) => p.turnoverRate > 50)
          .slice(0, 10)
          .map((p) => ({ productId: p.productId, name: p.name, turnoverRate: p.turnoverRate })),
        slowMoving: products
          .filter((p) => p.turnoverRate < 20 && p.totalAvailable > 0)
          .slice(0, 10)
          .map((p) => ({ productId: p.productId, name: p.name, turnoverRate: p.turnoverRate })),
        outOfStock: products.filter((p) => p.totalAvailable > 0 && p.totalSold >= p.totalAvailable)
          .length,
        lowStock: products.filter(
          (p) => p.totalAvailable > 0 && p.turnoverRate > 80 && p.turnoverRate < 100
        ).length,
      };
    } catch (error) {
      console.error('Error getting inventory turnover:', error);
      return {
        totalProducts: 0,
        avgTurnoverRate: 0,
        fastMoving: [],
        slowMoving: [],
        outOfStock: 0,
        lowStock: 0,
      };
    }
  }

  /**
   * Generate executive summary with KPIs and alerts
   */
  async getExecutiveSummary(range: DateRange): Promise<ExecutiveSummary> {
    try {
      const [revenue, performances, retention, traffic] = await Promise.all([
        this.getRevenueSnapshot(range),
        this.getSalePerformances(range, 5),
        this.getUserRetention(range),
        this.getTrafficPatterns(range),
      ]);

      // Calculate growth (compare with previous period of same length)
      const periodLength = range.end.getTime() - range.start.getTime();
      const prevRange: DateRange = {
        start: new Date(range.start.getTime() - periodLength),
        end: new Date(range.start.getTime()),
      };
      const prevRevenue = await this.getRevenueSnapshot(prevRange);

      const revenueGrowth =
        prevRevenue.totalRevenue > 0
          ? ((revenue.totalRevenue - prevRevenue.totalRevenue) / prevRevenue.totalRevenue) * 100
          : 0;
      const orderGrowth =
        prevRevenue.totalOrders > 0
          ? ((revenue.totalOrders - prevRevenue.totalOrders) / prevRevenue.totalOrders) * 100
          : 0;

      // Active sales count
      const activeSalesQuery = `SELECT COUNT(*) as cnt FROM flash_sales WHERE status = 'active'`;
      const activeSalesResult = await pool.query(activeSalesQuery);
      const activeSales = parseInt(activeSalesResult.rows[0]?.cnt || '0');

      // Overall conversion
      const totalViews = performances.reduce((sum, p) => sum + p.totalViews, 0);
      const totalPurchases = performances.reduce((sum, p) => sum + p.purchases, 0);
      const conversionRate = totalViews > 0 ? (totalPurchases / totalViews) * 100 : 0;

      // Generate alerts
      const alerts: ExecutiveSummary['alerts'] = [];
      if (revenueGrowth < -20) {
        alerts.push({
          type: 'revenue',
          message: `Revenue down ${Math.abs(revenueGrowth).toFixed(1)}% vs previous period`,
          severity: 'warning',
        });
      }
      if (retention.churnRate > 50) {
        alerts.push({
          type: 'retention',
          message: `High churn rate: ${retention.churnRate.toFixed(1)}%`,
          severity: 'warning',
        });
      }
      if (conversionRate < 1) {
        alerts.push({
          type: 'conversion',
          message: `Low conversion rate: ${conversionRate.toFixed(2)}%`,
          severity: 'info',
        });
      }
      const topSaleWithLowInventory = performances.find((p) => p.inventorySoldPercent > 90);
      if (topSaleWithLowInventory) {
        alerts.push({
          type: 'inventory',
          message: `${topSaleWithLowInventory.productName} is ${topSaleWithLowInventory.inventorySoldPercent.toFixed(0)}% sold`,
          severity: 'critical',
        });
      }

      return {
        kpis: {
          totalRevenue: revenue.totalRevenue,
          revenueGrowth,
          totalOrders: revenue.totalOrders,
          orderGrowth,
          avgOrderValue: revenue.avgOrderValue,
          totalUsers: retention.totalUsers,
          userGrowth: retention.newUsers,
          conversionRate,
          activeSales,
        },
        topPerformingSales: performances,
        revenueTimeline: revenue.revenueByDay.map((d) => ({ date: d.date, revenue: d.revenue })),
        alerts,
      };
    } catch (error) {
      console.error('Error generating executive summary:', error);
      return {
        kpis: {
          totalRevenue: 0,
          revenueGrowth: 0,
          totalOrders: 0,
          orderGrowth: 0,
          avgOrderValue: 0,
          totalUsers: 0,
          userGrowth: 0,
          conversionRate: 0,
          activeSales: 0,
        },
        topPerformingSales: [],
        revenueTimeline: [],
        alerts: [
          { type: 'system', message: 'Failed to load analytics data', severity: 'critical' },
        ],
      };
    }
  }

  /**
   * Export analytics data as CSV format
   */
  generateCSV(data: Record<string, any>[], filename: string): CSVExportData {
    if (data.length === 0) {
      return { headers: [], rows: [], filename };
    }

    const headers = Object.keys(data[0]);
    const rows = data.map((item) =>
      headers.map((h) => {
        const val = item[h];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      })
    );

    return { headers, rows, filename };
  }

  /**
   * Format CSV data as string for download
   */
  formatCSVString(csvData: CSVExportData): string {
    const escape = (val: string) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headerLine = csvData.headers.map(escape).join(',');
    const dataLines = csvData.rows.map((row) => row.map(escape).join(','));
    return [headerLine, ...dataLines].join('\n');
  }
}

export const analyticsAggregator = new AnalyticsAggregator();
export { AnalyticsAggregator };
