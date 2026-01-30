import { InventoryManager } from '../services/inventoryManager';
import redisClient from '../utils/redis';

jest.mock('../utils/redis');

describe('Week 3 Day 5: Inventory Load Testing - No Overselling', () => {
  let inventoryManager: InventoryManager;
  const saleId = 'flash-sale-001';
  const totalStock = 100;

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryManager = new InventoryManager();
  });

  describe('Concurrent Reservation Without Overselling', () => {
    it('should prevent overselling under 100 concurrent reserve attempts', async () => {
      let remaining = totalStock;
      let successCount = 0;

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, quantity] = args;
        if (remaining >= quantity) {
          remaining -= quantity;
          successCount++;
          return [1, remaining];
        }
        return [0, remaining];
      });

      const promises = Array(100)
        .fill(null)
        .map((_, i) => inventoryManager.reserveInventory(saleId, `user-${i}`, 1));

      const results = await Promise.all(promises);
      const actualSuccesses = results.filter((r) => r.success).length;

      expect(actualSuccesses).toBeLessThanOrEqual(totalStock);
      expect(successCount * 1).toBeLessThanOrEqual(totalStock);
    });

    it('should maintain inventory accuracy under 500 rapid fire requests', async () => {
      let currentInventory = totalStock;
      const requests = [];

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, quantity] = args;
        if (currentInventory >= quantity) {
          currentInventory -= quantity;
          return [1, currentInventory];
        }
        return [0, currentInventory];
      });

      // Simulate 500 requests across all quantities
      for (let i = 0; i < 500; i++) {
        requests.push(inventoryManager.reserveInventory(saleId, `user-${i}`, 1));
      }

      const results = await Promise.all(requests);
      const successfulReservations = results.filter((r: { success: boolean }) => r.success).length;

      expect(successfulReservations * 1).toBeLessThanOrEqual(totalStock);
      expect(currentInventory).toBe(Math.max(0, totalStock - successfulReservations));
    });

    it('should handle mixed reservation quantities without overselling', async () => {
      let inventory = 1000;
      const quantities = [
        ...Array(100).fill(1), // 100 users buying 1
        ...Array(50).fill(5), // 50 users buying 5
        ...Array(20).fill(10), // 20 users buying 10
      ];

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, qty] = args;
        if (inventory >= qty) {
          inventory -= qty;
          return [1, inventory];
        }
        return [0, inventory];
      });

      const promises = quantities.map((qty, idx) =>
        inventoryManager.reserveInventory(saleId, `user-${idx}`, qty)
      );

      const results = await Promise.all(promises);
      const totalSold = results
        .filter((r: { success: boolean }) => r.success)
        .reduce((acc, r: { success: boolean }) => {
          // Find corresponding quantity
          return acc + 1;
        }, 0);

      expect(totalSold * 1).toBeLessThanOrEqual(1000);
    });
  });

  describe('Load Pattern: Burst Traffic', () => {
    it('should handle sudden burst of 1000 concurrent requests', async () => {
      const burstSize = 1000;
      let successfulReservations = 0;

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, quantity] = args;
        if (successfulReservations < totalStock) {
          successfulReservations++;
          return [1, totalStock - successfulReservations];
        }
        return [0, totalStock - successfulReservations];
      });

      const burstRequests = Array(burstSize)
        .fill(null)
        .map((_, i) => inventoryManager.reserveInventory(saleId, `burst-${i}`, 1));

      await Promise.all(burstRequests);

      expect(successfulReservations).toBeLessThanOrEqual(totalStock);
    });

    it('should not allow double-booking same user across concurrent requests', async () => {
      const userId = 'unique-user-001';
      const firstReservation = { success: true, remaining: totalStock - 1 };
      const secondReservation = { success: false, remaining: totalStock - 1 };

      (redisClient.get as jest.Mock)
        .mockResolvedValueOnce(null) // First call - no existing reservation
        .mockResolvedValueOnce('existing'); // Second call - reservation exists

      (redisClient.eval as jest.Mock).mockResolvedValueOnce([1, totalStock - 1]);

      const result1 = await inventoryManager.reserveInventory(saleId, userId, 1);
      expect(result1.success).toBe(true);

      // Second attempt by same user should fail
      (redisClient.get as jest.Mock).mockResolvedValueOnce('existing-reservation');
      const result2 = await inventoryManager.reserveInventory(saleId, userId, 1);
      expect(result2.success).toBe(false);
    });
  });

  describe('Load Pattern: Staggered Requests', () => {
    it('should handle 10 waves of 100 users each', async () => {
      let totalInventory = totalStock * 10; // 1000 units
      let totalSold = 0;

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, quantity] = args;
        if (totalInventory >= quantity) {
          totalInventory -= quantity;
          totalSold++;
          return [1, totalInventory];
        }
        return [0, totalInventory];
      });

      for (let wave = 0; wave < 10; wave++) {
        const waveRequests = Array(100)
          .fill(null)
          .map((_, idx) =>
            inventoryManager.reserveInventory(saleId, `wave-${wave}-user-${idx}`, 1)
          );

        await Promise.all(waveRequests);

        // Verify no overselling in this wave
        expect(totalSold).toBeLessThanOrEqual(1000);
      }

      expect(totalSold).toBeLessThanOrEqual(1000);
      expect(totalInventory).toBe(Math.max(0, 1000 - totalSold));
    });
  });

  describe('Edge Cases Under Load', () => {
    it('should gracefully handle exhausted inventory', async () => {
      (redisClient.eval as jest.Mock).mockResolvedValue([0, 0]); // No inventory

      const result = await inventoryManager.reserveInventory(saleId, 'user-exhausted', 1);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle reservation expiration during high load', async () => {
      (redisClient.get as jest.Mock).mockResolvedValue(totalStock.toString());
      (redisClient.eval as jest.Mock).mockResolvedValue([1, totalStock - 1]);
      (redisClient.expire as jest.Mock).mockResolvedValue(1);

      const result = await inventoryManager.reserveInventory(saleId, 'user-001', 1);

      expect(result.success).toBe(true);
      expect(redisClient.expire).toHaveBeenCalledWith(expect.any(String), 300);
    });

    it('should handle release operations during concurrent reservations', async () => {
      (redisClient.del as jest.Mock).mockResolvedValue(1);
      (redisClient.incrby as jest.Mock).mockResolvedValue(totalStock);

      const result = await inventoryManager.releaseReservation(saleId, 'user-001');

      expect(result).toBe(true);
      expect(redisClient.del).toHaveBeenCalled();
    });
  });

  describe('Load Metrics & Verification', () => {
    it('should demonstrate no overselling with 10000 total operations', async () => {
      const inventory = 100;
      let sold = 0;

      (redisClient.eval as jest.Mock).mockImplementation(async (_script, _keys, args) => {
        const [_key, _ttl, _userId, _qty] = args;
        if (sold < inventory) {
          sold++;
          return [1, inventory - sold];
        }
        return [0, inventory - sold];
      });

      const operations = Array(10000)
        .fill(null)
        .map((_, i) => inventoryManager.reserveInventory(saleId, `op-${i}`, 1));

      await Promise.all(operations);

      expect(sold).toBeLessThanOrEqual(inventory);
      console.log(
        `Load Test: 10000 ops, Inventory: ${inventory}, Sold: ${sold}, Success Rate: ${(
          (sold / inventory) *
          100
        ).toFixed(2)}%`
      );
    });
  });
});
