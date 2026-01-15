import redis from './redis';

// Lua script for atomic inventory decrement
export const LUA_DECREMENT_INVENTORY = `
local key = KEYS[1]
local quantity = tonumber(ARGV[1])

local current = redis.call('GET', key)
if not current then
  return 0
end

current = tonumber(current)
if current < quantity then
  return 0
end

redis.call('DECRBY', key, quantity)
return current - quantity
`;

// Lua script for atomic inventory increment
export const LUA_INCREMENT_INVENTORY = `
local key = KEYS[1]
local quantity = tonumber(ARGV[1])
local max_quantity = tonumber(ARGV[2])

local current = redis.call('GET', key)
current = (current and tonumber(current)) or 0

local new_value = current + quantity
if new_value > max_quantity then
  return -1
end

redis.call('SET', key, new_value)
return new_value
`;

// Lua script for reserve inventory with expiration
export const LUA_RESERVE_INVENTORY = `
local inventory_key = KEYS[1]
local reservation_key = KEYS[2]
local user_id = ARGV[1]
local quantity = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

local current = redis.call('GET', inventory_key)
if not current then
  return 0
end

current = tonumber(current)
if current < quantity then
  return 0
end

redis.call('DECRBY', inventory_key, quantity)
redis.call('HSET', reservation_key, 'quantity', quantity, 'reserved_at', redis.call('TIME')[1], 'user_id', user_id)
redis.call('EXPIRE', reservation_key, ttl)

return 1
`;

// Function to decrement inventory
export async function decrementInventory(
  flashSaleId: string,
  quantity: number
): Promise<number> {
  const key = `inventory:${flashSaleId}`;
  try {
    const result = await redis.eval(LUA_DECREMENT_INVENTORY, 1, key, quantity);
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
  const key = `inventory:${flashSaleId}`;
  try {
    const result = await redis.eval(LUA_INCREMENT_INVENTORY, 1, key, quantity, maxQuantity);
    return Number(result);
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
  const inventoryKey = `inventory:${flashSaleId}`;
  const reservationKey = `reservation:${userId}:${flashSaleId}`;

  try {
    const result = await redis.eval(
      LUA_RESERVE_INVENTORY,
      2,
      inventoryKey,
      reservationKey,
      userId,
      quantity,
      ttlSeconds
    );
    return result === 1;
  } catch (error) {
    console.error('Error reserving inventory:', error);
    throw error;
  }
}

// Function to release reservation
export async function releaseReservation(userId: string, flashSaleId: string): Promise<boolean> {
  const reservationKey = `reservation:${userId}:${flashSaleId}`;
  const inventoryKey = `inventory:${flashSaleId}`;

  try {
    const reservation = await redis.hgetall(reservationKey);
    if (!reservation || !reservation.quantity) {
      return false;
    }

    const quantity = Number(reservation.quantity);
    await redis.incrby(inventoryKey, quantity);
    await redis.del(reservationKey);

    return true;
  } catch (error) {
    console.error('Error releasing reservation:', error);
    throw error;
  }
}

// Queue operations
export async function joinQueue(flashSaleId: string, userId: string): Promise<number> {
  const key = `queue:${flashSaleId}`;
  try {
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
  const key = `queue:${flashSaleId}`;
  try {
    const position = await redis.zrank(key, userId);
    return position !== null ? Number(position) + 1 : -1;
  } catch (error) {
    console.error('Error getting queue position:', error);
    throw error;
  }
}

export async function leaveQueue(flashSaleId: string, userId: string): Promise<boolean> {
  const key = `queue:${flashSaleId}`;
  try {
    const result = await redis.zrem(key, userId);
    return Number(result) > 0;
  } catch (error) {
    console.error('Error leaving queue:', error);
    throw error;
  }
}

export async function getQueueLength(flashSaleId: string): Promise<number> {
  const key = `queue:${flashSaleId}`;
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
  const key = `session:${userId}`;
  try {
    await redis.setex(key, ttlSeconds, token);
  } catch (error) {
    console.error('Error setting session:', error);
    throw error;
  }
}

export async function getSession(userId: string): Promise<string | null> {
  const key = `session:${userId}`;
  try {
    return await redis.get(key);
  } catch (error) {
    console.error('Error getting session:', error);
    throw error;
  }
}

export async function deleteSession(userId: string) {
  const key = `session:${userId}`;
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}
