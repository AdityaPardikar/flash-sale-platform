/**
 * Metrics Service Integration Tests
 * Week 6 Day 7: Testing, Documentation & Week Review
 *
 * Tests for:
 * - MetricsRegistry (counter, gauge, histogram, summary)
 * - Prometheus exposition format output
 * - metricsService public API
 * - Route normalization
 */

// We import the service directly — it's pure logic without external deps
import { metricsService } from '../services/metricsService';

describe('MetricsService', () => {
  beforeEach(() => {
    metricsService.reset();
    // Re-register metrics that were cleared by reset
    metricsService.registry.registerCounter('http_requests_total', 'Total HTTP requests');
    metricsService.registry.registerCounter('http_request_errors_total', 'Total HTTP errors');
    metricsService.registry.registerGauge('http_active_connections', 'Active connections');
    metricsService.registry.registerHistogram(
      'http_request_duration_seconds',
      'HTTP request duration',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
    );
    metricsService.registry.registerGauge('flash_sale_queue_depth', 'Queue depth');
    metricsService.registry.registerCounter('flash_sale_queue_processed_total', 'Queue processed');
    metricsService.registry.registerHistogram(
      'flash_sale_queue_wait_seconds',
      'Queue wait time',
      [1, 5, 10, 30, 60, 120, 300]
    );
    metricsService.registry.registerCounter('flash_sale_orders_total', 'Orders');
    metricsService.registry.registerCounter('flash_sale_revenue_total', 'Revenue');
    metricsService.registry.registerGauge('flash_sale_active_sales', 'Active sales');
    metricsService.registry.registerCounter('flash_sale_conversions_total', 'Conversions');
    metricsService.registry.registerCounter(
      'flash_sale_inventory_reservations_total',
      'Reservations'
    );
    metricsService.registry.registerCounter('flash_sale_inventory_releases_total', 'Releases');
    metricsService.registry.registerHistogram(
      'db_query_duration_seconds',
      'DB query duration',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5]
    );
    metricsService.registry.registerCounter('db_queries_total', 'DB queries');
    metricsService.registry.registerCounter('db_query_errors_total', 'DB errors');
    metricsService.registry.registerGauge('db_pool_active_connections', 'DB active');
    metricsService.registry.registerGauge('db_pool_idle_connections', 'DB idle');
    metricsService.registry.registerHistogram(
      'redis_command_duration_seconds',
      'Redis command duration',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5]
    );
    metricsService.registry.registerCounter('redis_commands_total', 'Redis commands');
    metricsService.registry.registerCounter('redis_command_errors_total', 'Redis errors');
  });

  // ─── Counter Tests ─────────────────────────────────────

  describe('Counter Metrics', () => {
    it('should increment a counter', () => {
      metricsService.registry.incrementCounter('http_requests_total', {
        method: 'GET',
        route: '/api',
      });
      expect(
        metricsService.registry.getCounterValue('http_requests_total', {
          method: 'GET',
          route: '/api',
        })
      ).toBe(1);
    });

    it('should increment counter by custom value', () => {
      metricsService.registry.incrementCounter('http_requests_total', { method: 'POST' }, 5);
      expect(
        metricsService.registry.getCounterValue('http_requests_total', { method: 'POST' })
      ).toBe(5);
    });

    it('should track separate label combinations independently', () => {
      metricsService.registry.incrementCounter('http_requests_total', { method: 'GET' });
      metricsService.registry.incrementCounter('http_requests_total', { method: 'POST' });
      metricsService.registry.incrementCounter('http_requests_total', { method: 'GET' });

      expect(
        metricsService.registry.getCounterValue('http_requests_total', { method: 'GET' })
      ).toBe(2);
      expect(
        metricsService.registry.getCounterValue('http_requests_total', { method: 'POST' })
      ).toBe(1);
    });

    it('should return 0 for unset counter', () => {
      expect(
        metricsService.registry.getCounterValue('http_requests_total', { method: 'DELETE' })
      ).toBe(0);
    });

    it('should return 0 for non-existent counter', () => {
      expect(metricsService.registry.getCounterValue('nonexistent')).toBe(0);
    });
  });

  // ─── Gauge Tests ───────────────────────────────────────

  describe('Gauge Metrics', () => {
    it('should set gauge value', () => {
      metricsService.registry.setGauge('http_active_connections', {}, 42);
      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(42);
    });

    it('should increment gauge', () => {
      metricsService.registry.incrementGauge('http_active_connections', {}, 1);
      metricsService.registry.incrementGauge('http_active_connections', {}, 1);
      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(2);
    });

    it('should decrement gauge', () => {
      metricsService.registry.setGauge('http_active_connections', {}, 10);
      metricsService.registry.decrementGauge('http_active_connections', {}, 3);
      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(7);
    });

    it('should support negative gauge values', () => {
      metricsService.registry.decrementGauge('http_active_connections', {}, 5);
      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(-5);
    });
  });

  // ─── Histogram Tests ───────────────────────────────────

  describe('Histogram Metrics', () => {
    it('should record observations in correct buckets', () => {
      metricsService.registry.observeHistogram('http_request_duration_seconds', {}, 0.05);

      const output = metricsService.registry.serialize();
      expect(output).toContain('http_request_duration_seconds_bucket');
      expect(output).toContain('http_request_duration_seconds_sum');
      expect(output).toContain('http_request_duration_seconds_count');
    });

    it('should accumulate sum and count', () => {
      metricsService.registry.observeHistogram(
        'http_request_duration_seconds',
        { method: 'GET' },
        0.1
      );
      metricsService.registry.observeHistogram(
        'http_request_duration_seconds',
        { method: 'GET' },
        0.2
      );
      metricsService.registry.observeHistogram(
        'http_request_duration_seconds',
        { method: 'GET' },
        0.3
      );

      const output = metricsService.registry.serialize();
      // Count should be 3
      expect(output).toContain('http_request_duration_seconds_count{method="GET"} 3');
    });
  });

  // ─── Summary Tests ─────────────────────────────────────

  describe('Summary Metrics', () => {
    it('should register and observe summary', () => {
      metricsService.registry.registerSummary('test_summary', 'Test summary metric');
      metricsService.registry.observeSummary('test_summary', {}, 10);
      metricsService.registry.observeSummary('test_summary', {}, 20);
      metricsService.registry.observeSummary('test_summary', {}, 30);

      const output = metricsService.registry.serialize();
      expect(output).toContain('test_summary');
      expect(output).toContain('quantile="0.5"');
      expect(output).toContain('quantile="0.99"');
      expect(output).toContain('test_summary_count 3');
    });
  });

  // ─── HTTP Recording API ────────────────────────────────

  describe('recordHttpRequest', () => {
    it('should record successful HTTP request', () => {
      metricsService.recordHttpRequest('GET', '/api/products', 200, 0.05);

      expect(
        metricsService.registry.getCounterValue('http_requests_total', {
          method: 'GET',
          route: '/api/products',
          status_code: '200',
        })
      ).toBe(1);
    });

    it('should record error HTTP request', () => {
      metricsService.recordHttpRequest('POST', '/api/orders', 500, 1.2);

      expect(
        metricsService.registry.getCounterValue('http_request_errors_total', {
          method: 'POST',
          route: '/api/orders',
          status_code: '500',
        })
      ).toBe(1);
    });

    it('should normalize UUIDs in routes', () => {
      metricsService.recordHttpRequest(
        'GET',
        '/api/products/550e8400-e29b-41d4-a716-446655440000',
        200,
        0.02
      );

      expect(
        metricsService.registry.getCounterValue('http_requests_total', {
          method: 'GET',
          route: '/api/products/:id',
          status_code: '200',
        })
      ).toBe(1);
    });

    it('should strip query strings', () => {
      metricsService.recordHttpRequest('GET', '/api/products?page=1&limit=10', 200, 0.01);

      expect(
        metricsService.registry.getCounterValue('http_requests_total', {
          method: 'GET',
          route: '/api/products',
          status_code: '200',
        })
      ).toBe(1);
    });
  });

  // ─── Queue Metrics ─────────────────────────────────────

  describe('Queue Metrics', () => {
    it('should set queue depth', () => {
      metricsService.setQueueDepth('sale-1', 150);
      expect(
        metricsService.registry.getGaugeValue('flash_sale_queue_depth', { sale_id: 'sale-1' })
      ).toBe(150);
    });

    it('should record queue processed count', () => {
      metricsService.recordQueueProcessed('sale-1');
      metricsService.recordQueueProcessed('sale-1');
      expect(
        metricsService.registry.getCounterValue('flash_sale_queue_processed_total', {
          sale_id: 'sale-1',
        })
      ).toBe(2);
    });

    it('should record queue wait time', () => {
      metricsService.recordQueueWait('sale-1', 30);
      const output = metricsService.registry.serialize();
      expect(output).toContain('flash_sale_queue_wait_seconds');
    });
  });

  // ─── Business Metrics ──────────────────────────────────

  describe('Business Metrics', () => {
    it('should record orders', () => {
      metricsService.recordOrder('sale-1', 49.99);
      metricsService.recordOrder('sale-1', 29.99);

      expect(
        metricsService.registry.getCounterValue('flash_sale_orders_total', { sale_id: 'sale-1' })
      ).toBe(2);
      expect(
        metricsService.registry.getCounterValue('flash_sale_revenue_total', { sale_id: 'sale-1' })
      ).toBeCloseTo(79.98);
    });

    it('should set active sales count', () => {
      metricsService.setActiveSales(5);
      expect(metricsService.registry.getGaugeValue('flash_sale_active_sales')).toBe(5);
    });

    it('should record conversions', () => {
      metricsService.recordConversion('sale-1');
      expect(
        metricsService.registry.getCounterValue('flash_sale_conversions_total', {
          sale_id: 'sale-1',
        })
      ).toBe(1);
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

  // ─── Database Metrics ──────────────────────────────────

  describe('Database Metrics', () => {
    it('should record database queries', () => {
      metricsService.recordDbQuery('SELECT', 0.005);
      metricsService.recordDbQuery('INSERT', 0.01);

      expect(
        metricsService.registry.getCounterValue('db_queries_total', { operation: 'SELECT' })
      ).toBe(1);
      expect(
        metricsService.registry.getCounterValue('db_queries_total', { operation: 'INSERT' })
      ).toBe(1);
    });

    it('should record database errors', () => {
      metricsService.recordDbQuery('UPDATE', 0.1, true);

      expect(
        metricsService.registry.getCounterValue('db_query_errors_total', { operation: 'UPDATE' })
      ).toBe(1);
    });

    it('should set pool stats', () => {
      metricsService.setDbPoolStats(8, 12);

      expect(metricsService.registry.getGaugeValue('db_pool_active_connections')).toBe(8);
      expect(metricsService.registry.getGaugeValue('db_pool_idle_connections')).toBe(12);
    });
  });

  // ─── Redis Metrics ─────────────────────────────────────

  describe('Redis Metrics', () => {
    it('should record redis commands', () => {
      metricsService.recordRedisCommand('GET', 0.001);
      metricsService.recordRedisCommand('SET', 0.002);

      expect(
        metricsService.registry.getCounterValue('redis_commands_total', { command: 'GET' })
      ).toBe(1);
      expect(
        metricsService.registry.getCounterValue('redis_commands_total', { command: 'SET' })
      ).toBe(1);
    });

    it('should record redis errors', () => {
      metricsService.recordRedisCommand('DEL', 0.5, true);

      expect(
        metricsService.registry.getCounterValue('redis_command_errors_total', { command: 'DEL' })
      ).toBe(1);
    });
  });

  // ─── Prometheus Output Format ──────────────────────────

  describe('Prometheus Exposition Format', () => {
    it('should output valid HELP lines', () => {
      metricsService.registry.incrementCounter('http_requests_total', { method: 'GET' });
      const output = metricsService.registry.serialize();
      expect(output).toContain('# HELP http_requests_total');
    });

    it('should output valid TYPE lines', () => {
      const output = metricsService.registry.serialize();
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('# TYPE http_active_connections gauge');
      expect(output).toContain('# TYPE http_request_duration_seconds histogram');
    });

    it('should format labels correctly', () => {
      metricsService.registry.incrementCounter('http_requests_total', {
        method: 'GET',
        route: '/api',
        status_code: '200',
      });
      const output = metricsService.registry.serialize();
      expect(output).toMatch(/http_requests_total\{.*method="GET".*\}/);
    });

    it('should include +Inf bucket for histograms', () => {
      metricsService.registry.observeHistogram('http_request_duration_seconds', {}, 0.05);
      const output = metricsService.registry.serialize();
      expect(output).toContain('le="+Inf"');
    });
  });

  // ─── Connection Tracking ───────────────────────────────

  describe('Active Connection Tracking', () => {
    it('should track connection count', () => {
      metricsService.trackActiveConnection(1);
      metricsService.trackActiveConnection(1);
      metricsService.trackActiveConnection(-1);

      expect(metricsService.registry.getGaugeValue('http_active_connections')).toBe(1);
    });
  });

  // ─── JSON Output ───────────────────────────────────────

  describe('getMetricsJson', () => {
    it('should return structured JSON metrics', () => {
      metricsService.recordHttpRequest('GET', '/api/test', 200, 0.05);
      metricsService.recordOrder('sale-1', 100);
      metricsService.recordDbQuery('SELECT', 0.01);

      const json = metricsService.getMetricsJson();

      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('uptime');
      expect(json).toHaveProperty('memory');
      expect(json).toHaveProperty('http');
      expect(json).toHaveProperty('database');
      expect(json).toHaveProperty('redis');
      expect(json).toHaveProperty('business');

      expect(json.memory).toHaveProperty('heapUsed');
      expect(json.memory).toHaveProperty('heapTotal');
      expect(json.memory).toHaveProperty('rss');
    });
  });
});
