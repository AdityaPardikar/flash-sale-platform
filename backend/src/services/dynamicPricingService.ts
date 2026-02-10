/**
 * Dynamic Pricing Engine Service
 * Week 5 Day 2: AI & Machine Learning Features
 *
 * Features:
 * - Demand prediction model
 * - Competition price analysis
 * - Dynamic pricing algorithms
 * - Price optimization
 * - Revenue maximization
 * - Price change notifications
 */

import { getPool } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Types
export interface PricingFactors {
  basePrice: number;
  demandMultiplier: number;
  inventoryMultiplier: number;
  timeMultiplier: number;
  competitorMultiplier: number;
  seasonalMultiplier: number;
  userSegmentMultiplier: number;
}

export interface PriceRecommendation {
  productId: string;
  currentPrice: number;
  recommendedPrice: number;
  minPrice: number;
  maxPrice: number;
  confidence: number;
  factors: PricingFactors;
  expectedRevenue: number;
  expectedDemand: number;
  reason: string;
}

export interface DemandPrediction {
  productId: string;
  currentDemand: number;
  predictedDemand: number;
  demandTrend: 'increasing' | 'stable' | 'decreasing';
  confidence: number;
  peakHours: number[];
  predictedSoldOutTime?: Date;
}

export interface PricingRule {
  id: string;
  name: string;
  condition: string;
  priceAdjustment: number; // Percentage
  priority: number;
  isActive: boolean;
}

// Constants
const PRICING_CACHE_TTL = 60; // 1 minute
const DEMAND_ANALYSIS_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in ms

class DynamicPricingService {
  // Pricing boundaries
  private readonly MIN_PRICE_FACTOR = 0.7; // Minimum 70% of base price
  private readonly MAX_PRICE_FACTOR = 1.5; // Maximum 150% of base price
  private readonly FLASH_SALE_MIN_DISCOUNT = 0.1; // Minimum 10% discount for flash sales
  private readonly FLASH_SALE_MAX_DISCOUNT = 0.7; // Maximum 70% discount for flash sales

  /**
   * Calculate optimal price for a product
   */
  async calculateOptimalPrice(
    productId: string,
    options: {
      isFlashSale?: boolean;
      targetMargin?: number;
      userSegment?: string;
    } = {}
  ): Promise<PriceRecommendation> {
    const { isFlashSale = false, targetMargin = 0.2, userSegment } = options;

    try {
      // Check cache
      const cacheKey = `${REDIS_KEYS.PRICING_PREFIX}:optimal:${productId}`;
      if (isRedisConnected()) {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Get product base data
      const pool = getPool();
      const productResult = await pool.query(
        `SELECT id, name, price as base_price, cost_price, category
         FROM products WHERE id = $1`,
        [productId]
      );

      if (productResult.rows.length === 0) {
        throw new Error('Product not found');
      }

      const product = productResult.rows[0];
      const basePrice = product.base_price;
      const costPrice = product.cost_price || basePrice * 0.5;

      // Calculate pricing factors
      const factors = await this.calculatePricingFactors(productId, basePrice, userSegment);

      // Calculate optimal price
      let optimalPrice = basePrice;
      optimalPrice *= factors.demandMultiplier;
      optimalPrice *= factors.inventoryMultiplier;
      optimalPrice *= factors.timeMultiplier;
      optimalPrice *= factors.competitorMultiplier;
      optimalPrice *= factors.seasonalMultiplier;
      optimalPrice *= factors.userSegmentMultiplier;

      // Apply flash sale discount if needed
      if (isFlashSale) {
        const discountFactor =
          1 -
          (this.FLASH_SALE_MIN_DISCOUNT +
            Math.random() * (this.FLASH_SALE_MAX_DISCOUNT - this.FLASH_SALE_MIN_DISCOUNT));
        optimalPrice = Math.min(optimalPrice, basePrice * discountFactor);
      }

      // Ensure within boundaries
      const minPrice = Math.max(costPrice * (1 + targetMargin), basePrice * this.MIN_PRICE_FACTOR);
      const maxPrice = basePrice * this.MAX_PRICE_FACTOR;
      optimalPrice = Math.max(minPrice, Math.min(maxPrice, optimalPrice));

      // Round to nice price point
      optimalPrice = this.roundToNicePrice(optimalPrice);

      // Calculate expected metrics
      const expectedDemand = this.estimateDemand(basePrice, optimalPrice, factors);
      const expectedRevenue = optimalPrice * expectedDemand;

      const recommendation: PriceRecommendation = {
        productId,
        currentPrice: basePrice,
        recommendedPrice: optimalPrice,
        minPrice,
        maxPrice,
        confidence: this.calculateConfidence(factors),
        factors,
        expectedRevenue,
        expectedDemand,
        reason: this.generatePriceReason(factors, isFlashSale),
      };

      // Cache result
      if (isRedisConnected()) {
        await redisClient.setex(cacheKey, PRICING_CACHE_TTL, JSON.stringify(recommendation));
      }

      return recommendation;
    } catch (error) {
      console.error('Failed to calculate optimal price:', error);
      throw error;
    }
  }

  /**
   * Predict demand for a product
   */
  async predictDemand(productId: string): Promise<DemandPrediction> {
    try {
      const pool = getPool();

      // Get historical sales data
      const salesResult = await pool.query(
        `SELECT 
           DATE_TRUNC('hour', created_at) as hour,
           COUNT(*) as sales_count
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.product_id = $1 
           AND o.created_at > NOW() - INTERVAL '7 days'
         GROUP BY DATE_TRUNC('hour', created_at)
         ORDER BY hour DESC`,
        [productId]
      );

      // Get current inventory
      const inventoryResult = await pool.query(
        `SELECT quantity FROM inventory WHERE product_id = $1`,
        [productId]
      );

      const currentInventory = inventoryResult.rows[0]?.quantity || 0;

      // Analyze sales pattern
      const hourlyAvg =
        salesResult.rows.length > 0
          ? salesResult.rows.reduce((sum, r) => sum + parseInt(r.sales_count), 0) /
            salesResult.rows.length
          : 0;

      // Calculate current and predicted demand
      const currentDemand = hourlyAvg;

      // Simple prediction: recent trend weighted average
      const recentSales = salesResult.rows.slice(0, 24); // Last 24 hours
      const olderSales = salesResult.rows.slice(24);

      const recentAvg =
        recentSales.length > 0
          ? recentSales.reduce((sum, r) => sum + parseInt(r.sales_count), 0) / recentSales.length
          : hourlyAvg;

      const olderAvg =
        olderSales.length > 0
          ? olderSales.reduce((sum, r) => sum + parseInt(r.sales_count), 0) / olderSales.length
          : hourlyAvg;

      const trend =
        recentAvg > olderAvg * 1.1
          ? 'increasing'
          : recentAvg < olderAvg * 0.9
            ? 'decreasing'
            : 'stable';

      // Predict demand with trend adjustment
      const trendMultiplier = trend === 'increasing' ? 1.1 : trend === 'decreasing' ? 0.9 : 1.0;
      const predictedDemand = recentAvg * trendMultiplier;

      // Find peak hours
      const hourCounts = new Map<number, number>();
      salesResult.rows.forEach((row) => {
        const hour = new Date(row.hour).getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + parseInt(row.sales_count));
      });

      const peakHours = Array.from(hourCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hour]) => hour);

      // Estimate sold out time
      let predictedSoldOutTime: Date | undefined;
      if (currentInventory > 0 && predictedDemand > 0) {
        const hoursToSoldOut = currentInventory / predictedDemand;
        if (hoursToSoldOut < 168) {
          // Less than 1 week
          predictedSoldOutTime = new Date(Date.now() + hoursToSoldOut * 60 * 60 * 1000);
        }
      }

      return {
        productId,
        currentDemand,
        predictedDemand,
        demandTrend: trend,
        confidence: Math.min(0.95, salesResult.rows.length / 100 + 0.5),
        peakHours,
        predictedSoldOutTime,
      };
    } catch (error) {
      console.error('Failed to predict demand:', error);
      throw error;
    }
  }

  /**
   * Analyze competitor prices (simulated)
   */
  async analyzeCompetitorPrices(productId: string): Promise<{
    averagePrice: number;
    lowestPrice: number;
    highestPrice: number;
    ourPosition: 'lowest' | 'competitive' | 'highest';
    recommendation: string;
  }> {
    // In a real system, this would scrape or API-call competitor prices
    // For now, simulate competitor analysis
    const pool = getPool();
    const productResult = await pool.query('SELECT price FROM products WHERE id = $1', [productId]);

    if (productResult.rows.length === 0) {
      throw new Error('Product not found');
    }

    const ourPrice = productResult.rows[0].price;

    // Simulated competitor prices (±20% of our price)
    const competitorPrices = [ourPrice * 0.85, ourPrice * 0.95, ourPrice * 1.05, ourPrice * 1.15];

    const averagePrice = competitorPrices.reduce((a, b) => a + b, 0) / competitorPrices.length;
    const lowestPrice = Math.min(...competitorPrices);
    const highestPrice = Math.max(...competitorPrices);

    const ourPosition =
      ourPrice < averagePrice * 0.95
        ? 'lowest'
        : ourPrice > averagePrice * 1.05
          ? 'highest'
          : 'competitive';

    const recommendation =
      ourPosition === 'highest'
        ? 'Consider reducing price to be more competitive'
        : ourPosition === 'lowest'
          ? 'Price is competitive, could increase slightly for better margins'
          : 'Price is well-positioned in the market';

    return {
      averagePrice: Math.round(averagePrice * 100) / 100,
      lowestPrice: Math.round(lowestPrice * 100) / 100,
      highestPrice: Math.round(highestPrice * 100) / 100,
      ourPosition,
      recommendation,
    };
  }

  /**
   * Get flash sale pricing recommendation
   */
  async getFlashSalePricing(
    productId: string,
    targetUnits: number,
    saleDurationHours: number
  ): Promise<{
    recommendedDiscount: number;
    recommendedPrice: number;
    expectedUnitsSold: number;
    expectedRevenue: number;
    profitMargin: number;
  }> {
    const demand = await this.predictDemand(productId);
    const priceRec = await this.calculateOptimalPrice(productId, { isFlashSale: true });

    // Calculate discount needed to sell target units
    const baselineSales = demand.predictedDemand * saleDurationHours;
    const salesBoostNeeded = targetUnits / Math.max(baselineSales, 1);

    // Assume each 10% discount increases demand by 25%
    const discountNeeded = Math.min(
      this.FLASH_SALE_MAX_DISCOUNT,
      Math.max(this.FLASH_SALE_MIN_DISCOUNT, (salesBoostNeeded - 1) * 0.4)
    );

    const recommendedPrice = priceRec.currentPrice * (1 - discountNeeded);
    const expectedUnitsSold = Math.min(targetUnits, baselineSales * (1 + discountNeeded * 2.5));
    const expectedRevenue = recommendedPrice * expectedUnitsSold;

    // Assume 40% cost
    const profitMargin = (recommendedPrice - priceRec.currentPrice * 0.4) / recommendedPrice;

    return {
      recommendedDiscount: Math.round(discountNeeded * 100),
      recommendedPrice: this.roundToNicePrice(recommendedPrice),
      expectedUnitsSold: Math.round(expectedUnitsSold),
      expectedRevenue: Math.round(expectedRevenue * 100) / 100,
      profitMargin: Math.round(profitMargin * 100),
    };
  }

  /**
   * Apply pricing rules
   */
  async applyPricingRules(
    productId: string,
    basePrice: number
  ): Promise<{
    adjustedPrice: number;
    appliedRules: string[];
  }> {
    // Get active pricing rules
    const rules = await this.getActivePricingRules();
    const appliedRules: string[] = [];
    let adjustedPrice = basePrice;

    for (const rule of rules) {
      const applies = await this.evaluateRule(rule, productId);
      if (applies) {
        adjustedPrice *= 1 + rule.priceAdjustment / 100;
        appliedRules.push(rule.name);
      }
    }

    return {
      adjustedPrice: this.roundToNicePrice(adjustedPrice),
      appliedRules,
    };
  }

  // Private helper methods

  private async calculatePricingFactors(
    productId: string,
    basePrice: number,
    userSegment?: string
  ): Promise<PricingFactors> {
    // Get demand factor
    const demandPrediction = await this.predictDemand(productId);
    const demandMultiplier =
      demandPrediction.demandTrend === 'increasing'
        ? 1.05
        : demandPrediction.demandTrend === 'decreasing'
          ? 0.95
          : 1.0;

    // Get inventory factor
    const pool = getPool();
    const inventoryResult = await pool.query(
      'SELECT quantity FROM inventory WHERE product_id = $1',
      [productId]
    );
    const inventory = inventoryResult.rows[0]?.quantity || 0;
    const inventoryMultiplier = inventory < 10 ? 1.1 : inventory > 100 ? 0.95 : 1.0;

    // Time-based factor (higher prices during peak hours)
    const hour = new Date().getHours();
    const isPeakHour = hour >= 10 && hour <= 22;
    const timeMultiplier = isPeakHour ? 1.02 : 0.98;

    // Seasonal factor (simplified)
    const month = new Date().getMonth();
    const isHolidaySeason = month === 11 || month === 0; // Dec, Jan
    const seasonalMultiplier = isHolidaySeason ? 1.05 : 1.0;

    // Competitor factor
    const competitorAnalysis = await this.analyzeCompetitorPrices(productId);
    const competitorMultiplier =
      competitorAnalysis.ourPosition === 'highest'
        ? 0.97
        : competitorAnalysis.ourPosition === 'lowest'
          ? 1.03
          : 1.0;

    // User segment factor
    const userSegmentMultiplier = userSegment === 'vip' ? 0.95 : 1.0;

    return {
      basePrice,
      demandMultiplier,
      inventoryMultiplier,
      timeMultiplier,
      competitorMultiplier,
      seasonalMultiplier,
      userSegmentMultiplier,
    };
  }

  private roundToNicePrice(price: number): number {
    if (price < 10) {
      return Math.round(price * 100) / 100;
    } else if (price < 100) {
      return Math.round(price * 10) / 10;
    } else {
      // Round to .99
      return Math.floor(price) + 0.99;
    }
  }

  private estimateDemand(basePrice: number, newPrice: number, factors: PricingFactors): number {
    // Price elasticity estimation (-1.5 typical for consumer goods)
    const priceChange = (newPrice - basePrice) / basePrice;
    const elasticity = -1.5;
    const demandChange = 1 + priceChange * elasticity;

    // Base demand estimate (simplified)
    const baseDemand = 100 * factors.demandMultiplier;
    return Math.max(0, baseDemand * demandChange);
  }

  private calculateConfidence(factors: PricingFactors): number {
    // Higher confidence when factors are closer to 1.0
    const deviations = [
      Math.abs(factors.demandMultiplier - 1),
      Math.abs(factors.inventoryMultiplier - 1),
      Math.abs(factors.competitorMultiplier - 1),
    ];
    const avgDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    return Math.max(0.5, 0.95 - avgDeviation);
  }

  private generatePriceReason(factors: PricingFactors, isFlashSale: boolean): string {
    const reasons: string[] = [];

    if (isFlashSale) {
      reasons.push('Flash sale discount applied');
    }

    if (factors.demandMultiplier > 1.02) {
      reasons.push('High demand');
    } else if (factors.demandMultiplier < 0.98) {
      reasons.push('Lower demand');
    }

    if (factors.inventoryMultiplier > 1.02) {
      reasons.push('Limited stock');
    }

    if (factors.seasonalMultiplier > 1.02) {
      reasons.push('Holiday season');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Market-optimized pricing';
  }

  private async getActivePricingRules(): Promise<PricingRule[]> {
    // Simulated rules - in production, these would be in the database
    return [
      {
        id: '1',
        name: 'New Customer Discount',
        condition: 'user.is_new',
        priceAdjustment: -5,
        priority: 1,
        isActive: true,
      },
      {
        id: '2',
        name: 'Weekend Premium',
        condition: 'time.is_weekend',
        priceAdjustment: 2,
        priority: 2,
        isActive: true,
      },
    ];
  }

  private async evaluateRule(rule: PricingRule, productId: string): Promise<boolean> {
    // Simplified rule evaluation
    switch (rule.condition) {
      case 'time.is_weekend':
        const day = new Date().getDay();
        return day === 0 || day === 6;
      default:
        return false;
    }
  }
}

// Export singleton instance
export const dynamicPricingService = new DynamicPricingService();
export default dynamicPricingService;
