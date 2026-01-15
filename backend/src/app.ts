import express, { Express, Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authMiddleware, errorHandler } from './middleware/auth';
import * as authController from './controllers/authController';

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));

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
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'checking...',
      redis: 'checking...',
    },
  });
});

// API v1 routes
const apiRouter = Router();

// Auth routes
const authRouter = Router();
authRouter.post('/register', authController.register);
authRouter.post('/login', authController.login);
authRouter.post('/logout', authMiddleware, authController.logout);
authRouter.post('/refresh', authMiddleware, authController.refreshToken);

apiRouter.use('/auth', authRouter);

// Products routes (placeholder)
apiRouter.get('/products', (req: Request, res: Response) => {
  res.json({
    message: 'Products endpoint - Week 2 implementation',
    data: [],
  });
});

apiRouter.get('/products/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    message: 'Product details - Week 2 implementation',
    productId: id,
  });
});

// Flash sales routes (placeholder)
apiRouter.get('/flash-sales', (req: Request, res: Response) => {
  res.json({
    message: 'Flash sales endpoint - Week 2 implementation',
    data: [],
  });
});

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

app.listen(PORT, () => {
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
});

export default app;
