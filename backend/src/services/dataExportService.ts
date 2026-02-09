/**
 * Data Export Service
 * Day 7: Security Hardening & Audit System
 * GDPR-compliant data export for users
 */

import { query } from '../utils/database';
import { logger } from '../utils/logger';
import { removeSensitiveFields } from '../utils/sanitizer';
import auditLogService from './auditLogService';
import { AuditAction } from '../models/auditLog';

/**
 * Export data section
 */
interface DataSection {
  name: string;
  data: any[];
  description: string;
}

/**
 * Full data export result
 */
export interface DataExport {
  exportDate: string;
  userId: string;
  email: string;
  sections: DataSection[];
  metadata: {
    format: string;
    version: string;
    requestedAt: string;
    completedAt: string;
  };
}

/**
 * Export status tracking
 */
interface ExportRequest {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

// In-memory tracking (in production, use database)
const exportRequests = new Map<string, ExportRequest>();

/**
 * Data Export Service - GDPR Article 20 compliance
 */
export const dataExportService = {
  /**
   * Request a data export for user
   */
  async requestExport(userId: string): Promise<string> {
    const exportId = `export_${userId}_${Date.now()}`;
    
    const request: ExportRequest = {
      id: exportId,
      userId,
      status: 'pending',
      requestedAt: new Date(),
    };
    
    exportRequests.set(exportId, request);
    
    logger.info('Data export requested', { userId, exportId });
    
    // Start async processing
    this.processExport(exportId).catch(error => {
      logger.error('Export processing failed', { exportId, error: error.message });
    });
    
    return exportId;
  },

  /**
   * Process export request
   */
  async processExport(exportId: string): Promise<void> {
    const request = exportRequests.get(exportId);
    if (!request) {
      throw new Error('Export request not found');
    }

    request.status = 'processing';
    exportRequests.set(exportId, request);

    try {
      const data = await this.generateExport(request.userId);
      
      // In production, save to file storage and generate download URL
      // For now, we'll store it temporarily
      request.status = 'completed';
      request.completedAt = new Date();
      request.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      exportRequests.set(exportId, request);
      
      // Log audit event
      await auditLogService.logAction({
        userId: request.userId,
        action: AuditAction.DATA_EXPORT,
        entityType: 'user',
        entityId: request.userId,
        changes: { exportId, sections: data.sections.map(s => s.name) },
      });

      logger.info('Data export completed', { exportId, userId: request.userId });
    } catch (error) {
      request.status = 'failed';
      exportRequests.set(exportId, request);
      throw error;
    }
  },

  /**
   * Generate complete data export
   */
  async generateExport(userId: string): Promise<DataExport> {
    const requestedAt = new Date().toISOString();
    
    // Fetch user profile
    const userResult = await query(
      `SELECT id, email, name, role, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];
    const sections: DataSection[] = [];

    // Profile data
    sections.push({
      name: 'profile',
      description: 'Your account profile information',
      data: [removeSensitiveFields(user)],
    });

    // Orders
    const ordersResult = await query(
      `SELECT id, flash_sale_id, status, quantity, total_price, 
              created_at, updated_at
       FROM orders WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    
    if (ordersResult.rows.length > 0) {
      sections.push({
        name: 'orders',
        description: 'Your order history',
        data: ordersResult.rows,
      });
    }

    // Queue entries
    const queueResult = await query(
      `SELECT id, flash_sale_id, status, position, joined_at, 
              turn_started_at, completed_at
       FROM queue_entries WHERE user_id = $1
       ORDER BY joined_at DESC`,
      [userId]
    );

    if (queueResult.rows.length > 0) {
      sections.push({
        name: 'queue_participation',
        description: 'Your flash sale queue participation history',
        data: queueResult.rows,
      });
    }

    // Analytics events (anonymized)
    const analyticsResult = await query(
      `SELECT event_type, metadata, created_at
       FROM analytics_events WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 1000`,
      [userId]
    );

    if (analyticsResult.rows.length > 0) {
      sections.push({
        name: 'activity_log',
        description: 'Your activity on the platform',
        data: analyticsResult.rows.map(row => ({
          type: row.event_type,
          timestamp: row.created_at,
          details: removeSensitiveFields(row.metadata || {}),
        })),
      });
    }

    // Audit logs for user
    const auditResult = await query(
      `SELECT action, entity_type, created_at
       FROM audit_logs WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 500`,
      [userId]
    );

    if (auditResult.rows.length > 0) {
      sections.push({
        name: 'account_activity',
        description: 'Account-related activities and changes',
        data: auditResult.rows,
      });
    }

    const completedAt = new Date().toISOString();

    return {
      exportDate: completedAt,
      userId: user.id,
      email: user.email,
      sections,
      metadata: {
        format: 'json',
        version: '1.0',
        requestedAt,
        completedAt,
      },
    };
  },

  /**
   * Get export request status
   */
  async getExportStatus(exportId: string): Promise<ExportRequest | null> {
    return exportRequests.get(exportId) || null;
  },

  /**
   * Get exports for user
   */
  async getUserExports(userId: string): Promise<ExportRequest[]> {
    const exports: ExportRequest[] = [];
    
    for (const request of exportRequests.values()) {
      if (request.userId === userId) {
        exports.push(request);
      }
    }
    
    return exports.sort((a, b) => 
      b.requestedAt.getTime() - a.requestedAt.getTime()
    );
  },

  /**
   * Download export data (returns the data)
   */
  async downloadExport(exportId: string, userId: string): Promise<DataExport | null> {
    const request = exportRequests.get(exportId);
    
    if (!request || request.userId !== userId) {
      return null;
    }

    if (request.status !== 'completed') {
      return null;
    }

    if (request.expiresAt && new Date() > request.expiresAt) {
      return null;
    }

    // Regenerate export data
    return await this.generateExport(userId);
  },

  /**
   * Clean up expired exports
   */
  async cleanupExpiredExports(): Promise<number> {
    const now = new Date();
    let cleaned = 0;

    for (const [exportId, request] of exportRequests.entries()) {
      if (request.expiresAt && now > request.expiresAt) {
        exportRequests.delete(exportId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('Cleaned up expired exports', { count: cleaned });
    }

    return cleaned;
  },
};

export default dataExportService;
