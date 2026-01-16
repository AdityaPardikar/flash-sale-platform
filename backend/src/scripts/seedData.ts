import { query, testConnection, closePool } from '../utils/database';
import { hashPassword } from '../utils/helpers';

async function seedDatabase() {
  console.log('🌱 Starting database seeding...\n');

  // Test connection
  const connected = await testConnection();
  if (!connected) {
    console.error('❌ Cannot connect to database. Exiting...');
    process.exit(1);
  }

  try {
    // Seed Users
    console.log('📝 Seeding users...');
    const passwordHash = await hashPassword('password123');

    await query(
      `
      INSERT INTO users (email, username, password_hash) VALUES
      ('admin@flashsale.com', 'admin', $1),
      ('john@example.com', 'john_doe', $1),
      ('jane@example.com', 'jane_smith', $1),
      ('alice@example.com', 'alice_wonder', $1),
      ('bob@example.com', 'bob_builder', $1)
      ON CONFLICT (email) DO NOTHING
    `,
      [passwordHash]
    );
    console.log('✓ Users seeded');

    // Get user IDs for reference
    const usersResult = await query('SELECT id, email FROM users LIMIT 5');
    const userIds = usersResult.rows.map((u) => u.id);

    // Seed Products
    console.log('📝 Seeding products...');
    await query(`
      INSERT INTO products (name, description, base_price, category, image_url) VALUES
      ('Wireless Headphones', 'Premium noise-cancelling headphones', 299.99, 'Electronics', '/images/headphones.jpg'),
      ('Smart Watch', 'Fitness tracker with heart rate monitor', 199.99, 'Electronics', '/images/smartwatch.jpg'),
      ('Running Shoes', 'Lightweight running shoes for athletes', 89.99, 'Sports', '/images/shoes.jpg'),
      ('Coffee Maker', 'Automatic drip coffee maker', 79.99, 'Home', '/images/coffee.jpg'),
      ('Backpack', 'Water-resistant laptop backpack', 49.99, 'Accessories', '/images/backpack.jpg'),
      ('Gaming Mouse', 'RGB gaming mouse with programmable buttons', 59.99, 'Electronics', '/images/mouse.jpg'),
      ('Yoga Mat', 'Non-slip eco-friendly yoga mat', 29.99, 'Sports', '/images/yoga.jpg'),
      ('Blender', 'High-speed blender for smoothies', 99.99, 'Home', '/images/blender.jpg')
      ON CONFLICT DO NOTHING
    `);
    console.log('✓ Products seeded');

    // Get product IDs for flash sales
    const productsResult = await query('SELECT id FROM products LIMIT 8');
    const productIds = productsResult.rows.map((p) => p.id);

    // Seed Flash Sales
    console.log('📝 Seeding flash sales...');
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `
      INSERT INTO flash_sales (product_id, flash_price, quantity_available, start_time, end_time, status) VALUES
      ($1, 199.99, 100, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '4 hours', 'upcoming'),
      ($2, 149.99, 50, NOW() + INTERVAL '2 hours', NOW() + INTERVAL '5 hours', 'upcoming'),
      ($3, 59.99, 200, NOW() - INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'active'),
      ($4, 49.99, 75, NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 3 hours', 'upcoming'),
      ($5, 34.99, 150, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 3 hours', 'upcoming')
      ON CONFLICT DO NOTHING
    `,
      [productIds[0], productIds[1], productIds[2], productIds[3], productIds[4]]
    );
    console.log('✓ Flash sales seeded');

    // Get flash sale IDs
    const salesResult = await query('SELECT id FROM flash_sales LIMIT 5');
    const saleIds = salesResult.rows.map((s) => s.id);

    // Seed Queue Entries (for active flash sale)
    console.log('📝 Seeding queue entries...');
    if (userIds.length >= 3 && saleIds.length >= 1) {
      await query(
        `
        INSERT INTO queue_entries (user_id, flash_sale_id, position, status, joined_at) VALUES
        ($1, $4, 1, 'waiting', NOW() - INTERVAL '10 minutes'),
        ($2, $4, 2, 'waiting', NOW() - INTERVAL '8 minutes'),
        ($3, $4, 3, 'waiting', NOW() - INTERVAL '5 minutes')
        ON CONFLICT DO NOTHING
      `,
        [userIds[0], userIds[1], userIds[2], saleIds[0]]
      );
      console.log('✓ Queue entries seeded');
    }

    // Seed Sample Orders
    console.log('📝 Seeding orders...');
    if (userIds.length >= 2 && saleIds.length >= 1) {
      await query(
        `
        INSERT INTO orders (user_id, flash_sale_id, quantity, total_price, status) VALUES
        ($1, $2, 1, 59.99, 'completed'),
        ($3, $2, 2, 119.98, 'pending')
        ON CONFLICT DO NOTHING
      `,
        [userIds[0], saleIds[0], userIds[1]]
      );
      console.log('✓ Orders seeded');
    }

    // Seed Analytics Events
    console.log('📝 Seeding analytics events...');
    if (userIds.length >= 1 && saleIds.length >= 1) {
      await query(
        `
        INSERT INTO analytics_events (event_type, user_id, flash_sale_id, data) VALUES
        ('page_view', $1, $2, '{"page": "flash_sale_detail"}'),
        ('queue_join', $1, $2, '{"position": 1}'),
        ('purchase_attempt', $1, $2, '{"success": true}')
        ON CONFLICT DO NOTHING
      `,
        [userIds[0], saleIds[0]]
      );
      console.log('✓ Analytics events seeded');
    }

    console.log('\n✅ Database seeding completed successfully!');
    console.log('📊 Summary:');
    console.log('   - 5 users');
    console.log('   - 8 products');
    console.log('   - 5 flash sales (1 active, 4 upcoming)');
    console.log('   - 3 queue entries');
    console.log('   - 2 orders');
    console.log('   - 3 analytics events\n');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    throw error;
  } finally {
    await closePool();
  }
}

seedDatabase();
