import { Request, Response } from 'express';
import pool from '../utils/database';
import { queueService } from '../services/queueService';
import { realtimeService } from '../services/realtimeService';

export class AdminController {
  /**
   * Get dashboard overview
   */
  async getDashboardOverview(_req: Request, res: Response): Promise<void> {
    try {
      const salesResult = await pool.query(`
        SELECT
          COUNT(*) as total_sales,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_sales,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sales,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_sales
        FROM flash_sales
      `);

      const ordersResult = await pool.query(`
        SELECT
          COUNT(*) as total_orders,
          COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
          COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
        FROM orders
      `);

      const usersResult = await pool.query(`
        SELECT COUNT(*) as total_users FROM users
      `);

      res.json({
        sales: salesResult.rows[0],
        orders: ordersResult.rows[0],
        users: usersResult.rows[0],
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch dashboard overview', details: String(error) });
    }
  }

  /**
   * Get all sales with metrics
   */
  async getAllSalesMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query(`
        SELECT
          fs.id,
          fs.name,
          fs.status,
          fs.start_time,
          fs.end_time,
          fs.quantity_available,
          COUNT(qe.id) as queued_users,
          COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders
        FROM flash_sales fs
        LEFT JOIN queue_entries qe ON fs.id = qe.flash_sale_id
        LEFT JOIN orders o ON fs.id = o.sale_id AND o.status = 'completed'
        GROUP BY fs.id
        ORDER BY fs.created_at DESC
      `);

      res.json({
        sales: result.rows,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch sales metrics', details: String(error) });
    }
  }

  /**
   * Get queue details for a sale
   */
  async getQueueDetails(req: Request, res: Response): Promise<void> {
    try {
      const { saleId } = req.params;
      const limit = parseInt(req.query.limit as string, 10) || 100;

      const details = await realtimeService.getQueueDetails(saleId, limit);

      res.json(details);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch queue details', details: String(error) });
    }
  }

  /**
   * Remove user from queue (admin action)
   */
  async removeFromQueue(req: Request, res: Response): Promise<void> {
    try {
      const { saleId, userId } = req.body;

      const success = await queueService.leaveQueue(userId, saleId);

      if (!success) {
        res.status(400).json({ error: 'Failed to remove user from queue' });
        return;
      }

      res.json({
        success: true,
        message: `User ${userId} removed from queue`,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove user from queue', details: String(error) });
    }
  }

  /**
   * Update sale status (admin action)
   */
  async updateSaleStatus(req: Request, res: Response): Promise<void> {
    try {
      const { saleId } = req.params;
      const { status } = req.body;

      const validStatuses = ['upcoming', 'active', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }

      const result = await pool.query(
        'UPDATE flash_sales SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
        [status, saleId]
      );

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Sale not found' });
        return;
      }

      // Broadcast update via WebSocket
      realtimeService.broadcastSaleStatusChange(saleId, status);

      res.json({
        success: true,
        sale: result.rows[0],
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update sale status', details: String(error) });
    }
  }

  /**
   * Get live metrics for a sale
   */
  async getLiveMetrics(req: Request, res: Response): Promise<void> {
    try {
      const { saleId } = req.params;
      const metrics = await realtimeService.getLiveMetrics(saleId);

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch live metrics', details: String(error) });
    }
  }

  /**
   * Get user activity logs
   */
  async getUserActivityLogs(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string, 10) || 50;

      const result = await pool.query(
        `
        SELECT
          ae.id,
          ae.event_type,
          ae.sale_id,
          ae.product_id,
          ae.metadata,
          ae.created_at
        FROM analytics_events ae
        WHERE ae.user_id = $1
        ORDER BY ae.created_at DESC
        LIMIT $2
      `,
        [userId, limit]
      );

      res.json({
        userId,
        logs: result.rows,
        total: result.rowCount,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch activity logs', details: String(error) });
    }
  }

  /**
   * Get sales performance report
   */
  async getPerformanceReport(_req: Request, res: Response): Promise<void> {
    try {
      const result = await pool.query(`
        SELECT
          fs.id,
          fs.name,
          fs.status,
          fs.quantity_available as initial_stock,
          fs.quantity_available - COALESCE(inventory_reserved, 0) as remaining_stock,
          COALESCE(inventory_reserved, 0) as sold_units,
          COALESCE(inventory_reserved, 0)::float / NULLIF(fs.quantity_available, 0) * 100 as stock_sold_percentage,
          COALESCE(total_revenue, 0) as total_revenue,
          COUNT(DISTINCT qe.user_id) as total_queue_users,
          COUNT(DISTINCT o.id) as total_orders
        FROM flash_sales fs
        LEFT JOIN (
          SELECT flash_sale_id, COUNT(*) as inventory_reserved
          FROM queue_entries
          WHERE status IN ('reserved', 'purchased')
          GROUP BY flash_sale_id
        ) i ON fs.id = i.flash_sale_id
        LEFT JOIN (
          SELECT sale_id, SUM(total_price) as total_revenue
          FROM orders
          WHERE status = 'completed'
          GROUP BY sale_id
        ) r ON fs.id = r.sale_id
        LEFT JOIN queue_entries qe ON fs.id = qe.flash_sale_id
        LEFT JOIN orders o ON fs.id = o.sale_id AND o.status = 'completed'
        GROUP BY fs.id
        ORDER BY fs.created_at DESC
      `);

      res.json({
        reports: result.rows,
        timestamp: new Date(),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch performance report', details: String(error) });
    }
  }
}

export const adminController = new AdminController();
