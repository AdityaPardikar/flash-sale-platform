# Flash Sale Platform — API Reference

> **Version:** 1.0.0  
> **Base URL:** `http://localhost:3000/api/v1`  
> **Protocol:** REST over HTTP/1.1  
> **Content-Type:** `application/json`  
> **Real-Time:** Socket.IO (WebSocket + polling fallback)

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [Products](#2-products)
3. [Flash Sales](#3-flash-sales)
4. [Queue](#4-queue)
5. [Orders](#5-orders)
6. [Payments](#6-payments)
7. [Cart](#7-cart)
8. [Health & Readiness](#8-health--readiness)
9. [Privacy / GDPR](#9-privacy--gdpr)
10. [Metrics & Observability](#10-metrics--observability)
11. [Analytics](#11-analytics)
12. [Admin](#12-admin)
13. [WebSocket Events](#13-websocket-events)
14. [Error Handling](#14-error-handling)
15. [Rate Limiting](#15-rate-limiting)

---

## Authentication Overview

Most endpoints require a Bearer token obtained via `/auth/login`. Include it in the `Authorization` header:

```
Authorization: Bearer <accessToken>
```

Admin endpoints additionally require admin-level authentication and specific permissions.

---

## 1. Authentication

| Method | Endpoint         | Auth | Description          |
| ------ | ---------------- | ---- | -------------------- |
| POST   | `/auth/register` | No   | Register a new user  |
| POST   | `/auth/login`    | No   | User login           |
| POST   | `/auth/logout`   | Yes  | User logout          |
| POST   | `/auth/refresh`  | Yes  | Refresh access token |

### POST `/auth/register`

```json
// Request
{ "email": "user@example.com", "username": "johndoe", "password": "securePass123" }

// Response 201
{ "message": "Registration successful", "data": { "id": "uuid", "email": "user@example.com", "username": "johndoe", "created_at": "2025-01-01T00:00:00Z" } }
```

### POST `/auth/login`

```json
// Request
{ "email": "user@example.com", "password": "securePass123" }

// Response 200
{ "message": "Login successful", "data": { "user": { "id": "uuid", "email": "..." }, "accessToken": "jwt...", "refreshToken": "jwt..." } }
```

### POST `/auth/refresh`

```json
// Request
{ "refreshToken": "jwt..." }

// Response 200
{ "message": "Token refreshed", "data": { "accessToken": "jwt..." } }
```

---

## 2. Products

| Method | Endpoint                       | Auth | Description                    |
| ------ | ------------------------------ | ---- | ------------------------------ |
| GET    | `/products`                    | No   | List products (with filtering) |
| GET    | `/products/search?q=keyword`   | No   | Search products                |
| GET    | `/products/categories/stats`   | No   | Product count by category      |
| GET    | `/products/category/:category` | No   | Products by category           |
| GET    | `/products/:id`                | No   | Get single product             |
| POST   | `/products`                    | Yes  | Create product                 |
| PUT    | `/products/:id`                | Yes  | Update product                 |
| DELETE | `/products/:id`                | Yes  | Delete product                 |

### GET `/products`

**Query Parameters:**

- `category` — Filter by category
- `minPrice` / `maxPrice` — Price range filter
- `limit` (default: 50) / `offset` (default: 0) — Pagination

```json
// Response 200
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Gaming Headset",
      "description": "...",
      "base_price": 99.99,
      "category": "electronics",
      "image_url": "..."
    }
  ],
  "count": 42
}
```

### POST `/products`

```json
// Request (Auth required)
{ "name": "Gaming Headset", "description": "Premium wireless headset", "base_price": 99.99, "category": "electronics", "image_url": "https://..." }

// Response 201
{ "success": true, "data": { "id": "uuid", "name": "Gaming Headset", "..." }, "message": "Product created" }
```

---

## 3. Flash Sales

| Method | Endpoint                      | Auth | Description              |
| ------ | ----------------------------- | ---- | ------------------------ |
| GET    | `/flash-sales`                | No   | List all flash sales     |
| GET    | `/flash-sales/active`         | No   | Currently active sales   |
| GET    | `/flash-sales/upcoming`       | No   | Upcoming sales           |
| GET    | `/flash-sales/:id`            | No   | Sale details + inventory |
| GET    | `/flash-sales/:id/statistics` | Yes  | Sale statistics          |
| POST   | `/flash-sales`                | Yes  | Create flash sale        |
| PUT    | `/flash-sales/:id`            | Yes  | Update flash sale        |
| DELETE | `/flash-sales/:id/cancel`     | Yes  | Cancel flash sale        |

### GET `/flash-sales/active`

```json
// Response 200
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "product_id": "uuid",
      "flash_price": 49.99,
      "quantity_available": 100,
      "quantity_sold": 23,
      "start_time": "...",
      "end_time": "...",
      "status": "active",
      "timeRemaining": 3600000
    }
  ],
  "count": 2
}
```

### POST `/flash-sales`

```json
// Request (Auth required)
{ "product_id": "uuid", "flash_price": 49.99, "quantity_available": 100, "start_time": "2025-06-01T10:00:00Z", "end_time": "2025-06-01T12:00:00Z" }

// Response 201
{ "success": true, "data": { "id": "uuid", "..." }, "message": "Flash sale created" }
```

---

## 4. Queue

| Method | Endpoint                  | Auth  | Description        |
| ------ | ------------------------- | ----- | ------------------ |
| GET    | `/queue/length/:saleId`   | No    | Queue length       |
| GET    | `/queue/stats/:saleId`    | No    | Queue statistics   |
| POST   | `/queue/join/:saleId`     | Yes   | Join the queue     |
| DELETE | `/queue/leave/:saleId`    | Yes   | Leave the queue    |
| GET    | `/queue/position/:saleId` | Yes   | Get your position  |
| GET    | `/queue/my-queues`        | Yes   | Your queue history |
| GET    | `/queue/users/:saleId`    | Admin | All users in queue |
| DELETE | `/queue/clear/:saleId`    | Admin | Clear entire queue |
| POST   | `/queue/admit/:saleId`    | Admin | Admit next batch   |

### POST `/queue/join/:saleId`

```json
// Response 201
{ "success": true, "message": "Joined queue", "data": { "position": 42, "estimatedWait": 120000 } }
```

### POST `/queue/admit/:saleId`

```json
// Request (Admin)
{ "batchSize": 10 }

// Response 200
{ "success": true, "message": "Users admitted", "data": { "admittedUsers": ["user1", "user2"], "count": 2 } }
```

---

## 5. Orders

| Method | Endpoint                      | Auth    | Description             |
| ------ | ----------------------------- | ------- | ----------------------- |
| POST   | `/orders/checkout`            | Yes     | Initiate checkout       |
| POST   | `/orders/payment`             | Yes     | Process payment         |
| GET    | `/orders`                     | Yes     | List user's orders      |
| GET    | `/orders/:orderId`            | Yes     | Order details           |
| GET    | `/orders/:orderId/history`    | Yes     | Order with full history |
| POST   | `/orders/:orderId/cancel`     | Yes     | Cancel order            |
| POST   | `/orders/:orderId/refund`     | Yes     | Request refund          |
| GET    | `/orders/sale/:saleId/orders` | Admin   | Orders by sale          |
| GET    | `/orders/sale/:saleId/stats`  | Admin   | Order stats by sale     |
| POST   | `/orders/webhook/payment`     | Webhook | Payment callback        |

---

## 6. Payments

| Method | Endpoint                     | Auth    | Description                          |
| ------ | ---------------------------- | ------- | ------------------------------------ |
| POST   | `/payments/create-intent`    | Yes     | Create payment intent                |
| POST   | `/payments/confirm`          | Yes     | Confirm payment                      |
| POST   | `/payments/refund`           | Yes     | Process refund                       |
| GET    | `/payments/history`          | Yes     | Payment history                      |
| GET    | `/payments/methods`          | Yes     | Payment methods                      |
| POST   | `/payments/:paymentId/retry` | Yes     | Retry failed payment                 |
| GET    | `/payments/:paymentId`       | Yes     | Get payment details                  |
| POST   | `/payments/webhook`          | Webhook | Payment webhook (signature verified) |

---

## 7. Cart

All cart routes support both guest (session-based) and authenticated users.

| Method | Endpoint                 | Auth     | Description               |
| ------ | ------------------------ | -------- | ------------------------- |
| GET    | `/cart`                  | Optional | Get current cart          |
| GET    | `/cart/summary`          | Optional | Cart summary              |
| POST   | `/cart/items`            | Optional | Add item to cart          |
| PATCH  | `/cart/items/:productId` | Optional | Update item quantity      |
| DELETE | `/cart/items/:productId` | Optional | Remove item               |
| DELETE | `/cart`                  | Optional | Clear entire cart         |
| POST   | `/cart/validate`         | Optional | Validate for checkout     |
| POST   | `/cart/reserve`          | Optional | Reserve inventory         |
| POST   | `/cart/release`          | Optional | Release reservation       |
| POST   | `/cart/migrate`          | Yes      | Migrate guest → user cart |

---

## 8. Health & Readiness

| Method | Endpoint           | Description                |
| ------ | ------------------ | -------------------------- |
| GET    | `/health`          | Overall system health      |
| GET    | `/health/live`     | Kubernetes liveness probe  |
| GET    | `/health/ready`    | Kubernetes readiness probe |
| GET    | `/health/database` | PostgreSQL health          |
| GET    | `/health/redis`    | Redis health               |
| GET    | `/health/services` | All services status        |
| GET    | `/health/metrics`  | API performance metrics    |

### GET `/health`

```json
// Response 200
{
  "status": "healthy",
  "uptime": 86400,
  "timestamp": "2025-06-01T00:00:00Z",
  "services": { "database": "healthy", "redis": "healthy" }
}
```

### GET `/health/ready`

Returns `200` when ready, `503` when not ready. Suitable for Kubernetes readiness probes.

---

## 9. Privacy / GDPR

All endpoints require authentication.

| Method | Endpoint                             | Description              |
| ------ | ------------------------------------ | ------------------------ |
| GET    | `/privacy/consents`                  | Get user consents        |
| POST   | `/privacy/consents`                  | Update consent           |
| POST   | `/privacy/consents/withdraw-all`     | Withdraw all consents    |
| POST   | `/privacy/export`                    | Request data export      |
| GET    | `/privacy/export`                    | List exports             |
| GET    | `/privacy/export/:exportId`          | Export status            |
| GET    | `/privacy/export/:exportId/download` | Download export          |
| POST   | `/privacy/deletion`                  | Request account deletion |
| GET    | `/privacy/deletion`                  | Deletion status          |
| GET    | `/privacy/report`                    | Privacy report           |
| GET    | `/privacy/retention-policies`        | Data retention policies  |

---

## 10. Metrics & Observability

| Method | Endpoint                   | Description                   |
| ------ | -------------------------- | ----------------------------- |
| GET    | `/metrics`                 | Prometheus exposition format  |
| GET    | `/metrics/json`            | JSON metrics snapshot         |
| GET    | `/metrics/traces`          | Recent traces                 |
| GET    | `/metrics/traces/slow`     | Slow spans (`?threshold=100`) |
| GET    | `/metrics/traces/errors`   | Error spans                   |
| GET    | `/metrics/traces/:traceId` | Spans for specific trace      |

### GET `/metrics`

Returns Prometheus text exposition format:

```
# HELP http_requests_total Total number of HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",route="/api/v1/products",status_code="200"} 1523
```

### GET `/metrics/json`

```json
{
  "timestamp": "...",
  "uptime": 86400,
  "memory": { "heapUsed": 52428800, "heapTotal": 73400320, "rss": 94371840 },
  "http": { "totalRequests": 15230, "totalErrors": 12, "activeConnections": 42 },
  "database": { "totalQueries": 8901, "activeConnections": 5, "idleConnections": 15 },
  "redis": { "totalCommands": 45600, "totalErrors": 0 },
  "business": { "totalOrders": 342, "totalRevenue": 15678.5, "activeSales": 3 }
}
```

---

## 11. Analytics

All endpoints require authentication.

| Method | Endpoint                        | Query Params                                   | Description                              |
| ------ | ------------------------------- | ---------------------------------------------- | ---------------------------------------- |
| GET    | `/analytics/executive-summary`  | `startDate, endDate`                           | Executive summary                        |
| GET    | `/analytics/revenue`            | `startDate, endDate, compareStart, compareEnd` | Revenue with comparison                  |
| GET    | `/analytics/sale-performance`   | `startDate, endDate, limit`                    | Sale performance                         |
| GET    | `/analytics/user-retention`     | `startDate, endDate`                           | User retention                           |
| GET    | `/analytics/traffic`            | `startDate, endDate`                           | Traffic patterns                         |
| GET    | `/analytics/inventory-turnover` | `startDate, endDate`                           | Inventory turnover                       |
| GET    | `/analytics/export/:type`       | `startDate, endDate`                           | CSV export (`revenue`, `sales`, `users`) |

---

## 12. Admin

All admin routes require admin authentication. Most require specific permissions.

### 12a. Admin Authentication

| Method | Endpoint                 | Description           |
| ------ | ------------------------ | --------------------- |
| POST   | `/admin/auth/login`      | Admin login           |
| POST   | `/admin/auth/logout`     | Admin logout          |
| POST   | `/admin/auth/refresh`    | Refresh token         |
| GET    | `/admin/auth/me`         | Current admin profile |
| POST   | `/admin/auth/2fa/enable` | Enable 2FA            |
| POST   | `/admin/auth/2fa/verify` | Verify 2FA token      |

### 12b. Dashboard

| Method | Endpoint             | Permission | Description        |
| ------ | -------------------- | ---------- | ------------------ |
| GET    | `/admin/overview`    | —          | Dashboard overview |
| GET    | `/admin/stats/today` | —          | Today's stats      |

### 12c. Sales Management

| Method | Endpoint                       | Permission       | Description    |
| ------ | ------------------------------ | ---------------- | -------------- |
| GET    | `/admin/sales`                 | `VIEW_ANALYTICS` | List all sales |
| GET    | `/admin/sales/metrics`         | `VIEW_ANALYTICS` | Sales metrics  |
| POST   | `/admin/sales`                 | `CREATE_SALE`    | Create sale    |
| PUT    | `/admin/sales/:id`             | `EDIT_SALE`      | Update sale    |
| PATCH  | `/admin/sales/:saleId/status`  | `EDIT_SALE`      | Update status  |
| DELETE | `/admin/sales/:id`             | `DELETE_SALE`    | Delete sale    |
| GET    | `/admin/sales/:saleId/metrics` | `VIEW_ANALYTICS` | Live metrics   |

### 12d. Queue Management

| Method | Endpoint                             | Permission     | Description          |
| ------ | ------------------------------------ | -------------- | -------------------- |
| GET    | `/admin/queues`                      | `MANAGE_QUEUE` | Active queues        |
| GET    | `/admin/sales/:saleId/queue`         | `MANAGE_QUEUE` | Queue for sale       |
| POST   | `/admin/queues/:saleId/admit`        | `ADMIT_USERS`  | Admit users          |
| POST   | `/admin/queue/remove`                | `MANAGE_QUEUE` | Remove user          |
| DELETE | `/admin/queues/:saleId/user/:userId` | `MANAGE_QUEUE` | Remove specific user |

### 12e. User Management

| Method | Endpoint                        | Permission   | Description   |
| ------ | ------------------------------- | ------------ | ------------- |
| GET    | `/admin/users`                  | `VIEW_USERS` | List users    |
| GET    | `/admin/users/:id`              | `VIEW_USERS` | User details  |
| GET    | `/admin/users/:userId/activity` | `VIEW_USERS` | Activity logs |
| PATCH  | `/admin/users/:id/status`       | `EDIT_USERS` | Update status |

### 12f. Order Management

| Method | Endpoint                   | Permission      | Description   |
| ------ | -------------------------- | --------------- | ------------- |
| GET    | `/admin/orders`            | `VIEW_ORDERS`   | List orders   |
| PATCH  | `/admin/orders/:id/status` | `CANCEL_ORDERS` | Update status |
| POST   | `/admin/orders/:id/cancel` | `CANCEL_ORDERS` | Cancel order  |

### 12g. Analytics

| Method | Endpoint                     | Permission       | Description        |
| ------ | ---------------------------- | ---------------- | ------------------ |
| GET    | `/admin/analytics/sales`     | `VIEW_ANALYTICS` | Sales analytics    |
| GET    | `/admin/analytics/users`     | `VIEW_ANALYTICS` | User analytics     |
| GET    | `/admin/analytics/queue`     | `VIEW_ANALYTICS` | Queue analytics    |
| GET    | `/admin/analytics/funnel`    | `VIEW_ANALYTICS` | Conversion funnel  |
| GET    | `/admin/analytics/revenue`   | `VIEW_ANALYTICS` | Revenue analytics  |
| GET    | `/admin/analytics/events`    | `VIEW_ANALYTICS` | Raw events         |
| GET    | `/admin/reports/performance` | `VIEW_ANALYTICS` | Performance report |

### 12h. System Administration (Super Admin)

| Method | Endpoint                   | Description      |
| ------ | -------------------------- | ---------------- |
| GET    | `/admin/system/admins`     | List admin users |
| POST   | `/admin/system/admins`     | Create admin     |
| PATCH  | `/admin/system/admins/:id` | Update admin     |

---

## 13. WebSocket Events

**Connection URL:** `ws://localhost:3000`  
**Namespaces:** `/` (default), `/queue`, `/notifications`, `/admin`

### Authentication

```javascript
const socket = io('http://localhost:3000', {
  auth: { userId: 'user-uuid', token: 'jwt-token' },
});
```

### Client → Server Events

| Event               | Namespace | Payload               | Description                       |
| ------------------- | --------- | --------------------- | --------------------------------- |
| `join:sale`         | `/`       | `saleId: string`      | Join a sale room for live updates |
| `leave:sale`        | `/`       | `saleId: string`      | Leave a sale room                 |
| `subscribe:queue`   | `/queue`  | `{ saleId, userId? }` | Subscribe to queue updates        |
| `unsubscribe:queue` | `/queue`  | `{ saleId }`          | Unsubscribe from queue            |
| `heartbeat`         | `/`       | —                     | Client heartbeat                  |

### Server → Client Events

| Event               | Description                              |
| ------------------- | ---------------------------------------- |
| `client:connected`  | Connection confirmed with `socketId`     |
| `heartbeat:ack`     | Heartbeat acknowledgement with timestamp |
| `sale:started`      | Flash sale has started                   |
| `sale:ended`        | Flash sale has ended                     |
| `sale:updated`      | Sale details updated                     |
| `sale:countdown`    | Countdown timer tick                     |
| `inventory:updated` | Inventory count changed                  |
| `inventory:low`     | Low stock warning                        |
| `inventory:soldout` | Item sold out                            |
| `queue:position`    | Your queue position updated              |
| `queue:joined`      | Successfully joined queue                |
| `queue:yourTurn`    | It's your turn to purchase               |
| `order:created`     | Order was created                        |
| `order:status`      | Order status changed                     |
| `price:changed`     | Price was updated                        |
| `flash:deal`        | New flash deal available                 |
| `admin:broadcast`   | System-wide broadcast                    |
| `admin:alert`       | Admin alert notification                 |
| `system:status`     | System status update                     |

### Admin Namespace (`/admin`)

Requires `auth.token` and `auth.isAdmin = true`. Automatically joins `admin:dashboard` room. Receives all admin-targeted events (sale started/ended, inventory updates, queue joins, etc.).

---

## 14. Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

### Common HTTP Status Codes

| Code  | Meaning                                                    |
| ----- | ---------------------------------------------------------- |
| `200` | Success                                                    |
| `201` | Created                                                    |
| `304` | Not Modified (ETag match)                                  |
| `400` | Bad Request — validation error                             |
| `401` | Unauthorized — missing/invalid token                       |
| `403` | Forbidden — insufficient permissions                       |
| `404` | Not Found                                                  |
| `408` | Request Timeout — bulkhead queue timeout                   |
| `409` | Conflict — duplicate resource                              |
| `429` | Too Many Requests — rate limit exceeded                    |
| `500` | Internal Server Error                                      |
| `503` | Service Unavailable — circuit breaker open / bulkhead full |

---

## 15. Rate Limiting

- **Global:** Configurable per-IP/per-user rate limits
- **WebSocket:** 30 messages/second per connection, max 10 connections per IP
- **Privacy Export:** Additional rate limiting on export endpoints
- **Bulkhead Partitions:**
  - Flash sale endpoints: 200 concurrent, 500 queued
  - Checkout endpoints: 100 concurrent, 200 queued
  - Admin endpoints: 20 concurrent, 10 queued

Rate-limited responses return `429 Too Many Requests` with a `Retry-After` header.

---

## Appendix: Environment Variables

| Variable                | Default                  | Description                  |
| ----------------------- | ------------------------ | ---------------------------- |
| `PORT`                  | `3000`                   | Server port                  |
| `DATABASE_URL`          | —                        | PostgreSQL connection string |
| `REDIS_URL`             | `redis://localhost:6379` | Redis connection string      |
| `JWT_SECRET`            | —                        | JWT signing secret           |
| `CORS_ORIGIN`           | `http://localhost:5173`  | Allowed CORS origin          |
| `ENABLE_DEBUG_ROUTES`   | `false`                  | Enable debug endpoints       |
| `NODE_ENV`              | `development`            | Environment mode             |
| `STRIPE_SECRET_KEY`     | —                        | Stripe API key               |
| `STRIPE_WEBHOOK_SECRET` | —                        | Stripe webhook secret        |
