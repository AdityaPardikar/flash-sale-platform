import { queueService } from '../services/queueService';
import { queueEntryManager, QueueEntry } from '../services/queueEntryManager';
import pool from '../utils/database';
import redisClient from '../utils/redis';
import { buildQueueKey } from '../config/redisKeys';

// Mock dependencies
jest.mock('../utils/database');
jest.mock('../utils/redis');
jest.mock('../config/redisKeys');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-123'),
}));
jest.mock('../services/analyticsService', () => ({
  analyticsService: {
    trackQueueJoin: jest.fn(),
    trackEvent: jest.fn(),
  },
}));

describe('QueueService', () => {
  const mockUserId = 'user-123';
  const mockSaleId = 'sale-456';
  const mockQueueKey = 'queue:sale-456';

  beforeEach(() => {
    jest.clearAllMocks();
    (buildQueueKey as jest.Mock).mockReturnValue(mockQueueKey);
  });

  describe('joinQueue', () => {
    it('should successfully join queue when user is not already in queue', async () => {
      (redisClient.zscore as jest.Mock).mockResolvedValue(null);
      (redisClient.zcard as jest.Mock).mockResolvedValue(5);
      (redisClient.zadd as jest.Mock).mockResolvedValue(1);
      (redisClient.zrank as jest.Mock).mockResolvedValue(5);
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await queueService.joinQueue(mockUserId, mockSaleId);

      expect(redisClient.zscore).toHaveBeenCalledWith(mockQueueKey, mockUserId);
      expect(redisClient.zadd).toHaveBeenCalledWith(mockQueueKey, expect.any(Number), mockUserId);
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('totalAhead');
    });

    it('should return current position if user is already in queue', async () => {
      (redisClient.zscore as jest.Mock).mockResolvedValue(Date.now());
      (redisClient.zrank as jest.Mock).mockResolvedValue(3);
      (redisClient.zcard as jest.Mock).mockResolvedValue(10);

      const result = await queueService.joinQueue(mockUserId, mockSaleId);

      expect(redisClient.zadd).not.toHaveBeenCalled();
      expect(result.position).toBe(4); // rank 3 + 1
    });

    it('should throw error when queue is full', async () => {
      (redisClient.zscore as jest.Mock).mockResolvedValue(null);
      (redisClient.zcard as jest.Mock).mockResolvedValue(10000); // MAX_QUEUE_SIZE

      await expect(queueService.joinQueue(mockUserId, mockSaleId)).rejects.toThrow('Queue is full');
    });
  });

  describe('leaveQueue', () => {
    it('should successfully leave queue when user is in queue', async () => {
      (redisClient.zrem as jest.Mock).mockResolvedValue(1);
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 1 });

      const result = await queueService.leaveQueue(mockUserId, mockSaleId);

      expect(result).toBe(true);
      expect(redisClient.zrem).toHaveBeenCalledWith(mockQueueKey, mockUserId);
    });

    it('should return false when user is not in queue', async () => {
      (redisClient.zrem as jest.Mock).mockResolvedValue(0);

      const result = await queueService.leaveQueue(mockUserId, mockSaleId);

      expect(result).toBe(false);
    });
  });

  describe('getQueuePosition', () => {
    it('should return correct position information', async () => {
      (redisClient.zrank as jest.Mock).mockResolvedValue(5); // 6th position
      (redisClient.zscore as jest.Mock).mockResolvedValue(Date.now());
      (redisClient.zcard as jest.Mock).mockResolvedValue(10);

      const result = await queueService.getQueuePosition(mockUserId, mockSaleId);

      expect(result.position).toBe(6);
      expect(result.totalAhead).toBe(5);
      expect(result.totalBehind).toBe(4);
      expect(result.estimatedWaitMinutes).toBeGreaterThan(0);
    });

    it('should throw error when user is not in queue', async () => {
      (redisClient.zrank as jest.Mock).mockResolvedValue(null);

      await expect(queueService.getQueuePosition(mockUserId, mockSaleId)).rejects.toThrow(
        'User not in queue'
      );
    });
  });

  describe('getQueueLength', () => {
    it('should return correct queue length', async () => {
      (redisClient.zcard as jest.Mock).mockResolvedValue(15);

      const result = await queueService.getQueueLength(mockSaleId);

      expect(result).toBe(15);
    });
  });

  describe('isInQueue', () => {
    it('should return true when user is in queue', async () => {
      (redisClient.zscore as jest.Mock).mockResolvedValue(Date.now());

      const result = await queueService.isInQueue(mockUserId, mockSaleId);

      expect(result).toBe(true);
    });

    it('should return false when user is not in queue', async () => {
      (redisClient.zscore as jest.Mock).mockResolvedValue(null);

      const result = await queueService.isInQueue(mockUserId, mockSaleId);

      expect(result).toBe(false);
    });
  });

  describe('admitNextBatch', () => {
    it('should admit specified number of users', async () => {
      const mockUserIds = ['user-1', 'user-2', 'user-3'];
      (redisClient.zrange as jest.Mock).mockResolvedValue(mockUserIds);
      (redisClient.zrem as jest.Mock).mockResolvedValue(3);
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 3 });

      const result = await queueService.admitNextBatch(mockSaleId, 3);

      expect(result).toEqual(mockUserIds);
      expect(redisClient.zrem).toHaveBeenCalledWith(mockQueueKey, ...mockUserIds);
    });

    it('should return empty array when queue is empty', async () => {
      (redisClient.zrange as jest.Mock).mockResolvedValue([]);

      const result = await queueService.admitNextBatch(mockSaleId);

      expect(result).toEqual([]);
      expect(redisClient.zrem).not.toHaveBeenCalled();
    });
  });

  describe('clearQueue', () => {
    it('should clear entire queue', async () => {
      (redisClient.zcard as jest.Mock).mockResolvedValue(10);
      (redisClient.del as jest.Mock).mockResolvedValue(1);
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 10 });

      const result = await queueService.clearQueue(mockSaleId);

      expect(result).toBe(10);
      expect(redisClient.del).toHaveBeenCalledWith(mockQueueKey);
    });
  });

  describe('getQueueStats', () => {
    it('should return comprehensive queue statistics', async () => {
      (redisClient.zcard as jest.Mock).mockResolvedValue(20);

      const result = await queueService.getQueueStats(mockSaleId);

      expect(result).toHaveProperty('totalWaiting', 20);
      expect(result).toHaveProperty('estimatedWaitTimeMinutes');
      expect(result).toHaveProperty('averageProcessingTimeSeconds', 30);
      expect(result).toHaveProperty('admissionRate');
    });
  });
});

describe('QueueEntryManager', () => {
  const mockUserId = 'user-123';
  const mockSaleId = 'sale-456';
  const mockEntry: QueueEntry = {
    id: 'entry-789',
    user_id: mockUserId,
    flash_sale_id: mockSaleId,
    position: 1,
    status: 'waiting',
    joined_at: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createEntry', () => {
    it('should create new queue entry', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 'entry-789',
            user_id: mockUserId,
            flash_sale_id: mockSaleId,
            position: 1,
            status: 'waiting',
            joined_at: new Date(),
          },
        ],
      });

      const result = await queueEntryManager.createEntry({
        user_id: mockUserId,
        flash_sale_id: mockSaleId,
        position: 1,
      });

      expect(result).toHaveProperty('id');
      expect(result.user_id).toBe(mockUserId);
      expect(result.status).toBe('waiting');
    });
  });

  describe('getEntryByUser', () => {
    it('should return entry when found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 'entry-789',
            user_id: mockUserId,
            flash_sale_id: mockSaleId,
            position: 1,
            status: 'waiting',
            joined_at: new Date(),
          },
        ],
      });

      const result = await queueEntryManager.getEntryByUser(mockUserId, mockSaleId);

      expect(result).not.toBeNull();
      expect(result?.user_id).toBe(mockUserId);
    });

    it('should return null when entry not found', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await queueEntryManager.getEntryByUser(mockUserId, mockSaleId);

      expect(result).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update entry status', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            ...mockEntry,
            status: 'reserved',
            updated_at: new Date(),
          },
        ],
      });

      const result = await queueEntryManager.updateStatus(mockUserId, mockSaleId, 'reserved');

      expect(result?.status).toBe('reserved');
    });
  });

  describe('getExpiredReservations', () => {
    it('should return expired reservations', async () => {
      const expiredEntry = {
        ...mockEntry,
        status: 'reserved',
        updated_at: new Date(Date.now() - 15 * 60 * 1000), // 15 minutes ago
      };

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [expiredEntry],
      });

      const result = await queueEntryManager.getExpiredReservations(mockSaleId);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].status).toBe('reserved');
    });
  });

  describe('timeoutExpiredReservations', () => {
    it('should timeout expired reservations', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 5 });

      const result = await queueEntryManager.timeoutExpiredReservations(mockSaleId);

      expect(result).toBe(5);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            total_joined: '100',
            waiting: '40',
            reserved: '10',
            purchased: '30',
            cancelled: '20',
          },
        ],
      });

      const result = await queueEntryManager.getQueueStats(mockSaleId);

      expect(result.totalJoined).toBe(100);
      expect(result.waiting).toBe(40);
      expect(result.purchased).toBe(30);
      expect(result.conversionRate).toBe(30); // 30/100 * 100 = 30%
    });
  });

  describe('hasActiveEntry', () => {
    it('should return true when user has active entry', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [{ id: 'entry-789' }] });

      const result = await queueEntryManager.hasActiveEntry(mockUserId, mockSaleId);

      expect(result).toBe(true);
    });

    it('should return false when user has no active entry', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await queueEntryManager.hasActiveEntry(mockUserId, mockSaleId);

      expect(result).toBe(false);
    });
  });

  describe('cleanupOldEntries', () => {
    it('should delete old entries', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rowCount: 15 });

      const result = await queueEntryManager.cleanupOldEntries(30);

      expect(result).toBe(15);
    });
  });
});

describe('Queue Integration Tests', () => {
  describe('Concurrent join operations', () => {
    it('should handle multiple users joining simultaneously', async () => {
      const mockSaleId = 'sale-789';
      const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

      // Mock Redis operations
      (redisClient.zscore as jest.Mock).mockResolvedValue(null);
      (redisClient.zcard as jest.Mock).mockImplementation(() => {
        const calls = (redisClient.zcard as jest.Mock).mock.calls.length;
        return Promise.resolve(calls - 1);
      });
      (redisClient.zadd as jest.Mock).mockResolvedValue(1);
      (redisClient.zrank as jest.Mock).mockImplementation(() => {
        const calls = (redisClient.zrank as jest.Mock).mock.calls.length;
        return Promise.resolve(calls - 1);
      });
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });
      (buildQueueKey as jest.Mock).mockReturnValue(`queue:${mockSaleId}`);

      // Simulate concurrent joins
      const joinPromises = userIds.map((userId) => queueService.joinQueue(userId, mockSaleId));

      const results = await Promise.all(joinPromises);

      expect(results.length).toBe(5);
      results.forEach((result) => {
        expect(result).toHaveProperty('position');
        expect(result).toHaveProperty('totalAhead');
      });
    });
  });
});
