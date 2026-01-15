import Redis from 'ioredis';
import { REDIS_CONFIG } from './config';

const redis = new Redis({
  host: REDIS_CONFIG.host,
  port: REDIS_CONFIG.port,
  db: REDIS_CONFIG.db,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

redis.on('connect', () => {
  console.log('✓ Redis connected');
});

redis.on('error', (error) => {
  console.error('✗ Redis error:', error);
});

redis.on('ready', () => {
  console.log('✓ Redis ready');
});

export async function testRedisConnection(): Promise<boolean> {
  try {
    const response = await redis.ping();
    console.log('✓ Redis connection successful:', response);
    return true;
  } catch (error) {
    console.error('✗ Redis connection failed:', error);
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  await redis.quit();
}

export default redis;
