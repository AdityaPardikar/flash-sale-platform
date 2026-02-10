/**
 * Payment Routes
 * Week 5 Day 1: Payment System & Shopping Cart
 */

import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  createPaymentIntent,
  confirmPayment,
  processRefund,
  getPayment,
  getPaymentHistory,
  retryPayment,
  handleWebhook,
  getPaymentMethods,
} from '../controllers/paymentController';

const router = Router();

// Webhook endpoint (must be before auth middleware, needs raw body)
router.post('/webhook', handleWebhook);

// All other routes require authentication
router.use(authenticateToken);

// Payment intent creation
router.post('/create-intent', createPaymentIntent);

// Payment confirmation
router.post('/confirm', confirmPayment);

// Refund processing
router.post('/refund', processRefund);

// Payment history
router.get('/history', getPaymentHistory);

// Payment methods
router.get('/methods', getPaymentMethods);

// Retry failed payment
router.post('/:paymentId/retry', retryPayment);

// Get specific payment
router.get('/:paymentId', getPayment);

export default router;
