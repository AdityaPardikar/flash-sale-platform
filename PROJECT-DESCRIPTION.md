# HighLoad — Distributed Flash Sale Platform

> A production-grade, high-concurrency flash sale system designed to handle **50,000+ concurrent users** competing for limited inventory — with **zero overselling**, fair FIFO queuing, real-time WebSocket updates, and enterprise-grade observability.

---

## The Problem

During flash sales (limited inventory, extreme demand), standard e-commerce systems collapse:

| Problem | Impact |
|---------|--------|
| **Overselling** | Selling more items than physically available |
| **Database Bottlenecks** | Queries can't keep up under concurrent load |
| **Bot Exploitation** | Automated scripts buy before real users |
| **Blind Users** | No visibility into queue position or inventory |
| **System Crashes** | Servers overwhelmed by traffic spikes |

**HighLoad solves every one of these** with atomic Redis operations, a fair FIFO queue, real-time broadcasting, and resilient production infrastructure.

---

## Tech Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js + Express** | Core API server |
| **TypeScript** (strict mode) | End-to-end type safety across 145 backend files |
| **PostgreSQL 16** | Primary data store — 8+ tables, indexed, connection-pooled |
| **Redis 7** | Atomic inventory ops, queue engine, session cache, feature flags |
| **Socket.IO** | Real-time bidirectional communication (4 namespaces) |
| **Apollo GraphQL** | Flexible query API with subscriptions & DataLoader |
| **Stripe** | Payment processing with webhooks & retry logic |
| **JSON Web Tokens** | Stateless authentication with refresh token rotation |
| **bcrypt** | Password hashing |
| **Lua Scripts** | Atomic Redis operations (inventory decrement, reservation, release) |
| **Winston** | Structured JSON logging with rotation |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | Component-based UI |
| **Vite** | Lightning-fast HMR and optimized builds |
| **TypeScript** | Type-safe components across 67 frontend files |
| **Tailwind CSS** | Utility-first responsive styling |
| **Socket.IO Client** | Real-time inventory/queue/sale updates |
| **TanStack React Query** | Server state management with caching |
| **React Router v7** | Client-side routing with lazy-loaded routes |
| **i18next** | Internationalization — 5 languages |
| **Web Vitals** | LCP, FID, CLS, FCP, TTFB, INP monitoring |

### Infrastructure & DevOps
| Technology | Purpose |
|------------|---------|
| **Docker** | Multi-stage production builds (7 stages) with dumb-init |
| **Docker Compose** | Dev + production orchestration with resource limits |
| **Nginx** | Reverse proxy, rate limiting, SSL-ready, WebSocket proxy |
| **GitHub Actions** | 4 CI/CD workflows (CI, CD, PR checks, Deploy/Rollback) |
| **Kubernetes** | Deployment manifests, services, ingress, Helm charts |
| **Terraform** | Infrastructure as Code |
| **ESLint + Prettier** | Automated code quality enforcement |
| **Jest** | Unit, integration, and load testing |
| **k6** | Performance and stress testing |

---

## System Architecture

```
                        ┌─────────────────────────────────┐
                        │     React 18 Frontend (Vite)     │
                        │  TailwindCSS · i18next · PWA     │
                        └──────────────┬──────────────────┘
                                       │
                    ┌──────────────────┼───────────────────┐
                    │                  │                    │
            ┌───────▼────────┐  ┌─────▼──────────┐  ┌─────▼──────┐
            │  Nginx Reverse │  │  WebSocket Pool │  │  GraphQL   │
            │    Proxy       │  │   (Socket.IO)   │  │  (Apollo)  │
            │  Rate Limiting │  │  4 Namespaces   │  │  Subs +    │
            │  SSL/TLS Ready │  │  JWT Auth        │  │  DataLoader│
            └───────┬────────┘  └─────┬──────────┘  └─────┬──────┘
                    │                 │                    │
        ┌───────────▼─────────────────▼────────────────────▼────────┐
        │            Node.js / Express API Server (TypeScript)       │
        │                                                            │
        │  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐  │
        │  │ Middleware   │  │  Services    │  │  Controllers     │  │
        │  │ Pipeline     │  │  (30+)       │  │  (15+)           │  │
        │  │ (18 layers)  │  │              │  │                  │  │
        │  └─────────────┘  └──────────────┘  └──────────────────┘  │
        └──────────┬───────────────────┬────────────────────────────┘
                   │                   │
          ┌────────▼──────┐    ┌───────▼───────┐
          │  PostgreSQL   │    │    Redis 7     │
          │  16-alpine    │    │   7-alpine     │
          │               │    │               │
          │  8+ Tables    │    │  Lua Scripts  │
          │  12+ Indexes  │    │  Sorted Sets  │
          │  UUID PKs     │    │  Pub/Sub      │
          │  Audit Logs   │    │  Sessions     │
          └───────────────┘    └───────────────┘
```

### Request Middleware Pipeline (18 layers, ordered)

```
Request → Security Headers → Correlation ID → Localization → Performance Profiler
→ Compression → Cache Control → Metrics Collection → Distributed Tracing
→ Request Logger → Helmet → CORS → Input Sanitization → Input Validation
→ Body Parser → Rate Limiter → Cache Middleware → Audit Logger → Route Handler
```

---

## Features

### 1. Atomic Inventory Management (Zero Overselling)

The core differentiator. Inventory operations are **atomically executed inside Redis using Lua scripts**, eliminating race conditions entirely.

| Operation | Lua Script | Behavior |
|-----------|-----------|----------|
| **Decrement** | `decrementInventory.lua` | Atomic check-and-decrement; rejects if insufficient |
| **Reserve** | `reserveInventory.lua` | Temporary hold with TTL; auto-expires after 5 min |
| **Release** | `releaseReservation.lua` | Returns reserved stock to available pool |

- Inventory cached in Redis, periodically synced to PostgreSQL (every 30s)
- Low-stock threshold alerts
- Inventory audit logging for every change
- Concurrent load tested with 1,000+ simulated users — **zero overselling confirmed**

---

### 2. Fair FIFO Queue System

Users join a Redis Sorted Set queue ranked by arrival time. No one can skip the line.

- **`joinQueue()`** — Adds user with timestamp score (duplicate prevention)
- **`getQueuePosition()`** — Real-time rank calculation
- **`admitNextBatch()`** — Admits N users at once into checkout sessions
- **Checkout sessions** — 5-minute TTL in Redis; auto-expires if unused
- **Background admission job** — Runs every 10 seconds
- **Smart Queue** — Dynamic allocation, congestion prediction, auto-scaling, throttling
- **Priority Queue** — VIP early access with tier-based prioritization
- **Anti-bot protection** — IP-based rate limiting on queue join

---

### 3. Real-Time WebSocket Infrastructure

Full-duplex real-time communication via Socket.IO with 4 dedicated namespaces:

| Namespace | Purpose |
|-----------|---------|
| `/` | General events |
| `/queue` | Queue position updates, turn notifications |
| `/notifications` | Order confirmations, sale alerts |
| `/admin` | System status, broadcasts, alerts |

**27 Event Types:**
- **Sale events:** `sale:started`, `sale:ended`, `sale:updated`, `sale:countdown`
- **Inventory events:** `inventory:updated`, `inventory:low`, `inventory:soldout`
- **Queue events:** `queue:position`, `queue:joined`, `queue:yourTurn`
- **Order events:** `order:created`, `order:status`, `order:confirmed`
- **Admin events:** `admin:broadcast`, `admin:alert`, `system:status`

Features: JWT socket authentication, connection rate limiting, heartbeat protocol, room management, auto-reconnection with exponential backoff, latency tracking.

---

### 4. Payment Processing & Shopping Cart

- **Stripe integration** — Payment intents, confirmation, webhooks, retry logic
- **PayPal gateway** — Alternative payment method
- **Redis-backed cart** — Persistent across sessions with TTL expiration
- **Checkout flow:** Validate → Reserve Inventory → Charge → Confirm → Fulfill
- **Refund & cancellation** logic with order status state machine
- **Guest-to-user cart migration** on registration

---

### 5. AI & Machine Learning Features

| Feature | Description |
|---------|-------------|
| **Recommendation Engine** | Collaborative filtering, content-based, and hybrid approaches |
| **Dynamic Pricing** | Algorithmic price adjustments based on demand signals |
| **Fraud Detection** | Anomaly detection, transaction risk scoring, bot identification |
| **Demand Prediction** | Sales forecasting and inventory planning |
| **User Churn Prediction** | Identify at-risk users for retention |

---

### 6. Admin Dashboard & Analytics

A full-featured admin portal with role-based access control:

**Authentication & Authorization:**
- JWT-based admin auth (8-hour tokens) with refresh rotation
- 2FA framework (authenticator app ready)
- **15 granular permissions** (CREATE_SALE, MANAGE_QUEUE, VIEW_ANALYTICS, EXPORT_DATA, etc.)
- Role hierarchy: `admin` → `super_admin`

**Dashboard Pages:**
- **Overview** — Real-time KPIs with 30-second auto-refresh (sales, orders, revenue, active users, queued users, system health)
- **Flash Sale Management** — Create, edit, activate, delete sales; live sale metrics
- **Queue Management** — Monitor queues, manually admit users, remove entries
- **User Management** — Browse users, view activity logs, update status
- **Order Management** — Track orders, update status, process cancellations
- **Advanced Analytics** — Revenue comparison, retention cohorts, conversion funnels, CSV export
- **Performance Dashboard** — Endpoint timing (p95/p99), memory trends, Web Vitals, slow queries
- **Feature Flags** — Toggle boolean/percentage/segment/A/B flags from UI
- **Audit Logs** — Search, filter, export compliance audit trails

**Analytics Capabilities:**
- Executive summary with period-over-period comparison
- Revenue analytics with growth calculations
- Sale performance metrics
- User retention cohort analysis
- Traffic pattern analysis
- Inventory turnover reporting
- CSV export (revenue, sales, users)

---

### 7. Internationalization & Localization

| Language | Code |
|----------|------|
| English | `en` |
| Spanish | `es` |
| French | `fr` |
| German | `de` |
| Japanese | `ja` |

- Backend `Accept-Language` header parsing with localized API error messages
- Frontend language switcher with flag indicators
- Multi-currency support (USD, EUR, GBP, INR, SAR)
- i18next with browser language detection and lazy loading

---

### 8. Monitoring, Metrics & Observability

**Prometheus-Compatible Metrics (25+ pre-registered):**
- HTTP request duration, status codes, active connections
- Database connection pool monitoring
- Redis operation latency
- Queue depth, admission rate, wait times
- Business metrics (orders, revenue, inventory)
- Node.js runtime (event loop lag, heap usage, GC)

**Distributed Tracing:**
- W3C Trace Context header propagation
- Trace/span lifecycle with automatic parent-child relationships
- Request correlation IDs across all log entries

**Health Checks:**
- `/health` — Basic liveness
- `/health/live` — Liveness probe (K8s)
- `/health/ready` — Readiness probe (K8s)
- `/health/database` — PostgreSQL connectivity
- `/health/redis` — Redis connectivity
- `/health/services` — All dependency checks
- `/health/metrics` — Performance metrics

**Structured Logging:**
- Multi-level (DEBUG → FATAL) with Winston
- JSON output with log rotation
- Child loggers with contextual metadata
- Request/response logging with timing

---

### 9. Performance Optimization

| Technique | Implementation |
|-----------|---------------|
| **Response Compression** | Gzip (threshold 1KB, level 6), ETag generation, conditional 304s |
| **Multi-Layer Caching** | Redis cache service, HTTP cache middleware, Cache-Control headers (immutable, stale-while-revalidate) |
| **Database Optimization** | Strategic indexes, connection pooling, query memoization with TTL |
| **N+1 Prevention** | DataLoader pattern for batched queries |
| **Redis Pipelining** | Command batching for reduced round trips |
| **Virtual Scrolling** | Windowed rendering for large lists (keyboard nav, infinite scroll) |
| **Lazy Route Loading** | React.lazy with preload capability |
| **Performance Profiling** | Event loop lag monitoring, memory leak detection (10+ consecutive increases > 50MB), endpoint p95/p99 timing |
| **Web Vitals Monitoring** | LCP, FID, CLS, FCP, TTFB, INP via PerformanceObserver |

---

### 10. Production Hardening & Resilience

| Pattern | Implementation |
|---------|---------------|
| **Circuit Breaker** | CLOSED → OPEN → HALF_OPEN state machine; 5-failure threshold, 30s reset, 10s call timeout |
| **Graceful Shutdown** | SIGTERM/SIGINT/SIGUSR2 handling; 3-phase: stop accepting → drain connections → cleanup hooks (priority-ordered) |
| **Retry Strategy** | Exponential backoff with jitter (full/equal/none); pre-configured for DB and Redis |
| **Idempotency** | IdempotencyManager for safe retries of non-idempotent operations |
| **Feature Flags** | 4 types: boolean, percentage rollout, user segment, A/B test; deterministic hashing for consistent bucketing |
| **Bulkhead Pattern** | Resource isolation partitions (Flash Sale: 200 concurrent / 500 queue, Checkout: 100/200, Admin: 20/10) |
| **Environment Validation** | Startup validation with fail-fast in production; checks JWT_SECRET strength, DB password, CORS origin |

---

### 11. Security

| Layer | Protection |
|-------|-----------|
| **HTTP Headers** | Helmet + custom CSP, HSTS, X-Frame-Options, X-Content-Type-Options |
| **Input Validation** | Schema-based validation middleware |
| **Input Sanitization** | XSS prevention, SQL injection prevention |
| **Authentication** | JWT with bcrypt, refresh token rotation, admin 2FA ready |
| **Authorization** | RBAC with 15 granular permissions |
| **Rate Limiting** | IP-based + endpoint-specific (auth: 5r/s, flash-sale: 50r/s, general: 30r/s) |
| **Audit Trail** | Every sensitive operation logged with user, IP, timestamp |
| **GDPR/CCPA Compliance** | Data export (`/privacy/export`), deletion (`/privacy/delete`), anonymization (`/privacy/anonymize`) |

---

### 12. GraphQL API

- **Apollo Server** with full schema — queries, mutations, subscriptions
- **DataLoader** integration for batched, cached data fetching
- **Subscriptions** for real-time data (sale updates, inventory changes)
- Runs alongside REST API v1 and v2

---

### 13. Progressive Web App (PWA)

- Web App Manifest for install-to-homescreen
- Service Worker with cache-first strategy
- Offline-first architecture with IndexedDB storage
- Background data sync
- Push notification support
- Lighthouse-optimized

---

### 14. VIP Membership System

- Tiered membership levels with different perks
- Priority queue access for VIP users
- Early access windows before general sale
- Subscription management

---

## Infrastructure & DevOps

### Docker

**Development:** Single `Dockerfile` + `docker-compose.yml` with PostgreSQL 16, Redis 7, backend, frontend.

**Production:** Optimized `Dockerfile.production` with 7 build stages:
```
base → deps → backend-builder → frontend-builder → prod-deps → backend-production → frontend-production
```
- `dumb-init` as PID 1 for proper signal handling
- Non-root user (`flashsale:nodejs`)
- Layer caching for fast rebuilds
- Alpine base for minimal image size
- Health checks built into container

**Production Compose:** Resource limits (CPU/memory), tuned PostgreSQL (`shared_buffers=256MB`, `max_connections=200`), tuned Redis (`384mb maxmemory`, `appendfsync everysec`), JSON logging with rotation.

### Nginx (Production)

- 4096 worker connections
- JSON structured access logging
- 3 rate limit zones (API: 30r/s, Auth: 5r/s, Flash Sale: 50r/s)
- Upstream keepalive (64 connections)
- WebSocket proxy pass
- HSTS + CSP headers
- SSL/TLS ready (config prepared, cert guide included)
- Aggressive static asset caching

### CI/CD (GitHub Actions)

| Workflow | Purpose |
|----------|---------|
| **ci.yml** | Lint, type-check, test, build, security scan (Trivy), coverage upload |
| **cd.yml** | Continuous deployment on merge to main |
| **pr-check.yml** | PR validation, bundle size analysis, conventional commit enforcement |
| **deploy.yml** | Manual dispatch — environment selection (staging/production), deploy or rollback |

### Kubernetes

- Namespace, Deployments, Services, Ingress
- ConfigMaps and Secrets
- Persistent Volume Claims
- Helm charts for templated deployment
- Terraform configs for infrastructure provisioning

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `users` | User accounts with authentication |
| `products` | Product catalog |
| `flash_sales` | Sale events with timing and status |
| `flash_sale_products` | Products in sales with flash pricing |
| `orders` | Customer orders |
| `order_items` | Order line items |
| `payments` | Payment transactions |
| `inventory_logs` | Inventory change audit trail |
| `queue_entries` | Queue position tracking |
| `admin_users` | Admin accounts with roles/permissions |
| `admin_refresh_tokens` | Admin token management |
| `admin_login_attempts` | Login attempt tracking |
| `admin_activity_log` | Admin action audit trail |

- UUID primary keys for scalability
- 12+ strategic indexes for query performance
- Foreign key relationships with referential integrity
- Timestamps on all tables
- Transaction support for multi-table operations

---

## Testing

| Type | Coverage |
|------|----------|
| **Unit Tests** | 26+ test files, 120+ test cases — services, middleware, controllers |
| **Integration Tests** | API endpoint testing with Supertest |
| **E2E Tests** | 35+ integration tests covering full flash sale flow |
| **Load Tests** | k6 scripts simulating 1,000+ concurrent users |
| **Concurrency Tests** | Race condition validation — zero overselling proof |
| **Circuit Breaker Tests** | State transitions, timeout behavior, registry management |
| **WebSocket Tests** | Event validation, broadcasting patterns |
| **Metrics Tests** | Counter/gauge/histogram/summary operations, Prometheus output |

---

## API Surface

### REST API v1 — Route Groups

| Route | Endpoints | Description |
|-------|-----------|-------------|
| `/api/v1/auth` | 4 | Register, login, logout, refresh |
| `/api/v1/products` | 6+ | CRUD with pagination, search, filtering |
| `/api/v1/flash-sales` | 6+ | Sale lifecycle management |
| `/api/v1/queue` | 5+ | Join, position, stats, leave |
| `/api/v1/orders` | 5+ | Create, list, status, cancel |
| `/api/v1/payments` | 5+ | Stripe intents, confirm, webhook, refund |
| `/api/v1/cart` | 5+ | Add, remove, update, checkout |
| `/api/v1/admin` | 30+ | Dashboard, sales, users, orders, analytics, system |
| `/api/v1/health` | 7 | Liveness, readiness, services, database, Redis |
| `/api/v1/privacy` | 4 | Export, delete, anonymize, request |
| `/api/v1/metrics` | 3 | Prometheus, JSON, traces |
| `/api/v1/analytics` | 7+ | Revenue, sales, users, retention, CSV export |

**Total: 125+ REST endpoints + GraphQL + 27 WebSocket events**

---

## Project Statistics

| Metric | Value |
|--------|-------|
| **Total Commits** | 72 |
| **Backend TypeScript Files** | 145 |
| **Frontend TypeScript/TSX Files** | 67 |
| **Total Source Files** | 216+ |
| **Backend Services** | 30+ |
| **Backend Controllers** | 15+ |
| **Middleware Layers** | 18 |
| **Database Tables** | 13+ |
| **Redis Lua Scripts** | 3 |
| **Test Files** | 26+ |
| **Test Cases** | 120+ |
| **REST API Endpoints** | 125+ |
| **WebSocket Events** | 27 |
| **Supported Languages** | 5 |
| **CI/CD Workflows** | 4 |
| **Docker Build Stages** | 7 (production) |
| **Feature Flags** | 8 default |
| **Admin Permissions** | 15 granular |

---

## Project File Structure

```
flash-sale-platform/
├── backend/
│   └── src/
│       ├── app.ts                          # Express server (477 lines, 18 middleware layers)
│       ├── controllers/                    # 15 route controllers
│       │   ├── authController.ts
│       │   ├── productController.ts
│       │   ├── flashSaleController.ts
│       │   ├── queueController.ts
│       │   ├── orderController.ts
│       │   ├── paymentController.ts
│       │   ├── cartController.ts
│       │   ├── privacyController.ts
│       │   ├── adminAuthController.ts
│       │   ├── adminController.ts
│       │   ├── adminFlashSaleController.ts
│       │   ├── adminQueueController.ts
│       │   ├── adminUserController.ts
│       │   ├── adminAnalyticsController.ts
│       │   ├── analyticsController.ts
│       │   └── salePerformanceController.ts
│       ├── services/                       # 30+ business logic services
│       │   ├── authService.ts
│       │   ├── productService.ts
│       │   ├── flashSaleService.ts
│       │   ├── queueService.ts
│       │   ├── orderService.ts
│       │   ├── paymentService.ts / paymentProcessor.ts
│       │   ├── cartService.ts
│       │   ├── inventoryManager.ts
│       │   ├── websocketService.ts
│       │   ├── eventBroadcaster.ts
│       │   ├── metricsService.ts
│       │   ├── analyticsService.ts / analyticsAggregator.ts / analyticsCollector.ts
│       │   ├── recommendationService.ts
│       │   ├── dynamicPricingService.ts
│       │   ├── fraudDetectionService.ts
│       │   ├── predictiveAnalyticsService.ts
│       │   ├── featureFlagService.ts
│       │   ├── vipService.ts
│       │   ├── priorityQueueService.ts
│       │   ├── smartQueueService.ts
│       │   ├── saleTimingService.ts / stateMachine.ts
│       │   ├── backgroundJobRunner.ts
│       │   ├── healthCheckService.ts
│       │   ├── cacheService.ts
│       │   ├── privacyService.ts / dataExportService.ts
│       │   ├── alertService.ts
│       │   ├── auditLogService.ts
│       │   ├── adminMetricsService.ts
│       │   ├── realtimeService.ts
│       │   └── saleManagementService.ts / salePerformanceService.ts
│       ├── middleware/                     # 18 middleware components
│       │   ├── auth.ts / adminAuth.ts / socketAuth.ts
│       │   ├── securityHeaders.ts
│       │   ├── correlationId.ts
│       │   ├── localization.ts
│       │   ├── compression.ts
│       │   ├── metricsMiddleware.ts
│       │   ├── tracing.ts
│       │   ├── requestLogger.ts
│       │   ├── inputValidator.ts
│       │   ├── rateLimiter.ts
│       │   ├── cacheMiddleware.ts
│       │   ├── auditLogger.ts
│       │   ├── bulkhead.ts
│       │   └── apiGateway.ts
│       ├── graphql/                        # GraphQL API
│       │   ├── schema.ts
│       │   ├── resolvers.ts
│       │   ├── server.ts
│       │   └── index.ts
│       ├── routes/                         # 12 route modules
│       ├── models/                         # Data models & interfaces
│       ├── redis/                          # Lua scripts & loader
│       ├── utils/                          # 18 utility modules
│       ├── config/                         # Redis keys, rate limits
│       ├── scripts/                        # Migrations, seeds, verification
│       └── __tests__/                      # 26+ test files
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/                     # Reusable UI components
│       ├── pages/                          # Page components (admin dashboard, analytics, etc.)
│       ├── hooks/                          # Custom React hooks (useSocket, etc.)
│       ├── services/                       # API client layer
│       ├── utils/                          # Web Vitals, lazy routes
│       ├── i18n/                           # i18next configuration
│       └── locales/                        # Translation files (en, es, fr, de, ja)
├── docker/
│   └── nginx/                              # Nginx dev + production configs, SSL guide
├── k8s/                                    # Kubernetes manifests
├── tests/k6/                               # Load testing scripts
├── .github/workflows/                      # 4 CI/CD workflow files
├── Dockerfile                              # Development build
├── Dockerfile.production                   # 7-stage optimized production build
├── docker-compose.yml                      # Development orchestration
├── docker-compose.production.yml           # Production orchestration with resource limits
├── .env.example                            # Environment variable template
├── .eslintrc.json                          # Linting with strict rules
├── .prettierrc                             # Code formatting
└── tsconfig.json                           # Shared TypeScript configuration
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Redis Lua scripts for inventory** | Atomic execution eliminates race conditions — impossible to oversell |
| **Sorted Sets for queue** | O(log N) insertion with natural FIFO ordering by timestamp |
| **Socket.IO namespaces** | Logical separation of concerns; independent scaling per channel |
| **Circuit breaker + bulkhead** | Cascading failure prevention; resource isolation between critical paths |
| **Feature flags with deterministic hashing** | Consistent user bucketing for A/B tests; no database dependency |
| **18-layer middleware pipeline** | Defense in depth — security, observability, performance in correct order |
| **7-stage Docker build** | Minimal production image; cached layers; non-root user for security |
| **Correlation IDs first in pipeline** | Every downstream log/trace carries the same request ID |

---

## How to Run

```bash
# Clone and install
git clone https://github.com/AdityaPardikar/flash-sale-platform.git
cd flash-sale-platform
npm install

# Start with Docker (recommended)
docker-compose up -d

# Or run manually
cd backend && npm run dev    # API on :3000
cd frontend && npm run dev   # UI on :5173

# Run tests
cd backend && npm test

# Production build
docker-compose -f docker-compose.yml -f docker-compose.production.yml up -d
```

---

*Built with TypeScript, Node.js, React, PostgreSQL, Redis, Docker, and a focus on solving real distributed systems challenges.*
