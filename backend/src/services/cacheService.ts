/**
 * Cache Service
 * Day 6: Performance Optimization & Caching
 * Multi-layer caching with Redis
 */

import redis from '../utils/redis';
import { CACHE_TTL, withPrefix, CACHE_PATTERNS } from '../utils/cacheKeys';
import { logger } from '../utils/logger';

// In-memory cache for L1 caching
const memoryCache: Map<string, { value: any; expiry: number }> = new Map();
const MEMORY_CACHE_MAX_SIZE = 1000;
const MEMORY_CACHE_DEFAULT_TTL = 30; // 30 seconds for L1 cache

/**
 * Cache statistics tracking
 */
const cacheStats = {
  hits: 0,
  misses: 0,
  memoryHits: 0,
  redisHits: 0,
  sets: 0,
  deletes: 0,
};

/**
 * Get cache statistics
 */
export function getCacheStats(): typeof cacheStats & { hitRate: number } {
  const total = cacheStats.hits + cacheStats.misses;
  return {
    ...cacheStats,
    hitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
  };
}

/**
 * Reset cache statistics
 */
export function resetCacheStats(): void {
  cacheStats.hits = 0;
  cacheStats.misses = 0;
  cacheStats.memoryHits = 0;
  cacheStats.redisHits = 0;
  cacheStats.sets = 0;
  cacheStats.deletes = 0;
}

/**
 * Clean expired entries from memory cache
 */
function cleanMemoryCache(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache.entries()) {
    if (entry.expiry < now) {
      memoryCache.delete(key);
    }
  }

  // Evict oldest entries if over max size
  if (memoryCache.size > MEMORY_CACHE_MAX_SIZE) {
    const sortedEntries = Array.from(memoryCache.entries())
      .sort((a, b) => a[1].expiry - b[1].expiry);
    
    const toDelete = sortedEntries.slice(0, memoryCache.size - MEMORY_CACHE_MAX_SIZE);
    for (const [key] of toDelete) {
      memoryCache.delete(key);
    }
  }
}

/**
 * Get value from cache (L1 memory -> L2 Redis)
 */
export async function get<T>(key: string): Promise<T | null> {
  const prefixedKey = withPrefix(key);

  // Check L1 memory cache first
  const memoryEntry = memoryCache.get(prefixedKey);
  if (memoryEntry && memoryEntry.expiry > Date.now()) {
    cacheStats.hits++;
    cacheStats.memoryHits++;
    return memoryEntry.value as T;
  }

  // Check L2 Redis cache
  try {
    const redisValue = await redis.get(prefixedKey);
    if (redisValue) {
      const parsed = JSON.parse(redisValue) as T;
      
      // Populate L1 cache
      memoryCache.set(prefixedKey, {
        value: parsed,
        expiry: Date.now() + MEMORY_CACHE_DEFAULT_TTL * 1000,
      });

      cacheStats.hits++;
      cacheStats.redisHits++;
      return parsed;
    }
  } catch (error) {
    logger.error('Cache get error', { key, error: (error as Error).message });
  }

  cacheStats.misses++;
  return null;
}

/**
 * Set value in cache (both L1 and L2)
 */
export async function set<T>(key: string, value: T, ttlSeconds: number = CACHE_TTL.DEFAULT): Promise<void> {
  const prefixedKey = withPrefix(key);
  const serialized = JSON.stringify(value);

  try {
    // Set in L2 Redis
    await redis.setex(prefixedKey, ttlSeconds, serialized);

    // Set in L1 memory cache
    const memoryTtl = Math.min(ttlSeconds, MEMORY_CACHE_DEFAULT_TTL);
    memoryCache.set(prefixedKey, {
      value,
      expiry: Date.now() + memoryTtl * 1000,
    });

    cacheStats.sets++;
    cleanMemoryCache();
  } catch (error) {
    logger.error('Cache set error', { key, error: (error as Error).message });
  }
}

/**
 * Delete from cache
 */
export async function del(key: string): Promise<void> {
  const prefixedKey = withPrefix(key);

  try {
    // Delete from L1
    memoryCache.delete(prefixedKey);
    
    // Delete from L2
    await redis.del(prefixedKey);
    
    cacheStats.deletes++;
  } catch (error) {
    logger.error('Cache delete error', { key, error: (error as Error).message });
  }
}

/**
 * Delete multiple keys matching a pattern
 */
export async function delPattern(pattern: string): Promise<number> {
  const prefixedPattern = withPrefix(pattern);
  let deletedCount = 0;

  try {
    // Delete from L1 memory cache
    for (const key of memoryCache.keys()) {
      if (key.match(new RegExp(prefixedPattern.replace('*', '.*')))) {
        memoryCache.delete(key);
        deletedCount++;
      }
    }

    // Delete from L2 Redis using SCAN for safety
    let cursor = '0';
    do {
      const [newCursor, keys] = await redis.scan(cursor, 'MATCH', prefixedPattern, 'COUNT', 100);
      cursor = newCursor;
      
      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    } while (cursor !== '0');

    cacheStats.deletes += deletedCount;
    return deletedCount;
  } catch (error) {
    logger.error('Cache delete pattern error', { pattern, error: (error as Error).message });
    return deletedCount;
  }
}

/**
 * Get or set - returns cached value or fetches and caches
 */
export async function getOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlSeconds: number = CACHE_TTL.DEFAULT
): Promise<T> {
  // Try to get from cache
  const cached = await get<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Fetch fresh data
  const value = await fetchFn();
  
  // Cache the result
  await set(key, value, ttlSeconds);
  
  return value;
}

/**
 * Invalidate cache for specific entity
 */
export async function invalidateEntity(
  entityType: 'product' | 'flash_sale' | 'user' | 'queue' | 'analytics',
  entityId?: string | number
): Promise<void> {
  let pattern: string;

  if (entityId) {
    pattern = `${entityType}:${entityId}:*`;
    // Also delete the specific entity key
    await del(`${entityType}:${entityId}`);
  } else {
    pattern = `${entityType}:*`;
  }

  await delPattern(pattern);
  logger.debug('Cache invalidated', { entityType, entityId });
}

/**
 * Bulk get multiple keys
 */
export async function mget<T>(keys: string[]): Promise<(T | null)[]> {
  const prefixedKeys = keys.map((k) => withPrefix(k));
  const results: (T | null)[] = new Array(keys.length).fill(null);

  // Check L1 memory cache
  const redisKeys: { index: number; key: string }[] = [];
  for (let i = 0; i < prefixedKeys.length; i++) {
    const memEntry = memoryCache.get(prefixedKeys[i]);
    if (memEntry && memEntry.expiry > Date.now()) {
      results[i] = memEntry.value as T;
      cacheStats.memoryHits++;
      cacheStats.hits++;
    } else {
      redisKeys.push({ index: i, key: prefixedKeys[i] });
    }
  }

  // Fetch remaining from Redis
  if (redisKeys.length > 0) {
    try {
      const redisResults = await redis.mget(...redisKeys.map((k) => k.key));
      for (let i = 0; i < redisKeys.length; i++) {
        const redisValue = redisResults[i];
        if (redisValue) {
          const parsed = JSON.parse(redisValue) as T;
          results[redisKeys[i].index] = parsed;
          
          // Populate L1 cache
          memoryCache.set(redisKeys[i].key, {
            value: parsed,
            expiry: Date.now() + MEMORY_CACHE_DEFAULT_TTL * 1000,
          });
          
          cacheStats.redisHits++;
          cacheStats.hits++;
        } else {
          cacheStats.misses++;
        }
      }
    } catch (error) {
      logger.error('Cache mget error', { error: (error as Error).message });
    }
  }

  return results;
}

/**
 * Bulk set multiple keys
 */
export async function mset(
  entries: { key: string; value: any; ttl?: number }[]
): Promise<void> {
  try {
    const pipeline = redis.pipeline();

    for (const entry of entries) {
      const prefixedKey = withPrefix(entry.key);
      const ttl = entry.ttl || CACHE_TTL.DEFAULT;
      const serialized = JSON.stringify(entry.value);

      pipeline.setex(prefixedKey, ttl, serialized);

      // Also set in L1 memory cache
      const memoryTtl = Math.min(ttl, MEMORY_CACHE_DEFAULT_TTL);
      memoryCache.set(prefixedKey, {
        value: entry.value,
        expiry: Date.now() + memoryTtl * 1000,
      });
    }

    await pipeline.exec();
    cacheStats.sets += entries.length;
    cleanMemoryCache();
  } catch (error) {
    logger.error('Cache mset error', { error: (error as Error).message });
  }
}

/**
 * Check if key exists
 */
export async function exists(key: string): Promise<boolean> {
  const prefixedKey = withPrefix(key);

  // Check L1 first
  const memEntry = memoryCache.get(prefixedKey);
  if (memEntry && memEntry.expiry > Date.now()) {
    return true;
  }

  // Check L2
  try {
    const result = await redis.exists(prefixedKey);
    return result === 1;
  } catch (error) {
    logger.error('Cache exists error', { key, error: (error as Error).message });
    return false;
  }
}

/**
 * Get remaining TTL for a key
 */
export async function ttl(key: string): Promise<number> {
  const prefixedKey = withPrefix(key);

  try {
    return await redis.ttl(prefixedKey);
  } catch (error) {
    logger.error('Cache TTL error', { key, error: (error as Error).message });
    return -1;
  }
}

/**
 * Clear all cache
 */
export async function clearAll(): Promise<void> {
  try {
    // Clear L1
    memoryCache.clear();
    
    // Clear all keys with our prefix
    await delPattern('*');
    
    logger.info('Cache cleared');
  } catch (error) {
    logger.error('Cache clear error', { error: (error as Error).message });
  }
}

export default {
  get,
  set,
  del,
  delPattern,
  getOrSet,
  invalidateEntity,
  mget,
  mset,
  exists,
  ttl,
  clearAll,
  getCacheStats,
  resetCacheStats,
};
