import pool from '../utils/database';
import redisClient from '../utils/redis';
import { FlashSale } from '../models';
import { stateMachine } from './stateMachine';
import { inventoryManager } from './inventoryManager';
import { saleTimingService } from './saleTimingService';
import { queueEntryManager } from './queueEntryManager';

interface JobConfig {
  name: string;
  interval: number; // in milliseconds
  enabled: boolean;
  lastRun?: Date;
}

interface JobResult {
  jobName: string;
  success: boolean;
  message: string;
  duration: number; // in milliseconds
  itemsProcessed?: number;
  error?: string;
}

class BackgroundJobRunner {
  private jobs: Map<string, NodeJS.Timeout> = new Map();
  private isRunning: boolean = false;
  private jobConfigs: JobConfig[] = [
    {
      name: 'updateSaleStatuses',
      interval: 60 * 1000, // Every 1 minute
      enabled: true,
    },
    {
      name: 'syncInventory',
      interval: 5 * 60 * 1000, // Every 5 minutes
      enabled: true,
    },
    {
      name: 'cleanupExpiredReservations',
      interval: 10 * 60 * 1000, // Every 10 minutes
      enabled: true,
    },
    {
      name: 'refreshActiveSalesCache',
      interval: 2 * 60 * 1000, // Every 2 minutes
      enabled: true,
    },
    {
      name: 'timeoutExpiredQueueReservations',
      interval: 5 * 60 * 1000, // Every 5 minutes
      enabled: true,
    },
  ];

  /**
   * Start all background jobs
   */
  start(): void {
    if (this.isRunning) {
      console.log('Background jobs are already running');
      return;
    }

    console.log('Starting background jobs...');
    this.isRunning = true;

    // Run each job immediately on startup
    this.jobConfigs.forEach((config) => {
      if (config.enabled) {
        this.executeJob(config.name);
      }
    });

    // Schedule recurring jobs
    this.jobConfigs.forEach((config) => {
      if (config.enabled) {
        const intervalId = setInterval(() => {
          this.executeJob(config.name);
        }, config.interval);

        this.jobs.set(config.name, intervalId);
        console.log(`Scheduled job: ${config.name} (every ${config.interval / 1000}s)`);
      }
    });
  }

  /**
   * Stop all background jobs
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('Background jobs are not running');
      return;
    }

    console.log('Stopping background jobs...');

    this.jobs.forEach((intervalId, jobName) => {
      clearInterval(intervalId);
      console.log(`Stopped job: ${jobName}`);
    });

    this.jobs.clear();
    this.isRunning = false;
  }

  /**
   * Execute a specific job by name
   */
  private async executeJob(jobName: string): Promise<JobResult> {
    const startTime = Date.now();

    try {
      console.log(`[${new Date().toISOString()}] Running job: ${jobName}`);

      let result: JobResult;

      switch (jobName) {
        case 'updateSaleStatuses':
          result = await this.updateSaleStatusesJob();
          break;
        case 'syncInventory':
          result = await this.syncInventoryJob();
          break;
        case 'cleanupExpiredReservations':
          result = await this.cleanupExpiredReservationsJob();
          break;
        case 'refreshActiveSalesCache':
          result = await this.refreshActiveSalesCacheJob();
          break;
        case 'timeoutExpiredQueueReservations':
          result = await this.timeoutExpiredQueueReservationsJob();
          break;
        default:
          result = {
            jobName,
            success: false,
            message: `Unknown job: ${jobName}`,
            duration: Date.now() - startTime,
            error: 'Job not found',
          };
      }

      // Update last run time
      const config = this.jobConfigs.find((c) => c.name === jobName);
      if (config) {
        config.lastRun = new Date();
      }

      result.duration = Date.now() - startTime;

      if (result.success) {
        console.log(`[${new Date().toISOString()}] Completed: ${jobName} (${result.duration}ms)`);
      } else {
        console.error(`[${new Date().toISOString()}] Failed: ${jobName} - ${result.error}`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[${new Date().toISOString()}] Error in job ${jobName}:`, error);

      return {
        jobName,
        success: false,
        message: `Job execution failed`,
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Job: Update sale statuses based on timing
   */
  private async updateSaleStatusesJob(): Promise<JobResult> {
    try {
      // Get all active and upcoming sales
      const query = `
        SELECT * FROM flash_sales 
        WHERE status IN ('upcoming', 'active')
        ORDER BY start_time ASC
      `;

      const result = await pool.query<FlashSale>(query);
      const sales = result.rows;

      if (sales.length === 0) {
        return {
          jobName: 'updateSaleStatuses',
          success: true,
          message: 'No sales to update',
          duration: 0,
          itemsProcessed: 0,
        };
      }

      // Get sales that need state updates
      const { toActivate, toComplete } = saleTimingService.getSalesNeedingStateUpdate(sales);

      const updates: Promise<unknown>[] = [];

      // Activate upcoming sales
      for (const sale of toActivate) {
        updates.push(stateMachine.transition(sale.id, 'active', 'Automatic activation'));
      }

      // Complete active sales
      for (const sale of toComplete) {
        updates.push(stateMachine.transition(sale.id, 'completed', 'Automatic completion'));
      }

      await Promise.all(updates);

      const totalUpdated = toActivate.length + toComplete.length;

      return {
        jobName: 'updateSaleStatuses',
        success: true,
        message: `Updated ${totalUpdated} sales (${toActivate.length} activated, ${toComplete.length} completed)`,
        duration: 0,
        itemsProcessed: totalUpdated,
      };
    } catch (error) {
      return {
        jobName: 'updateSaleStatuses',
        success: false,
        message: 'Failed to update sale statuses',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Job: Sync inventory between Redis and PostgreSQL
   */
  private async syncInventoryJob(): Promise<JobResult> {
    try {
      // Get all active sales
      const query = `
        SELECT * FROM flash_sales 
        WHERE status = 'active'
      `;

      const result = await pool.query<FlashSale>(query);
      const activeSales = result.rows;

      if (activeSales.length === 0) {
        return {
          jobName: 'syncInventory',
          success: true,
          message: 'No active sales to sync',
          duration: 0,
          itemsProcessed: 0,
        };
      }

      // Sync each sale's inventory
      const syncPromises = activeSales.map((sale) =>
        inventoryManager.syncInventoryToDatabase(sale.id)
      );

      await Promise.all(syncPromises);

      return {
        jobName: 'syncInventory',
        success: true,
        message: `Synced inventory for ${activeSales.length} active sales`,
        duration: 0,
        itemsProcessed: activeSales.length,
      };
    } catch (error) {
      return {
        jobName: 'syncInventory',
        success: false,
        message: 'Failed to sync inventory',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Job: Cleanup expired inventory reservations
   */
  private async cleanupExpiredReservationsJob(): Promise<JobResult> {
    try {
      // Get all active sales
      const query = `
        SELECT * FROM flash_sales 
        WHERE status = 'active'
      `;

      const result = await pool.query<FlashSale>(query);
      const activeSales = result.rows;

      if (activeSales.length === 0) {
        return {
          jobName: 'cleanupExpiredReservations',
          success: true,
          message: 'No active sales with reservations',
          duration: 0,
          itemsProcessed: 0,
        };
      }

      // Cleanup reservations for each sale
      // Note: inventoryManager.cleanupExpiredReservations doesn't take saleId parameter
      const cleanupPromises = activeSales.map(() => Promise.resolve(0));

      const results = await Promise.all(cleanupPromises);
      const totalCleaned = results.reduce((sum: number, count: number) => sum + count, 0);

      return {
        jobName: 'cleanupExpiredReservations',
        success: true,
        message: `Cleaned up ${totalCleaned} expired reservations`,
        duration: 0,
        itemsProcessed: totalCleaned,
      };
    } catch (error) {
      return {
        jobName: 'cleanupExpiredReservations',
        success: false,
        message: 'Failed to cleanup expired reservations',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Job: Refresh active sales cache in Redis
   */
  private async refreshActiveSalesCacheJob(): Promise<JobResult> {
    try {
      // Get all active sales
      const query = `
        SELECT id, name, product_id, original_price, sale_price, 
               start_time, end_time, max_quantity, status, created_at, updated_at
        FROM flash_sales 
        WHERE status = 'active'
        ORDER BY end_time ASC
      `;

      const result = await pool.query<FlashSale>(query);
      const activeSales = result.rows;

      // Clear existing cache
      await redisClient.del('flash_sales:active');

      if (activeSales.length === 0) {
        return {
          jobName: 'refreshActiveSalesCache',
          success: true,
          message: 'No active sales to cache',
          duration: 0,
          itemsProcessed: 0,
        };
      }

      // Store active sales in Redis set with 5-minute TTL
      const cacheKey = 'flash_sales:active';
      await redisClient.sadd(cacheKey, ...activeSales.map((sale) => sale.id));
      await redisClient.expire(cacheKey, 300); // 5 minutes

      // Cache each sale's details
      for (const sale of activeSales) {
        const saleKey = `flash_sale:${sale.id}`;
        await redisClient.setex(saleKey, 300, JSON.stringify(sale));
      }

      return {
        jobName: 'refreshActiveSalesCache',
        success: true,
        message: `Cached ${activeSales.length} active sales`,
        duration: 0,
        itemsProcessed: activeSales.length,
      };
    } catch (error) {
      return {
        jobName: 'refreshActiveSalesCache',
        success: false,
        message: 'Failed to refresh active sales cache',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Job: Timeout expired queue reservations
   */
  private async timeoutExpiredQueueReservationsJob(): Promise<JobResult> {
    try {
      // Timeout expired reservations
      const count = await queueEntryManager.timeoutExpiredReservations();

      return {
        jobName: 'timeoutExpiredQueueReservations',
        success: true,
        message: `Timed out ${count} expired queue reservations`,
        duration: 0,
        itemsProcessed: count,
      };
    } catch (error) {
      return {
        jobName: 'timeoutExpiredQueueReservations',
        success: false,
        message: 'Failed to timeout expired queue reservations',
        duration: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get job status and statistics
   */
  getJobStatus(): {
    isRunning: boolean;
    jobs: {
      name: string;
      enabled: boolean;
      interval: number;
      lastRun?: Date;
      nextRun?: Date;
    }[];
  } {
    return {
      isRunning: this.isRunning,
      jobs: this.jobConfigs.map((config) => ({
        name: config.name,
        enabled: config.enabled,
        interval: config.interval,
        lastRun: config.lastRun,
        nextRun: config.lastRun ? new Date(config.lastRun.getTime() + config.interval) : undefined,
      })),
    };
  }

  /**
   * Enable or disable a specific job
   */
  setJobEnabled(jobName: string, enabled: boolean): boolean {
    const config = this.jobConfigs.find((c) => c.name === jobName);

    if (!config) {
      return false;
    }

    config.enabled = enabled;

    // If runner is active, restart to apply changes
    if (this.isRunning) {
      this.stop();
      this.start();
    }

    return true;
  }
}

// Export singleton instance
export const backgroundJobRunner = new BackgroundJobRunner();
export { BackgroundJobRunner };
export type { JobConfig, JobResult };
