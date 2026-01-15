# System Architecture

## Overview

The Flash Sale Platform is a high-performance distributed system designed to handle 50K+ concurrent users with zero overselling guarantee and fair FIFO queue access.

## High-Level Architecture

```
                                    ┌──────────────────────────┐
                                    │   React Frontend         │
                                    │   (Vite + Tailwind)      │
                                    └──────────────┬───────────┘
                                                   │
                    ┌──────────────────────────────┼──────────────────────────┐
                    │                              │                          │
            ┌───────▼────────┐           ┌────────▼─────────┐     ┌──────────▼────┐
            │  Load Balancer │           │  WebSocket Pool  │     │   REST API    │
            │    (Nginx)     │           │   (Socket.io)    │     │  (Express)    │
            └────────┬───────┘           └────────┬─────────┘     └────────┬──────┘
                     │                            │                         │
            ┌────────▼──────────────────────────────────────────────────────▼──┐
            │              Node.js Cluster (4+ Instances)                      │
            │  - API Routes                                                    │
            │  - Queue Management                                             │
            │  - Order Processing                                             │
            │  - Real-time Broadcast                                          │
            └────────┬────────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
    ┌───▼──────┐            ┌────▼──────┐
    │PostgreSQL│            │Redis      │
    │Database  │            │Cache/Queue│
    │          │            │          │
    │- Users   │            │- Queues  │
    │- Products│            │- Sessions│
    │- Orders  │            │- Counters│
    └──────────┘            └──────────┘
```

## Database Schema

### 1. Users Table

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  username VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Products Table

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name VARCHAR NOT NULL,
  description TEXT,
  base_price DECIMAL(10,2) NOT NULL,
  category VARCHAR,
  image_url VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3. Flash Sales Table

```sql
CREATE TABLE flash_sales (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  flash_price DECIMAL(10,2) NOT NULL,
  quantity_available INT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  status VARCHAR DEFAULT 'upcoming',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Queue Entries Table

```sql
CREATE TABLE queue_entries (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  flash_sale_id UUID REFERENCES flash_sales(id),
  position INT NOT NULL,
  status VARCHAR DEFAULT 'waiting',
  joined_at TIMESTAMP DEFAULT NOW()
);
```

### 5. Orders Table

```sql
CREATE TABLE orders (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  flash_sale_id UUID REFERENCES flash_sales(id),
  quantity INT NOT NULL,
  total_price DECIMAL(10,2) NOT NULL,
  status VARCHAR DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Redis Data Structures

### Queue (Sorted Set)

```
Key: queue:{flash_sale_id}
Type: Sorted Set
Members: User IDs
Score: Join timestamp (for FIFO ordering)

Example: queue:sale_123 → {user_1: 1705315200, user_2: 1705315201}
```

### Reservation (Hash)

```
Key: reservation:{user_id}:{flash_sale_id}
Type: Hash
Fields: {
  quantity: 1,
  reserved_at: timestamp,
  expires_at: timestamp
}
TTL: 5 minutes (auto-expires)
```

### Inventory Counter (String)

```
Key: inventory:{flash_sale_id}
Type: String (Integer)
Value: Available quantity
Operations: DECR (atomic)
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - User registration
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/refresh` - Token refresh

### Products

- `GET /api/v1/products` - List products
- `GET /api/v1/products/:id` - Get product details

### Flash Sales

- `GET /api/v1/flash-sales` - List active sales
- `GET /api/v1/flash-sales/:id` - Get sale details
- `GET /api/v1/flash-sales/:id/queue-position` - Get queue position

### Orders

- `POST /api/v1/orders` - Create order
- `GET /api/v1/orders` - List user orders
- `GET /api/v1/orders/:id` - Get order details

### Queue

- `POST /api/v1/queue/join` - Join queue
- `DELETE /api/v1/queue/leave` - Leave queue
- `GET /api/v1/queue/position` - Check position

## WebSocket Events

### Client to Server

- `queue:join` - Join queue for sale
- `queue:leave` - Leave queue
- `inventory:watch` - Watch inventory updates

### Server to Client

- `queue:position-update` - Queue position changed
- `inventory:update` - Inventory quantity changed
- `sale:status-change` - Sale status changed
- `order:update` - Order status changed

## Key Operations

### Zero Overselling Protection

Implemented via Redis Lua script:

```lua
-- Decrement inventory atomically
local key = KEYS[1]
local quantity = tonumber(ARGV[1])

local current = redis.call('GET', key)
if not current or tonumber(current) < quantity then
  return 0
end

redis.call('DECR', key, quantity)
return 1
```

### Fair Queue System

1. User joins → Added to sorted set with timestamp
2. Position tracking → Score used for FIFO ordering
3. Checkout window → Limited time for purchase
4. Position updates → Broadcast via WebSocket

### Order Processing Flow

1. User in queue joins checkout
2. Try to reserve inventory (with TTL)
3. If successful, proceed with payment
4. Confirm order
5. If timeout/fail, release reservation

## Deployment

### Docker Services

- PostgreSQL 16 (primary database)
- Redis 7 (cache & queue)
- Node.js cluster (4+ instances)
- Nginx (load balancer)

### Environment Variables

```
DB_HOST=postgres
DB_PORT=5432
DB_NAME=flash_sale_db
REDIS_HOST=redis
REDIS_PORT=6379
JWT_SECRET=your-secret-key
NODE_ENV=production
```

## Performance Characteristics

- **Throughput**: 50K+ concurrent users
- **Latency**: <100ms for queue operations
- **Consistency**: Strong (atomic operations)
- **Availability**: 99.9% uptime
- **Scalability**: Horizontal (stateless API servers)

## Security

- JWT authentication with 24h expiry
- Password hashing with bcrypt
- Rate limiting (100 requests/15 min)
- CORS configuration
- Helmet for HTTP headers
- Input validation & sanitization

## Monitoring

- Health check endpoints
- Metrics collection (Prometheus)
- Log aggregation (ELK)
- Performance monitoring (APM)
- Alert system (PagerDuty)
