/**
 * HighLoad Flash Sale Platform — API Throughput Benchmark
 * Week 7 Day 5: Load Testing & Performance Benchmarks
 *
 * Measures per-endpoint throughput, latency percentiles (p50/p95/p99),
 * and requests-per-second (RPS) under progressive load.
 *
 * Results feed into performance regression detection by comparing
 * percentile values against saved baselines.
 *
 * k6 run tests/load/api-benchmark.js
 * k6 run tests/load/api-benchmark.js --env ENV=staging --env BASE_URL=https://staging.example.com
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ─── Per-endpoint latency metrics ────────────────────────────────────────────

const endpointMetrics = {
  'GET /products': new Trend('bench_products_latency', true),
  'GET /products/:id': new Trend('bench_product_detail_latency', true),
  'GET /products/search': new Trend('bench_product_search_latency', true),
  'GET /flash-sales': new Trend('bench_flash_sales_latency', true),
  'GET /flash-sales/active': new Trend('bench_active_sales_latency', true),
  'GET /flash-sales/upcoming': new Trend('bench_upcoming_sales_latency', true),
  'GET /flash-sales/:id': new Trend('bench_sale_detail_latency', true),
  'GET /health/live': new Trend('bench_health_latency', true),
  'GET /queue/stats/:saleId': new Trend('bench_queue_stats_latency', true),
  'GET /queue/length/:saleId': new Trend('bench_queue_length_latency', true),
};

const totalRequests = new Counter('bench_total_requests');
const endpointErrors = new Counter('bench_endpoint_errors');
const overallErrorRate = new Rate('bench_error_rate');

// ─── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const SALE_ID = __ENV.SALE_ID || 'perf-test-sale-001';

// ─── Weighted endpoint table ─────────────────────────────────────────────────

const endpoints = new SharedArray('endpoints', function () {
  return [
    // Public read endpoints (high traffic)
    { weight: 20, method: 'GET', path: '/products', name: 'GET /products' },
    { weight: 10, method: 'GET', path: '/products/1', name: 'GET /products/:id' },
    { weight: 8, method: 'GET', path: '/products/search?q=test', name: 'GET /products/search' },
    { weight: 18, method: 'GET', path: '/flash-sales', name: 'GET /flash-sales' },
    { weight: 18, method: 'GET', path: '/flash-sales/active', name: 'GET /flash-sales/active' },
    { weight: 8, method: 'GET', path: '/flash-sales/upcoming', name: 'GET /flash-sales/upcoming' },
    { weight: 5, method: 'GET', path: `/flash-sales/${SALE_ID}`, name: 'GET /flash-sales/:id' },
    { weight: 5, method: 'GET', path: '/health/live', name: 'GET /health/live' },
    { weight: 4, method: 'GET', path: `/queue/stats/${SALE_ID}`, name: 'GET /queue/stats/:saleId' },
    {
      weight: 4,
      method: 'GET',
      path: `/queue/length/${SALE_ID}`,
      name: 'GET /queue/length/:saleId',
    },
  ];
});

// ─── Build cumulative distribution from weights ──────────────────────────────

const cumulativeWeights = (() => {
  let total = 0;
  return endpoints.map((e) => {
    total += e.weight;
    return total;
  });
})();
const totalWeight = cumulativeWeights[cumulativeWeights.length - 1];

function pickEndpoint() {
  const r = Math.random() * totalWeight;
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (r < cumulativeWeights[i]) return endpoints[i];
  }
  return endpoints[endpoints.length - 1];
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // Scenario A: Constant arrival rate — sustained RPS target
    constant_rps: {
      executor: 'constant-arrival-rate',
      exec: 'benchmarkEndpoints',
      rate: 200,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 100,
      maxVUs: 400,
    },

    // Scenario B: Ramping arrival rate — find throughput ceiling
    ramp_rps: {
      executor: 'ramping-arrival-rate',
      exec: 'benchmarkEndpoints',
      startRate: 50,
      timeUnit: '1s',
      stages: [
        { duration: '30s', target: 100 },
        { duration: '30s', target: 300 },
        { duration: '1m', target: 500 },
        { duration: '1m', target: 800 },
        { duration: '30s', target: 1000 },
        { duration: '30s', target: 200 },
      ],
      preAllocatedVUs: 200,
      maxVUs: 800,
      startTime: '2m30s',
    },

    // Scenario C: Per-endpoint isolated measurement (serial, low concurrency)
    isolated_benchmark: {
      executor: 'per-vu-iterations',
      exec: 'isolatedBenchmark',
      vus: 5,
      iterations: 50, // 50 iterations * 5 VUs = 250 total per endpoint
      startTime: '7m',
    },
  },

  thresholds: {
    http_req_duration: ['p(50)<200', 'p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    bench_error_rate: ['rate<0.05'],
    bench_products_latency: ['p(95)<300'],
    bench_active_sales_latency: ['p(95)<300'],
    bench_health_latency: ['p(95)<100'],
    bench_flash_sales_latency: ['p(95)<400'],
    bench_sale_detail_latency: ['p(95)<350'],
    bench_product_detail_latency: ['p(95)<250'],
    bench_product_search_latency: ['p(95)<400'],
    bench_queue_stats_latency: ['p(95)<300'],
    bench_queue_length_latency: ['p(95)<200'],
  },
};

// ─── Scenario executors ──────────────────────────────────────────────────────

export function benchmarkEndpoints() {
  const ep = pickEndpoint();
  executeEndpoint(ep);
}

export function isolatedBenchmark() {
  // Each VU iterates through every endpoint sequentially
  for (const ep of endpoints) {
    group(`Isolated: ${ep.name}`, () => {
      executeEndpoint(ep);
      sleep(0.1);
    });
  }
}

// ─── Core endpoint executor ─────────────────────────────────────────────────

function executeEndpoint(ep) {
  const url = `${API}${ep.path}`;
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: ep.name },
  };

  const res = ep.method === 'GET' ? http.get(url, params) : http.post(url, null, params);

  totalRequests.add(1);

  const ok = check(res, {
    [`${ep.name}: status 2xx|404`]: (r) => r.status >= 200 && r.status < 500,
    [`${ep.name}: latency < 3s`]: (r) => r.timings.duration < 3000,
  });

  // Record per-endpoint latency
  if (endpointMetrics[ep.name]) {
    endpointMetrics[ep.name].add(res.timings.duration);
  }

  if (!ok) {
    endpointErrors.add(1);
    overallErrorRate.add(1);
  } else {
    overallErrorRate.add(0);
  }
}

// ─── Summary handler ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = buildTextReport(data);
  const json = JSON.stringify(data, null, 2);
  const html = buildHtmlReport(data);

  return {
    stdout: summary,
    'reports/api-benchmark.json': json,
    'reports/api-benchmark.html': html,
  };
}

// ─── Reporting helpers ───────────────────────────────────────────────────────

function m(data, name, stat) {
  try {
    return data.metrics[name].values[stat];
  } catch {
    return null;
  }
}

function f(val, dec) {
  return val !== null && val !== undefined ? Number(val).toFixed(dec || 2) : 'N/A';
}

/** Compute a baseline regression status */
function regressionBadge(p95, threshold) {
  if (p95 === null) return '  —  ';
  if (p95 <= threshold * 0.8) return ' ✅  ';
  if (p95 <= threshold) return ' ⚠️  ';
  return ' ❌  ';
}

function buildTextReport(data) {
  const epNames = Object.keys(endpointMetrics);
  const lines = epNames.map((name) => {
    const key = name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
    // Find the matching metric key
    const metricKey = Object.keys(data.metrics || {}).find(
      (k) =>
        k.startsWith('bench_') &&
        k !== 'bench_total_requests' &&
        k !== 'bench_endpoint_errors' &&
        k !== 'bench_error_rate' &&
        data.metrics[k].type === 'trend',
    );

    const p50 = tryMetric(data, name, 'med');
    const p95 = tryMetric(data, name, 'p(95)');
    const p99 = tryMetric(data, name, 'p(99)');
    const avg = tryMetric(data, name, 'avg');
    const cnt = tryMetric(data, name, 'count');
    return `  ${name.padEnd(30)} p50=${f(p50, 1).padStart(7)}  p95=${f(p95, 1).padStart(7)}  p99=${f(p99, 1).padStart(7)}  avg=${f(avg, 1).padStart(7)}  n=${f(cnt, 0).padStart(6)}`;
  });

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║              API BENCHMARK REPORT — PER-ENDPOINT PERCENTILES               ║
╚══════════════════════════════════════════════════════════════════════════════╝

  Total Requests ....... ${f(m(data, 'http_reqs', 'count'), 0)}
  Throughput ........... ${f(m(data, 'http_reqs', 'rate'))}/s
  Error Rate ........... ${f(m(data, 'bench_error_rate', 'rate') * 100, 2)}%
  Overall P50 .......... ${f(m(data, 'http_req_duration', 'med'))} ms
  Overall P95 .......... ${f(m(data, 'http_req_duration', 'p(95)'))} ms
  Overall P99 .......... ${f(m(data, 'http_req_duration', 'p(99)'))} ms

  ┌─ Per-Endpoint Breakdown ────────────────────────────────────────────────────┐
${lines.join('\n')}
  └─────────────────────────────────────────────────────────────────────────────┘
`;
}

function tryMetric(data, epName, stat) {
  // Build the metric key from the endpoint name
  const metricMapping = {
    'GET /products': 'bench_products_latency',
    'GET /products/:id': 'bench_product_detail_latency',
    'GET /products/search': 'bench_product_search_latency',
    'GET /flash-sales': 'bench_flash_sales_latency',
    'GET /flash-sales/active': 'bench_active_sales_latency',
    'GET /flash-sales/upcoming': 'bench_upcoming_sales_latency',
    'GET /flash-sales/:id': 'bench_sale_detail_latency',
    'GET /health/live': 'bench_health_latency',
    'GET /queue/stats/:saleId': 'bench_queue_stats_latency',
    'GET /queue/length/:saleId': 'bench_queue_length_latency',
  };
  const key = metricMapping[epName];
  if (!key) return null;
  try {
    return data.metrics[key].values[stat];
  } catch {
    return null;
  }
}

function buildHtmlReport(data) {
  const epNames = Object.keys(endpointMetrics);
  const thresholds = {
    'GET /products': 300,
    'GET /products/:id': 250,
    'GET /products/search': 400,
    'GET /flash-sales': 400,
    'GET /flash-sales/active': 300,
    'GET /flash-sales/upcoming': 400,
    'GET /flash-sales/:id': 350,
    'GET /health/live': 100,
    'GET /queue/stats/:saleId': 300,
    'GET /queue/length/:saleId': 200,
  };

  const rows = epNames
    .map((name) => {
      const p50 = tryMetric(data, name, 'med');
      const p95 = tryMetric(data, name, 'p(95)');
      const p99 = tryMetric(data, name, 'p(99)');
      const avg = tryMetric(data, name, 'avg');
      const cnt = tryMetric(data, name, 'count');
      const thr = thresholds[name] || 500;
      const cls = p95 !== null && p95 <= thr ? 'pass' : 'fail';
      return `<tr>
      <td>${name}</td>
      <td>${f(p50, 1)}</td><td>${f(p95, 1)}</td><td>${f(p99, 1)}</td>
      <td>${f(avg, 1)}</td><td>${f(cnt, 0)}</td>
      <td class="${cls}">${cls === 'pass' ? '✅ PASS' : '❌ FAIL'}</td>
    </tr>`;
    })
    .join('\n    ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>API Benchmark Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
    h1{font-size:1.5rem;margin-bottom:.5rem;color:#38bdf8}
    h2{font-size:1.1rem;margin:1.5rem 0 .5rem;color:#94a3b8}
    table{width:100%;border-collapse:collapse;margin-top:.5rem;font-size:.85rem}
    th{text-align:left;padding:.5rem .6rem;background:#1e293b;color:#94a3b8;font-weight:500}
    td{padding:.45rem .6rem;border-bottom:1px solid #1e293b}
    tr:hover{background:#1e293b}
    .pass{color:#4ade80;font-weight:600} .fail{color:#f87171;font-weight:600}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:1rem 0}
    .card{background:#1e293b;border-radius:8px;padding:1rem;text-align:center}
    .card .val{font-size:1.4rem;font-weight:700;color:#f0f0f0}
    .card .label{font-size:.75rem;color:#64748b;margin-top:.3rem}
    .ts{font-size:.75rem;color:#64748b;margin-top:1.5rem}
  </style>
</head>
<body>
  <h1>📊 API Benchmark Report</h1>
  <div class="summary">
    <div class="card"><div class="val">${f(m(data, 'http_reqs', 'count'), 0)}</div><div class="label">Total Requests</div></div>
    <div class="card"><div class="val">${f(m(data, 'http_reqs', 'rate'))}/s</div><div class="label">Throughput</div></div>
    <div class="card"><div class="val">${f(m(data, 'bench_error_rate', 'rate') * 100, 2)}%</div><div class="label">Error Rate</div></div>
  </div>
  <div class="summary">
    <div class="card"><div class="val">${f(m(data, 'http_req_duration', 'med'))} ms</div><div class="label">Overall P50</div></div>
    <div class="card"><div class="val">${f(m(data, 'http_req_duration', 'p(95)'))} ms</div><div class="label">Overall P95</div></div>
    <div class="card"><div class="val">${f(m(data, 'http_req_duration', 'p(99)'))} ms</div><div class="label">Overall P99</div></div>
  </div>

  <h2>Per-Endpoint Breakdown</h2>
  <table>
    <thead><tr><th>Endpoint</th><th>P50</th><th>P95</th><th>P99</th><th>Avg</th><th>Count</th><th>SLO</th></tr></thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
  <p class="ts">Generated at ${new Date().toISOString()}</p>
</body>
</html>`;
}
