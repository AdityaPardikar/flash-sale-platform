import { Router } from 'express';
import * as flashSaleController from '../controllers/flashSaleController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/flash-sales
 * @desc    Get all flash sales with optional status filter
 * @access  Public
 * @query   status (upcoming, active, completed, cancelled)
 */
router.get('/', flashSaleController.getAllFlashSales);

/**
 * @route   GET /api/v1/flash-sales/active
 * @desc    Get all active flash sales
 * @access  Public
 */
router.get('/active', flashSaleController.getActiveFlashSales);

/**
 * @route   GET /api/v1/flash-sales/upcoming
 * @desc    Get upcoming flash sales
 * @access  Public
 * @query   limit
 */
router.get('/upcoming', flashSaleController.getUpcomingFlashSales);

/**
 * @route   GET /api/v1/flash-sales/:id
 * @desc    Get a single flash sale by ID
 * @access  Public
 */
router.get('/:id', flashSaleController.getFlashSaleById);

/**
 * @route   GET /api/v1/flash-sales/:id/statistics
 * @desc    Get flash sale statistics
 * @access  Private
 */
router.get('/:id/statistics', authenticateToken, flashSaleController.getFlashSaleStatistics);

/**
 * @route   POST /api/v1/flash-sales
 * @desc    Create a new flash sale
 * @access  Private (Admin only)
 */
router.post('/', authenticateToken, flashSaleController.createFlashSale);

/**
 * @route   PUT /api/v1/flash-sales/:id
 * @desc    Update an existing flash sale
 * @access  Private (Admin only)
 */
router.put('/:id', authenticateToken, flashSaleController.updateFlashSale);

/**
 * @route   DELETE /api/v1/flash-sales/:id/cancel
 * @desc    Cancel a flash sale
 * @access  Private (Admin only)
 */
router.delete('/:id/cancel', authenticateToken, flashSaleController.cancelFlashSale);

export default router;
