# Database Setup Instructions

Since Docker is not installed on this system, you can use one of these alternatives to run PostgreSQL:

## Option 1: Install Docker Desktop (Recommended)

1. Download Docker Desktop for Windows from https://www.docker.com/products/docker-desktop/
2. Install and restart your computer
3. Run: `docker compose up -d` in the project directory
4. Run migrations: `npm run migrate --workspace=backend`
5. Run seed data: `npm run seed --workspace=backend`

## Option 2: Use Local PostgreSQL Installation

1. Install PostgreSQL 16 from https://www.postgresql.org/download/windows/
2. During installation, set password to `flash_password`
3. Create database: `createdb -U postgres flash_sale_db`
4. Create user:
   ```sql
   CREATE USER flash_user WITH PASSWORD 'flash_password';
   GRANT ALL PRIVILEGES ON DATABASE flash_sale_db TO flash_user;
   ```
5. Update `.env` file in backend with your PostgreSQL connection details
6. Run migrations: `npm run migrate --workspace=backend`
7. Run seed data: `npm run seed --workspace=backend`

## Option 3: Use Cloud PostgreSQL (ElephantSQL, Supabase, etc.)

1. Create a free PostgreSQL instance on any cloud provider
2. Get the connection string
3. Update `.env` file in backend:
   ```
   DATABASE_URL=postgresql://user:pass@host:port/dbname
   ```
4. Run migrations: `npm run migrate --workspace=backend`
5. Run seed data: `npm run seed --workspace=backend`

## What We've Created Today

### ✅ Migration Scripts

- All 8 database tables with proper indexes
- Foreign key relationships
- UUID primary keys

### ✅ Seed Data Script

- 5 test users (password: `password123`)
- 8 products across categories
- 5 flash sales (1 active, 4 upcoming)
- Sample queue entries, orders, and analytics

### ✅ NPM Scripts

```bash
npm run migrate --workspace=backend  # Run all migrations
npm run seed --workspace=backend     # Populate with test data
npm run dev --workspace=backend      # Start dev server
```

## Next Steps

Once PostgreSQL is running:

1. Run `npm run migrate --workspace=backend` to create tables
2. Run `npm run seed --workspace=backend` to add test data
3. Run `npm run dev --workspace=backend` to start the API server
4. Test endpoints at http://localhost:3000
