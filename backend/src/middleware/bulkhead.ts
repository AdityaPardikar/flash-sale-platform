/**
 * Bulkhead Middleware
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Implements the Bulkhead pattern for resource isolation:
 * - Separate concurrent request pools per service/route
 * - Prevents one slow endpoint from exhausting all threads
 * - Queue-based overflow handling
 * - Configurable per-partition limits
 */

import { Request, Response, NextFunction } from 'express';

// ─── Types ────────────────────────────────────────────────────

interface BulkheadConfig {
  /** Maximum concurrent requests for this partition */
  maxConcurrent: number;
  /** Maximum queued requests (beyond maxConcurrent, will wait) */
  maxQueue: number;
  /** Queue timeout in ms (how long to wait in queue before rejecting) */
  queueTimeoutMs: number;
  /** Name for the partition (for logging) */
  name: string;
}

interface BulkheadStats {
  name: string;
  activeConcurrent: number;
  maxConcurrent: number;
  queueLength: number;
  maxQueue: number;
  totalAccepted: number;
  totalRejected: number;
  totalTimedOut: number;
}

interface QueuedRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  enqueuedAt: number;
}

// ─── Bulkhead Partition ───────────────────────────────────────

class BulkheadPartition {
  private config: BulkheadConfig;
  private activeConcurrent: number = 0;
  private queue: QueuedRequest[] = [];
  private totalAccepted: number = 0;
  private totalRejected: number = 0;
  private totalTimedOut: number = 0;

  constructor(config: BulkheadConfig) {
    this.config = config;
  }

  /**
   * Try to acquire a slot
   */
  async acquire(): Promise<void> {
    // Direct execution slot available
    if (this.activeConcurrent < this.config.maxConcurrent) {
      this.activeConcurrent++;
      this.totalAccepted++;
      return;
    }

    // Queue slot available
    if (this.queue.length < this.config.maxQueue) {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          // Remove from queue on timeout
          const idx = this.queue.findIndex((q) => q.resolve === resolve);
          if (idx >= 0) {
            this.queue.splice(idx, 1);
          }
          this.totalTimedOut++;
          reject(
            new BulkheadError(
              `Bulkhead '${this.config.name}' queue timeout after ${this.config.queueTimeoutMs}ms`,
              this.config.name,
              'timeout'
            )
          );
        }, this.config.queueTimeoutMs);

        this.queue.push({ resolve, reject, timer, enqueuedAt: Date.now() });
      });
    }

    // No slots available
    this.totalRejected++;
    throw new BulkheadError(
      `Bulkhead '${this.config.name}' rejected: ${this.activeConcurrent}/${this.config.maxConcurrent} concurrent, ${this.queue.length}/${this.config.maxQueue} queued`,
      this.config.name,
      'rejected'
    );
  }

  /**
   * Release a slot
   */
  release(): void {
    this.activeConcurrent--;

    // Process next queued request
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      clearTimeout(next.timer);
      this.activeConcurrent++;
      this.totalAccepted++;
      next.resolve();
    }
  }

  /**
   * Get stats
   */
  getStats(): BulkheadStats {
    return {
      name: this.config.name,
      activeConcurrent: this.activeConcurrent,
      maxConcurrent: this.config.maxConcurrent,
      queueLength: this.queue.length,
      maxQueue: this.config.maxQueue,
      totalAccepted: this.totalAccepted,
      totalRejected: this.totalRejected,
      totalTimedOut: this.totalTimedOut,
    };
  }
}

// ─── Bulkhead Error ───────────────────────────────────────────

export class BulkheadError extends Error {
  public readonly partitionName: string;
  public readonly reason: 'rejected' | 'timeout';

  constructor(message: string, partitionName: string, reason: 'rejected' | 'timeout') {
    super(message);
    this.name = 'BulkheadError';
    this.partitionName = partitionName;
    this.reason = reason;
  }
}

// ─── Bulkhead Manager ─────────────────────────────────────────

class BulkheadManager {
  private partitions: Map<string, BulkheadPartition> = new Map();

  /**
   * Get or create a partition
   */
  getPartition(config: BulkheadConfig): BulkheadPartition {
    let partition = this.partitions.get(config.name);
    if (!partition) {
      partition = new BulkheadPartition(config);
      this.partitions.set(config.name, partition);
    }
    return partition;
  }

  /**
   * Get stats for all partitions
   */
  getAllStats(): BulkheadStats[] {
    return Array.from(this.partitions.values()).map((p) => p.getStats());
  }

  /**
   * Get stats for a specific partition
   */
  getStats(name: string): BulkheadStats | undefined {
    return this.partitions.get(name)?.getStats();
  }
}

export const bulkheadManager = new BulkheadManager();

// ─── Express Middleware ───────────────────────────────────────

interface BulkheadMiddlewareConfig {
  /** Maximum concurrent requests for this partition */
  maxConcurrent?: number;
  /** Maximum queued requests */
  maxQueue?: number;
  /** Queue timeout in ms */
  queueTimeoutMs?: number;
  /** Partition name (defaults to route path) */
  name?: string;
}

/**
 * Create bulkhead middleware for route protection
 */
export function bulkheadMiddleware(
  config: BulkheadMiddlewareConfig = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const cfg: BulkheadConfig = {
    maxConcurrent: config.maxConcurrent ?? 50,
    maxQueue: config.maxQueue ?? 100,
    queueTimeoutMs: config.queueTimeoutMs ?? 10000,
    name: config.name ?? 'default',
  };

  const partition = bulkheadManager.getPartition(cfg);

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await partition.acquire();
    } catch (error) {
      if (error instanceof BulkheadError) {
        res.status(error.reason === 'timeout' ? 408 : 503).json({
          error: 'Service unavailable',
          message:
            error.reason === 'timeout'
              ? 'Request timed out waiting for available capacity'
              : 'Server is at capacity, please try again later',
          partition: cfg.name,
          retryAfter: 5,
        });
        return;
      }
      next(error);
      return;
    }

    // Release slot when response finishes
    res.on('finish', () => {
      partition.release();
    });

    // Also release on close (client disconnect)
    res.on('close', () => {
      if (!res.writableFinished) {
        partition.release();
      }
    });

    next();
  };
}

// ─── Pre-configured Partitions ────────────────────────────────

/** Flash sale endpoints — high concurrency partition */
export const flashSaleBulkhead = bulkheadMiddleware({
  name: 'flash-sale',
  maxConcurrent: 200,
  maxQueue: 500,
  queueTimeoutMs: 15000,
});

/** Checkout endpoints — medium concurrency, longer timeout */
export const checkoutBulkhead = bulkheadMiddleware({
  name: 'checkout',
  maxConcurrent: 100,
  maxQueue: 200,
  queueTimeoutMs: 30000,
});

/** Admin endpoints — low concurrency, short timeout */
export const adminBulkhead = bulkheadMiddleware({
  name: 'admin',
  maxConcurrent: 20,
  maxQueue: 10,
  queueTimeoutMs: 5000,
});
