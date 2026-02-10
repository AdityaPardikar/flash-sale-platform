/**
 * Cart Routes
 * Week 5 Day 1: Payment System & Shopping Cart
 */

import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import {
  getCart,
  addToCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  migrateCart,
  validateCart,
  getCartSummary,
  reserveInventory,
  releaseReservation,
} from '../controllers/cartController';

const router = Router();

// Routes that work for both guests and authenticated users
router.use(optionalAuth);

// Get current cart
router.get('/', getCart);

// Get cart summary
router.get('/summary', getCartSummary);

// Add item to cart
router.post('/items', addToCart);

// Update cart item quantity
router.patch('/items/:productId', updateCartItem);

// Remove item from cart
router.delete('/items/:productId', removeFromCart);

// Clear entire cart
router.delete('/', clearCart);

// Validate cart before checkout
router.post('/validate', validateCart);

// Reserve inventory for checkout
router.post('/reserve', reserveInventory);

// Release inventory reservation
router.post('/release', releaseReservation);

// Migrate guest cart to user cart (requires authentication)
router.post('/migrate', authenticateToken, migrateCart);

export default router;
