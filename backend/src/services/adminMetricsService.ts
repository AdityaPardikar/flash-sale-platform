import { Request, Response } from 'express';
import pool from '../utils/database';
import redis from '../utils/redis';

/**
 * Admin Metrics Service
 * Provides dashboard overview and real-time analytics
 */

interface DashboardOverview {
  todayStats: {
    totalSales: number;
    totalOrders: number;
    totalRevenue: number;
    activeUsers: number;
    queuedUsers: number;
  };
  activeSales: {
    id: number;
    title: string;
    status: string;
    startTime: Date;
    queueLength: number;
    ordersCount: number;
  }[];
  recentOrders: {
    id: number;
    userId: number;
    productName: string;
    amount: number;
    status: string;
    createdAt: Date;
  }[];
  systemMetrics: {
    redisStatus: string;
    databaseStatus: string;
    queueHealth: string;
  };
}

/**
 * Get Dashboard Overview
 * Returns comprehensive dashboard data including today's stats,
 * active sales, recent orders, and system health
 */
export const getDashboardOverview = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 1. Get today's statistics
    const todayStatsQuery = `
      SELECT
        COUNT(DISTINCT fs.id) as total_sales,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_price), 0) as total_revenue,
        COUNT(DISTINCT o.user_id) as active_users
      FROM flash_sales fs
      LEFT JOIN orders o ON o.flash_sale_id = fs.id AND o.created_at >= $1
      WHERE fs.created_at >= $1
    `;
    const todayStatsResult = await pool.query(todayStatsQuery, [today]);

    // 2. Get queued users count from Redis
    const queueKeys = await redis.keys('queue:*:users');
    let queuedUsers = 0;
    for (const key of queueKeys) {
      const count = await redis.zcard(key);
      queuedUsers += count;
    }

    // 3. Get active flash sales
    const activeSalesQuery = `
      SELECT
        fs.id,
        fs.title,
        fs.status,
        fs.start_time,
        COUNT(DISTINCT o.id) as orders_count
      FROM flash_sales fs
      LEFT JOIN orders o ON o.flash_sale_id = fs.id
      WHERE fs.status IN ('scheduled', 'active')
      GROUP BY fs.id
      ORDER BY fs.start_time DESC
      LIMIT 5
    `;
    const activeSalesResult = await pool.query(activeSalesQuery);

    // Get queue lengths for active sales
    const activeSales = await Promise.all(
      activeSalesResult.rows.map(async (sale: any) => {
        // @ts-ignore
        const queueKey = `queue:${sale.id}:users`;
        const queueLength = await redis.zcard(queueKey);
        return {
          id: sale.id,
          title: sale.title,
          status: sale.status,
          startTime: sale.start_time,
          queueLength,
          ordersCount: parseInt(sale.orders_count) || 0,
        };
      })
    );

    // 4. Get recent orders
    const recentOrdersQuery = `
      SELECT
        o.id,
        o.user_id,
        p.name as product_name,
        o.total_price as amount,
        o.status,
        o.created_at
      FROM orders o
      JOIN products p ON p.id = o.product_id
      ORDER BY o.created_at DESC
      LIMIT 10
    `;
    const recentOrdersResult = await pool.query(recentOrdersQuery);

    // 5. Check system health
    let redisStatus = 'healthy';
    let databaseStatus = 'healthy';
    let queueHealth = 'healthy';

    try {
      await redis.ping();
    } catch (error) {
      redisStatus = 'unhealthy';
    }

    try {
      await pool.query('SELECT 1');
    } catch (error) {
      databaseStatus = 'unhealthy';
    }

    // Check if any queues are stuck (users waiting > 30 minutes)
    for (const key of queueKeys) {
      const oldestScore = await redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldestScore.length > 0) {
        const waitTime = Date.now() - parseInt(oldestScore[1]);
        if (waitTime > 30 * 60 * 1000) {
          queueHealth = 'degraded';
          break;
        }
      }
    }

    // Construct response
    const overview: DashboardOverview = {
      todayStats: {
        totalSales: parseInt(todayStatsResult.rows[0].total_sales) || 0,
        totalOrders: parseInt(todayStatsResult.rows[0].total_orders) || 0,
        totalRevenue: parseFloat(todayStatsResult.rows[0].total_revenue) || 0,
        activeUsers: parseInt(todayStatsResult.rows[0].active_users) || 0,
        queuedUsers,
      },
      activeSales,
      recentOrders: recentOrdersResult.rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        productName: row.product_name,
        amount: parseFloat(row.amount),
        status: row.status,
        createdAt: row.created_at,
      })),
      systemMetrics: {
        redisStatus,
        databaseStatus,
        queueHealth,
      },
    };

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error: unknown) {
    console.error('Error fetching dashboard overview:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard overview',
      error: errorMessage,
    });
  }
};

/**
 * Get Today's Performance Stats
 * Returns detailed hourly breakdown of today's performance
 */
export const getTodayStats = async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get hourly stats for today
    const hourlyStatsQuery = `
      SELECT
        EXTRACT(HOUR FROM o.created_at) as hour,
        COUNT(o.id) as order_count,
        SUM(o.total_price) as revenue,
        COUNT(DISTINCT o.user_id) as unique_users
      FROM orders o
      WHERE o.created_at >= $1
      GROUP BY EXTRACT(HOUR FROM o.created_at)
      ORDER BY hour
    `;
    const hourlyStatsResult = await pool.query(hourlyStatsQuery, [today]);

    // Get top products today
    const topProductsQuery = `
      SELECT
        p.id,
        p.name,
        COUNT(o.id) as order_count,
        SUM(o.total_price) as revenue
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.created_at >= $1
      GROUP BY p.id, p.name
      ORDER BY order_count DESC
      LIMIT 5
    `;
    const topProductsResult = await pool.query(topProductsQuery, [today]);

    // Get order status breakdown
    const statusBreakdownQuery = `
      SELECT
        status,
        COUNT(id) as count
      FROM orders
      WHERE created_at >= $1
      GROUP BY status
    `;
    const statusBreakdownResult = await pool.query(statusBreakdownQuery, [today]);

    res.status(200).json({
      success: true,
      data: {
        hourlyStats: hourlyStatsResult.rows.map((row) => ({
          hour: parseInt(row.hour),
          orderCount: parseInt(row.order_count),
          revenue: parseFloat(row.revenue) || 0,
          uniqueUsers: parseInt(row.unique_users),
        })),
        topProducts: topProductsResult.rows.map((row) => ({
          id: row.id,
          name: row.name,
          orderCount: parseInt(row.order_count),
          revenue: parseFloat(row.revenue),
        })),
        statusBreakdown: statusBreakdownResult.rows.reduce(
          (acc, row) => {
            acc[row.status] = parseInt(row.count);
            return acc;
          },
          {} as Record<string, number>
        ),
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching today stats:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch today stats',
      error: errorMessage,
    });
  }
};

/**
 * Get Live Sale Metrics
 * Returns real-time metrics for a specific flash sale
 */
export const getLiveSaleMetrics = async (req: Request, res: Response) => {
  try {
    const { saleId } = req.params;

    // Get sale details
    const saleQuery = `
      SELECT
        fs.id,
        fs.title,
        fs.status,
        fs.start_time,
        fs.end_time,
        fs.max_quantity,
        fs.created_at
      FROM flash_sales fs
      WHERE fs.id = $1
    `;
    const saleResult = await pool.query(saleQuery, [saleId]);

    if (saleResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Flash sale not found',
      });
    }

    const sale = saleResult.rows[0];

    // Get queue metrics
    const queueKey = `queue:${saleId}:users`;
    const queueLength = await redis.zcard(queueKey);
    const admittedKey = `queue:${saleId}:admitted`;
    const admittedCount = await redis.scard(admittedKey);

    // Get order metrics
    const orderMetricsQuery = `
      SELECT
        COUNT(o.id) as total_orders,
        COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
        SUM(CASE WHEN o.status = 'completed' THEN o.total_price ELSE 0 END) as total_revenue,
        COUNT(DISTINCT o.user_id) as unique_buyers
      FROM orders o
      WHERE o.flash_sale_id = $1
    `;
    const orderMetricsResult = await pool.query(orderMetricsQuery, [saleId]);
    const orderMetrics = orderMetricsResult.rows[0];

    // Get inventory status
    const inventoryQuery = `
      SELECT
        p.id,
        p.name,
        p.quantity as total_quantity,
        COALESCE(COUNT(o.id), 0) as sold_quantity
      FROM products p
      JOIN flash_sales fs ON fs.product_id = p.id
      LEFT JOIN orders o ON o.product_id = p.id AND o.flash_sale_id = fs.id
      WHERE fs.id = $1
      GROUP BY p.id, p.name, p.quantity
    `;
    const inventoryResult = await pool.query(inventoryQuery, [saleId]);

    const inventory =
      inventoryResult.rows.length > 0
        ? {
            productId: inventoryResult.rows[0].id,
            productName: inventoryResult.rows[0].name,
            totalQuantity: parseInt(inventoryResult.rows[0].total_quantity),
            soldQuantity: parseInt(inventoryResult.rows[0].sold_quantity),
            remainingQuantity:
              parseInt(inventoryResult.rows[0].total_quantity) -
              parseInt(inventoryResult.rows[0].sold_quantity),
          }
        : null;

    res.status(200).json({
      success: true,
      data: {
        sale: {
          id: sale.id,
          title: sale.title,
          status: sale.status,
          startTime: sale.start_time,
          endTime: sale.end_time,
          maxQuantity: sale.max_quantity,
        },
        queue: {
          waiting: queueLength,
          admitted: admittedCount,
          totalProcessed: queueLength + admittedCount,
        },
        orders: {
          total: parseInt(orderMetrics.total_orders) || 0,
          completed: parseInt(orderMetrics.completed_orders) || 0,
          pending: parseInt(orderMetrics.pending_orders) || 0,
          cancelled: parseInt(orderMetrics.cancelled_orders) || 0,
          totalRevenue: parseFloat(orderMetrics.total_revenue) || 0,
          uniqueBuyers: parseInt(orderMetrics.unique_buyers) || 0,
        },
        inventory,
      },
    });
  } catch (error: unknown) {
    console.error('Error fetching live sale metrics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      success: false,
      message: 'Failed to fetch live sale metrics',
      error: errorMessage,
    });
  }
};
