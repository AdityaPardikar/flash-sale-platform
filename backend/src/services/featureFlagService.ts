/**
 * Feature Flag Service
 * Week 6 Day 6: Production Hardening & Resilience
 *
 * Feature flag management for controlled rollouts:
 * - Boolean flags (on/off)
 * - Percentage rollouts
 * - User segment targeting
 * - A/B testing support
 * - Runtime flag updates (no restart required)
 * - Flag dependency chains
 */

// ─── Types ────────────────────────────────────────────────────

export enum FlagType {
  BOOLEAN = 'boolean',
  PERCENTAGE = 'percentage',
  SEGMENT = 'segment',
  AB_TEST = 'ab_test',
}

export interface FeatureFlag {
  name: string;
  type: FlagType;
  enabled: boolean;
  description: string;
  /** Percentage 0-100 for rollout */
  percentage?: number;
  /** Allowed user segments */
  segments?: string[];
  /** A/B test variants */
  variants?: Record<string, number>; // variant name -> weight
  /** Dependencies (other flags that must be enabled) */
  dependencies?: string[];
  /** Created timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
  /** Override rules */
  overrides?: FlagOverride[];
}

export interface FlagOverride {
  /** User IDs to override */
  userIds?: string[];
  /** Force enable/disable */
  enabled: boolean;
}

export interface FlagEvaluation {
  flagName: string;
  enabled: boolean;
  variant?: string;
  reason: string;
  evaluatedAt: Date;
}

export interface FlagContext {
  userId?: string;
  userSegment?: string;
  environment?: string;
  attributes?: Record<string, string | number | boolean>;
}

// ─── Feature Flag Service ─────────────────────────────────────

class FeatureFlagService {
  private flags: Map<string, FeatureFlag> = new Map();
  private evaluationCache: Map<string, FlagEvaluation> = new Map();
  private cacheTtlMs: number = 60000;

  constructor() {
    this.initializeDefaultFlags();
  }

  /**
   * Initialize with default platform flags
   */
  private initializeDefaultFlags(): void {
    const defaults: Array<Omit<FeatureFlag, 'createdAt' | 'updatedAt'>> = [
      {
        name: 'flash_sale_v2',
        type: FlagType.BOOLEAN,
        enabled: true,
        description: 'Enable v2 flash sale engine with advanced queue management',
      },
      {
        name: 'new_checkout_flow',
        type: FlagType.PERCENTAGE,
        enabled: true,
        percentage: 25,
        description: 'New streamlined checkout experience (gradual rollout)',
      },
      {
        name: 'vip_early_access',
        type: FlagType.SEGMENT,
        enabled: true,
        segments: ['vip', 'loyal'],
        description: 'Allow VIP and loyal customers early sale access',
      },
      {
        name: 'pricing_algorithm',
        type: FlagType.AB_TEST,
        enabled: true,
        variants: { control: 50, dynamic: 30, surge: 20 },
        description: 'A/B test pricing algorithm variants',
      },
      {
        name: 'websocket_notifications',
        type: FlagType.BOOLEAN,
        enabled: true,
        description: 'Real-time WebSocket push notifications',
      },
      {
        name: 'redis_cache_v2',
        type: FlagType.PERCENTAGE,
        enabled: true,
        percentage: 100,
        description: 'Use v2 Redis caching strategy with pipeline optimization',
      },
      {
        name: 'analytics_dashboard_v2',
        type: FlagType.SEGMENT,
        enabled: true,
        segments: ['admin'],
        description: 'Advanced analytics dashboard for admin users',
      },
      {
        name: 'rate_limit_strict',
        type: FlagType.BOOLEAN,
        enabled: false,
        description: 'Strict rate limiting for high-traffic events',
      },
    ];

    const now = new Date();
    for (const flag of defaults) {
      this.flags.set(flag.name, { ...flag, createdAt: now, updatedAt: now });
    }
  }

  /**
   * Evaluate a feature flag for a given context
   */
  evaluate(flagName: string, context: FlagContext = {}): FlagEvaluation {
    // Check cache
    const cacheKey = `${flagName}:${context.userId || 'anon'}:${context.userSegment || 'none'}`;
    const cached = this.evaluationCache.get(cacheKey);
    if (cached && Date.now() - cached.evaluatedAt.getTime() < this.cacheTtlMs) {
      return cached;
    }

    const flag = this.flags.get(flagName);
    if (!flag) {
      return this.buildEvaluation(flagName, false, 'flag_not_found');
    }

    if (!flag.enabled) {
      return this.buildEvaluation(flagName, false, 'globally_disabled');
    }

    // Check dependencies
    if (flag.dependencies) {
      for (const dep of flag.dependencies) {
        const depEval = this.evaluate(dep, context);
        if (!depEval.enabled) {
          return this.buildEvaluation(flagName, false, `dependency_disabled:${dep}`);
        }
      }
    }

    // Check overrides
    if (flag.overrides && context.userId) {
      for (const override of flag.overrides) {
        if (override.userIds?.includes(context.userId)) {
          return this.buildEvaluation(flagName, override.enabled, 'user_override');
        }
      }
    }

    // Evaluate based on type
    let evaluation: FlagEvaluation;
    switch (flag.type) {
      case FlagType.BOOLEAN:
        evaluation = this.buildEvaluation(flagName, true, 'boolean_enabled');
        break;
      case FlagType.PERCENTAGE:
        evaluation = this.evaluatePercentage(flag, context);
        break;
      case FlagType.SEGMENT:
        evaluation = this.evaluateSegment(flag, context);
        break;
      case FlagType.AB_TEST:
        evaluation = this.evaluateABTest(flag, context);
        break;
      default:
        evaluation = this.buildEvaluation(flagName, false, 'unknown_type');
    }

    // Cache result
    this.evaluationCache.set(cacheKey, evaluation);
    return evaluation;
  }

  /**
   * Quick check if a flag is enabled
   */
  isEnabled(flagName: string, context: FlagContext = {}): boolean {
    return this.evaluate(flagName, context).enabled;
  }

  /**
   * Get variant for A/B test flag
   */
  getVariant(flagName: string, context: FlagContext = {}): string | undefined {
    return this.evaluate(flagName, context).variant;
  }

  /**
   * Evaluate percentage-based flag
   */
  private evaluatePercentage(flag: FeatureFlag, context: FlagContext): FlagEvaluation {
    const percentage = flag.percentage ?? 0;
    const hash = this.hashUser(context.userId || 'anon', flag.name);
    const bucket = hash % 100;

    return this.buildEvaluation(
      flag.name,
      bucket < percentage,
      `percentage_rollout:${bucket}/${percentage}`
    );
  }

  /**
   * Evaluate segment-based flag
   */
  private evaluateSegment(flag: FeatureFlag, context: FlagContext): FlagEvaluation {
    const segments = flag.segments || [];
    if (!context.userSegment) {
      return this.buildEvaluation(flag.name, false, 'no_user_segment');
    }

    const inSegment = segments.includes(context.userSegment);
    return this.buildEvaluation(
      flag.name,
      inSegment,
      inSegment ? `segment_match:${context.userSegment}` : `segment_mismatch:${context.userSegment}`
    );
  }

  /**
   * Evaluate A/B test flag
   */
  private evaluateABTest(flag: FeatureFlag, context: FlagContext): FlagEvaluation {
    const variants = flag.variants || {};
    const entries = Object.entries(variants);
    if (entries.length === 0) {
      return this.buildEvaluation(flag.name, false, 'no_variants');
    }

    const hash = this.hashUser(context.userId || 'anon', flag.name);
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
    const bucket = hash % totalWeight;

    let cumWeight = 0;
    for (const [variant, weight] of entries) {
      cumWeight += weight;
      if (bucket < cumWeight) {
        return this.buildEvaluation(flag.name, true, `ab_test:${variant}`, variant);
      }
    }

    // Fallback to first variant
    return this.buildEvaluation(flag.name, true, `ab_test:${entries[0][0]}`, entries[0][0]);
  }

  /**
   * Deterministic hash for consistent bucketing
   */
  private hashUser(userId: string, flagName: string): number {
    const str = `${userId}:${flagName}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Build evaluation result
   */
  private buildEvaluation(
    flagName: string,
    enabled: boolean,
    reason: string,
    variant?: string
  ): FlagEvaluation {
    return {
      flagName,
      enabled,
      variant,
      reason,
      evaluatedAt: new Date(),
    };
  }

  // ─── Management Methods ─────────────────────────────────

  /**
   * Create or update a flag
   */
  setFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): void {
    const existing = this.flags.get(flag.name);
    this.flags.set(flag.name, {
      ...flag,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date(),
    });
    // Invalidate cache
    this.invalidateCache(flag.name);
    console.log(`[FeatureFlags] Flag '${flag.name}' ${existing ? 'updated' : 'created'}`);
  }

  /**
   * Toggle a flag on/off
   */
  toggleFlag(flagName: string, enabled: boolean): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) return false;

    flag.enabled = enabled;
    flag.updatedAt = new Date();
    this.invalidateCache(flagName);
    console.log(`[FeatureFlags] Flag '${flagName}' ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Update rollout percentage
   */
  setPercentage(flagName: string, percentage: number): boolean {
    const flag = this.flags.get(flagName);
    if (!flag || flag.type !== FlagType.PERCENTAGE) return false;

    flag.percentage = Math.max(0, Math.min(100, percentage));
    flag.updatedAt = new Date();
    this.invalidateCache(flagName);
    console.log(`[FeatureFlags] Flag '${flagName}' rollout updated to ${flag.percentage}%`);
    return true;
  }

  /**
   * Add a user override
   */
  addOverride(flagName: string, userIds: string[], enabled: boolean): boolean {
    const flag = this.flags.get(flagName);
    if (!flag) return false;

    if (!flag.overrides) flag.overrides = [];
    flag.overrides.push({ userIds, enabled });
    flag.updatedAt = new Date();
    this.invalidateCache(flagName);
    return true;
  }

  /**
   * Delete a flag
   */
  deleteFlag(flagName: string): boolean {
    this.invalidateCache(flagName);
    return this.flags.delete(flagName);
  }

  /**
   * Get all flags
   */
  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  /**
   * Get a specific flag
   */
  getFlag(flagName: string): FeatureFlag | undefined {
    return this.flags.get(flagName);
  }

  /**
   * Invalidate evaluation cache for a flag
   */
  private invalidateCache(flagName: string): void {
    for (const key of this.evaluationCache.keys()) {
      if (key.startsWith(`${flagName}:`)) {
        this.evaluationCache.delete(key);
      }
    }
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.evaluationCache.clear();
  }
}

export const featureFlagService = new FeatureFlagService();
