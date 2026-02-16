/**
 * VIP Service Tests
 * Week 5 Day 7: Testing & Quality Assurance
 */

// Mock dependencies before imports
jest.mock('../utils/redis', () => ({
  redisClient: {
    get: jest.fn(),
    set: jest.fn(),
    hgetall: jest.fn(),
    hset: jest.fn(),
    del: jest.fn(),
    sadd: jest.fn(),
    smembers: jest.fn(),
    sismember: jest.fn(),
    zadd: jest.fn(),
    zrange: jest.fn(),
    expire: jest.fn(),
  },
  isRedisConnected: jest.fn(() => true),
}));

jest.mock('../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

import { vipService, VIPTier } from '../services/vipService';
import redisClient from '../utils/redis';
import pool from '../utils/database';

const mockRedisClient = redisClient as jest.Mocked<typeof redisClient>;
const mockPool = pool as jest.Mocked<typeof pool>;

describe('VIP Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createMembership', () => {
    it('should create a new VIP membership', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 'user-123' }],
      });

      const membership = await vipService.createMembership('user-123', VIPTier.GOLD);

      expect(membership).toBeDefined();
      expect(membership.userId).toBe('user-123');
      expect(membership.tier).toBe(VIPTier.GOLD);
      expect(membership.isActive).toBe(true);
    });

    it('should throw error for invalid user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
      });

      await expect(vipService.createMembership('invalid-user', VIPTier.SILVER)).rejects.toThrow();
    });
  });

  describe('getMembership', () => {
    it('should return cached membership', async () => {
      const cachedMembership = {
        userId: 'user-123',
        tier: VIPTier.GOLD,
        isActive: 'true',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        benefits: JSON.stringify({ earlyAccess: 60, prioritySupport: true }),
      };

      mockRedisClient.hgetall.mockResolvedValueOnce(cachedMembership);

      const membership = await vipService.getMembership('user-123');

      expect(membership).toBeDefined();
      expect(membership?.userId).toBe('user-123');
      expect(membership?.tier).toBe(VIPTier.GOLD);
    });

    it('should return null for non-VIP user', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const membership = await vipService.getMembership('non-vip-user');

      expect(membership).toBeNull();
    });
  });

  describe('upgradeTier', () => {
    it('should upgrade membership tier', async () => {
      const existingMembership = {
        userId: 'user-123',
        tier: VIPTier.SILVER,
        isActive: 'true',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        benefits: JSON.stringify({}),
      };

      mockRedisClient.hgetall.mockResolvedValueOnce(existingMembership);
      mockRedisClient.hset.mockResolvedValueOnce(1);
      mockPool.query.mockResolvedValueOnce({ rows: [{}] });

      const upgraded = await vipService.upgradeTier('user-123', VIPTier.GOLD);

      expect(upgraded.tier).toBe(VIPTier.GOLD);
    });

    it('should not allow downgrade', async () => {
      const existingMembership = {
        userId: 'user-123',
        tier: VIPTier.PLATINUM,
        isActive: 'true',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        benefits: JSON.stringify({}),
      };

      mockRedisClient.hgetall.mockResolvedValueOnce(existingMembership);

      await expect(vipService.upgradeTier('user-123', VIPTier.SILVER)).rejects.toThrow();
    });
  });

  describe('getBenefits', () => {
    it('should return correct benefits for SILVER tier', () => {
      const benefits = vipService.getBenefits(VIPTier.SILVER);

      expect(benefits.earlyAccessMinutes).toBe(15);
      expect(benefits.queuePriority).toBeGreaterThan(1);
    });

    it('should return correct benefits for PLATINUM tier', () => {
      const benefits = vipService.getBenefits(VIPTier.PLATINUM);

      expect(benefits.earlyAccessMinutes).toBe(60);
      expect(benefits.queuePriority).toBeGreaterThan(1);
      expect(benefits.exclusiveDeals).toBe(true);
    });
  });

  describe('hasEarlyAccess', () => {
    it('should grant early access to VIP members', async () => {
      const membership = {
        userId: 'user-123',
        tier: VIPTier.GOLD,
        isActive: 'true',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: new Date().toISOString(),
        benefits: JSON.stringify({ earlyAccess: 30 }),
      };

      mockRedisClient.hgetall.mockResolvedValueOnce(membership);

      // Sale starts in 20 minutes
      const saleStartTime = new Date(Date.now() + 20 * 60 * 1000);
      const result = await vipService.hasEarlyAccess('user-123', saleStartTime);

      expect(result.hasAccess).toBe(true);
    });

    it('should deny early access to non-VIP users', async () => {
      mockRedisClient.hgetall.mockResolvedValueOnce(null);
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const saleStartTime = new Date(Date.now() + 20 * 60 * 1000);
      const result = await vipService.hasEarlyAccess('non-vip', saleStartTime);

      expect(result.hasAccess).toBe(false);
    });
  });
});
