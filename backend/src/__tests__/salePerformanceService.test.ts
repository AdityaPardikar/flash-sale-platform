/**
 * Tests for Sale Performance Service
 */

import SalePerformanceService from '../salePerformanceService';

jest.mock('../utils/database');
jest.mock('../services/analyticsCollector');

describe('SalePerformanceService', () => {
  describe('getSaleMetrics', () => {
    it('should calculate sale metrics from events', async () => {
      const metrics = await SalePerformanceService.getSaleMetrics('sale1');

      expect(metrics).toHaveProperty('sale_id');
      expect(metrics).toHaveProperty('views');
      expect(metrics).toHaveProperty('unique_viewers');
      expect(metrics).toHaveProperty('queue_joins');
      expect(metrics).toHaveProperty('purchases');
      expect(metrics).toHaveProperty('revenue');
      expect(metrics).toHaveProperty('conversion_rate');
      expect(metrics).toHaveProperty('inventory_sold');
      expect(metrics).toHaveProperty('inventory_utilization');
    });

    it('should handle sale not found', async () => {
      expect(SalePerformanceService.getSaleMetrics('nonexistent')).rejects.toThrow();
    });

    it('should calculate conversion rate correctly', async () => {
      const metrics = await SalePerformanceService.getSaleMetrics('sale1');

      if (metrics.views > 0) {
        expect(metrics.conversion_rate).toBeLessThanOrEqual(1);
        expect(metrics.conversion_rate).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('getQueueStats', () => {
    it('should calculate queue statistics', async () => {
      const stats = await SalePerformanceService.getQueueStats('sale1');

      expect(stats).toHaveProperty('total_joined');
      expect(stats).toHaveProperty('currently_waiting');
      expect(stats).toHaveProperty('admitted');
      expect(stats).toHaveProperty('dropped');
      expect(stats).toHaveProperty('avg_wait_time');
      expect(stats).toHaveProperty('drop_rate');
      expect(stats).toHaveProperty('admission_rate');
    });

    it('should validate drop rate and admission rate', async () => {
      const stats = await SalePerformanceService.getQueueStats('sale1');

      expect(stats.drop_rate).toBeLessThanOrEqual(1);
      expect(stats.drop_rate).toBeGreaterThanOrEqual(0);
      expect(stats.admission_rate).toBeLessThanOrEqual(1);
      expect(stats.admission_rate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getRevenueDetails', () => {
    it('should calculate revenue breakdown', async () => {
      const revenue = await SalePerformanceService.getRevenueDetails('sale1');

      expect(revenue).toHaveProperty('total_revenue');
      expect(revenue).toHaveProperty('total_orders');
      expect(revenue).toHaveProperty('avg_order_value');
      expect(revenue).toHaveProperty('median_order_value');
      expect(revenue).toHaveProperty('by_product');
      expect(revenue).toHaveProperty('by_hour');
    });

    it('should calculate average order value correctly', async () => {
      const revenue = await SalePerformanceService.getRevenueDetails('sale1');

      if (revenue.total_orders > 0) {
        expect(revenue.avg_order_value).toBeCloseTo(
          revenue.total_revenue / revenue.total_orders,
          2
        );
      }
    });
  });

  describe('getInventoryStatus', () => {
    it('should calculate inventory status and projections', async () => {
      const inventory = await SalePerformanceService.getInventoryStatus('sale1');

      expect(inventory).toHaveProperty('total_inventory');
      expect(inventory).toHaveProperty('remaining_inventory');
      expect(inventory).toHaveProperty('sold_quantity');
      expect(inventory).toHaveProperty('utilization_percentage');
      expect(inventory).toHaveProperty('velocity');
      expect(inventory).toHaveProperty('estimated_sell_out_time');
    });

    it('should calculate utilization percentage correctly', async () => {
      const inventory = await SalePerformanceService.getInventoryStatus('sale1');

      const expected = (inventory.sold_quantity / inventory.total_inventory) * 100;
      expect(inventory.utilization_percentage).toBeCloseTo(expected, 1);
    });

    it('should estimate sell-out time for active sales', async () => {
      const inventory = await SalePerformanceService.getInventoryStatus('sale1');

      if (inventory.velocity > 0 && inventory.remaining_inventory > 0) {
        expect(inventory.estimated_sell_out_time).toBeInstanceOf(Date);
        expect(inventory.estimated_sell_out_time!.getTime()).toBeGreaterThan(Date.now());
      }
    });
  });

  describe('comparePerformance', () => {
    it('should compare multiple sales', async () => {
      const comparison = await SalePerformanceService.comparePerformance([
        'sale1',
        'sale2',
        'sale3',
      ]);

      expect(comparison).toHaveLength(3);
      expect(comparison[0]).toHaveProperty('views');
      expect(comparison[0]).toHaveProperty('purchases');
    });

    it('should handle empty array', async () => {
      const comparison = await SalePerformanceService.comparePerformance([]);

      expect(comparison).toHaveLength(0);
    });
  });
});
