# Redis Setup & Operations Guide

## Overview

Redis is used in this project for:

- **Queue Management**: FIFO queues with sorted sets
- **Inventory Tracking**: Atomic counters to prevent overselling
- **Session Storage**: JWT token caching
- **Reservation System**: Temporary holds with TTL

## Installation Options

### Option 1: Docker (Recommended)

```bash
docker compose up -d redis
```

### Option 2: Windows Installation

1. Download Redis from https://github.com/microsoftarchive/redis/releases
2. Install and run `redis-server.exe`
3. Default runs on `localhost:6379`

### Option 3: WSL2 + Redis

```bash
wsl --install
wsl
sudo apt update
sudo apt install redis-server
sudo service redis-server start
```

### Option 4: Cloud Redis (Upstash, Redis Cloud)

1. Create free Redis instance
2. Get connection string
3. Update `.env` file:
   ```
   REDIS_URL=redis://username:password@host:port
   ```

## Redis Data Structures Used

### 1. Inventory Counter (String)

```
Key: inventory:{flash_sale_id}
Type: String (Integer)
Purpose: Track available quantity
Operations: GET, DECR, INCRBY
```

### 2. Queue (Sorted Set)

```
Key: queue:{flash_sale_id}
Type: Sorted Set
Members: User IDs
Score: Join timestamp (for FIFO)
Operations: ZADD, ZRANK, ZREM, ZCARD
```

### 3. Reservation (Hash)

```
Key: reservation:{user_id}:{flash_sale_id}
Type: Hash
Fields:
  - quantity: Number
  - reserved_at: Timestamp
  - user_id: String
TTL: 300 seconds (5 minutes)
```

### 4. Session (String)

```
Key: session:{user_id}
Type: String
Value: JWT token
TTL: 86400 seconds (24 hours)
```

## Lua Scripts

We use 3 Lua scripts for atomic operations:

### 1. Decrement Inventory

Atomically decreases inventory count, preventing overselling.

### 2. Increment Inventory

Safely returns inventory to available pool with max limit check.

### 3. Reserve Inventory

Atomically decrements inventory and creates reservation with TTL.

## Testing Redis Connection

```bash
# Test connection
npm run verify --workspace=backend

# Or manually with redis-cli
redis-cli ping
# Should return: PONG
```

## Common Redis Commands

```bash
# View all keys
KEYS *

# Get inventory count
GET inventory:sale_123

# View queue
ZRANGE queue:sale_123 0 -1 WITHSCORES

# View reservation
HGETALL reservation:user_123:sale_456

# Get session
GET session:user_123

# Clear all data (DANGER!)
FLUSHALL
```

## Redis Configuration

Default configuration in `docker-compose.yml`:

- Port: 6379
- Persistence: AOF (Append-Only File)
- Memory: Default system limits
- Network: flash-sale-network

## Performance Tips

1. **Use Pipelining**: Batch multiple commands
2. **Use Lua Scripts**: Atomic multi-step operations
3. **Set Appropriate TTLs**: Prevent memory leaks
4. **Monitor Memory**: Use `INFO memory` command
5. **Use Connection Pooling**: Reuse connections (ioredis does this)

## Monitoring

```bash
# Check Redis stats
redis-cli INFO

# Monitor real-time commands
redis-cli MONITOR

# Check memory usage
redis-cli INFO memory

# Get slow queries
redis-cli SLOWLOG GET 10
```

## Troubleshooting

### Connection Refused

- Check if Redis is running: `redis-cli ping`
- Verify port 6379 is not blocked
- Check firewall settings

### Memory Issues

- Check memory usage: `redis-cli INFO memory`
- Review TTL settings on keys
- Consider maxmemory policy

### Slow Operations

- Use `SLOWLOG` to identify slow commands
- Review Lua script efficiency
- Check for large data structures

## Debug Routes (optional)

Enable debug routes only in local/dev environments:

```bash
ENABLE_DEBUG_ROUTES=true npm run dev --workspace=backend
```

Available debug endpoints (when flag is true):

- `GET /api/v1/debug/redis/ping` – returns Redis status, latency, version
- `POST /api/v1/debug/inventory/reserve` – body: `{ flashSaleId, userId, quantity, ttlSeconds? }`
- `POST /api/v1/debug/inventory/release` – body: `{ flashSaleId, userId }`
- `POST /api/v1/debug/queue/join` – body: `{ flashSaleId, userId }`
- `POST /api/v1/debug/queue/leave` – body: `{ flashSaleId, userId }`
- `GET /api/v1/debug/queue/:flashSaleId/length`
- `GET /api/v1/debug/queue/:flashSaleId/position/:userId`

## Next Steps

Once Redis is running:

1. Test connection with `redis-cli ping`
2. Run backend server: `npm run dev --workspace=backend`
3. Test queue operations through API endpoints
4. Monitor Redis commands in real-time
