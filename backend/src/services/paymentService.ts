/**
 * Payment Service - Stripe Integration
 * Week 5 Day 1: Payment System & Shopping Cart
 *
 * Features:
 * - Stripe payment intent creation
 * - Payment confirmation & capture
 * - Refund processing
 * - Webhook handling
 * - Payment retry logic
 */

import Stripe from 'stripe';
import { getPool, QueryResult } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Initialize Stripe with API key (use test key in development)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

// Payment status enum
export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded',
  CANCELLED = 'cancelled',
}

// Payment method types
export enum PaymentMethod {
  CARD = 'card',
  PAYPAL = 'paypal',
  APPLE_PAY = 'apple_pay',
  GOOGLE_PAY = 'google_pay',
}

// Interfaces
export interface PaymentIntent {
  id: string;
  userId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePaymentIntentId: string;
  paymentMethod: PaymentMethod;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentRequest {
  userId: string;
  orderId: string;
  amount: number;
  currency?: string;
  paymentMethodId?: string;
  metadata?: Record<string, unknown>;
}

export interface RefundRequest {
  paymentId: string;
  amount?: number; // Partial refund amount, full refund if not provided
  reason?: string;
}

class PaymentService {
  /**
   * Create a new payment intent for checkout
   */
  async createPaymentIntent(request: CreatePaymentRequest): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    paymentId: string;
  }> {
    const { userId, orderId, amount, currency = 'usd', metadata = {} } = request;

    try {
      // Validate amount
      if (amount <= 0) {
        throw new Error('Payment amount must be greater than 0');
      }

      // Create Stripe payment intent
      const stripeIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency,
        metadata: {
          userId,
          orderId,
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Store payment record in database
      const pool = getPool();
      const result = await pool.query<{ id: string }>(
        `INSERT INTO payments (
          user_id, order_id, amount, currency, status, 
          stripe_payment_intent_id, payment_method, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          userId,
          orderId,
          amount,
          currency,
          PaymentStatus.PENDING,
          stripeIntent.id,
          PaymentMethod.CARD,
          JSON.stringify(metadata),
        ]
      );

      const paymentId = result.rows[0].id;

      // Cache payment intent for quick lookup
      if (isRedisConnected()) {
        await redisClient.setex(
          `${REDIS_KEYS.PAYMENT_PREFIX}:${paymentId}`,
          3600, // 1 hour TTL
          JSON.stringify({
            paymentId,
            stripeIntentId: stripeIntent.id,
            status: PaymentStatus.PENDING,
            amount,
            userId,
            orderId,
          })
        );
      }

      console.log(`✅ Payment intent created: ${paymentId} for order ${orderId}`);

      return {
        clientSecret: stripeIntent.client_secret!,
        paymentIntentId: stripeIntent.id,
        paymentId,
      };
    } catch (error) {
      console.error('❌ Failed to create payment intent:', error);
      throw error;
    }
  }

  /**
   * Confirm payment after client-side completion
   */
  async confirmPayment(paymentIntentId: string): Promise<PaymentIntent> {
    try {
      // Retrieve Stripe payment intent
      const stripeIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      // Map Stripe status to our status
      const status = this.mapStripeStatus(stripeIntent.status);

      // Update database
      const pool = getPool();
      const result = await pool.query<PaymentIntent>(
        `UPDATE payments 
         SET status = $1, updated_at = NOW()
         WHERE stripe_payment_intent_id = $2
         RETURNING *`,
        [status, paymentIntentId]
      );

      if (result.rows.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = result.rows[0];

      // Update Redis cache
      if (isRedisConnected()) {
        await redisClient.setex(
          `${REDIS_KEYS.PAYMENT_PREFIX}:${payment.id}`,
          3600,
          JSON.stringify({ ...payment, status })
        );
      }

      // If payment succeeded, trigger order fulfillment
      if (status === PaymentStatus.SUCCEEDED) {
        await this.triggerOrderFulfillment(payment.orderId);
      }

      console.log(`✅ Payment ${payment.id} confirmed with status: ${status}`);
      return payment;
    } catch (error) {
      console.error('❌ Failed to confirm payment:', error);
      throw error;
    }
  }

  /**
   * Process refund for a payment
   */
  async processRefund(request: RefundRequest): Promise<{
    refundId: string;
    status: string;
    amount: number;
  }> {
    const { paymentId, amount, reason = 'requested_by_customer' } = request;

    try {
      // Get payment from database
      const pool = getPool();
      const paymentResult = await pool.query<PaymentIntent>(
        'SELECT * FROM payments WHERE id = $1',
        [paymentId]
      );

      if (paymentResult.rows.length === 0) {
        throw new Error('Payment not found');
      }

      const payment = paymentResult.rows[0];

      // Validate payment can be refunded
      if (payment.status !== PaymentStatus.SUCCEEDED) {
        throw new Error('Only succeeded payments can be refunded');
      }

      // Calculate refund amount
      const refundAmount = amount ? Math.round(amount * 100) : Math.round(payment.amount * 100);

      // Create Stripe refund
      const refund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refundAmount,
        reason: reason as Stripe.RefundCreateParams.Reason,
      });

      // Determine new status
      const newStatus =
        amount && amount < payment.amount
          ? PaymentStatus.PARTIALLY_REFUNDED
          : PaymentStatus.REFUNDED;

      // Update database
      await pool.query(
        `UPDATE payments 
         SET status = $1, updated_at = NOW()
         WHERE id = $2`,
        [newStatus, paymentId]
      );

      // Record refund in database
      await pool.query(
        `INSERT INTO refunds (payment_id, stripe_refund_id, amount, reason, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [paymentId, refund.id, refundAmount / 100, reason, refund.status]
      );

      console.log(`✅ Refund processed: ${refund.id} for payment ${paymentId}`);

      return {
        refundId: refund.id,
        status: refund.status,
        amount: refundAmount / 100,
      };
    } catch (error) {
      console.error('❌ Failed to process refund:', error);
      throw error;
    }
  }

  /**
   * Handle Stripe webhook events
   */
  async handleWebhook(event: Stripe.Event): Promise<void> {
    console.log(`📨 Received webhook: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.canceled':
        await this.handlePaymentCanceled(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'charge.dispute.created':
        await this.handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Get payment by ID
   */
  async getPayment(paymentId: string): Promise<PaymentIntent | null> {
    // Try Redis first
    if (isRedisConnected()) {
      const cached = await redisClient.get(`${REDIS_KEYS.PAYMENT_PREFIX}:${paymentId}`);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Fall back to database
    const pool = getPool();
    const result = await pool.query<PaymentIntent>('SELECT * FROM payments WHERE id = $1', [
      paymentId,
    ]);

    return result.rows[0] || null;
  }

  /**
   * Get payments by user ID
   */
  async getUserPayments(userId: string, limit = 10, offset = 0): Promise<PaymentIntent[]> {
    const pool = getPool();
    const result = await pool.query<PaymentIntent>(
      `SELECT * FROM payments 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get payments by order ID
   */
  async getOrderPayments(orderId: string): Promise<PaymentIntent[]> {
    const pool = getPool();
    const result = await pool.query<PaymentIntent>(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC',
      [orderId]
    );

    return result.rows;
  }

  /**
   * Retry failed payment
   */
  async retryPayment(
    paymentId: string,
    newPaymentMethodId?: string
  ): Promise<{
    success: boolean;
    clientSecret?: string;
    error?: string;
  }> {
    try {
      const payment = await this.getPayment(paymentId);
      if (!payment) {
        return { success: false, error: 'Payment not found' };
      }

      if (payment.status !== PaymentStatus.FAILED) {
        return { success: false, error: 'Only failed payments can be retried' };
      }

      // Create new payment intent
      const newIntent = await this.createPaymentIntent({
        userId: payment.userId,
        orderId: payment.orderId,
        amount: payment.amount,
        currency: payment.currency,
        paymentMethodId: newPaymentMethodId,
        metadata: { retryOf: paymentId },
      });

      return {
        success: true,
        clientSecret: newIntent.clientSecret,
      };
    } catch (error) {
      console.error('❌ Failed to retry payment:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  // Private helper methods

  private mapStripeStatus(stripeStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      requires_payment_method: PaymentStatus.PENDING,
      requires_confirmation: PaymentStatus.PENDING,
      requires_action: PaymentStatus.PROCESSING,
      processing: PaymentStatus.PROCESSING,
      succeeded: PaymentStatus.SUCCEEDED,
      canceled: PaymentStatus.CANCELLED,
    };

    return statusMap[stripeStatus] || PaymentStatus.PENDING;
  }

  private async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE payments 
       SET status = $1, updated_at = NOW()
       WHERE stripe_payment_intent_id = $2`,
      [PaymentStatus.SUCCEEDED, paymentIntent.id]
    );

    // Trigger order fulfillment
    if (paymentIntent.metadata.orderId) {
      await this.triggerOrderFulfillment(paymentIntent.metadata.orderId);
    }

    console.log(`✅ Payment succeeded: ${paymentIntent.id}`);
  }

  private async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE payments 
       SET status = $1, updated_at = NOW()
       WHERE stripe_payment_intent_id = $2`,
      [PaymentStatus.FAILED, paymentIntent.id]
    );

    // TODO: Send failure notification to user
    console.log(`❌ Payment failed: ${paymentIntent.id}`);
  }

  private async handlePaymentCanceled(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE payments 
       SET status = $1, updated_at = NOW()
       WHERE stripe_payment_intent_id = $2`,
      [PaymentStatus.CANCELLED, paymentIntent.id]
    );

    console.log(`🚫 Payment canceled: ${paymentIntent.id}`);
  }

  private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
    // Update payment status based on refund
    const pool = getPool();
    const status =
      charge.amount_refunded === charge.amount
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;

    await pool.query(
      `UPDATE payments 
       SET status = $1, updated_at = NOW()
       WHERE stripe_payment_intent_id = $2`,
      [status, charge.payment_intent]
    );

    console.log(`💰 Charge refunded: ${charge.id}`);
  }

  private async handleDisputeCreated(dispute: Stripe.Dispute): Promise<void> {
    // Log dispute and notify admin
    console.log(`⚠️ Dispute created: ${dispute.id} for charge ${dispute.charge}`);

    // TODO: Send admin notification
    // TODO: Store dispute in database
  }

  private async triggerOrderFulfillment(orderId: string): Promise<void> {
    // Update order status to processing
    const pool = getPool();
    await pool.query(`UPDATE orders SET status = 'paid', updated_at = NOW() WHERE id = $1`, [
      orderId,
    ]);

    console.log(`📦 Order fulfillment triggered for: ${orderId}`);

    // TODO: Send confirmation email
    // TODO: Notify inventory system
  }
}

// Export singleton instance
export const paymentService = new PaymentService();
export default paymentService;
