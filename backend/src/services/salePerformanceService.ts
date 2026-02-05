/**
 * Sale Performance Service
 * Aggregates and calculates performance metrics for flash sales
 */

import { query } from '../utils/database';
import { getAnalyticsCollector } from './analyticsCollector';
import { EventType } from '../models/analyticsEvent';

export interface SaleMetrics {
  sale_id: string;
  name: string;
  views: number;
  unique_viewers: number;
  queue_joins: number;
  purchases: number;
  revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  inventory_remaining: number;
  inventory_sold: number;
  inventory_utilization: number;
  status: string;
}

export interface QueueStats {
  sale_id: string;
  total_joined: number;
  currently_waiting: number;
  admitted: number;
  dropped: number;
  avg_wait_time: number;
  median_wait_time: number;
  max_wait_time: number;
  drop_rate: number;
  admission_rate: number;
}

export interface RevenueDetails {
  sale_id: string;
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  median_order_value: number;
  by_product: Array<{ product_id: string; units_sold: number; revenue: number }>;
  by_hour: Array<{ hour: string; revenue: number; orders: number }>;
}

export interface InventoryStatus {
  sale_id: string;
  total_inventory: number;
  remaining_inventory: number;
  sold_quantity: number;
  utilization_percentage: number;
  estimated_sell_out_time: Date | null;
  velocity: number; // Units per hour
}

export class SalePerformanceService {
  /**
   * Get comprehensive metrics for a specific sale
   */
  static async getSaleMetrics(saleId: string): Promise<SaleMetrics> {
    try {
      // Get sale info
      const saleQuery = `
        SELECT id, name, status, total_inventory, remaining_inventory, discount_percentage
        FROM flash_sales WHERE id = $1
      `;
      const saleResult = await query(saleQuery, [saleId]);

      if (saleResult.rows.length === 0) {
        throw new Error(`Sale ${saleId} not found`);
      }

      const sale = saleResult.rows[0];

      // Get analytics events using proper API
      const collector = getAnalyticsCollector();
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const events = await collector.getEvents(startOfDay, now);

      // Calculate metrics
      const views = events.filter((e) => e.event_type === EventType.PRODUCT_VIEW).length;
      const uniqueViewers = new Set(
        events.filter((e) => e.event_type === EventType.PRODUCT_VIEW).map((e) => e.user_id)
      ).size;
      const queueJoins = events.filter((e) => e.event_type === EventType.USER_JOIN_QUEUE).length;
      const purchases = events.filter(
        (e) => e.event_type === EventType.USER_PURCHASE_COMPLETE
      ).length;
      const totalRevenue = events
        .filter((e) => e.event_type === EventType.USER_PURCHASE_COMPLETE)
        .reduce((sum, e) => sum + (e.amount || 0), 0);

      const conversionRate = views > 0 ? purchases / views : 0;
      const avgOrderValue = purchases > 0 ? totalRevenue / purchases : 0;
      const inventorySold = sale.total_inventory - sale.remaining_inventory;
      const inventoryUtilization =
        sale.total_inventory > 0 ? inventorySold / sale.total_inventory : 0;

      return {
        sale_id: saleId,
        name: sale.name,
        views,
        unique_viewers: uniqueViewers,
        queue_joins: queueJoins,
        purchases,
        revenue: totalRevenue,
        conversion_rate: conversionRate,
        avg_order_value: avgOrderValue,
        inventory_remaining: sale.remaining_inventory,
        inventory_sold: inventorySold,
        inventory_utilization: inventoryUtilization,
        status: sale.status,
      };
    } catch (error) {
      console.error(`Error getting sale metrics for ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics for a sale
   */
  static async getQueueStats(saleId: string): Promise<QueueStats> {
    try {
      const queueQuery = `
        SELECT 
          COUNT(*) as total_joined,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as currently_waiting,
          SUM(CASE WHEN status = 'admitted' THEN 1 ELSE 0 END) as admitted,
          SUM(CASE WHEN status = 'dropped' THEN 1 ELSE 0 END) as dropped,
          AVG(EXTRACT(EPOCH FROM (exit_time - entry_time))) as avg_wait_seconds
        FROM queue_entries
        WHERE flash_sale_id = $1
      `;

      const result = await query(queueQuery, [saleId]);
      const stats = result.rows[0] || {};

      const totalJoined = parseInt(stats.total_joined || 0);
      const currentlyWaiting = parseInt(stats.currently_waiting || 0);
      const admitted = parseInt(stats.admitted || 0);
      const dropped = parseInt(stats.dropped || 0);

      return {
        sale_id: saleId,
        total_joined: totalJoined,
        currently_waiting: currentlyWaiting,
        admitted,
        dropped,
        avg_wait_time: stats.avg_wait_seconds || 0,
        median_wait_time: 0, // Can be calculated with percentile_cont if needed
        max_wait_time: 0, // Can be calculated with MAX() if needed
        drop_rate: totalJoined > 0 ? dropped / totalJoined : 0,
        admission_rate: totalJoined > 0 ? admitted / totalJoined : 0,
      };
    } catch (error) {
      console.error(`Error getting queue stats for ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get revenue details breakdown
   */
  static async getRevenueDetails(saleId: string): Promise<RevenueDetails> {
    try {
      // Get total revenue
      const revenueQuery = `
        SELECT 
          COALESCE(SUM(total_price), 0) as total_revenue,
          COUNT(*) as total_orders,
          COALESCE(AVG(total_price), 0) as avg_order_value
        FROM orders
        WHERE flash_sale_id = $1
      `;

      const revenueResult = await query(revenueQuery, [saleId]);
      const revenueSummary = revenueResult.rows[0];

      // Get revenue by product
      const byProductQuery = `
        SELECT 
          p.id as product_id,
          COUNT(*) as units_sold,
          COALESCE(SUM(oi.price * oi.quantity), 0) as revenue
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p ON oi.product_id = p.id
        WHERE o.flash_sale_id = $1
        GROUP BY p.id
      `;

      const byProductResult = await query(byProductQuery, [saleId]);

      // Get revenue by hour
      const byHourQuery = `
        SELECT 
          DATE_TRUNC('hour', created_at) as hour,
          COALESCE(SUM(total_price), 0) as revenue,
          COUNT(*) as orders
        FROM orders
        WHERE flash_sale_id = $1
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour DESC
      `;

      const byHourResult = await query(byHourQuery, [saleId]);

      return {
        sale_id: saleId,
        total_revenue: revenueSummary.total_revenue || 0,
        total_orders: revenueSummary.total_orders || 0,
        avg_order_value: revenueSummary.avg_order_value || 0,
        median_order_value: 0, // Can be calculated with percentile_cont if needed
        by_product: byProductResult.rows || [],
        by_hour: byHourResult.rows || [],
      };
    } catch (error) {
      console.error(`Error getting revenue details for ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get inventory status and velocity
   */
  static async getInventoryStatus(saleId: string): Promise<InventoryStatus> {
    try {
      const saleQuery = `
        SELECT 
          id, total_inventory, remaining_inventory, created_at
        FROM flash_sales
        WHERE id = $1
      `;

      const saleResult = await query(saleQuery, [saleId]);

      if (saleResult.rows.length === 0) {
        throw new Error(`Sale ${saleId} not found`);
      }

      const sale = saleResult.rows[0];
      const soldQuantity = sale.total_inventory - sale.remaining_inventory;
      const utilizationPercentage =
        sale.total_inventory > 0 ? (soldQuantity / sale.total_inventory) * 100 : 0;

      // Calculate velocity (units per hour)
      const now = new Date();
      const hoursElapsed = (now.getTime() - new Date(sale.created_at).getTime()) / (1000 * 60 * 60);
      const velocity = hoursElapsed > 0 ? soldQuantity / hoursElapsed : 0;

      // Estimate sell-out time
      let estimatedSellOutTime = null;
      if (velocity > 0 && sale.remaining_inventory > 0) {
        const hoursUntilSoldOut = sale.remaining_inventory / velocity;
        estimatedSellOutTime = new Date(now.getTime() + hoursUntilSoldOut * 60 * 60 * 1000);
      }

      return {
        sale_id: saleId,
        total_inventory: sale.total_inventory,
        remaining_inventory: sale.remaining_inventory,
        sold_quantity: soldQuantity,
        utilization_percentage: utilizationPercentage,
        estimated_sell_out_time: estimatedSellOutTime,
        velocity,
      };
    } catch (error) {
      console.error(`Error getting inventory status for ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Compare performance across multiple sales
   */
  static async compareSalesPerformance(saleIds: string[]): Promise<SaleMetrics[]> {
    try {
      const results: SaleMetrics[] = [];

      for (const saleId of saleIds) {
        const metrics = await this.getSaleMetrics(saleId);
        results.push(metrics);
      }

      return results;
    } catch (error) {
      console.error(`Error comparing sales performance:`, error);
      throw error;
    }
  }

  /**
   * Get trending sales (highest performing)
   */
  static async getTrendingSales(limit: number = 10): Promise<SaleMetrics[]> {
    try {
      const trendingQuery = `
        SELECT 
          fs.id, fs.name, fs.status, fs.total_inventory, fs.remaining_inventory,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total_price), 0) as total_revenue,
          COUNT(DISTINCT o.user_id) as unique_customers
        FROM flash_sales fs
        LEFT JOIN orders o ON fs.id = o.flash_sale_id
        WHERE fs.status IN ('active', 'paused')
        GROUP BY fs.id
        ORDER BY total_revenue DESC
        LIMIT $1
      `;

      const result = await query(trendingQuery, [limit]);
      const results: SaleMetrics[] = [];

      for (const row of result.rows) {
        const metrics = await this.getSaleMetrics(row.id);
        results.push(metrics);
      }

      return results;
    } catch (error) {
      console.error(`Error getting trending sales:`, error);
      throw error;
    }
  }
}

export default SalePerformanceService;
