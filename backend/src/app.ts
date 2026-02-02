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
import { backgroundJobRunner } from './services/backgroundJobRunner';
import flashSaleService from './services/flashSaleService';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later',
});

app.use(limiter);

// Health check endpoint
app.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [dbHealthy, redisHealth] = await Promise.all([
      testDatabaseConnection(),
      getRedisHealth(),
    ]);

    res.json({
      status: dbHealthy && redisHealth.status === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: dbHealthy ? 'ok' : 'unhealthy',
        redis: redisHealth.status,
      },
      metrics: {
        redisLatencyMs: redisHealth.latencyMs,
        redisVersion: redisHealth.version,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get('/health/redis', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const redisHealth = await getRedisHealth();
    res.json({
      status: redisHealth.status,
      latencyMs: redisHealth.latencyMs,
      version: redisHealth.version,
      error: redisHealth.error,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

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
    }
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
    }
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
    }
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
    }
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

app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════╗
║   Flash Sale Platform - Backend API    ║
╠════════════════════════════════════════╣
║ ✓ Server running                       ║
║ ✓ Port: ${PORT}                             ║
║ ✓ Environment: ${process.env.NODE_ENV || 'development'}         ║
║ ✓ Health: http://localhost:${PORT}/health      ║
╚════════════════════════════════════════╝
  `);

  // Warm up cache
  await flashSaleService.warmCache();

  // Start background jobs
  backgroundJobRunner.start();
  console.log('✓ Background jobs started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing server');
  backgroundJobRunner.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing server');
  backgroundJobRunner.stop();
  process.exit(0);
});

export default app;
