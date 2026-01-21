import { jest } from '@jest/globals';
import redis from '../utils/redis';
import {
  decrementInventory,
  incrementInventory,
  reserveInventory,
  releaseReservation,
  joinQueue,
  getQueuePosition,
  leaveQueue,
  getQueueLength,
} from '../utils/redisOperations';
import { buildInventoryKey, buildReservationKey, buildQueueKey } from '../config/redisKeys';

jest.mock('ioredis', () => require('ioredis-mock'));

describe('redisOperations', () => {
  const flashSaleId = 'sale-1';
  const userId = 'user-1';

  beforeEach(async () => {
    await redis.flushall();
    await redis.set(buildInventoryKey(flashSaleId), 10);
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('decrements inventory atomically', async () => {
    const remaining = await decrementInventory(flashSaleId, 2);
    expect(remaining).toBe(8);
  });

  it('prevents decrement when insufficient inventory', async () => {
    const remaining = await decrementInventory(flashSaleId, 20);
    expect(remaining).toBe(0);
  });

  it('increments inventory but caps at maxQuantity', async () => {
    const newValue = await incrementInventory(flashSaleId, 5, 12);
    expect(newValue).toBe(12);
  });

  it('reserves and releases inventory with TTL', async () => {
    const reserved = await reserveInventory(flashSaleId, userId, 3, 60);
    expect(reserved).toBe(true);

    const released = await releaseReservation(userId, flashSaleId);
    expect(released).toBe(true);

    const remaining = Number(await redis.get(buildInventoryKey(flashSaleId)));
    expect(remaining).toBe(10);
  });

  it('manages queue positions correctly', async () => {
    const secondUser = 'user-2';
    const queueKey = buildQueueKey(flashSaleId);

    const pos1 = await joinQueue(flashSaleId, userId);
    const pos2 = await joinQueue(flashSaleId, secondUser);

    expect(pos1).toBe(1);
    expect(pos2).toBe(2);

    const length = await getQueueLength(flashSaleId);
    expect(length).toBe(2);

    const user1Pos = await getQueuePosition(flashSaleId, userId);
    const user2Pos = await getQueuePosition(flashSaleId, secondUser);
    expect(user1Pos).toBe(1);
    expect(user2Pos).toBe(2);

    const removed = await leaveQueue(flashSaleId, userId);
    expect(removed).toBe(true);

    const newLength = await getQueueLength(flashSaleId);
    expect(newLength).toBe(1);

    const remainingMembers = await redis.zrange(queueKey, 0, -1);
    expect(remainingMembers).toEqual([secondUser]);
  });
});
