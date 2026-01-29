import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import * as orderController from '../controllers/orderController';

const router = Router();

/**
 * Order Routes
 * All routes require authentication
 */

// Initiate checkout (create order and reserve inventory)
router.post('/checkout', authMiddleware, orderController.initiateCheckout);

// Process payment and confirm order
router.post('/payment', authMiddleware, orderController.processPayment);

// Get single order details
router.get('/:orderId', authMiddleware, orderController.getOrder);

// Get order with complete history
router.get('/:orderId/history', authMiddleware, orderController.getOrderWithHistory);

// Get all orders for current user
router.get('/', authMiddleware, orderController.getUserOrders);

// Cancel an order
router.post('/:orderId/cancel', authMiddleware, orderController.cancelOrder);

// Request refund
router.post('/:orderId/refund', authMiddleware, orderController.requestRefund);

// Admin routes (require admin role - TODO: add admin middleware)
router.get('/sale/:saleId/orders', authMiddleware, orderController.getOrdersBySale);
router.get('/sale/:saleId/stats', authMiddleware, orderController.getOrderStats);

// Webhook endpoint (no auth required, verified by signature)
router.post('/webhook/payment', orderController.handlePaymentWebhook);

export default router;
