/**
 * Circuit Breaker Unit Tests
 * Week 6 Day 7: Testing, Documentation & Week Review
 */

import {
  CircuitBreaker,
  CircuitState,
  CircuitBreakerError,
  circuitBreakerRegistry,
} from '../utils/circuitBreaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      resetTimeoutMs: 1000,
      successThreshold: 2,
      callTimeoutMs: 5000,
      halfOpenMaxConcurrent: 1,
    });
  });

  afterEach(() => {
    breaker.destroy();
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should report zero stats', () => {
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('CLOSED State', () => {
    it('should allow successful calls', async () => {
      const result = await breaker.execute(async () => 'success');
      expect(result).toBe('success');
      expect(breaker.getStats().successes).toBe(1);
    });

    it('should track failures without opening', async () => {
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(breaker.getStats().consecutiveFailures).toBe(2);
    });

    it('should open after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reset failure count on success', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        /* expected */
      }

      await breaker.execute(async () => 'ok');
      expect(breaker.getStats().consecutiveFailures).toBe(0);
    });
  });

  describe('OPEN State', () => {
    beforeEach(async () => {
      // Trigger open state
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
    });

    it('should reject calls immediately', async () => {
      try {
        await breaker.execute(async () => 'should-not-reach');
        fail('Expected CircuitBreakerError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerError);
        expect((error as CircuitBreakerError).circuitState).toBe(CircuitState.OPEN);
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1100));
      // Next call should be allowed (HALF_OPEN)
      const result = await breaker.execute(async () => 'recovered');
      expect(result).toBe('recovered');
    });
  });

  describe('HALF_OPEN State', () => {
    beforeEach(async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }
      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    it('should close after reaching success threshold', async () => {
      await breaker.execute(async () => 'ok1');
      await breaker.execute(async () => 'ok2');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should re-open on failure', async () => {
      try {
        await breaker.execute(async () => {
          throw new Error('fail');
        });
      } catch {
        /* expected */
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });
  });

  describe('Call Timeout', () => {
    it('should timeout slow calls', async () => {
      const fastBreaker = new CircuitBreaker({
        name: 'timeout-test',
        failureThreshold: 3,
        resetTimeoutMs: 1000,
        successThreshold: 2,
        callTimeoutMs: 100,
        halfOpenMaxConcurrent: 1,
      });

      try {
        await fastBreaker.execute(async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return 'too-slow';
        });
        fail('Expected timeout');
      } catch (error: any) {
        expect(error.message).toContain('timed out');
      } finally {
        fastBreaker.destroy();
      }
    });
  });

  describe('forceState', () => {
    it('should allow manual state transitions', () => {
      breaker.forceState(CircuitState.OPEN);
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.forceState(CircuitState.CLOSED);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('reset', () => {
    it('should clear all stats and close circuit', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('fail');
          });
        } catch {
          /* expected */
        }
      }

      breaker.reset();
      const stats = breaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failures).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  afterEach(() => {
    circuitBreakerRegistry.destroyAll();
  });

  it('should create and return circuit breakers', () => {
    const breaker = circuitBreakerRegistry.getBreaker({
      name: 'registry-test',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
      callTimeoutMs: 10000,
      halfOpenMaxConcurrent: 1,
    });

    expect(breaker.getState()).toBe(CircuitState.CLOSED);
  });

  it('should return same breaker for same name', () => {
    const config = {
      name: 'same-name',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
      callTimeoutMs: 10000,
      halfOpenMaxConcurrent: 1,
    };

    const b1 = circuitBreakerRegistry.getBreaker(config);
    const b2 = circuitBreakerRegistry.getBreaker(config);
    expect(b1).toBe(b2);
  });

  it('should report all stats', () => {
    circuitBreakerRegistry.getBreaker({
      name: 'svc-a',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
      callTimeoutMs: 10000,
      halfOpenMaxConcurrent: 1,
    });
    circuitBreakerRegistry.getBreaker({
      name: 'svc-b',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      successThreshold: 3,
      callTimeoutMs: 10000,
      halfOpenMaxConcurrent: 1,
    });

    const stats = circuitBreakerRegistry.getAllStats();
    expect(stats.length).toBe(2);
    expect(stats.map((s) => s.name).sort()).toEqual(['svc-a', 'svc-b']);
  });
});
