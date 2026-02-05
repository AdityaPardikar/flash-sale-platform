/**
 * Admin Queue Controller
 * Handles queue management, user admission, and queue statistics
 */

import { Request, Response } from 'express';
import { query } from '../utils/database';
import { getQueueLength, getQueuePosition, getQueueHead } from '../utils/redisOperations';
import { getAnalyticsCollector } from './analyticsCollector';

export interface QueueStats {
  sale_id: string;
  sale_name: string;
  total_in_queue: number;
  currently_waiting: number;
  admitted_count: number;
  dropped_count: number;
  avg_wait_time_ms: number;
  longest_wait_ms: number;
  admission_rate: number;
  created_at: Date;
}

export interface UserInQueue {
  queue_id: string;
  user_id: string;
  position: number;
  joined_at: Date;
  status: 'waiting' | 'admitted' | 'dropped';
  estimated_wait_ms: number;
}

/**
 * GET /api/admin/queues
 * List all active queues with statistics
 */
export async function getAllQueues(req: Request, res: Response): Promise<void> {
  try {
    const { sale_id, status } = req.query;

    let queryStr = `
      SELECT 
        fs.id,
        fs.name,
        COUNT(CASE WHEN qu.status = 'waiting' THEN 1 END) as waiting_count,
        COUNT(CASE WHEN qu.status = 'admitted' THEN 1 END) as admitted_count,
        COUNT(CASE WHEN qu.status = 'dropped' THEN 1 END) as dropped_count,
        COALESCE(AVG(EXTRACT(EPOCH FROM (CASE WHEN qu.status != 'waiting' THEN qu.updated_at ELSE NOW() END - qu.created_at)) * 1000), 0) as avg_wait_ms,
        COALESCE(MAX(EXTRACT(EPOCH FROM (CASE WHEN qu.status != 'waiting' THEN qu.updated_at ELSE NOW() END - qu.created_at)) * 1000), 0) as max_wait_ms,
        fs.status as sale_status,
        fs.start_time,
        fs.end_time
      FROM flash_sales fs
      LEFT JOIN queue_users qu ON fs.id = qu.sale_id
      WHERE fs.status IN ('active', 'paused')
    `;

    const params: any[] = [];

    if (sale_id) {
      queryStr += ` AND fs.id = $${params.length + 1}`;
      params.push(sale_id);
    }

    queryStr += ` GROUP BY fs.id, fs.name, fs.status, fs.start_time, fs.end_time
                ORDER BY waiting_count DESC`;

    const result = await query(queryStr, params);
    const queues = result.rows.map((row: any) => ({
      sale_id: row.id,
      sale_name: row.name,
      waiting_count: parseInt(row.waiting_count) || 0,
      admitted_count: parseInt(row.admitted_count) || 0,
      dropped_count: parseInt(row.dropped_count) || 0,
      avg_wait_ms: parseFloat(row.avg_wait_ms) || 0,
      max_wait_ms: parseFloat(row.max_wait_ms) || 0,
      sale_status: row.sale_status,
      start_time: row.start_time,
      end_time: row.end_time,
    }));

    res.json({
      total: queues.length,
      queues,
    });
  } catch (error) {
    console.error('Error fetching queues:', error);
    res.status(500).json({ error: 'Failed to fetch queues' });
  }
}

/**
 * GET /api/admin/queues/:saleId
 * Get detailed queue information for a specific sale
 */
export async function getQueueDetails(req: Request, res: Response): Promise<void> {
  try {
    const { saleId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Get sale info
    const saleQuery = `
      SELECT id, name, status FROM flash_sales WHERE id = $1
    `;
    const saleResult = await query(saleQuery, [saleId]);

    if (saleResult.rows.length === 0) {
      res.status(404).json({ error: 'Sale not found' });
      return;
    }

    const sale = saleResult.rows[0];

    // Get queue users with pagination
    const usersQuery = `
      SELECT 
        user_id,
        status,
        position,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (CASE WHEN status != 'waiting' THEN updated_at ELSE NOW() END - created_at)) * 1000 as wait_time_ms
      FROM queue_users
      WHERE sale_id = $1
      ORDER BY position ASC
      LIMIT $2 OFFSET $3
    `;
    const usersResult = await query(usersQuery, [saleId, limit, offset]);

    const users = usersResult.rows.map((row: any) => ({
      user_id: row.user_id,
      status: row.status,
      position: row.position,
      created_at: row.created_at,
      updated_at: row.updated_at,
      wait_time_ms: parseFloat(row.wait_time_ms),
    }));

    // Get statistics
    const statsQuery = `
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting,
        COUNT(CASE WHEN status = 'admitted' THEN 1 END) as admitted,
        COUNT(CASE WHEN status = 'dropped' THEN 1 END) as dropped
      FROM queue_users
      WHERE sale_id = $1
    `;
    const statsResult = await query(statsQuery, [saleId]);
    const stats = statsResult.rows[0];

    res.json({
      sale: {
        id: sale.id,
        name: sale.name,
        status: sale.status,
      },
      stats: {
        total_in_queue: parseInt(stats.total) || 0,
        waiting: parseInt(stats.waiting) || 0,
        admitted: parseInt(stats.admitted) || 0,
        dropped: parseInt(stats.dropped) || 0,
      },
      users,
      pagination: {
        total: stats.total,
        limit,
        offset,
      },
    });
  } catch (error) {
    console.error('Error fetching queue details:', error);
    res.status(500).json({ error: 'Failed to fetch queue details' });
  }
}

/**
 * POST /api/admin/queues/:saleId/admit
 * Manually admit users to checkout
 */
export async function admitUsers(req: Request, res: Response): Promise<void> {
  try {
    const { saleId } = req.params;
    const { user_ids, count } = req.body;

    if (!user_ids && !count) {
      res.status(400).json({ error: 'Provide either user_ids array or count' });
      return;
    }

    let usersToAdmit: string[] = [];

    if (user_ids && Array.isArray(user_ids)) {
      usersToAdmit = user_ids;
    } else if (count && typeof count === 'number') {
      // Get first N users from queue
      const queryStr = `
        SELECT user_id FROM queue_users
        WHERE sale_id = $1 AND status = 'waiting'
        ORDER BY position ASC
        LIMIT $2
      `;
      const result = await query(queryStr, [saleId, count]);
      usersToAdmit = result.rows.map((row: any) => row.user_id);
    }

    if (usersToAdmit.length === 0) {
      res.status(400).json({ error: 'No users to admit' });
      return;
    }

    // Update users status to admitted
    const updateQuery = `
      UPDATE queue_users
      SET status = 'admitted', updated_at = NOW()
      WHERE sale_id = $1 AND user_id = ANY($2::text[])
      RETURNING user_id, status
    `;
    const result = await query(updateQuery, [saleId, usersToAdmit]);

    // Track event
    const collector = getAnalyticsCollector();
    usersToAdmit.forEach((userId) => {
      collector.trackEvent({
        event_type: 'queue_admitted',
        source: 'admin',
        user_id: userId,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
      } as any);
    });

    res.json({
      admitted_count: result.rows.length,
      users_admitted: result.rows.map((row: any) => row.user_id),
    });
  } catch (error) {
    console.error('Error admitting users:', error);
    res.status(500).json({ error: 'Failed to admit users' });
  }
}

/**
 * DELETE /api/admin/queues/:saleId/user/:userId
 * Remove a user from queue
 */
export async function removeUserFromQueue(req: Request, res: Response): Promise<void> {
  try {
    const { saleId, userId } = req.params;
    const { reason = 'Admin removal' } = req.body;

    // Get user's current position
    const positionQuery = `
      SELECT position, status FROM queue_users
      WHERE sale_id = $1 AND user_id = $2
    `;
    const positionResult = await query(positionQuery, [saleId, userId]);

    if (positionResult.rows.length === 0) {
      res.status(404).json({ error: 'User not in queue' });
      return;
    }

    const userPosition = positionResult.rows[0].position;
    const userStatus = positionResult.rows[0].status;

    // Update user status to dropped
    const updateQuery = `
      UPDATE queue_users
      SET status = 'dropped', updated_at = NOW()
      WHERE sale_id = $1 AND user_id = $2
      RETURNING user_id, status
    `;
    const result = await query(updateQuery, [saleId, userId]);

    // Reorder remaining users
    if (userStatus === 'waiting') {
      const reorderQuery = `
        UPDATE queue_users
        SET position = position - 1
        WHERE sale_id = $1 AND position > $2 AND status = 'waiting'
      `;
      await query(reorderQuery, [saleId, userPosition]);
    }

    // Track event
    const collector = getAnalyticsCollector();
    collector.trackEvent({
      event_type: 'queue_dropped',
      source: 'admin',
      user_id: userId,
      sale_id: saleId,
      timestamp: new Date(),
      success: true,
      metadata: { reason, admin_action: true },
    } as any);

    res.json({
      user_id: userId,
      status: 'dropped',
      reason,
    });
  } catch (error) {
    console.error('Error removing user from queue:', error);
    res.status(500).json({ error: 'Failed to remove user from queue' });
  }
}

/**
 * POST /api/admin/queues/:saleId/clear
 * Clear entire queue
 */
export async function clearQueue(req: Request, res: Response): Promise<void> {
  try {
    const { saleId } = req.params;
    const { reason = 'Admin queue clear' } = req.body;

    // Get all users in queue
    const usersQuery = `
      SELECT user_id FROM queue_users
      WHERE sale_id = $1 AND status = 'waiting'
    `;
    const usersResult = await query(usersQuery, [saleId]);
    const userIds = usersResult.rows.map((row: any) => row.user_id);

    if (userIds.length === 0) {
      res.json({
        cleared_count: 0,
        message: 'Queue already empty',
      });
      return;
    }

    // Update all waiting users to dropped
    const clearQuery = `
      UPDATE queue_users
      SET status = 'dropped', updated_at = NOW()
      WHERE sale_id = $1 AND status = 'waiting'
      RETURNING user_id
    `;
    const result = await query(clearQuery, [saleId]);

    // Track events for all cleared users
    const collector = getAnalyticsCollector();
    userIds.forEach((userId) => {
      collector.trackEvent({
        event_type: 'queue_dropped',
        source: 'admin',
        user_id: userId,
        sale_id: saleId,
        timestamp: new Date(),
        success: true,
        metadata: { reason, batch_clear: true },
      } as any);
    });

    res.json({
      cleared_count: result.rows.length,
      users_cleared: userIds,
      reason,
    });
  } catch (error) {
    console.error('Error clearing queue:', error);
    res.status(500).json({ error: 'Failed to clear queue' });
  }
}
