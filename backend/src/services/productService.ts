import pool from '../utils/database';
import { Product } from '../models';
import { v4 as uuidv4 } from 'uuid';

export interface CreateProductDto {
  name: string;
  description: string;
  base_price: number;
  category: string;
  image_url?: string;
}

export interface UpdateProductDto {
  name?: string;
  description?: string;
  base_price?: number;
  category?: string;
  image_url?: string;
}

export class ProductService {
  /**
   * Get all products with optional filtering and pagination
   */
  async getAllProducts(options?: {
    category?: string;
    minPrice?: number;
    maxPrice?: number;
    limit?: number;
    offset?: number;
  }): Promise<Product[]> {
    let query = 'SELECT * FROM products WHERE 1=1';
    const params: (string | number)[] = [];
    let paramCount = 1;

    if (options?.category) {
      query += ` AND category = $${paramCount}`;
      params.push(options.category);
      paramCount++;
    }

    if (options?.minPrice !== undefined) {
      query += ` AND base_price >= $${paramCount}`;
      params.push(options.minPrice);
      paramCount++;
    }

    if (options?.maxPrice !== undefined) {
      query += ` AND base_price <= $${paramCount}`;
      params.push(options.maxPrice);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ` LIMIT $${paramCount}`;
      params.push(options.limit);
      paramCount++;
    }

    if (options?.offset) {
      query += ` OFFSET $${paramCount}`;
      params.push(options.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get a single product by ID
   */
  async getProductById(productId: string): Promise<Product | null> {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);

    return result.rows[0] || null;
  }

  /**
   * Get products by category
   */
  async getProductsByCategory(category: string): Promise<Product[]> {
    const result = await pool.query(
      'SELECT * FROM products WHERE category = $1 ORDER BY created_at DESC',
      [category]
    );

    return result.rows;
  }

  /**
   * Create a new product
   */
  async createProduct(data: CreateProductDto): Promise<Product> {
    // Validation
    this.validateProductData(data);

    const productId = uuidv4();
    const imageUrl = data.image_url || 'https://via.placeholder.com/400';

    const result = await pool.query(
      `INSERT INTO products (id, name, description, base_price, category, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [productId, data.name, data.description, data.base_price, data.category, imageUrl]
    );

    return result.rows[0];
  }

  /**
   * Update an existing product
   */
  async updateProduct(productId: string, data: UpdateProductDto): Promise<Product | null> {
    const existingProduct = await this.getProductById(productId);
    if (!existingProduct) {
      return null;
    }

    // Build dynamic update query
    const updates: string[] = [];
    const params: (string | number)[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(data.name);
      paramCount++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      params.push(data.description);
      paramCount++;
    }

    if (data.base_price !== undefined) {
      if (data.base_price < 0) {
        throw new Error('Price cannot be negative');
      }
      updates.push(`base_price = $${paramCount}`);
      params.push(data.base_price);
      paramCount++;
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramCount}`);
      params.push(data.category);
      paramCount++;
    }

    if (data.image_url !== undefined) {
      updates.push(`image_url = $${paramCount}`);
      params.push(data.image_url);
      paramCount++;
    }

    if (updates.length === 0) {
      return existingProduct;
    }

    params.push(productId);
    const query = `
      UPDATE products
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Delete a product
   */
  async deleteProduct(productId: string): Promise<boolean> {
    // Check if product exists
    const product = await this.getProductById(productId);
    if (!product) {
      return false;
    }

    // Check if product is part of any active flash sales
    const activeSalesResult = await pool.query(
      `SELECT id FROM flash_sales 
       WHERE product_id = $1 AND status IN ('upcoming', 'active')`,
      [productId]
    );

    if (activeSalesResult.rows.length > 0) {
      throw new Error('Cannot delete product with active or upcoming flash sales');
    }

    await pool.query('DELETE FROM products WHERE id = $1', [productId]);
    return true;
  }

  /**
   * Get product count by category
   */
  async getProductCountByCategory(): Promise<Record<string, number>> {
    const result = await pool.query(
      'SELECT category, COUNT(*)::int as count FROM products GROUP BY category'
    );

    const counts: Record<string, number> = {};
    result.rows.forEach((row) => {
      counts[row.category] = row.count;
    });

    return counts;
  }

  /**
   * Search products by name or description
   */
  async searchProducts(searchTerm: string, limit: number = 20): Promise<Product[]> {
    const result = await pool.query(
      `SELECT * FROM products 
       WHERE name ILIKE $1 OR description ILIKE $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [`%${searchTerm}%`, limit]
    );

    return result.rows;
  }

  /**
   * Validate product data
   */
  private validateProductData(data: CreateProductDto): void {
    if (!data.name || data.name.trim().length === 0) {
      throw new Error('Product name is required');
    }

    if (!data.description || data.description.trim().length === 0) {
      throw new Error('Product description is required');
    }

    if (data.base_price < 0) {
      throw new Error('Price cannot be negative');
    }

    if (!data.category || data.category.trim().length === 0) {
      throw new Error('Product category is required');
    }
  }
}

export default new ProductService();
