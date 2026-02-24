/**
 * Event Broadcaster Service
 * Week 6 Day 2: Real-Time WebSocket Enhancement
 *
 * Centralized event broadcasting for:
 * - Sale lifecycle events (start, end, update, countdown)
 * - Inventory changes (update, low stock, sold out)
 * - Queue position updates
 * - Order status changes
 * - Price/flash deal notifications
 * - Admin alerts and system status
 */

import { websocketService, WS_EVENTS } from './websocketService';
import { logger } from '../utils/logger';

const broadcastLogger = logger.child('event-broadcaster');

// ─── Types ──────────────────────────────────────────────────

export interface SaleEvent {
  saleId: string;
  productId: string;
  name: string;
  startTime?: string;
  endTime?: string;
  discount?: number;
  originalPrice?: number;
  salePrice?: number;
}

export interface InventoryEvent {
  saleId: string;
  productId: string;
  remaining: number;
  total: number;
  percentRemaining: number;
}

export interface QueueEvent {
  saleId: string;
  userId: string;
  position: number;
  estimatedWaitMs: number;
  totalInQueue: number;
}

export interface OrderEvent {
  orderId: string;
  userId: string;
  status: 'created' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
  total?: number;
  items?: Array<{ productId: string; quantity: number }>;
}

export interface PriceEvent {
  productId: string;
  saleId: string;
  oldPrice: number;
  newPrice: number;
  discount: number;
  expiresAt?: string;
}

// ─── Event Broadcaster ─────────────────────────────────────

class EventBroadcaster {
  // ── Sale Events ────────────────────────────────────────

  saleStarted(event: SaleEvent): void {
    broadcastLogger.info('Broadcasting sale started', { saleId: event.saleId });
    websocketService.broadcast(WS_EVENTS.SALE_STARTED, event);
    websocketService.broadcastToAdmin(WS_EVENTS.SALE_STARTED, event);
  }

  saleEnded(event: SaleEvent): void {
    broadcastLogger.info('Broadcasting sale ended', { saleId: event.saleId });
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.SALE_ENDED, event);
    websocketService.broadcast(WS_EVENTS.SALE_ENDED, { saleId: event.saleId, name: event.name });
    websocketService.broadcastToAdmin(WS_EVENTS.SALE_ENDED, event);
  }

  saleUpdated(event: SaleEvent): void {
    broadcastLogger.debug('Broadcasting sale updated', { saleId: event.saleId });
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.SALE_UPDATED, event);
  }

  saleCountdown(saleId: string, secondsRemaining: number): void {
    websocketService.broadcastToSale(saleId, WS_EVENTS.SALE_COUNTDOWN, {
      saleId,
      secondsRemaining,
      startsAt: new Date(Date.now() + secondsRemaining * 1000).toISOString(),
    });
  }

  // ── Inventory Events ───────────────────────────────────

  inventoryUpdated(event: InventoryEvent): void {
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.INVENTORY_UPDATED, event);
    websocketService.broadcastToAdmin(WS_EVENTS.INVENTORY_UPDATED, event);

    // Auto-trigger low stock / sold out alerts
    if (event.remaining === 0) {
      this.inventorySoldOut(event);
    } else if (event.percentRemaining <= 10) {
      this.inventoryLow(event);
    }
  }

  inventoryLow(event: InventoryEvent): void {
    broadcastLogger.warn('Low inventory alert', {
      saleId: event.saleId,
      remaining: event.remaining,
    });
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.INVENTORY_LOW, {
      ...event,
      message: `Only ${event.remaining} items left!`,
      urgency: event.percentRemaining <= 5 ? 'critical' : 'warning',
    });
    websocketService.broadcastToAdmin(WS_EVENTS.INVENTORY_LOW, event);
  }

  inventorySoldOut(event: InventoryEvent): void {
    broadcastLogger.info('Inventory sold out', { saleId: event.saleId });
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.INVENTORY_SOLDOUT, {
      ...event,
      message: 'This item is now sold out!',
    });
    websocketService.broadcastToAdmin(WS_EVENTS.INVENTORY_SOLDOUT, event);
  }

  // ── Queue Events ───────────────────────────────────────

  queuePositionUpdate(event: QueueEvent): void {
    // Send personal position to user
    websocketService.sendToUser(event.userId, WS_EVENTS.QUEUE_POSITION, {
      position: event.position,
      estimatedWaitMs: event.estimatedWaitMs,
      saleId: event.saleId,
    });

    // Broadcast total queue size to sale room
    websocketService.broadcastQueueUpdate(event.saleId, {
      totalInQueue: event.totalInQueue,
    });
  }

  queueJoined(event: QueueEvent): void {
    broadcastLogger.debug('User joined queue', { userId: event.userId, saleId: event.saleId });
    websocketService.sendToUser(event.userId, WS_EVENTS.QUEUE_JOINED, {
      position: event.position,
      estimatedWaitMs: event.estimatedWaitMs,
      saleId: event.saleId,
    });
    websocketService.broadcastToAdmin(WS_EVENTS.QUEUE_JOINED, {
      saleId: event.saleId,
      totalInQueue: event.totalInQueue,
    });
  }

  queueYourTurn(userId: string, saleId: string): void {
    broadcastLogger.info('Queue turn reached', { userId, saleId });
    websocketService.sendToUser(userId, WS_EVENTS.QUEUE_YOUR_TURN, {
      saleId,
      message: "It's your turn! You can now purchase.",
      expiresInMs: 300000, // 5 minutes to complete purchase
    });
  }

  // ── Order Events ───────────────────────────────────────

  orderCreated(event: OrderEvent): void {
    broadcastLogger.info('Order created', { orderId: event.orderId, userId: event.userId });
    websocketService.sendToUser(event.userId, WS_EVENTS.ORDER_CREATED, event);
    websocketService.broadcastToAdmin(WS_EVENTS.ORDER_CREATED, event);
  }

  orderStatusChanged(event: OrderEvent): void {
    broadcastLogger.info('Order status changed', {
      orderId: event.orderId,
      status: event.status,
    });
    websocketService.sendToUser(event.userId, WS_EVENTS.ORDER_STATUS, event);
    websocketService.broadcastToAdmin(WS_EVENTS.ORDER_STATUS, event);
  }

  orderConfirmed(event: OrderEvent): void {
    websocketService.sendToUser(event.userId, WS_EVENTS.ORDER_CONFIRMED, {
      ...event,
      message: 'Your order has been confirmed!',
    });
  }

  // ── Price Events ───────────────────────────────────────

  priceChanged(event: PriceEvent): void {
    broadcastLogger.info('Price changed', {
      productId: event.productId,
      newPrice: event.newPrice,
    });
    websocketService.broadcastToSale(event.saleId, WS_EVENTS.PRICE_CHANGED, event);
  }

  flashDeal(event: PriceEvent & { message: string }): void {
    broadcastLogger.info('Flash deal announced', { productId: event.productId });
    websocketService.broadcast(WS_EVENTS.FLASH_DEAL, event);
  }

  // ── Admin Events ───────────────────────────────────────

  adminBroadcast(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    broadcastLogger.info('Admin broadcast', { type, message });
    websocketService.broadcast(WS_EVENTS.ADMIN_BROADCAST, { message, type });
  }

  adminAlert(alert: { title: string; message: string; severity: string; data?: any }): void {
    broadcastLogger.warn('Admin alert', alert);
    websocketService.broadcastToAdmin(WS_EVENTS.ADMIN_ALERT, alert);
  }

  systemStatus(status: any): void {
    websocketService.broadcastToAdmin(WS_EVENTS.SYSTEM_STATUS, status);
  }
}

export const eventBroadcaster = new EventBroadcaster();
export default eventBroadcaster;
