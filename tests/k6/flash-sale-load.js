/**
 * K6 Performance Tests - Flash Sale Load Testing
 * Week 5 Day 7: Testing & Quality Assurance
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Custom metrics
const queueJoinLatency = new Trend('queue_join_latency');
const purchaseLatency = new Trend('purchase_latency');
const errorRate = new Rate('errors');
const successfulPurchases = new Counter('successful_purchases');
const failedPurchases = new Counter('failed_purchases');

// Configuration
export const options = {
  scenarios: {
    // Ramp up scenario
    flash_sale_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 }, // Ramp up to 100 users
        { duration: '1m', target: 500 }, // Ramp up to 500 users
        { duration: '2m', target: 1000 }, // Peak load - 1000 users
        { duration: '1m', target: 500 }, // Scale down
        { duration: '30s', target: 0 }, // Ramp down
      ],
      gracefulRampDown: '30s',
    },

    // Spike test scenario
    flash_sale_spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '5s', target: 2000 }, // Sudden spike
        { duration: '30s', target: 2000 }, // Hold spike
        { duration: '10s', target: 50 }, // Recovery
      ],
      startTime: '6m', // Start after ramp test
    },

    // Stress test scenario
    stress_test: {
      executor: 'constant-vus',
      vus: 500,
      duration: '5m',
      startTime: '10m',
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.05'],
    queue_join_latency: ['p(95)<200'],
    purchase_latency: ['p(95)<1000'],
    errors: ['rate<0.1'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SALE_ID = __ENV.SALE_ID || 'test-sale-1';

// Generate test users
const users = new SharedArray('users', function () {
  const userList = [];
  for (let i = 0; i < 10000; i++) {
    userList.push({
      email: `loadtest-user-${i}@test.com`,
      password: 'LoadTest123!',
      token: null,
    });
  }
  return userList;
});

// Setup function
export function setup() {
  // Create test flash sale
  const createSaleRes = http.post(
    `${BASE_URL}/api/admin/flash-sales`,
    JSON.stringify({
      name: 'Load Test Flash Sale',
      productId: 'test-product-1',
      discountPercentage: 50,
      quantity: 100,
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${__ENV.ADMIN_TOKEN}`,
      },
    }
  );

  return { saleId: SALE_ID };
}

// Main test function
export default function (data) {
  const user = users[__VU % users.length];
  let token = user.token;

  group('Authentication', () => {
    // Login if not authenticated
    if (!token) {
      const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({
          email: user.email,
          password: user.password,
        }),
        {
          headers: { 'Content-Type': 'application/json' },
        }
      );

      check(loginRes, {
        'login successful': (r) => r.status === 200,
        'token received': (r) => r.json('token') !== undefined,
      });

      if (loginRes.status === 200) {
        token = loginRes.json('token');
      } else {
        errorRate.add(1);
        return;
      }
    }
  });

  group('Browse Products', () => {
    const productsRes = http.get(`${BASE_URL}/api/products`);

    check(productsRes, {
      'products loaded': (r) => r.status === 200,
      'products data valid': (r) => Array.isArray(r.json()),
    });

    sleep(Math.random() * 2 + 0.5); // Random delay 0.5-2.5s
  });

  group('View Flash Sale', () => {
    const saleRes = http.get(`${BASE_URL}/api/flash-sales/${data.saleId}`);

    check(saleRes, {
      'flash sale loaded': (r) => r.status === 200,
      'sale is active': (r) => r.json('status') === 'active',
    });

    sleep(Math.random() * 1 + 0.5);
  });

  group('Join Queue', () => {
    const startTime = Date.now();

    const joinRes = http.post(`${BASE_URL}/api/queue/${data.saleId}/join`, null, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const latency = Date.now() - startTime;
    queueJoinLatency.add(latency);

    const success = check(joinRes, {
      'joined queue': (r) => r.status === 200 || r.status === 201,
      'position received': (r) => r.json('position') !== undefined,
    });

    if (!success) {
      errorRate.add(1);
    }

    sleep(Math.random() * 3 + 1); // Wait 1-4s
  });

  group('Check Queue Position', () => {
    const positionRes = http.get(`${BASE_URL}/api/queue/${data.saleId}/position`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    check(positionRes, {
      'position retrieved': (r) => r.status === 200,
      'valid position': (r) => r.json('position') >= 0,
    });

    sleep(Math.random() * 2 + 1);
  });

  group('Attempt Purchase', () => {
    const startTime = Date.now();

    const purchaseRes = http.post(
      `${BASE_URL}/api/orders`,
      JSON.stringify({
        saleId: data.saleId,
        productId: 'test-product-1',
        quantity: 1,
      }),
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const latency = Date.now() - startTime;
    purchaseLatency.add(latency);

    const success = check(purchaseRes, {
      'purchase request handled': (r) => [200, 201, 400, 409].includes(r.status),
    });

    if (purchaseRes.status === 200 || purchaseRes.status === 201) {
      successfulPurchases.add(1);
    } else {
      failedPurchases.add(1);
      if (purchaseRes.status >= 500) {
        errorRate.add(1);
      }
    }
  });

  sleep(Math.random() * 2 + 1);
}

// Teardown function
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Total successful purchases: ${successfulPurchases.name}`);
}

// Handle summary
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    'reports/load-test-summary.json': JSON.stringify(data),
    'reports/load-test-summary.html': htmlReport(data),
  };
}

function textSummary(data, options) {
  // Simple text summary
  return `
Flash Sale Load Test Results
=============================
Total Requests: ${data.metrics.http_reqs.values.count}
Failed Requests: ${data.metrics.http_req_failed.values.passes}
Avg Response Time: ${data.metrics.http_req_duration.values.avg.toFixed(2)}ms
P95 Response Time: ${data.metrics.http_req_duration.values['p(95)'].toFixed(2)}ms
P99 Response Time: ${data.metrics.http_req_duration.values['p(99)'].toFixed(2)}ms
`;
}

function htmlReport(data) {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Flash Sale Load Test Report</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    .metric { margin: 10px 0; padding: 10px; background: #f5f5f5; }
    .pass { color: green; }
    .fail { color: red; }
  </style>
</head>
<body>
  <h1>Flash Sale Load Test Report</h1>
  <div class="metric">
    <h3>HTTP Requests</h3>
    <p>Total: ${data.metrics.http_reqs?.values?.count || 'N/A'}</p>
    <p>Rate: ${data.metrics.http_reqs?.values?.rate?.toFixed(2) || 'N/A'}/s</p>
  </div>
  <div class="metric">
    <h3>Response Times</h3>
    <p>Average: ${data.metrics.http_req_duration?.values?.avg?.toFixed(2) || 'N/A'}ms</p>
    <p>P95: ${data.metrics.http_req_duration?.values['p(95)']?.toFixed(2) || 'N/A'}ms</p>
    <p>P99: ${data.metrics.http_req_duration?.values['p(99)']?.toFixed(2) || 'N/A'}ms</p>
  </div>
  <div class="metric">
    <h3>Queue Performance</h3>
    <p>Join Latency P95: ${data.metrics.queue_join_latency?.values['p(95)']?.toFixed(2) || 'N/A'}ms</p>
    <p>Purchase Latency P95: ${data.metrics.purchase_latency?.values['p(95)']?.toFixed(2) || 'N/A'}ms</p>
  </div>
</body>
</html>
`;
}
