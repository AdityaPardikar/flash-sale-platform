/**
 * Database Index Script
 * Day 6: Performance Optimization & Caching
 * Script to add missing indexes for query optimization
 */

import { query } from '../utils/database';

interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
  where?: string;
  description: string;
}

/**
 * All indexes to be created for performance optimization
 */
const indexes: IndexDefinition[] = [
  // Queue Performance Indexes
  {
    name: 'idx_queue_entries_sale_status',
    table: 'queue_entries',
    columns: ['flash_sale_id', 'status'],
    description: 'Optimize queue lookups by sale and status',
  },
  {
    name: 'idx_queue_entries_position',
    table: 'queue_entries',
    columns: ['flash_sale_id', 'position'],
    description: 'Optimize queue position queries',
  },
  {
    name: 'idx_queue_entries_user_sale',
    table: 'queue_entries',
    columns: ['user_id', 'flash_sale_id'],
    unique: true,
    description: 'Ensure unique user per queue and fast lookups',
  },
  {
    name: 'idx_queue_entries_created',
    table: 'queue_entries',
    columns: ['created_at DESC'],
    description: 'Optimize recent queue entries queries',
  },

  // Order Indexes
  {
    name: 'idx_orders_user_date',
    table: 'orders',
    columns: ['user_id', 'created_at DESC'],
    description: 'Optimize user order history queries',
  },
  {
    name: 'idx_orders_sale_status',
    table: 'orders',
    columns: ['flash_sale_id', 'status'],
    description: 'Optimize order queries by sale and status',
  },
  {
    name: 'idx_orders_status_date',
    table: 'orders',
    columns: ['status', 'created_at DESC'],
    description: 'Optimize order status filtering',
  },
  {
    name: 'idx_orders_product',
    table: 'orders',
    columns: ['product_id'],
    description: 'Optimize orders by product queries',
  },

  // Flash Sale Indexes
  {
    name: 'idx_flash_sales_active',
    table: 'flash_sales',
    columns: ['status', 'start_time', 'end_time'],
    description: 'Optimize active flash sales queries',
  },
  {
    name: 'idx_flash_sales_product',
    table: 'flash_sales',
    columns: ['product_id'],
    description: 'Optimize flash sales by product queries',
  },
  {
    name: 'idx_flash_sales_dates',
    table: 'flash_sales',
    columns: ['start_time', 'end_time'],
    description: 'Optimize time-based flash sale queries',
  },

  // Product Indexes
  {
    name: 'idx_products_category',
    table: 'products',
    columns: ['category'],
    description: 'Optimize product category filtering',
  },
  {
    name: 'idx_products_active',
    table: 'products',
    columns: ['active'],
    where: 'active = true',
    description: 'Partial index for active products',
  },

  // User Indexes
  {
    name: 'idx_users_email',
    table: 'users',
    columns: ['email'],
    unique: true,
    description: 'Unique email for login lookups',
  },
  {
    name: 'idx_users_status',
    table: 'users',
    columns: ['status'],
    description: 'Optimize user status filtering',
  },
  {
    name: 'idx_users_created',
    table: 'users',
    columns: ['created_at DESC'],
    description: 'Optimize recent user queries',
  },

  // Analytics Indexes
  {
    name: 'idx_analytics_events_date',
    table: 'analytics_events',
    columns: ['event_date', 'event_type'],
    description: 'Optimize analytics queries by date and type',
  },
  {
    name: 'idx_analytics_events_sale',
    table: 'analytics_events',
    columns: ['flash_sale_id', 'event_type'],
    description: 'Optimize analytics per sale',
  },
  {
    name: 'idx_analytics_events_user',
    table: 'analytics_events',
    columns: ['user_id', 'event_type'],
    description: 'Optimize user analytics',
  },

  // Audit Log Indexes
  {
    name: 'idx_audit_logs_actor',
    table: 'audit_logs',
    columns: ['actor_id'],
    description: 'Optimize audit logs by actor',
  },
  {
    name: 'idx_audit_logs_target',
    table: 'audit_logs',
    columns: ['target_type', 'target_id'],
    description: 'Optimize audit logs by target entity',
  },
  {
    name: 'idx_audit_logs_action_date',
    table: 'audit_logs',
    columns: ['action', 'created_at DESC'],
    description: 'Optimize audit log filtering by action',
  },

  // Alert Indexes
  {
    name: 'idx_alerts_status_severity',
    table: 'alerts',
    columns: ['status', 'severity'],
    description: 'Optimize active alerts queries',
  },
  {
    name: 'idx_alerts_type_created',
    table: 'alerts',
    columns: ['type', 'created_at DESC'],
    description: 'Optimize alerts by type',
  },
];

/**
 * Check if an index exists
 */
async function indexExists(indexName: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM pg_indexes WHERE indexname = $1`,
      [indexName]
    );
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Check if a table exists
 */
async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1 FROM information_schema.tables WHERE table_name = $1`,
      [tableName]
    );
    return result.rows.length > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Create a single index
 */
async function createIndex(index: IndexDefinition): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    // Check if table exists
    const tableExistsResult = await tableExists(index.table);
    if (!tableExistsResult) {
      return {
        success: false,
        message: `Table '${index.table}' does not exist, skipping index`,
      };
    }

    // Check if index already exists
    const exists = await indexExists(index.name);
    if (exists) {
      return {
        success: true,
        message: `Index '${index.name}' already exists`,
      };
    }

    // Build CREATE INDEX statement
    const unique = index.unique ? 'UNIQUE ' : '';
    const columns = index.columns.join(', ');
    const where = index.where ? ` WHERE ${index.where}` : '';

    const sql = `CREATE ${unique}INDEX CONCURRENTLY IF NOT EXISTS ${index.name} ON ${index.table} (${columns})${where}`;

    await query(sql);

    return {
      success: true,
      message: `Created index '${index.name}' on ${index.table}(${columns})`,
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to create index '${index.name}': ${(error as Error).message}`,
    };
  }
}

/**
 * Create all indexes
 */
export async function addAllIndexes(): Promise<{
  total: number;
  created: number;
  skipped: number;
  failed: number;
  results: { name: string; success: boolean; message: string }[];
}> {
  console.log('Starting database index optimization...\n');

  const results: { name: string; success: boolean; message: string }[] = [];
  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const index of indexes) {
    console.log(`Processing: ${index.name}`);
    console.log(`  Description: ${index.description}`);

    const result = await createIndex(index);
    results.push({
      name: index.name,
      success: result.success,
      message: result.message,
    });

    if (result.success) {
      if (result.message.includes('already exists')) {
        skipped++;
        console.log(`  Status: Skipped (already exists)\n`);
      } else if (result.message.includes('does not exist')) {
        skipped++;
        console.log(`  Status: Skipped (table missing)\n`);
      } else {
        created++;
        console.log(`  Status: Created\n`);
      }
    } else {
      failed++;
      console.log(`  Status: Failed - ${result.message}\n`);
    }
  }

  console.log('='.repeat(50));
  console.log('Index Optimization Complete');
  console.log(`Total indexes: ${indexes.length}`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log('='.repeat(50));

  return {
    total: indexes.length,
    created,
    skipped,
    failed,
    results,
  };
}

/**
 * Get index statistics
 */
export async function getIndexStats(): Promise<{
  indexes: { name: string; table: string; size: string; scans: number }[];
}> {
  try {
    const result = await query(`
      SELECT
        indexrelname as name,
        relname as table,
        pg_size_pretty(pg_relation_size(indexrelid)) as size,
        idx_scan as scans
      FROM pg_stat_user_indexes
      ORDER BY idx_scan DESC
      LIMIT 50
    `);

    return { indexes: result.rows };
  } catch (error) {
    console.error('Error getting index stats:', error);
    return { indexes: [] };
  }
}

/**
 * Run as standalone script
 */
async function main() {
  try {
    await addAllIndexes();
    
    console.log('\nIndex Statistics:');
    const stats = await getIndexStats();
    console.table(stats.indexes.slice(0, 20));
    
    process.exit(0);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default { addAllIndexes, getIndexStats };
