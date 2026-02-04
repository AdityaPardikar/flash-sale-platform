/**
 * Sale Management Service
 * Handles sale status changes, scheduling, and control operations
 */

import { query } from '../utils/database';
import { getAnalyticsCollector } from './analyticsCollector';
import { EventType, EventSource } from '../models/analyticsEvent';

export interface SaleScheduleUpdate {
  sale_id: string;
  scheduled_start: Date;
  scheduled_end: Date;
}

export interface InventoryAdjustment {
  sale_id: string;
  adjustment: number;
  reason: string;
}

export interface PriceOverride {
  sale_id: string;
  product_id: string;
  override_discount_percentage: number;
}

export class SaleManagementService {
  /**
   * Manually activate a flash sale
   */
  static async activateSale(saleId: string): Promise<void> {
    try {
      const queryStr = `UPDATE flash_sales SET status = 'active', updated_at = NOW() WHERE id = $1`;
      await query(queryStr, [saleId]);

      // Track event
      const collector = getAnalyticsCollector();
      collector.trackEvent({
        event_type: EventType.SALE_STARTED,
        source: EventSource.ADMIN,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
      });
    } catch (error) {
      console.error(`Error activating sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Pause an active flash sale
   */
  static async pauseSale(saleId: string): Promise<void> {
    try {
      const queryStr = `UPDATE flash_sales SET status = 'paused', updated_at = NOW() WHERE id = $1`;
      await query(queryStr, [saleId]);

      // Track event
      const collector = getAnalyticsCollector();
      collector.trackEvent({
        event_type: EventType.SALE_PAUSED,
        source: EventSource.ADMIN,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
      });
    } catch (error) {
      console.error(`Error pausing sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Resume a paused flash sale
   */
  static async resumeSale(saleId: string): Promise<void> {
    try {
      const queryStr = `UPDATE flash_sales SET status = 'active', updated_at = NOW() WHERE id = $1`;
      await query(queryStr, [saleId]);

      // Track event
      const collector = getAnalyticsCollector();
      collector.trackEvent({
        event_type: EventType.SALE_RESUMED,
        source: EventSource.ADMIN,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
      });
    } catch (error) {
      console.error(`Error resuming sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Emergency stop - cancel and cleanup sale
   */
  static async emergencyStop(
    saleId: string,
    reason: string = 'Emergency stop triggered'
  ): Promise<void> {
    try {
      const queryStr = `UPDATE flash_sales SET status = 'cancelled', updated_at = NOW() WHERE id = $1`;
      await query(queryStr, [saleId]);

      // Track system event
      const collector = getAnalyticsCollector();
      collector.trackEvent({
        event_type: EventType.SYSTEM_ERROR,
        source: EventSource.SYSTEM,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
        metadata: { reason, type: 'emergency_stop' },
      });
    } catch (error) {
      console.error(`Error in emergency stop for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Schedule sale to start and end at specific times
   */
  static async scheduleSale(update: SaleScheduleUpdate): Promise<void> {
    try {
      const { sale_id, scheduled_start, scheduled_end } = update;

      if (new Date(scheduled_start) >= new Date(scheduled_end)) {
        throw new Error('Scheduled start time must be before end time');
      }

      const query = `
        UPDATE flash_sales 
        SET start_time = ?, end_time = ?, status = 'scheduled', updated_at = NOW() 
        WHERE id = ?
      `;

      await new Promise<void>((resolve, reject) => {
        db.run(query, [scheduled_start, scheduled_end, sale_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error(`Error scheduling sale ${update.sale_id}:`, error);
      throw error;
    }
  }

  /**
   * Adjust inventory for a sale
   */
  static async adjustInventory(adjustment: InventoryAdjustment): Promise<number> {
    try {
      const { sale_id, adjustment: amount, reason } = adjustment;

      // Get current inventory
      const query = `SELECT remaining_inventory FROM flash_sales WHERE id = ?`;
      const sale = await new Promise<any>((resolve, reject) => {
        db.get(query, [sale_id], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!sale) {
        throw new Error(`Sale ${sale_id} not found`);
      }

      const newInventory = Math.max(0, sale.remaining_inventory + amount);

      const updateQuery = `
        UPDATE flash_sales 
        SET remaining_inventory = ?, updated_at = NOW() 
        WHERE id = ?
      `;

      await new Promise<void>((resolve, reject) => {
        db.run(updateQuery, [newInventory, sale_id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      return newInventory;
    } catch (error) {
      console.error(`Error adjusting inventory for sale ${adjustment.sale_id}:`, error);
      throw error;
    }
  }

  /**
   * Apply price override for specific product in a sale
   */
  static async setPriceOverride(override: PriceOverride): Promise<void> {
    try {
      const { sale_id, product_id, override_discount_percentage } = override;

      if (override_discount_percentage < 0 || override_discount_percentage > 100) {
        throw new Error('Discount percentage must be between 0 and 100');
      }

      // Insert or update price override
      const query = `
        INSERT INTO flash_sale_price_overrides 
        (flash_sale_id, product_id, discount_percentage, created_at, updated_at)
        VALUES (?, ?, ?, NOW(), NOW())
        ON CONFLICT(flash_sale_id, product_id) DO UPDATE SET 
        discount_percentage = ?, updated_at = NOW()
      `;

      await new Promise<void>((resolve, reject) => {
        db.run(
          query,
          [sale_id, product_id, override_discount_percentage, override_discount_percentage],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } catch (error) {
      console.error(`Error setting price override:`, error);
      throw error;
    }
  }

  /**
   * Remove price override
   */
  static async removePriceOverride(saleId: string, productId: string): Promise<void> {
    try {
      const query = `
        DELETE FROM flash_sale_price_overrides 
        WHERE flash_sale_id = ? AND product_id = ?
      `;

      await new Promise<void>((resolve, reject) => {
        db.run(query, [saleId, productId], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (error) {
      console.error(`Error removing price override:`, error);
      throw error;
    }
  }

  /**
   * Get all price overrides for a sale
   */
  static async getPriceOverrides(saleId: string): Promise<PriceOverride[]> {
    try {
      const query = `
        SELECT flash_sale_id as sale_id, product_id, discount_percentage as override_discount_percentage
        FROM flash_sale_price_overrides
        WHERE flash_sale_id = ?
      `;

      const overrides = await new Promise<PriceOverride[]>((resolve, reject) => {
        db.all(query, [saleId], (err, rows) => {
          if (err) reject(err);
          else resolve((rows || []) as PriceOverride[]);
        });
      });

      return overrides;
    } catch (error) {
      console.error(`Error fetching price overrides for sale ${saleId}:`, error);
      throw error;
    }
  }

  /**
   * Get current sale status
   */
  static async getSaleStatus(saleId: string): Promise<any> {
    try {
      const query = `
        SELECT 
          id, name, status, start_time, end_time, 
          discount_percentage, remaining_inventory, total_inventory,
          max_purchases_per_user, updated_at
        FROM flash_sales
        WHERE id = ?
      `;

      const sale = await new Promise<any>((resolve, reject) => {
        db.get(query, [saleId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });

      if (!sale) {
        throw new Error(`Sale ${saleId} not found`);
      }

      return {
        ...sale,
        inventory_status: sale.remaining_inventory > 0 ? 'available' : 'out_of_stock',
        time_until_start: new Date(sale.start_time).getTime() - new Date().getTime(),
        time_until_end: new Date(sale.end_time).getTime() - new Date().getTime(),
      };
    } catch (error) {
      console.error(`Error getting sale status for ${saleId}:`, error);
      throw error;
    }
  }
}

export default SaleManagementService;
