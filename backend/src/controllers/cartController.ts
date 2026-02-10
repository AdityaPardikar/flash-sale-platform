/**
 * Cart Controller
 * Week 5 Day 1: Payment System & Shopping Cart
 *
 * Handles shopping cart HTTP requests
 */

import { Request, Response } from 'express';
import cartService from '../services/cartService';

/**
 * Helper to get user/guest IDs from request
 */
const getCartIdentifiers = (req: Request): { userId?: string; guestId?: string } => {
  const userId = (req as any).user?.id;
  const guestId = req.cookies?.guestId || (req.headers['x-guest-id'] as string);
  return { userId, guestId };
};

/**
 * Get current cart
 * GET /api/cart
 */
export const getCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const cart = await cartService.getCart(userId, guestId);

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Add item to cart
 * POST /api/cart/items
 */
export const addToCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);
    const { productId, saleId, quantity } = req.body;

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    if (!productId || !quantity) {
      res.status(400).json({
        success: false,
        error: 'Product ID and quantity are required',
      });
      return;
    }

    const cart = await cartService.addItem(userId, guestId, {
      productId,
      saleId,
      quantity: parseInt(quantity),
    });

    res.status(201).json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Update cart item quantity
 * PATCH /api/cart/items/:productId
 */
export const updateCartItem = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);
    const { productId } = req.params;
    const { quantity } = req.body;

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    if (quantity === undefined) {
      res.status(400).json({
        success: false,
        error: 'Quantity is required',
      });
      return;
    }

    const cart = await cartService.updateItem(userId, guestId, {
      productId,
      quantity: parseInt(quantity),
    });

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Update cart item error:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Remove item from cart
 * DELETE /api/cart/items/:productId
 */
export const removeFromCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);
    const { productId } = req.params;

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const cart = await cartService.removeItem(userId, guestId, productId);

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(400).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Clear entire cart
 * DELETE /api/cart
 */
export const clearCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const cart = await cartService.clearCart(userId, guestId);

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Migrate guest cart to user cart (on login)
 * POST /api/cart/migrate
 */
export const migrateCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.id;
    const { guestId } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!guestId) {
      res.status(400).json({
        success: false,
        error: 'Guest ID is required',
      });
      return;
    }

    const cart = await cartService.migrateGuestCart(guestId, userId);

    res.json({
      success: true,
      data: cart,
    });
  } catch (error) {
    console.error('Migrate cart error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Validate cart before checkout
 * POST /api/cart/validate
 */
export const validateCart = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const validation = await cartService.validateCart(userId, guestId);

    res.json({
      success: true,
      data: validation,
    });
  } catch (error) {
    console.error('Validate cart error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Get cart summary for checkout
 * GET /api/cart/summary
 */
export const getCartSummary = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const cart = await cartService.getCart(userId, guestId);
    const summary = cartService.getCartSummary(cart);

    res.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error('Get cart summary error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Reserve inventory for checkout
 * POST /api/cart/reserve
 */
export const reserveInventory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, guestId } = getCartIdentifiers(req);

    if (!userId && !guestId) {
      res.status(400).json({
        success: false,
        error: 'User ID or Guest ID required',
      });
      return;
    }

    const cart = await cartService.getCart(userId, guestId);

    if (cart.items.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Cart is empty',
      });
      return;
    }

    const reservationId = await cartService.reserveInventory(cart);

    res.json({
      success: true,
      data: { reservationId },
    });
  } catch (error) {
    console.error('Reserve inventory error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};

/**
 * Release inventory reservation
 * POST /api/cart/release
 */
export const releaseReservation = async (req: Request, res: Response): Promise<void> => {
  try {
    const { reservationId } = req.body;

    if (!reservationId) {
      res.status(400).json({
        success: false,
        error: 'Reservation ID is required',
      });
      return;
    }

    await cartService.releaseReservation(reservationId);

    res.json({
      success: true,
      message: 'Reservation released',
    });
  } catch (error) {
    console.error('Release reservation error:', error);
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
};
