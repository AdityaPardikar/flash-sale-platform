/**
 * Health Check Service
 * Day 5: Monitoring, Logging & Alerting
 * Provides system health monitoring for database, Redis, and API
 */

import { query } from '../utils/database';
import redis, { getRedisHealth, RedisHealth } from '../utils/redis';

export interface DatabaseHealth {
  status: 'ok' | 'unhealthy';
  latencyMs: number;
  connectionCount?: number;
  error?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: DatabaseHealth;
  redis: RedisHealth;
  memory: MemoryHealth;
  cpu?: CpuHealth;
}

export interface MemoryHealth {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  percentUsed: number;
}

export interface CpuHealth {
  loadAverage: number[];
}

export interface ServiceHealth {
  name: string;
  status: 'ok' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details?: Record<string, any>;
}

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// Track API response times for monitoring
const apiResponseTimes: number[] = [];
const MAX_RESPONSE_SAMPLES = 1000;

/**
 * Add a response time sample for API monitoring
 */
export function recordResponseTime(ms: number): void {
  apiResponseTimes.push(ms);
  if (apiResponseTimes.length > MAX_RESPONSE_SAMPLES) {
    apiResponseTimes.shift();
  }
}

/**
 * Get API response time percentiles
 */
export function getResponseTimeMetrics(): { p50: number; p95: number; p99: number; avg: number } {
  if (apiResponseTimes.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }

  const sorted = [...apiResponseTimes].sort((a, b) => a - b);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  
  return {
    p50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    p95: sorted[Math.floor(sorted.length * 0.95)] || 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    avg: Math.round(avg * 100) / 100
  };
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const start = Date.now();
  try {
    const result = await query('SELECT NOW() as time, count(*) as connections FROM pg_stat_activity');
    const latencyMs = Date.now() - start;
    
    return {
      status: 'ok',
      latencyMs,
      connectionCount: parseInt(result.rows[0]?.connections || '0', 10)
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      error: (error as Error).message
    };
  }
}

/**
 * Check memory usage
 */
export function checkMemoryHealth(): MemoryHealth {
  const memUsage = process.memoryUsage();
  const percentUsed = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);
  
  return {
    heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
    external: Math.round(memUsage.external / 1024 / 1024), // MB
    rss: Math.round(memUsage.rss / 1024 / 1024), // MB
    percentUsed
  };
}

/**
 * Check CPU load
 */
export function checkCpuHealth(): CpuHealth | undefined {
  try {
    const os = require('os');
    return {
      loadAverage: os.loadaverage()
    };
  } catch {
    return undefined;
  }
}

/**
 * Get overall system health status
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    getRedisHealth()
  ]);

  const memoryHealth = checkMemoryHealth();
  const cpuHealth = checkCpuHealth();

  // Determine overall status
  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  if (dbHealth.status === 'unhealthy' || redisHealth.status === 'unhealthy') {
    status = 'unhealthy';
  } else if (memoryHealth.percentUsed > 90 || (dbHealth.latencyMs && dbHealth.latencyMs > 100)) {
    status = 'degraded';
  }

  return {
    status,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    database: dbHealth,
    redis: redisHealth,
    memory: memoryHealth,
    cpu: cpuHealth
  };
}

/**
 * Get health status for all services
 */
export async function getAllServicesHealth(): Promise<ServiceHealth[]> {
  const services: ServiceHealth[] = [];

  // Check Database
  const dbHealth = await checkDatabaseHealth();
  services.push({
    name: 'PostgreSQL',
    status: dbHealth.status === 'ok' ? 'ok' : 'unhealthy',
    latencyMs: dbHealth.latencyMs,
    details: { connectionCount: dbHealth.connectionCount }
  });

  // Check Redis
  const redisHealth = await getRedisHealth();
  services.push({
    name: 'Redis',
    status: redisHealth.status === 'ok' ? 'ok' : 'unhealthy',
    latencyMs: redisHealth.latencyMs || 0,
    details: { version: redisHealth.version }
  });

  // Check Queue Service (via Redis)
  const queueStart = Date.now();
  try {
    await redis.llen('test_queue_check');
    services.push({
      name: 'Queue Service',
      status: 'ok',
      latencyMs: Date.now() - queueStart
    });
  } catch (error) {
    services.push({
      name: 'Queue Service',
      status: 'unhealthy',
      latencyMs: Date.now() - queueStart,
      details: { error: (error as Error).message }
    });
  }

  return services;
}

/**
 * Simple liveness probe - just checks if server is running
 */
export function getLivenessStatus(): { status: 'ok'; timestamp: string } {
  return {
    status: 'ok',
    timestamp: new Date().toISOString()
  };
}

/**
 * Readiness probe - checks if server can handle requests
 */
export async function getReadinessStatus(): Promise<{
  status: 'ready' | 'not_ready';
  timestamp: string;
  checks: { database: boolean; redis: boolean };
}> {
  const [dbHealth, redisHealth] = await Promise.all([
    checkDatabaseHealth(),
    getRedisHealth()
  ]);

  const isReady = dbHealth.status === 'ok' && redisHealth.status === 'ok';

  return {
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: dbHealth.status === 'ok',
      redis: redisHealth.status === 'ok'
    }
  };
}
