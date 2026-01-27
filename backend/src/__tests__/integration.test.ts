import pool from '../utils/database';
import { saleTimingService } from '../services/saleTimingService';
import { stateMachine } from '../services/stateMachine';
import { backgroundJobRunner } from '../services/backgroundJobRunner';
import { analyticsService } from '../services/analyticsService';
import { FlashSale } from '../models';

// Mock database and Redis
jest.mock('../utils/database');
jest.mock('../utils/redis');

const mockPool = pool as jest.Mocked<typeof pool>;

describe('SaleTimingService', () => {
  describe('calculateTimeRemaining', () => {
    it('should calculate time remaining correctly', () => {
      const futureDate = new Date(Date.now() + 3661000); // 1 hour, 1 minute, 1 second
      const timeRemaining = saleTimingService.calculateTimeRemaining(futureDate);

      expect(timeRemaining.hours).toBeGreaterThanOrEqual(1);
      expect(timeRemaining.minutes).toBeGreaterThanOrEqual(0);
      expect(timeRemaining.seconds).toBeGreaterThanOrEqual(0);
      expect(timeRemaining.isExpired).toBe(false);
    });

    it('should mark expired dates correctly', () => {
      const pastDate = new Date(Date.now() - 1000);
      const timeRemaining = saleTimingService.calculateTimeRemaining(pastDate);

      expect(timeRemaining.isExpired).toBe(true);
      expect(timeRemaining.totalSeconds).toBeLessThanOrEqual(0);
    });
  });

  describe('validateSaleTiming', () => {
    it('should accept valid sale timing', () => {
      const startTime = new Date(Date.now() + 60000); // 1 minute from now
      const endTime = new Date(Date.now() + 3660000); // 61 minutes from now

      const validation = saleTimingService.validateSaleTiming(startTime, endTime);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should reject sale that starts in the past', () => {
      const startTime = new Date(Date.now() - 60000); // 1 minute ago
      const endTime = new Date(Date.now() + 3600000); // 1 hour from now

      const validation = saleTimingService.validateSaleTiming(startTime, endTime);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Sale start time cannot be in the past');
    });

    it('should reject sale shorter than 5 minutes', () => {
      const startTime = new Date(Date.now() + 60000);
      const endTime = new Date(Date.now() + 120000); // Only 2 minutes duration

      const validation = saleTimingService.validateSaleTiming(startTime, endTime);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: string) => e.includes('at least 5 minutes'))).toBe(true);
    });

    it('should reject sale longer than 7 days', () => {
      const startTime = new Date(Date.now() + 60000);
      const endTime = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000); // 8 days

      const validation = saleTimingService.validateSaleTiming(startTime, endTime);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e: string) => e.includes('7 days'))).toBe(true);
    });
  });

  describe('getSalesNeedingStateUpdate', () => {
    it('should identify sales needing activation', () => {
      const sales: FlashSale[] = [
        {
          id: '1',
          product_id: 'p1',
          flash_price: 50,
          quantity_available: 100,
          start_time: new Date(Date.now() - 60000),
          end_time: new Date(Date.now() + 3600000),
          status: 'upcoming',
          created_at: new Date(),
        },
      ];

      const { toActivate, toComplete } = saleTimingService.getSalesNeedingStateUpdate(sales);

      expect(toActivate).toHaveLength(1);
      expect(toActivate[0].id).toBe('1');
      expect(toComplete).toHaveLength(0);
    });

    it('should identify sales needing completion', () => {
      const sales: FlashSale[] = [
        {
          id: '2',
          product_id: 'p1',
          flash_price: 50,
          quantity_available: 100,
          start_time: new Date(Date.now() - 7200000),
          end_time: new Date(Date.now() - 60000),
          status: 'active',
          created_at: new Date(),
        },
      ];

      const { toActivate, toComplete } = saleTimingService.getSalesNeedingStateUpdate(sales);

      expect(toActivate).toHaveLength(0);
      expect(toComplete).toHaveLength(1);
      expect(toComplete[0].id).toBe('2');
    });
  });

  describe('calculateProgress', () => {
    it('should return 0 for upcoming sale', () => {
      const sale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() + 60000),
        end_time: new Date(Date.now() + 3660000),
        status: 'upcoming',
        created_at: new Date(),
      };

      const progress = saleTimingService.calculateProgress(sale);
      expect(progress).toBe(0);
    });

    it('should return 100 for completed sale', () => {
      const sale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() - 7200000),
        end_time: new Date(Date.now() - 60000),
        status: 'completed',
        created_at: new Date(),
      };

      const progress = saleTimingService.calculateProgress(sale);
      expect(progress).toBe(100);
    });

    it('should return value between 0-100 for active sale', () => {
      const now = Date.now();
      const sale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(now - 1800000),
        end_time: new Date(now + 1800000),
        status: 'active',
        created_at: new Date(),
      };

      const progress = saleTimingService.calculateProgress(sale);
      expect(progress).toBeGreaterThan(40);
      expect(progress).toBeLessThan(60);
    });
  });
});

describe('StateMachine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('canTransition', () => {
    it('should allow upcoming -> active transition', () => {
      const sale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() - 60000),
        end_time: new Date(Date.now() + 3600000),
        status: 'upcoming',
        created_at: new Date(),
      };

      const canTransition = stateMachine.canTransition('upcoming', 'active', sale);
      expect(canTransition).toBe(true);
    });

    it('should allow active -> completed transition', () => {
      const sale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() - 7200000),
        end_time: new Date(Date.now() - 60000),
        status: 'active',
        created_at: new Date(),
      };

      const canTransition = stateMachine.canTransition('active', 'completed', sale);
      expect(canTransition).toBe(true);
    });

    it('should reject invalid transitions', () => {
      const canTransition = stateMachine.canTransition('completed', 'active');
      expect(canTransition).toBe(false);
    });
  });

  describe('transition', () => {
    it('should successfully transition sale state', async () => {
      const mockSale: FlashSale = {
        id: '1',
        product_id: 'p1',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() - 60000),
        end_time: new Date(Date.now() + 3600000),
        status: 'upcoming',
        created_at: new Date(),
      };

      const updatedSale = { ...mockSale, status: 'active' as const };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockSale], rowCount: 1 } as never)
        .mockResolvedValueOnce({ rows: [updatedSale], rowCount: 1 } as never);

      const result = await stateMachine.transition('1', 'active');

      expect(result.success).toBe(true);
      expect(result.previousState).toBe('upcoming');
      expect(result.newState).toBe('active');
    });

    it('should return error for non-existent sale', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

      const result = await stateMachine.transition('non-existent', 'active');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Sale not found');
    });
  });
});

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackEvent', () => {
    it('should track analytics event successfully', async () => {
      const mockEvent = {
        id: '1',
        event_type: 'sale_view' as const,
        user_id: 'user1',
        sale_id: 'sale1',
        product_id: null,
        metadata: null,
        created_at: new Date(),
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockEvent], rowCount: 1 } as never);

      const result = await analyticsService.trackEvent('sale_view', 'user1', 'sale1');

      expect(result).toEqual(mockEvent);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO analytics_events'),
        expect.arrayContaining(['sale_view', 'user1', 'sale1'])
      );
    });
  });

  describe('getSaleAnalytics', () => {
    it('should calculate analytics correctly', async () => {
      const mockAnalyticsData = [
        { event_type: 'sale_view', count: '100' },
        { event_type: 'queue_join', count: '50' },
        { event_type: 'purchase_complete', count: '10' },
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockAnalyticsData, rowCount: 3 } as never);

      const analytics = await analyticsService.getSaleAnalytics('sale1');

      expect(analytics.totalViews).toBe(100);
      expect(analytics.totalQueueJoins).toBe(50);
      expect(analytics.totalPurchases).toBe(10);
      expect(analytics.conversionRate).toBe(0.1);
    });
  });
});

describe('BackgroundJobRunner Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    backgroundJobRunner.stop();
  });

  afterEach(() => {
    backgroundJobRunner.stop();
  });

  it('should start and stop successfully', () => {
    backgroundJobRunner.start();
    const status = backgroundJobRunner.getJobStatus();

    expect(status.isRunning).toBe(true);
    expect(status.jobs.length).toBeGreaterThan(0);

    backgroundJobRunner.stop();
    const stoppedStatus = backgroundJobRunner.getJobStatus();
    expect(stoppedStatus.isRunning).toBe(false);
  });

  it('should have correct job configurations', () => {
    const status = backgroundJobRunner.getJobStatus();

    const jobNames = status.jobs.map((j) => j.name);
    expect(jobNames).toContain('updateSaleStatuses');
    expect(jobNames).toContain('syncInventory');
    expect(jobNames).toContain('cleanupExpiredReservations');
    expect(jobNames).toContain('refreshActiveSalesCache');
  });
});
