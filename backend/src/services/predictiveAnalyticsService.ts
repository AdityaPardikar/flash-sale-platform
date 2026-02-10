/**
 * Predictive Analytics Service
 * Week 5 Day 2: AI & Machine Learning Features
 *
 * Features:
 * - Sales forecasting
 * - Inventory prediction
 * - Churn prediction
 * - Revenue forecasting
 * - Customer lifetime value prediction
 * - Flash sale performance prediction
 */

import { getPool } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Types
export interface SalesForecast {
  period: 'daily' | 'weekly' | 'monthly';
  predictions: {
    date: Date;
    predictedSales: number;
    predictedRevenue: number;
    confidence: number;
    upperBound: number;
    lowerBound: number;
  }[];
  trend: 'increasing' | 'stable' | 'decreasing';
  seasonality: SeasonalityFactor[];
  accuracy: number;
}

export interface SeasonalityFactor {
  type: 'day_of_week' | 'day_of_month' | 'month' | 'holiday';
  factor: number;
  description: string;
}

export interface InventoryPrediction {
  productId: string;
  currentStock: number;
  predictedDemand: number[]; // Array of daily predictions
  restockDate: Date | null;
  stockoutRisk: 'low' | 'medium' | 'high';
  recommendedRestock: number;
  daysUntilStockout: number | null;
}

export interface ChurnPrediction {
  userId: string;
  churnProbability: number;
  riskLevel: 'low' | 'medium' | 'high';
  indicators: string[];
  retentionRecommendations: string[];
  lastActivityDays: number;
  lifetime_value: number;
}

export interface CustomerLifetimeValue {
  userId: string;
  predictedLTV: number;
  currentValue: number;
  expectedOrders: number;
  averageOrderValue: number;
  customerSegment: 'new' | 'regular' | 'vip' | 'at_risk' | 'churned';
}

export interface FlashSalePrediction {
  productId: string;
  saleId?: string;
  predictedParticipants: number;
  predictedRevenue: number;
  predictedSelloutTime: number; // minutes
  optimalDiscount: number;
  confidenceScore: number;
  riskFactors: string[];
}

export interface AnalyticsDashboard {
  overview: {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    averageOrderValue: number;
    conversionRate: number;
  };
  forecasts: {
    nextDayRevenue: number;
    nextWeekRevenue: number;
    nextMonthRevenue: number;
  };
  risks: {
    inventoryAlerts: number;
    churnRisk: number;
    fraudAlerts: number;
  };
  insights: string[];
}

// Constants
const FORECAST_CACHE_TTL = 3600; // 1 hour

class PredictiveAnalyticsService {
  /**
   * Generate sales forecast
   */
  async generateSalesForecast(
    days: number = 7,
    period: 'daily' | 'weekly' | 'monthly' = 'daily'
  ): Promise<SalesForecast> {
    const cacheKey = `${REDIS_KEYS.ANALYTICS_PREFIX}:forecast:${period}:${days}`;

    if (isRedisConnected()) {
      const cached = await redisClient.get(cacheKey);
      if (cached) return JSON.parse(cached);
    }

    try {
      const pool = getPool();

      // Get historical sales data
      const historicalData = await pool.query(
        `SELECT 
           DATE(created_at) as date,
           COUNT(*) as order_count,
           SUM(total_amount) as revenue
         FROM orders
         WHERE created_at > NOW() - INTERVAL '90 days'
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      );

      // Calculate baseline metrics
      const salesData = historicalData.rows;
      const avgDailySales =
        salesData.length > 0
          ? salesData.reduce((sum, r) => sum + parseInt(r.order_count), 0) / salesData.length
          : 10;
      const avgDailyRevenue =
        salesData.length > 0
          ? salesData.reduce((sum, r) => sum + parseFloat(r.revenue || '0'), 0) / salesData.length
          : 1000;

      // Calculate trend (simple linear regression)
      const trend = this.calculateTrend(salesData);

      // Calculate seasonality factors
      const seasonality = this.calculateSeasonality(salesData);

      // Generate predictions
      const predictions = [];
      for (let i = 1; i <= days; i++) {
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + i);

        const dayFactor = this.getDayOfWeekFactor(futureDate.getDay());
        const trendFactor = 1 + trend * i * 0.01;

        const predictedSales = Math.round(avgDailySales * dayFactor * trendFactor);
        const predictedRevenue = avgDailyRevenue * dayFactor * trendFactor;

        // Confidence decreases with distance
        const confidence = Math.max(0.5, 0.95 - i * 0.02);
        const variance = predictedRevenue * (1 - confidence) * 0.5;

        predictions.push({
          date: futureDate,
          predictedSales,
          predictedRevenue: Math.round(predictedRevenue * 100) / 100,
          confidence,
          upperBound: Math.round((predictedRevenue + variance) * 100) / 100,
          lowerBound: Math.round(Math.max(0, predictedRevenue - variance) * 100) / 100,
        });
      }

      const forecast: SalesForecast = {
        period,
        predictions,
        trend: trend > 0.05 ? 'increasing' : trend < -0.05 ? 'decreasing' : 'stable',
        seasonality,
        accuracy: Math.min(0.9, 0.7 + salesData.length / 200),
      };

      if (isRedisConnected()) {
        await redisClient.setex(cacheKey, FORECAST_CACHE_TTL, JSON.stringify(forecast));
      }

      return forecast;
    } catch (error) {
      console.error('Failed to generate sales forecast:', error);
      // Return default forecast
      return this.getDefaultForecast(days, period);
    }
  }

  /**
   * Predict inventory needs
   */
  async predictInventory(productId: string): Promise<InventoryPrediction> {
    try {
      const pool = getPool();

      // Get current inventory
      const inventoryResult = await pool.query(
        'SELECT quantity FROM inventory WHERE product_id = $1',
        [productId]
      );
      const currentStock = inventoryResult.rows[0]?.quantity || 0;

      // Get historical sales velocity
      const salesResult = await pool.query(
        `SELECT DATE(created_at) as date, SUM(quantity) as units
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE product_id = $1 AND o.created_at > NOW() - INTERVAL '30 days'
         GROUP BY DATE(created_at)`,
        [productId]
      );

      // Calculate daily demand
      const dailyDemand =
        salesResult.rows.length > 0
          ? salesResult.rows.reduce((sum, r) => sum + parseInt(r.units), 0) / 30
          : 0;

      // Predict next 14 days demand
      const predictedDemand = [];
      for (let i = 1; i <= 14; i++) {
        const dayFactor = this.getDayOfWeekFactor(new Date(Date.now() + i * 86400000).getDay());
        predictedDemand.push(Math.round(dailyDemand * dayFactor));
      }

      // Calculate days until stockout
      let cumulativeDemand = 0;
      let daysUntilStockout: number | null = null;
      for (let i = 0; i < predictedDemand.length; i++) {
        cumulativeDemand += predictedDemand[i];
        if (cumulativeDemand >= currentStock) {
          daysUntilStockout = i + 1;
          break;
        }
      }

      // Determine risk level
      const stockoutRisk =
        daysUntilStockout === null
          ? 'low'
          : daysUntilStockout <= 3
            ? 'high'
            : daysUntilStockout <= 7
              ? 'medium'
              : 'low';

      // Calculate recommended restock
      const recommendedRestock = Math.max(0, Math.round(dailyDemand * 30 - currentStock));

      // Calculate restock date (if needed within 7 days)
      let restockDate: Date | null = null;
      if (daysUntilStockout !== null && daysUntilStockout <= 7) {
        restockDate = new Date();
        restockDate.setDate(restockDate.getDate() + Math.max(1, daysUntilStockout - 2));
      }

      return {
        productId,
        currentStock,
        predictedDemand,
        restockDate,
        stockoutRisk,
        recommendedRestock,
        daysUntilStockout,
      };
    } catch (error) {
      console.error('Failed to predict inventory:', error);
      return {
        productId,
        currentStock: 0,
        predictedDemand: Array(14).fill(0),
        restockDate: null,
        stockoutRisk: 'low',
        recommendedRestock: 0,
        daysUntilStockout: null,
      };
    }
  }

  /**
   * Predict customer churn
   */
  async predictChurn(userId: string): Promise<ChurnPrediction> {
    try {
      const pool = getPool();

      // Get user activity data
      const userResult = await pool.query(
        `SELECT 
           u.created_at as signup_date,
           (SELECT MAX(created_at) FROM orders WHERE user_id = u.id) as last_order_date,
           (SELECT COUNT(*) FROM orders WHERE user_id = u.id) as order_count,
           (SELECT SUM(total_amount) FROM orders WHERE user_id = u.id) as total_spent
         FROM users u WHERE u.id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const userData = userResult.rows[0];
      const lastOrderDate = userData.last_order_date;
      const orderCount = parseInt(userData.order_count) || 0;
      const totalSpent = parseFloat(userData.total_spent) || 0;

      // Calculate days since last activity
      const lastActivityDays = lastOrderDate
        ? Math.floor((Date.now() - new Date(lastOrderDate).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Calculate churn probability based on indicators
      let churnScore = 0;
      const indicators: string[] = [];

      // Activity recency
      if (lastActivityDays > 90) {
        churnScore += 40;
        indicators.push('No activity in 90+ days');
      } else if (lastActivityDays > 60) {
        churnScore += 25;
        indicators.push('No activity in 60+ days');
      } else if (lastActivityDays > 30) {
        churnScore += 15;
        indicators.push('No activity in 30+ days');
      }

      // Order frequency
      const accountAgeDays = Math.floor(
        (Date.now() - new Date(userData.signup_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      const orderFrequency = accountAgeDays > 0 ? orderCount / (accountAgeDays / 30) : 0;

      if (orderFrequency < 0.5 && accountAgeDays > 60) {
        churnScore += 20;
        indicators.push('Low order frequency');
      }

      // Declining engagement
      // Simplified: if total orders < 3 after 30 days
      if (orderCount < 3 && accountAgeDays > 30) {
        churnScore += 15;
        indicators.push('Low engagement after signup');
      }

      // Retention recommendations
      const recommendations: string[] = [];
      if (lastActivityDays > 30) {
        recommendations.push('Send re-engagement email with personalized offers');
      }
      if (orderCount < 3) {
        recommendations.push('Offer first-time buyer discount');
      }
      if (churnScore > 50) {
        recommendations.push('Direct outreach with exclusive deal');
        recommendations.push('Survey to understand disengagement reasons');
      }

      const churnProbability = Math.min(100, churnScore) / 100;
      const riskLevel = churnProbability > 0.6 ? 'high' : churnProbability > 0.3 ? 'medium' : 'low';

      return {
        userId,
        churnProbability,
        riskLevel,
        indicators,
        retentionRecommendations: recommendations,
        lastActivityDays,
        lifetime_value: totalSpent,
      };
    } catch (error) {
      console.error('Failed to predict churn:', error);
      return {
        userId,
        churnProbability: 0,
        riskLevel: 'low',
        indicators: [],
        retentionRecommendations: [],
        lastActivityDays: 0,
        lifetime_value: 0,
      };
    }
  }

  /**
   * Calculate Customer Lifetime Value
   */
  async calculateLTV(userId: string): Promise<CustomerLifetimeValue> {
    try {
      const pool = getPool();

      const userMetrics = await pool.query(
        `SELECT 
           u.created_at as signup_date,
           COUNT(DISTINCT o.id) as order_count,
           COALESCE(SUM(o.total_amount), 0) as total_spent,
           COALESCE(AVG(o.total_amount), 0) as avg_order_value
         FROM users u
         LEFT JOIN orders o ON u.id = o.user_id
         WHERE u.id = $1
         GROUP BY u.id, u.created_at`,
        [userId]
      );

      if (userMetrics.rows.length === 0) {
        throw new Error('User not found');
      }

      const metrics = userMetrics.rows[0];
      const orderCount = parseInt(metrics.order_count) || 0;
      const currentValue = parseFloat(metrics.total_spent) || 0;
      const avgOrderValue = parseFloat(metrics.avg_order_value) || 0;

      // Calculate customer lifespan in months
      const accountAgeMonths = Math.max(
        1,
        Math.floor(
          (Date.now() - new Date(metrics.signup_date).getTime()) / (1000 * 60 * 60 * 24 * 30)
        )
      );

      // Predict future orders (simplified model)
      const purchaseFrequency = orderCount / accountAgeMonths;
      const expectedLifespanMonths = 24; // Assume 2 year average customer lifespan
      const expectedFutureOrders = Math.round(
        purchaseFrequency * (expectedLifespanMonths - accountAgeMonths)
      );

      // Calculate predicted LTV
      const predictedLTV = currentValue + expectedFutureOrders * avgOrderValue;

      // Determine customer segment
      let customerSegment: CustomerLifetimeValue['customerSegment'];
      if (accountAgeMonths < 3) {
        customerSegment = 'new';
      } else if (currentValue > 1000 || orderCount > 10) {
        customerSegment = 'vip';
      } else if (purchaseFrequency < 0.2) {
        customerSegment = purchaseFrequency === 0 ? 'churned' : 'at_risk';
      } else {
        customerSegment = 'regular';
      }

      return {
        userId,
        predictedLTV: Math.round(predictedLTV * 100) / 100,
        currentValue,
        expectedOrders: orderCount + Math.max(0, expectedFutureOrders),
        averageOrderValue: avgOrderValue,
        customerSegment,
      };
    } catch (error) {
      console.error('Failed to calculate LTV:', error);
      return {
        userId,
        predictedLTV: 0,
        currentValue: 0,
        expectedOrders: 0,
        averageOrderValue: 0,
        customerSegment: 'new',
      };
    }
  }

  /**
   * Predict flash sale performance
   */
  async predictFlashSalePerformance(
    productId: string,
    discountPercent: number,
    durationHours: number,
    quantity: number
  ): Promise<FlashSalePrediction> {
    try {
      const pool = getPool();

      // Get product info
      const productResult = await pool.query(
        `SELECT name, price, category FROM products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = productResult.rows[0];
      const salePrice = product.price * (1 - discountPercent / 100);

      // Get historical flash sale data for similar products
      const historicalResult = await pool.query(
        `SELECT 
           AVG(fs.total_sold::float / fs.quantity) as avg_sellthrough,
           AVG(EXTRACT(EPOCH FROM (fs.actual_end_time - fs.start_time))) as avg_duration
         FROM flash_sales fs
         JOIN products p ON fs.product_id = p.id
         WHERE p.category = $1 AND fs.status = 'completed'`,
        [product.category]
      );

      const historical = historicalResult.rows[0];
      const avgSellthrough = parseFloat(historical?.avg_sellthrough) || 0.7;

      // Estimate participants based on discount
      const discountFactor = 1 + (discountPercent / 100) * 2; // Higher discount = more participants
      const baseParticipants = 100;
      const predictedParticipants = Math.round(baseParticipants * discountFactor);

      // Estimate sellout time
      const expectedSalesPerHour = (quantity * avgSellthrough) / durationHours;
      const predictedSelloutTime = (quantity / expectedSalesPerHour) * 60; // in minutes

      // Calculate predicted revenue
      const predictedUnitsSold = Math.min(quantity, Math.round(quantity * avgSellthrough));
      const predictedRevenue = predictedUnitsSold * salePrice;

      // Calculate optimal discount
      const elasticity = -1.5;
      const optimalDiscount = Math.min(
        70,
        Math.max(10, Math.round(20 + (product.price > 100 ? 10 : 0) + (quantity > 100 ? 5 : 0)))
      );

      // Identify risk factors
      const riskFactors: string[] = [];
      if (quantity > 500) riskFactors.push('Large quantity may not sell out');
      if (discountPercent < 15) riskFactors.push('Discount may be too low');
      if (durationHours > 4) riskFactors.push('Long duration reduces urgency');

      return {
        productId,
        predictedParticipants,
        predictedRevenue: Math.round(predictedRevenue * 100) / 100,
        predictedSelloutTime: Math.round(predictedSelloutTime),
        optimalDiscount,
        confidenceScore: Math.min(0.9, 0.6 + avgSellthrough * 0.3),
        riskFactors,
      };
    } catch (error) {
      console.error('Failed to predict flash sale performance:', error);
      return {
        productId,
        predictedParticipants: 50,
        predictedRevenue: 0,
        predictedSelloutTime: 60,
        optimalDiscount: 25,
        confidenceScore: 0.5,
        riskFactors: ['Insufficient historical data'],
      };
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getDashboardData(): Promise<AnalyticsDashboard> {
    try {
      const pool = getPool();

      // Get overview metrics
      const overviewResult = await pool.query(
        `SELECT 
           COALESCE(SUM(total_amount), 0) as total_revenue,
           COUNT(*) as total_orders,
           COUNT(DISTINCT user_id) as total_customers,
           COALESCE(AVG(total_amount), 0) as avg_order_value
         FROM orders
         WHERE created_at > NOW() - INTERVAL '30 days'`
      );

      const overview = overviewResult.rows[0];

      // Get conversion rate (simplified)
      const conversionRate = 0.035; // 3.5% placeholder

      // Get forecasts
      const forecast = await this.generateSalesForecast(30, 'daily');
      const nextDayRevenue = forecast.predictions[0]?.predictedRevenue || 0;
      const nextWeekRevenue = forecast.predictions
        .slice(0, 7)
        .reduce((sum, p) => sum + p.predictedRevenue, 0);
      const nextMonthRevenue = forecast.predictions.reduce((sum, p) => sum + p.predictedRevenue, 0);

      // Get risk counts
      const inventoryResult = await pool.query(
        `SELECT COUNT(*) as count FROM inventory WHERE quantity < 10`
      );
      const inventoryAlerts = parseInt(inventoryResult.rows[0]?.count) || 0;

      // Generate insights
      const insights: string[] = [];
      if (forecast.trend === 'increasing') {
        insights.push('Sales are trending upward - consider increasing inventory');
      }
      if (inventoryAlerts > 5) {
        insights.push(`${inventoryAlerts} products running low on stock`);
      }
      if (parseFloat(overview.avg_order_value) > 100) {
        insights.push('AOV is healthy - focus on customer acquisition');
      }

      return {
        overview: {
          totalRevenue: parseFloat(overview.total_revenue) || 0,
          totalOrders: parseInt(overview.total_orders) || 0,
          totalCustomers: parseInt(overview.total_customers) || 0,
          averageOrderValue: parseFloat(overview.avg_order_value) || 0,
          conversionRate,
        },
        forecasts: {
          nextDayRevenue,
          nextWeekRevenue,
          nextMonthRevenue,
        },
        risks: {
          inventoryAlerts,
          churnRisk: 0, // Would need to aggregate churn predictions
          fraudAlerts: 0, // Would get from fraud service
        },
        insights,
      };
    } catch (error) {
      console.error('Failed to get dashboard data:', error);
      return {
        overview: {
          totalRevenue: 0,
          totalOrders: 0,
          totalCustomers: 0,
          averageOrderValue: 0,
          conversionRate: 0,
        },
        forecasts: { nextDayRevenue: 0, nextWeekRevenue: 0, nextMonthRevenue: 0 },
        risks: { inventoryAlerts: 0, churnRisk: 0, fraudAlerts: 0 },
        insights: [],
      };
    }
  }

  // Private helper methods

  private calculateTrend(data: any[]): number {
    if (data.length < 2) return 0;

    // Simple linear regression
    const n = data.length;
    const xMean = (n - 1) / 2;
    const yMean = data.reduce((sum, d) => sum + parseFloat(d.revenue || '0'), 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (parseFloat(data[i].revenue || '0') - yMean);
      denominator += (i - xMean) ** 2;
    }

    return denominator === 0 ? 0 : numerator / denominator / yMean;
  }

  private calculateSeasonality(data: any[]): SeasonalityFactor[] {
    const factors: SeasonalityFactor[] = [];

    // Day of week seasonality
    const dayFactors = [0.8, 1.1, 1.0, 1.0, 1.1, 1.2, 0.9]; // Sun-Sat
    const maxDay = dayFactors.indexOf(Math.max(...dayFactors));
    factors.push({
      type: 'day_of_week',
      factor: dayFactors[maxDay],
      description: `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][maxDay]} is peak day`,
    });

    return factors;
  }

  private getDayOfWeekFactor(day: number): number {
    const factors = [0.8, 1.1, 1.0, 1.0, 1.1, 1.2, 0.9];
    return factors[day] || 1.0;
  }

  private getDefaultForecast(days: number, period: 'daily' | 'weekly' | 'monthly'): SalesForecast {
    const predictions = [];
    for (let i = 1; i <= days; i++) {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + i);
      predictions.push({
        date: futureDate,
        predictedSales: 10,
        predictedRevenue: 1000,
        confidence: 0.5,
        upperBound: 1500,
        lowerBound: 500,
      });
    }

    return {
      period,
      predictions,
      trend: 'stable',
      seasonality: [],
      accuracy: 0.5,
    };
  }
}

// Export singleton instance
export const predictiveAnalyticsService = new PredictiveAnalyticsService();
export default predictiveAnalyticsService;
