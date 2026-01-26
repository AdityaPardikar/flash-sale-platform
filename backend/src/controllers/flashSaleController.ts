import { Request, Response } from 'express';
import flashSaleService from '../services/flashSaleService';
import inventoryManager from '../services/inventoryManager';

/**
 * Get all flash sales with optional status filter
 */
export const getAllFlashSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status } = req.query;
    const sales = await flashSaleService.getAllFlashSales(
      status as 'upcoming' | 'active' | 'completed' | 'cancelled' | undefined
    );

    res.json({
      success: true,
      data: sales,
      count: sales.length,
    });
  } catch (error) {
    console.error('Error fetching flash sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch flash sales',
    });
  }
};

/**
 * Get a single flash sale by ID
 */
export const getFlashSaleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sale = await flashSaleService.getFlashSaleById(id);

    if (!sale) {
      res.status(404).json({
        success: false,
        error: 'Flash sale not found',
      });
      return;
    }

    // Get time remaining
    const timeInfo = flashSaleService.getTimeRemaining(sale);

    // Get inventory stats
    const inventoryStats = await inventoryManager.getInventoryStats(id);

    res.json({
      success: true,
      data: {
        ...sale,
        timeRemaining: timeInfo,
        inventory: inventoryStats,
      },
    });
  } catch (error) {
    console.error('Error fetching flash sale:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch flash sale',
    });
  }
};

/**
 * Get all active flash sales
 */
export const getActiveFlashSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const sales = await flashSaleService.getActiveFlashSales();

    // Add time remaining for each sale
    const salesWithTime = sales.map((sale) => ({
      ...sale,
      timeRemaining: flashSaleService.getTimeRemaining(sale),
    }));

    res.json({
      success: true,
      data: salesWithTime,
      count: salesWithTime.length,
    });
  } catch (error) {
    console.error('Error fetching active flash sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch active flash sales',
    });
  }
};

/**
 * Get upcoming flash sales
 */
export const getUpcomingFlashSales = async (req: Request, res: Response): Promise<void> => {
  try {
    const { limit } = req.query;
    const sales = await flashSaleService.getUpcomingFlashSales(
      limit ? parseInt(limit as string, 10) : 10
    );

    // Add time until start for each sale
    const salesWithTime = sales.map((sale) => ({
      ...sale,
      timeRemaining: flashSaleService.getTimeRemaining(sale),
    }));

    res.json({
      success: true,
      data: salesWithTime,
      count: salesWithTime.length,
    });
  } catch (error) {
    console.error('Error fetching upcoming flash sales:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch upcoming flash sales',
    });
  }
};

/**
 * Create a new flash sale
 */
export const createFlashSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { product_id, flash_price, quantity_available, start_time, end_time } = req.body;

    // Validation
    if (!product_id || !flash_price || !quantity_available || !start_time || !end_time) {
      res.status(400).json({
        success: false,
        error:
          'Missing required fields: product_id, flash_price, quantity_available, start_time, end_time',
      });
      return;
    }

    const sale = await flashSaleService.createFlashSale({
      product_id,
      flash_price: parseFloat(flash_price),
      quantity_available: parseInt(quantity_available, 10),
      start_time: new Date(start_time),
      end_time: new Date(end_time),
    });

    // Initialize inventory in Redis
    await inventoryManager.initializeSaleInventory(sale.id, sale.quantity_available);

    res.status(201).json({
      success: true,
      data: sale,
      message: 'Flash sale created successfully',
    });
  } catch (error: any) {
    console.error('Error creating flash sale:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to create flash sale',
    });
  }
};

/**
 * Update an existing flash sale
 */
export const updateFlashSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { flash_price, quantity_available, start_time, end_time, status } = req.body;

    const sale = await flashSaleService.updateFlashSale(id, {
      flash_price: flash_price ? parseFloat(flash_price) : undefined,
      quantity_available: quantity_available ? parseInt(quantity_available, 10) : undefined,
      start_time: start_time ? new Date(start_time) : undefined,
      end_time: end_time ? new Date(end_time) : undefined,
      status,
    });

    if (!sale) {
      res.status(404).json({
        success: false,
        error: 'Flash sale not found',
      });
      return;
    }

    // Update inventory in Redis if quantity changed
    if (quantity_available) {
      await inventoryManager.syncInventoryFromDatabase(id);
    }

    res.json({
      success: true,
      data: sale,
      message: 'Flash sale updated successfully',
    });
  } catch (error: any) {
    console.error('Error updating flash sale:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to update flash sale',
    });
  }
};

/**
 * Cancel a flash sale
 */
export const cancelFlashSale = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const sale = await flashSaleService.cancelFlashSale(id);

    if (!sale) {
      res.status(404).json({
        success: false,
        error: 'Flash sale not found',
      });
      return;
    }

    // Release all reservations
    await inventoryManager.bulkReleaseReservations(id);

    res.json({
      success: true,
      data: sale,
      message: 'Flash sale cancelled successfully',
    });
  } catch (error: any) {
    console.error('Error cancelling flash sale:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to cancel flash sale',
    });
  }
};

/**
 * Get flash sale statistics
 */
export const getFlashSaleStatistics = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const stats = await flashSaleService.getSaleStatistics(id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('Error fetching flash sale statistics:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch statistics',
    });
  }
};
