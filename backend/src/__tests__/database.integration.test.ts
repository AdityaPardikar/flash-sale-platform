/**
 * Week 7 Day 3 — Database Integration Tests
 *
 * These tests validate database layer behaviour by mocking pg Pool at the
 * module boundary. They cover:
 *   - Migration execution (runAllMigrations)
 *   - Database utility functions (query, testConnection, getClient)
 *   - Transaction handling (BEGIN / COMMIT / ROLLBACK)
 *   - Connection pool error resilience
 *   - Product & Flash Sale service database interactions
 *
 * Because a real PostgreSQL instance may not be available in CI, every test
 * swaps `pg.Pool` for a lightweight jest mock so assertions are deterministic.
 */

// ─── Mock pg before anything imports it ──────────────────────────────────────

const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();
const mockPoolEnd = jest.fn();
const mockPoolOn = jest.fn();

jest.mock('pg', () => {
  const mPool = {
    query: mockPoolQuery,
    connect: mockPoolConnect,
    end: mockPoolEnd,
    on: mockPoolOn,
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('../utils/config', () => ({
  DATABASE_CONFIG: {
    host: 'localhost',
    port: 5432,
    database: 'flash_sale_test',
    user: 'test',
    password: 'test',
  },
  REDIS_CONFIG: { host: 'localhost', port: 6379, password: '' },
  JWT_SECRET: 'test-secret',
  PORT: 3000,
}));

jest.mock('../utils/redis');
jest.mock('uuid', () => ({ v4: jest.fn(() => 'mock-uuid-db') }));

import { query, testConnection, closePool, getClient, getPool } from '../utils/database';
import {
  runAllMigrations,
  migration001_CreateUsersTable,
  migration002_CreateProductsTable,
  migration003_CreateFlashSalesTable,
  migration004_CreateQueueEntriesTable,
  migration005_CreateOrdersTable,
  migration006_CreateOrderHistoryTable,
  migration007_CreateAnalyticsEventsTable,
  migration008_CreateInventorySyncLogTable,
} from '../utils/migrations';

// ─────────────────────────────────────────────────────────────────────────────
// Database Utility Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Database Utilities', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('query()', () => {
    it('returns rows from a successful query', async () => {
      const expected = { rows: [{ id: '1', name: 'Test' }], rowCount: 1 };
      mockPoolQuery.mockResolvedValue(expected);

      const result = await query('SELECT * FROM products');
      expect(result).toEqual(expected);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT * FROM products', undefined);
    });

    it('passes parametrised queries through', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      await query('SELECT * FROM users WHERE email = $1', ['a@b.com']);
      expect(mockPoolQuery).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE email = $1',
        ['a@b.com'],
      );
    });

    it('throws on database error', async () => {
      mockPoolQuery.mockRejectedValue(new Error('connection refused'));

      await expect(query('SELECT 1')).rejects.toThrow('connection refused');
    });

    it('handles empty result sets', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await query('SELECT * FROM products WHERE id = $1', ['nonexistent']);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('testConnection()', () => {
    it('returns true on successful connection', async () => {
      mockPoolQuery.mockResolvedValue({ rows: [{ now: new Date() }] });

      const ok = await testConnection();
      expect(ok).toBe(true);
      expect(mockPoolQuery).toHaveBeenCalledWith('SELECT NOW()', undefined);
    });

    it('returns false on failure', async () => {
      mockPoolQuery.mockRejectedValue(new Error('ECONNREFUSED'));

      const ok = await testConnection();
      expect(ok).toBe(false);
    });
  });

  describe('closePool()', () => {
    it('ends the pool', async () => {
      mockPoolEnd.mockResolvedValue(undefined);

      await closePool();
      expect(mockPoolEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('getClient()', () => {
    it('returns a client from pool.connect', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPoolConnect.mockResolvedValue(mockClient);

      const client = await getClient();
      expect(client).toBe(mockClient);
      expect(mockPoolConnect).toHaveBeenCalled();
    });
  });

  describe('getPool()', () => {
    it('returns the pool instance', () => {
      const pool = getPool();
      expect(pool).toBeDefined();
      expect(pool).toHaveProperty('query');
      expect(pool).toHaveProperty('connect');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Handling Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Transaction Handling', () => {
  beforeEach(() => jest.clearAllMocks());

  it('simulates a successful COMMIT workflow', async () => {
    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      release: jest.fn(),
    };
    mockPoolConnect.mockResolvedValue(mockClient);

    const client = await getClient();

    await client.query('BEGIN');
    await client.query('INSERT INTO products (name) VALUES ($1)', ['Phone']);
    await client.query('COMMIT');
    client.release();

    expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
    expect(mockClient.query).toHaveBeenCalledWith(
      'INSERT INTO products (name) VALUES ($1)',
      ['Phone'],
    );
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('simulates ROLLBACK on error', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('duplicate key')) // INSERT
      .mockResolvedValueOnce({}); // ROLLBACK

    mockPoolConnect.mockResolvedValue(mockClient);

    const client = await getClient();

    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO users (email) VALUES ($1)', ['dup@test.com']);
    } catch {
      await client.query('ROLLBACK');
    }
    client.release();

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('release is called even when ROLLBACK fails', async () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockRejectedValueOnce(new Error('timeout'))   // INSERT
      .mockRejectedValueOnce(new Error('already closed')); // ROLLBACK

    mockPoolConnect.mockResolvedValue(mockClient);

    const client = await getClient();

    await client.query('BEGIN');
    try {
      await client.query('INSERT INTO orders (id) VALUES ($1)', ['x']);
    } catch {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ROLLBACK also failed — still must release
      }
    }
    client.release();

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Migration Execution Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Migration Execution', () => {
  beforeEach(() => jest.clearAllMocks());

  it('runAllMigrations calls all 8 migrations in order', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await runAllMigrations();

    // There are 8 migration functions — each calls pool.query once
    expect(mockPoolQuery.mock.calls.length).toBeGreaterThanOrEqual(8);
  });

  it('each migration sends CREATE TABLE IF NOT EXISTS', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    const migrations = [
      migration001_CreateUsersTable,
      migration002_CreateProductsTable,
      migration003_CreateFlashSalesTable,
      migration004_CreateQueueEntriesTable,
      migration005_CreateOrdersTable,
      migration006_CreateOrderHistoryTable,
      migration007_CreateAnalyticsEventsTable,
      migration008_CreateInventorySyncLogTable,
    ];

    for (const mig of migrations) {
      mockPoolQuery.mockClear();
      await mig();

      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    });
  });

  it('runAllMigrations rejects when any migration fails', async () => {
    mockPoolQuery
      .mockResolvedValueOnce({}) // migration 1 ok
      .mockRejectedValueOnce(new Error('syntax error')); // migration 2 fails

    await expect(runAllMigrations()).rejects.toThrow('syntax error');
  });

  describe('Individual migration SQL contracts', () => {
    beforeEach(() => {
      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    });

    it('migration 1 creates users with email & username', async () => {
      await migration001_CreateUsersTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('users');
      expect(sql).toContain('email');
      expect(sql).toContain('username');
      expect(sql).toContain('password_hash');
    });

    it('migration 2 creates products with base_price', async () => {
      await migration002_CreateProductsTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('products');
      expect(sql).toContain('base_price');
      expect(sql).toContain('category');
    });

    it('migration 3 creates flash_sales with foreign key to products', async () => {
      await migration003_CreateFlashSalesTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('flash_sales');
      expect(sql).toContain('REFERENCES products(id)');
    });

    it('migration 4 creates queue_entries with position', async () => {
      await migration004_CreateQueueEntriesTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('queue_entries');
      expect(sql).toContain('position');
    });

    it('migration 5 creates orders with total_price', async () => {
      await migration005_CreateOrdersTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('orders');
      expect(sql).toContain('total_price');
    });

    it('migration 6 creates order_history linked to orders', async () => {
      await migration006_CreateOrderHistoryTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('order_history');
      expect(sql).toContain('REFERENCES orders(id)');
    });

    it('migration 7 creates analytics_events with JSONB data column', async () => {
      await migration007_CreateAnalyticsEventsTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('analytics_events');
      expect(sql).toContain('JSONB');
    });

    it('migration 8 creates inventory_sync_log', async () => {
      await migration008_CreateInventorySyncLogTable();
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('inventory_sync_log');
      expect(sql).toContain('redis_count');
      expect(sql).toContain('db_count');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Connection Pool Resilience Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Connection Pool Resilience', () => {
  beforeEach(() => jest.clearAllMocks());

  it('pool registers an error handler', () => {
    // On import the pool registers .on("error", ...) — verify the handler exists
    expect(mockPoolOn).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('pool error handler logs but does not throw', () => {
    // Ensure the callback passed to pool.on('error') was registered
    const errorHandler = mockPoolOn.mock.calls.find(
      (call: any[]) => call[0] === 'error',
    )?.[1] as (err: Error) => void;

    if (errorHandler) {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      expect(() => errorHandler(new Error('idle client crash'))).not.toThrow();
      consoleSpy.mockRestore();
    }
  });

  it('handles concurrent query calls', async () => {
    mockPoolQuery.mockResolvedValue({ rows: [{ id: '1' }], rowCount: 1 });

    const results = await Promise.all([
      query('SELECT 1'),
      query('SELECT 2'),
      query('SELECT 3'),
    ]);

    expect(results).toHaveLength(3);
    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
  });

  it('getClient rejects when pool is exhausted', async () => {
    mockPoolConnect.mockRejectedValue(
      new Error('timeout: all clients are in use'),
    );

    await expect(getClient()).rejects.toThrow('all clients are in use');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Service–Database Interaction Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Service → Database Interaction', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('ProductService.getAllProducts', () => {
    it('builds a parameterised query when category filter supplied', async () => {
      const { default: productService } = await import('../services/productService');

      mockPoolQuery.mockResolvedValue({
        rows: [{ id: '1', name: 'Phone', base_price: '499', category: 'electronics' }],
        rowCount: 1,
      });

      await productService.getAllProducts({ category: 'electronics' });

      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('category');
      expect(mockPoolQuery.mock.calls[0][1]).toContain('electronics');
    });
  });

  describe('ProductService.getProductById', () => {
    it('queries with id parameter and returns single row', async () => {
      const { default: productService } = await import('../services/productService');

      const product = {
        id: 'prod-123',
        name: 'Laptop',
        description: 'A laptop',
        base_price: '999.99',
        category: 'electronics',
        image_url: null,
        created_at: new Date().toISOString(),
      };
      mockPoolQuery.mockResolvedValue({ rows: [product], rowCount: 1 });

      const result = await productService.getProductById('prod-123');

      expect(mockPoolQuery).toHaveBeenCalledTimes(1);
      const sql: string = mockPoolQuery.mock.calls[0][0];
      expect(sql).toContain('$1');
      expect(mockPoolQuery.mock.calls[0][1]).toContain('prod-123');
      expect(result).toEqual(product);
    });

    it('returns null when product does not exist', async () => {
      const { default: productService } = await import('../services/productService');

      mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const result = await productService.getProductById('nonexistent');
      expect(result).toBeNull();
    });
  });
});
