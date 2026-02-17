/**
 * Metrics Service Tests
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Tests for:
 * - Counter, Gauge, Histogram, Summary metric types
 * - Prometheus exposition format serialization
 * - HTTP request recording
 * - Business metric helpers
 * - Runtime metrics collection
 * - JSON metrics snapshot
 */

import { metricsService } from '../services/metricsService';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.reset();
    // Re-register metrics after reset (simulates fresh startup)
    metricsService.registry.registerCounter('http_requests_total', 'Total HTTP requests');
    metricsService.registry.registerHistogram(
      'http_request_duration_seconds',
      'Duration of HTTP requests in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );
    metricsService.registry.registerGauge('http_active_connections', 'Active connections');
    metricsService.registry.registerCounter('http_request_errors_total', 'HTTP errors');
    metricsService.registry.registerCounter('flash_sale_orders_total', 'Total orders');
    metricsService.registry.registerCounter('flash_sale_revenue_total', 'Total revenue');
    metricsService.registry.registerGauge('flash_sale_active_sales', 'Active sales');
    metricsService.registry.registerCounter('flash_sale_conversions_total', 'Total conversions');
    metricsService.registry.registerCounter(
      'flash_sale_inventory_reservations_total',
      'Inventory reservations'
    );
    metricsService.registry.registerCounter(
      'flash_sale_inventory_releases_total',
      'Inventory releases'
    );
    metricsService.registry.registerHistogram(
      'db_query_duration_seconds',
      'DB query duration',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5]
    );
    metricsService.registry.registerCounter('db_queries_total', 'Total DB queries');
    metricsService.registry.registerCounter('db_query_errors_total', 'DB query errors');
    metricsService.registry.registerGauge('db_pool_active_connections', 'DB active conns');
    metricsService.registry.registerGauge('db_pool_idle_connections', 'DB idle conns');
    metricsService.registry.registerHistogram(
      'redis_command_duration_seconds',
      'Redis command duration',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5]
    );
    metricsService.registry.registerCounter('redis_commands_total', 'Total Redis commands');
    metricsService.registry.registerCounter('redis_command_errors_total', 'Redis errors');
    metricsService.registry.registerGauge('nodejs_heap_used_bytes', 'Heap used');
    metricsService.registry.registerGauge('nodejs_heap_total_bytes', 'Heap total');
    metricsService.registry.registerGauge('nodejs_rss_bytes', 'RSS');
    metricsService.registry.registerGauge('process_uptime_seconds', 'Uptime');
  });

  // ─── Counter Tests ──────────────────────────────────────

  describe('Counter metrics', () => {
    it('should increment counters', () => {
      metricsService.registry.incrementCounter('http_requests_total', {
        method: 'GET',
        route: '/api/products',
        status_code: '200',
      });
      metricsService.registry.incrementCounter('http_requests_total', {
        method: 'GET',
        route: '/api/products',
        status_code: '200',
      });
      metricsService.registry.incrementCounter('http_requests_total', {
        method: 'POST',
        route: '/api/orders',
        status_code: '201',
      });

      const output = metricsService.registry.serialize();
      expect(output).toContain(
        'http_requests_total{method="GET",route="/api/products",status_code="200"} 2'
      );
      expect(output).toContain(
        'http_requests_total{method="POST",route="/api/orders",status_code="201"} 1'
      );
    });

    it('should increment by custom amount', () => {
      metricsService.registry.incrementCounter(
        'flash_sale_revenue_total',
        { sale_id: 'sale-1' },
        99.99
      );
      metricsService.registry.incrementCounter(
        'flash_sale_revenue_total',
        { sale_id: 'sale-1' },
        49.99
      );

      const value = metricsService.registry.getCounterValue('flash_sale_revenue_total', {
        sale_id: 'sale-1',
      });
      expect(value).toBeCloseTo(149.98, 2);
    });
  });

  // ─── Gauge Tests ────────────────────────────────────────

  describe('Gauge metrics', () => {
    it('should set and get gauge values', () => {
      metricsService.registry.setGauge('http_active_connections', {}, 42);
      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(42);
    });

    it('should increment and decrement gauges', () => {
      metricsService.trackActiveConnection(1);
      metricsService.trackActiveConnection(1);
      metricsService.trackActiveConnection(1);
      metricsService.trackActiveConnection(-1);

      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(2);
    });

    it('should set active sales count', () => {
      metricsService.setActiveSales(5);
      expect(metricsService.registry.getGaugeValue('flash_sale_active_sales')).toBe(5);
    });
  });

  // ─── Histogram Tests ────────────────────────────────────

  describe('Histogram metrics', () => {
    it('should observe histogram values and serialize buckets', () => {
      metricsService.registry.observeHistogram(
        'http_request_duration_seconds',
        { method: 'GET', route: '/api/test', status_code: '200' },
        0.05
      );
      metricsService.registry.observeHistogram(
        'http_request_duration_seconds',
        { method: 'GET', route: '/api/test', status_code: '200' },
        0.15
      );

      const output = metricsService.registry.serialize();
      expect(output).toContain('http_request_duration_seconds_bucket');
      expect(output).toContain('http_request_duration_seconds_sum');
      expect(output).toContain('http_request_duration_seconds_count');
      expect(output).toContain('le="0.25"} 2'); // both values ≤ 0.25
      expect(output).toContain('le="0.05"} 1'); // only 0.05 ≤ 0.05
    });
  });

  // ─── HTTP Request Recording ─────────────────────────────

  describe('recordHttpRequest', () => {
    it('should record successful request', () => {
      metricsService.recordHttpRequest('GET', '/api/v1/products', 200, 0.045);

      const total = metricsService.registry.getCounterValue('http_requests_total', {
        method: 'GET',
        route: '/api/v1/products',
        status_code: '200',
      });
      expect(total).toBe(1);
    });

    it('should record error request and increment error counter', () => {
      metricsService.recordHttpRequest('POST', '/api/v1/orders', 500, 1.2);

      const errors = metricsService.registry.getCounterValue('http_request_errors_total', {
        method: 'POST',
        route: '/api/v1/orders',
        status_code: '500',
      });
      expect(errors).toBe(1);
    });

    it('should normalize UUIDs in routes', () => {
      metricsService.recordHttpRequest(
        'GET',
        '/api/v1/products/550e8400-e29b-41d4-a716-446655440000',
        200,
        0.03
      );

      const total = metricsService.registry.getCounterValue('http_requests_total', {
        method: 'GET',
        route: '/api/v1/products/:id',
        status_code: '200',
      });
      expect(total).toBe(1);
    });
  });

  // ─── Business Metrics ───────────────────────────────────

  describe('Business metrics', () => {
    it('should record orders with revenue', () => {
      metricsService.recordOrder('sale-abc', 149.99);
      metricsService.recordOrder('sale-abc', 79.99);

      expect(
        metricsService.registry.getCounterValue('flash_sale_orders_total', { sale_id: 'sale-abc' })
      ).toBe(2);
      expect(
        metricsService.registry.getCounterValue('flash_sale_revenue_total', { sale_id: 'sale-abc' })
      ).toBeCloseTo(229.98, 2);
    });

    it('should record conversions', () => {
      metricsService.recordConversion('sale-xyz');
      metricsService.recordConversion('sale-xyz');
      metricsService.recordConversion('sale-xyz');

      expect(
        metricsService.registry.getCounterValue('flash_sale_conversions_total', {
          sale_id: 'sale-xyz',
        })
      ).toBe(3);
    });

    it('should record inventory reservations and releases', () => {
      metricsService.recordInventoryReservation('sale-1');
      metricsService.recordInventoryReservation('sale-1');
      metricsService.recordInventoryRelease('sale-1');

      expect(
        metricsService.registry.getCounterValue('flash_sale_inventory_reservations_total', {
          sale_id: 'sale-1',
        })
      ).toBe(2);
      expect(
        metricsService.registry.getCounterValue('flash_sale_inventory_releases_total', {
          sale_id: 'sale-1',
        })
      ).toBe(1);
    });
  });

  // ─── Database Metrics ───────────────────────────────────

  describe('Database metrics', () => {
    it('should record successful DB query', () => {
      metricsService.recordDbQuery('SELECT', 0.005);

      expect(
        metricsService.registry.getCounterValue('db_queries_total', { operation: 'SELECT' })
      ).toBe(1);
      expect(
        metricsService.registry.getCounterValue('db_query_errors_total', { operation: 'SELECT' })
      ).toBe(0);
    });

    it('should record failed DB query', () => {
      metricsService.recordDbQuery('INSERT', 0.1, true);

      expect(
        metricsService.registry.getCounterValue('db_query_errors_total', { operation: 'INSERT' })
      ).toBe(1);
    });

    it('should set pool stats', () => {
      metricsService.setDbPoolStats(8, 2);

      expect(metricsService.registry.getGaugeValue('db_pool_active_connections')).toBe(8);
      expect(metricsService.registry.getGaugeValue('db_pool_idle_connections')).toBe(2);
    });
  });

  // ─── Redis Metrics ──────────────────────────────────────

  describe('Redis metrics', () => {
    it('should record Redis command', () => {
      metricsService.recordRedisCommand('GET', 0.002);
      metricsService.recordRedisCommand('SET', 0.003);

      expect(
        metricsService.registry.getCounterValue('redis_commands_total', { command: 'GET' })
      ).toBe(1);
      expect(
        metricsService.registry.getCounterValue('redis_commands_total', { command: 'SET' })
      ).toBe(1);
    });

    it('should record Redis errors', () => {
      metricsService.recordRedisCommand('EVAL', 0.5, true);

      expect(
        metricsService.registry.getCounterValue('redis_command_errors_total', { command: 'EVAL' })
      ).toBe(1);
    });
  });

  // ─── Prometheus Output ──────────────────────────────────

  describe('Prometheus exposition format', () => {
    it('should include HELP and TYPE annotations', () => {
      const output = metricsService.registry.serialize();
      expect(output).toContain('# HELP http_requests_total');
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('# HELP http_active_connections');
      expect(output).toContain('# TYPE http_active_connections gauge');
      expect(output).toContain('# TYPE http_request_duration_seconds histogram');
    });

    it('should produce valid multi-line output', () => {
      metricsService.recordHttpRequest('GET', '/test', 200, 0.01);
      const output = metricsService.registry.serialize();

      // Should not have empty metric names or malformed lines
      const lines = output.split('\n').filter((l) => l && !l.startsWith('#'));
      for (const line of lines) {
        expect(line).toMatch(/^[a-z_]+/); // starts with metric name
      }
    });
  });

  // ─── JSON Metrics ──────────────────────────────────────

  describe('getMetricsJson', () => {
    it('should return structured JSON with all sections', () => {
      metricsService.recordHttpRequest('GET', '/api/test', 200, 0.05);
      metricsService.recordOrder('sale-1', 100);

      const json = metricsService.getMetricsJson();

      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('uptime');
      expect(json).toHaveProperty('memory');
      expect(json.memory).toHaveProperty('heapUsed');
      expect(json.memory).toHaveProperty('heapTotal');
      expect(json).toHaveProperty('http');
      expect(json).toHaveProperty('database');
      expect(json).toHaveProperty('redis');
      expect(json).toHaveProperty('business');
    });
  });

  // ─── Summary metrics ───────────────────────────────────

  describe('Summary metrics', () => {
    it('should observe and serialize summary quantiles', () => {
      metricsService.registry.registerSummary('test_summary', 'A test summary');

      for (let i = 1; i <= 100; i++) {
        metricsService.registry.observeSummary('test_summary', {}, i);
      }

      const output = metricsService.registry.serialize();
      expect(output).toContain('test_summary{quantile="0.5"}');
      expect(output).toContain('test_summary{quantile="0.99"}');
      expect(output).toContain('test_summary_sum');
      expect(output).toContain('test_summary_count');
    });
  });
});
