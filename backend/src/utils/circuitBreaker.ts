/**
 * Circuit Breaker
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Implements the Circuit Breaker pattern to prevent cascading failures:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failures exceeded threshold, requests fail fast
 * - HALF-OPEN: Test period, limited requests to probe recovery
 *
 * Features:
 * - Configurable failure thresholds and timeouts
 * - Automatic state transitions
 * - Event callbacks for state changes
 * - Per-service circuit breakers
 * - Health statistics
 */

// ─── Types ────────────────────────────────────────────────────

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerConfig {
  /** Name of the protected service */
  name: string;
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN */
  resetTimeoutMs: number;
  /** Number of successful calls in HALF_OPEN to close the circuit */
  successThreshold: number;
  /** Timeout for individual calls in ms (0 = no timeout) */
  callTimeoutMs: number;
  /** Percentage of requests to allow in HALF_OPEN state (0-100) */
  halfOpenMaxConcurrent: number;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerStats {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  stateChangedAt: Date;
}

// ─── Circuit Breaker Implementation ──────────────────────────

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures: number = 0;
  private successes: number = 0;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private totalRequests: number = 0;
  private lastFailureTime: Date | null = null;
  private lastSuccessTime: Date | null = null;
  private stateChangedAt: Date = new Date();
  private halfOpenConcurrent: number = 0;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly config: Required<CircuitBreakerConfig>;

  constructor(config: CircuitBreakerConfig) {
    this.config = {
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
      callTimeoutMs: 10000,
      halfOpenMaxConcurrent: 1,
      onStateChange: () => {},
      ...config,
    };
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.canExecute()) {
      throw new CircuitBreakerError(
        `Circuit breaker '${this.config.name}' is OPEN — failing fast`,
        this.config.name,
        this.state
      );
    }

    this.totalRequests++;

    if (this.state === CircuitState.HALF_OPEN) {
      this.halfOpenConcurrent++;
    }

    try {
      const result = await this.executeWithTimeout(fn);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenConcurrent--;
      }
    }
  }

  /**
   * Check if circuit allows execution
   */
  private canExecute(): boolean {
    switch (this.state) {
      case CircuitState.CLOSED:
        return true;
      case CircuitState.OPEN:
        // Check if reset timeout has elapsed
        if (Date.now() - this.stateChangedAt.getTime() >= this.config.resetTimeoutMs) {
          this.transitionTo(CircuitState.HALF_OPEN);
          return true;
        }
        return false;
      case CircuitState.HALF_OPEN:
        return this.halfOpenConcurrent < this.config.halfOpenMaxConcurrent;
      default:
        return false;
    }
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (this.config.callTimeoutMs <= 0) {
      return fn();
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Circuit breaker '${this.config.name}' call timed out after ${this.config.callTimeoutMs}ms`));
      }, this.config.callTimeoutMs);

      fn()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.transitionTo(CircuitState.OPEN);
    } else if (this.state === CircuitState.CLOSED) {
      if (this.consecutiveFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    this.stateChangedAt = new Date();

    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      this.consecutiveFailures = 0;
      this.consecutiveSuccesses = 0;
    }
    if (newState === CircuitState.HALF_OPEN) {
      this.consecutiveSuccesses = 0;
      this.halfOpenConcurrent = 0;
    }

    // Clear any existing reset timer
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    // Schedule auto-reset for OPEN state
    if (newState === CircuitState.OPEN) {
      this.resetTimer = setTimeout(() => {
        this.transitionTo(CircuitState.HALF_OPEN);
      }, this.config.resetTimeoutMs);
    }

    console.log(`[CircuitBreaker:${this.config.name}] ${oldState} → ${newState}`);
    this.config.onStateChange?.(oldState, newState);
  }

  /**
   * Force the circuit to a specific state (for admin/testing)
   */
  forceState(state: CircuitState): void {
    this.transitionTo(state);
  }

  /**
   * Get current stats
   */
  getStats(): CircuitBreakerStats {
    return {
      name: this.config.name,
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      stateChangedAt: this.stateChangedAt,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Reset all counters and close the circuit
   */
  reset(): void {
    this.failures = 0;
    this.successes = 0;
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.totalRequests = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;
    this.halfOpenConcurrent = 0;
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.transitionTo(CircuitState.CLOSED);
  }

  /**
   * Cleanup timers
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }
}

// ─── Error Class ──────────────────────────────────────────────

export class CircuitBreakerError extends Error {
  public readonly circuitName: string;
  public readonly circuitState: CircuitState;

  constructor(message: string, circuitName: string, state: CircuitState) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.circuitName = circuitName;
    this.circuitState = state;
  }
}

// ─── Circuit Breaker Registry ─────────────────────────────────

class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker for a service
   */
  getBreaker(config: CircuitBreakerConfig): CircuitBreaker {
    let breaker = this.breakers.get(config.name);
    if (!breaker) {
      breaker = new CircuitBreaker(config);
      this.breakers.set(config.name, breaker);
    }
    return breaker;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map(b => b.getStats());
  }

  /**
   * Get a specific breaker by name
   */
  get(name: string): CircuitBreaker | undefined {
    return this.breakers.get(name);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.breakers.forEach(b => b.reset());
  }

  /**
   * Destroy all circuit breakers
   */
  destroyAll(): void {
    this.breakers.forEach(b => b.destroy());
    this.breakers.clear();
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();
