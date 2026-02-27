/**
 * HighLoad Flash Sale Platform — Flash Sale Purchase Flow Load Test
 * Week 7 Day 5: Load Testing & Performance Benchmarks
 *
 * Simulates the complete flash-sale user journey under realistic load:
 *   1. Authenticate (login)
 *   2. Browse active flash sales
 *   3. View individual sale detail (with inventory)
 *   4. Join queue
 *   5. Poll queue position
 *   6. Initiate checkout
 *   7. Confirm payment
 *
 * k6 run tests/load/flash-sale-load.js
 * k6 run tests/load/flash-sale-load.js --env ENV=staging
 */

import http from 'k6/http';
import { check, sleep, group, fail } from 'k6';
import { Counter, Rate, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ─── Custom metrics ──────────────────────────────────────────────────────────

const loginLatency = new Trend('flash_login_latency', true);
const saleListLatency = new Trend('flash_sale_list_latency', true);
const saleDetailLatency = new Trend('flash_sale_detail_latency', true);
const queueJoinLatency = new Trend('flash_queue_join_latency', true);
const queuePositionLatency = new Trend('flash_queue_position_latency', true);
const checkoutLatency = new Trend('flash_checkout_latency', true);
const paymentLatency = new Trend('flash_payment_latency', true);

const successfulPurchases = new Counter('flash_successful_purchases');
const failedPurchases = new Counter('flash_failed_purchases');
const outOfStockErrors = new Counter('flash_out_of_stock');
const errorRate = new Rate('flash_errors');
const activeVUs = new Gauge('flash_active_vus');

// ─── Config ──────────────────────────────────────────────────────────────────

const ENV = __ENV.ENV || 'local';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API = `${BASE_URL}/api/v1`;
const SALE_ID = __ENV.SALE_ID || 'perf-test-sale-001';

// ─── Load test scenarios ─────────────────────────────────────────────────────

export const options = {
  scenarios: {
    // ── Ramp: 0 → 50 → 200 → 500 → 1000 ──────────────────────────────────
    purchase_ramp: {
      executor: 'ramping-vus',
      exec: 'purchaseFlow',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 50 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 500 },
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 500 },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },

    // ── Burst: sudden spike to 2000 VUs ────────────────────────────────────
    purchase_burst: {
      executor: 'ramping-vus',
      exec: 'purchaseFlow',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '5s', target: 2000 },
        { duration: '30s', target: 2000 },
        { duration: '10s', target: 50 },
      ],
      startTime: '6m30s',
    },
  },

  thresholds: {
    // SLO-level thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1500'],
    http_req_failed: ['rate<0.05'],
    flash_errors: ['rate<0.10'],
    flash_login_latency: ['p(95)<400'],
    flash_queue_join_latency: ['p(95)<300'],
    flash_checkout_latency: ['p(95)<1000'],
    flash_payment_latency: ['p(95)<1500'],
    flash_sale_detail_latency: ['p(95)<250'],
  },
};

// ─── Shared test users ───────────────────────────────────────────────────────

const users = new SharedArray('users', function () {
  const pool = [];
  for (let i = 0; i < 10000; i++) {
    pool.push({
      email: `loadtest-user-${i}@perf.test`,
      password: 'LoadTest2026!',
    });
  }
  return pool;
});

// ─── Helper: headers ─────────────────────────────────────────────────────────

function jsonHeaders(token) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return { headers: h };
}

// ─── Setup (runs once) ──────────────────────────────────────────────────────

export function setup() {
  console.log(`[setup] ENV=${ENV}  BASE_URL=${BASE_URL}  SALE_ID=${SALE_ID}`);

  // Smoke check: health endpoint must respond
  const healthRes = http.get(`${API}/health/live`);
  if (!check(healthRes, { 'health endpoint ok': (r) => r.status === 200 })) {
    fail('Target server is not reachable — aborting load test');
  }

  return { saleId: SALE_ID, startedAt: new Date().toISOString() };
}

// ─── Default + named export: purchase flow ───────────────────────────────────

export default function (data) {
  purchaseFlow(data);
}

export function purchaseFlow(data) {
  const user = users[__VU % users.length];
  activeVUs.add(__VU);

  let token = null;

  // ── Step 1: Login ────────────────────────────────────────────────────────

  group('01 — Login', () => {
    const res = http.post(
      `${API}/auth/login`,
      JSON.stringify({ email: user.email, password: user.password }),
      jsonHeaders(),
    );

    loginLatency.add(res.timings.duration);

    const ok = check(res, {
      'login: 200': (r) => r.status === 200,
      'login: token received': (r) => {
        try {
          return !!r.json('data').accessToken;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      try {
        token = res.json('data').accessToken;
      } catch {
        /* noop */
      }
    } else {
      errorRate.add(1);
      return;
    }
  });

  if (!token) return;

  // ── Step 2: Browse active sales ──────────────────────────────────────────

  group('02 — Browse active sales', () => {
    const res = http.get(`${API}/flash-sales/active`, jsonHeaders(token));

    saleListLatency.add(res.timings.duration);

    check(res, {
      'active sales: 200': (r) => r.status === 200,
      'active sales: array': (r) => {
        try {
          return Array.isArray(r.json('data'));
        } catch {
          return false;
        }
      },
    });

    sleep(randBetween(0.5, 1.5)); // think-time: browsing
  });

  // ── Step 3: View sale detail ─────────────────────────────────────────────

  group('03 — View sale detail', () => {
    const res = http.get(`${API}/flash-sales/${data.saleId}`, jsonHeaders(token));

    saleDetailLatency.add(res.timings.duration);

    check(res, {
      'sale detail: 200': (r) => r.status === 200,
      'sale detail: has data': (r) => {
        try {
          return !!r.json('data');
        } catch {
          return false;
        }
      },
    });

    sleep(randBetween(0.3, 1.0));
  });

  // ── Step 4: Join queue ───────────────────────────────────────────────────

  group('04 — Join queue', () => {
    const res = http.post(`${API}/queue/join/${data.saleId}`, null, jsonHeaders(token));

    queueJoinLatency.add(res.timings.duration);

    const ok = check(res, {
      'queue join: 2xx': (r) => r.status >= 200 && r.status < 300,
    });

    if (!ok) errorRate.add(1);
    sleep(randBetween(1, 3)); // wait for admission
  });

  // ── Step 5: Poll queue position ──────────────────────────────────────────

  group('05 — Check position', () => {
    const res = http.get(`${API}/queue/position/${data.saleId}`, jsonHeaders(token));

    queuePositionLatency.add(res.timings.duration);

    check(res, {
      'position: 200': (r) => r.status === 200,
    });

    sleep(randBetween(1, 2)); // simulated wait
  });

  // ── Step 6: Initiate checkout ────────────────────────────────────────────

  group('06 — Initiate checkout', () => {
    const payload = JSON.stringify({
      saleId: data.saleId,
      productId: 'perf-test-product-001',
      quantity: '1',
    });

    const res = http.post(`${API}/orders/checkout`, payload, jsonHeaders(token));

    checkoutLatency.add(res.timings.duration);

    const ok = check(res, {
      'checkout: 201': (r) => r.status === 201,
      'checkout: orderId': (r) => {
        try {
          return !!r.json('data').orderId;
        } catch {
          return false;
        }
      },
    });

    if (ok) {
      try {
        const orderId = res.json('data').orderId;

        // ── Step 7: Process payment ────────────────────────────────────────
        group('07 — Process payment', () => {
          const payRes = http.post(
            `${API}/orders/payment`,
            JSON.stringify({
              orderId: orderId,
              paymentMethod: 'card',
              cardLast4: '4242',
            }),
            jsonHeaders(token),
          );

          paymentLatency.add(payRes.timings.duration);

          const payOk = check(payRes, {
            'payment: 200': (r) => r.status === 200,
          });

          if (payOk) {
            successfulPurchases.add(1);
          } else {
            failedPurchases.add(1);
          }
        });
      } catch {
        failedPurchases.add(1);
      }
    } else {
      failedPurchases.add(1);
      // Check if it's an inventory issue
      try {
        const body = JSON.parse(res.body);
        if (body.error && body.error.toLowerCase().includes('out of stock')) {
          outOfStockErrors.add(1);
        }
      } catch {
        /* json parse fail — ignore */
      }
    }
  });

  sleep(randBetween(1, 3)); // inter-iteration delay
}

// ─── Teardown ────────────────────────────────────────────────────────────────

export function teardown(data) {
  const elapsedMs = Date.now() - new Date(data.startedAt).getTime();
  console.log(`[teardown] Finished in ${(elapsedMs / 1000).toFixed(1)}s`);
}

// ─── Summary handler ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = buildTextSummary(data);
  const json = JSON.stringify(data, null, 2);
  const html = buildHtmlReport(data);

  return {
    stdout: summary,
    'reports/flash-sale-load.json': json,
    'reports/flash-sale-load.html': html,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function randBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function metric(data, name, stat) {
  try {
    return data.metrics[name].values[stat];
  } catch {
    return null;
  }
}

function fmt(val, dec) {
  return val !== null && val !== undefined ? val.toFixed(dec || 2) : 'N/A';
}

function buildTextSummary(data) {
  return `
╔══════════════════════════════════════════════════════════════════════╗
║           FLASH SALE LOAD TEST — RESULTS SUMMARY                   ║
╚══════════════════════════════════════════════════════════════════════╝

  Total HTTP Requests .... ${fmt(metric(data, 'http_reqs', 'count'), 0)}
  Request Rate ........... ${fmt(metric(data, 'http_reqs', 'rate'))}/s
  Failed Requests ........ ${fmt(metric(data, 'http_req_failed', 'passes'), 0)}

  ┌─────────────────────────────────────────────────────────────────┐
  │ Response Times                                                  │
  ├─────────────────────────────────────────────────────────────────┤
  │  Average ............. ${fmt(metric(data, 'http_req_duration', 'avg'))} ms               │
  │  Median (p50) ....... ${fmt(metric(data, 'http_req_duration', 'med'))} ms               │
  │  P95 ................. ${fmt(metric(data, 'http_req_duration', 'p(95)'))} ms               │
  │  P99 ................. ${fmt(metric(data, 'http_req_duration', 'p(99)'))} ms               │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │ Flash Sale Metrics                                              │
  ├─────────────────────────────────────────────────────────────────┤
  │  Login P95 ........... ${fmt(metric(data, 'flash_login_latency', 'p(95)'))} ms               │
  │  Queue Join P95 ...... ${fmt(metric(data, 'flash_queue_join_latency', 'p(95)'))} ms               │
  │  Checkout P95 ........ ${fmt(metric(data, 'flash_checkout_latency', 'p(95)'))} ms               │
  │  Payment P95 ......... ${fmt(metric(data, 'flash_payment_latency', 'p(95)'))} ms               │
  │  Successful Purchases  ${fmt(metric(data, 'flash_successful_purchases', 'count'), 0)}                     │
  │  Failed Purchases .... ${fmt(metric(data, 'flash_failed_purchases', 'count'), 0)}                     │
  │  Out of Stock ........ ${fmt(metric(data, 'flash_out_of_stock', 'count'), 0)}                     │
  └─────────────────────────────────────────────────────────────────┘
`;
}

function buildHtmlReport(data) {
  const rows = [
    ['Total Requests', fmt(metric(data, 'http_reqs', 'count'), 0)],
    ['Request Rate', fmt(metric(data, 'http_reqs', 'rate')) + '/s'],
    ['Failed %', fmt(metric(data, 'http_req_failed', 'rate') * 100, 2) + '%'],
    ['Avg Latency', fmt(metric(data, 'http_req_duration', 'avg')) + ' ms'],
    ['P50 Latency', fmt(metric(data, 'http_req_duration', 'med')) + ' ms'],
    ['P95 Latency', fmt(metric(data, 'http_req_duration', 'p(95)')) + ' ms'],
    ['P99 Latency', fmt(metric(data, 'http_req_duration', 'p(99)')) + ' ms'],
    ['Login P95', fmt(metric(data, 'flash_login_latency', 'p(95)')) + ' ms'],
    ['Queue Join P95', fmt(metric(data, 'flash_queue_join_latency', 'p(95)')) + ' ms'],
    ['Checkout P95', fmt(metric(data, 'flash_checkout_latency', 'p(95)')) + ' ms'],
    ['Payment P95', fmt(metric(data, 'flash_payment_latency', 'p(95)')) + ' ms'],
    ['Successful Purchases', fmt(metric(data, 'flash_successful_purchases', 'count'), 0)],
    ['Failed Purchases', fmt(metric(data, 'flash_failed_purchases', 'count'), 0)],
    ['Out of Stock', fmt(metric(data, 'flash_out_of_stock', 'count'), 0)],
  ];

  const tableRows = rows
    .map(([k, v]) => `<tr><td>${k}</td><td><strong>${v}</strong></td></tr>`)
    .join('\n        ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Flash Sale Load Test Report</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:#0f172a;color:#e2e8f0;padding:2rem}
    h1{font-size:1.6rem;margin-bottom:1rem;color:#38bdf8}
    table{width:100%;max-width:700px;border-collapse:collapse;margin-top:1rem}
    td{padding:.6rem 1rem;border-bottom:1px solid #1e293b}
    tr:hover{background:#1e293b}
    td:first-child{color:#94a3b8}
    td:last-child{text-align:right}
    .pass{color:#4ade80} .fail{color:#f87171}
    .badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:.75rem;font-weight:600}
    .badge.ok{background:#166534;color:#4ade80} .badge.warn{background:#854d0e;color:#fbbf24}
    .ts{font-size:.75rem;color:#64748b;margin-top:2rem}
  </style>
</head>
<body>
  <h1>⚡ Flash Sale Load Test Report</h1>
  <table>
    <tbody>
        ${tableRows}
    </tbody>
  </table>
  <p class="ts">Generated at ${new Date().toISOString()}</p>
</body>
</html>`;
}
