/**
 * Performance Profiler
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Node.js performance profiling utilities including:
 * - API endpoint benchmarking
 * - Slow query detection and logging
 * - Event loop lag monitoring
 * - Memory usage tracking and leak detection
 * - Request timing middleware
 */

import { Request, Response, NextFunction } from 'express';

// ─── Interfaces ───────────────────────────────────────────────

interface ProfileEntry {
  operation: string;
  durationMs: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface MemorySnapshot {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  timestamp: Date;
}

interface SlowOperation {
  operation: string;
  durationMs: number;
  threshold: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

interface PerformanceReport {
  uptime: number;
  memorySnapshots: MemorySnapshot[];
  slowOperations: SlowOperation[];
  endpointStats: Map<string, EndpointStats>;
  eventLoopLag: number[];
  avgEventLoopLag: number;
}

interface EndpointStats {
  path: string;
  method: string;
  count: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
  errorCount: number;
  durations: number[];
}

// ─── Performance Profiler ─────────────────────────────────────

class PerformanceProfiler {
  private profiles: ProfileEntry[] = [];
  private slowOps: SlowOperation[] = [];
  private memorySnapshots: MemorySnapshot[] = [];
  private endpointStats: Map<string, EndpointStats> = new Map();
  private eventLoopLags: number[] = [];
  private lagInterval: ReturnType<typeof setInterval> | null = null;
  private memoryInterval: ReturnType<typeof setInterval> | null = null;

  private readonly maxProfiles = 10000;
  private readonly maxSlowOps = 500;
  private readonly maxMemorySnapshots = 1440; // 24h at 1min intervals
  private readonly maxEventLoopLags = 3600;
  private readonly slowQueryThreshold = 100; // ms

  /**
   * Start monitoring event loop lag and memory
   */
  start(): void {
    // Event loop lag monitoring
    this.lagInterval = setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.eventLoopLags.push(lag);
        if (this.eventLoopLags.length > this.maxEventLoopLags) {
          this.eventLoopLags.shift();
        }
        if (lag > 100) {
          console.warn(`[PERF] High event loop lag: ${lag}ms`);
        }
      });
    }, 1000);

    // Memory monitoring (every minute)
    this.memoryInterval = setInterval(() => {
      this.captureMemorySnapshot();
    }, 60000);

    // Initial snapshot
    this.captureMemorySnapshot();
    console.log('[PerformanceProfiler] Started monitoring');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.lagInterval) clearInterval(this.lagInterval);
    if (this.memoryInterval) clearInterval(this.memoryInterval);
    this.lagInterval = null;
    this.memoryInterval = null;
    console.log('[PerformanceProfiler] Stopped monitoring');
  }

  /**
   * Capture current memory usage
   */
  private captureMemorySnapshot(): void {
    const mem = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      timestamp: new Date(),
    };
    this.memorySnapshots.push(snapshot);
    if (this.memorySnapshots.length > this.maxMemorySnapshots) {
      this.memorySnapshots.shift();
    }

    // Detect potential memory leak (heap growing continuously)
    if (this.memorySnapshots.length >= 10) {
      const recent = this.memorySnapshots.slice(-10);
      const allIncreasing = recent.every((s, i) => i === 0 || s.heapUsed > recent[i - 1].heapUsed);
      if (allIncreasing) {
        const growthMB = (recent[recent.length - 1].heapUsed - recent[0].heapUsed) / (1024 * 1024);
        if (growthMB > 50) {
          console.warn(
            `[PERF] Potential memory leak detected: heap grew ${growthMB.toFixed(1)}MB over last 10 snapshots`
          );
        }
      }
    }
  }

  /**
   * Profile an async operation
   */
  async profile<T>(
    operation: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const durationMs = performance.now() - start;
      this.recordProfile(operation, durationMs, metadata);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.recordProfile(operation, durationMs, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Profile a synchronous operation
   */
  profileSync<T>(operation: string, fn: () => T, metadata?: Record<string, unknown>): T {
    const start = performance.now();
    try {
      const result = fn();
      const durationMs = performance.now() - start;
      this.recordProfile(operation, durationMs, metadata);
      return result;
    } catch (error) {
      const durationMs = performance.now() - start;
      this.recordProfile(operation, durationMs, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Record a profiled operation
   */
  private recordProfile(
    operation: string,
    durationMs: number,
    metadata?: Record<string, unknown>
  ): void {
    const entry: ProfileEntry = {
      operation,
      durationMs,
      timestamp: new Date(),
      metadata,
    };

    this.profiles.push(entry);
    if (this.profiles.length > this.maxProfiles) {
      this.profiles.shift();
    }

    // Track slow operations
    if (durationMs > this.slowQueryThreshold) {
      const slow: SlowOperation = {
        operation,
        durationMs,
        threshold: this.slowQueryThreshold,
        timestamp: new Date(),
        metadata,
      };
      this.slowOps.push(slow);
      if (this.slowOps.length > this.maxSlowOps) {
        this.slowOps.shift();
      }
      console.warn(`[PERF] Slow operation: ${operation} took ${durationMs.toFixed(1)}ms`);
    }
  }

  /**
   * Record endpoint timing
   */
  recordEndpoint(method: string, path: string, durationMs: number, isError: boolean = false): void {
    const key = `${method} ${path}`;
    let stats = this.endpointStats.get(key);

    if (!stats) {
      stats = {
        path,
        method,
        count: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        p95Duration: 0,
        p99Duration: 0,
        errorCount: 0,
        durations: [],
      };
      this.endpointStats.set(key, stats);
    }

    stats.count += 1;
    stats.totalDuration += durationMs;
    stats.avgDuration = stats.totalDuration / stats.count;
    stats.minDuration = Math.min(stats.minDuration, durationMs);
    stats.maxDuration = Math.max(stats.maxDuration, durationMs);
    if (isError) stats.errorCount += 1;

    stats.durations.push(durationMs);
    // Keep last 1000 durations for percentile calculation
    if (stats.durations.length > 1000) {
      stats.durations.shift();
    }

    // Recalculate percentiles
    const sorted = [...stats.durations].sort((a, b) => a - b);
    stats.p95Duration = sorted[Math.floor(sorted.length * 0.95)] || 0;
    stats.p99Duration = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  /**
   * Express middleware for automatic endpoint profiling
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction): void => {
      const start = performance.now();

      // Override res.end to capture timing
      const originalEnd = res.end.bind(res);
      res.end = ((...args: any[]) => {
        const durationMs = performance.now() - start;
        const normalizedPath = this.normalizePath(req.route?.path || req.path);
        const isError = res.statusCode >= 400;
        this.recordEndpoint(req.method, normalizedPath, durationMs, isError);

        // Add timing header
        res.setHeader('X-Response-Time', `${durationMs.toFixed(2)}ms`);
        return originalEnd(...args);
      }) as any;

      next();
    };
  }

  /**
   * Normalize path to group similar endpoints
   */
  private normalizePath(path: string): string {
    // Replace UUIDs and numeric IDs with :id
    return path
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
      .replace(/\/\d+/g, '/:id');
  }

  /**
   * Get performance report
   */
  getReport(): PerformanceReport {
    const avgLag =
      this.eventLoopLags.length > 0
        ? this.eventLoopLags.reduce((a, b) => a + b, 0) / this.eventLoopLags.length
        : 0;

    return {
      uptime: process.uptime(),
      memorySnapshots: this.memorySnapshots.slice(-60),
      slowOperations: this.slowOps.slice(-50),
      endpointStats: this.endpointStats,
      eventLoopLag: this.eventLoopLags.slice(-60),
      avgEventLoopLag: avgLag,
    };
  }

  /**
   * Get endpoint stats as serializable array
   */
  getEndpointStatsArray(): Array<Omit<EndpointStats, 'durations'>> {
    return Array.from(this.endpointStats.values())
      .map(({ durations, ...rest }) => rest)
      .sort((a, b) => b.avgDuration - a.avgDuration);
  }

  /**
   * Get current memory usage in human-readable format
   */
  getMemoryUsage(): Record<string, string> {
    const mem = process.memoryUsage();
    const format = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
    return {
      rss: format(mem.rss),
      heapTotal: format(mem.heapTotal),
      heapUsed: format(mem.heapUsed),
      external: format(mem.external),
      arrayBuffers: format(mem.arrayBuffers),
    };
  }

  /**
   * Reset all collected data
   */
  reset(): void {
    this.profiles = [];
    this.slowOps = [];
    this.endpointStats.clear();
    this.eventLoopLags = [];
    console.log('[PerformanceProfiler] Data reset');
  }
}

export const performanceProfiler = new PerformanceProfiler();
export { PerformanceProfiler };
export type { ProfileEntry, MemorySnapshot, SlowOperation, EndpointStats, PerformanceReport };
