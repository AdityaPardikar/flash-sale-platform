# Flash Sale Platform

A high-performance distributed flash sale platform built with Node.js, React, PostgreSQL, and Redis.

## Features

- **Zero Overselling**: Atomic inventory operations using Redis Lua scripts
- **Fair Queue System**: FIFO queue with real-time position updates
- **Real-time Updates**: WebSocket connections for live price and inventory changes
- **High Concurrency**: Optimized for 50K+ concurrent users
- **Production Ready**: Docker, TypeScript, comprehensive testing

## Tech Stack

### Backend

- Node.js + Express + TypeScript
- PostgreSQL (primary database)
- Redis (caching & queue)
- Socket.io (real-time updates)
- JWT (authentication)

### Frontend

- React + Vite + TypeScript
- Tailwind CSS
- Socket.io-client
- TanStack Query

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start services (PostgreSQL, Redis)
npm run docker:up

# Run development servers
npm run dev

# Backend: http://localhost:3000
# Frontend: http://localhost:5173
```

### Testing

```bash
npm run test
```

### Linting & Formatting

```bash
npm run lint
npm run format
```

## Project Structure

```
flash-sale-platform/
├── backend/              # Express API server
│   ├── src/
│   │   ├── models/       # Data models
│   │   ├── controllers/  # Route handlers
│   │   ├── services/     # Business logic
│   │   ├── middleware/   # Custom middleware
│   │   ├── utils/        # Helper functions
│   │   └── app.ts        # Express setup
│   └── package.json
├── frontend/             # React application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── hooks/        # Custom hooks
│   │   ├── services/     # API clients
│   │   └── App.tsx       # Main component
│   └── package.json
└── docker-compose.yml    # Services setup
```

## Development

### Week 1: Foundation

- ✅ Project setup & monorepo
- Database schema & migrations
- Redis configuration
- Authentication system

### Week 2-4: Core Features

- Queue system
- Inventory management
- Orders & payments

### Week 5-6: Advanced

- Real-time updates
- Analytics dashboard
- Performance optimization

### Week 7-8: Production

- Load testing
- Deployment
- Monitoring

## API Documentation

See `ARCHITECTURE.md` for complete API documentation and system design.

## License

MIT
