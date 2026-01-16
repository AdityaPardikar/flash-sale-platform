import { runAllMigrations } from '../utils/migrations';
import { testConnection, closePool } from '../utils/database';

async function main() {
  console.log('🚀 Starting database migration process...\n');

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Cannot connect to database. Exiting...');
    process.exit(1);
  }

  // Run migrations
  try {
    await runAllMigrations();
    console.log('\n✅ All migrations completed successfully!');
    console.log('📊 Database is ready for use.\n');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
