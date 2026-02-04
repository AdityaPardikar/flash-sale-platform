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

export interface UpdateFlashSaleDTO {
  name?: string;
  description?: string;
  discount_percentage?: number;
  start_time?: Date;
  end_time?: Date;
  product_ids?: string[];
  max_purchases_per_user?: number;
  total_inventory?: number;
}

export const createFlashSale = async (req: Request, res: Response) => {
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

    // Validation
    if (!name || !discount_percentage || !start_time || !end_time || !product_ids?.length) {
      return res.status(400).json({
        error:
          'Missing required fields: name, discount_percentage, start_time, end_time, product_ids',
      });
    }

    if (new Date(start_time) >= new Date(end_time)) {
      return res.status(400).json({ error: 'Start time must be before end time' });
    }

    if (discount_percentage <= 0 || discount_percentage > 100) {
      return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
    }

    // Create flash sale
    const query = `
      INSERT INTO flash_sales 
      (name, description, discount_percentage, start_time, end_time, status, 
       max_purchases_per_user, total_inventory, remaining_inventory, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const result = await new Promise<any>((resolve, reject) => {
      db.run(
        query,
        [
          name,
          description,
          discount_percentage,
          start_time,
          end_time,
          'draft',
          max_purchases_per_user || 1,
          total_inventory || 1000,
          total_inventory || 1000,
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    // Add products to sale
    if (product_ids.length > 0) {
      const insertQuery = `INSERT INTO flash_sale_products (flash_sale_id, product_id) VALUES (?, ?)`;
      for (const productId of product_ids) {
        await new Promise<void>((resolve, reject) => {
          db.run(insertQuery, [result.id, productId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    res.status(201).json({
      id: result.id,
      name,
      description,
      discount_percentage,
      start_time,
      end_time,
      status: 'draft',
      product_ids,
      max_purchases_per_user: max_purchases_per_user || 1,
      total_inventory: total_inventory || 1000,
      remaining_inventory: total_inventory || 1000,
      created_at: new Date(),
    });
  } catch (error) {
    console.error('Error creating flash sale:', error);
    res.status(500).json({ error: 'Failed to create flash sale' });
  }
};

export const updateFlashSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as UpdateFlashSaleDTO;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    // Validate date range if updating times
    if (updates.start_time && updates.end_time) {
      if (new Date(updates.start_time) >= new Date(updates.end_time)) {
        return res.status(400).json({ error: 'Start time must be before end time' });
      }
    }

    // Validate discount
    if (updates.discount_percentage !== undefined) {
      if (updates.discount_percentage <= 0 || updates.discount_percentage > 100) {
        return res.status(400).json({ error: 'Discount percentage must be between 0 and 100' });
      }
    }

    // Build update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'product_ids') {
        updateFields.push(`${key} = ?`);
        updateValues.push(value);
      }
    });

    if (updateFields.length === 0 && !updates.product_ids) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(id);
    updateFields.push('updated_at = NOW()');

    const query = `UPDATE flash_sales SET ${updateFields.join(', ')} WHERE id = ?`;

    await new Promise<void>((resolve, reject) => {
      db.run(query, updateValues, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Update products if provided
    if (updates.product_ids) {
      await new Promise<void>((resolve, reject) => {
        db.run('DELETE FROM flash_sale_products WHERE flash_sale_id = ?', [id], (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      const insertQuery = `INSERT INTO flash_sale_products (flash_sale_id, product_id) VALUES (?, ?)`;
      for (const productId of updates.product_ids) {
        await new Promise<void>((resolve, reject) => {
          db.run(insertQuery, [id, productId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    res.json({ message: 'Flash sale updated successfully' });
  } catch (error) {
    console.error('Error updating flash sale:', error);
    res.status(500).json({ error: 'Failed to update flash sale' });
  }
};

export const deleteFlashSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    // Check if sale is active
    const checkQuery = `SELECT status FROM flash_sales WHERE id = ?`;
    const sale = await new Promise<any>((resolve, reject) => {
      db.get(checkQuery, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!sale) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    if (sale.status === 'active') {
      return res
        .status(400)
        .json({ error: 'Cannot delete active flash sale. Pause or cancel first.' });
    }

    // Delete products association
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM flash_sale_products WHERE flash_sale_id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Delete sale
    await new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM flash_sales WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: 'Flash sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting flash sale:', error);
    res.status(500).json({ error: 'Failed to delete flash sale' });
  }
};

export const duplicateFlashSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    // Get original sale
    const query = `SELECT * FROM flash_sales WHERE id = ?`;
    const originalSale = await new Promise<any>((resolve, reject) => {
      db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!originalSale) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    // Get product IDs
    const productsQuery = `SELECT product_id FROM flash_sale_products WHERE flash_sale_id = ?`;
    const products = await new Promise<any[]>((resolve, reject) => {
      db.all(productsQuery, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Create duplicate with new name
    const duplicateName = `${originalSale.name} (Copy)`;
    const createQuery = `
      INSERT INTO flash_sales 
      (name, description, discount_percentage, start_time, end_time, status, 
       max_purchases_per_user, total_inventory, remaining_inventory, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;

    const newSale = await new Promise<any>((resolve, reject) => {
      db.run(
        createQuery,
        [
          duplicateName,
          originalSale.description,
          originalSale.discount_percentage,
          originalSale.start_time,
          originalSale.end_time,
          'draft',
          originalSale.max_purchases_per_user,
          originalSale.total_inventory,
          originalSale.total_inventory,
        ],
        function (err) {
          if (err) reject(err);
          else resolve({ id: this.lastID });
        }
      );
    });

    // Copy products
    if (products.length > 0) {
      const insertQuery = `INSERT INTO flash_sale_products (flash_sale_id, product_id) VALUES (?, ?)`;
      for (const product of products) {
        await new Promise<void>((resolve, reject) => {
          db.run(insertQuery, [newSale.id, product.product_id], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }
    }

    res.status(201).json({
      id: newSale.id,
      name: duplicateName,
      message: 'Flash sale duplicated successfully',
    });
  } catch (error) {
    console.error('Error duplicating flash sale:', error);
    res.status(500).json({ error: 'Failed to duplicate flash sale' });
  }
};

export const bulkUpdateFlashSales = async (req: Request, res: Response) => {
  try {
    const { sale_ids, action, status } = req.body;

    if (!sale_ids || !Array.isArray(sale_ids) || sale_ids.length === 0) {
      return res.status(400).json({ error: 'sale_ids must be a non-empty array' });
    }

    if (!action) {
      return res.status(400).json({ error: 'action is required (activate, pause, cancel)' });
    }

    const validActions = ['activate', 'pause', 'cancel'];
    if (!validActions.includes(action)) {
      return res
        .status(400)
        .json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` });
    }

    const statusMap: Record<string, string> = {
      activate: 'active',
      pause: 'paused',
      cancel: 'cancelled',
    };

    const newStatus = statusMap[action];
    const placeholders = sale_ids.map(() => '?').join(',');
    const updateQuery = `UPDATE flash_sales SET status = ?, updated_at = NOW() WHERE id IN (${placeholders})`;

    await new Promise<void>((resolve, reject) => {
      db.run(updateQuery, [newStatus, ...sale_ids], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({
      message: `Successfully performed '${action}' on ${sale_ids.length} sales`,
      updated_count: sale_ids.length,
      status: newStatus,
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({ error: 'Failed to perform bulk operation' });
  }
};

export const getFlashSaleList = async (req: Request, res: Response) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT * FROM flash_sales';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit as string) || 50, parseInt(offset as string) || 0);

    const sales = await new Promise<any[]>((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM flash_sales';
    if (status) {
      countQuery += ' WHERE status = ?';
    }

    const countResult = await new Promise<any>((resolve, reject) => {
      db.get(countQuery, status ? [status] : [], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    res.json({
      data: sales,
      pagination: {
        total: countResult.total,
        limit: parseInt(limit as string) || 50,
        offset: parseInt(offset as string) || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching flash sales:', error);
    res.status(500).json({ error: 'Failed to fetch flash sales' });
  }
};

export const getFlashSaleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const query = `SELECT * FROM flash_sales WHERE id = ?`;
    const sale = await new Promise<any>((resolve, reject) => {
      db.get(query, [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!sale) {
      return res.status(404).json({ error: 'Flash sale not found' });
    }

    // Get products
    const productsQuery = `SELECT product_id FROM flash_sale_products WHERE flash_sale_id = ?`;
    const products = await new Promise<any[]>((resolve, reject) => {
      db.all(productsQuery, [id], (err, rows) => {
        if (err) reject(err);
        else resolve(rows?.map((r) => r.product_id) || []);
      });
    });

    res.json({
      ...sale,
      product_ids: products,
    });
  } catch (error) {
    console.error('Error fetching flash sale:', error);
    res.status(500).json({ error: 'Failed to fetch flash sale' });
  }
};
