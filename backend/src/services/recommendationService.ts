/**
 * Recommendation Engine Service
 * Week 5 Day 2: AI & Machine Learning Features
 *
 * Features:
 * - User behavior tracking
 * - Collaborative filtering
 * - Content-based recommendations
 * - Hybrid recommendation system
 * - Real-time recommendation API
 * - A/B testing support
 */

import { getPool } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Types
export interface UserBehavior {
  userId: string;
  productId: string;
  action: 'view' | 'click' | 'add_to_cart' | 'purchase' | 'wishlist';
  timestamp: Date;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface ProductSimilarity {
  productId: string;
  similarProductId: string;
  score: number;
  algorithm: 'content' | 'collaborative' | 'hybrid';
}

export interface Recommendation {
  productId: string;
  name: string;
  price: number;
  imageUrl?: string;
  score: number;
  reason: string;
  algorithm: string;
}

export interface RecommendationConfig {
  maxRecommendations: number;
  includeContentBased: boolean;
  includeCollaborative: boolean;
  diversityFactor: number; // 0-1, higher = more diverse
  recencyWeight: number; // 0-1, higher = prefer recent interactions
}

// Action weights for scoring
const ACTION_WEIGHTS = {
  view: 1,
  click: 2,
  add_to_cart: 5,
  wishlist: 4,
  purchase: 10,
};

// Cache TTL
const RECOMMENDATION_CACHE_TTL = 300; // 5 minutes
const BEHAVIOR_CACHE_TTL = 3600; // 1 hour

class RecommendationService {
  private defaultConfig: RecommendationConfig = {
    maxRecommendations: 10,
    includeContentBased: true,
    includeCollaborative: true,
    diversityFactor: 0.3,
    recencyWeight: 0.5,
  };

  /**
   * Track user behavior for recommendation system
   */
  async trackBehavior(behavior: UserBehavior): Promise<void> {
    const { userId, productId, action, timestamp, sessionId, metadata } = behavior;

    try {
      // Store in database
      const pool = getPool();
      await pool.query(
        `INSERT INTO user_behaviors (user_id, product_id, action, session_id, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, productId, action, sessionId, JSON.stringify(metadata || {}), timestamp]
      );

      // Update Redis for real-time recommendations
      if (isRedisConnected()) {
        // User's recent actions
        const userActionsKey = `${REDIS_KEYS.RECOMMENDATION_PREFIX}:user:${userId}:actions`;
        await redisClient.zadd(
          userActionsKey,
          Date.now(),
          JSON.stringify({ productId, action, weight: ACTION_WEIGHTS[action] })
        );
        await redisClient.expire(userActionsKey, BEHAVIOR_CACHE_TTL);

        // Product view count
        const productViewsKey = `${REDIS_KEYS.RECOMMENDATION_PREFIX}:product:${productId}:views`;
        await redisClient.incr(productViewsKey);
        await redisClient.expire(productViewsKey, BEHAVIOR_CACHE_TTL);

        // Invalidate user's recommendation cache
        await redisClient.del(`${REDIS_KEYS.RECOMMENDATION_PREFIX}:user:${userId}:recommendations`);
      }

      console.log(`📊 Tracked behavior: ${action} for product ${productId} by user ${userId}`);
    } catch (error) {
      console.error('Failed to track behavior:', error);
      throw error;
    }
  }

  /**
   * Get personalized recommendations for a user
   */
  async getRecommendations(
    userId: string,
    config: Partial<RecommendationConfig> = {}
  ): Promise<Recommendation[]> {
    const finalConfig = { ...this.defaultConfig, ...config };

    try {
      // Check cache first
      if (isRedisConnected()) {
        const cached = await redisClient.get(
          `${REDIS_KEYS.RECOMMENDATION_PREFIX}:user:${userId}:recommendations`
        );
        if (cached) {
          return JSON.parse(cached);
        }
      }

      // Get user's behavior history
      const userHistory = await this.getUserBehaviorHistory(userId);

      // Generate recommendations using different algorithms
      const recommendations: Recommendation[] = [];

      if (finalConfig.includeCollaborative) {
        const collaborative = await this.collaborativeFiltering(userId, userHistory);
        recommendations.push(...collaborative);
      }

      if (finalConfig.includeContentBased) {
        const contentBased = await this.contentBasedFiltering(userId, userHistory);
        recommendations.push(...contentBased);
      }

      // Combine and rank recommendations (hybrid approach)
      const ranked = this.rankRecommendations(recommendations, finalConfig);

      // Apply diversity
      const diverse = this.applyDiversity(ranked, finalConfig.diversityFactor);

      // Limit to max recommendations
      const final = diverse.slice(0, finalConfig.maxRecommendations);

      // Cache results
      if (isRedisConnected() && final.length > 0) {
        await redisClient.setex(
          `${REDIS_KEYS.RECOMMENDATION_PREFIX}:user:${userId}:recommendations`,
          RECOMMENDATION_CACHE_TTL,
          JSON.stringify(final)
        );
      }

      return final;
    } catch (error) {
      console.error('Failed to get recommendations:', error);
      // Return popular products as fallback
      return this.getPopularProducts(finalConfig.maxRecommendations);
    }
  }

  /**
   * Get similar products for a given product
   */
  async getSimilarProducts(productId: string, limit = 5): Promise<Recommendation[]> {
    try {
      // Check cache
      if (isRedisConnected()) {
        const cached = await redisClient.get(
          `${REDIS_KEYS.RECOMMENDATION_PREFIX}:product:${productId}:similar`
        );
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const pool = getPool();

      // Get product details for content-based similarity
      const productResult = await pool.query(
        'SELECT category, tags, price FROM products WHERE id = $1',
        [productId]
      );

      if (productResult.rows.length === 0) {
        return [];
      }

      const product = productResult.rows[0];

      // Find similar products by category and price range
      const similarResult = await pool.query(
        `SELECT p.id, p.name, p.price, p.image_url,
                CASE 
                  WHEN p.category = $1 THEN 0.5
                  ELSE 0
                END +
                CASE 
                  WHEN ABS(p.price - $2) < $2 * 0.3 THEN 0.3
                  ELSE 0
                END as score
         FROM products p
         WHERE p.id != $3 AND p.is_active = true
         ORDER BY score DESC, RANDOM()
         LIMIT $4`,
        [product.category, product.price, productId, limit]
      );

      const recommendations: Recommendation[] = similarResult.rows.map((row) => ({
        productId: row.id,
        name: row.name,
        price: row.price,
        imageUrl: row.image_url,
        score: row.score,
        reason: 'Similar to items you viewed',
        algorithm: 'content',
      }));

      // Cache results
      if (isRedisConnected() && recommendations.length > 0) {
        await redisClient.setex(
          `${REDIS_KEYS.RECOMMENDATION_PREFIX}:product:${productId}:similar`,
          RECOMMENDATION_CACHE_TTL,
          JSON.stringify(recommendations)
        );
      }

      return recommendations;
    } catch (error) {
      console.error('Failed to get similar products:', error);
      return [];
    }
  }

  /**
   * Get trending products based on recent activity
   */
  async getTrendingProducts(limit = 10): Promise<Recommendation[]> {
    try {
      const pool = getPool();

      const result = await pool.query(
        `SELECT p.id, p.name, p.price, p.image_url,
                COUNT(DISTINCT ub.user_id) as unique_users,
                SUM(CASE ub.action 
                  WHEN 'purchase' THEN 10
                  WHEN 'add_to_cart' THEN 5
                  WHEN 'wishlist' THEN 4
                  WHEN 'click' THEN 2
                  ELSE 1
                END) as engagement_score
         FROM products p
         LEFT JOIN user_behaviors ub ON p.id = ub.product_id
           AND ub.created_at > NOW() - INTERVAL '24 hours'
         WHERE p.is_active = true
         GROUP BY p.id
         ORDER BY engagement_score DESC, unique_users DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        productId: row.id,
        name: row.name,
        price: row.price,
        imageUrl: row.image_url,
        score: parseFloat(row.engagement_score) || 0,
        reason: 'Trending now',
        algorithm: 'trending',
      }));
    } catch (error) {
      console.error('Failed to get trending products:', error);
      return [];
    }
  }

  /**
   * Get "Customers also bought" recommendations
   */
  async getFrequentlyBoughtTogether(productId: string, limit = 5): Promise<Recommendation[]> {
    try {
      const pool = getPool();

      // Find products frequently purchased together
      const result = await pool.query(
        `WITH product_orders AS (
           SELECT DISTINCT oi.order_id
           FROM order_items oi
           WHERE oi.product_id = $1
         )
         SELECT p.id, p.name, p.price, p.image_url,
                COUNT(*) as co_purchase_count
         FROM products p
         JOIN order_items oi ON p.id = oi.product_id
         WHERE oi.order_id IN (SELECT order_id FROM product_orders)
           AND p.id != $1
           AND p.is_active = true
         GROUP BY p.id
         ORDER BY co_purchase_count DESC
         LIMIT $2`,
        [productId, limit]
      );

      return result.rows.map((row) => ({
        productId: row.id,
        name: row.name,
        price: row.price,
        imageUrl: row.image_url,
        score: row.co_purchase_count,
        reason: 'Frequently bought together',
        algorithm: 'collaborative',
      }));
    } catch (error) {
      console.error('Failed to get frequently bought together:', error);
      return [];
    }
  }

  /**
   * A/B test recommendation algorithms
   */
  async getABTestRecommendations(
    userId: string,
    testId: string
  ): Promise<{ variant: string; recommendations: Recommendation[] }> {
    // Simple A/B test assignment based on user ID hash
    const hash = userId.split('').reduce((a, b) => (a << 5) - a + b.charCodeAt(0), 0);
    const variant = Math.abs(hash) % 2 === 0 ? 'A' : 'B';

    let recommendations: Recommendation[];

    if (variant === 'A') {
      // Control: Standard hybrid recommendations
      recommendations = await this.getRecommendations(userId);
    } else {
      // Variant B: More personalized (higher collaborative weight)
      recommendations = await this.getRecommendations(userId, {
        includeContentBased: false,
        includeCollaborative: true,
      });
    }

    // Log A/B test assignment
    console.log(`🧪 A/B Test ${testId}: User ${userId} assigned to variant ${variant}`);

    return { variant, recommendations };
  }

  // Private helper methods

  private async getUserBehaviorHistory(userId: string): Promise<UserBehavior[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT product_id, action, created_at as timestamp
       FROM user_behaviors
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    return result.rows.map((row) => ({
      userId,
      productId: row.product_id,
      action: row.action,
      timestamp: row.timestamp,
    }));
  }

  private async collaborativeFiltering(
    userId: string,
    userHistory: UserBehavior[]
  ): Promise<Recommendation[]> {
    if (userHistory.length === 0) {
      return this.getPopularProducts(10);
    }

    const pool = getPool();
    const viewedProducts = userHistory.map((h) => h.productId);

    // Find users with similar behavior
    const result = await pool.query(
      `WITH similar_users AS (
         SELECT ub.user_id, COUNT(*) as overlap
         FROM user_behaviors ub
         WHERE ub.product_id = ANY($1) AND ub.user_id != $2
         GROUP BY ub.user_id
         HAVING COUNT(*) > 2
         ORDER BY overlap DESC
         LIMIT 50
       )
       SELECT p.id, p.name, p.price, p.image_url,
              COUNT(DISTINCT su.user_id) as user_count,
              SUM(su.overlap) as total_overlap
       FROM products p
       JOIN user_behaviors ub ON p.id = ub.product_id
       JOIN similar_users su ON ub.user_id = su.user_id
       WHERE p.id != ALL($1) AND p.is_active = true
       GROUP BY p.id
       ORDER BY total_overlap DESC
       LIMIT 20`,
      [viewedProducts, userId]
    );

    return result.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      price: row.price,
      imageUrl: row.image_url,
      score: parseFloat(row.total_overlap) || 0,
      reason: 'Users like you also liked',
      algorithm: 'collaborative',
    }));
  }

  private async contentBasedFiltering(
    userId: string,
    userHistory: UserBehavior[]
  ): Promise<Recommendation[]> {
    if (userHistory.length === 0) {
      return [];
    }

    const pool = getPool();
    const viewedProducts = userHistory.slice(0, 10).map((h) => h.productId);

    // Get categories and price ranges of viewed products
    const result = await pool.query(
      `WITH user_preferences AS (
         SELECT DISTINCT p.category,
                AVG(p.price) as avg_price
         FROM products p
         WHERE p.id = ANY($1)
         GROUP BY p.category
       )
       SELECT p.id, p.name, p.price, p.image_url,
              1.0 as score
       FROM products p
       JOIN user_preferences up ON p.category = up.category
       WHERE p.id != ALL($1) 
         AND p.is_active = true
         AND p.price BETWEEN up.avg_price * 0.5 AND up.avg_price * 2
       ORDER BY RANDOM()
       LIMIT 20`,
      [viewedProducts]
    );

    return result.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      price: row.price,
      imageUrl: row.image_url,
      score: row.score,
      reason: 'Based on your interests',
      algorithm: 'content',
    }));
  }

  private rankRecommendations(
    recommendations: Recommendation[],
    config: RecommendationConfig
  ): Recommendation[] {
    // Combine scores from different algorithms
    const productScores = new Map<string, { rec: Recommendation; score: number; count: number }>();

    recommendations.forEach((rec) => {
      const existing = productScores.get(rec.productId);
      if (existing) {
        existing.score += rec.score;
        existing.count += 1;
      } else {
        productScores.set(rec.productId, { rec, score: rec.score, count: 1 });
      }
    });

    // Calculate final scores
    const ranked = Array.from(productScores.values())
      .map(({ rec, score, count }) => ({
        ...rec,
        score: (score / count) * (1 + count * 0.1), // Bonus for appearing in multiple algorithms
      }))
      .sort((a, b) => b.score - a.score);

    return ranked;
  }

  private applyDiversity(
    recommendations: Recommendation[],
    diversityFactor: number
  ): Recommendation[] {
    if (diversityFactor === 0 || recommendations.length <= 2) {
      return recommendations;
    }

    // Simple diversity: re-order to spread out similar items
    const result: Recommendation[] = [];
    const remaining = [...recommendations];
    const usedCategories = new Set<string>();

    while (remaining.length > 0 && result.length < recommendations.length) {
      // Pick items that add diversity
      const nextIndex = remaining.findIndex((rec, idx) => {
        if (idx === 0) return true; // Always include top recommendation
        // Simple diversity heuristic
        return Math.random() < diversityFactor;
      });

      const item = remaining.splice(nextIndex >= 0 ? nextIndex : 0, 1)[0];
      result.push(item);
    }

    return result;
  }

  private async getPopularProducts(limit: number): Promise<Recommendation[]> {
    const pool = getPool();

    const result = await pool.query(
      `SELECT p.id, p.name, p.price, p.image_url
       FROM products p
       WHERE p.is_active = true
       ORDER BY p.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map((row) => ({
      productId: row.id,
      name: row.name,
      price: row.price,
      imageUrl: row.image_url,
      score: 0,
      reason: 'Popular products',
      algorithm: 'fallback',
    }));
  }
}

// Export singleton instance
export const recommendationService = new RecommendationService();
export default recommendationService;
