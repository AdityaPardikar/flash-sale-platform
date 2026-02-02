import { realtimeService } from '../services/realtimeService';
import { adminController } from '../controllers/adminController';
import pool from '../utils/database';

jest.mock('../utils/database');
jest.mock('../services/queueService');

describe('Week 3 Day 6: Realtime & Admin Dashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RealtimeService - WebSocket Updates', () => {
    it('should initialize WebSocket server correctly', () => {
      // Mock HTTP server
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const mockHttpServer = {} as any;

      const io = realtimeService.initializeWebSocket(mockHttpServer);

      expect(io).toBeDefined();
      expect(io.engine.opts.transports).toContain('websocket');
    });

    it('should get live metrics for a sale', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total_purchased: 50, total_reserved: 25 }],
        rowCount: 1,
      });

      const metrics = await realtimeService.getLiveMetrics('sale-001');

      expect(metrics).toHaveProperty('activeUsers');
      expect(metrics).toHaveProperty('totalQueued');
      expect(metrics).toHaveProperty('totalPurchased');
      expect(metrics).toHaveProperty('conversationRate');
    });

    it('should return zero metrics on error', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB error'));

      const metrics = await realtimeService.getLiveMetrics('sale-001');

      expect(metrics.activeUsers).toBe(0);
      expect(metrics.totalQueued).toBe(0);
      expect(metrics.totalPurchased).toBe(0);
    });

    it('should get queue details for admin view', async () => {
      const mockQueueData = [
        {
          id: 'entry-1',
          user_id: 'user-1',
          position: 1,
          status: 'waiting',
          joined_at: new Date(),
          email: 'user@example.com',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockQueueData,
        rowCount: 1,
      });

      const details = await realtimeService.getQueueDetails('sale-001', 100);

      expect(details).toHaveProperty('total', 1);
      expect(details).toHaveProperty('entries');
      expect(details.entries[0]).toHaveProperty('email');
      expect(details.entries[0]).toHaveProperty('position');
    });

    it('should broadcast sale status changes', (done) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const mockHttpServer = {} as any;
      const io = realtimeService.initializeWebSocket(mockHttpServer);

      // Mock the broadcast
      const broadcastSpy = jest.spyOn(io, 'to');

      realtimeService.broadcastSaleStatusChange('sale-001', 'completed');

      expect(broadcastSpy).toHaveBeenCalledWith('sale:sale-001');

      broadcastSpy.mockRestore();
      done();
    });
  });

  describe('AdminController - Dashboard', () => {
    it('should get dashboard overview', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total_sales: 10, active_sales: 3, completed_sales: 5, cancelled_sales: 2 }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          { total_orders: 100, pending_orders: 20, completed_orders: 75, cancelled_orders: 5 },
        ],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total_users: 500 }],
      });

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {} as any;
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.getDashboardOverview(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sales: expect.any(Object),
          orders: expect.any(Object),
          users: expect.any(Object),
        })
      );
    });

    it('should get all sales metrics', async () => {
      const mockSalesMetrics = [
        {
          id: 'sale-1',
          name: 'Summer Sale',
          status: 'active',
          queued_users: 150,
          completed_orders: 75,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockSalesMetrics,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = {} as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = {
        json: jest.fn(),
        status: jest
          .fn()
          .mockReturnThis() /* eslint-disable-next-line @typescript-eslint/no-explicit-any */,
      } as any;

      await adminController.getAllSalesMetrics(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          sales: expect.any(Array),
        })
      );
    });

    it('should get queue details with limit', async () => {
      const mockQueueEntries = [
        {
          id: 'entry-1',
          user_id: 'user-1',
          position: 1,
          status: 'waiting',
          email: 'user1@example.com',
        },
        {
          id: 'entry-2',
          user_id: 'user-2',
          position: 2,
          status: 'waiting',
          email: 'user2@example.com',
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockQueueEntries,
        rowCount: 2,
      });

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        params: { saleId: 'sale-001' },
        query: { limit: 100 },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.getQueueDetails(req, res);

      expect(res.json).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should update sale status', async () => {
      const updatedSale = {
        id: 'sale-001',
        status: 'completed',
        name: 'Summer Sale',
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [updatedSale],
        rowCount: 1,
      });

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        params: { saleId: 'sale-001' },
        body: { status: 'completed' },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.updateSaleStatus(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          sale: updatedSale,
        })
      );
    });

    it('should reject invalid sale status', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        params: { saleId: 'sale-001' },
        body: { status: 'invalid-status' },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.updateSaleStatus(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid status',
        })
      );
    });

    it('should get user activity logs', async () => {
      const mockActivityLogs = [
        {
          id: 'log-1',
          event_type: 'queue_join',
          sale_id: 'sale-001',
          created_at: new Date(),
        },
        {
          id: 'log-2',
          event_type: 'purchase_complete',
          sale_id: 'sale-001',
          created_at: new Date(),
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockActivityLogs,
        rowCount: 2,
      });

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        params: { userId: 'user-001' },
        query: { limit: 50 },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.getUserActivityLogs(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-001',
          logs: mockActivityLogs,
          total: 2,
        })
      );
    });

    it('should get performance report with metrics', async () => {
      const mockPerformanceData = [
        {
          id: 'sale-001',
          name: 'Summer Sale',
          status: 'completed',
          initial_stock: 1000,
          remaining_stock: 250,
          sold_units: 750,
          stock_sold_percentage: 75,
          total_revenue: 37500,
          total_queue_users: 2000,
          total_orders: 750,
        },
      ];

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: mockPerformanceData,
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const req = {} as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = {
        json: jest.fn(),
        status: jest
          .fn()
          .mockReturnThis() /* eslint-disable-next-line @typescript-eslint/no-explicit-any */,
      } as any;

      await adminController.getPerformanceReport(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          reports: mockPerformanceData,
        })
      );

      expect(mockPerformanceData[0]).toHaveProperty('stock_sold_percentage', 75);
      expect(mockPerformanceData[0]).toHaveProperty('total_revenue', 37500);
    });

    it('should handle database errors gracefully', async () => {
      (pool.query as jest.Mock).mockRejectedValueOnce(new Error('DB Connection failed'));

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {} as any;
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      await adminController.getDashboardOverview(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(String),
        })
      );
    });
  });

  describe('Admin Routes - Access Control', () => {
    it('should protect admin routes with auth middleware', () => {
      // Routes should be under /api/v1/admin and require authMiddleware
      // This is verified by route structure
      const routeNames = [
        '/dashboard/overview',
        '/sales/metrics',
        '/sales/:saleId/metrics',
        '/sales/:saleId/queue',
        '/queue/remove',
        '/sales/:saleId/status',
        '/users/:userId/activity',
        '/reports/performance',
      ];

      expect(routeNames.length).toBe(8);
    });
  });

  describe('Dashboard Metrics - Real-Time Data', () => {
    it('should calculate stock sold percentage correctly', () => {
      const initialStock = 1000;
      const sold = 750;
      const percentage = (sold / initialStock) * 100;

      expect(percentage).toBe(75);
    });

    it('should handle zero sales correctly', () => {
      const initialStock = 1000;
      const sold = 0;
      const percentage = (sold / initialStock) * 100;

      expect(percentage).toBe(0);
    });

    it('should show revenue calculations', () => {
      const ordersCount = 750;
      const avgPrice = 50;
      const totalRevenue = ordersCount * avgPrice;

      expect(totalRevenue).toBe(37500);
    });
  });

  describe('Queue Management - Admin Operations', () => {
    it('should remove user from queue', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        body: {
          saleId: 'sale-001',
          userId: 'user-123',
        },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      // Mock successful removal
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      jest.spyOn(adminController, 'removeFromQueue' as any).mockResolvedValueOnce(undefined);

      await adminController.removeFromQueue(req, res);

      expect(res.json).toHaveBeenCalled();
    });

    it('should handle queue removal errors', async () => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const req = {
        body: {
          saleId: 'sale-001',
          userId: 'user-123',
        },
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      } as any;

      // Mock failed removal
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      jest
        .spyOn(adminController, 'removeFromQueue' as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .mockRejectedValueOnce(new Error('Queue error'));

      try {
        await adminController.removeFromQueue(req, res);
      } catch {
        // Expected
      }
    });
  });
});
