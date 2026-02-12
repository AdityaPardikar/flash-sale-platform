/**
 * Priority Queue Service
 * Week 5 Day 3: Advanced Queue Features & VIP System
 *
 * Features:
 * - Priority queue implementation
 * - VIP priority handling
 * - Dynamic queue allocation
 * - Queue health monitoring
 * - Smart throttling
 * - Automatic queue scaling
 */

import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';
import { vipService, VIPTier } from './vipService';

// Types
export interface QueueEntry {
  id: string;
  userId: string;
  saleId: string;
  position: number;
  priority: number;
  joinedAt: Date;
  estimatedWaitTime: number;
  status: QueueStatus;
  vipTier: VIPTier;
  metadata?: Record<string, any>;
}

export enum QueueStatus {
  WAITING = 'waiting',
  PROCESSING = 'processing',
  READY = 'ready',
  EXPIRED = 'expired',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

export interface QueueHealth {
  saleId: string;
  totalInQueue: number;
  processingCount: number;
  averageWaitTime: number;
  throughput: number; // users per minute
  healthScore: number; // 0-100
  congestionLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface QueueConfig {
  saleId: string;
  maxConcurrent: number;
  batchSize: number;
  processingTimeoutSeconds: number;
  vipSlots: number; // Reserved slots for VIP users
  vipBoostFactor: number;
}

// Constants
const DEFAULT_MAX_CONCURRENT = 100;
const DEFAULT_BATCH_SIZE = 10;
const PROCESSING_TIMEOUT = 300; // 5 minutes
const QUEUE_ENTRY_TTL = 3600; // 1 hour
const VIP_BOOST_FACTOR = 2.0;

class PriorityQueueService {
  private queueConfigs: Map<string, QueueConfig> = new Map();

  /**
   * Add user to priority queue
   */
  async enqueue(
    userId: string,
    saleId: string,
    metadata?: Record<string, any>
  ): Promise<QueueEntry> {
    // Get user's VIP status
    const membership = await vipService.getMembership(userId);
    const vipTier = membership?.isActive ? membership.tier : VIPTier.STANDARD;
    const vipBenefits = vipService.getBenefits(vipTier);

    // Calculate priority score (higher = better position)
    const basePriority = Date.now();
    const priorityBoost = vipBenefits.queuePriority * VIP_BOOST_FACTOR;
    const priority = basePriority - priorityBoost * 1000000; // Lower value = higher priority

    const entryId = `qe-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const entry: QueueEntry = {
      id: entryId,
      userId,
      saleId,
      position: 0, // Will be calculated
      priority,
      joinedAt: new Date(),
      estimatedWaitTime: 0,
      status: QueueStatus.WAITING,
      vipTier,
      metadata,
    };

    if (!isRedisConnected()) {
      return { ...entry, position: 1 };
    }

    // Add to sorted set (by priority)
    const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;
    await redisClient.zadd(queueKey, priority, JSON.stringify(entry));
    await redisClient.expire(queueKey, QUEUE_ENTRY_TTL);

    // Store entry details
    await redisClient.setex(
      `${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`,
      QUEUE_ENTRY_TTL,
      JSON.stringify(entry)
    );

    // Track user's queue entry
    await redisClient.setex(
      `${REDIS_KEYS.QUEUE_PREFIX}:user:${userId}:${saleId}`,
      QUEUE_ENTRY_TTL,
      entryId
    );

    // Calculate position
    const position = await this.getPosition(entryId, saleId);
    entry.position = position;
    entry.estimatedWaitTime = await this.estimateWaitTime(saleId, position);

    console.log(
      `🎫 User ${userId} joined queue for sale ${saleId} at position ${position} (VIP: ${vipTier})`
    );

    return entry;
  }

  /**
   * Get user's position in queue
   */
  async getPosition(entryId: string, saleId: string): Promise<number> {
    if (!isRedisConnected()) return 1;

    const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;

    // Get the entry data
    const entryData = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    if (!entryData) return -1;

    const entry = JSON.parse(entryData) as QueueEntry;

    // Count entries with higher priority (lower score)
    const rank = await redisClient.zrank(queueKey, JSON.stringify(entry));

    return rank !== null ? rank + 1 : -1;
  }

  /**
   * Process next batch from queue
   */
  async processNextBatch(saleId: string, batchSize?: number): Promise<QueueEntry[]> {
    const config = this.getConfig(saleId);
    const size = batchSize || config.batchSize;

    if (!isRedisConnected()) return [];

    const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;
    const processingKey = `${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`;

    // Check current processing count
    const currentProcessing = await redisClient.scard(processingKey);
    if (currentProcessing >= config.maxConcurrent) {
      console.log(`⏸️ Queue ${saleId} at capacity (${currentProcessing}/${config.maxConcurrent})`);
      return [];
    }

    const availableSlots = config.maxConcurrent - currentProcessing;
    const toProcess = Math.min(size, availableSlots);

    // Get entries with best priority (lowest scores)
    const entries = await redisClient.zrange(queueKey, 0, toProcess - 1);
    const processedEntries: QueueEntry[] = [];

    for (const entryData of entries) {
      const entry = JSON.parse(entryData) as QueueEntry;
      entry.status = QueueStatus.PROCESSING;

      // Move to processing set
      await redisClient.zrem(queueKey, entryData);
      await redisClient.sadd(processingKey, entry.id);
      await redisClient.expire(processingKey, config.processingTimeoutSeconds);

      // Update entry status
      await redisClient.setex(
        `${REDIS_KEYS.QUEUE_PREFIX}:entry:${entry.id}`,
        config.processingTimeoutSeconds,
        JSON.stringify(entry)
      );

      processedEntries.push(entry);
    }

    if (processedEntries.length > 0) {
      console.log(`⚡ Processing ${processedEntries.length} users for sale ${saleId}`);
    }

    return processedEntries;
  }

  /**
   * Mark entry as ready to purchase
   */
  async markReady(entryId: string, saleId: string): Promise<boolean> {
    if (!isRedisConnected()) return true;

    const entryData = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    if (!entryData) return false;

    const entry = JSON.parse(entryData) as QueueEntry;
    entry.status = QueueStatus.READY;

    await redisClient.setex(
      `${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`,
      PROCESSING_TIMEOUT,
      JSON.stringify(entry)
    );

    // Move to ready set
    const processingKey = `${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`;
    const readyKey = `${REDIS_KEYS.QUEUE_PREFIX}:ready:${saleId}`;

    await redisClient.srem(processingKey, entryId);
    await redisClient.sadd(readyKey, entryId);
    await redisClient.expire(readyKey, PROCESSING_TIMEOUT);

    return true;
  }

  /**
   * Complete queue entry (purchase made)
   */
  async complete(entryId: string, saleId: string): Promise<void> {
    if (!isRedisConnected()) return;

    const entryData = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    if (entryData) {
      const entry = JSON.parse(entryData) as QueueEntry;
      entry.status = QueueStatus.COMPLETED;

      // Store completion for analytics
      await redisClient.lpush(
        `${REDIS_KEYS.QUEUE_PREFIX}:completed:${saleId}`,
        JSON.stringify({ ...entry, completedAt: new Date() })
      );
      await redisClient.ltrim(`${REDIS_KEYS.QUEUE_PREFIX}:completed:${saleId}`, 0, 999);
    }

    // Clean up
    await redisClient.del(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    await redisClient.srem(`${REDIS_KEYS.QUEUE_PREFIX}:ready:${saleId}`, entryId);
    await redisClient.srem(`${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`, entryId);
  }

  /**
   * Get queue health metrics
   */
  async getQueueHealth(saleId: string): Promise<QueueHealth> {
    const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;
    const processingKey = `${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`;
    const completedKey = `${REDIS_KEYS.QUEUE_PREFIX}:completed:${saleId}`;

    let totalInQueue = 0;
    let processingCount = 0;
    let completedRecent = 0;

    if (isRedisConnected()) {
      totalInQueue = await redisClient.zcard(queueKey);
      processingCount = await redisClient.scard(processingKey);
      completedRecent = await redisClient.llen(completedKey);
    }

    const config = this.getConfig(saleId);

    // Calculate throughput (estimated completions per minute)
    const throughput =
      completedRecent > 0 ? Math.min(completedRecent / 60, config.maxConcurrent) : 0;

    // Estimate average wait time
    const averageWaitTime = throughput > 0 ? totalInQueue / throughput : 0;

    // Calculate health score
    const utilizationRatio = processingCount / config.maxConcurrent;
    const queueRatio = Math.min(1, totalInQueue / 1000);
    const healthScore = Math.round(100 - (utilizationRatio * 30 + queueRatio * 70));

    // Determine congestion level
    const congestionLevel =
      healthScore > 75
        ? 'low'
        : healthScore > 50
          ? 'medium'
          : healthScore > 25
            ? 'high'
            : 'critical';

    return {
      saleId,
      totalInQueue,
      processingCount,
      averageWaitTime,
      throughput,
      healthScore,
      congestionLevel,
    };
  }

  /**
   * Estimate wait time for position
   */
  async estimateWaitTime(saleId: string, position: number): Promise<number> {
    const config = this.getConfig(saleId);
    const health = await this.getQueueHealth(saleId);

    if (health.throughput === 0) {
      // Estimate based on config
      const batchesNeeded = Math.ceil(position / config.batchSize);
      return batchesNeeded * 60; // 1 minute per batch
    }

    return Math.ceil(position / health.throughput) * 60; // seconds
  }

  /**
   * Configure queue for a sale
   */
  configureQueue(saleId: string, config: Partial<QueueConfig>): QueueConfig {
    const existingConfig = this.queueConfigs.get(saleId) || {
      saleId,
      maxConcurrent: DEFAULT_MAX_CONCURRENT,
      batchSize: DEFAULT_BATCH_SIZE,
      processingTimeoutSeconds: PROCESSING_TIMEOUT,
      vipSlots: 10,
      vipBoostFactor: VIP_BOOST_FACTOR,
    };

    const newConfig = { ...existingConfig, ...config };
    this.queueConfigs.set(saleId, newConfig);

    return newConfig;
  }

  /**
   * Get queue configuration
   */
  getConfig(saleId: string): QueueConfig {
    return (
      this.queueConfigs.get(saleId) || {
        saleId,
        maxConcurrent: DEFAULT_MAX_CONCURRENT,
        batchSize: DEFAULT_BATCH_SIZE,
        processingTimeoutSeconds: PROCESSING_TIMEOUT,
        vipSlots: 10,
        vipBoostFactor: VIP_BOOST_FACTOR,
      }
    );
  }

  /**
   * Get user's queue entry for a sale
   */
  async getUserEntry(userId: string, saleId: string): Promise<QueueEntry | null> {
    if (!isRedisConnected()) return null;

    const entryId = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:user:${userId}:${saleId}`);
    if (!entryId) return null;

    const entryData = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    if (!entryData) return null;

    const entry = JSON.parse(entryData) as QueueEntry;
    entry.position = await this.getPosition(entryId, saleId);
    entry.estimatedWaitTime = await this.estimateWaitTime(saleId, entry.position);

    return entry;
  }

  /**
   * Cleanup expired entries
   */
  async cleanupExpired(saleId: string): Promise<number> {
    if (!isRedisConnected()) return 0;

    const processingKey = `${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`;
    const readyKey = `${REDIS_KEYS.QUEUE_PREFIX}:ready:${saleId}`;

    // Get all processing and ready entries
    const processing = await redisClient.smembers(processingKey);
    const ready = await redisClient.smembers(readyKey);

    let cleaned = 0;

    for (const entryId of [...processing, ...ready]) {
      const exists = await redisClient.exists(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
      if (!exists) {
        await redisClient.srem(processingKey, entryId);
        await redisClient.srem(readyKey, entryId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 Cleaned ${cleaned} expired queue entries for sale ${saleId}`);
    }

    return cleaned;
  }

  /**
   * Remove user from queue
   */
  async dequeue(userId: string, saleId: string): Promise<boolean> {
    if (!isRedisConnected()) return true;

    const entryId = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:user:${userId}:${saleId}`);
    if (!entryId) return false;

    const entryData = await redisClient.get(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    if (entryData) {
      const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;
      await redisClient.zrem(queueKey, entryData);
    }

    // Cleanup
    await redisClient.del(`${REDIS_KEYS.QUEUE_PREFIX}:entry:${entryId}`);
    await redisClient.del(`${REDIS_KEYS.QUEUE_PREFIX}:user:${userId}:${saleId}`);
    await redisClient.srem(`${REDIS_KEYS.QUEUE_PREFIX}:processing:${saleId}`, entryId);
    await redisClient.srem(`${REDIS_KEYS.QUEUE_PREFIX}:ready:${saleId}`, entryId);

    return true;
  }
}

// Export singleton
export const priorityQueueService = new PriorityQueueService();
export default priorityQueueService;
