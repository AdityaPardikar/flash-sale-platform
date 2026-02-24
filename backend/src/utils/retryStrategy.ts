/**
 * Retry Strategy
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Exponential backoff with jitter for resilient request retrying:
 * - Configurable max retries and base delay
 * - Full jitter for thundering herd prevention
 * - Idempotency key support
 * - Retryable error classification
 * - Detailed retry logging
 */

// ─── Types ────────────────────────────────────────────────────

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in ms before first retry */
  baseDelayMs: number;
  /** Maximum delay cap in ms */
  maxDelayMs: number;
  /** Jitter strategy */
  jitter: 'full' | 'equal' | 'none';
  /** Factor to multiply delay by each retry */
  backoffMultiplier: number;
  /** Function to determine if error is retryable */
  isRetryable?: (error: Error, attempt: number) => boolean;
  /** Callback on each retry attempt */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalDelayMs: number;
}

export interface IdempotencyRecord {
  key: string;
  result: unknown;
  expiresAt: number;
  createdAt: Date;
}

// ─── Default Retry Config ─────────────────────────────────────

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitter: 'full',
  backoffMultiplier: 2,
};

// ─── Retry Strategy ───────────────────────────────────────────

export class RetryStrategy {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(fn: () => Promise<T>, operationName: string = 'operation'): Promise<RetryResult<T>> {
    let lastError: Error | null = null;
    let totalDelayMs = 0;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const result = await fn();
        return {
          result,
          attempts: attempt + 1,
          totalDelayMs,
        };
      } catch (error: any) {
        lastError = error;

        // Check if we should retry
        if (attempt >= this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (this.config.isRetryable && !this.config.isRetryable(error, attempt)) {
          break;
        }

        // Default retryable check
        if (!this.config.isRetryable && !this.isDefaultRetryable(error)) {
          break;
        }

        // Calculate delay
        const delay = this.calculateDelay(attempt);
        totalDelayMs += delay;

        // Log retry
        console.warn(
          `[RetryStrategy] ${operationName} failed (attempt ${attempt + 1}/${this.config.maxRetries + 1}), ` +
          `retrying in ${delay}ms: ${error.message}`
        );

        // Callback
        this.config.onRetry?.(error, attempt + 1, delay);

        // Wait
        await this.sleep(delay);
      }
    }

    throw lastError || new Error(`${operationName} failed after ${this.config.maxRetries + 1} attempts`);
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);

    switch (this.config.jitter) {
      case 'full':
        // Full jitter: random between 0 and cappedDelay
        return Math.random() * cappedDelay;
      case 'equal':
        // Equal jitter: half base + random half
        return cappedDelay / 2 + Math.random() * (cappedDelay / 2);
      case 'none':
        return cappedDelay;
      default:
        return cappedDelay;
    }
  }

  /**
   * Default retryable error classification
   */
  private isDefaultRetryable(error: any): boolean {
    // Network errors
    if (error.code && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(error.code)) {
      return true;
    }

    // HTTP status-based
    if (error.statusCode || error.status) {
      const status = error.statusCode || error.status;
      // Retry on 429 (Too Many Requests) and 5xx errors
      return status === 429 || (status >= 500 && status < 600);
    }

    // Database errors  
    if (error.message?.includes('deadlock') || error.message?.includes('lock timeout')) {
      return true;
    }

    // Redis errors
    if (error.message?.includes('BUSY') || error.message?.includes('LOADING')) {
      return true;
    }

    return false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ─── Idempotency Manager ─────────────────────────────────────

export class IdempotencyManager {
  private records: Map<string, IdempotencyRecord> = new Map();
  private defaultTtlMs: number;
  private maxSize: number;

  constructor(defaultTtlMs: number = 86400000, maxSize: number = 10000) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxSize = maxSize;
  }

  /**
   * Execute an operation with idempotency guarantee
   */
  async executeIdempotent<T>(
    idempotencyKey: string,
    fn: () => Promise<T>,
    ttlMs?: number
  ): Promise<{ result: T; fromCache: boolean }> {
    // Check for existing record
    const existing = this.records.get(idempotencyKey);
    if (existing && Date.now() < existing.expiresAt) {
      return { result: existing.result as T, fromCache: true };
    }

    // Execute
    const result = await fn();

    // Store result
    this.store(idempotencyKey, result, ttlMs);

    return { result, fromCache: false };
  }

  /**
   * Generate an idempotency key from components
   */
  static generateKey(...parts: (string | number)[]): string {
    return parts.join(':');
  }

  /**
   * Store a result
   */
  private store(key: string, result: unknown, ttlMs?: number): void {
    // Evict expired entries if at capacity
    if (this.records.size >= this.maxSize) {
      this.evictExpired();
    }
    if (this.records.size >= this.maxSize) {
      // Remove oldest
      const firstKey = this.records.keys().next().value;
      if (firstKey !== undefined) {
        this.records.delete(firstKey);
      }
    }

    this.records.set(key, {
      key,
      result,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
      createdAt: new Date(),
    });
  }

  /**
   * Check if a key exists and is valid
   */
  has(key: string): boolean {
    const record = this.records.get(key);
    return !!record && Date.now() < record.expiresAt;
  }

  /**
   * Remove a key
   */
  remove(key: string): boolean {
    return this.records.delete(key);
  }

  /**
   * Clear all records
   */
  clear(): void {
    this.records.clear();
  }

  /**
   * Get stats
   */
  getStats(): { size: number; maxSize: number } {
    return { size: this.records.size, maxSize: this.maxSize };
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (now > record.expiresAt) {
        this.records.delete(key);
      }
    }
  }
}

// ─── Convenience Helpers ──────────────────────────────────────

/**
 * Retry a function with default settings
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<T> {
  const strategy = new RetryStrategy(config);
  const result = await strategy.execute(fn);
  return result.result;
}

/**
 * Create a pre-configured retry strategy for database operations
 */
export const dbRetry = new RetryStrategy({
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
  jitter: 'full',
  isRetryable: (error: any) => {
    return error.code === '40P01' || // deadlock
           error.code === '57P01' || // admin_shutdown
           error.code === '57P03' || // cannot_connect_now
           error.message?.includes('connection') ||
           error.message?.includes('timeout');
  },
});

/**
 * Create a pre-configured retry strategy for Redis operations
 */
export const redisRetry = new RetryStrategy({
  maxRetries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: 'full',
  isRetryable: (error: any) => {
    return error.message?.includes('BUSY') ||
           error.message?.includes('LOADING') ||
           error.message?.includes('CLUSTERDOWN') ||
           error.code === 'ECONNREFUSED';
  },
});

export const idempotencyManager = new IdempotencyManager();
