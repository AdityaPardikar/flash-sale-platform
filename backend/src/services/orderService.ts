import pool from '../utils/database';
import { v4 as uuidv4 } from 'uuid';
import { inventoryManager } from './inventoryManager';
import { queueService } from './queueService';
import { analyticsService } from './analyticsService';
import { Order } from '../models';

export interface CreateOrderInput {
  userId: string;
  saleId: string;
  productId: string;
  quantity: number;
  shippingAddress?: ShippingAddress;
}

export interface ShippingAddress {
  fullName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
}

export interface OrderDetails extends Order {
  product_name?: string;
  product_image?: string;
  user_email?: string;
  flash_price?: number;
}

export interface OrderWithHistory {
  order: OrderDetails;
  history: OrderHistoryEntry[];
}

export interface OrderHistoryEntry {
  id: string;
  old_status: string;
  new_status: string;
  change_reason: string;
  changed_at: Date;
  changed_by: string | null;
}

export interface CheckoutSession {
  orderId: string;
  orderNumber: string;
  userId: string;
  saleId: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  reservationExpiresAt: Date;
  status: 'pending' | 'reserved' | 'expired';
}

class OrderService {
  private readonly CHECKOUT_TIMEOUT_SECONDS = 300; // 5 minutes

  /**
   * Initiate checkout - Creates pending order and reserves inventory
   */
  async initiateCheckout(input: CreateOrderInput): Promise<CheckoutSession> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Verify user has active checkout session from queue
      const hasSession = await queueService.isInQueue(input.userId, input.saleId);
      if (!hasSession) {
        // For now, allow checkout without queue requirement (can be enforced later)
        console.warn(`User ${input.userId} attempting checkout without queue session`);
      }

      // Get sale details
      const saleResult = await client.query(
        `SELECT fs.*, p.name as product_name, p.base_price
         FROM flash_sales fs
         JOIN products p ON fs.product_id = p.id
         WHERE fs.id = $1 AND fs.status = 'active'`,
        [input.saleId]
      );

      if (saleResult.rows.length === 0) {
        throw new Error('Flash sale not found or not active');
      }

      const sale = saleResult.rows[0];

      // Verify product matches sale
      if (sale.product_id !== input.productId) {
        throw new Error('Product does not match flash sale');
      }

      // Check if user already has pending order for this sale
      const existingOrder = await client.query(
        `SELECT id FROM orders 
         WHERE user_id = $1 AND flash_sale_id = $2 AND status IN ('pending', 'processing')`,
        [input.userId, input.saleId]
      );

      if (existingOrder.rows.length > 0) {
        throw new Error('You already have a pending order for this sale');
      }

      // Reserve inventory atomically
      const reservation = await inventoryManager.reserveInventory(
        input.saleId,
        input.userId,
        input.quantity
      );

      if (!reservation.success) {
        await client.query('ROLLBACK');
        throw new Error('Product out of stock');
      }

      // Generate order ID and number
      const orderId = uuidv4();
      const orderNumber = `FS-${Date.now()}-${input.userId.substring(0, 8).toUpperCase()}`;

      // Calculate pricing
      const unitPrice = parseFloat(sale.flash_price);
      const totalAmount = unitPrice * input.quantity;

      // Create order in database
      await client.query(
        `INSERT INTO orders (
          id, order_number, user_id, flash_sale_id, product_id,
          quantity, unit_price, total_amount, status, payment_status,
          shipping_address, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)`,
        [
          orderId,
          orderNumber,
          input.userId,
          input.saleId,
          input.productId,
          input.quantity,
          unitPrice,
          totalAmount,
          'pending',
          'pending',
          input.shippingAddress ? JSON.stringify(input.shippingAddress) : null,
        ]
      );

      // Create order history entry
      await client.query(
        `INSERT INTO order_history (id, order_id, old_status, new_status, change_reason, changed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uuidv4(), orderId, null, 'pending', 'Order initiated']
      );

      await client.query('COMMIT');

      // Track analytics
      await analyticsService.trackEvent(
        'order_initiated',
        input.userId,
        input.saleId,
        input.productId,
        {
          orderId,
          orderNumber,
          quantity: input.quantity,
          totalAmount,
        }
      );

      // Schedule automatic expiry
      setTimeout(async () => {
        await this.handleExpiredCheckout(orderId);
      }, this.CHECKOUT_TIMEOUT_SECONDS * 1000);

      const expiresAt = new Date(Date.now() + this.CHECKOUT_TIMEOUT_SECONDS * 1000);

      return {
        orderId,
        orderNumber,
        userId: input.userId,
        saleId: input.saleId,
        productId: input.productId,
        quantity: input.quantity,
        unitPrice,
        totalAmount,
        reservationExpiresAt: expiresAt,
        status: 'reserved',
      };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error initiating checkout:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Confirm order after successful payment
   */
  async confirmOrder(
    orderId: string,
    userId: string,
    paymentId: string,
    paymentDetails?: Record<string, unknown>
  ): Promise<OrderDetails> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get order details
      const orderResult = await client.query(
        `SELECT o.*, p.name as product_name, p.image_url as product_image
         FROM orders o
         JOIN products p ON o.product_id = p.id
         WHERE o.id = $1 AND o.user_id = $2`,
        [orderId, userId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      if (order.status !== 'pending') {
        throw new Error(`Order cannot be confirmed. Current status: ${order.status}`);
      }

      // Update order status
      await client.query(
        `UPDATE orders 
         SET status = $1, payment_status = $2, payment_id = $3, 
             payment_details = $4, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        ['completed', 'completed', paymentId, JSON.stringify(paymentDetails || {}), orderId]
      );

      // Confirm inventory reservation (removes it, inventory already decremented)
      await inventoryManager.confirmPurchase(order.flash_sale_id, userId);

      // Update queue entry status if exists
      await client.query(
        `UPDATE queue_entries 
         SET status = 'purchased', updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND flash_sale_id = $2`,
        [userId, order.flash_sale_id]
      );

      // Create order history entry
      await client.query(
        `INSERT INTO order_history (id, order_id, old_status, new_status, change_reason, changed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uuidv4(), orderId, 'pending', 'completed', 'Payment completed successfully']
      );

      await client.query('COMMIT');

      // Track analytics
      await analyticsService.trackEvent(
        'order_completed',
        userId,
        order.flash_sale_id,
        order.product_id,
        {
          orderId,
          paymentId,
          totalAmount: order.total_amount,
        }
      );

      console.log(`Order ${orderId} confirmed successfully`);

      return orderResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error confirming order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    orderId: string,
    userId: string,
    reason: string,
    isSystem: boolean = false
  ): Promise<boolean> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get order
      const orderResult = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, userId]
      );

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const order = orderResult.rows[0];

      if (!['pending', 'processing'].includes(order.status)) {
        throw new Error(`Order cannot be cancelled. Current status: ${order.status}`);
      }

      // Update order status
      await client.query(
        `UPDATE orders 
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [orderId]
      );

      // Release inventory reservation
      await inventoryManager.releaseReservation(order.flash_sale_id, userId);

      // Create history entry
      await client.query(
        `INSERT INTO order_history (id, order_id, old_status, new_status, change_reason, changed_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [uuidv4(), orderId, order.status, 'cancelled', reason]
      );

      await client.query('COMMIT');

      // Track analytics
      await analyticsService.trackEvent(
        'order_cancelled',
        userId,
        order.flash_sale_id,
        order.product_id,
        {
          orderId,
          reason,
          isSystem,
        }
      );

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error cancelling order:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Handle expired checkout (user didn't complete payment in time)
   */
  async handleExpiredCheckout(orderId: string): Promise<void> {
    try {
      const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);

      if (result.rows.length === 0) {
        return;
      }

      const order = result.rows[0];

      // Only cancel if still pending
      if (order.status === 'pending') {
        await this.cancelOrder(orderId, order.user_id, 'Checkout session expired', true);
        console.log(`Order ${orderId} expired and cancelled automatically`);
      }
    } catch (error) {
      console.error('Error handling expired checkout:', error);
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(orderId: string, userId: string): Promise<OrderDetails | null> {
    try {
      const result = await pool.query(
        `SELECT o.*, 
                p.name as product_name, 
                p.image_url as product_image,
                u.email as user_email,
                fs.flash_price
         FROM orders o
         JOIN products p ON o.product_id = p.id
         JOIN users u ON o.user_id = u.id
         JOIN flash_sales fs ON o.flash_sale_id = fs.id
         WHERE o.id = $1 AND o.user_id = $2`,
        [orderId, userId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
    } catch (error) {
      console.error('Error getting order:', error);
      throw error;
    }
  }

  /**
   * Get order with history
   */
  async getOrderWithHistory(orderId: string, userId: string): Promise<OrderWithHistory | null> {
    try {
      const order = await this.getOrderById(orderId, userId);

      if (!order) {
        return null;
      }

      const historyResult = await pool.query(
        `SELECT * FROM order_history 
         WHERE order_id = $1 
         ORDER BY changed_at ASC`,
        [orderId]
      );

      return {
        order,
        history: historyResult.rows,
      };
    } catch (error) {
      console.error('Error getting order with history:', error);
      throw error;
    }
  }

  /**
   * Get all orders for a user
   */
  async getUserOrders(
    userId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<OrderDetails[]> {
    try {
      const result = await pool.query(
        `SELECT o.*, 
                p.name as product_name, 
                p.image_url as product_image,
                fs.flash_price
         FROM orders o
         JOIN products p ON o.product_id = p.id
         JOIN flash_sales fs ON o.flash_sale_id = fs.id
         WHERE o.user_id = $1
         ORDER BY o.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      return result.rows;
    } catch (error) {
      console.error('Error getting user orders:', error);
      throw error;
    }
  }

  /**
   * Get orders by sale ID (admin)
   */
  async getOrdersBySale(
    saleId: string,
    status?: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<OrderDetails[]> {
    try {
      let query = `
        SELECT o.*, 
               p.name as product_name, 
               p.image_url as product_image,
               u.email as user_email
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users u ON o.user_id = u.id
        WHERE o.flash_sale_id = $1
      `;

      const params: (string | number)[] = [saleId];

      if (status) {
        query += ` AND o.status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      return result.rows;
    } catch (error) {
      console.error('Error getting orders by sale:', error);
      throw error;
    }
  }

  /**
   * Get order statistics for a sale
   */
  async getOrderStatsBySale(saleId: string): Promise<{
    totalOrders: number;
    completedOrders: number;
    pendingOrders: number;
    cancelledOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_orders,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN total_amount ELSE 0 END), 0) as total_revenue,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN total_amount ELSE NULL END), 0) as avg_order_value
         FROM orders
         WHERE flash_sale_id = $1`,
        [saleId]
      );

      const row = result.rows[0];

      return {
        totalOrders: parseInt(row.total_orders, 10),
        completedOrders: parseInt(row.completed_orders || '0', 10),
        pendingOrders: parseInt(row.pending_orders || '0', 10),
        cancelledOrders: parseInt(row.cancelled_orders || '0', 10),
        totalRevenue: parseFloat(row.total_revenue || '0'),
        averageOrderValue: parseFloat(row.avg_order_value || '0'),
      };
    } catch (error) {
      console.error('Error getting order stats:', error);
      throw error;
    }
  }

  /**
   * Update order status with history tracking
   */
  async updateOrderStatus(
    orderId: string,
    newStatus: string,
    reason: string,
    changedBy?: string
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Get current status
      const orderResult = await client.query('SELECT status FROM orders WHERE id = $1', [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error('Order not found');
      }

      const oldStatus = orderResult.rows[0].status;

      // Update status
      await client.query(
        `UPDATE orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
        [newStatus, orderId]
      );

      // Create history entry
      await client.query(
        `INSERT INTO order_history (id, order_id, old_status, new_status, change_reason, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [uuidv4(), orderId, oldStatus, newStatus, reason, changedBy || null]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

// Export singleton instance
export const orderService = new OrderService();
export default orderService;
