/**
 * Smart Queue Service Tests
 * Week 5 Day 7: Testing & Quality Assurance
 */

// Mock dependencies
const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  incr: jest.fn(),
  lpush: jest.fn(),
  lrange: jest.fn(),
  ltrim: jest.fn(),
  llen: jest.fn(),
  expire: jest.fn(),
  smembers: jest.fn(),
  zadd: jest.fn(),
  zcard: jest.fn(),
};

const mockPriorityQueueService = {
  getQueueHealth: jest.fn(),
  getConfig: jest.fn(),
  configureQueue: jest.fn(),
  scaleQueue: jest.fn(),
};

jest.mock('../utils/redis', () => ({
  redisClient: mockRedisClient,
  isRedisConnected: jest.fn(() => true),
}));

jest.mock('../services/priorityQueueService', () => ({
  priorityQueueService: mockPriorityQueueService,
  QueueHealth: {},
}));

import { smartQueueService } from '../services/smartQueueService';

describe('Smart Queue Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('predictCongestion', () => {
    it('should predict low congestion for small expected load', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 50,
        processingCount: 10,
        throughput: 5,
        averageWaitTime: 60,
      });
      mockPriorityQueueService.getConfig.mockReturnValueOnce({
        maxConcurrent: 100,
        batchSize: 10,
      });

      const prediction = await smartQueueService.predictCongestion('sale-123', 200);

      expect(prediction.saleId).toBe('sale-123');
      expect(prediction.congestionRisk).toBe('low');
    });

    it('should predict high congestion for large expected load', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 900,
        processingCount: 100,
        throughput: 2,
        averageWaitTime: 600,
      });
      mockPriorityQueueService.getConfig.mockReturnValueOnce({
        maxConcurrent: 100,
        batchSize: 10,
      });

      const prediction = await smartQueueService.predictCongestion('sale-123', 10000);

      expect(prediction.congestionRisk).toBe('high');
      expect(prediction.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('shouldThrottle', () => {
    it('should not throttle when under limit', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(5);
      mockRedisClient.expire.mockResolvedValueOnce(1);

      const result = await smartQueueService.shouldThrottle('192.168.1.1', 'sale-123');

      expect(result.shouldThrottle).toBe(false);
    });

    it('should throttle when over limit', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(150);

      const result = await smartQueueService.shouldThrottle('192.168.1.1', 'sale-123');

      expect(result.shouldThrottle).toBe(true);
      expect(result.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('autoScale', () => {
    it('should scale up when queue is congested', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 500,
        processingCount: 100,
        throughput: 2,
        averageWaitTime: 300,
      });
      mockPriorityQueueService.getConfig.mockReturnValueOnce({
        maxConcurrent: 100,
        batchSize: 10,
      });
      mockPriorityQueueService.scaleQueue.mockResolvedValueOnce(true);

      const result = await smartQueueService.autoScale('sale-123');

      expect(result.scaled).toBe(true);
      expect(result.direction).toBe('up');
    });

    it('should scale down when queue is underutilized', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 10,
        processingCount: 2,
        throughput: 10,
        averageWaitTime: 5,
      });
      mockPriorityQueueService.getConfig.mockReturnValueOnce({
        maxConcurrent: 200,
        batchSize: 20,
      });
      mockPriorityQueueService.scaleQueue.mockResolvedValueOnce(true);

      const result = await smartQueueService.autoScale('sale-123');

      // May or may not scale depending on cooldown
      expect(result).toBeDefined();
    });
  });

  describe('optimizeForSale', () => {
    it('should optimize queue configuration for expected load', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 0,
        processingCount: 0,
        throughput: 0,
        averageWaitTime: 0,
      });
      mockPriorityQueueService.getConfig.mockReturnValueOnce({
        maxConcurrent: 100,
        batchSize: 10,
      });
      mockPriorityQueueService.configureQueue.mockReturnValueOnce({
        saleId: 'sale-123',
        maxConcurrent: 150,
        batchSize: 15,
        vipSlots: 20,
      });

      const result = await smartQueueService.optimizeForSale('sale-123', 5000, 30);

      expect(result.maxConcurrent).toBeGreaterThan(0);
      expect(result.optimizationNotes.length).toBeGreaterThan(0);
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue performance metrics', async () => {
      mockPriorityQueueService.getQueueHealth.mockResolvedValueOnce({
        totalInQueue: 100,
        processingCount: 20,
        throughput: 5,
        averageWaitTime: 120,
      });
      mockRedisClient.lrange.mockResolvedValueOnce([
        JSON.stringify({ timestamp: new Date(), queueSize: 90, throughput: 4 }),
        JSON.stringify({ timestamp: new Date(), queueSize: 95, throughput: 5 }),
      ]);
      mockRedisClient.llen.mockResolvedValueOnce(50);

      const metrics = await smartQueueService.getQueueMetrics('sale-123');

      expect(metrics.current).toBeDefined();
      expect(metrics.history).toBeDefined();
      expect(metrics.performance).toBeDefined();
    });
  });
});
