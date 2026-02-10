/**
 * Shopping Cart Service - Redis Persistence
 * Week 5 Day 1: Payment System & Shopping Cart
 *
 * Features:
 * - Cart CRUD operations with Redis persistence
 * - Guest cart to user cart migration
 * - Cart expiration & cleanup
 * - Pricing calculations & validation
 * - Flash sale item handling
 */

import { redisClient, isRedisConnected } from '../utils/redis';
import { getPool } from '../utils/database';
import { REDIS_KEYS } from '../config/redisKeys';
import { calculateFlashPrice } from '../utils/priceCalculations';

// Cart TTL: 7 days for logged-in users, 24 hours for guests
const USER_CART_TTL = 7 * 24 * 60 * 60; // 7 days in seconds
const GUEST_CART_TTL = 24 * 60 * 60; // 24 hours in seconds

// Interfaces
export interface CartItem {
  productId: string;
  saleId?: string; // Optional flash sale ID
  quantity: number;
  price: number;
  originalPrice: number;
  name: string;
  imageUrl?: string;
  maxQuantity: number;
  addedAt: Date;
}

export interface Cart {
  id: string;
  userId?: string;
  guestId?: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface AddToCartRequest {
  productId: string;
  saleId?: string;
  quantity: number;
}

export interface UpdateCartItemRequest {
  productId: string;
  quantity: number;
}

export interface CartSummary {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  itemCount: number;
  savings: number;
}

class CartService {
  private readonly TAX_RATE = 0.08; // 8% tax rate
  private readonly FREE_SHIPPING_THRESHOLD = 50; // Free shipping over $50
  private readonly SHIPPING_COST = 5.99;

  /**
   * Get cart key for Redis
   */
  private getCartKey(userId?: string, guestId?: string): string {
    if (userId) {
      return `${REDIS_KEYS.CART_PREFIX}:user:${userId}`;
    }
    return `${REDIS_KEYS.CART_PREFIX}:guest:${guestId}`;
  }

  /**
   * Get or create a cart
   */
  async getCart(userId?: string, guestId?: string): Promise<Cart> {
    const cartKey = this.getCartKey(userId, guestId);

    if (isRedisConnected()) {
      const cached = await redisClient.get(cartKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    // Create new empty cart
    const cart: Cart = {
      id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      guestId,
      items: [],
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: 0,
      itemCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await this.saveCart(cart);
    return cart;
  }

  /**
   * Save cart to Redis
   */
  private async saveCart(cart: Cart): Promise<void> {
    const cartKey = this.getCartKey(cart.userId, cart.guestId);
    const ttl = cart.userId ? USER_CART_TTL : GUEST_CART_TTL;

    cart.updatedAt = new Date();
    cart.expiresAt = new Date(Date.now() + ttl * 1000);

    if (isRedisConnected()) {
      await redisClient.setex(cartKey, ttl, JSON.stringify(cart));
    }
  }

  /**
   * Add item to cart
   */
  async addItem(
    userId: string | undefined,
    guestId: string | undefined,
    request: AddToCartRequest
  ): Promise<Cart> {
    const { productId, saleId, quantity } = request;

    // Validate quantity
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    // Get product details
    const product = await this.getProductDetails(productId, saleId);
    if (!product) {
      throw new Error('Product not found');
    }

    // Check inventory availability
    if (saleId) {
      const available = await this.checkFlashSaleInventory(saleId, productId, quantity);
      if (!available) {
        throw new Error('Requested quantity not available in flash sale');
      }
    }

    const cart = await this.getCart(userId, guestId);

    // Check if item already exists in cart
    const existingIndex = cart.items.findIndex(
      (item) => item.productId === productId && item.saleId === saleId
    );

    if (existingIndex >= 0) {
      // Update existing item quantity
      const newQuantity = cart.items[existingIndex].quantity + quantity;
      if (newQuantity > product.maxQuantity) {
        throw new Error(`Maximum quantity (${product.maxQuantity}) exceeded`);
      }
      cart.items[existingIndex].quantity = newQuantity;
    } else {
      // Add new item
      if (quantity > product.maxQuantity) {
        throw new Error(`Maximum quantity (${product.maxQuantity}) exceeded`);
      }

      cart.items.push({
        productId,
        saleId,
        quantity,
        price: product.price,
        originalPrice: product.originalPrice,
        name: product.name,
        imageUrl: product.imageUrl,
        maxQuantity: product.maxQuantity,
        addedAt: new Date(),
      });
    }

    // Recalculate totals
    this.calculateTotals(cart);
    await this.saveCart(cart);

    console.log(`✅ Added ${quantity}x ${product.name} to cart`);
    return cart;
  }

  /**
   * Update item quantity in cart
   */
  async updateItem(
    userId: string | undefined,
    guestId: string | undefined,
    request: UpdateCartItemRequest
  ): Promise<Cart> {
    const { productId, quantity } = request;
    const cart = await this.getCart(userId, guestId);

    const itemIndex = cart.items.findIndex((item) => item.productId === productId);
    if (itemIndex < 0) {
      throw new Error('Item not found in cart');
    }

    if (quantity <= 0) {
      // Remove item if quantity is 0 or negative
      cart.items.splice(itemIndex, 1);
    } else {
      // Check max quantity
      if (quantity > cart.items[itemIndex].maxQuantity) {
        throw new Error(`Maximum quantity (${cart.items[itemIndex].maxQuantity}) exceeded`);
      }
      cart.items[itemIndex].quantity = quantity;
    }

    this.calculateTotals(cart);
    await this.saveCart(cart);

    return cart;
  }

  /**
   * Remove item from cart
   */
  async removeItem(
    userId: string | undefined,
    guestId: string | undefined,
    productId: string
  ): Promise<Cart> {
    const cart = await this.getCart(userId, guestId);

    const itemIndex = cart.items.findIndex((item) => item.productId === productId);
    if (itemIndex < 0) {
      throw new Error('Item not found in cart');
    }

    const removedItem = cart.items.splice(itemIndex, 1)[0];
    this.calculateTotals(cart);
    await this.saveCart(cart);

    console.log(`🗑️ Removed ${removedItem.name} from cart`);
    return cart;
  }

  /**
   * Clear entire cart
   */
  async clearCart(userId?: string, guestId?: string): Promise<Cart> {
    const cartKey = this.getCartKey(userId, guestId);

    if (isRedisConnected()) {
      await redisClient.del(cartKey);
    }

    return this.getCart(userId, guestId);
  }

  /**
   * Migrate guest cart to user cart
   */
  async migrateGuestCart(guestId: string, userId: string): Promise<Cart> {
    const guestCart = await this.getCart(undefined, guestId);
    const userCart = await this.getCart(userId, undefined);

    if (guestCart.items.length === 0) {
      return userCart;
    }

    // Merge items (user cart takes priority for duplicates)
    for (const guestItem of guestCart.items) {
      const existingIndex = userCart.items.findIndex(
        (item) => item.productId === guestItem.productId && item.saleId === guestItem.saleId
      );

      if (existingIndex >= 0) {
        // Keep the higher quantity (or user's if same)
        if (guestItem.quantity > userCart.items[existingIndex].quantity) {
          userCart.items[existingIndex].quantity = guestItem.quantity;
        }
      } else {
        userCart.items.push(guestItem);
      }
    }

    this.calculateTotals(userCart);
    await this.saveCart(userCart);

    // Clear guest cart
    await this.clearCart(undefined, guestId);

    console.log(`✅ Migrated guest cart to user ${userId}`);
    return userCart;
  }

  /**
   * Validate cart before checkout
   */
  async validateCart(
    userId?: string,
    guestId?: string
  ): Promise<{
    valid: boolean;
    errors: string[];
    cart: Cart;
  }> {
    const cart = await this.getCart(userId, guestId);
    const errors: string[] = [];

    if (cart.items.length === 0) {
      errors.push('Cart is empty');
      return { valid: false, errors, cart };
    }

    // Validate each item
    for (const item of cart.items) {
      // Check if product still exists
      const product = await this.getProductDetails(item.productId, item.saleId);
      if (!product) {
        errors.push(`Product "${item.name}" is no longer available`);
        continue;
      }

      // Check price changes
      if (product.price !== item.price) {
        errors.push(
          `Price for "${item.name}" has changed from $${item.price} to $${product.price}`
        );
        item.price = product.price;
        item.originalPrice = product.originalPrice;
      }

      // Check flash sale inventory
      if (item.saleId) {
        const available = await this.checkFlashSaleInventory(
          item.saleId,
          item.productId,
          item.quantity
        );
        if (!available) {
          errors.push(`Only limited quantity available for "${item.name}"`);
        }
      }

      // Check quantity limits
      if (item.quantity > product.maxQuantity) {
        errors.push(`Maximum quantity for "${item.name}" is ${product.maxQuantity}`);
        item.quantity = product.maxQuantity;
      }
    }

    // Recalculate if items were modified
    if (errors.length > 0) {
      this.calculateTotals(cart);
      await this.saveCart(cart);
    }

    return {
      valid: errors.length === 0,
      errors,
      cart,
    };
  }

  /**
   * Get cart summary for checkout
   */
  getCartSummary(cart: Cart): CartSummary {
    const subtotal = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const originalTotal = cart.items.reduce(
      (sum, item) => sum + item.originalPrice * item.quantity,
      0
    );
    const discount = originalTotal - subtotal;
    const shipping = subtotal >= this.FREE_SHIPPING_THRESHOLD ? 0 : this.SHIPPING_COST;
    const tax = subtotal * this.TAX_RATE;
    const total = subtotal + tax + shipping;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discount: Math.round(discount * 100) / 100,
      tax: Math.round(tax * 100) / 100,
      shipping: Math.round(shipping * 100) / 100,
      total: Math.round(total * 100) / 100,
      itemCount: cart.items.reduce((count, item) => count + item.quantity, 0),
      savings: Math.round(discount * 100) / 100,
    };
  }

  /**
   * Calculate cart totals
   */
  private calculateTotals(cart: Cart): void {
    const summary = this.getCartSummary(cart);
    cart.subtotal = summary.subtotal;
    cart.discount = summary.discount;
    cart.tax = summary.tax;
    cart.total = summary.total;
    cart.itemCount = summary.itemCount;
  }

  /**
   * Get product details for cart
   */
  private async getProductDetails(
    productId: string,
    saleId?: string
  ): Promise<{
    name: string;
    price: number;
    originalPrice: number;
    imageUrl?: string;
    maxQuantity: number;
  } | null> {
    const pool = getPool();

    try {
      if (saleId) {
        // Get flash sale product details
        const result = await pool.query(
          `SELECT p.name, p.price as original_price, p.image_url,
                  fs.discount_percentage, fs.max_quantity_per_user
           FROM products p
           JOIN flash_sales fs ON fs.product_id = p.id
           WHERE p.id = $1 AND fs.id = $2 AND fs.status = 'active'`,
          [productId, saleId]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        const discountedPrice = calculateFlashPrice(row.original_price, row.discount_percentage);

        return {
          name: row.name,
          price: discountedPrice,
          originalPrice: row.original_price,
          imageUrl: row.image_url,
          maxQuantity: row.max_quantity_per_user || 5,
        };
      } else {
        // Get regular product details
        const result = await pool.query(
          `SELECT name, price, image_url FROM products WHERE id = $1`,
          [productId]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          name: row.name,
          price: row.price,
          originalPrice: row.price,
          imageUrl: row.image_url,
          maxQuantity: 10, // Default max quantity for regular products
        };
      }
    } catch (error) {
      console.error('Failed to get product details:', error);
      return null;
    }
  }

  /**
   * Check flash sale inventory availability
   */
  private async checkFlashSaleInventory(
    saleId: string,
    productId: string,
    quantity: number
  ): Promise<boolean> {
    if (!isRedisConnected()) {
      return true; // Assume available if Redis is down
    }

    const inventoryKey = `${REDIS_KEYS.FLASH_SALE_PREFIX}:${saleId}:inventory`;
    const inventory = await redisClient.get(inventoryKey);

    if (!inventory) {
      return true; // Assume available if not cached
    }

    return parseInt(inventory) >= quantity;
  }

  /**
   * Reserve inventory for checkout (temporary hold)
   */
  async reserveInventory(cart: Cart, reservationMinutes = 10): Promise<string> {
    const reservationId = `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (!isRedisConnected()) {
      return reservationId;
    }

    const reservations: Record<string, number> = {};

    for (const item of cart.items) {
      if (item.saleId) {
        const inventoryKey = `${REDIS_KEYS.FLASH_SALE_PREFIX}:${item.saleId}:inventory`;
        const current = await redisClient.get(inventoryKey);

        if (current && parseInt(current) >= item.quantity) {
          // Decrement inventory
          await redisClient.decrby(inventoryKey, item.quantity);
          reservations[`${item.saleId}:${item.productId}`] = item.quantity;
        }
      }
    }

    // Store reservation for potential rollback
    await redisClient.setex(
      `reservation:${reservationId}`,
      reservationMinutes * 60,
      JSON.stringify({ cartId: cart.id, reservations, createdAt: new Date() })
    );

    console.log(`✅ Inventory reserved: ${reservationId}`);
    return reservationId;
  }

  /**
   * Release inventory reservation
   */
  async releaseReservation(reservationId: string): Promise<void> {
    if (!isRedisConnected()) {
      return;
    }

    const reservationData = await redisClient.get(`reservation:${reservationId}`);
    if (!reservationData) {
      return;
    }

    const { reservations } = JSON.parse(reservationData);

    for (const [key, quantity] of Object.entries(reservations)) {
      const [saleId] = key.split(':');
      const inventoryKey = `${REDIS_KEYS.FLASH_SALE_PREFIX}:${saleId}:inventory`;
      await redisClient.incrby(inventoryKey, quantity as number);
    }

    await redisClient.del(`reservation:${reservationId}`);
    console.log(`🔓 Reservation released: ${reservationId}`);
  }

  /**
   * Cleanup expired carts (background job)
   */
  async cleanupExpiredCarts(): Promise<number> {
    // This would typically use Redis SCAN with pattern matching
    // For now, it's handled by Redis TTL automatically
    console.log('🧹 Cart cleanup job completed');
    return 0;
  }
}

// Export singleton instance
export const cartService = new CartService();
export default cartService;
