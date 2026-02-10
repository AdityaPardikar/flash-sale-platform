/**
 * Fraud Detection Service
 * Week 5 Day 2: AI & Machine Learning Features
 *
 * Features:
 * - Anomaly detection for suspicious orders
 * - Risk scoring for transactions
 * - Bot detection and prevention
 * - Real-time fraud alerts
 * - User behavior analysis
 * - Device fingerprinting
 */

import { getPool } from '../utils/database';
import { redisClient, isRedisConnected } from '../utils/redis';
import { REDIS_KEYS } from '../config/redisKeys';

// Types
export interface RiskScore {
  score: number; // 0-100, higher = more risky
  level: 'low' | 'medium' | 'high' | 'critical';
  factors: RiskFactor[];
  recommendation: 'approve' | 'review' | 'block';
  timestamp: Date;
}

export interface RiskFactor {
  name: string;
  weight: number;
  score: number;
  description: string;
}

export interface FraudAlert {
  id: string;
  userId?: string;
  sessionId: string;
  alertType: FraudAlertType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metadata: Record<string, any>;
  createdAt: Date;
  resolved: boolean;
}

export type FraudAlertType =
  | 'rapid_purchases'
  | 'unusual_location'
  | 'multiple_cards'
  | 'bot_behavior'
  | 'velocity_exceeded'
  | 'suspicious_pattern'
  | 'account_takeover'
  | 'payment_fraud';

export interface DeviceFingerprint {
  fingerprint: string;
  userAgent: string;
  screenResolution: string;
  timezone: string;
  language: string;
  plugins: string[];
  canvasHash?: string;
  webglHash?: string;
}

export interface UserBehaviorProfile {
  userId: string;
  averageOrderValue: number;
  typicalPurchaseHours: number[];
  preferredPaymentMethods: string[];
  deviceFingerprints: string[];
  knownIpAddresses: string[];
  purchaseFrequency: number; // orders per month
  lastUpdated: Date;
}

// Constants
const HIGH_RISK_THRESHOLD = 70;
const MEDIUM_RISK_THRESHOLD = 40;
const VELOCITY_WINDOW = 3600; // 1 hour in seconds
const MAX_ORDERS_PER_HOUR = 5;
const MAX_FAILED_PAYMENTS = 3;
const ALERT_TTL = 7 * 24 * 60 * 60; // 7 days

class FraudDetectionService {
  private alertHandlers: ((alert: FraudAlert) => void)[] = [];

  /**
   * Analyze transaction for fraud risk
   */
  async analyzeTransaction(transaction: {
    userId?: string;
    sessionId: string;
    orderId: string;
    amount: number;
    paymentMethod: string;
    ipAddress: string;
    deviceFingerprint?: DeviceFingerprint;
  }): Promise<RiskScore> {
    const factors: RiskFactor[] = [];

    // Factor 1: Velocity check
    const velocityScore = await this.checkVelocity(transaction.userId, transaction.sessionId);
    factors.push({
      name: 'transaction_velocity',
      weight: 0.2,
      score: velocityScore,
      description:
        velocityScore > 50 ? 'High transaction frequency detected' : 'Normal transaction frequency',
    });

    // Factor 2: Amount analysis
    const amountScore = await this.analyzeAmount(transaction.userId, transaction.amount);
    factors.push({
      name: 'amount_anomaly',
      weight: 0.2,
      score: amountScore,
      description: amountScore > 50 ? 'Unusual order amount' : 'Normal order amount',
    });

    // Factor 3: Location/IP analysis
    const locationScore = await this.analyzeLocation(transaction.userId, transaction.ipAddress);
    factors.push({
      name: 'location_risk',
      weight: 0.15,
      score: locationScore,
      description: locationScore > 50 ? 'New or unusual location' : 'Familiar location',
    });

    // Factor 4: Device analysis
    const deviceScore = await this.analyzeDevice(transaction.userId, transaction.deviceFingerprint);
    factors.push({
      name: 'device_risk',
      weight: 0.15,
      score: deviceScore,
      description: deviceScore > 50 ? 'Unknown or suspicious device' : 'Known device',
    });

    // Factor 5: User history
    const historyScore = await this.analyzeUserHistory(transaction.userId);
    factors.push({
      name: 'user_history',
      weight: 0.15,
      score: historyScore,
      description: historyScore > 50 ? 'Limited or suspicious history' : 'Good account standing',
    });

    // Factor 6: Pattern analysis
    const patternScore = await this.analyzePatterns(transaction.sessionId);
    factors.push({
      name: 'behavior_patterns',
      weight: 0.15,
      score: patternScore,
      description: patternScore > 50 ? 'Suspicious behavior patterns' : 'Normal behavior patterns',
    });

    // Calculate weighted score
    const totalScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0);
    const normalizedScore = Math.round(totalScore);

    const level =
      normalizedScore >= HIGH_RISK_THRESHOLD
        ? 'critical'
        : normalizedScore >= MEDIUM_RISK_THRESHOLD + 15
          ? 'high'
          : normalizedScore >= MEDIUM_RISK_THRESHOLD
            ? 'medium'
            : 'low';

    const recommendation = level === 'critical' ? 'block' : level === 'high' ? 'review' : 'approve';

    const riskScore: RiskScore = {
      score: normalizedScore,
      level,
      factors,
      recommendation,
      timestamp: new Date(),
    };

    // Create alert if high risk
    if (level === 'high' || level === 'critical') {
      await this.createAlert({
        userId: transaction.userId,
        sessionId: transaction.sessionId,
        alertType: 'suspicious_pattern',
        severity: level,
        description: `High risk transaction detected: ${factors
          .filter((f) => f.score > 50)
          .map((f) => f.name)
          .join(', ')}`,
        metadata: {
          orderId: transaction.orderId,
          amount: transaction.amount,
          riskScore: normalizedScore,
          factors,
        },
      });
    }

    // Cache the risk score
    if (isRedisConnected()) {
      await redisClient.setex(
        `${REDIS_KEYS.FRAUD_PREFIX}:score:${transaction.orderId}`,
        3600,
        JSON.stringify(riskScore)
      );
    }

    return riskScore;
  }

  /**
   * Detect bot behavior
   */
  async detectBot(
    sessionId: string,
    requestData: {
      userAgent: string;
      requestInterval?: number;
      mouseMovements?: boolean;
      scrollEvents?: boolean;
      keyboardEvents?: boolean;
    }
  ): Promise<{
    isBot: boolean;
    confidence: number;
    indicators: string[];
  }> {
    const indicators: string[] = [];
    let botScore = 0;

    // Check user agent for known bots
    const botUserAgents = ['bot', 'crawler', 'spider', 'scraper', 'headless'];
    const uaLower = requestData.userAgent.toLowerCase();
    if (botUserAgents.some((bot) => uaLower.includes(bot))) {
      botScore += 40;
      indicators.push('Bot user agent detected');
    }

    // Check for headless browser signatures
    if (uaLower.includes('headless') || !requestData.userAgent) {
      botScore += 30;
      indicators.push('Headless browser detected');
    }

    // Check request timing
    if (requestData.requestInterval !== undefined && requestData.requestInterval < 100) {
      botScore += 25;
      indicators.push('Superhuman request speed');
    }

    // Check for human interaction signals
    if (requestData.mouseMovements === false) {
      botScore += 15;
      indicators.push('No mouse movement detected');
    }
    if (requestData.scrollEvents === false) {
      botScore += 10;
      indicators.push('No scroll events');
    }
    if (requestData.keyboardEvents === false) {
      botScore += 10;
      indicators.push('No keyboard events');
    }

    // Check session behavior from Redis
    if (isRedisConnected()) {
      const sessionKey = `${REDIS_KEYS.FRAUD_PREFIX}:session:${sessionId}`;
      const sessionData = await redisClient.get(sessionKey);

      if (sessionData) {
        const data = JSON.parse(sessionData);

        // Check request rate
        if (data.requestCount > 100) {
          botScore += 25;
          indicators.push('Excessive requests');
        }

        // Check for identical request patterns
        if (data.identicalRequests > 10) {
          botScore += 20;
          indicators.push('Repetitive request patterns');
        }
      }
    }

    const isBot = botScore >= 50;
    const confidence = Math.min(100, botScore) / 100;

    if (isBot) {
      await this.createAlert({
        sessionId,
        alertType: 'bot_behavior',
        severity: botScore >= 70 ? 'high' : 'medium',
        description: `Bot behavior detected with ${Math.round(confidence * 100)}% confidence`,
        metadata: { indicators, botScore },
      });
    }

    return { isBot, confidence, indicators };
  }

  /**
   * Check for account takeover attempts
   */
  async detectAccountTakeover(
    userId: string,
    loginData: {
      ipAddress: string;
      deviceFingerprint?: DeviceFingerprint;
      loginTime: Date;
    }
  ): Promise<{
    isSuspicious: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    reasons: string[];
  }> {
    const reasons: string[] = [];
    let riskScore = 0;

    try {
      const pool = getPool();

      // Check for multiple failed login attempts
      const failedLogins = await pool.query(
        `SELECT COUNT(*) as count FROM login_attempts 
         WHERE user_id = $1 AND success = false 
         AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId]
      );

      if (parseInt(failedLogins.rows[0].count) >= 3) {
        riskScore += 30;
        reasons.push('Multiple failed login attempts');
      }

      // Check for login from new location
      const knownIps = await this.getKnownIpAddresses(userId);
      if (!knownIps.includes(loginData.ipAddress)) {
        riskScore += 20;
        reasons.push('Login from new location');
      }

      // Check for password change followed by suspicious activity
      const recentPasswordChange = await pool.query(
        `SELECT COUNT(*) as count FROM password_changes 
         WHERE user_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
        [userId]
      );

      if (parseInt(recentPasswordChange.rows[0].count) > 0) {
        riskScore += 25;
        reasons.push('Recent password change');
      }

      // Check for impossible travel (login from distant locations in short time)
      const lastLogin = await this.getLastLoginLocation(userId);
      if (
        lastLogin &&
        this.isImpossibleTravel(lastLogin, loginData.ipAddress, loginData.loginTime)
      ) {
        riskScore += 40;
        reasons.push('Impossible travel detected');
      }
    } catch (error) {
      // Tables might not exist, log and continue with lower confidence
      console.log('Account takeover detection using limited data');
    }

    const riskLevel = riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';
    const isSuspicious = riskScore >= 40;

    if (isSuspicious) {
      await this.createAlert({
        userId,
        sessionId: `login-${Date.now()}`,
        alertType: 'account_takeover',
        severity: riskLevel,
        description: `Possible account takeover attempt detected`,
        metadata: { reasons, riskScore, ipAddress: loginData.ipAddress },
      });
    }

    return { isSuspicious, riskLevel, reasons };
  }

  /**
   * Create a fraud alert
   */
  async createAlert(
    alertData: Omit<FraudAlert, 'id' | 'createdAt' | 'resolved'>
  ): Promise<FraudAlert> {
    const alert: FraudAlert = {
      ...alertData,
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      resolved: false,
    };

    // Store in Redis
    if (isRedisConnected()) {
      await redisClient.setex(
        `${REDIS_KEYS.FRAUD_PREFIX}:alert:${alert.id}`,
        ALERT_TTL,
        JSON.stringify(alert)
      );

      // Add to alerts list
      await redisClient.lpush(`${REDIS_KEYS.FRAUD_PREFIX}:alerts:list`, alert.id);
      await redisClient.ltrim(`${REDIS_KEYS.FRAUD_PREFIX}:alerts:list`, 0, 999);
    }

    // Notify handlers
    this.alertHandlers.forEach((handler) => handler(alert));

    return alert;
  }

  /**
   * Get recent fraud alerts
   */
  async getRecentAlerts(limit: number = 50): Promise<FraudAlert[]> {
    const alerts: FraudAlert[] = [];

    if (isRedisConnected()) {
      const alertIds = await redisClient.lrange(
        `${REDIS_KEYS.FRAUD_PREFIX}:alerts:list`,
        0,
        limit - 1
      );

      for (const id of alertIds) {
        const alertData = await redisClient.get(`${REDIS_KEYS.FRAUD_PREFIX}:alert:${id}`);
        if (alertData) {
          alerts.push(JSON.parse(alertData));
        }
      }
    }

    return alerts;
  }

  /**
   * Register alert handler
   */
  onAlert(handler: (alert: FraudAlert) => void): void {
    this.alertHandlers.push(handler);
  }

  // Private helper methods

  private async checkVelocity(userId?: string, sessionId?: string): Promise<number> {
    if (!isRedisConnected()) return 0;

    const key = userId
      ? `${REDIS_KEYS.FRAUD_PREFIX}:velocity:user:${userId}`
      : `${REDIS_KEYS.FRAUD_PREFIX}:velocity:session:${sessionId}`;

    const count = await redisClient.incr(key);
    await redisClient.expire(key, VELOCITY_WINDOW);

    if (count > MAX_ORDERS_PER_HOUR) {
      return 100;
    }
    return Math.min(100, (count / MAX_ORDERS_PER_HOUR) * 50);
  }

  private async analyzeAmount(userId: string | undefined, amount: number): Promise<number> {
    if (!userId) return 30; // Unknown user, moderate risk

    try {
      const pool = getPool();
      const avgResult = await pool.query(
        `SELECT AVG(total_amount) as avg_amount, STDDEV(total_amount) as stddev
         FROM orders WHERE user_id = $1`,
        [userId]
      );

      const { avg_amount, stddev } = avgResult.rows[0];
      if (!avg_amount) return 20; // New user

      const deviation = Math.abs(amount - avg_amount) / (stddev || avg_amount);

      // Score based on standard deviations from mean
      if (deviation > 3) return 80;
      if (deviation > 2) return 50;
      if (deviation > 1) return 30;
      return 10;
    } catch (error) {
      return 20;
    }
  }

  private async analyzeLocation(userId: string | undefined, ipAddress: string): Promise<number> {
    if (!userId) return 40;

    const knownIps = await this.getKnownIpAddresses(userId);
    if (knownIps.length === 0) return 20; // New user

    // Check if IP matches known patterns
    const ipPrefix = ipAddress.split('.').slice(0, 2).join('.');
    const knownPrefixes = knownIps.map((ip) => ip.split('.').slice(0, 2).join('.'));

    if (knownIps.includes(ipAddress)) return 0;
    if (knownPrefixes.includes(ipPrefix)) return 20;
    return 50;
  }

  private async analyzeDevice(
    userId: string | undefined,
    fingerprint?: DeviceFingerprint
  ): Promise<number> {
    if (!fingerprint) return 30;
    if (!userId) return 20;

    if (isRedisConnected()) {
      const knownDevices = await redisClient.smembers(
        `${REDIS_KEYS.FRAUD_PREFIX}:devices:${userId}`
      );

      if (knownDevices.includes(fingerprint.fingerprint)) {
        return 0;
      }

      // Add new device
      await redisClient.sadd(
        `${REDIS_KEYS.FRAUD_PREFIX}:devices:${userId}`,
        fingerprint.fingerprint
      );

      return knownDevices.length === 0 ? 10 : 40;
    }

    return 20;
  }

  private async analyzeUserHistory(userId: string | undefined): Promise<number> {
    if (!userId) return 50;

    try {
      const pool = getPool();

      // Check account age
      const accountAge = await pool.query(`SELECT created_at FROM users WHERE id = $1`, [userId]);

      if (accountAge.rows.length === 0) return 70;

      const ageInDays =
        (Date.now() - new Date(accountAge.rows[0].created_at).getTime()) / (1000 * 60 * 60 * 24);

      if (ageInDays < 1) return 60;
      if (ageInDays < 7) return 40;
      if (ageInDays < 30) return 20;
      return 10;
    } catch (error) {
      return 30;
    }
  }

  private async analyzePatterns(sessionId: string): Promise<number> {
    if (!isRedisConnected()) return 20;

    const patternKey = `${REDIS_KEYS.FRAUD_PREFIX}:patterns:${sessionId}`;
    const patternData = await redisClient.get(patternKey);

    if (!patternData) return 10;

    const patterns = JSON.parse(patternData);
    let score = 0;

    // Check for rapid actions
    if (patterns.rapidClicks > 50) score += 30;

    // Check for linear browsing (bot-like)
    if (patterns.linearBrowsing) score += 25;

    // Check for direct checkout (no browsing)
    if (patterns.directCheckout) score += 20;

    return Math.min(100, score);
  }

  private async getKnownIpAddresses(userId: string): Promise<string[]> {
    if (isRedisConnected()) {
      const ips = await redisClient.smembers(`${REDIS_KEYS.FRAUD_PREFIX}:ips:${userId}`);
      return ips;
    }
    return [];
  }

  private async getLastLoginLocation(userId: string): Promise<{ ip: string; time: Date } | null> {
    if (isRedisConnected()) {
      const data = await redisClient.get(`${REDIS_KEYS.FRAUD_PREFIX}:lastlogin:${userId}`);
      if (data) return JSON.parse(data);
    }
    return null;
  }

  private isImpossibleTravel(
    lastLogin: { ip: string; time: Date },
    currentIp: string,
    currentTime: Date
  ): boolean {
    // Simplified check - in reality would use IP geolocation
    const timeDiffHours =
      (currentTime.getTime() - new Date(lastLogin.time).getTime()) / (1000 * 60 * 60);

    // If different IP prefix and less than 2 hours, flag as suspicious
    const lastPrefix = lastLogin.ip.split('.').slice(0, 2).join('.');
    const currentPrefix = currentIp.split('.').slice(0, 2).join('.');

    return lastPrefix !== currentPrefix && timeDiffHours < 2;
  }
}

// Export singleton instance
export const fraudDetectionService = new FraudDetectionService();
export default fraudDetectionService;
