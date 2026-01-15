import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

const app: Express = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

app.use(limiter);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// API Routes placeholder
app.get('/api/v1/products', (req: Request, res: Response) => {
  res.json({
    message: 'Products endpoint - to be implemented',
    data: [],
  });
});

app.post('/api/v1/auth/register', (req: Request, res: Response) => {
  res.json({
    message: 'Register endpoint - to be implemented',
  });
});

app.post('/api/v1/auth/login', (req: Request, res: Response) => {
  res.json({
    message: 'Login endpoint - to be implemented',
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Internal server error',
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✓ Backend server running on http://localhost:${PORT}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
});

export default app;
