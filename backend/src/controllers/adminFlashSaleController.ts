/**
 * Admin Flash Sale Controller
 * Handles flash sale CRUD operations and management
 */

import { Request, Response } from 'express';
import { query } from '../utils/database';

export interface CreateFlashSaleDTO {
  name: string;
  description: string;
  discount_percentage: number;
  start_time: Date;
  end_time: Date;
  product_ids: string[];
  max_purchases_per_user: number;
  total_inventory: number;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'ended' | 'cancelled';
}

/**
 * GET /api/admin/flash-sales
 * List all flash sales with filters and pagination
 */
export async function getAllFlashSales(req: Request, res: Response) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const offset = (page - 1) * limit;

    let countQuery = 'SELECT COUNT(*) as count FROM flash_sales WHERE 1=1';
    let selectQuery = `
      SELECT id, name, description, discount_percentage, status, 
             start_time, end_time, max_purchases_per_user, 
             total_inventory, remaining_inventory, created_at, updated_at
      FROM flash_sales WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      countQuery += ` AND status = $${params.length + 1}`;
      selectQuery += ` AND status = $${params.length + 1}`;
      params.push(status);
    }

    if (search) {
      countQuery += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
      selectQuery += ` AND (name ILIKE $${params.length + 1} OR description ILIKE $${params.length + 1})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await query(countQuery, []);
    const totalCount = parseInt(countResult.rows[0].count);

    selectQuery += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await query(selectQuery, params);

    res.json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching flash sales:', error);
    res.status(500).json({ error: 'Failed to fetch flash sales' });
  }
}

/**
 * POST /api/admin/flash-sales
 * Create new flash sale
 */
export async function createFlashSale(req: Request, res: Response) {
  try {
    const {
      name,
      description,
      discount_percentage,
      start_time,
      end_time,
      product_ids,
      max_purchases_per_user,
      total_inventory,
    } = req.body as CreateFlashSaleDTO;

    // Validate inputs
    if (!name || !description) {
      return res.status(400).json({ error: 'Name and description are required' });
    }

    if (discount_percentage < 0 || discount_percentage > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    // Create flash sale
    const insertQuery = `
      INSERT INTO flash_sales 
      (name, description, discount_percentage, start_time, end_time, status, 
       max_purchases_per_user, total_inventory, remaining_inventory, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, name, description, discount_percentage, status, start_time, end_time,
                max_purchases_per_user, total_inventory, remaining_inventory, created_at, updated_at
    `;

    const result = await query(insertQuery, [
      name,
      description,
      discount_percentage,
      start_time,
      end_time,
      'draft',
      max_purchases_per_user || 1,
      total_inventory || 1000,
      total_inventory || 1000,
    ]);

    const saleId = result.rows[0].id;

    // Add products to sale
    if (product_ids && product_ids.length > 0) {
      const insertProductQuery = `INSERT INTO flash_sale_products (flash_sale_id, product_id) VALUES ($1, $2)`;
      for (const productId of product_ids) {
        await query(insertProductQuery, [saleId, productId]);
      }
    }

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating flash sale:', error);
    res.status(500).json({ error: 'Failed to create flash sale' });
  }
}

/**
 * GET /api/admin/flash-sales/:id
 * Get single flash sale details
 */
export async function getFlashSaleDetails(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const saleQuery = `
      SELECT id, name, description, discount_percentage, status, 
             start_time, end_time, max_purchases_per_user, 
             total_inventory, remaining_inventory, created_at, updated_at
      FROM flash_sales WHERE id = $1
    `;

    const saleResult = await query(saleQuery, [id]);
    if (saleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    const sale = saleResult.rows[0];

    // Get associated products
    const productsQuery = `
      SELECT p.id, p.name, p.price, p.image_url
      FROM products p
      JOIN flash_sale_products fsp ON p.id = fsp.product_id
      WHERE fsp.flash_sale_id = $1
    `;

    const productsResult = await query(productsQuery, [id]);

    res.json({
      ...sale,
      products: productsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching flash sale details:', error);
    res.status(500).json({ error: 'Failed to fetch flash sale details' });
  }
}

/**
 * PATCH /api/admin/flash-sales/:id
 * Update flash sale
 */
export async function updateFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, description, discount_percentage, start_time, end_time, status, product_ids } =
      req.body;

    if (
      discount_percentage !== undefined &&
      (discount_percentage < 0 || discount_percentage > 100)
    ) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }
    if (description) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (discount_percentage !== undefined) {
      updates.push(`discount_percentage = $${paramIndex}`);
      params.push(discount_percentage);
      paramIndex++;
    }
    if (start_time) {
      updates.push(`start_time = $${paramIndex}`);
      params.push(start_time);
      paramIndex++;
    }
    if (end_time) {
      updates.push(`end_time = $${paramIndex}`);
      params.push(end_time);
      paramIndex++;
    }
    if (status) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);

    const updateQuery = `
      UPDATE flash_sales 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, description, discount_percentage, status, start_time, end_time,
                max_purchases_per_user, total_inventory, remaining_inventory, created_at, updated_at
    `;

    params.push(id);

    const result = await query(updateQuery, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    // Update products if provided
    if (product_ids && Array.isArray(product_ids)) {
      // Delete existing products
      await query('DELETE FROM flash_sale_products WHERE flash_sale_id = $1', [id]);

      // Insert new products
      const insertProductQuery = `INSERT INTO flash_sale_products (flash_sale_id, product_id) VALUES ($1, $2)`;
      for (const productId of product_ids) {
        await query(insertProductQuery, [id, productId]);
      }
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating flash sale:', error);
    res.status(500).json({ error: 'Failed to update flash sale' });
  }
}

/**
 * POST /api/admin/flash-sales/:id/activate
 * Activate a flash sale
 */
export async function activateFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const updateQuery = `
      UPDATE flash_sales 
      SET status = 'active', updated_at = NOW()
      WHERE id = $1 AND status = 'scheduled'
      RETURNING id, name, status, start_time, end_time, created_at, updated_at
    `;

    const result = await query(updateQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found or not in scheduled status' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error activating flash sale:', error);
    res.status(500).json({ error: 'Failed to activate flash sale' });
  }
}

/**
 * POST /api/admin/flash-sales/:id/pause
 * Pause a flash sale
 */
export async function pauseFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const updateQuery = `
      UPDATE flash_sales 
      SET status = 'paused', updated_at = NOW()
      WHERE id = $1 AND status = 'active'
      RETURNING id, name, status, start_time, end_time, created_at, updated_at
    `;

    const result = await query(updateQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found or not in active status' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error pausing flash sale:', error);
    res.status(500).json({ error: 'Failed to pause flash sale' });
  }
}

/**
 * POST /api/admin/flash-sales/:id/cancel
 * Cancel a flash sale
 */
export async function cancelFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const updateQuery = `
      UPDATE flash_sales 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, status, start_time, end_time, created_at, updated_at
    `;

    const result = await query(updateQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error cancelling flash sale:', error);
    res.status(500).json({ error: 'Failed to cancel flash sale' });
  }
}

/**
 * DELETE /api/admin/flash-sales/:id
 * Delete a flash sale
 */
export async function deleteFlashSale(req: Request, res: Response) {
  try {
    const { id } = req.params;

    // Delete associated products first
    await query('DELETE FROM flash_sale_products WHERE flash_sale_id = $1', [id]);

    // Delete the flash sale
    const deleteQuery = 'DELETE FROM flash_sales WHERE id = $1 RETURNING id';
    const result = await query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    res.json({ message: 'Flash sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting flash sale:', error);
    res.status(500).json({ error: 'Failed to delete flash sale' });
  }
}

/**
 * GET /api/admin/flash-sales/:id/analytics
 * Get flash sale analytics
 */
export async function getFlashSaleAnalytics(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const analyticsQuery = `
      SELECT 
        fs.id,
        fs.name,
        fs.status,
        fs.total_inventory,
        fs.remaining_inventory,
        (fs.total_inventory - fs.remaining_inventory) as sold_count,
        COUNT(DISTINCT o.id) as order_count,
        COUNT(DISTINCT o.user_id) as unique_customers,
        COALESCE(SUM(o.total_price), 0) as total_revenue,
        fs.start_time,
        fs.end_time,
        fs.created_at
      FROM flash_sales fs
      LEFT JOIN orders o ON o.flash_sale_id = fs.id
      WHERE fs.id = $1
      GROUP BY fs.id
    `;

    const result = await query(analyticsQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching flash sale analytics:', error);
    res.status(500).json({ error: 'Failed to fetch flash sale analytics' });
  }
}
