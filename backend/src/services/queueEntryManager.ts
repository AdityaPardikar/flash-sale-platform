import pool from '../utils/database';
import { v4 as uuidv4 } from 'uuid';

export interface QueueEntry {
  id: string;
  user_id: string;
  flash_sale_id: string;
  position: number;
  status: 'waiting' | 'reserved' | 'purchased' | 'cancelled';
  joined_at: Date;
  updated_at?: Date;
}

export interface QueueEntryCreate {
  user_id: string;
  flash_sale_id: string;
  position: number;
  status?: 'waiting' | 'reserved' | 'purchased' | 'cancelled';
}

export interface QueueEntryUpdate {
  status?: 'waiting' | 'reserved' | 'purchased' | 'cancelled';
  position?: number;
}

class QueueEntryManager {
  private readonly RESERVATION_TIMEOUT_MINUTES = 10; // 10 minutes to complete purchase

  /**
   * Create a new queue entry
   */
  async createEntry(data: QueueEntryCreate): Promise<QueueEntry> {
    try {
      const id = uuidv4();
      const status = data.status || 'waiting';

      const result = await pool.query(
        `INSERT INTO queue_entries (id, user_id, flash_sale_id, position, status, joined_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         RETURNING *`,
        [id, data.user_id, data.flash_sale_id, data.position, status]
      );

      return this.mapToQueueEntry(result.rows[0]);
    } catch (error) {
      console.error('Error creating queue entry:', error);
      throw error;
    }
  }

  /**
   * Get queue entry by user and sale
   */
  async getEntryByUser(userId: string, saleId: string): Promise<QueueEntry | null> {
    try {
      const result = await pool.query(
        `SELECT * FROM queue_entries
         WHERE user_id = $1 AND flash_sale_id = $2
         ORDER BY joined_at DESC
         LIMIT 1`,
        [userId, saleId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToQueueEntry(result.rows[0]);
    } catch (error) {
      console.error('Error getting queue entry by user:', error);
      throw error;
    }
  }

  /**
   * Get all entries for a specific sale
   */
  async getEntriesBySale(
    saleId: string,
    status?: 'waiting' | 'reserved' | 'purchased' | 'cancelled',
    limit: number = 100
  ): Promise<QueueEntry[]> {
    try {
      let query = `SELECT * FROM queue_entries WHERE flash_sale_id = $1`;
      const params: unknown[] = [saleId];

      if (status) {
        query += ` AND status = $2`;
        params.push(status);
      }

      query += ` ORDER BY joined_at ASC LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await pool.query(query, params);

      return result.rows.map((row) => this.mapToQueueEntry(row));
    } catch (error) {
      console.error('Error getting entries by sale:', error);
      throw error;
    }
  }

  /**
   * Update queue entry
   */
  async updateEntry(
    userId: string,
    saleId: string,
    updates: QueueEntryUpdate
  ): Promise<QueueEntry | null> {
    try {
      const setClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.status !== undefined) {
        setClauses.push(`status = $${paramIndex}`);
        values.push(updates.status);
        paramIndex++;
      }

      if (updates.position !== undefined) {
        setClauses.push(`position = $${paramIndex}`);
        values.push(updates.position);
        paramIndex++;
      }

      if (setClauses.length === 0) {
        throw new Error('No updates provided');
      }

      setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

      values.push(userId, saleId);

      const query = `
        UPDATE queue_entries
        SET ${setClauses.join(', ')}
        WHERE user_id = $${paramIndex} AND flash_sale_id = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await pool.query(query, values);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToQueueEntry(result.rows[0]);
    } catch (error) {
      console.error('Error updating queue entry:', error);
      throw error;
    }
  }

  /**
   * Update entry status
   */
  async updateStatus(
    userId: string,
    saleId: string,
    status: 'waiting' | 'reserved' | 'purchased' | 'cancelled'
  ): Promise<QueueEntry | null> {
    try {
      const result = await pool.query(
        `UPDATE queue_entries
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $2 AND flash_sale_id = $3
         RETURNING *`,
        [status, userId, saleId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToQueueEntry(result.rows[0]);
    } catch (error) {
      console.error('Error updating entry status:', error);
      throw error;
    }
  }

  /**
   * Get entries that have expired reservations
   */
  async getExpiredReservations(saleId?: string): Promise<QueueEntry[]> {
    try {
      let query = `
        SELECT * FROM queue_entries
        WHERE status = 'reserved'
        AND updated_at < NOW() - INTERVAL '${this.RESERVATION_TIMEOUT_MINUTES} minutes'
      `;

      const params: unknown[] = [];

      if (saleId) {
        query += ` AND flash_sale_id = $1`;
        params.push(saleId);
      }

      query += ` ORDER BY updated_at ASC`;

      const result = await pool.query(query, params);

      return result.rows.map((row) => this.mapToQueueEntry(row));
    } catch (error) {
      console.error('Error getting expired reservations:', error);
      throw error;
    }
  }

  /**
   * Timeout expired reservations
   */
  async timeoutExpiredReservations(saleId?: string): Promise<number> {
    try {
      let query = `
        UPDATE queue_entries
        SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'reserved'
        AND updated_at < NOW() - INTERVAL '${this.RESERVATION_TIMEOUT_MINUTES} minutes'
      `;

      const params: unknown[] = [];

      if (saleId) {
        query += ` AND flash_sale_id = $1`;
        params.push(saleId);
      }

      const result = await pool.query(query, params);

      console.log(`Timed out ${result.rowCount} expired reservations`);

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error timing out expired reservations:', error);
      throw error;
    }
  }

  /**
   * Delete old queue entries
   */
  async cleanupOldEntries(daysOld: number = 30): Promise<number> {
    try {
      const result = await pool.query(
        `DELETE FROM queue_entries
         WHERE joined_at < NOW() - INTERVAL '${daysOld} days'`,
        []
      );

      console.log(`Deleted ${result.rowCount} old queue entries`);

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up old entries:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(saleId: string): Promise<{
    totalJoined: number;
    waiting: number;
    reserved: number;
    purchased: number;
    cancelled: number;
    conversionRate: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_joined,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as waiting,
          SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
          SUM(CASE WHEN status = 'purchased' THEN 1 ELSE 0 END) as purchased,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
         FROM queue_entries
         WHERE flash_sale_id = $1`,
        [saleId]
      );

      const row = result.rows[0];
      const totalJoined = parseInt(row.total_joined, 10);
      const purchased = parseInt(row.purchased || '0', 10);

      const conversionRate = totalJoined > 0 ? (purchased / totalJoined) * 100 : 0;

      return {
        totalJoined,
        waiting: parseInt(row.waiting || '0', 10),
        reserved: parseInt(row.reserved || '0', 10),
        purchased,
        cancelled: parseInt(row.cancelled || '0', 10),
        conversionRate: Math.round(conversionRate * 100) / 100,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Get user's queue history
   */
  async getUserQueueHistory(userId: string, limit: number = 10): Promise<QueueEntry[]> {
    try {
      const result = await pool.query(
        `SELECT * FROM queue_entries
         WHERE user_id = $1
         ORDER BY joined_at DESC
         LIMIT $2`,
        [userId, limit]
      );

      return result.rows.map((row) => this.mapToQueueEntry(row));
    } catch (error) {
      console.error('Error getting user queue history:', error);
      throw error;
    }
  }

  /**
   * Check if user has active queue entry for sale
   */
  async hasActiveEntry(userId: string, saleId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT 1 FROM queue_entries
         WHERE user_id = $1 AND flash_sale_id = $2
         AND status IN ('waiting', 'reserved')
         LIMIT 1`,
        [userId, saleId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error checking active entry:', error);
      throw error;
    }
  }

  /**
   * Batch update positions
   */
  async batchUpdatePositions(saleId: string): Promise<number> {
    try {
      // Update positions based on joined_at order
      const result = await pool.query(
        `WITH ranked AS (
          SELECT id, ROW_NUMBER() OVER (ORDER BY joined_at ASC) as new_position
          FROM queue_entries
          WHERE flash_sale_id = $1 AND status = 'waiting'
        )
        UPDATE queue_entries qe
        SET position = ranked.new_position, updated_at = CURRENT_TIMESTAMP
        FROM ranked
        WHERE qe.id = ranked.id`,
        [saleId]
      );

      return result.rowCount || 0;
    } catch (error) {
      console.error('Error batch updating positions:', error);
      throw error;
    }
  }

  /**
   * Map database row to QueueEntry
   */
  private mapToQueueEntry(row: Record<string, unknown>): QueueEntry {
    return {
      id: row.id as string,
      user_id: row.user_id as string,
      flash_sale_id: row.flash_sale_id as string,
      position: row.position as number,
      status: row.status as 'waiting' | 'reserved' | 'purchased' | 'cancelled',
      joined_at: row.joined_at as Date,
      updated_at: row.updated_at as Date | undefined,
    };
  }
}

// Export singleton instance
export const queueEntryManager = new QueueEntryManager();
export { QueueEntryManager };
export default queueEntryManager;
