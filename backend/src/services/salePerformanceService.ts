/**
 * Sale Performance Service
 * Aggregates and calculates performance metrics for flash sales
 */

import { query } from '../utils/database';
import { getAnalyticsCollector } from './analyticsCollector';
import { TimeSeriesAggregator } from '../utils/timeSeriesAggregator';
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
        FROM flash_sales WHERE id = ?
      `;
      const sale = await new Promise<any>((resolve, reject) => {
        db.get(saleQuery, [saleId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!sale) {
        throw new Error(`Sale ${saleId} not found`);
      }

      // Get analytics events
      const collector = getAnalyticsCollector();
      const events = await collector.getEvents({ sale_id: saleId });

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
      const soldQuantity = sale.total_inventory - sale.remaining_inventory;
      const utilizationPercentage =
        sale.total_inventory > 0 ? (soldQuantity / sale.total_inventory) * 100 : 0;

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
        inventory_sold: soldQuantity,
        inventory_utilization: utilizationPercentage,
        status: sale.status,
      };
    } catch (error) {
      console.error(`Error calculating metrics for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue statistics for a sale
   */
  static async getQueueStats(saleId: string): Promise<QueueStats> {
    try {
      const collector = getAnalyticsCollector();
      const events = await collector.getEvents({ sale_id: saleId });

      // Filter queue-related events
      const joinedEvents = events.filter((e) => e.event_type === EventType.QUEUE_USER_JOINED);
      const admittedEvents = events.filter((e) => e.event_type === EventType.QUEUE_USER_ADMITTED);
      const droppedEvents = events.filter((e) => e.event_type === EventType.QUEUE_USER_DROPPED);

      // Calculate wait times
      const waitTimes = joinedEvents.map((e) => e.metadata?.wait_time || 0).filter((t) => t > 0);

      const avgWaitTime =
        waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length : 0;

      const sortedWaitTimes = [...waitTimes].sort((a, b) => a - b);
      const medianWaitTime =
        sortedWaitTimes.length > 0 ? sortedWaitTimes[Math.floor(sortedWaitTimes.length / 2)] : 0;

      const maxWaitTime = waitTimes.length > 0 ? Math.max(...waitTimes) : 0;

      const totalJoined = joinedEvents.length;
      const totalAdmitted = admittedEvents.length;
      const totalDropped = droppedEvents.length;
      const dropRate = totalJoined > 0 ? totalDropped / totalJoined : 0;
      const admissionRate = totalJoined > 0 ? totalAdmitted / totalJoined : 0;

      return {
        sale_id: saleId,
        total_joined: totalJoined,
        currently_waiting: totalJoined - totalAdmitted - totalDropped,
        admitted: totalAdmitted,
        dropped: totalDropped,
        avg_wait_time: avgWaitTime,
        median_wait_time: medianWaitTime,
        max_wait_time: maxWaitTime,
        drop_rate: dropRate,
        admission_rate: admissionRate,
      };
    } catch (error) {
      console.error(`Error calculating queue stats for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get revenue breakdown by product and time
   */
  static async getRevenueDetails(saleId: string): Promise<RevenueDetails> {
    try {
      const collector = getAnalyticsCollector();
      const events = await collector.getEvents({ sale_id: saleId });

      // Filter purchase events
      const purchases = events.filter((e) => e.event_type === EventType.USER_PURCHASE_COMPLETE);
      const totalRevenue = purchases.reduce((sum, e) => sum + (e.amount || 0), 0);
      const totalOrders = purchases.length;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Calculate median
      const amounts = purchases.map((e) => e.amount || 0).sort((a, b) => a - b);
      const medianOrderValue = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : 0;

      // Revenue by product
      const byProduct = purchases.reduce(
        (acc, e) => {
          const existing = acc.find((p) => p.product_id === e.product_id);
          if (existing) {
            existing.units_sold += 1;
            existing.revenue += e.amount || 0;
          } else {
            acc.push({
              product_id: e.product_id || 'unknown',
              units_sold: 1,
              revenue: e.amount || 0,
            });
          }
          return acc;
        },
        [] as Array<{ product_id: string; units_sold: number; revenue: number }>
      );

      // Revenue by hour
      const byHour = purchases.reduce(
        (acc, e) => {
          const hour = new Date(e.timestamp).toISOString().split('T')[0];
          const existing = acc.find((h) => h.hour === hour);
          if (existing) {
            existing.revenue += e.amount || 0;
            existing.orders += 1;
          } else {
            acc.push({
              hour,
              revenue: e.amount || 0,
              orders: 1,
            });
          }
          return acc;
        },
        [] as Array<{ hour: string; revenue: number; orders: number }>
      );

      return {
        sale_id: saleId,
        total_revenue: totalRevenue,
        total_orders: totalOrders,
        avg_order_value: avgOrderValue,
        median_order_value: medianOrderValue,
        by_product: byProduct,
        by_hour: byHour.sort((a, b) => a.hour.localeCompare(b.hour)),
      };
    } catch (error) {
      console.error(`Error calculating revenue details for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get inventory status and sell-out projection
   */
  static async getInventoryStatus(saleId: string): Promise<InventoryStatus> {
    try {
      // Get sale info
      const saleQuery = `
        SELECT id, total_inventory, remaining_inventory, start_time, end_time
        FROM flash_sales WHERE id = ?
      `;
      const sale = await new Promise<any>((resolve, reject) => {
        db.get(saleQuery, [saleId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!sale) {
        throw new Error(`Sale ${saleId} not found`);
      }

      const soldQuantity = sale.total_inventory - sale.remaining_inventory;
      const utilizationPercentage =
        sale.total_inventory > 0 ? (soldQuantity / sale.total_inventory) * 100 : 0;

      // Calculate velocity (items per hour)
      const startTime = new Date(sale.start_time).getTime();
      const currentTime = new Date().getTime();
      const elapsedHours = (currentTime - startTime) / (1000 * 60 * 60);
      const velocity = elapsedHours > 0 ? soldQuantity / elapsedHours : 0;

      // Estimate sell-out time
      let estimatedSellOutTime: Date | null = null;
      if (velocity > 0 && sale.remaining_inventory > 0) {
        const remainingHours = sale.remaining_inventory / velocity;
        estimatedSellOutTime = new Date(currentTime + remainingHours * 60 * 60 * 1000);
      }

      return {
        sale_id: saleId,
        total_inventory: sale.total_inventory,
        remaining_inventory: sale.remaining_inventory,
        sold_quantity: soldQuantity,
        utilization_percentage: utilizationPercentage,
        estimated_sell_out_time: estimatedSellOutTime,
        velocity: velocity,
      };
    } catch (error) {
      console.error(`Error getting inventory status for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get performance comparison between multiple sales
   */
  static async comparePerformance(saleIds: string[]): Promise<SaleMetrics[]> {
    try {
      const results = await Promise.all(saleIds.map((saleId) => this.getSaleMetrics(saleId)));
      return results;
    } catch (error) {
      console.error('Error comparing performance:', error);
      throw error;
    }
  }
}

export default SalePerformanceService;
