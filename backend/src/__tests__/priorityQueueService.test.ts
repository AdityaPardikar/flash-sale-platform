/**
 * Priority Queue Service Tests
 * Week 5 Day 7: Testing & Quality Assurance
 */

// Mock dependencies before imports
jest.mock('../utils/redis', () => ({
  redisClient: {
    zadd: jest.fn(),
    zrank: jest.fn(),
    zrange: jest.fn(),
    zrangebyscore: jest.fn(),
    zrem: jest.fn(),
    zscore: jest.fn(),
    zcard: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    hset: jest.fn(),
    hgetall: jest.fn(),
    lpush: jest.fn(),
    llen: jest.fn(),
    expire: jest.fn(),
  },
  isRedisConnected: jest.fn(() => true),
}));

jest.mock('../services/vipService', () => ({
  vipService: {
    getMembership: jest.fn(),
    getBenefits: jest.fn(() => ({
      earlyAccessMinutes: 0,
      queuePriority: 1,
      maxQuantityPerSale: 2,
      exclusiveDeals: false,
      freeShipping: false,
      discountPercentage: 0,
    })),
  },
  VIPTier: {
    STANDARD: 'standard',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum',
  },
}));

import { priorityQueueService } from '../services/priorityQueueService';
import { vipService } from '../services/vipService';
import redisClient from '../utils/redis';

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockVipService = vipService as jest.Mocked<typeof vipService>;

describe('Priority Queue Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueue', () => {
    it('should add standard user to queue with base priority', async () => {
      mockVipService.getMembership.mockResolvedValueOnce(null);
      mockRedisClient.zadd.mockResolvedValueOnce(1);
      mockRedisClient.zrank.mockResolvedValueOnce(5);
      mockRedisClient.zcard.mockResolvedValueOnce(10);
      mockRedisClient.hset.mockResolvedValueOnce(1);

      const entry = await priorityQueueService.enqueue('user-123', 'sale-456');

      expect(entry.userId).toBe('user-123');
      expect(entry.saleId).toBe('sale-456');
      expect(entry.position).toBe(6); // 0-indexed + 1
      expect(mockRedisClient.zadd).toHaveBeenCalled();
    });

    it('should add VIP user with boosted priority', async () => {
      mockVipService.getMembership.mockResolvedValueOnce({
        isActive: true,
        tier: 'gold',
      });
      mockVipService.getTierBenefits.mockReturnValueOnce({
        queuePriorityBoost: 2.0,
      });
      mockRedisClient.zadd.mockResolvedValueOnce(1);
      mockRedisClient.zrank.mockResolvedValueOnce(2);
      mockRedisClient.zcard.mockResolvedValueOnce(10);
      mockRedisClient.hset.mockResolvedValueOnce(1);

      const entry = await priorityQueueService.enqueue('vip-user', 'sale-456');

      expect(entry.position).toBe(3);
      // VIP should get higher priority (lower score)
      const zaddCall = mockRedisClient.zadd.mock.calls[0];
      expect(zaddCall).toBeDefined();
    });
  });

  describe('getPosition', () => {
    it('should return correct queue position', async () => {
      mockRedisClient.zrank.mockResolvedValueOnce(3);
      mockRedisClient.zcard.mockResolvedValueOnce(20);

      const result = await priorityQueueService.getPosition('user-123', 'sale-456');

      expect(result.position).toBe(4); // 0-indexed + 1
      expect(result.totalInQueue).toBe(20);
    });

    it('should return null for user not in queue', async () => {
      mockRedisClient.zrank.mockResolvedValueOnce(null);

      const result = await priorityQueueService.getPosition('user-123', 'sale-456');

      expect(result.position).toBe(-1);
    });
  });

  describe('dequeue', () => {
    it('should remove user from queue', async () => {
      mockRedisClient.zrem.mockResolvedValueOnce(1);

      const removed = await priorityQueueService.dequeue('user-123', 'sale-456');

      expect(removed).toBe(true);
      expect(mockRedisClient.zrem).toHaveBeenCalled();
    });
  });

  describe('processBatch', () => {
    it('should process batch of users from queue', async () => {
      const mockUsers = ['user-1', 'user-2', 'user-3'];
      mockRedisClient.zrange.mockResolvedValueOnce(mockUsers);
      mockRedisClient.zrem.mockResolvedValue(1);
      mockRedisClient.set.mockResolvedValue('OK');
      mockRedisClient.lpush.mockResolvedValue(1);

      const processed = await priorityQueueService.processBatch('sale-456', 3);

      expect(processed).toHaveLength(3);
      expect(processed).toEqual(mockUsers);
    });
  });

  describe('configureQueue', () => {
    it('should configure queue settings', () => {
      const config = priorityQueueService.configureQueue('sale-456', {
        maxConcurrent: 200,
        batchSize: 20,
        processingTimeoutSeconds: 600,
        vipSlots: 30,
      });

      expect(config.saleId).toBe('sale-456');
      expect(config.maxConcurrent).toBe(200);
      expect(config.vipSlots).toBe(30);
    });
  });

  describe('getQueueHealth', () => {
    it('should return queue health metrics', async () => {
      mockRedisClient.zcard.mockResolvedValueOnce(100);
      mockRedisClient.llen.mockResolvedValueOnce(15);
      mockRedisClient.get.mockResolvedValueOnce('50');

      const health = await priorityQueueService.getQueueHealth('sale-456');

      expect(health.totalInQueue).toBe(100);
      expect(health.processingCount).toBe(15);
    });
  });
});
