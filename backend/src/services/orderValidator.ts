import { CreateOrderInput, ShippingAddress } from './orderService';
import pool from '../utils/database';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export class OrderValidator {
  /**
   * Validate complete checkout input
   */
  async validateCheckoutInput(input: CreateOrderInput): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate user ID
    if (!input.userId || typeof input.userId !== 'string') {
      errors.push('Invalid user ID');
    }

    // Validate sale ID
    if (!input.saleId || typeof input.saleId !== 'string') {
      errors.push('Invalid sale ID');
    }

    // Validate product ID
    if (!input.productId || typeof input.productId !== 'string') {
      errors.push('Invalid product ID');
    }

    // Validate quantity
    if (!input.quantity || typeof input.quantity !== 'number' || input.quantity <= 0) {
      errors.push('Quantity must be a positive number');
    }

    if (input.quantity > 10) {
      errors.push('Maximum quantity per order is 10');
    }

    // Validate shipping address if provided
    if (input.shippingAddress) {
      const addressErrors = this.validateShippingAddress(input.shippingAddress);
      errors.push(...addressErrors);
    }

    // Validate sale exists and is active
    if (input.saleId) {
      const saleValid = await this.validateSaleActive(input.saleId);
      if (!saleValid) {
        errors.push('Sale is not active or does not exist');
      }
    }

    // Validate product belongs to sale
    if (input.saleId && input.productId) {
      const productValid = await this.validateProductInSale(input.saleId, input.productId);
      if (!productValid) {
        errors.push('Product does not belong to this sale');
      }
    }

    // Validate user exists
    if (input.userId) {
      const userValid = await this.validateUserExists(input.userId);
      if (!userValid) {
        errors.push('User does not exist');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate shipping address
   */
  validateShippingAddress(address: ShippingAddress): string[] {
    const errors: string[] = [];

    if (!address.fullName || address.fullName.trim().length < 2) {
      errors.push('Full name is required (minimum 2 characters)');
    }

    if (!address.addressLine1 || address.addressLine1.trim().length < 5) {
      errors.push('Address line 1 is required (minimum 5 characters)');
    }

    if (!address.city || address.city.trim().length < 2) {
      errors.push('City is required');
    }

    if (!address.state || address.state.trim().length < 2) {
      errors.push('State is required');
    }

    if (!address.postalCode || !this.isValidPostalCode(address.postalCode)) {
      errors.push('Valid postal code is required');
    }

    if (!address.country || address.country.trim().length < 2) {
      errors.push('Country is required');
    }

    if (!address.phone || !this.isValidPhone(address.phone)) {
      errors.push('Valid phone number is required');
    }

    return errors;
  }

  /**
   * Validate sale is active
   */
  async validateSaleActive(saleId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        `SELECT status, start_time, end_time FROM flash_sales WHERE id = $1`,
        [saleId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const sale = result.rows[0];
      const now = new Date();

      // Check if sale is active and within time window
      return (
        sale.status === 'active' &&
        new Date(sale.start_time) <= now &&
        new Date(sale.end_time) >= now
      );
    } catch (error) {
      console.error('Error validating sale:', error);
      return false;
    }
  }

  /**
   * Validate product belongs to sale
   */
  async validateProductInSale(saleId: string, productId: string): Promise<boolean> {
    try {
      const result = await pool.query(
        'SELECT id FROM flash_sales WHERE id = $1 AND product_id = $2',
        [saleId, productId]
      );

      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validating product in sale:', error);
      return false;
    }
  }

  /**
   * Validate user exists
   */
  async validateUserExists(userId: string): Promise<boolean> {
    try {
      const result = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
      return result.rows.length > 0;
    } catch (error) {
      console.error('Error validating user:', error);
      return false;
    }
  }

  /**
   * Validate user doesn't have too many pending orders
   */
  async validateUserOrderLimit(userId: string, maxPending: number = 3): Promise<ValidationResult> {
    try {
      const result = await pool.query(
        `SELECT COUNT(*) as count FROM orders 
         WHERE user_id = $1 AND status IN ('pending', 'processing')`,
        [userId]
      );

      const count = parseInt(result.rows[0].count, 10);

      if (count >= maxPending) {
        return {
          valid: false,
          errors: [`You have ${count} pending orders. Please complete or cancel them first.`],
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      console.error('Error validating user order limit:', error);
      return { valid: false, errors: ['Unable to validate order limit'] };
    }
  }

  /**
   * Validate payment details
   */
  validatePaymentDetails(details: {
    paymentMethod?: string;
    paymentId?: string;
  }): ValidationResult {
    const errors: string[] = [];

    if (!details.paymentMethod) {
      errors.push('Payment method is required');
    }

    const validMethods = ['card', 'upi', 'netbanking', 'wallet', 'paypal'];
    if (details.paymentMethod && !validMethods.includes(details.paymentMethod)) {
      errors.push('Invalid payment method');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate order can be cancelled
   */
  async validateOrderCancellable(orderId: string, userId: string): Promise<ValidationResult> {
    try {
      const result = await pool.query(
        'SELECT status, created_at FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, userId]
      );

      if (result.rows.length === 0) {
        return { valid: false, errors: ['Order not found'] };
      }

      const order = result.rows[0];

      // Only pending and processing orders can be cancelled
      if (!['pending', 'processing'].includes(order.status)) {
        return {
          valid: false,
          errors: [`Order with status '${order.status}' cannot be cancelled`],
        };
      }

      // Check if order is too old (example: 24 hours)
      const orderAge = Date.now() - new Date(order.created_at).getTime();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (orderAge > maxAge && order.status === 'completed') {
        return {
          valid: false,
          errors: ['Order is too old to be cancelled'],
        };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      console.error('Error validating order cancellable:', error);
      return { valid: false, errors: ['Unable to validate order cancellation'] };
    }
  }

  /**
   * Validate refund request
   */
  async validateRefundRequest(
    orderId: string,
    amount: number,
    userId: string
  ): Promise<ValidationResult> {
    try {
      const result = await pool.query(
        'SELECT status, total_amount, payment_status FROM orders WHERE id = $1 AND user_id = $2',
        [orderId, userId]
      );

      if (result.rows.length === 0) {
        return { valid: false, errors: ['Order not found'] };
      }

      const order = result.rows[0];

      // Only completed orders with successful payment can be refunded
      if (order.status !== 'completed' || order.payment_status !== 'completed') {
        return { valid: false, errors: ['Only completed orders can be refunded'] };
      }

      // Validate refund amount
      const orderAmount = parseFloat(order.total_amount);
      if (amount > orderAmount) {
        return { valid: false, errors: ['Refund amount cannot exceed order amount'] };
      }

      if (amount <= 0) {
        return { valid: false, errors: ['Refund amount must be positive'] };
      }

      return { valid: true, errors: [] };
    } catch (error) {
      console.error('Error validating refund request:', error);
      return { valid: false, errors: ['Unable to validate refund request'] };
    }
  }

  /**
   * Helper: Validate postal code format
   */
  private isValidPostalCode(postalCode: string): boolean {
    // Support multiple formats (US ZIP, India PIN, UK postcode, etc.)
    const patterns = [
      /^\d{5}(-\d{4})?$/, // US ZIP
      /^\d{6}$/, // India PIN
      /^[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}$/i, // UK postcode
      /^[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i, // Canada postal code
    ];

    return patterns.some((pattern) => pattern.test(postalCode.trim()));
  }

  /**
   * Helper: Validate phone number
   */
  private isValidPhone(phone: string): boolean {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Should be between 10-15 digits
    return cleaned.length >= 10 && cleaned.length <= 15;
  }

  /**
   * Validate bulk order input (admin feature)
   */
  validateBulkOrders(orders: CreateOrderInput[]): ValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(orders) || orders.length === 0) {
      errors.push('Orders must be a non-empty array');
      return { valid: false, errors };
    }

    if (orders.length > 100) {
      errors.push('Maximum 100 orders can be processed at once');
    }

    // Validate each order
    orders.forEach((order, index) => {
      if (!order.userId) errors.push(`Order ${index + 1}: Missing user ID`);
      if (!order.saleId) errors.push(`Order ${index + 1}: Missing sale ID`);
      if (!order.productId) errors.push(`Order ${index + 1}: Missing product ID`);
      if (!order.quantity || order.quantity <= 0) {
        errors.push(`Order ${index + 1}: Invalid quantity`);
      }
    });

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Sanitize order input (remove potentially harmful data)
   */
  sanitizeOrderInput(input: CreateOrderInput): CreateOrderInput {
    return {
      userId: input.userId?.trim(),
      saleId: input.saleId?.trim(),
      productId: input.productId?.trim(),
      quantity: Math.floor(Math.abs(input.quantity)), // Ensure positive integer
      shippingAddress: input.shippingAddress
        ? {
            fullName: input.shippingAddress.fullName?.trim(),
            addressLine1: input.shippingAddress.addressLine1?.trim(),
            addressLine2: input.shippingAddress.addressLine2?.trim(),
            city: input.shippingAddress.city?.trim(),
            state: input.shippingAddress.state?.trim(),
            postalCode: input.shippingAddress.postalCode?.trim(),
            country: input.shippingAddress.country?.trim(),
            phone: input.shippingAddress.phone?.replace(/\D/g, ''), // Keep only digits
          }
        : undefined,
    };
  }
}

// Export singleton instance
export const orderValidator = new OrderValidator();
export default orderValidator;
