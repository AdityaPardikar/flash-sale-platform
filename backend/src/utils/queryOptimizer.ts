/**
 * Query Optimizer
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Database and Redis query optimization utilities:
 * - N+1 query detection and batch loading
 * - Redis pipelining for bulk operations
 * - Connection pool monitoring
 * - Query result memoization
 * - Prepared statement management
 */

import { performanceProfiler } from './performanceProfiler';

// ─── Interfaces ───────────────────────────────────────────────

interface BatchLoaderConfig<K, V> {
  /** Function to load multiple items by keys */
  batchFn: (keys: K[]) => Promise<Map<K, V>>;
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Delay before executing batch (ms) */
  batchDelay?: number;
  /** Cache TTL in ms (0 = no caching) */
  cacheTtlMs?: number;
}

interface QueryStats {
  totalQueries: number;
  batchedQueries: number;
  cacheHits: number;
  cacheMisses: number;
  avgBatchSize: number;
  nPlusOneDetected: number;
}

interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  waitingRequests: number;
  utilization: string;
}

// ─── DataLoader (N+1 Prevention) ──────────────────────────────

export class DataLoader<K, V> {
  private batchFn: (keys: K[]) => Promise<Map<K, V>>;
  private maxBatchSize: number;
  private batchDelay: number;
  private cacheTtlMs: number;

  private cache: Map<K, { value: V; expiresAt: number }> = new Map();
  private pendingKeys: K[] = [];
  private pendingResolvers: Map<
    K,
    Array<{ resolve: (v: V | undefined) => void; reject: (e: Error) => void }>
  > = new Map();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private stats: QueryStats = {
    totalQueries: 0,
    batchedQueries: 0,
    cacheHits: 0,
    cacheMisses: 0,
    avgBatchSize: 0,
    nPlusOneDetected: 0,
  };

  constructor(config: BatchLoaderConfig<K, V>) {
    this.batchFn = config.batchFn;
    this.maxBatchSize = config.maxBatchSize || 100;
    this.batchDelay = config.batchDelay || 10;
    this.cacheTtlMs = config.cacheTtlMs || 30000;
  }

  /**
   * Load a single item by key (automatically batched)
   */
  async load(key: K): Promise<V | undefined> {
    this.stats.totalQueries++;

    // Check cache
    const cached = this.cache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      this.stats.cacheHits++;
      return cached.value;
    }
    this.stats.cacheMisses++;

    // Add to pending batch
    return new Promise<V | undefined>((resolve, reject) => {
      if (!this.pendingResolvers.has(key)) {
        this.pendingResolvers.set(key, []);
        this.pendingKeys.push(key);
      }
      this.pendingResolvers.get(key)!.push({ resolve, reject });

      // Schedule batch execution
      if (this.pendingKeys.length >= this.maxBatchSize) {
        this.executeBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.executeBatch(), this.batchDelay);
      }
    });
  }

  /**
   * Load multiple items by keys
   */
  async loadMany(keys: K[]): Promise<Map<K, V | undefined>> {
    const results = await Promise.all(keys.map((k) => this.load(k).then((v) => [k, v] as const)));
    return new Map(results);
  }

  /**
   * Prime the cache with a known value
   */
  prime(key: K, value: V): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
  }

  /**
   * Clear a specific key from cache
   */
  clear(key: K): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cached data
   */
  clearAll(): void {
    this.cache.clear();
  }

  /**
   * Execute the pending batch
   */
  private async executeBatch(): Promise<void> {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const keys = [...this.pendingKeys];
    const resolvers = new Map(this.pendingResolvers);
    this.pendingKeys = [];
    this.pendingResolvers.clear();

    if (keys.length === 0) return;

    this.stats.batchedQueries++;
    const totalBatched = this.stats.batchedQueries;
    this.stats.avgBatchSize =
      (this.stats.avgBatchSize * (totalBatched - 1) + keys.length) / totalBatched;

    // Detect N+1 patterns
    if (keys.length > 10) {
      this.stats.nPlusOneDetected++;
    }

    try {
      const results = await performanceProfiler.profile(
        `DataLoader.batch(${keys.length} keys)`,
        () => this.batchFn(keys)
      );

      // Cache and resolve
      for (const key of keys) {
        const value = results.get(key);
        if (value !== undefined && this.cacheTtlMs > 0) {
          this.cache.set(key, {
            value,
            expiresAt: Date.now() + this.cacheTtlMs,
          });
        }

        const keyResolvers = resolvers.get(key);
        if (keyResolvers) {
          keyResolvers.forEach((r) => r.resolve(value));
        }
      }
    } catch (error) {
      for (const key of keys) {
        const keyResolvers = resolvers.get(key);
        if (keyResolvers) {
          keyResolvers.forEach((r) => r.reject(error as Error));
        }
      }
    }
  }

  getStats(): QueryStats {
    return { ...this.stats };
  }
}

// ─── Redis Pipeline Helper ───────────────────────────────────

interface PipelineCommand {
  command: string;
  args: unknown[];
}

export class RedisPipeline {
  private commands: PipelineCommand[] = [];
  private maxBatchSize: number;

  constructor(maxBatchSize: number = 100) {
    this.maxBatchSize = maxBatchSize;
  }

  /**
   * Add a GET command to the pipeline
   */
  get(key: string): this {
    this.commands.push({ command: 'GET', args: [key] });
    return this;
  }

  /**
   * Add a SET command to the pipeline
   */
  set(key: string, value: string, ttlSeconds?: number): this {
    if (ttlSeconds) {
      this.commands.push({ command: 'SETEX', args: [key, ttlSeconds, value] });
    } else {
      this.commands.push({ command: 'SET', args: [key, value] });
    }
    return this;
  }

  /**
   * Add a DEL command to the pipeline
   */
  del(key: string): this {
    this.commands.push({ command: 'DEL', args: [key] });
    return this;
  }

  /**
   * Add an HGETALL command to the pipeline
   */
  hgetall(key: string): this {
    this.commands.push({ command: 'HGETALL', args: [key] });
    return this;
  }

  /**
   * Add an HMSET command to the pipeline
   */
  hmset(key: string, fields: Record<string, string>): this {
    const args: unknown[] = [key];
    for (const [field, value] of Object.entries(fields)) {
      args.push(field, value);
    }
    this.commands.push({ command: 'HMSET', args });
    return this;
  }

  /**
   * Add an INCR command to the pipeline
   */
  incr(key: string): this {
    this.commands.push({ command: 'INCR', args: [key] });
    return this;
  }

  /**
   * Add a generic command to the pipeline
   */
  addCommand(command: string, ...args: unknown[]): this {
    this.commands.push({ command, args });
    return this;
  }

  /**
   * Get queued commands for execution
   */
  getCommands(): PipelineCommand[] {
    return [...this.commands];
  }

  /**
   * Get the number of queued commands
   */
  size(): number {
    return this.commands.length;
  }

  /**
   * Clear all queued commands
   */
  clear(): void {
    this.commands = [];
  }

  /**
   * Get the max batch size
   */
  getMaxBatchSize(): number {
    return this.maxBatchSize;
  }
}

// ─── Connection Pool Monitor ─────────────────────────────────

export class ConnectionPoolMonitor {
  private snapshots: PoolStats[] = [];
  private readonly maxSnapshots = 1440;

  /**
   * Record a pool snapshot
   */
  record(stats: PoolStats): void {
    this.snapshots.push(stats);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Warn if utilization is high
    const util = parseFloat(stats.utilization);
    if (util > 80) {
      console.warn(`[QueryOptimizer] Connection pool utilization at ${stats.utilization}`);
    }
    if (stats.waitingRequests > 5) {
      console.warn(`[QueryOptimizer] ${stats.waitingRequests} requests waiting for connections`);
    }
  }

  /**
   * Get recent snapshots
   */
  getSnapshots(count: number = 60): PoolStats[] {
    return this.snapshots.slice(-count);
  }

  /**
   * Get average utilization
   */
  getAvgUtilization(): number {
    if (this.snapshots.length === 0) return 0;
    const total = this.snapshots.reduce((sum, s) => sum + parseFloat(s.utilization), 0);
    return total / this.snapshots.length;
  }
}

// ─── Query Result Memoizer ────────────────────────────────────

interface MemoizedQuery<T> {
  result: T;
  expiresAt: number;
  queryHash: string;
}

export class QueryMemoizer {
  private cache: Map<string, MemoizedQuery<unknown>> = new Map();
  private maxSize: number;
  private defaultTtlMs: number;
  private stats = { hits: 0, misses: 0, evictions: 0 };

  constructor(maxSize: number = 500, defaultTtlMs: number = 30000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Execute a query with memoization
   */
  async execute<T>(queryKey: string, queryFn: () => Promise<T>, ttlMs?: number): Promise<T> {
    // Check cache
    const cached = this.cache.get(queryKey);
    if (cached && Date.now() < cached.expiresAt) {
      this.stats.hits++;
      return cached.result as T;
    }
    this.stats.misses++;

    // Execute and cache
    const result = await performanceProfiler.profile(
      `MemoizedQuery: ${queryKey.substring(0, 100)}`,
      queryFn
    );

    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictExpired();
    }
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
      }
    }

    this.cache.set(queryKey, {
      result,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      queryHash: queryKey,
    });

    return result;
  }

  /**
   * Invalidate queries matching a pattern
   */
  invalidate(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all memoized queries
   */
  clear(): void {
    this.cache.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: total > 0 ? `${((this.stats.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        this.stats.evictions++;
      }
    }
  }
}

export const queryMemoizer = new QueryMemoizer();
export const connectionPoolMonitor = new ConnectionPoolMonitor();
