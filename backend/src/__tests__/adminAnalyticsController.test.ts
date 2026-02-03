/**
 * Tests for Admin Analytics Controller
 */

import { Request, Response } from 'express';
import {
  getSalesAnalytics,
  getUserAnalytics,
  getQueueAnalytics,
  getFunnelAnalytics,
  getRevenueAnalytics,
  getEvents,
} from '../adminAnalyticsController';
import { getAnalyticsCollector } from '../../services/analyticsCollector';
import { TimeSeriesAggregator } from '../../utils/timeSeriesAggregator';

jest.mock('../../services/analyticsCollector');
jest.mock('../../utils/timeSeriesAggregator');

describe('AdminAnalyticsController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      query: {},
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('getSalesAnalytics', () => {
    it('should return sales analytics data', async () => {
      const mockEvents = [
        {
          event_type: 'page_view',
          user_id: 'user1',
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);
      (TimeSeriesAggregator.aggregateEvents as jest.Mock).mockReturnValue([
        {
          count: 1,
          unique_users: 1,
          views: 1,
        },
      ]);

      await getSalesAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          views: expect.any(Number),
          conversion_rate: expect.any(Number),
        })
      );
    });

    it('should return 400 if startDate is missing', async () => {
      mockRequest.query = { endDate: '2024-02-01' };

      await getSalesAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getUserAnalytics', () => {
    it('should return user analytics data', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
      };

      const mockEvents = [
        {
          event_type: 'page_view',
          user_id: 'user1',
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getUserAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          active_users: expect.any(Number),
          page_views: expect.any(Number),
        })
      );
    });
  });

  describe('getQueueAnalytics', () => {
    it('should return queue analytics data', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
      };

      const mockEvents = [
        {
          event_type: 'queue_user_joined',
          user_id: 'user1',
          queue_id: 'queue1',
          timestamp: new Date(),
          metadata: { wait_time: 60 },
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getQueueAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          joined: expect.any(Number),
          admitted: expect.any(Number),
          drop_rate: expect.any(Number),
        })
      );
    });
  });

  describe('getFunnelAnalytics', () => {
    it('should return conversion funnel data', async () => {
      mockRequest.query = {
        saleId: 'sale123',
        startDate: '2024-02-01',
        endDate: '2024-02-05',
      };

      const mockEvents = [
        {
          event_type: 'product_view',
          user_id: 'user1',
          sale_id: 'sale123',
          timestamp: new Date(),
        },
        {
          event_type: 'user_join_queue',
          user_id: 'user1',
          sale_id: 'sale123',
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);
      (TimeSeriesAggregator.calculateConversionFunnel as jest.Mock).mockReturnValue({
        steps: [
          { name: 'View', user_count: 100, drop_off: 0 },
          { name: 'Queue', user_count: 80, drop_off: 20 },
        ],
        overall_conversion_rate: 50,
      });

      await getFunnelAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          steps: expect.any(Array),
          overall_conversion_rate: expect.any(Number),
        })
      );
    });

    it('should return 400 if saleId is missing', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
      };

      await getFunnelAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getRevenueAnalytics', () => {
    it('should return revenue data with calculations', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
      };

      const mockEvents = [
        {
          event_type: 'purchase_complete',
          user_id: 'user1',
          amount: 100,
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getRevenueAnalytics(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          total_revenue: expect.any(Number),
          total_orders: expect.any(Number),
          avg_order_value: expect.any(Number),
        })
      );
    });
  });

  describe('getEvents', () => {
    it('should return raw events with filtering', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        limit: '50',
      };

      const mockEvents = [
        {
          event_type: 'page_view',
          user_id: 'user1',
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getEvents(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          events: expect.any(Array),
          count: expect.any(Number),
        })
      );
    });

    it('should apply event type filter', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        eventType: 'page_view',
      };

      const mockEvents = [
        {
          event_type: 'page_view',
          user_id: 'user1',
          timestamp: new Date(),
        },
      ];

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getEvents(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          events: expect.any(Array),
        })
      );
    });

    it('should limit results correctly', async () => {
      mockRequest.query = {
        startDate: '2024-02-01',
        endDate: '2024-02-05',
        limit: '10',
      };

      const mockEvents = Array(20).fill({
        event_type: 'page_view',
        user_id: 'user1',
        timestamp: new Date(),
      });

      const mockCollector = {
        getEvents: jest.fn().mockResolvedValue(mockEvents),
      };

      (getAnalyticsCollector as jest.Mock).mockReturnValue(mockCollector);
      (TimeSeriesAggregator.filterByDateRange as jest.Mock).mockReturnValue(mockEvents);

      await getEvents(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          count: expect.any(Number),
        })
      );
    });
  });
});
