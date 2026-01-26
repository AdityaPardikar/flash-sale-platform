import { Request, Response } from 'express';
import productService from '../services/productService';

/**
 * Get all products with optional filters
 */
export const getAllProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category, minPrice, maxPrice, limit, offset } = req.query;

    const products = await productService.getAllProducts({
      category: category as string,
      minPrice: minPrice ? parseFloat(minPrice as string) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice as string) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });

    res.json({
      success: true,
      data: products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    });
  }
};

/**
 * Get a single product by ID
 */
export const getProductById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const product = await productService.getProductById(id);

    if (!product) {
      res.status(404).json({
        success: false,
        error: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
    });
  }
};

/**
 * Get products by category
 */
export const getProductsByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const { category } = req.params;
    const products = await productService.getProductsByCategory(category);

    res.json({
      success: true,
      data: products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error fetching products by category:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
    });
  }
};

/**
 * Create a new product
 */
export const createProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, base_price, category, image_url } = req.body;

    // Validation
    if (!name || !description || base_price === undefined || !category) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: name, description, base_price, category',
      });
      return;
    }

    const product = await productService.createProduct({
      name,
      description,
      base_price: parseFloat(base_price),
      category,
      image_url,
    });

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully',
    });
  } catch (error: any) {
    console.error('Error creating product:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create product',
    });
  }
};

/**
 * Update an existing product
 */
export const updateProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, base_price, category, image_url } = req.body;

    const product = await productService.updateProduct(id, {
      name,
      description,
      base_price: base_price ? parseFloat(base_price) : undefined,
      category,
      image_url,
    });

    if (!product) {
      res.status(404).json({
        success: false,
        error: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      data: product,
      message: 'Product updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating product:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update product',
    });
  }
};

/**
 * Delete a product
 */
export const deleteProduct = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const deleted = await productService.deleteProduct(id);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Product not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error: any) {
    console.error('Error deleting product:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to delete product',
    });
  }
};

/**
 * Search products
 */
export const searchProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const { q, limit } = req.query;

    if (!q) {
      res.status(400).json({
        success: false,
        error: 'Search query is required',
      });
      return;
    }

    const products = await productService.searchProducts(
      q as string,
      limit ? parseInt(limit as string, 10) : 20
    );

    res.json({
      success: true,
      data: products,
      count: products.length,
    });
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search products',
    });
  }
};

/**
 * Get product count by category
 */
export const getProductCountByCategory = async (req: Request, res: Response): Promise<void> => {
  try {
    const counts = await productService.getProductCountByCategory();

    res.json({
      success: true,
      data: counts,
    });
  } catch (error) {
    console.error('Error fetching product counts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product counts',
    });
  }
};
