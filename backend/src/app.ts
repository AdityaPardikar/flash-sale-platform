import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authMiddleware, errorHandler } from './middleware/auth';
import * as authController from './controllers/authController';
import { testConnection as testDatabaseConnection } from './utils/database';
import { getRedisHealth, testRedisConnection } from './utils/redis';
import {
  decrementInventory,
  reserveInventory,
  releaseReservation,
  joinQueue,
  leaveQueue,
  getQueueLength,
  getQueuePosition,
} from './utils/redisOperations';
import productRoutes from './routes/productRoutes';
import flashSaleRoutes from './routes/flashSaleRoutes';
import queueRoutes from './routes/queueRoutes';
import orderRoutes from './routes/orderRoutes';
import adminRoutes from './routes/adminRoutes';

// Week 5 Day 1: Payment & Cart routes
import paymentRoutes from './routes/paymentRoutes';
import cartRoutes from './routes/cartRoutes';

import { backgroundJobRunner } from './services/backgroundJobRunner';
import flashSaleService from './services/flashSaleService';

// Week 4 imports - Day 5: Health & Monitoring
import healthRoutes from './routes/healthRoutes';
import { logger } from './utils/logger';
import { requestLogger } from './middleware/requestLogger';
import auditLogger from './middleware/auditLogger';

// Week 4 imports - Day 6: Performance & Caching
import { cacheMiddleware } from './middleware/cacheMiddleware';
import { getRateLimitForPath } from './utils/rateLimitConfig';

// Week 4 imports - Day 7: Security & Privacy
import { securityHeaders } from './middleware/securityHeaders';
import { inputValidator } from './middleware/inputValidator';
import { sanitizeObject } from './utils/sanitizer';
import privacyRoutes from './routes/privacyRoutes';

// Week 6 Day 1: Monitoring, Metrics & Observability
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { correlationIdMiddleware } from './middleware/correlationId';
import { tracingMiddleware } from './middleware/tracing';
import metricsRoutes from './routes/metricsRoutes';
import { metricsService } from './services/metricsService';

// Week 6 Day 2: WebSocket Enhancement
import { createServer } from 'http';
import { websocketService } from './services/websocketService';

// Week 6 Day 3: Internationalization & Localization
import { localizationMiddleware } from './middleware/localization';

// Week 6 Day 4: Advanced Analytics Dashboard
import analyticsRoutes from './routes/analyticsRoutes';

// Week 7 Day 6: Deployment Dashboard & Release Management
import deploymentRoutes from './routes/deploymentRoutes';

// Week 6 Day 5: Performance Profiling & Optimization
import { performanceProfiler } from './utils/performanceProfiler';
import { compressionMiddleware, cacheControlMiddleware } from './middleware/compression';

// Week 6 Day 6: Production Hardening & Resilience
import { gracefulShutdown } from './utils/gracefulShutdown';
import { circuitBreakerRegistry } from './utils/circuitBreaker';
import { featureFlagService } from './services/featureFlagService';

// Week 7 Day 1: Environment Validation
import { validateAndReport } from './utils/envValidator';

// Validate environment variables at startup (fails fast in production)
validateAndReport();

const app: Express = express();

// Week 4 Day 7: Security Headers (applied before other middleware)
app.use(securityHeaders);

// Week 6 Day 1: Correlation ID (must be first – provides context for all downstream logging)
app.use(correlationIdMiddleware);

// Week 6 Day 3: Localization (detect locale early for error messages)
app.use(localizationMiddleware);

// Week 6 Day 5: Performance profiling (response timing)
app.use(performanceProfiler.middleware());

// Week 6 Day 5: Response compression
app.use(compressionMiddleware());

// Week 6 Day 5: Cache control headers
app.use(cacheControlMiddleware());

// Week 6 Day 1: Metrics collection middleware
app.use(metricsMiddleware);

// Week 6 Day 1: Distributed tracing
app.use(tracingMiddleware);

// Week 4 Day 5: Request logging (log all incoming requests)
app.use(requestLogger);

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  }),
);

// Week 4 Day 7: Input sanitization (clean inputs early)
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
});

// Week 4 Day 7: Input validation middleware
app.use(inputValidator);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Week 4 Day 6: Advanced rate limiting configuration
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Fallback to general limit
  message: 'Too many requests from this IP, please try again later',
});
app.use(limiter);

// Week 4 Day 6: Cache middleware for performance
app.use(cacheMiddleware);

// Week 4 Day 5: Audit logging (track important actions)
app.use(auditLogger());

// Health check endpoint
// Week 4 Day 5: Basic health endpoints moved to comprehensive health routes (/api/v1/health/*)
// Old basic health check replaced with full health monitoring system

const enableDebugRoutes = process.env.ENABLE_DEBUG_ROUTES === 'true';

// API v1 routes
const apiRouter = Router();

// Auth routes
const authRouter = Router();
authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/logout', authMiddleware, authController.logout);
authRouter.post('/refresh', authMiddleware, authController.refreshToken);

apiRouter.use('/auth', authRouter);

if (enableDebugRoutes) {
  const debugRouter = Router();
  debugRouter.get('/redis/ping', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const redisHealth = await getRedisHealth();
      res.json({
        status: redisHealth.status,
        latencyMs: redisHealth.latencyMs,
        version: redisHealth.version,
        error: redisHealth.error,
      });
    } catch (error) {
      next(error);
    }
  });

  debugRouter.post(
    '/inventory/reserve',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { flashSaleId, userId, quantity, ttlSeconds } = req.body;
        if (!flashSaleId || !userId || typeof quantity !== 'number') {
          return res.status(400).json({ error: 'missing_parameters' });
        }

        const reserved = await reserveInventory(flashSaleId, userId, quantity, ttlSeconds);
        res.json({ reserved });
      } catch (error) {
        next(error);
      }
    },
  );

  debugRouter.post(
    '/inventory/release',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { flashSaleId, userId } = req.body;
        if (!flashSaleId || !userId) {
          return res.status(400).json({ error: 'missing_parameters' });
        }

        const released = await releaseReservation(userId, flashSaleId);
        res.json({ released });
      } catch (error) {
        next(error);
      }
    },
  );

  debugRouter.post('/queue/join', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { flashSaleId, userId } = req.body;
      if (!flashSaleId || !userId) {
        return res.status(400).json({ error: 'missing_parameters' });
      }

      const position = await joinQueue(flashSaleId, userId);
      res.json({ position });
    } catch (error) {
      next(error);
    }
  });

  debugRouter.post('/queue/leave', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { flashSaleId, userId } = req.body;
      if (!flashSaleId || !userId) {
        return res.status(400).json({ error: 'missing_parameters' });
      }

      const removed = await leaveQueue(flashSaleId, userId);
      res.json({ removed });
    } catch (error) {
      next(error);
    }
  });

  debugRouter.get(
    '/queue/:flashSaleId/length',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { flashSaleId } = req.params;
        const length = await getQueueLength(flashSaleId);
        res.json({ length });
      } catch (error) {
        next(error);
      }
    },
  );

  debugRouter.get(
    '/queue/:flashSaleId/position/:userId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { flashSaleId, userId } = req.params;
        const position = await getQueuePosition(flashSaleId, userId);
        res.json({ position });
      } catch (error) {
        next(error);
      }
    },
  );

  apiRouter.use('/debug', debugRouter);
}

// Products routes
apiRouter.use('/products', productRoutes);

// Flash sales routes
apiRouter.use('/flash-sales', flashSaleRoutes);

// Queue routes
apiRouter.use('/queue', queueRoutes);

// Order routes
apiRouter.use('/orders', orderRoutes);

// Products routes (placeholder - for backward compatibility)
apiRouter.get('/products-legacy', (req: Request, res: Response) => {
  res.json({
    message: 'Products endpoint - Week 2 implementation',
    data: [],
  });
});

apiRouter.get('/products-legacy/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    message: 'Product details - Week 2 implementation',
    productId: id,
  });
});

// Flash sales legacy routes (placeholder - removed, now using main routes)

// Queue routes (placeholder)
apiRouter.post('/queue/join', authMiddleware, (req: Request, res: Response) => {
  res.json({
    message: 'Join queue - Week 3 implementation',
    user: req.user,
  });
});

// Orders routes (placeholder)
apiRouter.post('/orders', authMiddleware, (req: Request, res: Response) => {
  res.json({
    message: 'Create order - Week 4 implementation',
    user: req.user,
  });
});

apiRouter.get('/orders', authMiddleware, (req: Request, res: Response) => {
  res.json({
    message: 'List orders - Week 4 implementation',
    user: req.user,
    orders: [],
  });
});

// Admin routes
apiRouter.use('/admin', adminRoutes);

// Week 5 Day 1: Payment routes
apiRouter.use('/payments', paymentRoutes);

// Week 5 Day 1: Cart routes
apiRouter.use('/cart', cartRoutes);

// Week 4 Day 5: Comprehensive health monitoring routes
apiRouter.use('/health', healthRoutes);

// Week 4 Day 7: Privacy and compliance routes
apiRouter.use('/privacy', privacyRoutes);

// Week 6 Day 1: Metrics & observability routes
apiRouter.use('/metrics', metricsRoutes);

// Week 6 Day 4: Advanced analytics routes
apiRouter.use('/analytics', analyticsRoutes);

// Week 7 Day 6: Deployment dashboard & release management
apiRouter.use('/deployments', deploymentRoutes);

// Mount API router
app.use('/api/v1', apiRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handling middleware
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Create HTTP server and attach WebSocket
const httpServer = createServer(app);
websocketService.initialize(httpServer);

httpServer.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║   Flash Sale Platform - Backend API    ║
╠════════════════════════════════════════╣
║ ✓ Server running                       ║
║ ✓ Port: ${PORT}                             ║
║ ✓ Environment: ${process.env.NODE_ENV || 'development'}         ║
║ ✓ Health: http://localhost:${PORT}/health      ║
║ ✓ WebSocket: ws://localhost:${PORT}            ║
╚════════════════════════════════════════╝
  `);

  // Warm up cache
  await flashSaleService.warmCache();

  // Start background jobs
  backgroundJobRunner.start();
  console.log('✓ Background jobs started');

  // Week 6 Day 1: Start metrics collection (event loop lag, runtime metrics)
  metricsService.startCollecting();
  console.log('✓ Metrics collection started');

  // Week 6 Day 5: Start performance profiler
  performanceProfiler.start();
  console.log('✓ Performance profiler started');
  console.log('✓ WebSocket server initialized');

  // Week 6 Day 6: Register graceful shutdown hooks
  gracefulShutdown.registerServer(httpServer);
  gracefulShutdown.registerHook('websocket', () => websocketService.shutdown(), 10);
  gracefulShutdown.registerHook(
    'backgroundJobs',
    () => {
      backgroundJobRunner.stop();
    },
    20,
  );
  gracefulShutdown.registerHook(
    'metrics',
    () => {
      metricsService.stopCollecting();
    },
    30,
  );
  gracefulShutdown.registerHook(
    'profiler',
    () => {
      performanceProfiler.stop();
    },
    30,
  );
  gracefulShutdown.registerHook(
    'circuitBreakers',
    () => {
      circuitBreakerRegistry.destroyAll();
    },
    40,
  );
  gracefulShutdown.registerHook(
    'featureFlags',
    () => {
      featureFlagService.clearCache();
    },
    40,
  );
  gracefulShutdown.installSignalHandlers();
  console.log('✓ Graceful shutdown handlers registered');
  console.log(`✓ Feature flags loaded: ${featureFlagService.getAllFlags().length} flags`);
});

// Graceful shutdown is now managed by GracefulShutdown manager (Week 6 Day 6)
// Legacy signal handlers removed — gracefulShutdown.installSignalHandlers() handles SIGTERM, SIGINT, SIGUSR2

// Week 6 Integration - Log startup confirmation
logger.info('🚀 Flash Sale Platform - Week 6 Integration Active!', {
  features: [
    'Health Monitoring (/api/v1/health/*)',
    'Request Logging & Audit Trail',
    'Advanced Rate Limiting & Caching',
    'Security Headers & Input Validation',
    'Privacy & Compliance Routes (/api/v1/privacy/*)',
    'Prometheus Metrics (/api/v1/metrics)',
    'Correlation ID Tracking',
    'Distributed Tracing',
    'Structured JSON Logging',
    'Real-Time WebSocket (namespaces: /, /queue, /notifications, /admin)',
    'Event Broadcasting & Room Management',
    'Socket Authentication & Rate Limiting',
    'Internationalization (5 languages: en, es, fr, hi, ar)',
    'Localized API Error Messages',
    'Multi-Currency Support (USD, EUR, GBP, INR, SAR)',
    'Advanced Analytics Aggregation (/api/v1/analytics)',
    'Executive Summary & Revenue Reports',
    'CSV Export (revenue, sales, users)',
    'Performance Profiler (event loop, memory, endpoint timing)',
    'Response Compression (gzip, ETag, conditional requests)',
    'Cache Control Headers (immutable, stale-while-revalidate)',
    'Query Optimizer (DataLoader, memoization, pool monitoring)',
    'Circuit Breaker (CLOSED/OPEN/HALF_OPEN state machine)',
    'Graceful Shutdown (signal handling, connection draining)',
    'Retry Strategy (exponential backoff, jitter, idempotency)',
    'Feature Flags (boolean, percentage, segment, A/B test)',
    'Bulkhead Pattern (resource isolation, queue overflow)',
  ],
  timestamp: new Date().toISOString(),
});

export default app;
