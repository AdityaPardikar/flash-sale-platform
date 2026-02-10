/**
 * Payment Controller
 * Week 5 Day 1: Payment System & Shopping Cart
 *
 * Handles all payment-related HTTP requests
 */

import { Request, Response } from 'express';
import Stripe from 'stripe';
import paymentService, { PaymentStatus } from '../services/paymentService';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

/**
 * Create a new payment intent
 * POST /api/payments/create-intent
 */
export const createPaymentIntent = async (req: Request, res: Response): Promise<void> => {
  try {
    const { orderId, amount, currency, metadata } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!orderId || !amount) {
      res.status(400).json({ success: false, error: 'Order ID and amount are required' });
      return;
    }

    const result = await paymentService.createPaymentIntent({
      userId,
      orderId,
      amount,
      currency,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Confirm a payment
 * POST /api/payments/confirm
 */
export const confirmPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentIntentId } = req.body;

    if (!paymentIntentId) {
      res.status(400).json({ success: false, error: 'Payment intent ID is required' });
      return;
    }

    const payment = await paymentService.confirmPayment(paymentIntentId);

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Process a refund
 * POST /api/payments/refund
 */
export const processRefund = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId, amount, reason } = req.body;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!paymentId) {
      res.status(400).json({ success: false, error: 'Payment ID is required' });
      return;
    }

    // Verify user owns the payment
    const payment = await paymentService.getPayment(paymentId);
    if (!payment || payment.userId !== userId) {
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await paymentService.processRefund({
      paymentId,
      amount,
      reason,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Process refund error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get payment by ID
 * GET /api/payments/:paymentId
 */
export const getPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const userId = (req as any).user?.id;

    const payment = await paymentService.getPayment(paymentId);

    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment not found' });
      return;
    }

    // Verify user owns the payment
    if (payment.userId !== userId) {
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }

    res.json({
      success: true,
      data: payment,
    });
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get user's payment history
 * GET /api/payments/history
 */
export const getPaymentHistory = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { limit = 10, offset = 0 } = req.query;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const payments = await paymentService.getUserPayments(
      userId,
      parseInt(limit as string),
      parseInt(offset as string)
    );

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Retry a failed payment
 * POST /api/payments/:paymentId/retry
 */
export const retryPayment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { paymentId } = req.params;
    const { paymentMethodId } = req.body;
    const userId = (req as any).user?.id;

    // Verify user owns the payment
    const payment = await paymentService.getPayment(paymentId);
    if (!payment || payment.userId !== userId) {
      res.status(403).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await paymentService.retryPayment(paymentId, paymentMethodId);

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      });
      return;
    }

    res.json({
      success: true,
      data: { clientSecret: result.clientSecret },
    });
  } catch (error) {
    console.error('Retry payment error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Handle Stripe webhooks
 * POST /api/payments/webhook
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('⚠️ Stripe webhook secret not configured');
    res.status(400).json({ error: 'Webhook secret not configured' });
    return;
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  try {
    await paymentService.handleWebhook(event);
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

/**
 * Get available payment methods for user
 * GET /api/payments/methods
 */
export const getPaymentMethods = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    // For now, return supported payment methods
    // In production, fetch saved payment methods from Stripe
    res.json({
      success: true,
      data: {
        supportedMethods: ['card', 'apple_pay', 'google_pay'],
        savedMethods: [], // Would fetch from Stripe customer
      },
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};
