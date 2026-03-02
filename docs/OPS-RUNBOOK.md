# Flash Sale Platform — Operations Runbook

> Operational procedures, troubleshooting guides, and incident response for the Flash Sale Platform.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Common Operational Tasks](#common-operational-tasks)
3. [Health Check Procedures](#health-check-procedures)
4. [Database Operations](#database-operations)
5. [Redis Operations](#redis-operations)
6. [Deployment Procedures](#deployment-procedures)
7. [Rollback Procedures](#rollback-procedures)
8. [Flash Sale Operations](#flash-sale-operations)
9. [Monitoring & Alerting](#monitoring--alerting)
10. [Incident Response](#incident-response)
11. [Log Analysis](#log-analysis)
12. [Performance Tuning](#performance-tuning)
13. [Security Operations](#security-operations)
14. [Scheduled Maintenance](#scheduled-maintenance)

---

## System Overview

### Service Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                        Nginx                            │
│            (SSL termination, rate limiting)              │
├────────────────────────┬────────────────────────────────┤
│    Frontend (Nginx)    │      Backend (Express)         │
│    Static SPA          │      ┌─────────────────┐      │
│                        │      │  WebSocket (WS)  │      │
│                        │      └────────┬─────────┘      │
│                        ├───────────────┼────────────────┤
│                        │  PostgreSQL   │    Redis       │
│                        │  (primary DB) │  (cache/queue) │
└────────────────────────┴───────────────┴────────────────┘
```

### Key Ports

| Service    | Port | Protocol |
| ---------- | ---- | -------- |
| Nginx      | 443  | HTTPS    |
| Nginx      | 80   | HTTP     |
| Backend    | 3000 | HTTP/WS  |
| Frontend   | 5173 | HTTP     |
| PostgreSQL | 5432 | TCP      |
| Redis      | 6379 | TCP      |
| Metrics    | 9090 | HTTP     |

### Critical SLAs

| Metric            | Target    | Critical |
| ----------------- | --------- | -------- |
| API Uptime        | 99.9%     | < 99.5%  |
| API P95 Latency   | < 200ms   | > 500ms  |
| Error Rate (5xx)  | < 0.1%    | > 1%     |
| Queue Wait Time   | < 30s     | > 60s    |
| Checkout Success  | > 95%     | < 90%    |
| Event Loop Lag    | < 50ms    | > 100ms  |

---

## Common Operational Tasks

### 1. Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service (zero-downtime for backend with replicas)
docker compose restart backend

# Hard restart (rebuild)
docker compose down && docker compose up -d --build

# Graceful restart (waits for in-flight requests)
docker compose kill -s SIGTERM backend
docker compose up -d backend
```

### 2. View Logs

```bash
# Follow all logs
docker compose logs -f

# Specific service, last 200 lines
docker compose logs -f --tail 200 backend

# Filter by level (structured JSON logs)
docker compose logs backend | grep '"level":"error"'

# Logs with timestamps
docker compose logs -f -t backend

# Export logs to file
docker compose logs --no-color backend > /var/log/flash-sale/backend-$(date +%Y%m%d).log
```

### 3. Check Resource Usage

```bash
# Container CPU/Memory/Network
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Disk usage
docker system df -v

# Clean up unused resources
docker system prune -f
docker volume prune -f  # CAUTION: removes unused volumes
```

### 4. Scale Service Replicas

```bash
# Scale backend to 4 replicas
docker compose up -d --scale backend=4

# Verify replicas are running
docker compose ps backend

# Check load distribution
docker compose logs backend | grep "Listening on port"
```

### 5. Environment Variable Updates

```bash
# Update .env and restart affected services
vi .env
docker compose up -d --force-recreate backend

# Verify new config
docker compose exec backend env | grep UPDATED_VAR
```

---

## Health Check Procedures

### Quick Health Check

```bash
# All-in-one health
curl -s http://localhost:3000/api/v1/health | jq .

# Expected response:
# { "status": "healthy", "uptime": 86400, "version": "1.x.x", ... }
```

### Deep Health Check Script

```bash
#!/bin/bash
# health-check.sh — Run comprehensive health checks

echo "=== Flash Sale Platform Health Check ==="
echo "Time: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo ""

# 1. API liveness
echo -n "API Liveness:    "
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health/live)
[ "$HTTP_STATUS" = "200" ] && echo "✅ OK" || echo "❌ FAIL (HTTP $HTTP_STATUS)"

# 2. API readiness
echo -n "API Readiness:   "
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health/ready)
[ "$HTTP_STATUS" = "200" ] && echo "✅ OK" || echo "❌ FAIL (HTTP $HTTP_STATUS)"

# 3. Database
echo -n "Database:        "
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health/database)
[ "$HTTP_STATUS" = "200" ] && echo "✅ OK" || echo "❌ FAIL (HTTP $HTTP_STATUS)"

# 4. Redis
echo -n "Redis:           "
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/v1/health/redis)
[ "$HTTP_STATUS" = "200" ] && echo "✅ OK" || echo "❌ FAIL (HTTP $HTTP_STATUS)"

# 5. Frontend
echo -n "Frontend:        "
HTTP_STATUS=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/)
[ "$HTTP_STATUS" = "200" ] && echo "✅ OK" || echo "❌ FAIL (HTTP $HTTP_STATUS)"

echo ""
echo "=== Done ==="
```

### Kubernetes Probe Verification

```bash
# Check liveness probe
kubectl exec -n flash-sale deploy/backend -- \
  wget -qO- http://localhost:3000/api/v1/health/live

# Check readiness probe
kubectl exec -n flash-sale deploy/backend -- \
  wget -qO- http://localhost:3000/api/v1/health/ready

# View probe events
kubectl describe pod -n flash-sale -l app=backend | grep -A5 "Liveness\|Readiness"
```

---

## Database Operations

### Connection Monitoring

```bash
# Active connections count
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT count(*) as active, max_conn FROM pg_stat_activity, 
   (SELECT setting::int as max_conn FROM pg_settings WHERE name='max_connections') mc 
   WHERE datname = 'flash_sale' GROUP BY max_conn;"

# Long-running queries (> 5 seconds)
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state != 'idle' AND now() - pg_stat_activity.query_start > interval '5 seconds'
   ORDER BY duration DESC;"

# Kill a long-running query
docker compose exec postgres psql -U postgres -c "SELECT pg_terminate_backend(<pid>);"
```

### Backup Procedures

```bash
# Full backup (compressed custom format)
docker compose exec postgres pg_dump -Fc -U postgres flash_sale \
  > /backups/flash_sale_$(date +%Y%m%d_%H%M%S).dump

# Schema-only backup
docker compose exec postgres pg_dump -s -U postgres flash_sale \
  > /backups/schema_$(date +%Y%m%d).sql

# Table-specific backup
docker compose exec postgres pg_dump -t orders -U postgres flash_sale \
  > /backups/orders_$(date +%Y%m%d).dump

# Verify backup integrity
pg_restore --list /backups/flash_sale_20240101_120000.dump
```

### Restore Procedures

```bash
# Full restore (CAUTION: overwrites existing data)
docker compose exec postgres pg_restore -U postgres -d flash_sale --clean \
  /backups/flash_sale_20240101_120000.dump

# Restore to a new database (safer)
docker compose exec postgres createdb -U postgres flash_sale_restore
docker compose exec postgres pg_restore -U postgres -d flash_sale_restore \
  /backups/flash_sale_20240101_120000.dump
```

### Migration Management

```bash
# Run pending migrations
cd backend && npm run migrate

# Check migration status
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT * FROM migrations ORDER BY id DESC LIMIT 10;"

# Rollback last migration (manual — apply reverse SQL)
# Review the migration file first, then apply reverse operations
```

### Table Maintenance

```bash
# Vacuum and analyze (should run periodically)
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "VACUUM ANALYZE;"

# Check table sizes
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT relname as table, pg_size_pretty(pg_total_relation_size(relid)) as size 
   FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC;"

# Check index usage
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT indexrelname, idx_scan, idx_tup_read 
   FROM pg_stat_user_indexes ORDER BY idx_scan DESC LIMIT 20;"
```

---

## Redis Operations

### Connection & Info

```bash
# Connect to Redis CLI
docker compose exec redis redis-cli

# Summary info
docker compose exec redis redis-cli INFO server
docker compose exec redis redis-cli INFO memory
docker compose exec redis redis-cli INFO keyspace

# Memory usage
docker compose exec redis redis-cli INFO memory | grep used_memory_human
```

### Key Management

```bash
# Count keys by pattern
docker compose exec redis redis-cli --scan --pattern 'fsp:*' | wc -l

# List keys by category
docker compose exec redis redis-cli --scan --pattern 'fsp:inventory:*'
docker compose exec redis redis-cli --scan --pattern 'fsp:queue:*'
docker compose exec redis redis-cli --scan --pattern 'fsp:cache:*'
docker compose exec redis redis-cli --scan --pattern 'fsp:rate:*'

# Check specific key TTL
docker compose exec redis redis-cli TTL fsp:reservation:<id>

# Delete keys by pattern (CAUTION)
docker compose exec redis redis-cli --scan --pattern 'fsp:cache:*' | \
  xargs docker compose exec -T redis redis-cli DEL
```

### Queue Operations

```bash
# Check queue length for a sale
docker compose exec redis redis-cli ZCARD fsp:queue:<saleId>

# View queue members (first 10)
docker compose exec redis redis-cli ZRANGE fsp:queue:<saleId> 0 9 WITHSCORES

# Check inventory count
docker compose exec redis redis-cli GET fsp:inventory:<saleId>

# Active reservations
docker compose exec redis redis-cli --scan --pattern 'fsp:reservation:*' | wc -l
```

### Redis Maintenance

```bash
# Slow log (commands > 10ms)
docker compose exec redis redis-cli SLOWLOG GET 20

# Clear slow log
docker compose exec redis redis-cli SLOWLOG RESET

# Force RDB save
docker compose exec redis redis-cli BGSAVE

# Check persistence status
docker compose exec redis redis-cli LASTSAVE
```

---

## Deployment Procedures

### Standard Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Run tests locally
cd backend && npm test && cd ..

# 3. Build and deploy
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml up -d

# 4. Verify health
curl -s http://localhost:3000/api/v1/health | jq .status
# Expected: "healthy"

# 5. Monitor logs for errors (watch for 5 minutes)
docker compose logs -f --tail 50 backend
```

### Blue-Green Deployment

```bash
# 1. Deploy new version alongside current (green environment)
docker compose -f docker-compose.green.yml up -d --build

# 2. Health check green environment
curl -s http://localhost:3001/api/v1/health | jq .status

# 3. Switch traffic (update Nginx upstream)
# Edit nginx config to point to green, reload
nginx -s reload

# 4. Verify production traffic on green
# Monitor metrics for 15 minutes

# 5. Stop blue environment
docker compose -f docker-compose.blue.yml down
```

### Canary Deployment

```bash
# 1. Deploy canary instance
docker compose up -d --scale backend=4  # 3 old + 1 new

# 2. Route 25% traffic to canary (Nginx upstream weight)
# upstream backend {
#     server backend-old:3000 weight=3;
#     server backend-new:3000 weight=1;
# }

# 3. Monitor error rate and latency on canary vs stable
# If metrics are healthy after 30 minutes, promote canary

# 4. Promote: roll out new version to all instances
docker compose up -d --build
```

---

## Rollback Procedures

### Quick Rollback (Docker)

```bash
# 1. Identify last working image tag
docker images flash-sale-backend --format "{{.Tag}} {{.CreatedAt}}" | head -5

# 2. Roll back to previous image
docker compose down backend
docker compose up -d backend  # Uses previous :latest

# Or specify a tag
# docker compose -f docker-compose.production.yml up -d
# (edit image tag in compose file first)

# 3. Verify rollback
curl -s http://localhost:3000/api/v1/health | jq .
curl -s http://localhost:3000/api/v1/deployments/version | jq .version
```

### Git-Based Rollback

```bash
# 1. Find the last good commit
git log --oneline -10

# 2. Revert to last good commit
git revert HEAD

# 3. Rebuild and deploy
docker compose -f docker-compose.production.yml up -d --build

# 4. Verify
curl -s http://localhost:3000/api/v1/health | jq .
```

### Database Rollback

```bash
# If a database migration caused the issue:

# 1. Stop application traffic
docker compose stop backend

# 2. Restore from backup
docker compose exec postgres pg_restore -U postgres -d flash_sale --clean \
  /backups/pre_migration_backup.dump

# 3. Deploy previous application version
git checkout <last-working-commit>
docker compose up -d --build backend

# 4. Verify data integrity
docker compose exec postgres psql -U postgres -d flash_sale -c \
  "SELECT count(*) FROM users; SELECT count(*) FROM orders;"
```

### Kubernetes Rollback

```bash
# Rollback to previous revision
kubectl rollout undo deployment/flash-sale-backend -n flash-sale

# Rollback to specific revision
kubectl rollout undo deployment/flash-sale-backend -n flash-sale --to-revision=3

# Check rollout status
kubectl rollout status deployment/flash-sale-backend -n flash-sale

# View rollout history
kubectl rollout history deployment/flash-sale-backend -n flash-sale
```

---

## Flash Sale Operations

### Pre-Sale Checklist

- [ ] Inventory loaded and verified in Redis
- [ ] Queue system cleared from previous sales
- [ ] Rate limits adjusted for expected traffic
- [ ] Backend scaled to handle load (min 3 replicas)
- [ ] Redis memory below 60% of limit
- [ ] Database connection pool verified
- [ ] WebSocket connections stable
- [ ] Monitoring dashboards open
- [ ] On-call team notified

### During Sale

```bash
# Monitor queue depth
watch -n 5 'docker compose exec redis redis-cli ZCARD fsp:queue:<saleId>'

# Monitor inventory
watch -n 2 'docker compose exec redis redis-cli GET fsp:inventory:<saleId>'

# Monitor error rate (structured logs)
docker compose logs -f backend | grep '"level":"error"' | head -20

# Monitor active connections
docker compose exec redis redis-cli INFO clients | grep connected_clients
```

### Post-Sale

```bash
# 1. Collect stats
curl -s http://localhost:3000/api/v1/analytics/sale/<saleId>/performance | jq .

# 2. Clean up expired reservations
# (Handled automatically by background job runner)

# 3. Archive queue data
docker compose exec redis redis-cli DEL fsp:queue:<saleId>

# 4. Scale down if no upcoming sales
docker compose up -d --scale backend=2

# 5. Generate report
curl -s http://localhost:3000/api/v1/analytics/revenue?from=<saleStart>&to=<saleEnd> | jq .
```

### Emergency: Pause Sale

```bash
# Option 1: Feature flag
curl -X PATCH http://localhost:3000/api/v1/admin/feature-flags/flash_sale_v2 \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Option 2: Stop accepting new queue entries
# (Update sale status via admin API)
curl -X PATCH http://localhost:3000/api/v1/flash-sales/<saleId> \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"status": "paused"}'
```

---

## Monitoring & Alerting

### Key Dashboards

| Dashboard             | URL                                           | Purpose                          |
| --------------------- | --------------------------------------------- | -------------------------------- |
| System Health         | `/admin/system-health`                        | Real-time infra overview         |
| Performance           | `/admin/performance`                          | Endpoint latency, memory, vitals |
| Deployments           | `/admin/deployments`                          | Deploy history, environment diff |
| Advanced Analytics    | `/admin/analytics`                            | Revenue, retention, funnels      |
| Prometheus Metrics    | `http://localhost:3000/api/v1/metrics`         | Raw Prometheus-format metrics    |

### Alert Rules (Recommended)

```yaml
# Critical Alerts
- name: HighErrorRate
  condition: error_rate_5xx > 1% for 5 minutes
  severity: critical
  action: Page on-call engineer

- name: HighLatency
  condition: http_request_duration_p95 > 500ms for 5 minutes
  severity: critical
  action: Page on-call engineer

- name: ServiceDown
  condition: health_check = "unhealthy" for 2 minutes
  severity: critical
  action: Page on-call engineer

# Warning Alerts
- name: HighCPU
  condition: cpu_usage > 80% for 10 minutes
  severity: warning
  action: Notify Slack

- name: HighMemory
  condition: memory_usage > 85% for 10 minutes
  severity: warning
  action: Notify Slack

- name: DatabasePoolExhaustion
  condition: db_pool_usage > 80%
  severity: warning
  action: Notify Slack

- name: RedisHighMemory
  condition: redis_memory_usage > 80%
  severity: warning
  action: Notify Slack

- name: QueueBacklog
  condition: queue_length > 10000
  severity: warning
  action: Notify Slack
```

---

## Incident Response

### Severity Levels

| Severity | Description                        | Response Time | Example                      |
| -------- | ---------------------------------- | ------------- | ---------------------------- |
| SEV-1    | Complete outage, data loss risk    | 15 minutes    | Database down, API 500s      |
| SEV-2    | Major feature degraded             | 30 minutes    | Queue processing stuck       |
| SEV-3    | Minor feature issue                | 2 hours       | Slow admin dashboard         |
| SEV-4    | Cosmetic/non-urgent                | Next business day | UI alignment bug          |

### Incident Procedure

```
1. DETECT    — Alert fires or user reports issue
2. TRIAGE    — Determine severity, assign incident commander
3. DIAGNOSE  — Check health endpoints, logs, metrics
4. MITIGATE  — Apply quick fix (restart, rollback, scale)
5. RESOLVE   — Fix root cause
6. POSTMORTEM — Document timeline, root cause, action items
```

### Quick Triage Commands

```bash
# Step 1: Is the API responding?
curl -w "\nHTTP %{http_code} in %{time_total}s\n" http://localhost:3000/api/v1/health

# Step 2: Check all services
curl -s http://localhost:3000/api/v1/health/services | jq .

# Step 3: Container status
docker compose ps

# Step 4: Recent errors
docker compose logs --tail 50 backend | grep -i "error\|fatal\|crash"

# Step 5: Resource usage
docker stats --no-stream

# Step 6: Database connections
docker compose exec postgres psql -U postgres -c \
  "SELECT state, count(*) FROM pg_stat_activity GROUP BY state;"

# Step 7: Redis status
docker compose exec redis redis-cli INFO server | head -10
docker compose exec redis redis-cli INFO memory | grep used_memory_human
```

---

## Log Analysis

### Structured Log Format

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "level": "error",
  "message": "Request failed",
  "correlationId": "abc-123",
  "method": "POST",
  "path": "/api/v1/orders",
  "statusCode": 500,
  "duration": 1234,
  "userId": "user-456",
  "error": { "name": "DatabaseError", "message": "Connection timeout" }
}
```

### Common Log Queries

```bash
# All errors in last hour
docker compose logs --since 1h backend | grep '"level":"error"'

# Slow requests (> 1s)
docker compose logs backend | grep -o '"duration":[0-9]*' | \
  awk -F: '$2 > 1000 {print $2"ms"}'

# Failed authentication attempts
docker compose logs backend | grep '"path":"/api/v1/auth/login"' | grep '"statusCode":401'

# Requests by a specific user
docker compose logs backend | grep '"userId":"<userId>"'

# 5xx errors grouped by path
docker compose logs backend | grep '"statusCode":5' | \
  grep -o '"path":"[^"]*"' | sort | uniq -c | sort -rn
```

---

## Performance Tuning

### Node.js Tuning

```bash
# Increase memory limit (default 1.5GB)
NODE_OPTIONS="--max-old-space-size=2048"

# Enable garbage collection logging
NODE_OPTIONS="--trace-gc"

# UV thread pool (for DNS, file I/O)
UV_THREADPOOL_SIZE=16
```

### PostgreSQL Tuning

```sql
-- Key settings for flash sale workloads
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '768MB';
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET max_connections = 100;
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
SELECT pg_reload_conf();
```

### Redis Tuning

```conf
# Flash sale optimizations
tcp-backlog 511
timeout 0
tcp-keepalive 300
maxmemory-policy allkeys-lru
hz 10
```

### Nginx Tuning

```nginx
worker_processes auto;
worker_connections 4096;
keepalive_timeout 65;
client_max_body_size 10m;

# Upstream keepalive
upstream backend {
    server backend:3000;
    keepalive 32;
}
```

---

## Security Operations

### Certificate Management

```bash
# Check certificate expiry
openssl x509 -in /etc/nginx/ssl/server.crt -noout -enddate

# Renew Let's Encrypt certificate
certbot renew --quiet

# Verify SSL configuration
curl -vI https://yourdomain.com 2>&1 | grep -A5 "SSL connection"
```

### Access Control

```bash
# Check active JWT tokens  (count active sessions)
docker compose exec redis redis-cli --scan --pattern 'fsp:session:*' | wc -l

# Revoke a user session
docker compose exec redis redis-cli DEL fsp:session:<sessionId>

# Check rate limit status for an IP
docker compose exec redis redis-cli GET fsp:rate:<ip>:/api/v1/auth/login
```

### Security Audit

```bash
# Check for known vulnerabilities
cd backend && npm audit
cd frontend && npm audit

# Check Docker image vulnerabilities
docker scout cves flash-sale-backend:latest

# Verify security headers
curl -sI https://yourdomain.com | grep -i "x-frame\|x-content\|strict-transport\|csp"
```

---

## Scheduled Maintenance

### Daily Tasks

| Time  | Task                          | Command                                        |
| ----- | ----------------------------- | ---------------------------------------------- |
| 02:00 | Database backup               | `pg_dump -Fc ...`                              |
| 03:00 | Log rotation                  | `logrotate /etc/logrotate.d/flash-sale`         |
| 04:00 | Clean expired sessions        | `redis-cli --scan --pattern 'fsp:session:*'...` |

### Weekly Tasks

| Day       | Task                        | Command                               |
| --------- | --------------------------- | ------------------------------------- |
| Monday    | Database VACUUM ANALYZE     | `psql -c "VACUUM ANALYZE;"`          |
| Wednesday | Check disk usage            | `docker system df -v`                 |
| Friday    | Review slow query log       | `redis-cli SLOWLOG GET 50`            |
| Sunday    | Docker image cleanup        | `docker system prune -f`              |

### Monthly Tasks

| Task                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| Dependency updates      | `npm update`, review changelogs              |
| Security audit          | `npm audit`, Docker image scan               |
| Certificate check       | Verify expiry > 30 days                      |
| Performance baseline    | Run load tests, compare with previous month  |
| Backup restore test     | Restore backup to test environment           |
| Documentation review    | Update runbook with new procedures           |
