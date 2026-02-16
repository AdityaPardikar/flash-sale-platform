/**
 * K6 API Stress Test
 * Week 5 Day 7: Testing & Quality Assurance
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

export const options = {
  scenarios: {
    // Constant load for API endpoints
    api_endpoints: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },

  thresholds: {
    http_req_duration: ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    errors: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

const endpoints = [
  { method: 'GET', path: '/api/products', weight: 30 },
  { method: 'GET', path: '/api/flash-sales', weight: 25 },
  { method: 'GET', path: '/api/flash-sales/active', weight: 20 },
  { method: 'GET', path: '/api/health', weight: 10 },
  { method: 'GET', path: '/api/products?page=1&limit=20', weight: 15 },
];

function selectEndpoint() {
  const totalWeight = endpoints.reduce((sum, e) => sum + e.weight, 0);
  let random = Math.random() * totalWeight;

  for (const endpoint of endpoints) {
    random -= endpoint.weight;
    if (random <= 0) return endpoint;
  }

  return endpoints[0];
}

export default function () {
  const endpoint = selectEndpoint();
  const url = `${BASE_URL}${endpoint.path}`;

  const startTime = Date.now();

  const res =
    endpoint.method === 'GET'
      ? http.get(url)
      : http.post(url, JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json' },
        });

  const latency = Date.now() - startTime;
  apiLatency.add(latency);

  const success = check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  if (!success) {
    errorRate.add(1);
  }

  sleep(Math.random() * 0.5);
}
