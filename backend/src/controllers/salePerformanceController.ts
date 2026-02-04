/**
 * Sale Performance API Controller
 * Endpoints for retrieving sale metrics and performance data
 */

import { Request, Response } from 'express';
import SalePerformanceService from '../services/salePerformanceService';
import SaleManagementService from '../services/saleManagementService';

export const getSaleMetrics = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const metrics = await SalePerformanceService.getSaleMetrics(id);
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching sale metrics:', error);
    if ((error as any).message?.includes('not found')) {
      res.status(404).json({ error: 'Sale not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch sale metrics' });
    }
  }
};

export const getQueueStats = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const stats = await SalePerformanceService.getQueueStats(id);
    res.json(stats);
  } catch (error) {
    console.error('Error fetching queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
};

export const getRevenueDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const revenue = await SalePerformanceService.getRevenueDetails(id);
    res.json(revenue);
  } catch (error) {
    console.error('Error fetching revenue details:', error);
    res.status(500).json({ error: 'Failed to fetch revenue details' });
  }
};

export const getInventoryStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const inventory = await SalePerformanceService.getInventoryStatus(id);
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching inventory status:', error);
    res.status(500).json({ error: 'Failed to fetch inventory status' });
  }
};

export const getSaleStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const status = await SaleManagementService.getSaleStatus(id);
    res.json(status);
  } catch (error) {
    console.error('Error fetching sale status:', error);
    if ((error as any).message?.includes('not found')) {
      res.status(404).json({ error: 'Sale not found' });
    } else {
      res.status(500).json({ error: 'Failed to fetch sale status' });
    }
  }
};

export const activateSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    await SaleManagementService.activateSale(id);
    res.json({ message: 'Sale activated successfully', sale_id: id, status: 'active' });
  } catch (error) {
    console.error('Error activating sale:', error);
    res.status(500).json({ error: 'Failed to activate sale' });
  }
};

export const pauseSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    await SaleManagementService.pauseSale(id);
    res.json({ message: 'Sale paused successfully', sale_id: id, status: 'paused' });
  } catch (error) {
    console.error('Error pausing sale:', error);
    res.status(500).json({ error: 'Failed to pause sale' });
  }
};

export const resumeSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    await SaleManagementService.resumeSale(id);
    res.json({ message: 'Sale resumed successfully', sale_id: id, status: 'active' });
  } catch (error) {
    console.error('Error resuming sale:', error);
    res.status(500).json({ error: 'Failed to resume sale' });
  }
};

export const emergencyStop = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    await SaleManagementService.emergencyStop(id, reason);
    res.json({ message: 'Emergency stop executed', sale_id: id, status: 'cancelled' });
  } catch (error) {
    console.error('Error in emergency stop:', error);
    res.status(500).json({ error: 'Failed to execute emergency stop' });
  }
};

export const scheduleSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scheduled_start, scheduled_end } = req.body;

    if (!id || !scheduled_start || !scheduled_end) {
      return res
        .status(400)
        .json({ error: 'Sale ID, scheduled_start, and scheduled_end are required' });
    }

    await SaleManagementService.scheduleSale({
      sale_id: id,
      scheduled_start: new Date(scheduled_start),
      scheduled_end: new Date(scheduled_end),
    });

    res.json({
      message: 'Sale scheduled successfully',
      sale_id: id,
      scheduled_start,
      scheduled_end,
      status: 'scheduled',
    });
  } catch (error) {
    console.error('Error scheduling sale:', error);
    const message = (error as any).message || 'Failed to schedule sale';
    res.status(400).json({ error: message });
  }
};

export const adjustInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { adjustment, reason } = req.body;

    if (!id || adjustment === undefined) {
      return res.status(400).json({ error: 'Sale ID and adjustment amount are required' });
    }

    const newInventory = await SaleManagementService.adjustInventory({
      sale_id: id,
      adjustment,
      reason: reason || 'Manual adjustment',
    });

    res.json({
      message: 'Inventory adjusted successfully',
      sale_id: id,
      adjustment,
      new_remaining_inventory: newInventory,
    });
  } catch (error) {
    console.error('Error adjusting inventory:', error);
    const message = (error as any).message || 'Failed to adjust inventory';
    res.status(400).json({ error: message });
  }
};

export const setPriceOverride = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { product_id, override_discount_percentage } = req.body;

    if (!id || !product_id || override_discount_percentage === undefined) {
      return res.status(400).json({
        error: 'Sale ID, product_id, and override_discount_percentage are required',
      });
    }

    await SaleManagementService.setPriceOverride({
      sale_id: id,
      product_id,
      override_discount_percentage,
    });

    res.json({
      message: 'Price override set successfully',
      sale_id: id,
      product_id,
      override_discount_percentage,
    });
  } catch (error) {
    console.error('Error setting price override:', error);
    const message = (error as any).message || 'Failed to set price override';
    res.status(400).json({ error: message });
  }
};

export const getPriceOverrides = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Sale ID is required' });
    }

    const overrides = await SaleManagementService.getPriceOverrides(id);
    res.json({ sale_id: id, overrides });
  } catch (error) {
    console.error('Error fetching price overrides:', error);
    res.status(500).json({ error: 'Failed to fetch price overrides' });
  }
};

export const comparePerformance = async (req: Request, res: Response) => {
  try {
    const { sale_ids } = req.body;

    if (!sale_ids || !Array.isArray(sale_ids) || sale_ids.length === 0) {
      return res.status(400).json({ error: 'sale_ids must be a non-empty array' });
    }

    const comparison = await SalePerformanceService.comparePerformance(sale_ids);
    res.json({
      comparison_count: comparison.length,
      data: comparison,
    });
  } catch (error) {
    console.error('Error comparing performance:', error);
    res.status(500).json({ error: 'Failed to compare performance' });
  }
};
