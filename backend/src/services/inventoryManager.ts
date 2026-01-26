import redisClient from '../utils/redis';
import { pool } from '../utils/database';
import { redisKeys } from '../config/redisKeys';

export interface InventoryReservation {
  saleId: string;
  userId: string;
  quantity: number;
  expiresAt: Date;
}

export class InventoryManager {
  private readonly RESERVATION_TTL = 300; // 5 minutes in seconds

  /**
   * Initialize inventory for a flash sale in Redis
   */
  async initializeSaleInventory(saleId: string, quantity: number): Promise<void> {
    const key = redisKeys.inventory(saleId);
    await redisClient.set(key, quantity.toString());
  }

  /**
   * Get current available inventory for a sale
   */
  async getAvailableInventory(saleId: string): Promise<number> {
    const key = redisKeys.inventory(saleId);
    const value = await redisClient.get(key);

    if (value === null) {
      // If not in Redis, fetch from database and cache
      const result = await pool.query('SELECT quantity_available FROM flash_sales WHERE id = $1', [
        saleId,
      ]);

      if (result.rows.length === 0) {
        throw new Error('Flash sale not found');
      }

      const quantity = result.rows[0].quantity_available;
      await this.initializeSaleInventory(saleId, quantity);
      return quantity;
    }

    return parseInt(value, 10);
  }

  /**
   * Reserve inventory for a user (atomic operation)
   */
  async reserveInventory(
    saleId: string,
    userId: string,
    quantity: number = 1
  ): Promise<{ success: boolean; remaining: number }> {
    const inventoryKey = redisKeys.inventory(saleId);
    const reservationKey = redisKeys.reservation(saleId, userId);

    // Check if user already has a reservation
    const existingReservation = await redisClient.get(reservationKey);
    if (existingReservation) {
      return {
        success: false,
        remaining: await this.getAvailableInventory(saleId),
      };
    }

    // Use Lua script for atomic decrement
    const luaScript = `
      local inventory_key = KEYS[1]
      local quantity = tonumber(ARGV[1])
      
      local current = tonumber(redis.call('GET', inventory_key) or '0')
      
      if current >= quantity then
        redis.call('DECRBY', inventory_key, quantity)
        return {1, current - quantity}
      else
        return {0, current}
      end
    `;

    const result = (await redisClient.eval(luaScript, 1, inventoryKey, quantity)) as [
      number,
      number,
    ];
    const [success, remaining] = result;

    if (success === 1) {
      // Store reservation with TTL
      const reservation: InventoryReservation = {
        saleId,
        userId,
        quantity,
        expiresAt: new Date(Date.now() + this.RESERVATION_TTL * 1000),
      };

      await redisClient.setex(reservationKey, this.RESERVATION_TTL, JSON.stringify(reservation));
    }

    return {
      success: success === 1,
      remaining,
    };
  }

  /**
   * Release a reservation (user cancelled or reservation expired)
   */
  async releaseReservation(saleId: string, userId: string): Promise<boolean> {
    const reservationKey = redisKeys.reservation(saleId, userId);
    const reservationData = await redisClient.get(reservationKey);

    if (!reservationData) {
      return false; // No reservation found
    }

    const reservation: InventoryReservation = JSON.parse(reservationData);
    const inventoryKey = redisKeys.inventory(saleId);

    // Return inventory
    await redisClient.incrby(inventoryKey, reservation.quantity);

    // Delete reservation
    await redisClient.del(reservationKey);

    return true;
  }

  /**
   * Confirm a purchase (move from reservation to sold)
   */
  async confirmPurchase(saleId: string, userId: string): Promise<boolean> {
    const reservationKey = redisKeys.reservation(saleId, userId);
    const reservationData = await redisClient.get(reservationKey);

    if (!reservationData) {
      return false; // No reservation found
    }

    // Delete reservation (inventory already decremented during reserve)
    await redisClient.del(reservationKey);

    // Update database
    await pool.query(
      'UPDATE flash_sales SET quantity_available = quantity_available - $1 WHERE id = $2',
      [JSON.parse(reservationData).quantity, saleId]
    );

    return true;
  }

  /**
   * Get user's current reservation for a sale
   */
  async getUserReservation(saleId: string, userId: string): Promise<InventoryReservation | null> {
    const reservationKey = redisKeys.reservation(saleId, userId);
    const reservationData = await redisClient.get(reservationKey);

    if (!reservationData) {
      return null;
    }

    return JSON.parse(reservationData);
  }

  /**
   * Check if user has an active reservation
   */
  async hasActiveReservation(saleId: string, userId: string): Promise<boolean> {
    const reservationKey = redisKeys.reservation(saleId, userId);
    const exists = await redisClient.exists(reservationKey);
    return exists === 1;
  }

  /**
   * Get reservation time remaining
   */
  async getReservationTTL(saleId: string, userId: string): Promise<number> {
    const reservationKey = redisKeys.reservation(saleId, userId);
    const ttl = await redisClient.ttl(reservationKey);
    return ttl;
  }

  /**
   * Sync inventory from database to Redis
   */
  async syncInventoryFromDatabase(saleId: string): Promise<void> {
    const result = await pool.query('SELECT quantity_available FROM flash_sales WHERE id = $1', [
      saleId,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Flash sale not found');
    }

    const quantity = result.rows[0].quantity_available;
    await this.initializeSaleInventory(saleId, quantity);
  }

  /**
   * Sync inventory from Redis to database (for persistence)
   */
  async syncInventoryToDatabase(saleId: string): Promise<void> {
    const available = await this.getAvailableInventory(saleId);

    await pool.query('UPDATE flash_sales SET quantity_available = $1 WHERE id = $2', [
      available,
      saleId,
    ]);
  }

  /**
   * Cleanup expired reservations (background job)
   */
  async cleanupExpiredReservations(): Promise<number> {
    // Redis automatically handles TTL expiration, but we can track for logging
    // This method is mainly for monitoring purposes
    let cleaned = 0;

    // Get all active sales
    const activeSales = await pool.query("SELECT id FROM flash_sales WHERE status = 'active'");

    for (const sale of activeSales.rows) {
      // Sync inventory to ensure consistency
      await this.syncInventoryToDatabase(sale.id);
      cleaned++;
    }

    return cleaned;
  }

  /**
   * Get inventory statistics for a sale
   */
  async getInventoryStats(saleId: string): Promise<{
    totalQuantity: number;
    availableQuantity: number;
    soldQuantity: number;
    reservedQuantity: number;
  }> {
    // Get total from database
    const saleResult = await pool.query(
      'SELECT quantity_available FROM flash_sales WHERE id = $1',
      [saleId]
    );

    if (saleResult.rows.length === 0) {
      throw new Error('Flash sale not found');
    }

    const totalFromDB = saleResult.rows[0].quantity_available;

    // Get available from Redis
    const available = await this.getAvailableInventory(saleId);

    // Get sold from orders
    const ordersResult = await pool.query(
      "SELECT COALESCE(SUM(quantity), 0)::int as sold FROM orders WHERE flash_sale_id = $1 AND status = 'completed'",
      [saleId]
    );

    const sold = ordersResult.rows[0].sold;

    // Calculate reserved (items that are temporarily held)
    const reserved = totalFromDB - available - sold;

    return {
      totalQuantity: totalFromDB + sold, // Original total quantity
      availableQuantity: available,
      soldQuantity: sold,
      reservedQuantity: Math.max(0, reserved),
    };
  }

  /**
   * Bulk release reservations for a sale (when sale ends)
   */
  async bulkReleaseReservations(saleId: string): Promise<number> {
    let released = 0;

    // Find all reservation keys for this sale
    const pattern = `reservation:${saleId}:*`;
    const keys = await redisClient.keys(pattern);

    for (const key of keys) {
      await redisClient.del(key);
      released++;
    }

    // Reset inventory from database
    await this.syncInventoryFromDatabase(saleId);

    return released;
  }
}

export default new InventoryManager();
