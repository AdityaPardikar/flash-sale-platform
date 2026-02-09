/**
 * Cache Keys Configuration
 * Day 6: Performance Optimization & Caching
 * Centralized cache key definitions with TTL configurations
 */

export const CACHE_KEYS = {
  // Product cache keys
  PRODUCT: {
    SINGLE: (id: string | number) => `product:${id}`,
    LIST: 'products:list',
    BY_CATEGORY: (category: string) => `products:category:${category}`,
    FEATURED: 'products:featured',
  },

  // Flash sale cache keys
  FLASH_SALE: {
    SINGLE: (id: string | number) => `flash_sale:${id}`,
    LIST: 'flash_sales:list',
    ACTIVE: 'flash_sales:active',
    UPCOMING: 'flash_sales:upcoming',
    BY_PRODUCT: (productId: string | number) => `flash_sales:product:${productId}`,
  },

  // User cache keys
  USER: {
    SESSION: (userId: string | number) => `user:session:${userId}`,
    PROFILE: (userId: string | number) => `user:profile:${userId}`,
    PERMISSIONS: (userId: string | number) => `user:permissions:${userId}`,
    RATE_LIMIT: (userId: string | number, endpoint: string) => `rate_limit:${userId}:${endpoint}`,
  },

  // Queue cache keys
  QUEUE: {
    ENTRIES: (saleId: string | number) => `queue:entries:${saleId}`,
    POSITION: (saleId: string | number, userId: string | number) => `queue:position:${saleId}:${userId}`,
    STATS: (saleId: string | number) => `queue:stats:${saleId}`,
    LENGTH: (saleId: string | number) => `queue:length:${saleId}`,
  },

  // Inventory cache keys
  INVENTORY: {
    COUNT: (productId: string | number) => `inventory:count:${productId}`,
    RESERVED: (productId: string | number) => `inventory:reserved:${productId}`,
    AVAILABLE: (productId: string | number) => `inventory:available:${productId}`,
  },

  // Analytics cache keys
  ANALYTICS: {
    DASHBOARD: 'analytics:dashboard',
    SALES: (period: string) => `analytics:sales:${period}`,
    USERS: (period: string) => `analytics:users:${period}`,
    REVENUE: (period: string) => `analytics:revenue:${period}`,
    FUNNEL: (period: string) => `analytics:funnel:${period}`,
  },

  // Admin cache keys
  ADMIN: {
    STATS: 'admin:stats',
    RECENT_ACTIVITY: 'admin:recent_activity',
  },
};

/**
 * TTL configurations in seconds
 */
export const CACHE_TTL = {
  // Short-lived cache (real-time data)
  VERY_SHORT: 10,        // 10 seconds - queue positions
  SHORT: 60,             // 1 minute - active sales
  
  // Medium-lived cache
  MEDIUM: 300,           // 5 minutes - flash sale data
  DEFAULT: 600,          // 10 minutes - default TTL
  
  // Long-lived cache
  LONG: 3600,            // 1 hour - product data, analytics
  VERY_LONG: 86400,      // 24 hours - user sessions
  
  // Specific TTLs
  PRODUCT: 3600,         // 1 hour
  FLASH_SALE: 300,       // 5 minutes
  USER_SESSION: 86400,   // 24 hours
  QUEUE_POSITION: 10,    // 10 seconds
  ANALYTICS: 3600,       // 1 hour
  RATE_LIMIT: 60,        // 1 minute
};

/**
 * Cache key patterns for bulk operations
 */
export const CACHE_PATTERNS = {
  ALL_PRODUCTS: 'product:*',
  ALL_FLASH_SALES: 'flash_sale:*',
  ALL_QUEUES: 'queue:*',
  ALL_ANALYTICS: 'analytics:*',
  ALL_USER_SESSIONS: 'user:session:*',
  ALL_RATE_LIMITS: 'rate_limit:*',
};

/**
 * Helper function to generate cache key with prefix
 */
export function withPrefix(key: string, prefix: string = 'fsp'): string {
  return `${prefix}:${key}`;
}

/**
 * Parse cache key to extract components
 */
export function parseKey(key: string): { type: string; subtype?: string; id?: string } {
  const parts = key.split(':');
  return {
    type: parts[0],
    subtype: parts[1],
    id: parts[2],
  };
}

export default CACHE_KEYS;
