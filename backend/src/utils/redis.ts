import Redis from 'ioredis';
import { REDIS_CONFIG } from './config';

// Use the in-memory mock during tests to avoid external Redis dependency
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RedisClient: typeof Redis = process.env.NODE_ENV === 'test' ? require('ioredis-mock') : Redis;

const redis = new RedisClient({
  host: REDIS_CONFIG.host,
  port: REDIS_CONFIG.port,
  db: REDIS_CONFIG.db,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err: Error) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  },
});

if (process.env.NODE_ENV !== 'test') {
  redis.on('connect', () => {
    console.log('✓ Redis connected');
  });

  redis.on('error', (error: Error) => {
    console.error('✗ Redis error:', error);
  });

  redis.on('ready', () => {
    console.log('✓ Redis ready');
  });
}

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
