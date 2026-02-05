/**
 * Admin User Controller
 * Handles user management, status updates, and refund processing
 */

import { Request, Response } from 'express';
import { query } from '../utils/database';

export interface UserDetails {
  id: string;
  email: string;
  phone_number?: string;
  status: 'active' | 'suspended' | 'banned';
  total_purchases: number;
  total_spent: number;
  last_login: Date;
  created_at: Date;
  updated_at: Date;
}

export interface UserActivity {
  action_type: string;
  description: string;
  timestamp: Date;
  sale_id?: string;
  order_id?: string;
}

/**
 * GET /api/admin/users
 * List all users with pagination and search
 */
export async function listUsers(req: Request, res: Response): Promise<void> {
  try {
    const {
      search,
      status,
      limit = 50,
      offset = 0,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = req.query;

    let queryStr = `
      SELECT 
        u.id,
        u.email,
        u.phone_number,
        u.status,
        COUNT(DISTINCT o.id) as total_purchases,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        u.last_login,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (search) {
      queryStr += ` AND (u.email ILIKE $${params.length + 1} OR u.phone_number LIKE $${params.length + 2})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      queryStr += ` AND u.status = $${params.length + 1}`;
      params.push(status);
    }

    queryStr += ` GROUP BY u.id, u.email, u.phone_number, u.status, u.last_login, u.created_at, u.updated_at`;
    queryStr += ` ORDER BY ${sortBy} ${sortOrder}`;
    queryStr += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(queryStr, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM users WHERE 1=1`;
    const countParams: any[] = [];

    if (search) {
      countQuery += ` AND (email ILIKE $${countParams.length + 1} OR phone_number LIKE $${countParams.length + 2})`;
      countParams.push(`%${search}%`, `%${search}%`);
    }

    if (status) {
      countQuery += ` AND status = $${countParams.length + 1}`;
      countParams.push(status);
    }

    const countResult = await query(countQuery, countParams);
    const totalCount = parseInt(countResult.rows[0].total);

    res.json({
      users: result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        phone_number: row.phone_number,
        status: row.status,
        total_purchases: parseInt(row.total_purchases) || 0,
        total_spent: parseFloat(row.total_spent) || 0,
        last_login: row.last_login,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error listing users:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
}

/**
 * GET /api/admin/users/:id
 * Get specific user details
 */
export async function getUserDetails(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const userQuery = `
      SELECT 
        id,
        email,
        phone_number,
        status,
        last_login,
        created_at,
        updated_at
      FROM users
      WHERE id = $1
    `;
    const userResult = await query(userQuery, [id]);

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    // Get user stats
    const statsQuery = `
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(total_amount), 0) as total_spent
      FROM orders
      WHERE user_id = $1 AND status NOT IN ('cancelled', 'failed')
    `;
    const statsResult = await query(statsQuery, [id]);
    const stats = statsResult.rows[0];

    res.json({
      id: user.id,
      email: user.email,
      phone_number: user.phone_number,
      status: user.status,
      total_purchases: parseInt(stats.total_orders) || 0,
      total_spent: parseFloat(stats.total_spent) || 0,
      last_login: user.last_login,
      created_at: user.created_at,
      updated_at: user.updated_at,
    });
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
}

/**
 * PATCH /api/admin/users/:id/status
 * Update user status
 */
export async function updateUserStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!['active', 'suspended', 'banned'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const updateQuery = `
      UPDATE users
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, status
    `;
    const result = await query(updateQuery, [status, id]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Log activity
    const activityQuery = `
      INSERT INTO user_activity_log (user_id, action_type, description)
      VALUES ($1, $2, $3)
    `;
    await query(activityQuery, [
      id,
      'status_change',
      `User status changed to ${status}. Reason: ${reason || 'Not specified'}`,
    ]);

    res.json({
      id: result.rows[0].id,
      status: result.rows[0].status,
      message: 'User status updated successfully',
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({ error: 'Failed to update user status' });
  }
}

/**
 * GET /api/admin/users/:id/orders
 * Get user's order history
 */
export async function getUserOrders(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const ordersQuery = `
      SELECT
        o.id,
        o.sale_id,
        fs.name as sale_name,
        o.total_amount,
        o.status,
        o.created_at,
        o.updated_at
      FROM orders o
      LEFT JOIN flash_sales fs ON o.sale_id = fs.id
      WHERE o.user_id = $1
      ORDER BY o.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const ordersResult = await query(ordersQuery, [id, limit, offset]);

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM orders WHERE user_id = $1`;
    const countResult = await query(countQuery, [id]);
    const totalCount = parseInt(countResult.rows[0].total);

    res.json({
      orders: ordersResult.rows.map((row: any) => ({
        id: row.id,
        sale_id: row.sale_id,
        sale_name: row.sale_name,
        total_amount: parseFloat(row.total_amount),
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      pagination: {
        total: totalCount,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({ error: 'Failed to fetch user orders' });
  }
}

/**
 * POST /api/admin/users/:id/refund
 * Process refund for a user's order
 */
export async function processRefund(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { order_id, amount, reason } = req.body;

    if (!order_id || !amount || amount <= 0) {
      res.status(400).json({ error: 'Invalid order_id or refund amount' });
      return;
    }

    // Get order details
    const orderQuery = `
      SELECT id, total_amount, status, user_id
      FROM orders
      WHERE id = $1 AND user_id = $2
    `;
    const orderResult = await query(orderQuery, [order_id, id]);

    if (orderResult.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    const order = orderResult.rows[0];

    if (order.status === 'refunded') {
      res.status(400).json({ error: 'Order already refunded' });
      return;
    }

    if (amount > parseFloat(order.total_amount)) {
      res.status(400).json({ error: 'Refund amount exceeds order total' });
      return;
    }

    // Create refund record
    const refundQuery = `
      INSERT INTO refunds (order_id, user_id, amount, reason, status, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    const refundResult = await query(refundQuery, [order_id, id, amount, reason, 'processed']);

    // Update order status
    const updateOrderQuery = `
      UPDATE orders
      SET status = 'refunded', updated_at = NOW()
      WHERE id = $1
    `;
    await query(updateOrderQuery, [order_id]);

    // Log activity
    const activityQuery = `
      INSERT INTO user_activity_log (user_id, action_type, description)
      VALUES ($1, $2, $3)
    `;
    await query(activityQuery, [
      id,
      'refund_processed',
      `Refund of $${amount} processed for order ${order_id}. Reason: ${reason}`,
    ]);

    res.json({
      refund_id: refundResult.rows[0].id,
      order_id,
      amount,
      reason,
      status: 'processed',
      message: 'Refund processed successfully',
    });
  } catch (error) {
    console.error('Error processing refund:', error);
    res.status(500).json({ error: 'Failed to process refund' });
  }
}
