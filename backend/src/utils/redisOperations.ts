import redis from './redis';
import {
  buildInventoryKey,
  buildQueueKey,
  buildReservationKey,
  buildSessionKey,
  REDIS_TTL_SECONDS,
} from '../config/redisKeys';
import { loadLuaScripts, LuaScriptMap } from '../redis/luaLoader';

let luaScripts: LuaScriptMap | null = null;

async function ensureLuaScriptsLoaded(): Promise<LuaScriptMap> {
  if (luaScripts) {
    return luaScripts;
  }

  luaScripts = await loadLuaScripts(redis);
  return luaScripts;
}

// Function to decrement inventory
export async function decrementInventory(flashSaleId: string, quantity: number): Promise<number> {
  const key = buildInventoryKey(flashSaleId);
  try {
    const scripts = await ensureLuaScriptsLoaded();
    const script = scripts.decrementInventory;
    const result = script.sha
      ? await redis.evalsha(script.sha, 1, key, quantity)
      : await redis.eval(script.inline, 1, key, quantity);
    return Number(result);
  } catch (error) {
    console.error('Error decrementing inventory:', error);
    throw error;
  }
}

// Function to increment inventory
export async function incrementInventory(
  flashSaleId: string,
  quantity: number,
  maxQuantity: number
): Promise<number> {
  const key = buildInventoryKey(flashSaleId);
  try {
    const newValue = await redis.incrby(key, quantity);
    if (newValue > maxQuantity) {
      await redis.set(key, maxQuantity);
      return maxQuantity;
    }
    return newValue;
  } catch (error) {
    console.error('Error incrementing inventory:', error);
    throw error;
  }
}

// Function to reserve inventory
export async function reserveInventory(
  flashSaleId: string,
  userId: string,
  quantity: number,
  ttlSeconds: number = 300
): Promise<boolean> {
  const inventoryKey = buildInventoryKey(flashSaleId);
  const reservationKey = buildReservationKey(userId, flashSaleId);

  try {
    const scripts = await ensureLuaScriptsLoaded();
    const script = scripts.reserveInventory;
    const ttl = ttlSeconds || REDIS_TTL_SECONDS.reservation;
    const result = script.sha
      ? await redis.evalsha(script.sha, 2, inventoryKey, reservationKey, userId, quantity, ttl)
      : await redis.eval(script.inline, 2, inventoryKey, reservationKey, userId, quantity, ttl);
    return result === 1;
  } catch (error) {
    console.error('Error reserving inventory:', error);
    throw error;
  }
}

// Function to release reservation
export async function releaseReservation(userId: string, flashSaleId: string): Promise<boolean> {
  const reservationKey = buildReservationKey(userId, flashSaleId);
  const inventoryKey = buildInventoryKey(flashSaleId);

  try {
    const scripts = await ensureLuaScriptsLoaded();
    const script = scripts.releaseReservation;
    const released = script.sha
      ? await redis.evalsha(script.sha, 2, reservationKey, inventoryKey)
      : await redis.eval(script.inline, 2, reservationKey, inventoryKey);
    return Number(released) > 0;
  } catch (error) {
    console.error('Error releasing reservation:', error);
    throw error;
  }
}

// Queue operations
export async function joinQueue(flashSaleId: string, userId: string): Promise<number> {
  const key = buildQueueKey(flashSaleId);
  try {
    const existing = await redis.zrank(key, userId);
    if (existing !== null) {
      return Number(existing) + 1;
    }

    // Add to sorted set with current timestamp as score (for FIFO)
    await redis.zadd(key, Date.now(), userId);
    // Get position in queue
    const position = await redis.zrank(key, userId);
    return Number(position) + 1; // 1-indexed position
  } catch (error) {
    console.error('Error joining queue:', error);
    throw error;
  }
}

export async function getQueuePosition(flashSaleId: string, userId: string): Promise<number> {
  const key = buildQueueKey(flashSaleId);
  try {
    const position = await redis.zrank(key, userId);
    return position !== null ? Number(position) + 1 : -1;
  } catch (error) {
    console.error('Error getting queue position:', error);
    throw error;
  }
}

export async function leaveQueue(flashSaleId: string, userId: string): Promise<boolean> {
  const key = buildQueueKey(flashSaleId);
  try {
    const result = await redis.zrem(key, userId);
    return Number(result) > 0;
  } catch (error) {
    console.error('Error leaving queue:', error);
    throw error;
  }
}

export async function getQueueLength(flashSaleId: string): Promise<number> {
  const key = buildQueueKey(flashSaleId);
  try {
    const length = await redis.zcard(key);
    return Number(length);
  } catch (error) {
    console.error('Error getting queue length:', error);
    throw error;
  }
}

// Session management
export async function setSession(userId: string, token: string, ttlSeconds: number = 86400) {
  const key = buildSessionKey(userId);
  try {
    await redis.setex(key, ttlSeconds, token);
  } catch (error) {
    console.error('Error setting session:', error);
    throw error;
  }
}

export async function getSession(userId: string): Promise<string | null> {
  const key = buildSessionKey(userId);
  try {
    return await redis.get(key);
  } catch (error) {
    console.error('Error getting session:', error);
    throw error;
  }
}

export async function deleteSession(userId: string) {
  const key = buildSessionKey(userId);
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}
