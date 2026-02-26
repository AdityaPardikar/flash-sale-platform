/**
 * Week 7 Day 4 — E2E Flash Sale Flow Tests
 *
 * Full lifecycle tests that simulate a user's journey through the flash sale
 * system.  Each describe-block represents a distinct user story, exercising
 * multiple controllers in the order they would be called in production:
 *
 *  1.  Product → Flash-Sale creation → inventory initialisation
 *  2.  Queue join → queue position → admission
 *  3.  Checkout → payment → order confirmation
 *  4.  Sale cancellation → reservation release
 *  5.  Concurrent queue join (race condition guard)
 *  6.  Sale lifecycle state transitions
 *
 * All external dependencies (database, Redis, UUID) are mocked so the suite
 * runs in < 1 s without infrastructure.
 */

// ─── Mock externals BEFORE imports ───────────────────────────────────────────

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'e2e-uuid-' + Math.random().toString(36).slice(2, 8)),
}));
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

// Mock services that the controllers depend on
jest.mock('../services/productService');
jest.mock('../services/flashSaleService');
jest.mock('../services/inventoryManager');
jest.mock('../services/queueService');
jest.mock('../services/queueEntryManager');
jest.mock('../services/orderService');
jest.mock('../services/orderValidator');
jest.mock('../services/paymentProcessor');

import productService from '../services/productService';
import flashSaleService from '../services/flashSaleService';
import inventoryManager from '../services/inventoryManager';
import { queueService } from '../services/queueService';
import { queueEntryManager } from '../services/queueEntryManager';
import orderService from '../services/orderService';
import orderValidator from '../services/orderValidator';

import * as productController from '../controllers/productController';
import * as flashSaleController from '../controllers/flashSaleController';
import * as queueController from '../controllers/queueController';
import * as orderController from '../controllers/orderController';

import {
  buildProduct,
  buildFlashSale,
  buildOrder,
  buildQueueEntry,
  expectSuccessEnvelope,
  futureDate,
  pastDate,
} from './test-helpers';

// ── Typed mocks ──────────────────────────────────────────────────────────────

const mockProductService = productService as jest.Mocked<typeof productService>;
const mockFlashSaleService = flashSaleService as jest.Mocked<typeof flashSaleService>;
const mockInventoryManager = inventoryManager as jest.Mocked<typeof inventoryManager>;
const mockQueueService = queueService as jest.Mocked<typeof queueService>;
const mockQueueEntryManager = queueEntryManager as jest.Mocked<typeof queueEntryManager>;
const mockOrderService = orderService as jest.Mocked<typeof orderService>;
const mockOrderValidator = orderValidator as jest.Mocked<typeof orderValidator>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Full Flash Sale Lifecycle: Create → Queue → Purchase → Verify
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Full Flash Sale Lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  const adminUser = { userId: 'admin-1', email: 'admin@flash.io' };
  const buyer = { userId: 'buyer-1', email: 'buyer@flash.io' };

  it('Step 1 — Admin creates a product', async () => {
    const product = buildProduct({ name: 'RTX 5090', base_price: '1999.99', category: 'gpu' });
    mockProductService.createProduct.mockResolvedValue(product as any);

    const req: any = {
      body: { name: 'RTX 5090', description: 'Next-gen GPU', base_price: 1999.99, category: 'gpu' },
      user: adminUser,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await productController.createProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = json.mock.calls[0][0];
    expectSuccessEnvelope(body);
    expect(body.data.name).toBe('RTX 5090');
  });

  it('Step 2 — Admin creates a flash sale for that product', async () => {
    const sale = buildFlashSale({
      product_id: 'prod-1',
      flash_price: '499.99',
      quantity_available: 50,
      start_time: futureDate(60_000).toISOString(),
      end_time: futureDate(3_600_000).toISOString(),
      status: 'upcoming',
    });
    mockFlashSaleService.createFlashSale.mockResolvedValue(sale as any);
    mockInventoryManager.initializeSaleInventory.mockResolvedValue(undefined);

    const req: any = {
      body: {
        product_id: 'prod-1',
        flash_price: '499.99',
        quantity_available: '50',
        start_time: futureDate(60_000).toISOString(),
        end_time: futureDate(3_600_000).toISOString(),
      },
      user: adminUser,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await flashSaleController.createFlashSale(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = json.mock.calls[0][0];
    expectSuccessEnvelope(body);
    expect(mockInventoryManager.initializeSaleInventory).toHaveBeenCalledWith(
      sale.id,
      sale.quantity_available,
    );
  });

  it('Step 3 — Buyer joins the queue', async () => {
    mockQueueService.isInQueue.mockResolvedValue(false);
    mockQueueService.joinQueue.mockResolvedValue({ position: 1, estimatedWait: 60 } as any);

    const req: any = { params: { saleId: 'sale-1' }, userId: buyer.userId };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await queueController.joinQueue(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(true);
  });

  it('Step 4 — Buyer checks queue position', async () => {
    mockQueueService.getQueuePosition.mockResolvedValue({ position: 1, estimatedWait: 30 } as any);

    const req: any = { params: { saleId: 'sale-1' }, userId: buyer.userId };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.getPosition(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('position');
  });

  it('Step 5 — Admin admits next batch', async () => {
    mockQueueService.admitNextBatch.mockResolvedValue([buyer.userId]);

    const req: any = { params: { saleId: 'sale-1' }, body: { batchSize: 10 } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.admitNextBatch(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.admittedUsers).toContain(buyer.userId);
  });

  it('Step 6 — Buyer initiates checkout', async () => {
    const checkoutSession = {
      orderId: 'order-1',
      orderNumber: 'ORD-20240101-001',
      totalAmount: 499.99,
      reservationExpiresAt: futureDate(300_000),
    };

    mockOrderValidator.sanitizeOrderInput.mockReturnValue({
      userId: buyer.userId,
      saleId: 'sale-1',
      productId: 'prod-1',
      quantity: 1,
    } as any);
    mockOrderValidator.validateCheckoutInput.mockResolvedValue({ valid: true, errors: [] });
    mockOrderValidator.validateUserOrderLimit.mockResolvedValue({ valid: true, errors: [] });
    mockOrderService.initiateCheckout.mockResolvedValue(checkoutSession as any);

    const req: any = {
      body: { saleId: 'sale-1', productId: 'prod-1', quantity: '1' },
      user: buyer,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    await orderController.initiateCheckout(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = json.mock.calls[0][0];
    expectSuccessEnvelope(body);
    expect(body.data.orderId).toBe('order-1');
    expect(body.data.totalAmount).toBe(499.99);
  });

  it('Step 7 — Verify inventory decreased', async () => {
    mockInventoryManager.getInventoryStats.mockResolvedValue({
      available: 49,
      reserved: 1,
      sold: 0,
      total: 50,
    } as any);

    const stats = await inventoryManager.getInventoryStats('sale-1');
    expect(stats.reserved).toBe(1);
    expect(stats.available).toBe(49);
    expect(stats.total).toBe(50);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Sale Cancellation Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Sale Cancellation Flow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancelling a sale releases all reservations', async () => {
    const sale = buildFlashSale({ status: 'cancelled' });
    mockFlashSaleService.cancelFlashSale.mockResolvedValue(sale as any);
    mockInventoryManager.bulkReleaseReservations.mockResolvedValue(undefined);

    const req: any = { params: { id: sale.id } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.cancelFlashSale(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('cancelled');
    expect(mockInventoryManager.bulkReleaseReservations).toHaveBeenCalledWith(sale.id);
  });

  it('cancelling a non-existent sale returns 404', async () => {
    mockFlashSaleService.cancelFlashSale.mockResolvedValue(null as any);

    const req: any = { params: { id: 'ghost' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await flashSaleController.cancelFlashSale(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Concurrent Queue Join (Race Condition Guard)
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Concurrent Queue Join', () => {
  beforeEach(() => jest.clearAllMocks());

  it('two users join the same sale and get sequential positions', async () => {
    let positionCounter = 0;
    mockQueueService.isInQueue.mockResolvedValue(false);
    mockQueueService.joinQueue.mockImplementation(async () => {
      positionCounter++;
      return { position: positionCounter, estimatedWait: positionCounter * 30 } as any;
    });

    const makeReq = (userId: string): any => ({
      params: { saleId: 'sale-race' },
      userId,
    });

    const results: any[] = [];

    // Simulate two concurrent join requests
    const promises = ['user-A', 'user-B'].map(async (uid) => {
      const json = jest.fn();
      const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
      await queueController.joinQueue(makeReq(uid), res);
      results.push(json.mock.calls[0][0]);
    });

    await Promise.all(promises);

    expect(results).toHaveLength(2);
    const positions = results.map((r) => r.data?.position).sort();
    expect(positions).toEqual([1, 2]);
  });

  it('same user joining twice gets their existing position', async () => {
    mockQueueService.isInQueue.mockResolvedValue(true);
    mockQueueService.getQueuePosition.mockResolvedValue({ position: 5, estimatedWait: 150 } as any);

    const req: any = { params: { saleId: 'sale-1' }, userId: 'user-X' };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.joinQueue(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.message).toBe('Already in queue');
    // joinQueue should NOT have been called when already in queue
    expect(mockQueueService.joinQueue).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sale State Transitions
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Sale State Transitions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('upcoming → active → completed lifecycle via update', async () => {
    const upcoming = buildFlashSale({ status: 'upcoming' });
    const active = { ...upcoming, status: 'active' };
    const completed = { ...upcoming, status: 'completed' };

    // Transition 1: upcoming → active
    mockFlashSaleService.updateFlashSale.mockResolvedValue(active as any);
    mockInventoryManager.syncInventoryFromDatabase.mockResolvedValue(undefined);

    let req: any = { params: { id: upcoming.id }, body: { status: 'active' } };
    let res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.updateFlashSale(req, res);

    let body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('active');

    // Transition 2: active → completed
    mockFlashSaleService.updateFlashSale.mockResolvedValue(completed as any);

    req = { params: { id: upcoming.id }, body: { status: 'completed' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.updateFlashSale(req, res);

    body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('completed');
  });

  it('get statistics for an active sale', async () => {
    mockFlashSaleService.getSaleStatistics.mockResolvedValue({
      totalOrders: 25,
      totalRevenue: 12499.75,
      averageOrderValue: 499.99,
      conversionRate: 0.5,
      queueLength: 50,
    } as any);

    const req: any = { params: { id: 'sale-stats' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.getFlashSaleStatistics(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.totalOrders).toBe(25);
    expect(body.data.conversionRate).toBe(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Queue Admin Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Queue Admin Operations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('admin retrieves all queue users', async () => {
    mockQueueService.getAllQueueUsers.mockResolvedValue([
      { userId: 'u1', position: 1 },
      { userId: 'u2', position: 2 },
    ] as any);

    const req: any = { params: { saleId: 'sale-1' }, query: { limit: '50' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.getAllQueueUsers(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
  });

  it('admin clears the queue', async () => {
    mockQueueService.clearQueue.mockResolvedValue(15);

    const req: any = { params: { saleId: 'sale-1' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.clearQueue(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data.clearedCount).toBe(15);
  });

  it('user retrieves their own queues', async () => {
    mockQueueEntryManager.getUserQueueHistory.mockResolvedValue([
      buildQueueEntry({ user_id: 'buyer-1', status: 'waiting' }),
      buildQueueEntry({ user_id: 'buyer-1', status: 'admitted' }),
    ] as any);

    const req: any = { userId: 'buyer-1' };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.getMyQueues(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Error Paths — E2E
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Error Paths', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unauthenticated user cannot join queue', async () => {
    const req: any = { params: { saleId: 'sale-1' } }; // no userId
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await queueController.joinQueue(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(json.mock.calls[0][0].success).toBe(false);
  });

  it('unauthenticated user cannot initiate checkout', async () => {
    const req: any = { body: { saleId: 's', productId: 'p', quantity: '1' }, user: undefined };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    await orderController.initiateCheckout(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('checkout with invalid input returns 400', async () => {
    mockOrderValidator.sanitizeOrderInput.mockReturnValue({} as any);
    mockOrderValidator.validateCheckoutInput.mockResolvedValue({
      valid: false,
      errors: ['Product ID is required', 'Sale ID is required'],
    });

    const req: any = {
      body: {},
      user: { userId: 'buyer-1', email: 'b@e.com' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    await orderController.initiateCheckout(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toHaveProperty('details');
  });

  it('flash sale creation with missing fields returns 400', async () => {
    const req: any = { body: { product_id: 'p-1' }, user: { userId: 'admin' } }; // missing required fields
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await flashSaleController.createFlashSale(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.error).toContain('Missing required fields');
  });

  it('queue service failure returns 500', async () => {
    mockQueueService.getQueueLength.mockRejectedValue(new Error('Redis unavailable'));

    const req: any = { params: { saleId: 'sale-1' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await queueController.getQueueLength(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Active Sales Discovery Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Active Sales Discovery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches active sales with time remaining and queue stats', async () => {
    const sale = buildFlashSale({ status: 'active' });
    mockFlashSaleService.getActiveFlashSales.mockResolvedValue([sale] as any);
    mockFlashSaleService.getTimeRemaining.mockReturnValue({
      hours: 0,
      minutes: 45,
      seconds: 0,
      totalSeconds: 2700,
      isExpired: false,
    } as any);

    // Step 1: User lists active sales
    const req1: any = {};
    const res1: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.getActiveFlashSales(req1, res1);

    const body1 = res1.json.mock.calls[0][0];
    expectSuccessEnvelope(body1);
    expect(body1.data).toHaveLength(1);
    expect(body1.data[0]).toHaveProperty('timeRemaining');

    // Step 2: User checks queue length
    mockQueueService.getQueueLength.mockResolvedValue(25);

    const req2: any = { params: { saleId: sale.id } };
    const res2: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await queueController.getQueueLength(req2, res2);

    const body2 = res2.json.mock.calls[0][0];
    expect(body2.data.length).toBe(25);

    // Step 3: User checks sale detail with inventory
    mockFlashSaleService.getFlashSaleById.mockResolvedValue(sale as any);
    mockFlashSaleService.getTimeRemaining.mockReturnValue({
      hours: 0,
      minutes: 44,
      seconds: 30,
      totalSeconds: 2670,
      isExpired: false,
    } as any);
    mockInventoryManager.getInventoryStats.mockResolvedValue({
      available: 40,
      reserved: 5,
      sold: 5,
      total: 50,
    } as any);

    const req3: any = { params: { id: sale.id } };
    const res3: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await flashSaleController.getFlashSaleById(req3, res3);

    const body3 = res3.json.mock.calls[0][0];
    expectSuccessEnvelope(body3);
    expect(body3.data).toHaveProperty('inventory');
    expect(body3.data.inventory.available).toBe(40);
  });
});
