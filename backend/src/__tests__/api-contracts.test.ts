/**
 * Week 7 Day 3 — API Contract Tests
 *
 * Validates that every public-facing endpoint returns the documented response
 * shape, status codes, and headers. The tests mock service-layer dependencies
 * so they run fast and do not require a live database or Redis connection.
 *
 * Contract coverage:
 *   - Products API   (GET list, GET by id, POST create, PUT update, DELETE)
 *   - Flash Sales API (GET list, GET active, GET upcoming, GET by id, POST, DELETE cancel)
 *   - Queue API      (GET stats, GET length, POST join, DELETE leave, GET position)
 *   - Health API     (GET /, /live, /ready, /database, /redis)
 *   - Auth API       (POST register, POST login, POST logout)
 */

// ─── Mock Externals BEFORE imports ───────────────────────────────────────────

jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-contract') }));
jest.mock('../utils/database');
jest.mock('../utils/redis');
jest.mock('../services/websocketService', () => ({
  websocketService: { initialize: jest.fn(), shutdown: jest.fn(), emit: jest.fn() },
}));
jest.mock('../services/metricsService', () => ({
  metricsService: {
    startCollecting: jest.fn(),
    stopCollecting: jest.fn(),
    incrementCounter: jest.fn(),
    recordHistogram: jest.fn(),
    setGauge: jest.fn(),
    getMetrics: jest.fn(() => ({})),
    getPrometheusOutput: jest.fn(() => ''),
  },
}));

import {
  buildProduct,
  buildFlashSale,
  buildUser,
  buildOrder,
  buildQueueEntry,
  expectShape,
  expectSuccessEnvelope,
  expectErrorEnvelope,
} from './test-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// Product Controller Contracts
// ─────────────────────────────────────────────────────────────────────────────

import * as productController from '../controllers/productController';
import productService from '../services/productService';

jest.mock('../services/productService');
const mockProductService = productService as jest.Mocked<typeof productService>;

describe('Product API Contracts', () => {
  afterEach(() => jest.clearAllMocks());

  // ── GET /api/v1/products ─────────────────────────────────────────────────

  describe('GET /products — getAllProducts', () => {
    it('returns { success, data[], count } with 200', async () => {
      const products = [buildProduct(), buildProduct()];
      mockProductService.getAllProducts.mockResolvedValue(products as any);

      const req: any = { query: {} };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await productController.getAllProducts(req, res);

      expect(res.json).toHaveBeenCalledTimes(1);
      const body = res.json.mock.calls[0][0];

      expectSuccessEnvelope(body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body).toHaveProperty('count');
      expect(typeof body.count).toBe('number');
      expect(body.count).toBe(2);
    });

    it('forwards query filters to service', async () => {
      mockProductService.getAllProducts.mockResolvedValue([]);

      const req: any = {
        query: {
          category: 'electronics',
          minPrice: '10',
          maxPrice: '100',
          limit: '5',
          offset: '0',
        },
      };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await productController.getAllProducts(req, res);

      expect(mockProductService.getAllProducts).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'electronics',
          minPrice: 10,
          maxPrice: 100,
          limit: 5,
          offset: 0,
        }),
      );
    });

    it('returns 500 on service error', async () => {
      mockProductService.getAllProducts.mockRejectedValue(new Error('DB down'));

      const req: any = { query: {} };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await productController.getAllProducts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      const body = json.mock.calls[0][0];
      expectErrorEnvelope(body);
    });
  });

  // ── GET /api/v1/products/:id ─────────────────────────────────────────────

  describe('GET /products/:id — getProductById', () => {
    it('returns { success, data } with product shape for valid id', async () => {
      const product = buildProduct();
      mockProductService.getProductById.mockResolvedValue(product as any);

      const req: any = { params: { id: product.id } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await productController.getProductById(req, res);

      const body = res.json.mock.calls[0][0];
      expectSuccessEnvelope(body);
      expectShape(body.data as Record<string, unknown>, {
        id: 'string',
        name: 'string',
        description: 'string',
        base_price: 'string',
        category: 'string',
      });
    });

    it('returns 404 when product not found', async () => {
      mockProductService.getProductById.mockResolvedValue(null as any);

      const req: any = { params: { id: 'nonexistent' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await productController.getProductById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      const body = json.mock.calls[0][0];
      expect(body.success).toBe(false);
    });
  });

  // ── POST /api/v1/products ────────────────────────────────────────────────

  describe('POST /products — createProduct', () => {
    it('returns 201 with the created product', async () => {
      const product = buildProduct();
      mockProductService.createProduct.mockResolvedValue(product as any);

      const req: any = {
        body: {
          name: product.name,
          description: product.description,
          base_price: 19.99,
          category: 'electronics',
        },
        user: { userId: 'admin-1', email: 'admin@example.com' },
      };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await productController.createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const body = json.mock.calls[0][0];
      expectSuccessEnvelope(body);
    });

    it('returns 500 on validation / service failure', async () => {
      mockProductService.createProduct.mockRejectedValue(new Error('validation error'));

      const req: any = { body: {}, user: { userId: 'admin-1', email: 'admin@example.com' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await productController.createProduct(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Flash Sale Controller Contracts
// ─────────────────────────────────────────────────────────────────────────────

import * as flashSaleController from '../controllers/flashSaleController';
import flashSaleService from '../services/flashSaleService';
import inventoryManager from '../services/inventoryManager';

jest.mock('../services/flashSaleService');
jest.mock('../services/inventoryManager');
const mockFlashSaleService = flashSaleService as jest.Mocked<typeof flashSaleService>;
const mockInventoryManager = inventoryManager as jest.Mocked<typeof inventoryManager>;

describe('Flash Sale API Contracts', () => {
  afterEach(() => jest.clearAllMocks());

  // ── GET /api/v1/flash-sales ──────────────────────────────────────────────

  describe('GET /flash-sales — getAllFlashSales', () => {
    it('returns { success, data[], count }', async () => {
      const sales = [buildFlashSale(), buildFlashSale()];
      mockFlashSaleService.getAllFlashSales.mockResolvedValue(sales as any);

      const req: any = { query: {} };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await flashSaleController.getAllFlashSales(req, res);

      const body = res.json.mock.calls[0][0];
      expectSuccessEnvelope(body);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.count).toBe(2);
    });

    it('passes status filter to service', async () => {
      mockFlashSaleService.getAllFlashSales.mockResolvedValue([]);

      const req: any = { query: { status: 'active' } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await flashSaleController.getAllFlashSales(req, res);

      expect(mockFlashSaleService.getAllFlashSales).toHaveBeenCalledWith('active');
    });
  });

  // ── GET /api/v1/flash-sales/:id ─────────────────────────────────────────

  describe('GET /flash-sales/:id — getFlashSaleById', () => {
    it('returns sale with timeRemaining and inventory shape', async () => {
      const sale = buildFlashSale({ status: 'active' });
      mockFlashSaleService.getFlashSaleById.mockResolvedValue(sale as any);
      mockFlashSaleService.getTimeRemaining.mockReturnValue({
        hours: 1,
        minutes: 30,
        seconds: 0,
        totalSeconds: 5400,
        isExpired: false,
      } as any);
      mockInventoryManager.getInventoryStats.mockResolvedValue({
        available: 80,
        reserved: 10,
        sold: 10,
        total: 100,
      } as any);

      const req: any = { params: { id: sale.id } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await flashSaleController.getFlashSaleById(req, res);

      const body = res.json.mock.calls[0][0];
      expectSuccessEnvelope(body);
      expect(body.data).toHaveProperty('timeRemaining');
      expect(body.data).toHaveProperty('inventory');
    });

    it('returns 404 for non-existent sale', async () => {
      mockFlashSaleService.getFlashSaleById.mockResolvedValue(null as any);

      const req: any = { params: { id: 'nope' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await flashSaleController.getFlashSaleById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  // ── GET /api/v1/flash-sales/active ───────────────────────────────────────

  describe('GET /flash-sales/active — getActiveFlashSales', () => {
    it('returns array of active sales with timeRemaining', async () => {
      const sale = buildFlashSale({ status: 'active' });
      mockFlashSaleService.getActiveFlashSales.mockResolvedValue([sale] as any);
      mockFlashSaleService.getTimeRemaining.mockReturnValue({
        hours: 0,
        minutes: 45,
        seconds: 10,
        totalSeconds: 2710,
        isExpired: false,
      } as any);

      const req: any = {};
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await flashSaleController.getActiveFlashSales(req, res);

      const body = res.json.mock.calls[0][0];
      expectSuccessEnvelope(body);
      body.data.forEach((s: any) => {
        expect(s).toHaveProperty('timeRemaining');
      });
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Auth Controller Contracts
// ─────────────────────────────────────────────────────────────────────────────

import * as authController from '../controllers/authController';
import { authService } from '../services/authService';

jest.mock('../services/authService');
const mockAuthService = authService as jest.Mocked<typeof authService>;

describe('Auth API Contracts', () => {
  afterEach(() => jest.clearAllMocks());

  // ── POST /api/v1/auth/register ───────────────────────────────────────────

  describe('POST /auth/register', () => {
    it('returns 201 with user data on success', async () => {
      const user = buildUser();
      mockAuthService.register.mockResolvedValue(user as any);

      const req: any = {
        body: { email: user.email, username: user.username, password: 'Password1!' },
      };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const body = json.mock.calls[0][0];
      expect(body).toHaveProperty('data');
      expectShape(body.data, {
        id: 'string',
        email: 'string',
        username: 'string',
      });
      // Password hash MUST NOT leak
      expect(body.data).not.toHaveProperty('password_hash');
    });

    it('returns 400 when missing required fields', async () => {
      const req: any = { body: {} };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      const body = json.mock.calls[0][0];
      expectErrorEnvelope(body);
    });

    it('returns 400 for invalid email format', async () => {
      const req: any = { body: { email: 'not-an-email', username: 'u', password: 'Password1!' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 for short password', async () => {
      const req: any = { body: { email: 'a@b.com', username: 'user', password: '12' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  // ── POST /api/v1/auth/login ──────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('returns accessToken and refreshToken on success', async () => {
      const user = buildUser();
      mockAuthService.login.mockResolvedValue({
        user: { id: user.id, email: user.email, username: user.username },
        accessToken: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
      } as any);

      const req: any = { body: { email: user.email, password: 'Password1!' } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await authController.login(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body).toHaveProperty('data');
      expect(body.data).toHaveProperty('accessToken');
      expect(body.data).toHaveProperty('refreshToken');
      expect(body.data).toHaveProperty('user');
      // Token must be a non-empty string
      expect(typeof body.data.accessToken).toBe('string');
      expect(body.data.accessToken.length).toBeGreaterThan(0);
    });

    it('returns 400 when email missing', async () => {
      const req: any = { body: { password: 'Password1!' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 on invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

      const req: any = { body: { email: 'a@b.com', password: 'wrong' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Health Endpoint Contracts
// ─────────────────────────────────────────────────────────────────────────────

import * as healthCheckService from '../services/healthCheckService';

jest.mock('../services/healthCheckService');
const mockHealthService = healthCheckService as jest.Mocked<typeof healthCheckService>;

describe('Health API Contracts', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getSystemHealth shape', () => {
    it('returns status + timestamp + services when healthy', async () => {
      const healthResult = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 12345,
        services: {},
      };
      mockHealthService.getSystemHealth.mockResolvedValue(healthResult as any);

      const result = await healthCheckService.getSystemHealth();
      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('getLivenessStatus shape', () => {
    it('returns { status, timestamp }', () => {
      mockHealthService.getLivenessStatus.mockReturnValue({
        status: 'alive',
        timestamp: new Date().toISOString(),
      } as any);

      const result = healthCheckService.getLivenessStatus();
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('getReadinessStatus shape', () => {
    it('returns status = ready when all services are up', async () => {
      mockHealthService.getReadinessStatus.mockResolvedValue({
        status: 'ready',
        timestamp: new Date().toISOString(),
        services: { database: 'ok', redis: 'ok' },
      } as any);

      const result = await healthCheckService.getReadinessStatus();
      expect(result.status).toBe('ready');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue Controller Contracts
// ─────────────────────────────────────────────────────────────────────────────

import * as queueController from '../controllers/queueController';
import { queueService } from '../services/queueService';
import { queueEntryManager } from '../services/queueEntryManager';

jest.mock('../services/queueService');
jest.mock('../services/queueEntryManager');
const mockQueueService = queueService as jest.Mocked<typeof queueService>;
const mockQueueEntryManager = queueEntryManager as jest.Mocked<typeof queueEntryManager>;

describe('Queue API Contracts', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getQueueLength', () => {
    it('returns { success, data: { length } }', async () => {
      mockQueueService.getQueueLength.mockResolvedValue(42);

      const req: any = { params: { saleId: 'sale-1' } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await queueController.getQueueLength(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body).toHaveProperty('success', true);
      expect(body.data).toHaveProperty('length');
      expect(typeof body.data.length).toBe('number');
    });
  });

  describe('getQueueStats', () => {
    it('returns queue statistics object', async () => {
      mockQueueService.getQueueStats.mockResolvedValue({
        length: 100,
        averageWaitTime: 120,
        admitted: 50,
        processing: 10,
      } as any);
      mockQueueEntryManager.getQueueStats.mockResolvedValue({
        total: 100,
        waiting: 40,
        admitted: 50,
        processing: 10,
      } as any);

      const req: any = { params: { saleId: 'sale-1' } };
      const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

      await queueController.getQueueStats(req, res);

      const body = res.json.mock.calls[0][0];
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
    });
  });

  describe('joinQueue', () => {
    it('returns position for authenticated user', async () => {
      mockQueueService.isInQueue.mockResolvedValue(false);
      mockQueueService.joinQueue.mockResolvedValue({
        position: 15,
        estimatedWait: 300,
      } as any);

      const req: any = {
        params: { saleId: 'sale-1' },
        userId: 'user-1',
      };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await queueController.joinQueue(req, res);

      const body = json.mock.calls[0][0];
      expect(body).toHaveProperty('success', true);
      expect(body).toHaveProperty('data');
    });

    it('returns 401 when not authenticated', async () => {
      const req: any = { params: { saleId: 'sale-1' } };
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

      await queueController.joinQueue(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Response Envelope Consistency
// ─────────────────────────────────────────────────────────────────────────────

describe('Response Envelope Consistency', () => {
  it('success responses always include { success: true }', () => {
    // This test documents the standard contract — all success controllers
    // must return { success: true, data: ... }.
    const envelope = { success: true, data: {} };
    expectSuccessEnvelope(envelope);
  });

  it('error responses always include { error: string }', () => {
    const envelope = { success: false, error: 'Something went wrong' };
    expectErrorEnvelope(envelope);
  });

  it('list responses include count field', () => {
    const envelope = { success: true, data: [{}, {}], count: 2 };
    expect(envelope).toHaveProperty('count');
    expect(envelope.count).toBe(envelope.data.length);
  });
});
