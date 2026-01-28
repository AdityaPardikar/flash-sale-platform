import pool from '../utils/database';
import redisClient from '../utils/redis';
import { buildQueueKey } from '../config/redisKeys';
import { v4 as uuidv4 } from 'uuid';
import { analyticsService } from './analyticsService';

export interface QueueEntry {
  id: string;
  user_id: string;
  flash_sale_id: string;
  position: number;
  status: 'waiting' | 'reserved' | 'purchased' | 'cancelled';
  joined_at: Date;
}

export interface QueueStats {
  totalWaiting: number;
  estimatedWaitTimeMinutes: number;
  averageProcessingTimeSeconds: number;
  admissionRate: number; // Users admitted per minute
}

export interface QueuePosition {
  position: number;
  totalAhead: number;
  totalBehind: number;
  estimatedWaitMinutes: number;
  joinedAt: Date;
}

class QueueService {
  // Configuration
  private readonly ADMISSION_BATCH_SIZE = 10; // Admit 10 users at once
  private readonly PROCESSING_TIME_PER_USER = 30; // 30 seconds per user
  private readonly MAX_QUEUE_SIZE = 10000; // Maximum queue size

  /**
   * Join a queue for a flash sale
   */
  async joinQueue(userId: string, saleId: string): Promise<QueuePosition> {
    try {
      const queueKey = buildQueueKey(saleId);
      const timestamp = Date.now();

      // Check if user is already in queue
      const existingScore = await redisClient.zscore(queueKey, userId);
      if (existingScore !== null) {
        // User already in queue, return current position
        return await this.getQueuePosition(userId, saleId);
      }

      // Check queue size limit
      const currentSize = await redisClient.zcard(queueKey);
      if (currentSize >= this.MAX_QUEUE_SIZE) {
        throw new Error('Queue is full. Please try again later.');
      }

      // Add user to sorted set with timestamp as score (FIFO)
      await redisClient.zadd(queueKey, timestamp, userId);

      // Create queue entry in database
      const entryId = uuidv4();
      await pool.query(
        `INSERT INTO queue_entries (id, user_id, flash_sale_id, position, status, joined_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [entryId, userId, saleId, currentSize + 1, 'waiting']
      );

      // Track analytics event
      await analyticsService.trackQueueJoin(saleId, userId, currentSize + 1);

      // Get position information
      return await this.getQueuePosition(userId, saleId);
    } catch (error) {
      console.error('Error joining queue:', error);
      throw error;
    }
  }

  /**
   * Leave a queue
   */
  async leaveQueue(userId: string, saleId: string): Promise<boolean> {
    try {
      const queueKey = buildQueueKey(saleId);

      // Remove from Redis
      const removed = await redisClient.zrem(queueKey, userId);

      if (removed > 0) {
        // Update database record
        await pool.query(
          `UPDATE queue_entries 
           SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1 AND flash_sale_id = $2 AND status = 'waiting'`,
          [userId, saleId]
        );

        // Track analytics
        await analyticsService.trackEvent('queue_leave', userId, saleId);

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error leaving queue:', error);
      throw error;
    }
  }

  /**
   * Get user's position in queue
   */
  async getQueuePosition(userId: string, saleId: string): Promise<QueuePosition> {
    try {
      const queueKey = buildQueueKey(saleId);

      // Get user's rank (0-based)
      const rank = await redisClient.zrank(queueKey, userId);

      if (rank === null) {
        throw new Error('User not in queue');
      }

      // Get user's join timestamp
      const score = await redisClient.zscore(queueKey, userId);
      const joinedAt = score ? new Date(Number(score)) : new Date();

      // Get total queue size
      const totalSize = await redisClient.zcard(queueKey);

      // Calculate position (1-based)
      const position = rank + 1;
      const totalAhead = rank;
      const totalBehind = totalSize - position;

      // Estimate wait time based on admission rate
      const estimatedWaitMinutes = this.calculateEstimatedWaitTime(position);

      return {
        position,
        totalAhead,
        totalBehind,
        estimatedWaitMinutes,
        joinedAt,
      };
    } catch (error) {
      console.error('Error getting queue position:', error);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(saleId: string): Promise<QueueStats> {
    try {
      const queueKey = buildQueueKey(saleId);

      // Get total waiting count
      const totalWaiting = await redisClient.zcard(queueKey);

      // Calculate admission rate (users per minute)
      const admissionRate = this.ADMISSION_BATCH_SIZE / (this.PROCESSING_TIME_PER_USER / 60);

      // Estimate wait time for last person in queue
      const estimatedWaitTimeMinutes = this.calculateEstimatedWaitTime(totalWaiting);

      return {
        totalWaiting,
        estimatedWaitTimeMinutes,
        averageProcessingTimeSeconds: this.PROCESSING_TIME_PER_USER,
        admissionRate,
      };
    } catch (error) {
      console.error('Error getting queue stats:', error);
      throw error;
    }
  }

  /**
   * Get queue length
   */
  async getQueueLength(saleId: string): Promise<number> {
    try {
      const queueKey = buildQueueKey(saleId);
      return await redisClient.zcard(queueKey);
    } catch (error) {
      console.error('Error getting queue length:', error);
      throw error;
    }
  }

  /**
   * Check if user is in queue
   */
  async isInQueue(userId: string, saleId: string): Promise<boolean> {
    try {
      const queueKey = buildQueueKey(saleId);
      const score = await redisClient.zscore(queueKey, userId);
      return score !== null;
    } catch (error) {
      console.error('Error checking queue membership:', error);
      throw error;
    }
  }

  /**
   * Admit next batch of users from queue
   */
  async admitNextBatch(saleId: string, batchSize?: number): Promise<string[]> {
    try {
      const queueKey = buildQueueKey(saleId);
      const size = batchSize || this.ADMISSION_BATCH_SIZE;

      // Get first N users from queue (lowest scores = earliest joiners)
      const userIds = await redisClient.zrange(queueKey, 0, size - 1);

      if (userIds.length === 0) {
        return [];
      }

      // Remove admitted users from queue
      await redisClient.zrem(queueKey, ...userIds);

      // Update database records
      await pool.query(
        `UPDATE queue_entries 
         SET status = 'reserved', updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ANY($1::text[]) AND flash_sale_id = $2 AND status = 'waiting'`,
        [userIds, saleId]
      );

      console.log(`Admitted ${userIds.length} users from queue for sale ${saleId}`);

      return userIds;
    } catch (error) {
      console.error('Error admitting batch:', error);
      throw error;
    }
  }

  /**
   * Get all users in queue (for admin/debugging)
   */
  async getAllQueueUsers(
    saleId: string,
    limit: number = 100
  ): Promise<
    Array<{
      userId: string;
      position: number;
      joinedAt: Date;
    }>
  > {
    try {
      const queueKey = buildQueueKey(saleId);

      // Get users with scores
      const results = await redisClient.zrange(queueKey, 0, limit - 1, 'WITHSCORES');

      const users: Array<{ userId: string; position: number; joinedAt: Date }> = [];

      // Parse results (format: [userId, score, userId, score, ...])
      for (let i = 0; i < results.length; i += 2) {
        const userId = results[i];
        const score = Number(results[i + 1]);

        users.push({
          userId,
          position: i / 2 + 1,
          joinedAt: new Date(score),
        });
      }

      return users;
    } catch (error) {
      console.error('Error getting all queue users:', error);
      throw error;
    }
  }

  /**
   * Clear entire queue (admin only)
   */
  async clearQueue(saleId: string): Promise<number> {
    try {
      const queueKey = buildQueueKey(saleId);

      // Get count before deletion
      const count = await redisClient.zcard(queueKey);

      // Delete queue
      await redisClient.del(queueKey);

      // Update database
      await pool.query(
        `UPDATE queue_entries 
         SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
         WHERE flash_sale_id = $1 AND status = 'waiting'`,
        [saleId]
      );

      console.log(`Cleared ${count} users from queue for sale ${saleId}`);

      return count;
    } catch (error) {
      console.error('Error clearing queue:', error);
      throw error;
    }
  }

  /**
   * Calculate estimated wait time based on position
   */
  private calculateEstimatedWaitTime(position: number): number {
    if (position <= 0) return 0;

    // Calculate batches needed to reach this position
    const batchesNeeded = Math.ceil(position / this.ADMISSION_BATCH_SIZE);

    // Estimate time: batches * processing time per batch (in minutes)
    const estimatedSeconds = batchesNeeded * this.PROCESSING_TIME_PER_USER;
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

    return estimatedMinutes;
  }

  /**
   * Get queue statistics from database
   */
  async getQueueStatsFromDB(saleId: string): Promise<{
    totalJoined: number;
    totalWaiting: number;
    totalReserved: number;
    totalPurchased: number;
    totalCancelled: number;
  }> {
    try {
      const result = await pool.query(
        `SELECT 
          COUNT(*) as total_joined,
          SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END) as total_waiting,
          SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as total_reserved,
          SUM(CASE WHEN status = 'purchased' THEN 1 ELSE 0 END) as total_purchased,
          SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled
         FROM queue_entries
         WHERE flash_sale_id = $1`,
        [saleId]
      );

      const row = result.rows[0];

      return {
        totalJoined: parseInt(row.total_joined, 10),
        totalWaiting: parseInt(row.total_waiting || '0', 10),
        totalReserved: parseInt(row.total_reserved || '0', 10),
        totalPurchased: parseInt(row.total_purchased || '0', 10),
        totalCancelled: parseInt(row.total_cancelled || '0', 10),
      };
    } catch (error) {
      console.error('Error getting queue stats from DB:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const queueService = new QueueService();
export { QueueService };
export default queueService;
