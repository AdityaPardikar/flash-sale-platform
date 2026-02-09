/**
 * Health Check Routes
 * Day 5: Monitoring, Logging & Alerting
 * Endpoints for system health monitoring
 */

import { Router, Request, Response } from 'express';
import {
  getSystemHealth,
  checkDatabaseHealth,
  getAllServicesHealth,
  getLivenessStatus,
  getReadinessStatus,
  getResponseTimeMetrics
} from '../services/healthCheckService';
import { getRedisHealth } from '../utils/redis';

const router = Router();

/**
 * GET /api/health
 * Overall system health check
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const health = await getSystemHealth();
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Failed to check system health'
    });
  }
});

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
router.get('/live', (req: Request, res: Response) => {
  res.json(getLivenessStatus());
});

/**
 * GET /api/health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const readiness = await getReadinessStatus();
    const statusCode = readiness.status === 'ready' ? 200 : 503;
    res.status(statusCode).json(readiness);
  } catch (error) {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      error: 'Readiness check failed'
    });
  }
});

/**
 * GET /api/health/database
 * Database health check
 */
router.get('/database', async (req: Request, res: Response) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    const statusCode = dbHealth.status === 'ok' ? 200 : 503;
    
    res.status(statusCode).json({
      service: 'PostgreSQL',
      ...dbHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: 'PostgreSQL',
      status: 'unhealthy',
      error: 'Failed to check database health',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/redis
 * Redis health check
 */
router.get('/redis', async (req: Request, res: Response) => {
  try {
    const redisHealth = await getRedisHealth();
    const statusCode = redisHealth.status === 'ok' ? 200 : 503;
    
    res.status(statusCode).json({
      service: 'Redis',
      ...redisHealth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      service: 'Redis',
      status: 'unhealthy',
      error: 'Failed to check Redis health',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/services
 * All services status
 */
router.get('/services', async (req: Request, res: Response) => {
  try {
    const services = await getAllServicesHealth();
    const allHealthy = services.every(s => s.status === 'ok');
    const statusCode = allHealthy ? 200 : 503;
    
    res.status(statusCode).json({
      services,
      timestamp: new Date().toISOString(),
      overall: allHealthy ? 'healthy' : 'degraded'
    });
  } catch (error) {
    res.status(503).json({
      error: 'Failed to check services health',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/health/metrics
 * API performance metrics
 */
router.get('/metrics', (req: Request, res: Response) => {
  const metrics = getResponseTimeMetrics();
  const memUsage = process.memoryUsage();
  
  res.json({
    responseTime: metrics,
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024)
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
