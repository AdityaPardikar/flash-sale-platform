import orderService, { CreateOrderInput } from '../services/orderService';
import orderValidator from '../services/orderValidator';
import paymentProcessor from '../services/paymentProcessor';
import { inventoryManager } from '../services/inventoryManager';
import pool from '../utils/database';

// Mock dependencies
jest.mock('../utils/database');
jest.mock('../utils/redis');
jest.mock('../services/inventoryManager');
jest.mock('../services/queueService');
jest.mock('../services/analyticsService');

describe('OrderService', () => {
  const mockUserId = 'user-123';
  const mockSaleId = 'sale-456';
  const mockProductId = 'product-789';
  const mockOrderId = 'order-abc-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateCheckout', () => {
    it('should create order and reserve inventory successfully', async () => {
      const orderInput: CreateOrderInput = {
        userId: mockUserId,
        saleId: mockSaleId,
        productId: mockProductId,
        quantity: 1,
      };

      // Mock database responses
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [] }) // Check existing order
          .mockResolvedValueOnce({
            rows: [
              {
                product_id: mockProductId,
                flash_price: '999.99',
                product_name: 'Test Product',
              },
            ],
          }) // Get sale details
          .mockResolvedValueOnce({ rows: [] }) // Insert order
          .mockResolvedValueOnce({ rows: [] }), // Insert history
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock inventory reservation
      (inventoryManager.reserveInventory as jest.Mock).mockResolvedValue({
        success: true,
        remaining: 99,
      });

      const result = await orderService.initiateCheckout(orderInput);

      expect(result).toHaveProperty('orderId');
      expect(result).toHaveProperty('orderNumber');
      expect(result.totalAmount).toBe(999.99);
      expect(result.status).toBe('reserved');
      expect(inventoryManager.reserveInventory).toHaveBeenCalledWith(mockSaleId, mockUserId, 1);
    });

    it('should fail when inventory is out of stock', async () => {
      const orderInput: CreateOrderInput = {
        userId: mockUserId,
        saleId: mockSaleId,
        productId: mockProductId,
        quantity: 1,
      };

      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({
            rows: [
              {
                product_id: mockProductId,
                flash_price: '999.99',
              },
            ],
          }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock inventory out of stock
      (inventoryManager.reserveInventory as jest.Mock).mockResolvedValue({
        success: false,
        remaining: 0,
      });

      await expect(orderService.initiateCheckout(orderInput)).rejects.toThrow(
        'Product out of stock'
      );
    });

    it('should prevent duplicate pending orders', async () => {
      const orderInput: CreateOrderInput = {
        userId: mockUserId,
        saleId: mockSaleId,
        productId: mockProductId,
        quantity: 1,
      };

      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({ rows: [{ id: 'existing-order' }] }) // Existing order found
          .mockResolvedValueOnce({
            rows: [{ product_id: mockProductId, flash_price: '999.99' }],
          }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await expect(orderService.initiateCheckout(orderInput)).rejects.toThrow(
        'You already have a pending order'
      );
    });
  });

  describe('confirmOrder', () => {
    it('should confirm order after successful payment', async () => {
      const mockPaymentId = 'pay_123456';

      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: mockOrderId,
                status: 'pending',
                flash_sale_id: mockSaleId,
                product_name: 'Test Product',
              },
            ],
          }) // Get order
          .mockResolvedValueOnce({ rows: [] }) // Update order
          .mockResolvedValueOnce({ rows: [] }) // Update queue
          .mockResolvedValueOnce({ rows: [] }), // Insert history
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);
      (inventoryManager.confirmPurchase as jest.Mock).mockResolvedValue(true);

      const result = await orderService.confirmOrder(mockOrderId, mockUserId, mockPaymentId);

      expect(result).toHaveProperty('id');
      expect(inventoryManager.confirmPurchase).toHaveBeenCalled();
    });

    it('should fail to confirm non-pending order', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: mockOrderId,
              status: 'completed',
            },
          ],
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await expect(orderService.confirmOrder(mockOrderId, mockUserId, 'pay_123')).rejects.toThrow(
        'Order cannot be confirmed'
      );
    });
  });

  describe('cancelOrder', () => {
    it('should cancel pending order and release inventory', async () => {
      const mockClient = {
        query: jest
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: mockOrderId,
                status: 'pending',
                flash_sale_id: mockSaleId,
              },
            ],
          }) // Get order
          .mockResolvedValueOnce({ rows: [] }) // Update status
          .mockResolvedValueOnce({ rows: [] }), // Insert history
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);
      (inventoryManager.releaseReservation as jest.Mock).mockResolvedValue(true);

      const result = await orderService.cancelOrder(
        mockOrderId,
        mockUserId,
        'User requested cancellation'
      );

      expect(result).toBe(true);
      expect(inventoryManager.releaseReservation).toHaveBeenCalled();
    });

    it('should not cancel completed order', async () => {
      const mockClient = {
        query: jest.fn().mockResolvedValueOnce({
          rows: [
            {
              id: mockOrderId,
              status: 'completed',
            },
          ],
        }),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      await expect(
        orderService.cancelOrder(mockOrderId, mockUserId, 'Test reason')
      ).rejects.toThrow('Order cannot be cancelled');
    });
  });

  describe('getOrderById', () => {
    it('should return order details', async () => {
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: mockOrderId,
            order_number: 'FS-123',
            user_id: mockUserId,
            total_amount: '999.99',
            status: 'completed',
          },
        ],
      });

      const order = await orderService.getOrderById(mockOrderId, mockUserId);

      expect(order).toHaveProperty('id', mockOrderId);
      expect(order?.order_number).toBe('FS-123');
    });

    it('should return null for non-existent order', async () => {
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const order = await orderService.getOrderById('invalid-id', mockUserId);

      expect(order).toBeNull();
    });
  });
});

describe('OrderValidator', () => {
  describe('validateCheckoutInput', () => {
    it('should validate correct input', async () => {
      const input: CreateOrderInput = {
        userId: 'user-123',
        saleId: 'sale-456',
        productId: 'product-789',
        quantity: 1,
      };

      // Mock database calls
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              status: 'active',
              start_time: new Date(Date.now() - 1000),
              end_time: new Date(Date.now() + 10000),
            },
          ],
        }) // Sale check
        .mockResolvedValueOnce({ rows: [{ id: 'sale-456' }] }) // Product in sale
        .mockResolvedValueOnce({ rows: [{ id: 'user-123' }] }); // User exists

      const result = await orderValidator.validateCheckoutInput(input);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid quantity', async () => {
      const input: CreateOrderInput = {
        userId: 'user-123',
        saleId: 'sale-456',
        productId: 'product-789',
        quantity: -1,
      };

      const result = await orderValidator.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Quantity must be a positive number');
    });

    it('should reject quantity over limit', async () => {
      const input: CreateOrderInput = {
        userId: 'user-123',
        saleId: 'sale-456',
        productId: 'product-789',
        quantity: 20,
      };

      const result = await orderValidator.validateCheckoutInput(input);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Maximum quantity per order is 10');
    });
  });

  describe('validateShippingAddress', () => {
    it('should validate correct address', () => {
      const address = {
        fullName: 'John Doe',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        phone: '+919876543210',
      };

      const errors = orderValidator.validateShippingAddress(address);

      expect(errors).toHaveLength(0);
    });

    it('should reject invalid postal code', () => {
      const address = {
        fullName: 'John Doe',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: 'INVALID',
        country: 'India',
        phone: '+919876543210',
      };

      const errors = orderValidator.validateShippingAddress(address);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Valid postal code is required');
    });

    it('should reject invalid phone', () => {
      const address = {
        fullName: 'John Doe',
        addressLine1: '123 Main Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400001',
        country: 'India',
        phone: '123', // Too short
      };

      const errors = orderValidator.validateShippingAddress(address);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Valid phone number is required');
    });
  });
});

describe('PaymentProcessor', () => {
  describe('processPayment', () => {
    it('should process Razorpay payment successfully', async () => {
      const request = {
        amount: 999.99,
        currency: 'INR',
        orderId: 'order-123',
        orderNumber: 'FS-123',
        userId: 'user-123',
      };

      const result = await paymentProcessor.processPayment(request);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('paymentId');
      expect(result.provider).toBe('razorpay');
      expect(result.amount).toBe(999.99);
    });

    it('should handle payment failures gracefully', async () => {
      const request = {
        amount: 999.99,
        currency: 'INR',
        orderId: 'order-123',
        orderNumber: 'FS-123',
        userId: 'user-123',
      };

      // Run multiple times to potentially hit the failure case
      let hasFailure = false;
      for (let i = 0; i < 20; i++) {
        const result = await paymentProcessor.processPayment(request);
        if (!result.success) {
          hasFailure = true;
          expect(result.status).toBe('failed');
          expect(result).toHaveProperty('error');
          break;
        }
      }

      // Given 95% success rate, we should hit at least one failure in 20 tries
      expect(hasFailure).toBeTruthy();
    });
  });

  describe('processRefund', () => {
    it('should process refund successfully', async () => {
      const request = {
        paymentId: 'pay_123',
        amount: 999.99,
        reason: 'Customer requested refund',
      };

      const result = await paymentProcessor.processRefund(request);

      expect(result).toHaveProperty('refundId');
      expect(result.amount).toBe(999.99);
    });
  });
});
