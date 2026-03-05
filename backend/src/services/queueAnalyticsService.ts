/**
 * Queue Analytics Service
 * Week 5 Day 3: Advanced Queue Features & VIP System
 *
 * Features:
 * - Real-time queue metrics
 * - Queue efficiency analytics
 * - User journey tracking
 * - Queue abandonment analysis
 * - Performance KPI dashboard
 * - Queue optimization reports
 */

import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Types
export interface QueueKPIs {
  saleId: string;
  period: 'realtime' | 'hourly' | 'daily';
  metrics: {
    totalEnqueued: number;
    totalCompleted: number;
    totalAbandoned: number;
    averageWaitTime: number;
    medianWaitTime: number;
    p95WaitTime: number;
    conversionRate: number;
    throughputPerMinute: number;
    peakQueueSize: number;
    currentQueueSize: number;
  };
  timestamp: Date;
}

export interface UserJourney {
  userId: string;
  saleId: string;
  stages: JourneyStage[];
  totalDuration: number;
  outcome: 'completed' | 'abandoned' | 'in_progress';
  abandonmentStage?: string;
}

export interface JourneyStage {
  stage: string;
  enteredAt: Date;
  exitedAt?: Date;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export interface AbandonmentAnalysis {
  saleId: string;
  totalAbandoned: number;
  abandonmentRate: number;
  topReasons: { reason: string; count: number; percentage: number }[];
  abandonmentByStage: { stage: string; count: number; percentage: number }[];
  averageTimeToAbandon: number;
  recommendations: string[];
}

export interface QueueEfficiencyReport {
  saleId: string;
  period: { start: Date; end: Date };
  efficiency: {
    score: number; // 0-100
    throughputEfficiency: number;
    waitTimeEfficiency: number;
    conversionEfficiency: number;
  };
  bottlenecks: string[];
  improvements: string[];
  comparison: {
    vsLastSale: number;
    vsAverage: number;
  };
}

// Constants
const ANALYTICS_CACHE_TTL = 60; // 1 minute
const JOURNEY_TTL = 86400; // 24 hours

class QueueAnalyticsService {
  /**
   * Get real-time KPIs
   */
  async getRealtimeKPIs(saleId: string): Promise<QueueKPIs> {
    const cacheKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:queue:${saleId}:realtime`;

    if (isRedisConnected()) {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    // Gather metrics
    const metrics = await this.calculateMetrics(saleId, 'realtime');

    const kpis: QueueKPIs = {
      saleId,
      period: 'realtime',
      metrics,
      timestamp: new Date(),
    };

    if (isRedisConnected()) {
      await redisClient.setex(cacheKey, ANALYTICS_CACHE_TTL, JSON.stringify(kpis));
    }

    return kpis;
  }

  /**
   * Track user journey stage
   */
  async trackJourneyStage(
    userId: string,
    saleId: string,
    stage: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!isRedisConnected()) return;

    const journeyKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journey:${userId}:${saleId}`;
    const stageData: JourneyStage = {
      stage,
      enteredAt: new Date(),
      metadata,
    };

    // Get existing journey
    const existingData = await redisClient.get(journeyKey);
    let journey: Partial<UserJourney>;

    if (existingData) {
      journey = JSON.parse(existingData);

      // Close previous stage
      if (journey.stages && journey.stages.length > 0) {
        const lastStage = journey.stages[journey.stages.length - 1];
        if (!lastStage.exitedAt) {
          lastStage.exitedAt = new Date();
          lastStage.duration = new Date().getTime() - new Date(lastStage.enteredAt).getTime();
        }
      }

      journey.stages = [...(journey.stages || []), stageData];
    } else {
      journey = {
        userId,
        saleId,
        stages: [stageData],
        outcome: 'in_progress',
      };
    }

    await redisClient.setex(journeyKey, JOURNEY_TTL, JSON.stringify(journey));

    // Track stage entry count
    const stageCountKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:stages:${saleId}:${stage}`;
    await redisClient.incr(stageCountKey);
    await redisClient.expire(stageCountKey, JOURNEY_TTL);
  }

  /**
   * Complete user journey
   */
  async completeJourney(
    userId: string,
    saleId: string,
    outcome: 'completed' | 'abandoned',
    abandonmentReason?: string,
  ): Promise<UserJourney | null> {
    if (!isRedisConnected()) return null;

    const journeyKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journey:${userId}:${saleId}`;
    const existingData = await redisClient.get(journeyKey);

    if (!existingData) return null;

    const journey: UserJourney = JSON.parse(existingData);
    journey.outcome = outcome;

    // Close last stage
    if (journey.stages.length > 0) {
      const lastStage = journey.stages[journey.stages.length - 1];
      if (!lastStage.exitedAt) {
        lastStage.exitedAt = new Date();
        lastStage.duration = new Date().getTime() - new Date(lastStage.enteredAt).getTime();
      }

      if (outcome === 'abandoned') {
        journey.abandonmentStage = lastStage.stage;
      }
    }

    // Calculate total duration
    const firstStage = journey.stages[0];
    journey.totalDuration = new Date().getTime() - new Date(firstStage.enteredAt).getTime();

    // Store completed journey
    await redisClient.setex(journeyKey, JOURNEY_TTL, JSON.stringify(journey));

    // Track outcome
    if (outcome === 'abandoned' && abandonmentReason) {
      const reasonKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:abandonment:${saleId}:reasons`;
      await redisClient.hincrby(reasonKey, abandonmentReason, 1);
      await redisClient.expire(reasonKey, JOURNEY_TTL);
    }

    // Store in completed journeys list
    const completedKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journeys:${saleId}:${outcome}`;
    await redisClient.lpush(completedKey, JSON.stringify(journey));
    await redisClient.ltrim(completedKey, 0, 999);
    await redisClient.expire(completedKey, JOURNEY_TTL);

    return journey;
  }

  /**
   * Analyze queue abandonment
   */
  async analyzeAbandonment(saleId: string): Promise<AbandonmentAnalysis> {
    const abandonedKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journeys:${saleId}:abandoned`;
    const completedKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journeys:${saleId}:completed`;
    const reasonsKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:abandonment:${saleId}:reasons`;

    let abandonedJourneys: UserJourney[] = [];
    let completedCount = 0;
    let reasons: Record<string, string> = {};

    if (isRedisConnected()) {
      const abandonedData = await redisClient.lrange(abandonedKey, 0, -1);
      abandonedJourneys = abandonedData.map((d) => JSON.parse(d));
      completedCount = await redisClient.llen(completedKey);
      reasons = (await redisClient.hgetall(reasonsKey)) as Record<string, string>;
    }

    const totalAbandoned = abandonedJourneys.length;
    const total = totalAbandoned + completedCount;
    const abandonmentRate = total > 0 ? (totalAbandoned / total) * 100 : 0;

    // Analyze reasons
    const totalReasons = Object.values(reasons).reduce((a, b) => a + parseInt(String(b)), 0);
    const topReasons = Object.entries(reasons)
      .map(([reason, count]) => ({
        reason,
        count: parseInt(String(count)),
        percentage: totalReasons > 0 ? (parseInt(String(count)) / totalReasons) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Analyze abandonment by stage
    const stageCount: Record<string, number> = {};
    abandonedJourneys.forEach((j) => {
      if (j.abandonmentStage) {
        stageCount[j.abandonmentStage] = (stageCount[j.abandonmentStage] || 0) + 1;
      }
    });

    const abandonmentByStage = Object.entries(stageCount)
      .map(([stage, count]) => ({
        stage,
        count,
        percentage: totalAbandoned > 0 ? (count / totalAbandoned) * 100 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Calculate average time to abandon
    const averageTimeToAbandon =
      abandonedJourneys.length > 0
        ? abandonedJourneys.reduce((sum, j) => sum + j.totalDuration, 0) / abandonedJourneys.length
        : 0;

    // Generate recommendations
    const recommendations: string[] = [];
    if (abandonmentRate > 30) {
      recommendations.push('High abandonment rate - review queue experience');
    }
    if (averageTimeToAbandon < 60000) {
      recommendations.push('Users abandoning quickly - check queue entry experience');
    }
    if (abandonmentByStage.length > 0 && abandonmentByStage[0].percentage > 50) {
      recommendations.push(`Focus on improving the "${abandonmentByStage[0].stage}" stage`);
    }

    return {
      saleId,
      totalAbandoned,
      abandonmentRate: Math.round(abandonmentRate * 10) / 10,
      topReasons,
      abandonmentByStage,
      averageTimeToAbandon,
      recommendations,
    };
  }

  /**
   * Generate efficiency report
   */
  async generateEfficiencyReport(saleId: string): Promise<QueueEfficiencyReport> {
    const kpis = await this.getRealtimeKPIs(saleId);
    const abandonment = await this.analyzeAbandonment(saleId);

    // Calculate efficiency scores
    const throughputEfficiency = Math.min(100, kpis.metrics.throughputPerMinute * 5);
    const waitTimeEfficiency = Math.max(0, 100 - kpis.metrics.averageWaitTime / 60);
    const conversionEfficiency = kpis.metrics.conversionRate;

    const overallScore = Math.round(
      throughputEfficiency * 0.3 + waitTimeEfficiency * 0.3 + conversionEfficiency * 0.4,
    );

    // Identify bottlenecks
    const bottlenecks: string[] = [];
    if (kpis.metrics.averageWaitTime > 300) {
      bottlenecks.push('High average wait times');
    }
    if (kpis.metrics.conversionRate < 50) {
      bottlenecks.push('Low conversion rate');
    }
    if (abandonment.abandonmentRate > 20) {
      bottlenecks.push('High abandonment rate');
    }

    // Generate improvement suggestions
    const improvements: string[] = [];
    if (throughputEfficiency < 50) {
      improvements.push('Increase batch processing size');
    }
    if (waitTimeEfficiency < 50) {
      improvements.push('Reduce processing time per user');
    }
    if (conversionEfficiency < 70) {
      improvements.push('Optimize checkout flow');
    }

    return {
      saleId,
      period: {
        start: new Date(Date.now() - 3600000),
        end: new Date(),
      },
      efficiency: {
        score: overallScore,
        throughputEfficiency: Math.round(throughputEfficiency),
        waitTimeEfficiency: Math.round(waitTimeEfficiency),
        conversionEfficiency: Math.round(conversionEfficiency),
      },
      bottlenecks,
      improvements,
      comparison: {
        vsLastSale: 5, // Placeholder - would compare with historical data
        vsAverage: 3,
      },
    };
  }

  /**
   * Get dashboard data
   */
  async getDashboardData(saleId: string): Promise<{
    kpis: QueueKPIs;
    abandonment: AbandonmentAnalysis;
    efficiency: QueueEfficiencyReport;
    realtimeStats: {
      currentInQueue: number;
      processingNow: number;
      completedThisHour: number;
      averageWaitNow: number;
    };
  }> {
    const [kpis, abandonment, efficiency] = await Promise.all([
      this.getRealtimeKPIs(saleId),
      this.analyzeAbandonment(saleId),
      this.generateEfficiencyReport(saleId),
    ]);

    return {
      kpis,
      abandonment,
      efficiency,
      realtimeStats: {
        currentInQueue: kpis.metrics.currentQueueSize,
        processingNow: Math.round(kpis.metrics.throughputPerMinute / 6),
        completedThisHour: kpis.metrics.totalCompleted,
        averageWaitNow: kpis.metrics.averageWaitTime,
      },
    };
  }

  // Private helper methods

  private async calculateMetrics(saleId: string, _period: string): Promise<QueueKPIs['metrics']> {
    // Default metrics
    const defaults: QueueKPIs['metrics'] = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalAbandoned: 0,
      averageWaitTime: 0,
      medianWaitTime: 0,
      p95WaitTime: 0,
      conversionRate: 100,
      throughputPerMinute: 0,
      peakQueueSize: 0,
      currentQueueSize: 0,
    };

    if (!isRedisConnected()) return defaults;

    // Get queue sizes
    const queueKey = `${REDIS_KEYS.QUEUE_PREFIX}:priority:${saleId}`;
    const completedKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journeys:${saleId}:completed`;
    const abandonedKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:journeys:${saleId}:abandoned`;

    const [queueSize, completedData, abandonedData] = await Promise.all([
      redisClient.zcard(queueKey),
      redisClient.lrange(completedKey, 0, -1),
      redisClient.lrange(abandonedKey, 0, -1),
    ]);

    const completed: UserJourney[] = completedData.map((d) => JSON.parse(d));
    const abandoned: UserJourney[] = abandonedData.map((d) => JSON.parse(d));

    // Calculate wait times from completed journeys
    const waitTimes = completed
      .map((j) => j.stages.find((s) => s.stage === 'waiting')?.duration || 0)
      .filter((t) => t > 0)
      .sort((a, b) => a - b);

    const averageWaitTime =
      waitTimes.length > 0 ? waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length / 1000 : 0;

    const medianWaitTime =
      waitTimes.length > 0 ? waitTimes[Math.floor(waitTimes.length / 2)] / 1000 : 0;

    const p95WaitTime =
      waitTimes.length > 0 ? waitTimes[Math.floor(waitTimes.length * 0.95)] / 1000 : 0;

    const totalEnqueued = completed.length + abandoned.length + queueSize;
    const conversionRate = totalEnqueued > 0 ? (completed.length / totalEnqueued) * 100 : 100;

    // Estimate throughput (completions per minute in the last minute)
    const recentCompleted = completed.filter((j) => {
      const lastStage = j.stages[j.stages.length - 1];
      const completedAt = lastStage?.exitedAt ? new Date(lastStage.exitedAt).getTime() : 0;
      return Date.now() - completedAt < 60000;
    });

    return {
      totalEnqueued,
      totalCompleted: completed.length,
      totalAbandoned: abandoned.length,
      averageWaitTime: Math.round(averageWaitTime),
      medianWaitTime: Math.round(medianWaitTime),
      p95WaitTime: Math.round(p95WaitTime),
      conversionRate: Math.round(conversionRate * 10) / 10,
      throughputPerMinute: recentCompleted.length,
      peakQueueSize: queueSize, // Would need historical tracking for actual peak
      currentQueueSize: queueSize,
    };
  }
}

// Export singleton
export const queueAnalyticsService = new QueueAnalyticsService();
export default queueAnalyticsService;
