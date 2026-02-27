/**
 * HighLoad Flash Sale Platform — Stress & Soak Test
 * Week 7 Day 5: Load Testing & Performance Benchmarks
 *
 * Three test profiles in one script:
 *   1. Breaking-point  — ramp VUs until the system fails (error rate exceeds threshold)
 *   2. Spike           — flash-crowd burst simulating sale start
 *   3. Soak            — constant moderate load for extended time (memory-leak detection)
 *
 * k6 run tests/load/stress-test.js
 * k6 run tests/load/stress-test.js --env PROFILE=soak --env DURATION=20m
 */

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ─── Custom stress metrics ───────────────────────────────────────────────────

const requestLatency = new Trend('stress_request_latency', true);
const errorRate = new Rate('stress_error_rate');
const timeoutErrors = new Counter('stress_timeouts');
const connectionErrors = new Counter('stress_conn_errors');
const serverErrors = new Counter('stress_5xx_errors');
const clientErrors = new Counter('stress_4xx_errors');
const totalRequests = new Counter('stress_total_requests');
const recoveryLatency = new Trend('stress_recovery_latency', true);
const peakConcurrentVUs = new Gauge('stress_peak_vus');

// ─── Configuration ───────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const SALE_ID = __ENV.SALE_ID || 'perf-test-sale-001';
const PROFILE = __ENV.PROFILE || 'all'; // 'breakpoint' | 'spike' | 'soak' | 'all'
const DURATION = __ENV.DURATION || '10m';

// ─── Scenario definitions ────────────────────────────────────────────────────

function buildScenarios() {
  const scenarios = {};

  if (PROFILE === 'all' || PROFILE === 'breakpoint') {
    // Ramp until the system breaks (50 → 100 → 300 → 800 → 1500 → 2500)
    scenarios.breakpoint = {
      executor: 'ramping-vus',
      exec: 'stressRequests',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '30s', target: 100 },
        { duration: '1m', target: 300 },
        { duration: '1m', target: 800 },
        { duration: '1m', target: 1500 },
        { duration: '1m', target: 2500 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    };
  }

  if (PROFILE === 'all' || PROFILE === 'spike') {
    // Sudden burst: 50 → 3000 instant → hold → drop → recovery
    scenarios.spike = {
      executor: 'ramping-vus',
      exec: 'stressRequests',
      startVUs: 50,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '5s', target: 3000 },
        { duration: '1m', target: 3000 },
        { duration: '5s', target: 50 },
        { duration: '1m', target: 50 }, // recovery observation window
      ],
      startTime: PROFILE === 'all' ? '6m' : '0s',
    };
  }

  if (PROFILE === 'all' || PROFILE === 'soak') {
    // Constant moderate load for extended duration
    scenarios.soak = {
      executor: 'constant-vus',
      exec: 'stressRequests',
      vus: 200,
      duration: PROFILE === 'soak' ? DURATION : '10m',
      startTime: PROFILE === 'all' ? '9m' : '0s',
    };
  }

  return scenarios;
}

export const options = {
  scenarios: buildScenarios(),

  thresholds: {
    // Stress thresholds are deliberately looser than benchmark SLOs
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.15'],
    stress_error_rate: ['rate<0.20'],
    stress_request_latency: ['p(95)<2000'],
    stress_5xx_errors: ['count<500'],
  },
};

// ─── Weighted endpoints for mixed workload ───────────────────────────────────

const mixedEndpoints = new SharedArray('stressEndpoints', function () {
  return [
    { weight: 25, method: 'GET', path: '/products', auth: false },
    { weight: 20, method: 'GET', path: '/flash-sales/active', auth: false },
    { weight: 10, method: 'GET', path: '/flash-sales', auth: false },
    { weight: 10, method: 'GET', path: '/health/live', auth: false },
    { weight: 10, method: 'GET', path: '/products/search?q=flash', auth: false },
    { weight: 5, method: 'GET', path: `/flash-sales/${SALE_ID}`, auth: false },
    { weight: 5, method: 'GET', path: `/queue/length/${SALE_ID}`, auth: false },
    { weight: 5, method: 'GET', path: `/queue/stats/${SALE_ID}`, auth: false },
    { weight: 5, method: 'GET', path: '/products/categories/stats', auth: false },
    { weight: 5, method: 'GET', path: '/flash-sales/upcoming', auth: false },
  ];
});

const cumulativeWeights = (() => {
  let t = 0;
  return mixedEndpoints.map((e) => {
    t += e.weight;
    return t;
  });
})();
const totalWeight = cumulativeWeights[cumulativeWeights.length - 1];

function pickEndpoint() {
  const r = Math.random() * totalWeight;
  for (let i = 0; i < cumulativeWeights.length; i++) {
    if (r < cumulativeWeights[i]) return mixedEndpoints[i];
  }
  return mixedEndpoints[mixedEndpoints.length - 1];
}

// ─── Test users ──────────────────────────────────────────────────────────────

const users = new SharedArray('users', function () {
  const pool = [];
  for (let i = 0; i < 10000; i++) {
    pool.push({
      email: `stress-user-${i}@perf.test`,
      password: 'StressTest2026!',
    });
  }
  return pool;
});

// ─── Setup ───────────────────────────────────────────────────────────────────

export function setup() {
  console.log(`[setup] PROFILE=${PROFILE}  BASE_URL=${BASE_URL}  DURATION=${DURATION}`);

  // Verify the server is reachable
  const res = http.get(`${API}/health/live`, { timeout: '10s' });
  if (!check(res, { 'server reachable': (r) => r.status === 200 })) {
    fail('Server unreachable — aborting stress test');
  }

  return {
    profile: PROFILE,
    saleId: SALE_ID,
    startedAt: new Date().toISOString(),
    checkpoints: [],
  };
}

// ─── Main stress executor ────────────────────────────────────────────────────

export function stressRequests(data) {
  peakConcurrentVUs.add(__VU);

  const ep = pickEndpoint();
  const url = `${API}${ep.path}`;
  const params = {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: ep.path, scenario: __ENV.scenario || 'stress' },
    timeout: '10s',
  };

  const res = http.get(url, params);

  totalRequests.add(1);
  requestLatency.add(res.timings.duration);

  // ── Classify errors ────────────────────────────────────────────────────

  const ok = check(res, {
    'status < 500': (r) => r.status < 500,
    'latency < 5s': (r) => r.timings.duration < 5000,
  });

  if (!ok) {
    errorRate.add(1);
    categorizeError(res);
  } else {
    errorRate.add(0);
  }

  // Minimal think-time (stress tests push hard)
  sleep(Math.random() * 0.3);
}

// ─── Error categorisation ────────────────────────────────────────────────────

function categorizeError(res) {
  if (res.status === 0) {
    // Connection-level failure (timeout, refused, reset)
    if (res.error && res.error.includes('timeout')) {
      timeoutErrors.add(1);
    } else {
      connectionErrors.add(1);
    }
  } else if (res.status >= 500) {
    serverErrors.add(1);
  } else if (res.status >= 400) {
    clientErrors.add(1);
  }
}

// ─── Teardown ────────────────────────────────────────────────────────────────

export function teardown(data) {
  const elapsed = Date.now() - new Date(data.startedAt).getTime();
  console.log(`[teardown] Profile: ${data.profile} — completed in ${(elapsed / 1000).toFixed(1)}s`);
}

// ─── Summary handler ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const text = buildTextReport(data);
  const json = JSON.stringify(data, null, 2);
  const html = buildHtmlReport(data);

  return {
    stdout: text,
    'reports/stress-test.json': json,
    'reports/stress-test.html': html,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function v(data, name, stat) {
  try {
    return data.metrics[name].values[stat];
  } catch {
    return null;
  }
}

function f(val, dec) {
  return val !== null && val !== undefined ? Number(val).toFixed(dec || 2) : 'N/A';
}

function buildTextReport(data) {
  const totalReqs = v(data, 'http_reqs', 'count');
  const rps = v(data, 'http_reqs', 'rate');
  const failRate = v(data, 'stress_error_rate', 'rate');
  const p50 = v(data, 'http_req_duration', 'med');
  const p95 = v(data, 'http_req_duration', 'p(95)');
  const p99 = v(data, 'http_req_duration', 'p(99)');
  const maxLatency = v(data, 'http_req_duration', 'max');
  const timeouts = v(data, 'stress_timeouts', 'count');
  const connErrs = v(data, 'stress_conn_errors', 'count');
  const srvErrs = v(data, 'stress_5xx_errors', 'count');
  const cltErrs = v(data, 'stress_4xx_errors', 'count');

  const overall = failRate !== null && failRate < 0.15 ? 'PASS ✅' : 'FAIL ❌';

  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                  STRESS TEST REPORT — ${PROFILE.toUpperCase().padEnd(10)}                          ║
╚══════════════════════════════════════════════════════════════════════════════╝

  Overall Result ....... ${overall}

  ┌─ Throughput ────────────────────────────────────────────────────────────────┐
  │  Total Requests .... ${f(totalReqs, 0).padStart(10)}                                         │
  │  Requests/sec ...... ${f(rps).padStart(10)}                                         │
  │  Error Rate ........ ${f(failRate * 100, 2).padStart(9)}%                                         │
  └─────────────────────────────────────────────────────────────────────────────┘

  ┌─ Latency ──────────────────────────────────────────────────────────────────┐
  │  P50 ............... ${f(p50).padStart(10)} ms                                       │
  │  P95 ............... ${f(p95).padStart(10)} ms                                       │
  │  P99 ............... ${f(p99).padStart(10)} ms                                       │
  │  Max ............... ${f(maxLatency).padStart(10)} ms                                       │
  └─────────────────────────────────────────────────────────────────────────────┘

  ┌─ Error Breakdown ──────────────────────────────────────────────────────────┐
  │  Timeouts .......... ${f(timeouts, 0).padStart(10)}                                         │
  │  Connection Errors . ${f(connErrs, 0).padStart(10)}                                         │
  │  5xx Server Errors . ${f(srvErrs, 0).padStart(10)}                                         │
  │  4xx Client Errors . ${f(cltErrs, 0).padStart(10)}                                         │
  └─────────────────────────────────────────────────────────────────────────────┘
`;
}

function buildHtmlReport(data) {
  const totalReqs = v(data, 'http_reqs', 'count');
  const rps = v(data, 'http_reqs', 'rate');
  const failRate = v(data, 'stress_error_rate', 'rate') || 0;
  const p50 = v(data, 'http_req_duration', 'med');
  const p95 = v(data, 'http_req_duration', 'p(95)');
  const p99 = v(data, 'http_req_duration', 'p(99)');
  const maxLat = v(data, 'http_req_duration', 'max');
  const minLat = v(data, 'http_req_duration', 'min');
  const timeouts = v(data, 'stress_timeouts', 'count') || 0;
  const connErrs = v(data, 'stress_conn_errors', 'count') || 0;
  const srvErrs = v(data, 'stress_5xx_errors', 'count') || 0;
  const cltErrs = v(data, 'stress_4xx_errors', 'count') || 0;
  const overall = failRate < 0.15 ? 'PASS' : 'FAIL';
  const overallCls = failRate < 0.15 ? 'pass' : 'fail';

  const errorData = [
    { label: 'Timeouts', count: timeouts, cls: timeouts > 0 ? 'warn' : 'ok' },
    { label: 'Connection Errors', count: connErrs, cls: connErrs > 0 ? 'warn' : 'ok' },
    {
      label: '5xx Server Errors',
      count: srvErrs,
      cls: srvErrs > 100 ? 'fail' : srvErrs > 0 ? 'warn' : 'ok',
    },
    { label: '4xx Client Errors', count: cltErrs, cls: 'ok' },
  ];

  const errorRows = errorData
    .map((e) => `<tr><td>${e.label}</td><td class="${e.cls}">${f(e.count, 0)}</td></tr>`)
    .join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Stress Test Report — ${PROFILE}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
    h1{font-size:1.5rem;margin-bottom:.3rem;color:#38bdf8}
    h2{font-size:1rem;margin:1.5rem 0 .5rem;color:#94a3b8}
    .result{font-size:1.1rem;margin:.8rem 0 1.2rem;font-weight:700}
    .pass{color:#4ade80} .fail{color:#f87171} .warn{color:#fbbf24} .ok{color:#4ade80}
    .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:.8rem;margin:.8rem 0}
    .card{background:#1e293b;border-radius:8px;padding:.9rem;text-align:center}
    .card .val{font-size:1.3rem;font-weight:700;color:#f0f0f0}
    .card .label{font-size:.7rem;color:#64748b;margin-top:.25rem}
    table{width:100%;max-width:500px;border-collapse:collapse;margin-top:.5rem;font-size:.85rem}
    td{padding:.4rem .6rem;border-bottom:1px solid #1e293b}
    tr:hover{background:#1e293b}
    td:last-child{text-align:right;font-weight:600}
    .ts{font-size:.75rem;color:#64748b;margin-top:2rem}
  </style>
</head>
<body>
  <h1>🔥 Stress Test Report</h1>
  <p style="color:#64748b;font-size:.85rem">Profile: <strong>${PROFILE.toUpperCase()}</strong></p>
  <p class="result ${overallCls}">Overall: ${overall} ${overall === 'PASS' ? '✅' : '❌'}</p>

  <div class="cards">
    <div class="card"><div class="val">${f(totalReqs, 0)}</div><div class="label">Total Requests</div></div>
    <div class="card"><div class="val">${f(rps)}/s</div><div class="label">Throughput</div></div>
    <div class="card"><div class="val">${f(failRate * 100, 2)}%</div><div class="label">Error Rate</div></div>
    <div class="card"><div class="val">${f(p95)} ms</div><div class="label">P95 Latency</div></div>
  </div>

  <h2>Latency Distribution</h2>
  <div class="cards">
    <div class="card"><div class="val">${f(minLat)} ms</div><div class="label">Min</div></div>
    <div class="card"><div class="val">${f(p50)} ms</div><div class="label">P50</div></div>
    <div class="card"><div class="val">${f(p99)} ms</div><div class="label">P99</div></div>
    <div class="card"><div class="val">${f(maxLat)} ms</div><div class="label">Max</div></div>
  </div>

  <h2>Error Breakdown</h2>
  <table>
    <tbody>
      ${errorRows}
    </tbody>
  </table>

  <p class="ts">Generated at ${new Date().toISOString()}</p>
</body>
</html>`;
}
