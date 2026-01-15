import { query } from '../utils/database';

// Migration: Create Users table
export async function migration001_CreateUsersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  `;

  return query(sql);
}

// Migration: Create Products table
export async function migration002_CreateProductsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      base_price DECIMAL(10, 2) NOT NULL,
      category VARCHAR(100),
      image_url VARCHAR(500),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  `;

  return query(sql);
}

// Migration: Create Flash Sales table
export async function migration003_CreateFlashSalesTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS flash_sales (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      product_id UUID NOT NULL REFERENCES products(id),
      flash_price DECIMAL(10, 2) NOT NULL,
      quantity_available INT NOT NULL,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status VARCHAR(50) DEFAULT 'upcoming',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_flash_sales_product ON flash_sales(product_id);
    CREATE INDEX IF NOT EXISTS idx_flash_sales_status ON flash_sales(status);
    CREATE INDEX IF NOT EXISTS idx_flash_sales_time ON flash_sales(start_time, end_time);
  `;

  return query(sql);
}

// Migration: Create Queue Entries table
export async function migration004_CreateQueueEntriesTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS queue_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      flash_sale_id UUID NOT NULL REFERENCES flash_sales(id),
      position INT NOT NULL,
      status VARCHAR(50) DEFAULT 'waiting',
      joined_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_queue_user ON queue_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_queue_sale ON queue_entries(flash_sale_id);
    CREATE INDEX IF NOT EXISTS idx_queue_status ON queue_entries(status);
  `;

  return query(sql);
}

// Migration: Create Orders table
export async function migration005_CreateOrdersTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id),
      flash_sale_id UUID NOT NULL REFERENCES flash_sales(id),
      quantity INT NOT NULL,
      total_price DECIMAL(10, 2) NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_orders_sale ON orders(flash_sale_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
  `;

  return query(sql);
}

// Migration: Create Order History table
export async function migration006_CreateOrderHistoryTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS order_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      order_id UUID NOT NULL REFERENCES orders(id),
      status VARCHAR(50) NOT NULL,
      reason TEXT,
      changed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_history(order_id);
  `;

  return query(sql);
}

// Migration: Create Analytics Events table
export async function migration007_CreateAnalyticsEventsTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS analytics_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(100) NOT NULL,
      user_id UUID REFERENCES users(id),
      flash_sale_id UUID REFERENCES flash_sales(id),
      data JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_type ON analytics_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
  `;

  return query(sql);
}

// Migration: Create Inventory Sync Log table
export async function migration008_CreateInventorySyncLogTable() {
  const sql = `
    CREATE TABLE IF NOT EXISTS inventory_sync_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      flash_sale_id UUID NOT NULL REFERENCES flash_sales(id),
      redis_count INT,
      db_count INT,
      difference INT,
      synced_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_inventory_sale ON inventory_sync_log(flash_sale_id);
  `;

  return query(sql);
}

// Run all migrations
export async function runAllMigrations() {
  console.log('Starting database migrations...');

  try {
    await migration001_CreateUsersTable();
    console.log('✓ Migration 1: Users table created');

    await migration002_CreateProductsTable();
    console.log('✓ Migration 2: Products table created');

    await migration003_CreateFlashSalesTable();
    console.log('✓ Migration 3: Flash Sales table created');

    await migration004_CreateQueueEntriesTable();
    console.log('✓ Migration 4: Queue Entries table created');

    await migration005_CreateOrdersTable();
    console.log('✓ Migration 5: Orders table created');

    await migration006_CreateOrderHistoryTable();
    console.log('✓ Migration 6: Order History table created');

    await migration007_CreateAnalyticsEventsTable();
    console.log('✓ Migration 7: Analytics Events table created');

    await migration008_CreateInventorySyncLogTable();
    console.log('✓ Migration 8: Inventory Sync Log table created');

    console.log('✓ All migrations completed successfully');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    throw error;
  }
}
