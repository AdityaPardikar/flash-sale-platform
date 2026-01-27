import pool from '../utils/database';
import { FlashSale } from '../models';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import { saleTimingService } from './saleTimingService';

export interface CreateFlashSaleDto {
  product_id: string;
  flash_price: number;
  quantity_available: number;
  start_time: Date;
  end_time: Date;
}

export interface UpdateFlashSaleDto {
  flash_price?: number;
  quantity_available?: number;
  start_time?: Date;
  end_time?: Date;
  status?: 'upcoming' | 'active' | 'completed' | 'cancelled';
}

export type FlashSaleStatus = 'upcoming' | 'active' | 'completed' | 'cancelled';

export class FlashSaleService {
  /**
   * Get all flash sales with optional status filter
   */
  async getAllFlashSales(status?: FlashSaleStatus): Promise<FlashSale[]> {
    let query = `
      SELECT fs.*, p.name as product_name, p.base_price, p.image_url
      FROM flash_sales fs
      JOIN products p ON fs.product_id = p.id
    `;

    const params: any[] = [];

    if (status) {
      query += ' WHERE fs.status = $1';
      params.push(status);
    }

    query += ' ORDER BY fs.start_time DESC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single flash sale by ID
   */
  async getFlashSaleById(saleId: string): Promise<FlashSale | null> {
    const result = await pool.query(
      `SELECT fs.*, p.name as product_name, p.base_price, p.image_url
       FROM flash_sales fs
       JOIN products p ON fs.product_id = p.id
       WHERE fs.id = $1`,
      [saleId]
    );

    return result.rows[0] || null;
  }

  /**
   * Get all active flash sales
   */
  async getActiveFlashSales(): Promise<FlashSale[]> {
    const result = await pool.query(
      `SELECT fs.*, p.name as product_name, p.base_price, p.image_url
       FROM flash_sales fs
       JOIN products p ON fs.product_id = p.id
       WHERE fs.status = 'active'
       AND fs.start_time <= NOW()
       AND fs.end_time > NOW()
       ORDER BY fs.end_time ASC`
    );

    return result.rows;
  }

  /**
   * Get upcoming flash sales
   */
  async getUpcomingFlashSales(limit: number = 10): Promise<FlashSale[]> {
    const result = await pool.query(
      `SELECT fs.*, p.name as product_name, p.base_price, p.image_url
       FROM flash_sales fs
       JOIN products p ON fs.product_id = p.id
       WHERE fs.status = 'upcoming'
       AND fs.start_time > NOW()
       ORDER BY fs.start_time ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Create a new flash sale
   */
  async createFlashSale(data: CreateFlashSaleDto): Promise<FlashSale> {
    // Validation
    await this.validateFlashSaleData(data);

    const saleId = uuidv4();
    const status = this.determineStatus(data.start_time, data.end_time);

    const result = await pool.query(
      `INSERT INTO flash_sales 
       (id, product_id, flash_price, quantity_available, start_time, end_time, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [
        saleId,
        data.product_id,
        data.flash_price,
        data.quantity_available,
        data.start_time,
        data.end_time,
        status,
      ]
    );

    const sale = result.rows[0];

    // Cache active sales in Redis
    if (status === 'active') {
      await this.cacheActiveSale(sale);
    }

    return sale;
  }

  /**
   * Update an existing flash sale
   */
  async updateFlashSale(saleId: string, data: UpdateFlashSaleDto): Promise<FlashSale | null> {
    const existingSale = await this.getFlashSaleById(saleId);
    if (!existingSale) {
      return null;
    }

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.flash_price !== undefined) {
      if (data.flash_price < 0) {
        throw new Error('Flash price cannot be negative');
      }
      updates.push(`flash_price = $${paramCount}`);
      params.push(data.flash_price);
      paramCount++;
    }

    if (data.quantity_available !== undefined) {
      if (data.quantity_available < 0) {
        throw new Error('Quantity cannot be negative');
      }
      updates.push(`quantity_available = $${paramCount}`);
      params.push(data.quantity_available);
      paramCount++;
    }

    if (data.start_time !== undefined) {
      updates.push(`start_time = $${paramCount}`);
      params.push(data.start_time);
      paramCount++;
    }

    if (data.end_time !== undefined) {
      updates.push(`end_time = $${paramCount}`);
      params.push(data.end_time);
      paramCount++;
    }

    if (data.status !== undefined) {
      updates.push(`status = $${paramCount}`);
      params.push(data.status);
      paramCount++;
    }

    if (updates.length === 0) {
      return existingSale;
    }

    params.push(saleId);
    const query = `
      UPDATE flash_sales
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    const updatedSale = result.rows[0];

    // Update Redis cache
    if (updatedSale.status === 'active') {
      await this.cacheActiveSale(updatedSale);
    } else {
      await this.removeFromCache(saleId);
    }

    return updatedSale;
  }

  /**
   * Cancel a flash sale
   */
  async cancelFlashSale(saleId: string): Promise<FlashSale | null> {
    const sale = await this.getFlashSaleById(saleId);
    if (!sale) {
      return null;
    }

    if (sale.status === 'completed' || sale.status === 'cancelled') {
      throw new Error('Cannot cancel a completed or already cancelled sale');
    }

    const result = await pool.query(
      `UPDATE flash_sales SET status = 'cancelled' WHERE id = $1 RETURNING *`,
      [saleId]
    );

    await this.removeFromCache(saleId);

    return result.rows[0];
  }

  /**
   * Update sale statuses based on current time (background job)
   */
  async updateSaleStatuses(): Promise<void> {
    const now = new Date();

    // Activate upcoming sales that should start
    await pool.query(
      `UPDATE flash_sales 
       SET status = 'active' 
       WHERE status = 'upcoming' 
       AND start_time <= $1 
       AND end_time > $1`,
      [now]
    );

    // Complete active sales that have ended
    await pool.query(
      `UPDATE flash_sales 
       SET status = 'completed' 
       WHERE status = 'active' 
       AND end_time <= $1`,
      [now]
    );

    // Refresh Redis cache with current active sales
    await this.refreshActiveSalesCache();
  }

  /**
   * Get time remaining for a sale
   */
  getTimeRemaining(sale: FlashSale): {
    status: string;
    timeInSeconds: number;
    isActive: boolean;
  } {
    const now = new Date().getTime();
    const startTime = new Date(sale.start_time).getTime();
    const endTime = new Date(sale.end_time).getTime();

    if (now < startTime) {
      return {
        status: 'upcoming',
        timeInSeconds: Math.floor((startTime - now) / 1000),
        isActive: false,
      };
    } else if (now >= startTime && now < endTime) {
      return {
        status: 'active',
        timeInSeconds: Math.floor((endTime - now) / 1000),
        isActive: true,
      };
    } else {
      return {
        status: 'ended',
        timeInSeconds: 0,
        isActive: false,
      };
    }
  }

  /**
   * Calculate discount percentage
   */
  calculateDiscountPercentage(basePrice: number, flashPrice: number): number {
    if (basePrice <= 0) return 0;
    const discount = ((basePrice - flashPrice) / basePrice) * 100;
    return Math.round(discount * 10) / 10; // Round to 1 decimal place
  }

  /**
   * Get flash sale statistics
   */
  async getSaleStatistics(saleId: string): Promise<{
    totalSold: number;
    totalRevenue: number;
    remainingQuantity: number;
    conversionRate: number;
  }> {
    const sale = await this.getFlashSaleById(saleId);
    if (!sale) {
      throw new Error('Sale not found');
    }

    // Get orders for this sale
    const ordersResult = await pool.query(
      `SELECT COUNT(*)::int as count, COALESCE(SUM(quantity), 0)::int as total_quantity, 
       COALESCE(SUM(total_price), 0)::numeric as total_revenue
       FROM orders 
       WHERE flash_sale_id = $1 AND status = 'completed'`,
      [saleId]
    );

    const orders = ordersResult.rows[0];

    // Get queue entries for conversion rate
    const queueResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM queue_entries WHERE flash_sale_id = $1`,
      [saleId]
    );

    const totalInQueue = queueResult.rows[0].count;
    const conversionRate = totalInQueue > 0 ? (orders.count / totalInQueue) * 100 : 0;

    return {
      totalSold: orders.total_quantity,
      totalRevenue: parseFloat(orders.total_revenue),
      remainingQuantity: sale.quantity_available,
      conversionRate: Math.round(conversionRate * 10) / 10,
    };
  }

  /**
   * Validate flash sale data
   */
  private async validateFlashSaleData(data: CreateFlashSaleDto): Promise<void> {
    // Check if product exists
    const productResult = await pool.query('SELECT id, base_price FROM products WHERE id = $1', [
      data.product_id,
    ]);

    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const product = productResult.rows[0];

    // Validate flash price is less than base price
    if (data.flash_price >= product.base_price) {
      throw new Error('Flash price must be less than base price');
    }

    if (data.flash_price < 0) {
      throw new Error('Flash price cannot be negative');
    }

    if (data.quantity_available <= 0) {
      throw new Error('Quantity must be greater than zero');
    }

    // Validate timing
    const startTime = new Date(data.start_time);
    const endTime = new Date(data.end_time);

    if (startTime >= endTime) {
      throw new Error('End time must be after start time');
    }

    const minDuration = 5 * 60 * 1000; // 5 minutes
    if (endTime.getTime() - startTime.getTime() < minDuration) {
      throw new Error('Sale duration must be at least 5 minutes');
    }
  }

  /**
   * Determine sale status based on timing
   */
  private determineStatus(startTime: Date, endTime: Date): FlashSaleStatus {
    const now = new Date();
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (now < start) {
      return 'upcoming';
    } else if (now >= start && now < end) {
      return 'active';
    } else {
      return 'completed';
    }
  }

  /**
   * Cache active sale in Redis with intelligent TTL
   */
  private async cacheActiveSale(sale: FlashSale): Promise<void> {
    const key = `sale:${sale.id}`;

    // Calculate TTL based on sale end time
    const now = new Date();
    const endTime = new Date(sale.end_time);
    const remainingSeconds = Math.floor((endTime.getTime() - now.getTime()) / 1000);

    // Use remaining time or max 1 hour, whichever is smaller
    const ttl = Math.min(remainingSeconds > 0 ? remainingSeconds : 3600, 3600);

    await redisClient.setex(key, ttl, JSON.stringify(sale));
    await redisClient.sadd('active_sales', sale.id);
    await redisClient.expire('active_sales', ttl);
  }

  /**
   * Remove sale from Redis cache
   */
  private async removeFromCache(saleId: string): Promise<void> {
    const key = `sale:${saleId}`;
    await redisClient.del(key);
    await redisClient.srem('active_sales', saleId);
  }

  /**
   * Refresh all active sales in Redis
   */
  private async refreshActiveSalesCache(): Promise<void> {
    const activeSales = await this.getActiveFlashSales();

    // Clear existing set
    await redisClient.del('active_sales');

    // Cache each active sale
    for (const sale of activeSales) {
      await this.cacheActiveSale(sale);
    }
  }

  /**
   * Warm up cache on server start
   */
  async warmCache(): Promise<void> {
    console.log('Warming up flash sales cache...');

    try {
      // Cache active sales
      const activeSales = await this.getActiveFlashSales();
      for (const sale of activeSales) {
        await this.cacheActiveSale(sale);
      }

      // Cache upcoming sales (next 24 hours)
      const upcomingSales = await this.getUpcomingFlashSales();
      const next24Hours = new Date();
      next24Hours.setHours(next24Hours.getHours() + 24);

      for (const sale of upcomingSales) {
        const saleStart = new Date(sale.start_time);
        if (saleStart <= next24Hours) {
          const key = `sale:upcoming:${sale.id}`;
          await redisClient.setex(key, 3600, JSON.stringify(sale)); // Cache for 1 hour
        }
      }

      console.log(
        `Cached ${activeSales.length} active sales and ${upcomingSales.length} upcoming sales`
      );
    } catch (error) {
      console.error('Error warming cache:', error);
    }
  }

  /**
   * Get cached active sale or fetch from DB
   */
  async getCachedSale(saleId: string): Promise<FlashSale | null> {
    try {
      // Try to get from cache first
      const cachedData = await redisClient.get(`sale:${saleId}`);
      if (cachedData) {
        return JSON.parse(cachedData);
      }

      // Fallback to database
      const sale = await this.getFlashSaleById(saleId);
      if (sale && sale.status === 'active') {
        await this.cacheActiveSale(sale);
      }

      return sale;
    } catch (error) {
      console.error('Error getting cached sale:', error);
      return await this.getFlashSaleById(saleId);
    }
  }

  /**
   * Invalidate cache for a sale
   */
  async invalidateCache(saleId: string): Promise<void> {
    await this.removeFromCache(saleId);
    await redisClient.del(`sale:upcoming:${saleId}`);
  }
}

export default new FlashSaleService();
