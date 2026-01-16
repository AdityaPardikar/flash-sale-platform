import { query, testConnection, closePool } from '../utils/database';

async function verifyDatabase() {
  console.log('🔍 Verifying database setup...\n');

  try {
    // Test connection
    const connected = await testConnection();
    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }

    // Check all tables exist
    const tables = [
      'users',
      'products',
      'flash_sales',
      'queue_entries',
      'orders',
      'order_history',
      'analytics_events',
      'inventory_sync_log',
    ];

    console.log('📋 Checking tables...');
    for (const table of tables) {
      try {
        const result = await query(
          `SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = $1
          )`,
          [table]
        );
        const exists = result.rows[0].exists;
        console.log(`  ${exists ? '✓' : '✗'} ${table}`);
      } catch (error) {
        console.log(`  ✗ ${table} - Error checking`);
      }
    }

    // Check row counts
    console.log('\n📊 Row counts:');
    for (const table of tables) {
      try {
        const result = await query(`SELECT COUNT(*) FROM ${table}`);
        const count = result.rows[0].count;
        console.log(`  ${table}: ${count} rows`);
      } catch (error) {
        console.log(`  ${table}: Unable to count`);
      }
    }

    // Check indexes
    console.log('\n🔗 Checking indexes...');
    const indexResult = await query(`
      SELECT schemaname, tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname
    `);
    console.log(`  Found ${indexResult.rows.length} indexes`);

    console.log('\n✅ Database verification complete!\n');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

verifyDatabase();
