/**
 * Response Compression Middleware
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Implements response compression with:
 * - Gzip compression for text-based responses
 * - Minimum size threshold to avoid compressing tiny responses
 * - Content-type based filtering
 * - ETag generation for cache validation
 * - Conditional request support (304 Not Modified)
 */

import { Request, Response, NextFunction } from 'express';
import * as zlib from 'zlib';
import * as crypto from 'crypto';

// ─── Configuration ────────────────────────────────────────────

interface CompressionConfig {
  /** Minimum response size in bytes to compress (default: 1024) */
  threshold: number;
  /** Compression level 1-9 (default: 6) */
  level: number;
  /** Content types to compress */
  compressibleTypes: RegExp;
  /** Enable ETag generation */
  enableEtag: boolean;
}

const defaultConfig: CompressionConfig = {
  threshold: 1024,
  level: 6,
  compressibleTypes:
    /^(text\/|application\/json|application\/javascript|application\/xml|image\/svg\+xml)/,
  enableEtag: true,
};

// ─── ETag Generator ───────────────────────────────────────────

function generateETag(body: Buffer | string): string {
  const hash = crypto.createHash('md5').update(body).digest('hex');
  return `"${hash}"`;
}

// ─── Compression Middleware ───────────────────────────────────

export function compressionMiddleware(config: Partial<CompressionConfig> = {}) {
  const cfg = { ...defaultConfig, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip for HEAD requests
    if (req.method === 'HEAD') {
      next();
      return;
    }

    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    const chunks: Buffer[] = [];

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const supportsGzip = acceptEncoding.includes('gzip');

    // Override write to collect chunks
    res.write = function (chunk: any, ...args: any[]): boolean {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return true;
    } as any;

    // Override end to handle compression
    res.end = function (chunk?: any, ...args: any[]): Response {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      const body = Buffer.concat(chunks);
      const contentType = (res.getHeader('content-type') as string) || '';
      const isCompressible = cfg.compressibleTypes.test(contentType);
      const isLargeEnough = body.length >= cfg.threshold;

      // Generate ETag if enabled
      if (cfg.enableEtag && body.length > 0) {
        const etag = generateETag(body);
        res.setHeader('ETag', etag);

        // Check conditional request (If-None-Match)
        const ifNoneMatch = req.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          res.statusCode = 304;
          res.removeHeader('Content-Length');
          res.removeHeader('Content-Type');
          originalEnd();
          return res;
        }
      }

      // Compress if applicable
      if (supportsGzip && isCompressible && isLargeEnough) {
        zlib.gzip(body, { level: cfg.level }, (err, compressed) => {
          if (err) {
            // Fall back to uncompressed
            res.setHeader('Content-Length', body.length);
            originalWrite(body);
            originalEnd();
            return;
          }

          res.setHeader('Content-Encoding', 'gzip');
          res.setHeader('Content-Length', compressed.length);
          res.removeHeader('Transfer-Encoding');
          // Indicate the response varies based on Accept-Encoding
          const existingVary = (res.getHeader('Vary') as string) || '';
          if (!existingVary.includes('Accept-Encoding')) {
            res.setHeader(
              'Vary',
              existingVary ? `${existingVary}, Accept-Encoding` : 'Accept-Encoding'
            );
          }
          originalWrite(compressed);
          originalEnd();
        });
      } else {
        // Send uncompressed
        if (body.length > 0) {
          res.setHeader('Content-Length', body.length);
          originalWrite(body);
        }
        originalEnd();
      }

      return res;
    } as any;

    next();
  };
}

// ─── Cache Control Middleware ─────────────────────────────────

interface CacheControlConfig {
  /** Default max-age for static assets in seconds */
  staticMaxAge: number;
  /** Default max-age for API responses in seconds */
  apiMaxAge: number;
  /** Paths to apply long-term caching */
  immutablePaths: RegExp[];
  /** Paths that should never be cached */
  noCachePaths: RegExp[];
}

const defaultCacheConfig: CacheControlConfig = {
  staticMaxAge: 86400, // 1 day
  apiMaxAge: 60, // 1 minute
  immutablePaths: [/\.(js|css|woff2?|ttf|eot)$/],
  noCachePaths: [/\/api\/v1\/(auth|checkout|cart)/],
};

export function cacheControlMiddleware(config: Partial<CacheControlConfig> = {}) {
  const cfg = { ...defaultCacheConfig, ...config };

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip for non-GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    const path = req.path;

    // No-cache paths
    if (cfg.noCachePaths.some((p) => p.test(path))) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      next();
      return;
    }

    // Immutable static assets
    if (cfg.immutablePaths.some((p) => p.test(path))) {
      res.setHeader('Cache-Control', `public, max-age=${cfg.staticMaxAge}, immutable`);
      next();
      return;
    }

    // Default API caching
    if (path.startsWith('/api/')) {
      res.setHeader(
        'Cache-Control',
        `public, max-age=${cfg.apiMaxAge}, stale-while-revalidate=${cfg.apiMaxAge * 2}`
      );
    }

    next();
  };
}

// ─── Multi-Tier Cache ─────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  hits: number;
}

export class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private maxSize: number;
  private defaultTtlMs: number;
  private hits: number = 0;
  private misses: number = 0;

  constructor(maxSize: number = 1000, defaultTtlMs: number = 60000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    entry.hits++;
    this.hits++;
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs?: number): void {
    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      hits: 0,
    });
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): { size: number; maxSize: number; hits: number; misses: number; hitRate: string } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? `${((this.hits / total) * 100).toFixed(1)}%` : '0%',
    };
  }

  private evictLRU(): void {
    let minHits = Infinity;
    let evictKey: string | null = null;

    for (const [key, entry] of this.cache) {
      // Evict expired first
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(key);
        return;
      }
      if (entry.hits < minHits) {
        minHits = entry.hits;
        evictKey = key;
      }
    }

    if (evictKey) {
      this.cache.delete(evictKey);
    }
  }
}

export const appCache = new MemoryCache(2000, 120000);
