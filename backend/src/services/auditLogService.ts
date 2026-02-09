/**
 * Audit Log Service
 * Day 5: Monitoring, Logging & Alerting
 * Service for managing audit trail and tracking admin actions
 */

import {
  AuditAction,
  AuditLog,
  AuditLogInput,
  AuditLogFilters,
  createAuditLog as createAuditLogModel,
  getAuditLogs as getAuditLogsModel,
  getAuditLogById as getAuditLogByIdModel,
  getAuditLogsByActor as getAuditLogsByActorModel,
  getAuditLogsByTarget as getAuditLogsByTargetModel,
  createAuditLogTable
} from '../models/auditLog';
import { logger } from '../utils/logger';

/**
 * Initialize audit log system
 */
export async function initializeAuditLog(): Promise<void> {
  try {
    await createAuditLogTable();
    logger.info('Audit log table initialized');
  } catch (error) {
    logger.error('Failed to initialize audit log table', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Log an admin action
 */
export async function logAdminAction(
  action: AuditAction,
  actor: { id: number; email?: string; role?: string },
  options: {
    targetType?: string;
    targetId?: string;
    previousValue?: any;
    newValue?: any;
    metadata?: Record<string, any>;
    request?: {
      ip?: string;
      userAgent?: string;
      requestId?: string;
    };
  } = {}
): Promise<AuditLog> {
  const input: AuditLogInput = {
    action,
    actorId: actor.id,
    actorEmail: actor.email,
    actorRole: actor.role,
    targetType: options.targetType,
    targetId: options.targetId,
    previousValue: options.previousValue,
    newValue: options.newValue,
    ipAddress: options.request?.ip,
    userAgent: options.request?.userAgent,
    requestId: options.request?.requestId,
    metadata: options.metadata
  };

  try {
    const auditLog = await createAuditLogModel(input);
    
    // Also log to file logger for redundancy
    logger.audit(action, actor.id.toString(), {
      targetType: options.targetType,
      targetId: options.targetId,
      ...options.metadata
    });
    
    return auditLog;
  } catch (error) {
    logger.error('Failed to create audit log', {
      action,
      actorId: actor.id,
      error: (error as Error).message
    });
    throw error;
  }
}

/**
 * Log authentication events
 */
export async function logAuthEvent(
  success: boolean,
  actor: { id: number; email?: string; role?: string },
  request?: { ip?: string; userAgent?: string; requestId?: string }
): Promise<AuditLog> {
  return logAdminAction(
    success ? AuditAction.ADMIN_LOGIN : AuditAction.LOGIN_FAILED,
    actor,
    { request }
  );
}

/**
 * Log flash sale changes
 */
export async function logSaleChange(
  action: 'create' | 'update' | 'delete' | 'activate' | 'pause' | 'end',
  actor: { id: number; email?: string; role?: string },
  saleId: string,
  options: {
    previousValue?: any;
    newValue?: any;
    request?: { ip?: string; userAgent?: string; requestId?: string };
  } = {}
): Promise<AuditLog> {
  const actionMap: Record<string, AuditAction> = {
    create: AuditAction.SALE_CREATE,
    update: AuditAction.SALE_UPDATE,
    delete: AuditAction.SALE_DELETE,
    activate: AuditAction.SALE_ACTIVATE,
    pause: AuditAction.SALE_PAUSE,
    end: AuditAction.SALE_END
  };

  return logAdminAction(actionMap[action], actor, {
    targetType: 'flash_sale',
    targetId: saleId,
    previousValue: options.previousValue,
    newValue: options.newValue,
    request: options.request
  });
}

/**
 * Log user status changes
 */
export async function logUserStatusChange(
  action: 'ban' | 'suspend' | 'reactivate' | 'status_change',
  actor: { id: number; email?: string; role?: string },
  userId: string,
  options: {
    previousStatus?: string;
    newStatus?: string;
    reason?: string;
    request?: { ip?: string; userAgent?: string; requestId?: string };
  } = {}
): Promise<AuditLog> {
  const actionMap: Record<string, AuditAction> = {
    ban: AuditAction.USER_BAN,
    suspend: AuditAction.USER_SUSPEND,
    reactivate: AuditAction.USER_REACTIVATE,
    status_change: AuditAction.USER_STATUS_CHANGE
  };

  return logAdminAction(actionMap[action], actor, {
    targetType: 'user',
    targetId: userId,
    previousValue: { status: options.previousStatus },
    newValue: { status: options.newStatus },
    metadata: { reason: options.reason },
    request: options.request
  });
}

/**
 * Log order actions
 */
export async function logOrderAction(
  action: 'cancel' | 'refund' | 'status_update',
  actor: { id: number; email?: string; role?: string },
  orderId: string,
  options: {
    previousStatus?: string;
    newStatus?: string;
    amount?: number;
    reason?: string;
    request?: { ip?: string; userAgent?: string; requestId?: string };
  } = {}
): Promise<AuditLog> {
  const actionMap: Record<string, AuditAction> = {
    cancel: AuditAction.ORDER_CANCEL,
    refund: AuditAction.ORDER_REFUND,
    status_update: AuditAction.ORDER_STATUS_UPDATE
  };

  return logAdminAction(actionMap[action], actor, {
    targetType: 'order',
    targetId: orderId,
    previousValue: { status: options.previousStatus },
    newValue: { status: options.newStatus, amount: options.amount },
    metadata: { reason: options.reason },
    request: options.request
  });
}

/**
 * Log queue management actions
 */
export async function logQueueAction(
  action: 'admit' | 'remove' | 'clear',
  actor: { id: number; email?: string; role?: string },
  saleId: string,
  options: {
    userId?: string;
    userCount?: number;
    request?: { ip?: string; userAgent?: string; requestId?: string };
  } = {}
): Promise<AuditLog> {
  const actionMap: Record<string, AuditAction> = {
    admit: AuditAction.QUEUE_ADMIT,
    remove: AuditAction.QUEUE_REMOVE,
    clear: AuditAction.QUEUE_CLEAR
  };

  return logAdminAction(actionMap[action], actor, {
    targetType: 'queue',
    targetId: saleId,
    metadata: {
      userId: options.userId,
      userCount: options.userCount
    },
    request: options.request
  });
}

/**
 * Get paginated audit logs
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {}
): Promise<{ logs: AuditLog[]; total: number; page: number; pageSize: number }> {
  const pageSize = filters.limit || 50;
  const page = filters.offset ? Math.floor(filters.offset / pageSize) + 1 : 1;

  const result = await getAuditLogsModel(filters);

  return {
    logs: result.logs,
    total: result.total,
    page,
    pageSize
  };
}

/**
 * Get audit log by ID
 */
export async function getAuditLogById(id: number): Promise<AuditLog | null> {
  return getAuditLogByIdModel(id);
}

/**
 * Get audit logs for a specific admin user
 */
export async function getAdminActivityLogs(
  adminId: number,
  limit: number = 50
): Promise<AuditLog[]> {
  return getAuditLogsByActorModel(adminId, limit);
}

/**
 * Get audit trail for a specific entity
 */
export async function getEntityAuditTrail(
  entityType: string,
  entityId: string,
  limit: number = 50
): Promise<AuditLog[]> {
  return getAuditLogsByTargetModel(entityType, entityId, limit);
}

/**
 * Get summary statistics for audit logs
 */
export async function getAuditSummary(
  startDate?: Date,
  endDate?: Date
): Promise<{
  totalActions: number;
  actionBreakdown: Record<string, number>;
  topActors: { actorId: number; email: string; count: number }[];
}> {
  const filters: AuditLogFilters = {
    startDate,
    endDate,
    limit: 10000 // Get a large sample for summary
  };

  const result = await getAuditLogsModel(filters);
  
  // Calculate action breakdown
  const actionBreakdown: Record<string, number> = {};
  const actorCounts: Record<number, { email: string; count: number }> = {};

  for (const log of result.logs) {
    // Count actions
    actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
    
    // Count actors
    if (!actorCounts[log.actorId]) {
      actorCounts[log.actorId] = { email: log.actorEmail || 'Unknown', count: 0 };
    }
    actorCounts[log.actorId].count++;
  }

  // Get top actors
  const topActors = Object.entries(actorCounts)
    .map(([actorId, data]) => ({
      actorId: parseInt(actorId, 10),
      email: data.email,
      count: data.count
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalActions: result.total,
    actionBreakdown,
    topActors
  };
}

/**
 * Generic action logging method
 * Used by middleware and services for flexible audit logging
 */
export async function logAction(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  changes?: Record<string, any> | null;
}): Promise<AuditLog | null> {
  try {
    const input: AuditLogInput = {
      action: params.action as AuditAction,
      actorId: parseInt(params.userId, 10) || 0,
      targetType: params.entityType,
      targetId: params.entityId || undefined,
      ipAddress: params.ipAddress || undefined,
      userAgent: params.userAgent || undefined,
      metadata: params.changes || undefined,
    };

    const auditLog = await createAuditLogModel(input);
    
    logger.audit(params.action, params.userId, {
      entityType: params.entityType,
      entityId: params.entityId,
    });

    return auditLog;
  } catch (error) {
    logger.error('Failed to create audit log', {
      action: params.action,
      userId: params.userId,
      error: (error as Error).message,
    });
    return null;
  }
}

// Export named for direct imports
export { AuditAction };
export const auditLogService = {
  initializeAuditLog,
  logAdminAction,
  logAuthEvent,
  logSaleChange,
  logUserStatusChange,
  logOrderAction,
  logQueueAction,
  getAuditLogs,
  getAuditLogById,
  getAdminActivityLogs,
  getEntityAuditTrail,
  getAuditSummary,
  logAction,
};

export default auditLogService;
