import { Router } from 'express';
import * as productController from '../controllers/productController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

/**
 * @route   GET /api/v1/products
 * @desc    Get all products with optional filters
 * @access  Public
 * @query   category, minPrice, maxPrice, limit, offset
 */
router.get('/', productController.getAllProducts);

/**
 * @route   GET /api/v1/products/search
 * @desc    Search products by name or description
 * @access  Public
 * @query   q (search term), limit
 */
router.get('/search', productController.searchProducts);

/**
 * @route   GET /api/v1/products/categories/stats
 * @desc    Get product count by category
 * @access  Public
 */
router.get('/categories/stats', productController.getProductCountByCategory);

/**
 * @route   GET /api/v1/products/category/:category
 * @desc    Get products by category
 * @access  Public
 */
router.get('/category/:category', productController.getProductsByCategory);

/**
 * @route   GET /api/v1/products/:id
 * @desc    Get a single product by ID
 * @access  Public
 */
router.get('/:id', productController.getProductById);

/**
 * @route   POST /api/v1/products
 * @desc    Create a new product
 * @access  Private (Admin only - to be implemented)
 */
router.post('/', authenticateToken, productController.createProduct);

/**
 * @route   PUT /api/v1/products/:id
 * @desc    Update an existing product
 * @access  Private (Admin only - to be implemented)
 */
router.put('/:id', authenticateToken, productController.updateProduct);

/**
 * @route   DELETE /api/v1/products/:id
 * @desc    Delete a product
 * @access  Private (Admin only - to be implemented)
 */
router.delete('/:id', authenticateToken, productController.deleteProduct);

export default router;
