import { Request, Response, NextFunction } from 'express';
import orderService, { CreateOrderInput } from '../services/orderService';
import orderValidator from '../services/orderValidator';
import paymentProcessor from '../services/paymentProcessor';

/**
 * Initiate checkout - Create order and reserve inventory
 */
export const initiateCheckout = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { saleId, productId, quantity, shippingAddress } = req.body;

    // Build order input
    const orderInput: CreateOrderInput = {
      userId,
      saleId,
      productId,
      quantity: parseInt(quantity, 10) || 1,
      shippingAddress,
    };

    // Sanitize input
    const sanitized = orderValidator.sanitizeOrderInput(orderInput);

    // Validate input
    const validation = await orderValidator.validateCheckoutInput(sanitized);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
      return;
    }

    // Check user order limit
    const limitCheck = await orderValidator.validateUserOrderLimit(userId);
    if (!limitCheck.valid) {
      res.status(400).json({
        error: 'Order limit exceeded',
        details: limitCheck.errors,
      });
      return;
    }

    // Initiate checkout
    const session = await orderService.initiateCheckout(sanitized);

    res.status(201).json({
      success: true,
      message: 'Checkout initiated successfully',
      data: {
        orderId: session.orderId,
        orderNumber: session.orderNumber,
        totalAmount: session.totalAmount,
        currency: 'INR',
        expiresAt: session.reservationExpiresAt,
        expiresInSeconds: 300,
      },
    });
  } catch (error) {
    console.error('Error in initiateCheckout:', error);
    next(error);
  }
};

/**
 * Process payment and confirm order
 */
export const processPayment = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { orderId, paymentMethod } = req.body;

    if (!orderId) {
      res.status(400).json({ error: 'Order ID is required' });
      return;
    }

    // Validate payment details
    const paymentValidation = orderValidator.validatePaymentDetails({
      paymentMethod,
    });

    if (!paymentValidation.valid) {
      res.status(400).json({
        error: 'Invalid payment details',
        details: paymentValidation.errors,
      });
      return;
    }

    // Get order details
    const order = await orderService.getOrderById(orderId, userId);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    if (order.status !== 'pending') {
      res.status(400).json({
        error: `Order cannot be paid. Current status: ${order.status}`,
      });
      return;
    }

    // Process payment
    const paymentResponse = await paymentProcessor.processPayment({
      amount: parseFloat(order.total_amount),
      currency: 'INR',
      orderId: order.id,
      orderNumber: order.order_number,
      userId: userId,
      description: `Payment for ${order.product_name}`,
      metadata: {
        saleId: order.flash_sale_id,
        productId: order.product_id,
      },
    });

    if (!paymentResponse.success) {
      res.status(400).json({
        error: 'Payment failed',
        details: paymentResponse.error,
      });
      return;
    }

    // Confirm order
    const confirmedOrder = await orderService.confirmOrder(
      orderId,
      userId,
      paymentResponse.paymentId,
      paymentResponse.providerResponse
    );

    res.status(200).json({
      success: true,
      message: 'Payment successful! Order confirmed.',
      data: {
        orderId: confirmedOrder.id,
        orderNumber: confirmedOrder.order_number,
        paymentId: paymentResponse.paymentId,
        status: confirmedOrder.status,
        totalAmount: confirmedOrder.total_amount,
      },
    });
  } catch (error) {
    console.error('Error in processPayment:', error);
    next(error);
  }
};

/**
 * Get order details
 */
export const getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { orderId } = req.params;

    const order = await orderService.getOrderById(orderId, userId);

    if (!order) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    console.error('Error in getOrder:', error);
    next(error);
  }
};

/**
 * Get order with history
 */
export const getOrderWithHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { orderId } = req.params;

    const result = await orderService.getOrderWithHistory(orderId, userId);

    if (!result) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in getOrderWithHistory:', error);
    next(error);
  }
};

/**
 * Get all orders for current user
 */
export const getUserOrders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const limit = parseInt(req.query.limit as string, 10) || 50;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const orders = await orderService.getUserOrders(userId, limit, offset);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        limit,
        offset,
        total: orders.length,
      },
    });
  } catch (error) {
    console.error('Error in getUserOrders:', error);
    next(error);
  }
};

/**
 * Cancel an order
 */
export const cancelOrder = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason || reason.trim().length < 5) {
      res.status(400).json({ error: 'Cancellation reason is required (minimum 5 characters)' });
      return;
    }

    // Validate order can be cancelled
    const validation = await orderValidator.validateOrderCancellable(orderId, userId);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Order cannot be cancelled',
        details: validation.errors,
      });
      return;
    }

    // Cancel order
    const cancelled = await orderService.cancelOrder(orderId, userId, reason);

    if (!cancelled) {
      res.status(400).json({ error: 'Failed to cancel order' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
    });
  } catch (error) {
    console.error('Error in cancelOrder:', error);
    next(error);
  }
};

/**
 * Get orders by sale (admin only)
 */
export const getOrdersBySale = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Add admin role check
    const { saleId } = req.params;
    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const offset = parseInt(req.query.offset as string, 10) || 0;

    const orders = await orderService.getOrdersBySale(saleId, status, limit, offset);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        limit,
        offset,
        total: orders.length,
      },
    });
  } catch (error) {
    console.error('Error in getOrdersBySale:', error);
    next(error);
  }
};

/**
 * Get order statistics for a sale (admin only)
 */
export const getOrderStats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Add admin role check
    const { saleId } = req.params;

    const stats = await orderService.getOrderStatsBySale(saleId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error in getOrderStats:', error);
    next(error);
  }
};

/**
 * Request refund (future feature)
 */
export const requestRefund = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { orderId } = req.params;
    const { amount, reason } = req.body;

    // Validate refund request
    const validation = await orderValidator.validateRefundRequest(orderId, amount, userId);
    if (!validation.valid) {
      res.status(400).json({
        error: 'Invalid refund request',
        details: validation.errors,
      });
      return;
    }

    // Get order
    const order = await orderService.getOrderById(orderId, userId);
    if (!order || !order.payment_id) {
      res.status(404).json({ error: 'Order not found or no payment found' });
      return;
    }

    // Process refund
    const refundResponse = await paymentProcessor.processRefund({
      paymentId: order.payment_id,
      amount,
      reason,
    });

    if (!refundResponse.success) {
      res.status(400).json({
        error: 'Refund failed',
        details: refundResponse.error,
      });
      return;
    }

    // Update order status
    await orderService.updateOrderStatus(orderId, 'refunded', `Refund processed: ${reason}`);

    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        refundId: refundResponse.refundId,
        amount: refundResponse.amount,
        status: refundResponse.status,
      },
    });
  } catch (error) {
    console.error('Error in requestRefund:', error);
    next(error);
  }
};

/**
 * Webhook handler for payment provider (future feature)
 */
export const handlePaymentWebhook = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // TODO: Implement webhook verification and handling
    // This would be called by Razorpay/Stripe/PayPal when payment status changes

    const { event, paymentId, orderId, status } = req.body;

    console.log('Payment webhook received:', { event, paymentId, orderId, status });

    // Verify webhook signature
    // Update order status based on webhook event

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Error in handlePaymentWebhook:', error);
    next(error);
  }
};
