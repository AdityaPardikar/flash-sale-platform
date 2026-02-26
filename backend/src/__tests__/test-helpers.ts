/**
 * Week 7 Day 3 — Test Helpers & Factories
 *
 * Shared utilities for building mock data, creating typed request/response
 * objects, and providing reusable assertion helpers across test suites.
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// ─── Constants ───────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';

// ─── Token Helpers ───────────────────────────────────────────────────────────

/**
 * Generate a valid JWT for testing protected routes.
 */
export function generateTestToken(
  overrides: Partial<{ userId: string; email: string }> = {},
): string {
  return jwt.sign(
    {
      userId: overrides.userId ?? 'test-user-id-001',
      email: overrides.email ?? 'testuser@example.com',
    },
    JWT_SECRET,
    { expiresIn: '1h' },
  );
}

/**
 * Generate an expired JWT for testing token-rejection flows.
 */
export function generateExpiredToken(): string {
  return jwt.sign({ userId: 'expired-user', email: 'expired@example.com' }, JWT_SECRET, {
    expiresIn: '-1s',
  });
}

/**
 * Return an Authorization header value (`Bearer <token>`).
 */
export function authHeader(token?: string): string {
  return `Bearer ${token ?? generateTestToken()}`;
}

// ─── Data Factories ──────────────────────────────────────────────────────────

let _seq = 0;
function seq(): number {
  return ++_seq;
}

export function buildUser(overrides: Record<string, unknown> = {}) {
  const n = seq();
  return {
    id: `user-${n}`,
    email: `user${n}@example.com`,
    username: `user${n}`,
    password_hash: '$2b$10$hashedpassword',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildProduct(overrides: Record<string, unknown> = {}) {
  const n = seq();
  return {
    id: `product-${n}`,
    name: `Test Product ${n}`,
    description: `Description for test product ${n}`,
    base_price: (19.99 + n).toFixed(2),
    category: 'electronics',
    image_url: `https://img.example.com/product-${n}.jpg`,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildFlashSale(overrides: Record<string, unknown> = {}) {
  const n = seq();
  const start = new Date(Date.now() + 60_000 * n);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    id: `sale-${n}`,
    product_id: `product-${n}`,
    flash_price: (9.99 + n).toFixed(2),
    quantity_available: 100,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: 'upcoming' as const,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildOrder(overrides: Record<string, unknown> = {}) {
  const n = seq();
  return {
    id: `order-${n}`,
    order_number: `ORD-${Date.now()}-${n}`,
    user_id: `user-${n}`,
    flash_sale_id: `sale-${n}`,
    product_id: `product-${n}`,
    quantity: 1,
    unit_price: '9.99',
    total_amount: '9.99',
    status: 'pending' as const,
    payment_status: 'pending' as const,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function buildQueueEntry(overrides: Record<string, unknown> = {}) {
  const n = seq();
  return {
    id: `queue-${n}`,
    user_id: `user-${n}`,
    flash_sale_id: `sale-${n}`,
    position: n,
    status: 'waiting' as const,
    joined_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Express Mock Helpers ────────────────────────────────────────────────────

/**
 * Build a minimal mock Express Request.
 */
export function mockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: undefined,
    ...overrides,
  };
}

/**
 * Build a mock Express Response with jest spies.
 */
export function mockResponse(): {
  res: Partial<Response>;
  statusSpy: jest.Mock;
  jsonSpy: jest.Mock;
  sendSpy: jest.Mock;
} {
  const jsonSpy = jest.fn().mockReturnThis();
  const sendSpy = jest.fn().mockReturnThis();
  const statusSpy = jest.fn().mockReturnValue({ json: jsonSpy, send: sendSpy });

  const res: Partial<Response> = {
    status: statusSpy as unknown as Response['status'],
    json: jsonSpy as unknown as Response['json'],
    send: sendSpy as unknown as Response['send'],
    setHeader: jest.fn().mockReturnThis() as unknown as Response['setHeader'],
  };

  return { res, statusSpy, jsonSpy, sendSpy };
}

// ─── Schema Validators ──────────────────────────────────────────────────────

/**
 * Assert that an object contains expected keys with expected types.
 *
 * ```ts
 * expectShape(body.data, {
 *   id: 'string',
 *   base_price: 'number',
 *   created_at: 'string',
 * });
 * ```
 */
export function expectShape(obj: Record<string, unknown>, schema: Record<string, string>): void {
  for (const [key, expectedType] of Object.entries(schema)) {
    expect(obj).toHaveProperty(key);
    if (expectedType === 'array') {
      expect(Array.isArray(obj[key])).toBe(true);
    } else {
      expect(typeof obj[key]).toBe(expectedType);
    }
  }
}

/**
 * Assert a standard success envelope:
 * `{ success: true, data: ... }`
 */
export function expectSuccessEnvelope(body: Record<string, unknown>): void {
  expect(body).toHaveProperty('success', true);
  expect(body).toHaveProperty('data');
}

/**
 * Assert a standard error envelope:
 * `{ success: false, error: '...' }` or `{ error: '...' }`
 */
export function expectErrorEnvelope(body: Record<string, unknown>): void {
  expect(body).toHaveProperty('error');
  expect(typeof body.error).toBe('string');
}

// ─── Timing Helpers ──────────────────────────────────────────────────────────

/**
 * Wait for a given number of milliseconds (useful for timing-sensitive tests).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a date that is `offsetMs` milliseconds from now.
 */
export function futureDate(offsetMs: number): Date {
  return new Date(Date.now() + offsetMs);
}

export function pastDate(offsetMs: number): Date {
  return new Date(Date.now() - offsetMs);
}

// ─── Cleanup Tracker ─────────────────────────────────────────────────────────

/**
 * Simple cleanup queue — register async teardown functions and execute them all
 * at once (e.g. in `afterEach`).
 */
export class CleanupTracker {
  private fns: Array<() => Promise<void>> = [];

  register(fn: () => Promise<void>): void {
    this.fns.push(fn);
  }

  async runAll(): Promise<void> {
    for (const fn of this.fns.reverse()) {
      try {
        await fn();
      } catch {
        // swallow — best-effort cleanup
      }
    }
    this.fns = [];
  }
}
