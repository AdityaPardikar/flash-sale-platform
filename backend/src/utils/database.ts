import { Pool, PoolClient } from 'pg';
import { DATABASE_CONFIG } from '../utils/config';

const pool = new Pool({
  host: DATABASE_CONFIG.host,
  port: DATABASE_CONFIG.port,
  database: DATABASE_CONFIG.database,
  user: DATABASE_CONFIG.user,
  password: DATABASE_CONFIG.password,
});

pool.on('error', (err: Error) => {
  console.error('Unexpected error on idle client', err);
});

export async function query(text: string, params?: any[]) {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error);
    return false;
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}

// Alias for pool getter
export function getPool(): Pool {
  return pool;
}

// Re-export Pool type
export { Pool };
export type { QueryResult } from 'pg';

export default pool;
