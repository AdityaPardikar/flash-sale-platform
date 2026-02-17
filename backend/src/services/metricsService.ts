/**
 * Metrics Service
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Prometheus-compatible metrics collection with support for:
 * - HTTP request duration histograms
 * - Request count by route & status code
 * - Active connections gauge
 * - Queue depth & processing rate gauges
 * - Business metrics (sales, revenue, conversions)
 * - Memory & event loop utilization
 * - Redis command latency tracking
 * - Database query latency tracking
 */

// ─── Metric Types ───────────────────────────────────────────

export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricLabels {
  [key: string]: string;
}

interface CounterMetric {
  type: 'counter';
  name: string;
  help: string;
  values: Map<string, number>; // serialized labels → value
}

interface GaugeMetric {
  type: 'gauge';
  name: string;
  help: string;
  values: Map<string, number>;
}

interface HistogramMetric {
  type: 'histogram';
  name: string;
  help: string;
  buckets: number[];
  observations: Map<string, { buckets: number[]; sum: number; count: number }>;
}

interface SummaryMetric {
  type: 'summary';
  name: string;
  help: string;
  maxAge: number; // window in ms
  observations: Map<string, { values: number[]; timestamps: number[]; sum: number; count: number }>;
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric | SummaryMetric;

// ─── Default Histogram Buckets ──────────────────────────────

const DEFAULT_HTTP_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const DEFAULT_DB_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 5];

// ─── Serialization Helpers ──────────────────────────────────

function serializeLabels(labels: MetricLabels): string {
  const keys = Object.keys(labels).sort();
  if (keys.length === 0) return '';
  return keys.map((k) => `${k}="${labels[k]}"`).join(',');
}

function formatLabels(serialized: string): string {
  return serialized ? `{${serialized}}` : '';
}

// ─── Metrics Registry ──────────────────────────────────────

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  // ── Counter ──────────────────────────────────────────────

  registerCounter(name: string, help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type: 'counter', name, help, values: new Map() });
    }
  }

  incrementCounter(name: string, labels: MetricLabels = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return;
    const key = serializeLabels(labels);
    metric.values.set(key, (metric.values.get(key) || 0) + value);
  }

  // ── Gauge ────────────────────────────────────────────────

  registerGauge(name: string, help: string): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, { type: 'gauge', name, help, values: new Map() });
    }
  }

  setGauge(name: string, labels: MetricLabels = {}, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;
    metric.values.set(serializeLabels(labels), value);
  }

  incrementGauge(name: string, labels: MetricLabels = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;
    const key = serializeLabels(labels);
    metric.values.set(key, (metric.values.get(key) || 0) + value);
  }

  decrementGauge(name: string, labels: MetricLabels = {}, value = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return;
    const key = serializeLabels(labels);
    metric.values.set(key, (metric.values.get(key) || 0) - value);
  }

  // ── Histogram ────────────────────────────────────────────

  registerHistogram(name: string, help: string, buckets: number[] = DEFAULT_HTTP_BUCKETS): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        type: 'histogram',
        name,
        help,
        buckets: [...buckets].sort((a, b) => a - b),
        observations: new Map(),
      });
    }
  }

  observeHistogram(name: string, labels: MetricLabels = {}, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram') return;
    const key = serializeLabels(labels);

    if (!metric.observations.has(key)) {
      metric.observations.set(key, {
        buckets: new Array(metric.buckets.length).fill(0),
        sum: 0,
        count: 0,
      });
    }

    const obs = metric.observations.get(key)!;
    obs.sum += value;
    obs.count += 1;
    for (let i = 0; i < metric.buckets.length; i++) {
      if (value <= metric.buckets[i]) {
        obs.buckets[i] += 1;
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────

  registerSummary(name: string, help: string, maxAge = 600_000): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        type: 'summary',
        name,
        help,
        maxAge,
        observations: new Map(),
      });
    }
  }

  observeSummary(name: string, labels: MetricLabels = {}, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'summary') return;
    const key = serializeLabels(labels);
    const now = Date.now();

    if (!metric.observations.has(key)) {
      metric.observations.set(key, { values: [], timestamps: [], sum: 0, count: 0 });
    }

    const obs = metric.observations.get(key)!;
    obs.values.push(value);
    obs.timestamps.push(now);
    obs.sum += value;
    obs.count += 1;

    // Trim old values beyond maxAge window
    const cutoff = now - metric.maxAge;
    while (obs.timestamps.length > 0 && obs.timestamps[0] < cutoff) {
      obs.timestamps.shift();
      obs.values.shift();
    }
  }

  // ── Prometheus Exposition Format ─────────────────────────

  serialize(): string {
    const lines: string[] = [];

    for (const metric of this.metrics.values()) {
      lines.push(`# HELP ${metric.name} ${metric.help}`);
      lines.push(`# TYPE ${metric.name} ${metric.type}`);

      switch (metric.type) {
        case 'counter':
        case 'gauge':
          for (const [labelsStr, value] of metric.values) {
            lines.push(`${metric.name}${formatLabels(labelsStr)} ${value}`);
          }
          break;

        case 'histogram':
          for (const [labelsStr, obs] of metric.observations) {
            const labelPrefix = labelsStr ? `${labelsStr},` : '';
            for (let i = 0; i < metric.buckets.length; i++) {
              lines.push(
                `${metric.name}_bucket{${labelPrefix}le="${metric.buckets[i]}"} ${obs.buckets[i]}`
              );
            }
            lines.push(`${metric.name}_bucket{${labelPrefix}le="+Inf"} ${obs.count}`);
            lines.push(`${metric.name}_sum${formatLabels(labelsStr)} ${obs.sum}`);
            lines.push(`${metric.name}_count${formatLabels(labelsStr)} ${obs.count}`);
          }
          break;

        case 'summary': {
          const quantiles = [0.5, 0.9, 0.95, 0.99];
          for (const [labelsStr, obs] of metric.observations) {
            const sorted = [...obs.values].sort((a, b) => a - b);
            const labelPrefix = labelsStr ? `${labelsStr},` : '';
            for (const q of quantiles) {
              const idx = Math.ceil(q * sorted.length) - 1;
              const val = sorted.length > 0 ? sorted[Math.max(0, idx)] : 0;
              lines.push(`${metric.name}{${labelPrefix}quantile="${q}"} ${val}`);
            }
            lines.push(`${metric.name}_sum${formatLabels(labelsStr)} ${obs.sum}`);
            lines.push(`${metric.name}_count${formatLabels(labelsStr)} ${obs.count}`);
          }
          break;
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  // ── Utilities ────────────────────────────────────────────

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getCounterValue(name: string, labels: MetricLabels = {}): number {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter') return 0;
    return metric.values.get(serializeLabels(labels)) || 0;
  }

  getGaugeValue(name: string, labels: MetricLabels = {}): number {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge') return 0;
    return metric.values.get(serializeLabels(labels)) || 0;
  }

  reset(): void {
    this.metrics.clear();
  }
}

// ─── Global Registry (Singleton) ────────────────────────────

const registry = new MetricsRegistry();

// ─── Pre-registered Application Metrics ─────────────────────

// HTTP metrics
registry.registerHistogram(
  'http_request_duration_seconds',
  'Duration of HTTP requests in seconds',
  DEFAULT_HTTP_BUCKETS
);

registry.registerCounter('http_requests_total', 'Total number of HTTP requests');

registry.registerGauge('http_active_connections', 'Number of active HTTP connections');

registry.registerCounter('http_request_errors_total', 'Total number of HTTP request errors');

// Queue metrics
registry.registerGauge('flash_sale_queue_depth', 'Current depth of flash sale queues');

registry.registerCounter('flash_sale_queue_processed_total', 'Total queue entries processed');

registry.registerHistogram(
  'flash_sale_queue_wait_seconds',
  'Time spent waiting in queue in seconds',
  [1, 5, 10, 30, 60, 120, 300]
);

// Business metrics
registry.registerCounter('flash_sale_orders_total', 'Total number of orders placed');

registry.registerCounter('flash_sale_revenue_total', 'Total revenue from flash sales');

registry.registerGauge('flash_sale_active_sales', 'Number of currently active flash sales');

registry.registerCounter('flash_sale_conversions_total', 'Total number of sale conversions');

registry.registerCounter('flash_sale_inventory_reservations_total', 'Total inventory reservations');

registry.registerCounter(
  'flash_sale_inventory_releases_total',
  'Total inventory releases (expiration or cancellation)'
);

// Database metrics
registry.registerHistogram(
  'db_query_duration_seconds',
  'Duration of database queries in seconds',
  DEFAULT_DB_BUCKETS
);

registry.registerCounter('db_queries_total', 'Total number of database queries');

registry.registerCounter('db_query_errors_total', 'Total number of database query errors');

registry.registerGauge('db_pool_active_connections', 'Number of active database pool connections');

registry.registerGauge('db_pool_idle_connections', 'Number of idle database pool connections');

// Redis metrics
registry.registerHistogram(
  'redis_command_duration_seconds',
  'Duration of Redis commands in seconds',
  DEFAULT_DB_BUCKETS
);

registry.registerCounter('redis_commands_total', 'Total number of Redis commands');

registry.registerCounter('redis_command_errors_total', 'Total number of Redis command errors');

// Node.js runtime metrics
registry.registerGauge('nodejs_heap_used_bytes', 'Node.js heap memory used in bytes');

registry.registerGauge('nodejs_heap_total_bytes', 'Node.js total heap memory in bytes');

registry.registerGauge('nodejs_external_memory_bytes', 'Node.js external memory in bytes');

registry.registerGauge('nodejs_rss_bytes', 'Node.js resident set size in bytes');

registry.registerGauge('nodejs_eventloop_lag_seconds', 'Node.js event loop lag in seconds');

registry.registerGauge('nodejs_active_handles', 'Number of active handles');

registry.registerGauge('nodejs_active_requests', 'Number of active requests');

registry.registerGauge('process_uptime_seconds', 'Process uptime in seconds');

// Middleware execution timing
registry.registerHistogram(
  'middleware_duration_seconds',
  'Duration of middleware execution in seconds',
  [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1]
);

// ─── Runtime Metrics Collector ──────────────────────────────

let eventLoopLagInterval: ReturnType<typeof setInterval> | null = null;

function collectRuntimeMetrics(): void {
  // Memory
  const mem = process.memoryUsage();
  registry.setGauge('nodejs_heap_used_bytes', {}, mem.heapUsed);
  registry.setGauge('nodejs_heap_total_bytes', {}, mem.heapTotal);
  registry.setGauge('nodejs_external_memory_bytes', {}, mem.external);
  registry.setGauge('nodejs_rss_bytes', {}, mem.rss);

  // Uptime
  registry.setGauge('process_uptime_seconds', {}, process.uptime());

  // Active handles/requests (Node.js internals)
  const activeHandles = (process as any)._getActiveHandles?.()?.length ?? 0;
  const activeRequests = (process as any)._getActiveRequests?.()?.length ?? 0;
  registry.setGauge('nodejs_active_handles', {}, activeHandles);
  registry.setGauge('nodejs_active_requests', {}, activeRequests);
}

/**
 * Measure event loop lag by scheduling a timer and checking how late it fires.
 */
function startEventLoopLagMeasurement(): void {
  if (eventLoopLagInterval) return;
  eventLoopLagInterval = setInterval(() => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lagNs = Number(process.hrtime.bigint() - start);
      registry.setGauge('nodejs_eventloop_lag_seconds', {}, lagNs / 1e9);
    });
  }, 2000);

  // Don't block process exit
  if (eventLoopLagInterval.unref) eventLoopLagInterval.unref();
}

function stopEventLoopLagMeasurement(): void {
  if (eventLoopLagInterval) {
    clearInterval(eventLoopLagInterval);
    eventLoopLagInterval = null;
  }
}

// ─── Public API ─────────────────────────────────────────────

export const metricsService = {
  // Registry access
  registry,

  // HTTP helpers
  recordHttpRequest(method: string, route: string, statusCode: number, durationSec: number): void {
    const labels = { method, route: normalizeRoute(route), status_code: String(statusCode) };
    registry.incrementCounter('http_requests_total', labels);
    registry.observeHistogram('http_request_duration_seconds', labels, durationSec);
    if (statusCode >= 400) {
      registry.incrementCounter('http_request_errors_total', labels);
    }
  },

  trackActiveConnection(delta: 1 | -1): void {
    if (delta === 1) {
      registry.incrementGauge('http_active_connections');
    } else {
      registry.decrementGauge('http_active_connections');
    }
  },

  // Queue helpers
  setQueueDepth(saleId: string, depth: number): void {
    registry.setGauge('flash_sale_queue_depth', { sale_id: saleId }, depth);
  },

  recordQueueProcessed(saleId: string): void {
    registry.incrementCounter('flash_sale_queue_processed_total', { sale_id: saleId });
  },

  recordQueueWait(saleId: string, waitSec: number): void {
    registry.observeHistogram('flash_sale_queue_wait_seconds', { sale_id: saleId }, waitSec);
  },

  // Business metrics
  recordOrder(saleId: string, revenue: number): void {
    registry.incrementCounter('flash_sale_orders_total', { sale_id: saleId });
    registry.incrementCounter('flash_sale_revenue_total', { sale_id: saleId }, revenue);
  },

  setActiveSales(count: number): void {
    registry.setGauge('flash_sale_active_sales', {}, count);
  },

  recordConversion(saleId: string): void {
    registry.incrementCounter('flash_sale_conversions_total', { sale_id: saleId });
  },

  recordInventoryReservation(saleId: string): void {
    registry.incrementCounter('flash_sale_inventory_reservations_total', { sale_id: saleId });
  },

  recordInventoryRelease(saleId: string): void {
    registry.incrementCounter('flash_sale_inventory_releases_total', { sale_id: saleId });
  },

  // Database helpers
  recordDbQuery(operation: string, durationSec: number, error = false): void {
    const labels = { operation };
    registry.incrementCounter('db_queries_total', labels);
    registry.observeHistogram('db_query_duration_seconds', labels, durationSec);
    if (error) {
      registry.incrementCounter('db_query_errors_total', labels);
    }
  },

  setDbPoolStats(active: number, idle: number): void {
    registry.setGauge('db_pool_active_connections', {}, active);
    registry.setGauge('db_pool_idle_connections', {}, idle);
  },

  // Redis helpers
  recordRedisCommand(command: string, durationSec: number, error = false): void {
    const labels = { command };
    registry.incrementCounter('redis_commands_total', labels);
    registry.observeHistogram('redis_command_duration_seconds', labels, durationSec);
    if (error) {
      registry.incrementCounter('redis_command_errors_total', labels);
    }
  },

  // Middleware timing
  recordMiddleware(name: string, durationSec: number): void {
    registry.observeHistogram('middleware_duration_seconds', { middleware: name }, durationSec);
  },

  // Lifecycle
  startCollecting(): void {
    startEventLoopLagMeasurement();
    // Collect runtime metrics every 15 seconds
    const interval = setInterval(collectRuntimeMetrics, 15_000);
    if (interval.unref) interval.unref();
    collectRuntimeMetrics(); // immediate first collection
  },

  stopCollecting(): void {
    stopEventLoopLagMeasurement();
  },

  // Prometheus output
  getMetrics(): string {
    collectRuntimeMetrics(); // fresh snapshot
    return registry.serialize();
  },

  // Get JSON metrics for dashboard
  getMetricsJson(): Record<string, any> {
    collectRuntimeMetrics();
    const mem = process.memoryUsage();
    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
        external: mem.external,
      },
      http: {
        totalRequests: registry.getCounterValue('http_requests_total'),
        totalErrors: registry.getCounterValue('http_request_errors_total'),
        activeConnections: registry.getGaugeValue('http_active_connections'),
      },
      database: {
        totalQueries: registry.getCounterValue('db_queries_total'),
        totalErrors: registry.getCounterValue('db_query_errors_total'),
        activeConnections: registry.getGaugeValue('db_pool_active_connections'),
        idleConnections: registry.getGaugeValue('db_pool_idle_connections'),
      },
      redis: {
        totalCommands: registry.getCounterValue('redis_commands_total'),
        totalErrors: registry.getCounterValue('redis_command_errors_total'),
      },
      business: {
        totalOrders: registry.getCounterValue('flash_sale_orders_total'),
        totalRevenue: registry.getCounterValue('flash_sale_revenue_total'),
        activeSales: registry.getGaugeValue('flash_sale_active_sales'),
        totalConversions: registry.getCounterValue('flash_sale_conversions_total'),
      },
    };
  },

  // Reset for testing
  reset(): void {
    registry.reset();
  },
};

// ─── Route Normalization ────────────────────────────────────

function normalizeRoute(url: string): string {
  // Strip query strings
  const path = url.split('?')[0];

  // Replace UUIDs with :id
  const normalized = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ':id'
  );

  // Replace numeric IDs with :id
  return normalized.replace(/\/\d+(?=\/|$)/g, '/:id');
}

export default metricsService;
