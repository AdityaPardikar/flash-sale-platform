/**
 * VIP Membership & Priority System Service
 * Week 5 Day 3: Advanced Queue Features & VIP System
 *
 * Features:
 * - VIP membership tiers (Bronze, Silver, Gold, Platinum)
 * - Priority queue access
 * - Early access to flash sales
 * - Subscription management
 * - VIP benefits calculation
 * - Membership upgrades
 */

import { getPool } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// VIP Tier Definitions
export enum VIPTier {
  STANDARD = 'standard',
  BRONZE = 'bronze',
  SILVER = 'silver',
  GOLD = 'gold',
  PLATINUM = 'platinum',
}

export interface VIPBenefits {
  tier: VIPTier;
  queuePriority: number; // 1-5, higher = more priority
  earlyAccessMinutes: number;
  discountPercentage: number;
  exclusiveDeals: boolean;
  freeShipping: boolean;
  dedicatedSupport: boolean;
  flashSaleBoost: number; // Multiplier for purchase probability
  maxReservations: number;
  reservationExtensionMinutes: number;
}

export interface VIPMembership {
  userId: string;
  tier: VIPTier;
  startDate: Date;
  expiryDate: Date;
  isActive: boolean;
  pointsEarned: number;
  totalSpent: number;
  benefits: VIPBenefits;
  autoRenew: boolean;
  subscriptionId?: string;
}

export interface VIPUpgradeRequirement {
  tier: VIPTier;
  minSpend: number;
  minOrders: number;
  minPoints: number;
}

// VIP Configuration
const VIP_BENEFITS: Record<VIPTier, VIPBenefits> = {
  [VIPTier.STANDARD]: {
    tier: VIPTier.STANDARD,
    queuePriority: 1,
    earlyAccessMinutes: 0,
    discountPercentage: 0,
    exclusiveDeals: false,
    freeShipping: false,
    dedicatedSupport: false,
    flashSaleBoost: 1.0,
    maxReservations: 1,
    reservationExtensionMinutes: 0,
  },
  [VIPTier.BRONZE]: {
    tier: VIPTier.BRONZE,
    queuePriority: 2,
    earlyAccessMinutes: 5,
    discountPercentage: 5,
    exclusiveDeals: false,
    freeShipping: false,
    dedicatedSupport: false,
    flashSaleBoost: 1.1,
    maxReservations: 2,
    reservationExtensionMinutes: 2,
  },
  [VIPTier.SILVER]: {
    tier: VIPTier.SILVER,
    queuePriority: 3,
    earlyAccessMinutes: 10,
    discountPercentage: 10,
    exclusiveDeals: true,
    freeShipping: false,
    dedicatedSupport: false,
    flashSaleBoost: 1.2,
    maxReservations: 3,
    reservationExtensionMinutes: 5,
  },
  [VIPTier.GOLD]: {
    tier: VIPTier.GOLD,
    queuePriority: 4,
    earlyAccessMinutes: 15,
    discountPercentage: 15,
    exclusiveDeals: true,
    freeShipping: true,
    dedicatedSupport: true,
    flashSaleBoost: 1.3,
    maxReservations: 5,
    reservationExtensionMinutes: 10,
  },
  [VIPTier.PLATINUM]: {
    tier: VIPTier.PLATINUM,
    queuePriority: 5,
    earlyAccessMinutes: 30,
    discountPercentage: 20,
    exclusiveDeals: true,
    freeShipping: true,
    dedicatedSupport: true,
    flashSaleBoost: 1.5,
    maxReservations: 10,
    reservationExtensionMinutes: 15,
  },
};

const UPGRADE_REQUIREMENTS: VIPUpgradeRequirement[] = [
  { tier: VIPTier.BRONZE, minSpend: 100, minOrders: 3, minPoints: 100 },
  { tier: VIPTier.SILVER, minSpend: 500, minOrders: 10, minPoints: 500 },
  { tier: VIPTier.GOLD, minSpend: 2000, minOrders: 25, minPoints: 2000 },
  { tier: VIPTier.PLATINUM, minSpend: 5000, minOrders: 50, minPoints: 5000 },
];

const VIP_CACHE_TTL = 3600; // 1 hour

class VIPService {
  /**
   * Get user's VIP membership
   */
  async getMembership(userId: string): Promise<VIPMembership | null> {
    // Check cache
    if (isRedisConnected()) {
      const cached = await redisClient.get(`${REDIS_KEYS.VIP_PREFIX}:member:${userId}`);
      if (cached) return JSON.parse(cached);
    }

    try {
      const pool = getPool();
      const result = await pool.query(`SELECT * FROM vip_memberships WHERE user_id = $1`, [userId]);

      if (result.rows.length === 0) {
        // Return standard membership for non-VIP users
        return this.createStandardMembership(userId);
      }

      const row = result.rows[0];
      const membership: VIPMembership = {
        userId: row.user_id,
        tier: row.tier as VIPTier,
        startDate: new Date(row.start_date),
        expiryDate: new Date(row.expiry_date),
        isActive: row.is_active && new Date(row.expiry_date) > new Date(),
        pointsEarned: row.points_earned,
        totalSpent: row.total_spent,
        benefits: VIP_BENEFITS[row.tier as VIPTier] || VIP_BENEFITS[VIPTier.STANDARD],
        autoRenew: row.auto_renew,
        subscriptionId: row.subscription_id,
      };

      // Cache the membership
      if (isRedisConnected()) {
        await redisClient.setex(
          `${REDIS_KEYS.VIP_PREFIX}:member:${userId}`,
          VIP_CACHE_TTL,
          JSON.stringify(membership)
        );
      }

      return membership;
    } catch (error) {
      console.error('Failed to get VIP membership:', error);
      return this.createStandardMembership(userId);
    }
  }

  /**
   * Upgrade user to VIP tier
   */
  async upgradeMembership(
    userId: string,
    tier: VIPTier,
    options: {
      duration?: number; // months
      paymentId?: string;
      autoRenew?: boolean;
    } = {}
  ): Promise<VIPMembership> {
    const { duration = 12, paymentId, autoRenew = true } = options;

    const startDate = new Date();
    const expiryDate = new Date();
    expiryDate.setMonth(expiryDate.getMonth() + duration);

    try {
      const pool = getPool();

      // Check if user already has membership
      const existing = await pool.query('SELECT id FROM vip_memberships WHERE user_id = $1', [
        userId,
      ]);

      if (existing.rows.length > 0) {
        // Update existing membership
        await pool.query(
          `UPDATE vip_memberships 
           SET tier = $2, start_date = $3, expiry_date = $4, is_active = true, 
               auto_renew = $5, payment_id = $6, updated_at = NOW()
           WHERE user_id = $1`,
          [userId, tier, startDate, expiryDate, autoRenew, paymentId]
        );
      } else {
        // Create new membership
        await pool.query(
          `INSERT INTO vip_memberships 
           (user_id, tier, start_date, expiry_date, is_active, auto_renew, payment_id, points_earned, total_spent)
           VALUES ($1, $2, $3, $4, true, $5, $6, 0, 0)`,
          [userId, tier, startDate, expiryDate, autoRenew, paymentId]
        );
      }

      // Clear cache
      if (isRedisConnected()) {
        await redisClient.del(`${REDIS_KEYS.VIP_PREFIX}:member:${userId}`);
      }

      console.log(`🎖️ User ${userId} upgraded to ${tier} VIP`);

      return this.getMembership(userId) as Promise<VIPMembership>;
    } catch (error) {
      console.error('Failed to upgrade VIP membership:', error);
      throw error;
    }
  }

  /**
   * Check if user qualifies for upgrade
   */
  async checkUpgradeEligibility(userId: string): Promise<{
    eligible: boolean;
    currentTier: VIPTier;
    nextTier: VIPTier | null;
    requirements: VIPUpgradeRequirement | null;
    progress: { spend: number; orders: number; points: number };
  }> {
    const membership = await this.getMembership(userId);
    const currentTier = membership?.tier || VIPTier.STANDARD;

    try {
      const pool = getPool();

      // Get user stats
      const statsResult = await pool.query(
        `SELECT 
           COALESCE(SUM(o.total_amount), 0) as total_spent,
           COUNT(o.id) as order_count,
           COALESCE(vm.points_earned, 0) as points
         FROM orders o
         LEFT JOIN vip_memberships vm ON vm.user_id = o.user_id
         WHERE o.user_id = $1`,
        [userId]
      );

      const stats = statsResult.rows[0];
      const progress = {
        spend: parseFloat(stats.total_spent) || 0,
        orders: parseInt(stats.order_count) || 0,
        points: parseInt(stats.points) || 0,
      };

      // Find next tier
      const tierOrder = [
        VIPTier.STANDARD,
        VIPTier.BRONZE,
        VIPTier.SILVER,
        VIPTier.GOLD,
        VIPTier.PLATINUM,
      ];
      const currentIndex = tierOrder.indexOf(currentTier);

      if (currentIndex >= tierOrder.length - 1) {
        return { eligible: false, currentTier, nextTier: null, requirements: null, progress };
      }

      const nextTier = tierOrder[currentIndex + 1];
      const requirements = UPGRADE_REQUIREMENTS.find((r) => r.tier === nextTier) || null;

      if (!requirements) {
        return { eligible: false, currentTier, nextTier: null, requirements: null, progress };
      }

      const eligible =
        progress.spend >= requirements.minSpend && progress.orders >= requirements.minOrders;

      return { eligible, currentTier, nextTier, requirements, progress };
    } catch (error) {
      console.error('Failed to check upgrade eligibility:', error);
      return {
        eligible: false,
        currentTier,
        nextTier: null,
        requirements: null,
        progress: { spend: 0, orders: 0, points: 0 },
      };
    }
  }

  /**
   * Get VIP benefits for a tier
   */
  getBenefits(tier: VIPTier): VIPBenefits {
    return VIP_BENEFITS[tier] || VIP_BENEFITS[VIPTier.STANDARD];
  }

  /**
   * Calculate queue position based on VIP status
   */
  async calculateQueuePriority(
    userId: string,
    basePosition: number
  ): Promise<{
    adjustedPosition: number;
    priorityBoost: number;
    tier: VIPTier;
  }> {
    const membership = await this.getMembership(userId);
    const tier = membership?.isActive ? membership.tier : VIPTier.STANDARD;
    const benefits = this.getBenefits(tier);

    // Priority boost reduces effective queue position
    // Higher priority = more position reduction
    const priorityBoost = (benefits.queuePriority - 1) * 0.1; // 0-40% reduction
    const adjustedPosition = Math.max(1, Math.floor(basePosition * (1 - priorityBoost)));

    return { adjustedPosition, priorityBoost, tier };
  }

  /**
   * Check if user has early access to a flash sale
   */
  async hasEarlyAccess(
    userId: string,
    saleStartTime: Date
  ): Promise<{
    hasAccess: boolean;
    accessTime: Date;
    minutesEarly: number;
  }> {
    const membership = await this.getMembership(userId);
    const benefits = membership?.isActive ? membership.benefits : VIP_BENEFITS[VIPTier.STANDARD];

    const accessTime = new Date(saleStartTime.getTime() - benefits.earlyAccessMinutes * 60 * 1000);
    const hasAccess = new Date() >= accessTime;

    return {
      hasAccess,
      accessTime,
      minutesEarly: benefits.earlyAccessMinutes,
    };
  }

  /**
   * Add points to user's VIP account
   */
  async addPoints(userId: string, points: number, reason: string): Promise<number> {
    try {
      const pool = getPool();

      const result = await pool.query(
        `UPDATE vip_memberships 
         SET points_earned = points_earned + $2, updated_at = NOW()
         WHERE user_id = $1
         RETURNING points_earned`,
        [userId, points]
      );

      if (result.rows.length > 0) {
        // Log points transaction
        await pool.query(
          `INSERT INTO vip_points_log (user_id, points, reason, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [userId, points, reason]
        );

        // Clear cache
        if (isRedisConnected()) {
          await redisClient.del(`${REDIS_KEYS.VIP_PREFIX}:member:${userId}`);
        }

        return result.rows[0].points_earned;
      }

      return points;
    } catch (error) {
      // Table might not exist, just return points
      console.log('Points tracking skipped:', error);
      return points;
    }
  }

  /**
   * Get all VIP tiers with benefits
   */
  getAllTiers(): {
    tier: VIPTier;
    benefits: VIPBenefits;
    requirements: VIPUpgradeRequirement | null;
  }[] {
    return Object.values(VIPTier).map((tier) => ({
      tier,
      benefits: VIP_BENEFITS[tier],
      requirements: UPGRADE_REQUIREMENTS.find((r) => r.tier === tier) || null,
    }));
  }

  /**
   * Cancel VIP membership
   */
  async cancelMembership(userId: string): Promise<boolean> {
    try {
      const pool = getPool();
      await pool.query(
        `UPDATE vip_memberships SET auto_renew = false, updated_at = NOW() WHERE user_id = $1`,
        [userId]
      );

      // Clear cache
      if (isRedisConnected()) {
        await redisClient.del(`${REDIS_KEYS.VIP_PREFIX}:member:${userId}`);
      }

      return true;
    } catch (error) {
      console.error('Failed to cancel VIP membership:', error);
      return false;
    }
  }

  // Private helper methods

  private createStandardMembership(userId: string): VIPMembership {
    return {
      userId,
      tier: VIPTier.STANDARD,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      isActive: true,
      pointsEarned: 0,
      totalSpent: 0,
      benefits: VIP_BENEFITS[VIPTier.STANDARD],
      autoRenew: false,
    };
  }
}

// Export singleton
export const vipService = new VIPService();
export default vipService;
