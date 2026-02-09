/**
 * Privacy Service
 * Day 7: Security Hardening & Audit System
 * GDPR compliance - consent management, data deletion, privacy settings
 */

import { query } from '../utils/database';
import { logger } from '../utils/logger';
import auditLogService from './auditLogService';
import { AuditAction } from '../models/auditLog';
import redis from '../utils/redis';

/**
 * Consent types
 */
export enum ConsentType {
  MARKETING = 'marketing',
  ANALYTICS = 'analytics',
  PERSONALIZATION = 'personalization',
  THIRD_PARTY = 'third_party',
  ESSENTIAL = 'essential', // Always required, cannot be withdrawn
}

/**
 * Consent record
 */
export interface ConsentRecord {
  userId: string;
  type: ConsentType;
  granted: boolean;
  grantedAt?: Date;
  withdrawnAt?: Date;
  ipAddress?: string;
  source: 'signup' | 'settings' | 'banner' | 'api';
}

/**
 * Data retention policy
 */
export interface RetentionPolicy {
  entityType: string;
  retentionDays: number;
  description: string;
}

/**
 * Default retention policies
 */
const DEFAULT_RETENTION_POLICIES: RetentionPolicy[] = [
  { entityType: 'orders', retentionDays: 2555, description: '7 years for financial records' },
  { entityType: 'analytics_events', retentionDays: 365, description: '1 year for analytics' },
  { entityType: 'audit_logs', retentionDays: 2555, description: '7 years for compliance' },
  { entityType: 'queue_entries', retentionDays: 90, description: '90 days for queue history' },
  { entityType: 'session_data', retentionDays: 30, description: '30 days for sessions' },
];

/**
 * Privacy Service - GDPR compliance
 */
export const privacyService = {
  /**
   * Record user consent
   */
  async recordConsent(
    userId: string,
    type: ConsentType,
    granted: boolean,
    ipAddress?: string,
    source: 'signup' | 'settings' | 'banner' | 'api' = 'api'
  ): Promise<void> {
    // Store consent in database
    await query(
      `INSERT INTO user_consents (user_id, consent_type, granted, ip_address, source, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, consent_type) 
       DO UPDATE SET 
         granted = $3,
         ip_address = $4,
         source = $5,
         updated_at = NOW()`,
      [userId, type, granted, ipAddress, source]
    );

    // Log the consent change
    await auditLogService.logAction({
      userId,
      action: granted ? AuditAction.CONSENT_GRANTED : AuditAction.CONSENT_REVOKED,
      entityType: 'consent',
      entityId: type,
      ipAddress,
      changes: { type, granted, source },
    });

    logger.info('Consent recorded', { userId, type, granted, source });
  },

  /**
   * Get user consents
   */
  async getUserConsents(userId: string): Promise<Record<ConsentType, boolean>> {
    const result = await query(
      `SELECT consent_type, granted FROM user_consents WHERE user_id = $1`,
      [userId]
    );

    const consents: Record<string, boolean> = {
      [ConsentType.ESSENTIAL]: true, // Always true
      [ConsentType.MARKETING]: false,
      [ConsentType.ANALYTICS]: false,
      [ConsentType.PERSONALIZATION]: false,
      [ConsentType.THIRD_PARTY]: false,
    };

    for (const row of result.rows) {
      consents[row.consent_type] = row.granted;
    }

    return consents as Record<ConsentType, boolean>;
  },

  /**
   * Check if user has specific consent
   */
  async hasConsent(userId: string, type: ConsentType): Promise<boolean> {
    if (type === ConsentType.ESSENTIAL) return true;

    const result = await query(
      `SELECT granted FROM user_consents 
       WHERE user_id = $1 AND consent_type = $2`,
      [userId, type]
    );

    return result.rows.length > 0 && result.rows[0].granted;
  },

  /**
   * Withdraw all marketing consents
   */
  async withdrawAllConsents(userId: string, ipAddress?: string): Promise<void> {
    const types = [
      ConsentType.MARKETING,
      ConsentType.ANALYTICS,
      ConsentType.PERSONALIZATION,
      ConsentType.THIRD_PARTY,
    ];

    for (const type of types) {
      await this.recordConsent(userId, type, false, ipAddress, 'settings');
    }

    logger.info('All consents withdrawn', { userId });
  },

  /**
   * Request account deletion (GDPR Article 17 - Right to Erasure)
   */
  async requestAccountDeletion(userId: string, ipAddress?: string): Promise<string> {
    const deletionId = `deletion_${userId}_${Date.now()}`;
    
    // Store deletion request
    await query(
      `INSERT INTO deletion_requests (id, user_id, status, ip_address, requested_at)
       VALUES ($1, $2, 'pending', $3, NOW())`,
      [deletionId, userId, ipAddress]
    );

    // Log the request
    await auditLogService.logAction({
      userId,
      action: AuditAction.DELETION_REQUESTED,
      entityType: 'user',
      entityId: userId,
      ipAddress,
      changes: { deletionId },
    });

    logger.info('Account deletion requested', { userId, deletionId });

    return deletionId;
  },

  /**
   * Process account deletion
   * Follows GDPR guidelines - anonymize rather than delete where legally required
   */
  async processAccountDeletion(deletionId: string): Promise<void> {
    const result = await query(
      `SELECT user_id, status FROM deletion_requests WHERE id = $1`,
      [deletionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Deletion request not found');
    }

    const { user_id: userId, status } = result.rows[0];

    if (status !== 'pending') {
      throw new Error(`Deletion already ${status}`);
    }

    // Update status to processing
    await query(
      `UPDATE deletion_requests SET status = 'processing' WHERE id = $1`,
      [deletionId]
    );

    try {
      // Delete or anonymize user data
      await this.anonymizeUserData(userId);

      // Mark as completed
      await query(
        `UPDATE deletion_requests SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [deletionId]
      );

      logger.info('Account deletion completed', { userId, deletionId });
    } catch (error) {
      await query(
        `UPDATE deletion_requests SET status = 'failed' WHERE id = $1`,
        [deletionId]
      );
      throw error;
    }
  },

  /**
   * Anonymize user data
   */
  async anonymizeUserData(userId: string): Promise<void> {
    const anonymousId = `deleted_${Date.now()}`;

    // Anonymize user record (keep for referential integrity)
    await query(
      `UPDATE users SET 
         email = $2,
         name = 'Deleted User',
         password_hash = '',
         is_deleted = true,
         deleted_at = NOW()
       WHERE id = $1`,
      [userId, `${anonymousId}@deleted.local`]
    );

    // Delete personal data from analytics
    await query(
      `UPDATE analytics_events SET 
         metadata = metadata - 'email' - 'name' - 'ip_address'
       WHERE user_id = $1`,
      [userId]
    );

    // Remove from queue entries (if not needed for orders)
    await query(
      `DELETE FROM queue_entries 
       WHERE user_id = $1 
       AND id NOT IN (SELECT queue_entry_id FROM orders WHERE user_id = $1)`,
      [userId]
    );

    // Clear user sessions
    await redis.del(`session:${userId}`);
    await redis.del(`user:${userId}:*`);

    // Delete consents
    await query(`DELETE FROM user_consents WHERE user_id = $1`, [userId]);

    logger.info('User data anonymized', { userId, anonymousId });
  },

  /**
   * Get deletion request status
   */
  async getDeletionStatus(userId: string): Promise<{
    id: string;
    status: string;
    requestedAt: Date;
    completedAt?: Date;
  } | null> {
    const result = await query(
      `SELECT id, status, requested_at, completed_at
       FROM deletion_requests 
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      status: result.rows[0].status,
      requestedAt: result.rows[0].requested_at,
      completedAt: result.rows[0].completed_at,
    };
  },

  /**
   * Get data retention policies
   */
  getRetentionPolicies(): RetentionPolicy[] {
    return DEFAULT_RETENTION_POLICIES;
  },

  /**
   * Apply retention policies - delete old data
   */
  async applyRetentionPolicies(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};

    for (const policy of DEFAULT_RETENTION_POLICIES) {
      try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.retentionDays);

        let deleteQuery: string;
        
        switch (policy.entityType) {
          case 'analytics_events':
            deleteQuery = `DELETE FROM analytics_events WHERE created_at < $1`;
            break;
          case 'queue_entries':
            deleteQuery = `DELETE FROM queue_entries WHERE created_at < $1 AND status IN ('completed', 'expired', 'left')`;
            break;
          case 'session_data':
            // Clear old session keys from Redis
            const keys = await redis.keys('session:*');
            let deleted = 0;
            for (const key of keys) {
              const ttl = await redis.ttl(key);
              if (ttl === -1) { // No TTL set
                await redis.del(key);
                deleted++;
              }
            }
            results[policy.entityType] = deleted;
            continue;
          default:
            continue;
        }

        const result = await query(deleteQuery, [cutoffDate]);
        results[policy.entityType] = result.rowCount || 0;

        if (result.rowCount && result.rowCount > 0) {
          logger.info('Retention policy applied', {
            entityType: policy.entityType,
            deleted: result.rowCount,
            cutoffDate,
          });
        }
      } catch (error) {
        logger.error('Retention policy failed', {
          entityType: policy.entityType,
          error: (error as Error).message,
        });
        results[policy.entityType] = -1;
      }
    }

    return results;
  },

  /**
   * Generate privacy report for user
   */
  async generatePrivacyReport(userId: string): Promise<{
    consents: Record<ConsentType, boolean>;
    dataCategories: string[];
    retentionPolicies: RetentionPolicy[];
    deletionStatus: any;
    lastUpdated: string;
  }> {
    const consents = await this.getUserConsents(userId);
    const deletionStatus = await this.getDeletionStatus(userId);

    // Check what data categories exist for user
    const dataCategories: string[] = ['profile'];

    const ordersCheck = await query(
      `SELECT 1 FROM orders WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (ordersCheck.rows.length > 0) {
      dataCategories.push('orders');
    }

    const queueCheck = await query(
      `SELECT 1 FROM queue_entries WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (queueCheck.rows.length > 0) {
      dataCategories.push('queue_participation');
    }

    const analyticsCheck = await query(
      `SELECT 1 FROM analytics_events WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    if (analyticsCheck.rows.length > 0) {
      dataCategories.push('analytics');
    }

    return {
      consents,
      dataCategories,
      retentionPolicies: this.getRetentionPolicies(),
      deletionStatus,
      lastUpdated: new Date().toISOString(),
    };
  },
};

export default privacyService;
