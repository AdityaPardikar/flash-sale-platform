/**
 * Audit Log Model
 * Day 5: Monitoring, Logging & Alerting
 * Database model for audit trail entries
 */

import { query } from '../utils/database';

export enum AuditAction {
  // Authentication
  ADMIN_LOGIN = 'admin_login',
  ADMIN_LOGOUT = 'admin_logout',
  LOGIN_FAILED = 'login_failed',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  
  // Flash Sale
  SALE_CREATE = 'sale_create',
  SALE_UPDATE = 'sale_update',
  SALE_DELETE = 'sale_delete',
  SALE_ACTIVATE = 'sale_activate',
  SALE_PAUSE = 'sale_pause',
  SALE_END = 'sale_end',
  SALE_CREATED = 'sale_created',
  SALE_UPDATED = 'sale_updated',
  SALE_DELETED = 'sale_deleted',
  SALE_STARTED = 'sale_started',
  SALE_ENDED = 'sale_ended',
  
  // User Management
  USER_STATUS_CHANGE = 'user_status_change',
  USER_BAN = 'user_ban',
  USER_SUSPEND = 'user_suspend',
  USER_REACTIVATE = 'user_reactivate',
  USER_CREATED = 'user_created',
  USER_UPDATED = 'user_updated',
  USER_DELETED = 'user_deleted',
  
  // Product Management
  PRODUCT_CREATED = 'product_created',
  PRODUCT_UPDATED = 'product_updated',
  PRODUCT_DELETED = 'product_deleted',
  
  // Order Management
  ORDER_CANCEL = 'order_cancel',
  ORDER_REFUND = 'order_refund',
  ORDER_STATUS_UPDATE = 'order_status_update',
  ORDER_CREATED = 'order_created',
  ORDER_COMPLETED = 'order_completed',
  ORDER_CANCELLED = 'order_cancelled',
  
  // Queue Management
  QUEUE_ADMIT = 'queue_admit',
  QUEUE_REMOVE = 'queue_remove',
  QUEUE_CLEAR = 'queue_clear',
  QUEUE_JOINED = 'queue_joined',
  QUEUE_LEFT = 'queue_left',
  
  // System Configuration
  CONFIG_UPDATE = 'config_update',
  ALERT_CONFIGURE = 'alert_configure',
  SETTINGS_CHANGED = 'settings_changed',
  
  // Bulk Operations
  BULK_USER_UPDATE = 'bulk_user_update',
  BULK_ORDER_UPDATE = 'bulk_order_update',
  
  // Data Access & Privacy
  DATA_EXPORT = 'data_export',
  SENSITIVE_DATA_ACCESS = 'sensitive_data_access',
  CONSENT_GRANTED = 'consent_granted',
  CONSENT_REVOKED = 'consent_revoked',
  DELETION_REQUESTED = 'deletion_requested',
}

export interface AuditLog {
  id: number;
  action: AuditAction;
  actorId: number;
  actorEmail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface AuditLogInput {
  action: AuditAction;
  actorId: number;
  actorEmail?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  previousValue?: any;
  newValue?: any;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, any>;
}

export interface AuditLogFilters {
  action?: AuditAction;
  actorId?: number;
  targetType?: string;
  targetId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Create audit_logs table if not exists
 */
export async function createAuditLogTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      action VARCHAR(50) NOT NULL,
      actor_id INTEGER NOT NULL,
      actor_email VARCHAR(255),
      actor_role VARCHAR(50),
      target_type VARCHAR(50),
      target_id VARCHAR(100),
      previous_value JSONB,
      new_value JSONB,
      ip_address VARCHAR(45),
      user_agent TEXT,
      request_id VARCHAR(36),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // Create indexes for efficient querying
  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)
  `);
}

/**
 * Create a new audit log entry
 */
export async function createAuditLog(input: AuditLogInput): Promise<AuditLog> {
  const result = await query(
    `INSERT INTO audit_logs (
      action, actor_id, actor_email, actor_role,
      target_type, target_id, previous_value, new_value,
      ip_address, user_agent, request_id, metadata
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *`,
    [
      input.action,
      input.actorId,
      input.actorEmail,
      input.actorRole,
      input.targetType,
      input.targetId,
      input.previousValue ? JSON.stringify(input.previousValue) : null,
      input.newValue ? JSON.stringify(input.newValue) : null,
      input.ipAddress,
      input.userAgent,
      input.requestId,
      input.metadata ? JSON.stringify(input.metadata) : null
    ]
  );
  
  return mapRowToAuditLog(result.rows[0]);
}

/**
 * Get audit logs with filters
 */
export async function getAuditLogs(filters: AuditLogFilters = {}): Promise<{
  logs: AuditLog[];
  total: number;
}> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;
  
  if (filters.action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(filters.action);
  }
  
  if (filters.actorId) {
    conditions.push(`actor_id = $${paramIndex++}`);
    params.push(filters.actorId);
  }
  
  if (filters.targetType) {
    conditions.push(`target_type = $${paramIndex++}`);
    params.push(filters.targetType);
  }
  
  if (filters.targetId) {
    conditions.push(`target_id = $${paramIndex++}`);
    params.push(filters.targetId);
  }
  
  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }
  
  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);
  
  // Get paginated results
  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  
  const result = await query(
    `SELECT * FROM audit_logs ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );
  
  return {
    logs: result.rows.map(mapRowToAuditLog),
    total
  };
}

/**
 * Get audit log by ID
 */
export async function getAuditLogById(id: number): Promise<AuditLog | null> {
  const result = await query('SELECT * FROM audit_logs WHERE id = $1', [id]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return mapRowToAuditLog(result.rows[0]);
}

/**
 * Get recent audit logs for an actor
 */
export async function getAuditLogsByActor(
  actorId: number,
  limit: number = 50
): Promise<AuditLog[]> {
  const result = await query(
    `SELECT * FROM audit_logs
     WHERE actor_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [actorId, limit]
  );
  
  return result.rows.map(mapRowToAuditLog);
}

/**
 * Get audit logs for a specific target
 */
export async function getAuditLogsByTarget(
  targetType: string,
  targetId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  const result = await query(
    `SELECT * FROM audit_logs
     WHERE target_type = $1 AND target_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [targetType, targetId, limit]
  );
  
  return result.rows.map(mapRowToAuditLog);
}

/**
 * Map database row to AuditLog object
 */
function mapRowToAuditLog(row: any): AuditLog {
  return {
    id: row.id,
    action: row.action as AuditAction,
    actorId: row.actor_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    targetType: row.target_type,
    targetId: row.target_id,
    previousValue: row.previous_value,
    newValue: row.new_value,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    requestId: row.request_id,
    metadata: row.metadata,
    createdAt: row.created_at
  };
}

export default {
  createAuditLogTable,
  createAuditLog,
  getAuditLogs,
  getAuditLogById,
  getAuditLogsByActor,
  getAuditLogsByTarget
};
