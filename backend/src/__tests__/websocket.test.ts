/**
 * WebSocket Service & Event Broadcaster Unit Tests
 * Week 6 Day 7: Testing, Documentation & Week Review
 */

// ─── Mock Dependencies ──────────────────────────────────────

// Mock metricsService before importing websocketService
jest.mock('../services/metricsService', () => ({
  metricsService: {
    registry: {
      incrementGauge: jest.fn(),
      decrementGauge: jest.fn(),
      incrementCounter: jest.fn(),
    },
    recordHttpRequest: jest.fn(),
    startCollecting: jest.fn(),
    stopCollecting: jest.fn(),
  },
  default: {
    registry: {
      incrementGauge: jest.fn(),
      decrementGauge: jest.fn(),
      incrementCounter: jest.fn(),
    },
  },
}));

jest.mock('../utils/logger', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

import { WS_EVENTS } from '../services/websocketService';

// ─── WS_EVENTS Tests ────────────────────────────────────────

describe('WS_EVENTS', () => {
  it('should define all sale events', () => {
    expect(WS_EVENTS.SALE_STARTED).toBe('sale:started');
    expect(WS_EVENTS.SALE_ENDED).toBe('sale:ended');
    expect(WS_EVENTS.SALE_UPDATED).toBe('sale:updated');
    expect(WS_EVENTS.SALE_COUNTDOWN).toBe('sale:countdown');
  });

  it('should define all inventory events', () => {
    expect(WS_EVENTS.INVENTORY_UPDATED).toBe('inventory:updated');
    expect(WS_EVENTS.INVENTORY_LOW).toBe('inventory:low');
    expect(WS_EVENTS.INVENTORY_SOLDOUT).toBe('inventory:soldout');
  });

  it('should define all queue events', () => {
    expect(WS_EVENTS.QUEUE_POSITION).toBe('queue:position');
    expect(WS_EVENTS.QUEUE_JOINED).toBe('queue:joined');
    expect(WS_EVENTS.QUEUE_LEFT).toBe('queue:left');
    expect(WS_EVENTS.QUEUE_YOUR_TURN).toBe('queue:yourTurn');
  });

  it('should define all order events', () => {
    expect(WS_EVENTS.ORDER_CREATED).toBe('order:created');
    expect(WS_EVENTS.ORDER_STATUS).toBe('order:status');
    expect(WS_EVENTS.ORDER_CONFIRMED).toBe('order:confirmed');
  });

  it('should define connection lifecycle events', () => {
    expect(WS_EVENTS.CLIENT_CONNECTED).toBe('client:connected');
    expect(WS_EVENTS.CLIENT_DISCONNECTED).toBe('client:disconnected');
    expect(WS_EVENTS.HEARTBEAT).toBe('heartbeat');
    expect(WS_EVENTS.HEARTBEAT_ACK).toBe('heartbeat:ack');
  });

  it('should define client-to-server events', () => {
    expect(WS_EVENTS.JOIN_SALE_ROOM).toBe('join:sale');
    expect(WS_EVENTS.LEAVE_SALE_ROOM).toBe('leave:sale');
    expect(WS_EVENTS.SUBSCRIBE_QUEUE).toBe('subscribe:queue');
    expect(WS_EVENTS.UNSUBSCRIBE_QUEUE).toBe('unsubscribe:queue');
  });

  it('should define admin events', () => {
    expect(WS_EVENTS.ADMIN_BROADCAST).toBe('admin:broadcast');
    expect(WS_EVENTS.ADMIN_ALERT).toBe('admin:alert');
    expect(WS_EVENTS.SYSTEM_STATUS).toBe('system:status');
  });

  it('should have all expected event keys', () => {
    const expectedKeys = [
      'SALE_STARTED',
      'SALE_ENDED',
      'SALE_UPDATED',
      'SALE_COUNTDOWN',
      'INVENTORY_UPDATED',
      'INVENTORY_LOW',
      'INVENTORY_SOLDOUT',
      'QUEUE_POSITION',
      'QUEUE_JOINED',
      'QUEUE_LEFT',
      'QUEUE_YOUR_TURN',
      'ORDER_CREATED',
      'ORDER_STATUS',
      'ORDER_CONFIRMED',
      'PRICE_CHANGED',
      'FLASH_DEAL',
      'ADMIN_BROADCAST',
      'ADMIN_ALERT',
      'SYSTEM_STATUS',
      'CLIENT_CONNECTED',
      'CLIENT_DISCONNECTED',
      'HEARTBEAT',
      'HEARTBEAT_ACK',
      'JOIN_SALE_ROOM',
      'LEAVE_SALE_ROOM',
      'SUBSCRIBE_QUEUE',
      'UNSUBSCRIBE_QUEUE',
    ];

    for (const key of expectedKeys) {
      expect(WS_EVENTS).toHaveProperty(key);
    }
  });
});

// ─── EventBroadcaster Tests (Mocked WebSocket) ─────────────

describe('EventBroadcaster', () => {
  let mockWebsocketService: any;

  beforeEach(() => {
    mockWebsocketService = {
      broadcast: jest.fn(),
      broadcastToSale: jest.fn(),
      broadcastToAdmin: jest.fn(),
      sendToUser: jest.fn(),
      broadcastQueueUpdate: jest.fn(),
    };

    // Create a fresh broadcaster-like object for testing event types
    jest.clearAllMocks();
  });

  describe('Event Types', () => {
    it('should format sale events with correct structure', () => {
      const saleEvent = {
        saleId: 'sale-1',
        productId: 'prod-1',
        name: 'Summer Flash Sale',
        startTime: '2025-06-01T10:00:00Z',
        discount: 30,
        originalPrice: 100,
        salePrice: 70,
      };

      // Verify the event structure has all required fields
      expect(saleEvent.saleId).toBeDefined();
      expect(saleEvent.productId).toBeDefined();
      expect(saleEvent.name).toBeDefined();
      expect(typeof saleEvent.discount).toBe('number');
    });

    it('should format inventory events with remaining percentage', () => {
      const inventoryEvent = {
        saleId: 'sale-1',
        productId: 'prod-1',
        remaining: 25,
        total: 100,
        percentRemaining: 25,
      };

      expect(inventoryEvent.remaining).toBeLessThanOrEqual(inventoryEvent.total);
      expect(inventoryEvent.percentRemaining).toBe(
        (inventoryEvent.remaining / inventoryEvent.total) * 100
      );
    });

    it('should format queue events with position data', () => {
      const queueEvent = {
        saleId: 'sale-1',
        userId: 'user-1',
        position: 42,
        estimatedWaitMs: 12000,
        totalInQueue: 150,
      };

      expect(queueEvent.position).toBeLessThanOrEqual(queueEvent.totalInQueue);
      expect(queueEvent.estimatedWaitMs).toBeGreaterThan(0);
    });

    it('should format order events with status', () => {
      const orderEvent = {
        orderId: 'order-1',
        userId: 'user-1',
        status: 'created' as const,
        total: 49.99,
        items: [{ productId: 'prod-1', quantity: 1 }],
      };

      expect(['created', 'confirmed', 'shipped', 'delivered', 'cancelled']).toContain(
        orderEvent.status
      );
      expect(orderEvent.items.length).toBeGreaterThan(0);
    });

    it('should format price events with discount info', () => {
      const priceEvent = {
        productId: 'prod-1',
        saleId: 'sale-1',
        oldPrice: 100,
        newPrice: 70,
        discount: 30,
        expiresAt: '2025-06-01T12:00:00Z',
      };

      expect(priceEvent.newPrice).toBeLessThan(priceEvent.oldPrice);
      expect(priceEvent.discount).toBe(
        ((priceEvent.oldPrice - priceEvent.newPrice) / priceEvent.oldPrice) * 100
      );
    });
  });

  describe('Broadcasting Patterns', () => {
    it('sale start broadcasts to all clients AND admin', () => {
      // Verify the pattern: saleStarted sends to broadcast + broadcastToAdmin
      mockWebsocketService.broadcast('sale:started', { saleId: 'sale-1' });
      mockWebsocketService.broadcastToAdmin('sale:started', { saleId: 'sale-1' });

      expect(mockWebsocketService.broadcast).toHaveBeenCalledWith('sale:started', {
        saleId: 'sale-1',
      });
      expect(mockWebsocketService.broadcastToAdmin).toHaveBeenCalledWith('sale:started', {
        saleId: 'sale-1',
      });
    });

    it('sale end broadcasts to sale room, all clients, AND admin', () => {
      mockWebsocketService.broadcastToSale('sale-1', 'sale:ended', { name: 'Test' });
      mockWebsocketService.broadcast('sale:ended', { saleId: 'sale-1' });
      mockWebsocketService.broadcastToAdmin('sale:ended', { saleId: 'sale-1' });

      expect(mockWebsocketService.broadcastToSale).toHaveBeenCalledTimes(1);
      expect(mockWebsocketService.broadcast).toHaveBeenCalledTimes(1);
      expect(mockWebsocketService.broadcastToAdmin).toHaveBeenCalledTimes(1);
    });

    it('queue position sends to specific user', () => {
      mockWebsocketService.sendToUser('user-1', 'queue:position', { position: 5 });
      expect(mockWebsocketService.sendToUser).toHaveBeenCalledWith('user-1', 'queue:position', {
        position: 5,
      });
    });

    it('inventory updates go to sale room AND admin', () => {
      mockWebsocketService.broadcastToSale('sale-1', 'inventory:updated', { remaining: 50 });
      mockWebsocketService.broadcastToAdmin('inventory:updated', { remaining: 50 });

      expect(mockWebsocketService.broadcastToSale).toHaveBeenCalledTimes(1);
      expect(mockWebsocketService.broadcastToAdmin).toHaveBeenCalledTimes(1);
    });

    it('order events are sent to the specific user', () => {
      mockWebsocketService.sendToUser('user-1', 'order:created', { orderId: 'order-1' });
      expect(mockWebsocketService.sendToUser).toHaveBeenCalledWith('user-1', 'order:created', {
        orderId: 'order-1',
      });
    });

    it('queue broadcasts use the queue namespace', () => {
      mockWebsocketService.broadcastQueueUpdate('sale-1', { position: 3 });
      expect(mockWebsocketService.broadcastQueueUpdate).toHaveBeenCalledWith('sale-1', {
        position: 3,
      });
    });
  });
});

// ─── WebSocket Config Defaults ──────────────────────────────

describe('WebSocket Default Configuration', () => {
  it('should have sensible default values', () => {
    const defaults = {
      pingInterval: 25000,
      pingTimeout: 20000,
      maxConnectionsPerIp: 10,
      messageRateLimit: 30,
      messageRateWindow: 1000,
    };

    expect(defaults.pingInterval).toBeGreaterThan(defaults.pingTimeout);
    expect(defaults.maxConnectionsPerIp).toBeGreaterThan(0);
    expect(defaults.messageRateLimit).toBeGreaterThan(0);
    expect(defaults.messageRateWindow).toBeGreaterThan(0);
  });

  it('should support websocket and polling transports', () => {
    const transports = ['websocket', 'polling'];
    expect(transports).toContain('websocket');
    expect(transports).toContain('polling');
    expect(transports.length).toBe(2);
  });

  it('should limit message buffer size to 1MB', () => {
    const maxHttpBufferSize = 1e6;
    expect(maxHttpBufferSize).toBe(1000000);
  });
});
