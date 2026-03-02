# Flash Sale Platform — Production Deployment Guide

> Complete guide for deploying and operating the Flash Sale Platform in development, staging, and production environments.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Local Development](#local-development)
4. [Docker Deployment](#docker-deployment)
5. [Production Docker Compose](#production-docker-compose)
6. [Kubernetes Deployment](#kubernetes-deployment)
7. [CI/CD Pipeline](#cicd-pipeline)
8. [SSL/TLS Configuration](#ssltls-configuration)
9. [Database Setup](#database-setup)
10. [Redis Configuration](#redis-configuration)
11. [Nginx Reverse Proxy](#nginx-reverse-proxy)
12. [Health Checks & Monitoring](#health-checks--monitoring)
13. [Scaling Strategies](#scaling-strategies)
14. [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Dependency     | Version  | Purpose                           |
| -------------- | -------- | --------------------------------- |
| Node.js        | ≥ 20 LTS | Runtime for backend and build     |
| npm            | ≥ 10     | Package manager                   |
| Docker         | ≥ 24     | Containerization                  |
| Docker Compose | ≥ 2.20   | Multi-container orchestration     |
| PostgreSQL     | ≥ 16     | Primary data store                |
| Redis          | ≥ 7      | Caching, queues, pub/sub          |
| Nginx          | ≥ 1.25   | Reverse proxy (production)        |
| Git            | ≥ 2.40   | Source control                    |

Optional:
- **kubectl** ≥ 1.28 — Kubernetes deployments
- **Helm** ≥ 3.14 — Helm chart management
- **k6** ≥ 0.49 — Load testing

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root (see `.env.example`):

```bash
# ─── Server ──────────────────────────────
NODE_ENV=production          # development | staging | production
PORT=3000                    # Backend server port
FRONTEND_PORT=5173           # Vite dev server port (dev only)

# ─── Database ────────────────────────────
DATABASE_URL=postgresql://user:pass@localhost:5432/flash_sale
DB_POOL_MIN=2
DB_POOL_MAX=20
DB_SSL=true                  # Enable SSL in production

# ─── Redis ───────────────────────────────
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=              # Set in production
REDIS_TLS=false              # Enable TLS in production
REDIS_KEY_PREFIX=fsp:

# ─── Authentication ──────────────────────
JWT_SECRET=<random-64-char-hex>
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12

# ─── CORS ────────────────────────────────
CORS_ORIGIN=https://yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com

# ─── Rate Limiting ───────────────────────
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
RATE_LIMIT_MAX=100           # Max requests per window

# ─── Monitoring ──────────────────────────
LOG_LEVEL=info               # debug | info | warn | error
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Environment-Specific Overrides

| Variable        | Development       | Staging           | Production        |
| --------------- | ----------------- | ----------------- | ----------------- |
| `NODE_ENV`      | development       | staging           | production        |
| `DB_SSL`        | false             | true              | true              |
| `BCRYPT_ROUNDS` | 4                 | 10                | 12                |
| `LOG_LEVEL`     | debug             | info              | warn              |
| `CORS_ORIGIN`   | http://localhost* | staging domain    | production domain |

---

## Local Development

### Quick Start

```bash
# 1. Clone repository
git clone <repo-url>
cd flash-sale-platform

# 2. Install dependencies
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 3. Configure environment
cp .env.example .env
# Edit .env with your local database and Redis credentials

# 4. Start infrastructure (PostgreSQL + Redis)
docker compose up -d postgres redis

# 5. Run database migrations
cd backend && npm run migrate

# 6. Seed development data
npm run seed

# 7. Start backend (with hot reload)
npm run dev

# 8. Start frontend (separate terminal)
cd ../frontend && npm run dev
```

### Available Scripts

| Command                  | Description                    |
| ------------------------ | ------------------------------ |
| `npm run dev`            | Start backend with ts-node-dev |
| `npm run build`          | Compile TypeScript to JS       |
| `npm run start`          | Run compiled production build  |
| `npm run test`           | Run test suites                |
| `npm run test:coverage`  | Run tests with coverage report |
| `npm run lint`           | Run ESLint                     |
| `npm run typecheck`      | TypeScript type checking       |
| `npm run migrate`        | Run database migrations        |
| `npm run seed`           | Seed demo data                 |

---

## Docker Deployment

### Development Mode

```bash
# Start all services (backend, frontend, postgres, redis)
docker compose up --build

# Or run in detached mode
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose logs -f frontend
```

### Multi-Stage Dockerfile

The project uses a 7-stage multi-stage Dockerfile:

```
Stage 1: base            → Node.js 20 Alpine base image
Stage 2: deps            → Install all npm dependencies
Stage 3: backend-builder → Compile backend TypeScript
Stage 4: frontend-builder→ Build frontend with Vite
Stage 5: backend-prod    → Production backend (no devDeps)
Stage 6: frontend-prod   → Nginx serving static frontend
Stage 7: development     → Full dev environment with hot reload
```

### Build Production Images

```bash
# Backend production image
docker build --target backend-production -t flash-sale-backend:latest .

# Frontend production image (Nginx)
docker build --target frontend-production -t flash-sale-frontend:latest .

# Development image (for local Docker dev)
docker build --target development -t flash-sale-dev:latest .
```

---

## Production Docker Compose

Use `docker-compose.production.yml` for production deployments:

```bash
# Build and start production stack
docker compose -f docker-compose.production.yml up -d --build

# Scale backend replicas
docker compose -f docker-compose.production.yml up -d --scale backend=3

# Rolling restart (zero-downtime)
docker compose -f docker-compose.production.yml up -d --no-deps --build backend
```

### Production Stack Architecture

```
┌─────────────────────────────────────────────────┐
│                   Nginx (443/80)                │
│              SSL Termination + Proxy            │
├────────────────────┬────────────────────────────┤
│   Frontend (:80)   │     Backend (:3000)        │
│   Static Assets    │   ┌──────────────────┐     │
│   (Nginx)          │   │  Express Server  │     │
│                    │   │  WebSocket (WS)  │     │
│                    │   └──────┬───────────┘     │
│                    │          │                  │
│                    │   ┌──────┴───────────┐     │
│                    │   │  PostgreSQL 16   │     │
│                    │   │  Redis 7         │     │
│                    │   └──────────────────┘     │
└────────────────────┴────────────────────────────┘
```

### Resource Limits (Production)

| Service    | CPU Limit | Memory Limit | Replicas |
| ---------- | --------- | ------------ | -------- |
| Backend    | 1.0 CPU   | 512 MB       | 2–5      |
| Frontend   | 0.5 CPU   | 128 MB       | 2        |
| PostgreSQL | 2.0 CPU   | 1 GB         | 1 (+ replica) |
| Redis      | 0.5 CPU   | 256 MB       | 1 (+ sentinel) |
| Nginx      | 0.5 CPU   | 128 MB       | 1        |

---

## Kubernetes Deployment

### Namespace Setup

```bash
# Create namespace
kubectl create namespace flash-sale

# Set context
kubectl config set-context --current --namespace=flash-sale
```

### Deploy with kubectl

```bash
# Apply configurations
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/database.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/ingress.yaml

# Verify deployment
kubectl get pods -n flash-sale
kubectl get services -n flash-sale
```

### Horizontal Pod Autoscaler

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: flash-sale-backend
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Rolling Update Strategy

```yaml
spec:
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  minReadySeconds: 10
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow       | File              | Trigger            | Purpose                                |
| -------------- | ----------------- | ------------------ | -------------------------------------- |
| CI Pipeline    | `ci.yml`          | Push / PR to main  | Lint → Typecheck → Test → Build → Security |
| CD Pipeline    | `cd.yml`          | Tag / Manual       | Deploy to staging or production        |
| PR Check       | `pr-check.yml`    | Pull request       | Fast checks for PRs                    |
| Deploy         | `deploy.yml`      | Manual dispatch    | Manual deployment with env selection   |

### CI Pipeline Stages

```
┌──────────┐   ┌────────────┐   ┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌──────────┐
│   Lint   │──▶│  Typecheck │──▶│   Test   │──▶│  Build   │──▶│ Docker Build │──▶│ Security │
│ (ESLint) │   │ (tsc)      │   │ (Jest)   │   │ (tsc)    │   │ (multi-stage)│   │ (npm     │
│          │   │            │   │          │   │          │   │              │   │  audit)  │
└──────────┘   └────────────┘   └──────────┘   └──────────┘   └──────────────┘   └──────────┘
```

### Deployment Flow

```bash
# Deploy to staging (automatic on merge to main)
git push origin main

# Deploy to production (tag-based)
git tag -a v1.2.3 -m "Release v1.2.3"
git push origin v1.2.3

# Manual deployment
# GitHub Actions → Actions tab → Deploy → Run workflow → Select environment
```

---

## SSL/TLS Configuration

### Nginx SSL Setup

Place certificates in `docker/nginx/ssl/`:

```
docker/nginx/ssl/
├── server.crt          # SSL certificate
├── server.key          # Private key
├── dhparam.pem         # Diffie-Hellman parameters
└── README.md           # Certificate setup instructions
```

### Generate Self-Signed Certificate (Development)

```bash
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout docker/nginx/ssl/server.key \
  -out docker/nginx/ssl/server.crt \
  -subj "/CN=localhost"

# Generate DH parameters
openssl dhparam -out docker/nginx/ssl/dhparam.pem 2048
```

### Let's Encrypt (Production)

```bash
# Using certbot with Docker
docker run -it --rm \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/www/certbot:/var/www/certbot \
  certbot/certbot certonly \
  --webroot -w /var/www/certbot \
  -d yourdomain.com -d www.yourdomain.com

# Auto-renewal via cron
0 12 * * * /usr/bin/docker run --rm certbot/certbot renew
```

---

## Database Setup

### Initial Setup

```bash
# Create database
createdb flash_sale -U postgres

# Run migrations
cd backend && npm run migrate

# Seed data (development/staging only)
npm run seed

# Verify database
npm run verify-db
```

### Backup & Restore

```bash
# Backup
pg_dump -Fc -U postgres flash_sale > backup_$(date +%Y%m%d).dump

# Restore
pg_restore -U postgres -d flash_sale backup_20240101.dump

# Automated daily backup (cron)
0 2 * * * pg_dump -Fc -U postgres flash_sale > /backups/flash_sale_$(date +\%Y\%m\%d).dump
```

### Connection Pool Settings

| Setting      | Development | Staging | Production |
| ------------ | ----------- | ------- | ---------- |
| Pool Min     | 2           | 5       | 10         |
| Pool Max     | 10          | 20      | 50         |
| Idle Timeout | 30s         | 30s     | 10s        |
| Acquire      | 30s         | 15s     | 10s        |

---

## Redis Configuration

### Production Settings

```conf
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
appendonly yes
appendfsync everysec
requirepass <strong-password>
```

### Key Namespace Convention

```
fsp:inventory:{saleId}          → Inventory counts
fsp:reservation:{reservationId} → Reservation data (TTL: 10min)
fsp:queue:{saleId}              → Queue sorted set
fsp:session:{sessionId}         → Session data (TTL: 24h)
fsp:cache:{key}                 → Cached responses (TTL: varies)
fsp:rate:{ip}:{endpoint}        → Rate limit counters (TTL: window)
fsp:metrics:{name}              → Metrics data
```

---

## Nginx Reverse Proxy

### Production Configuration Highlights

- **Rate limiting:** 10 req/s per IP (burst 20)
- **WebSocket proxying:** Upgrade headers for `/socket.io/`
- **Gzip compression:** Enabled for text, JSON, JS, CSS, SVG
- **SSL:** TLS 1.2+, HSTS, OCSP stapling
- **Security headers:** X-Frame-Options, X-Content-Type-Options, CSP
- **Static asset caching:** 1 year for hashed assets, 1 hour for HTML

### Key Locations

```nginx
# API proxy
location /api/ {
    proxy_pass http://backend:3000;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# WebSocket proxy
location /socket.io/ {
    proxy_pass http://backend:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

# Frontend static assets
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
```

---

## Health Checks & Monitoring

### Health Endpoints

| Endpoint              | Purpose                       | Auth     |
| --------------------- | ----------------------------- | -------- |
| `GET /api/v1/health`  | Overall system status         | No       |
| `GET /api/v1/health/live`     | Liveness probe         | No       |
| `GET /api/v1/health/ready`    | Readiness probe        | No       |
| `GET /api/v1/health/database` | Database connectivity  | Optional |
| `GET /api/v1/health/redis`    | Redis connectivity     | Optional |
| `GET /api/v1/health/services` | All service health     | Yes      |
| `GET /api/v1/health/metrics`  | Health with metrics    | Yes      |
| `GET /api/v1/metrics`         | Prometheus metrics     | Yes      |
| `GET /api/v1/metrics/json`    | JSON metrics           | Yes      |

### Docker Health Checks

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health/live"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 40s
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /api/v1/health/live
    port: 3000
  initialDelaySeconds: 15
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/v1/health/ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Key Metrics to Monitor

| Category    | Metric                       | Alert Threshold       |
| ----------- | ---------------------------- | --------------------- |
| HTTP        | Request rate (RPS)           | > 1000 RPS            |
| HTTP        | Error rate (5xx)             | > 1%                  |
| HTTP        | P95 latency                  | > 500ms               |
| Database    | Connection pool usage        | > 80%                 |
| Database    | Query duration P95           | > 200ms               |
| Redis       | Memory usage                 | > 80% of maxmemory    |
| Redis       | Connected clients            | > 100                 |
| Queue       | Queue length                 | > 10,000              |
| Queue       | Processing time              | > 30s                 |
| System      | CPU usage                    | > 85% sustained       |
| System      | Memory usage                 | > 90%                 |
| System      | Event loop lag               | > 100ms               |

---

## Scaling Strategies

### Horizontal Scaling (Backend)

```bash
# Docker Compose
docker compose up -d --scale backend=5

# Kubernetes
kubectl scale deployment flash-sale-backend --replicas=5
```

### Vertical Scaling

Increase resource limits in Docker Compose or Kubernetes manifests when a single instance needs more CPU or memory.

### Database Scaling

1. **Read replicas** — Route read queries to replicas
2. **Connection pooling** — Use PgBouncer for connection multiplexing
3. **Partitioning** — Time-based partitioning for order/analytics tables
4. **Archival** — Move old data to archive tables

### Redis Scaling

1. **Redis Cluster** — Partition data across nodes
2. **Read replicas** — Sentinel-managed read replicas
3. **Memory optimization** — Tune `maxmemory-policy`, use shorter TTLs

### Caching Strategy

```
Request → Nginx Cache → Application Cache (Redis) → Database
              ↓                    ↓
         Static assets        API responses
         (1y hashed)          (5m–1h TTL)
```

---

## Troubleshooting

### Common Issues

| Issue | Symptom | Resolution |
| ----- | ------- | ---------- |
| DB connection refused | Backend fails to start | Verify `DATABASE_URL`, check PostgreSQL is running |
| Redis timeout | Slow API responses | Check Redis memory, increase `maxmemory`, verify `REDIS_URL` |
| Port conflict | `EADDRINUSE` error | Kill process on port or change `PORT` in `.env` |
| Docker build fails | npm install errors | Clear Docker cache: `docker compose build --no-cache` |
| WebSocket disconnect | Real-time updates stop | Check Nginx WebSocket config, increase timeout |
| Memory leak | Increasing RSS over time | Check for unhandled event listeners, enable memory profiling |
| SSL errors | Certificate warnings | Verify cert chain, check expiration, regenerate if needed |

### Diagnostic Commands

```bash
# Check all service health
curl http://localhost:3000/api/v1/health/services

# View backend logs
docker compose logs -f --tail 100 backend

# Check database connections
psql -U postgres -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'flash_sale';"

# Monitor Redis
redis-cli INFO memory
redis-cli INFO clients
redis-cli MONITOR

# Check container resource usage
docker stats

# Network debugging
docker compose exec backend wget -qO- http://postgres:5432 || echo "Cannot reach postgres"
```

---

## Quick Reference

### Deployment Checklist

- [ ] Environment variables configured (`.env`)
- [ ] Database created and migrations applied
- [ ] Redis configured with password
- [ ] SSL certificates installed
- [ ] Nginx configured with production settings
- [ ] Health checks passing
- [ ] Monitoring and alerting set up
- [ ] Backup schedule configured
- [ ] Log rotation configured
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Load testing completed
- [ ] Rollback procedure documented and tested

### Key URLs

| URL | Purpose |
| --- | ------- |
| `http://localhost:3000` | Backend API |
| `http://localhost:5173` | Frontend (dev) |
| `http://localhost:3000/api/v1/health` | Health check |
| `http://localhost:3000/api/v1/metrics` | Prometheus metrics |
| `http://localhost:3000/api/v1/deployments/version` | Build version |
