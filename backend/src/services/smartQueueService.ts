/**
 * Smart Queue Management Service
 * Week 5 Day 3: Advanced Queue Features & VIP System
 *
 * Features:
 * - Dynamic queue allocation
 * - Queue congestion prediction
 * - Automatic scaling
 * - Smart throttling algorithms
 * - Queue optimization
 * - Load balancing
 */

import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';
import { priorityQueueService, QueueHealth } from './priorityQueueService';
import { logger } from '../utils/logger';

// Types
export interface QueueScalingConfig {
  minConcurrent: number;
  maxConcurrent: number;
  scaleUpThreshold: number; // Queue size threshold to scale up
  scaleDownThreshold: number;
  scaleStepSize: number;
  cooldownSeconds: number;
}

export interface ThrottleConfig {
  enabled: boolean;
  maxRequestsPerSecond: number;
  burstSize: number;
  penaltySeconds: number;
}

export interface QueuePrediction {
  saleId: string;
  predictedPeakSize: number;
  predictedPeakTime: Date;
  recommendedConcurrent: number;
  congestionRisk: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface QueueOptimizationResult {
  saleId: string;
  previousConfig: { maxConcurrent: number; batchSize: number };
  newConfig: { maxConcurrent: number; batchSize: number };
  reason: string;
  estimatedImprovement: number;
}

export interface QueueConfig {
  maxConcurrent: number;
  batchSize: number;
  vipSlots: number;
  enableThrottling: boolean;
  throttleLimit: number;
}

// Constants
const SCALING_COOLDOWN = 30; // seconds
// const METRICS_WINDOW = 300; // 5 minutes
const MIN_CONCURRENT = 10;
const MAX_CONCURRENT = 500;

class SmartQueueService {
  private lastScaleTime: Map<string, number> = new Map();
  private throttleStates: Map<string, { tokens: number; lastRefill: number }> = new Map();

  /**
   * Predict queue congestion
   */
  async predictCongestion(saleId: string, expectedParticipants: number): Promise<QueuePrediction> {
    const health = await priorityQueueService.getQueueHealth(saleId);
    const config = priorityQueueService.getConfig(saleId);

    // Calculate based on current trends and expected load
    const currentLoad = health.totalInQueue + health.processingCount;
    void (currentLoad / config.maxConcurrent); // capacityRatio reserved for future use

    // Estimate peak based on expected participants
    const predictedPeakSize = Math.round(expectedParticipants * 0.7); // Assume 70% concurrent peak
    const peakLoadRatio = predictedPeakSize / config.maxConcurrent;

    // Predict when peak will occur
    const predictedPeakTime = new Date();
    if (currentLoad < predictedPeakSize) {
      const rampUpRate = health.throughput || 10;
      const minutesToPeak = (predictedPeakSize - currentLoad) / rampUpRate;
      predictedPeakTime.setMinutes(predictedPeakTime.getMinutes() + Math.round(minutesToPeak));
    }

    // Calculate recommended concurrent processing
    const recommendedConcurrent = Math.min(
      MAX_CONCURRENT,
      Math.max(MIN_CONCURRENT, Math.ceil(predictedPeakSize / 10)),
    );

    // Determine congestion risk
    const congestionRisk: QueuePrediction['congestionRisk'] =
      peakLoadRatio > 3 ? 'high' : peakLoadRatio > 1.5 ? 'medium' : 'low';

    // Generate recommendations
    const recommendations: string[] = [];
    if (congestionRisk === 'high') {
      recommendations.push(`Increase max concurrent to ${recommendedConcurrent}`);
      recommendations.push('Consider enabling additional server capacity');
      recommendations.push('Implement stricter rate limiting');
    } else if (congestionRisk === 'medium') {
      recommendations.push(`Consider scaling to ${recommendedConcurrent} concurrent users`);
      recommendations.push('Monitor queue health closely');
    }

    if (health.averageWaitTime > 300) {
      recommendations.push('High wait times detected - consider batch size increase');
    }

    return {
      saleId,
      predictedPeakSize,
      predictedPeakTime,
      recommendedConcurrent,
      congestionRisk,
      recommendations,
    };
  }

  /**
   * Auto-scale queue based on load
   */
  async autoScale(saleId: string): Promise<QueueOptimizationResult | null> {
    // Check cooldown
    const lastScale = this.lastScaleTime.get(saleId) || 0;
    if (Date.now() - lastScale < SCALING_COOLDOWN * 1000) {
      return null;
    }

    const health = await priorityQueueService.getQueueHealth(saleId);
    const currentConfig = priorityQueueService.getConfig(saleId);

    let newMaxConcurrent = currentConfig.maxConcurrent;
    let newBatchSize = currentConfig.batchSize;
    let reason = '';

    // Scale up if queue is growing
    if (health.totalInQueue > currentConfig.maxConcurrent * 2 && health.congestionLevel !== 'low') {
      newMaxConcurrent = Math.min(MAX_CONCURRENT, Math.ceil(currentConfig.maxConcurrent * 1.5));
      newBatchSize = Math.ceil(currentConfig.batchSize * 1.25);
      reason = 'Queue congestion detected - scaling up';
    }
    // Scale down if underutilized
    else if (
      health.totalInQueue < currentConfig.maxConcurrent * 0.3 &&
      health.processingCount < currentConfig.maxConcurrent * 0.2
    ) {
      newMaxConcurrent = Math.max(MIN_CONCURRENT, Math.floor(currentConfig.maxConcurrent * 0.75));
      newBatchSize = Math.max(5, Math.floor(currentConfig.batchSize * 0.9));
      reason = 'Low utilization - scaling down';
    }

    // No change needed
    if (
      newMaxConcurrent === currentConfig.maxConcurrent &&
      newBatchSize === currentConfig.batchSize
    ) {
      return null;
    }

    // Apply new configuration
    priorityQueueService.configureQueue(saleId, {
      maxConcurrent: newMaxConcurrent,
      batchSize: newBatchSize,
    });

    this.lastScaleTime.set(saleId, Date.now());

    const result: QueueOptimizationResult = {
      saleId,
      previousConfig: {
        maxConcurrent: currentConfig.maxConcurrent,
        batchSize: currentConfig.batchSize,
      },
      newConfig: {
        maxConcurrent: newMaxConcurrent,
        batchSize: newBatchSize,
      },
      reason,
      estimatedImprovement: Math.round((newMaxConcurrent / currentConfig.maxConcurrent - 1) * 100),
    };

    logger.info(`📊 Auto-scaled queue ${saleId}: ${reason}`);
    return result;
  }

  /**
   * Apply smart throttling
   */
  async throttle(
    identifier: string,
    config: ThrottleConfig = {
      enabled: true,
      maxRequestsPerSecond: 10,
      burstSize: 20,
      penaltySeconds: 60,
    },
  ): Promise<{ allowed: boolean; remainingTokens: number; retryAfter?: number }> {
    if (!config.enabled) {
      return { allowed: true, remainingTokens: config.burstSize };
    }

    const now = Date.now();
    let state = this.throttleStates.get(identifier);

    if (!state) {
      state = { tokens: config.burstSize, lastRefill: now };
      this.throttleStates.set(identifier, state);
    }

    // Refill tokens based on time elapsed
    const timeSinceRefill = (now - state.lastRefill) / 1000;
    const tokensToAdd = timeSinceRefill * config.maxRequestsPerSecond;
    state.tokens = Math.min(config.burstSize, state.tokens + tokensToAdd);
    state.lastRefill = now;

    if (state.tokens >= 1) {
      state.tokens -= 1;
      this.throttleStates.set(identifier, state);
      return { allowed: true, remainingTokens: Math.floor(state.tokens) };
    }

    // Rate limited - calculate retry time
    const retryAfter = Math.ceil((1 - state.tokens) / config.maxRequestsPerSecond);

    // Check for persistent abuse (store in Redis)
    if (isRedisConnected()) {
      const abuseKey = `${REDIS_KEYS.QUEUE_PREFIX}:abuse:${identifier}`;
      const abuseCount = await redisClient.incr(abuseKey);
      await redisClient.expire(abuseKey, config.penaltySeconds);

      if (abuseCount > 10) {
        return {
          allowed: false,
          remainingTokens: 0,
          retryAfter: config.penaltySeconds,
        };
      }
    }

    return { allowed: false, remainingTokens: 0, retryAfter };
  }

  /**
   * Get queue metrics for analytics
   */
  async getQueueMetrics(saleId: string): Promise<{
    current: QueueHealth;
    history: { timestamp: Date; queueSize: number; throughput: number }[];
    performance: { avgWaitTime: number; completionRate: number; abandonmentRate: number };
  }> {
    const current = await priorityQueueService.getQueueHealth(saleId);

    // Get historical metrics from Redis
    let history: { timestamp: Date; queueSize: number; throughput: number }[] = [];

    if (isRedisConnected()) {
      const metricsKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:queue:${saleId}:metrics`;
      const rawHistory = await redisClient.lrange(metricsKey, 0, 59); // Last 60 data points

      history = rawHistory.map((h) => {
        const data = JSON.parse(h);
        return {
          timestamp: new Date(data.timestamp),
          queueSize: data.queueSize,
          throughput: data.throughput,
        };
      });

      // Store current metrics
      await redisClient.lpush(
        metricsKey,
        JSON.stringify({
          timestamp: new Date(),
          queueSize: current.totalInQueue,
          throughput: current.throughput,
        }),
      );
      await redisClient.ltrim(metricsKey, 0, 59);
      await redisClient.expire(metricsKey, 3600);
    }

    // Calculate performance metrics
    const completedKey = `${REDIS_KEYS.QUEUE_PREFIX}:completed:${saleId}`;
    let completedCount = 0;
    if (isRedisConnected()) {
      completedCount = await redisClient.llen(completedKey);
    }

    const totalProcessed = completedCount + current.processingCount;
    const completionRate = totalProcessed > 0 ? (completedCount / totalProcessed) * 100 : 100;

    // Estimate abandonment (simplified)
    const abandonmentRate =
      current.averageWaitTime > 600 ? 15 : current.averageWaitTime > 300 ? 8 : 3;

    return {
      current,
      history,
      performance: {
        avgWaitTime: current.averageWaitTime,
        completionRate: Math.round(completionRate),
        abandonmentRate,
      },
    };
  }

  /**
   * Optimize queue for a flash sale
   */
  async optimizeForSale(
    saleId: string,
    expectedParticipants: number,
    saleDurationMinutes: number,
  ): Promise<QueueConfig & { optimizationNotes: string[] }> {
    const prediction = await this.predictCongestion(saleId, expectedParticipants);
    const notes: string[] = [];

    // Calculate optimal settings
    let maxConcurrent = Math.min(
      MAX_CONCURRENT,
      Math.max(MIN_CONCURRENT, Math.ceil(expectedParticipants / 20)),
    );

    let batchSize = Math.ceil(maxConcurrent / 10);
    const vipSlots = Math.ceil(maxConcurrent * 0.15); // 15% reserved for VIP

    // Adjust based on duration
    if (saleDurationMinutes < 30) {
      // Short sale - maximize throughput
      maxConcurrent = Math.ceil(maxConcurrent * 1.5);
      batchSize = Math.ceil(batchSize * 1.5);
      notes.push('Increased capacity for short-duration sale');
    }

    // Adjust based on prediction
    if (prediction.congestionRisk === 'high') {
      maxConcurrent = prediction.recommendedConcurrent;
      notes.push('Applied high-congestion optimization');
    }

    priorityQueueService.configureQueue(saleId, {
      maxConcurrent,
      batchSize,
      vipSlots,
      processingTimeoutSeconds: Math.max(180, (saleDurationMinutes * 60) / 4),
    });

    notes.push(`Configured for ${expectedParticipants} expected participants`);
    notes.push(`Estimated throughput: ${Math.round(maxConcurrent / 2)} users/minute`);

    logger.info(`⚙️ Optimized queue for sale ${saleId}: ${notes.join(', ')}`);

    // Return SmartQueueService's QueueConfig format
    return {
      maxConcurrent,
      batchSize,
      vipSlots,
      enableThrottling: prediction.congestionRisk !== 'low',
      throttleLimit: prediction.congestionRisk === 'high' ? 50 : 100,
      optimizationNotes: notes,
    };
  }

  /**
   * Load balance across queue instances
   */
  async getOptimalQueueInstance(saleId: string): Promise<string> {
    // In a distributed system, this would select the least loaded instance
    // For now, return the default instance
    if (!isRedisConnected()) return 'default';

    const instancesKey = `${REDIS_KEYS.QUEUE_PREFIX}:instances:${saleId}`;
    const instances = await redisClient.smembers(instancesKey);

    if (instances.length === 0) {
      return 'default';
    }

    // Find instance with lowest load
    let minLoad = Infinity;
    let optimalInstance = instances[0];

    for (const instance of instances) {
      const loadKey = `${REDIS_KEYS.QUEUE_PREFIX}:load:${instance}`;
      const loadStr = await redisClient.get(loadKey);
      const load = loadStr ? parseInt(loadStr) : 0;

      if (load < minLoad) {
        minLoad = load;
        optimalInstance = instance;
      }
    }

    return optimalInstance;
  }

  /**
   * Reset throttle state for identifier
   */
  resetThrottle(identifier: string): void {
    this.throttleStates.delete(identifier);
  }

  /**
   * Clear all throttle states
   */
  clearAllThrottles(): void {
    this.throttleStates.clear();
  }
}

// Export singleton
export const smartQueueService = new SmartQueueService();
export default smartQueueService;
