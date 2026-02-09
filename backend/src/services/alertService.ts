/**
 * Alert Service
 * Day 5: Monitoring, Logging & Alerting
 * Service for managing alerts, thresholds, and notifications
 */

import {
  AlertType,
  AlertSeverity,
  AlertStatus,
  Alert,
  AlertConfig,
  AlertInput,
  createAlert as createAlertModel,
  getAlerts as getAlertsModel,
  getActiveAlertCounts as getActiveAlertCountsModel,
  acknowledgeAlert as acknowledgeAlertModel,
  resolveAlert as resolveAlertModel,
  getAlertConfig,
  getAllAlertConfigs,
  updateAlertConfig as updateAlertConfigModel,
  createAlertsTable,
  createAlertConfigsTable,
  initializeDefaultAlertConfigs
} from '../models/alert';
import { logger } from '../utils/logger';
import { getSystemHealth, getResponseTimeMetrics } from './healthCheckService';

// Track last alert times to enforce cooldown
const lastAlertTimes: Map<AlertType, number> = new Map();

/**
 * Initialize alert system
 */
export async function initializeAlertSystem(): Promise<void> {
  try {
    await createAlertsTable();
    await createAlertConfigsTable();
    await initializeDefaultAlertConfigs();
    logger.info('Alert system initialized');
  } catch (error) {
    logger.error('Failed to initialize alert system', { error: (error as Error).message });
    throw error;
  }
}

/**
 * Check if an alert can be triggered (respects cooldown)
 */
async function canTriggerAlert(type: AlertType): Promise<boolean> {
  const config = await getAlertConfig(type);
  if (!config || !config.enabled) return false;

  const lastAlert = lastAlertTimes.get(type);
  if (lastAlert) {
    const timeSinceLastAlert = (Date.now() - lastAlert) / 1000;
    if (timeSinceLastAlert < config.cooldownPeriod) {
      return false;
    }
  }

  return true;
}

/**
 * Trigger an alert if conditions are met
 */
export async function triggerAlert(
  type: AlertType,
  title: string,
  message: string,
  source: string,
  metadata?: Record<string, any>
): Promise<Alert | null> {
  const canTrigger = await canTriggerAlert(type);
  if (!canTrigger) {
    logger.debug(`Alert ${type} suppressed due to cooldown or disabled`);
    return null;
  }

  const config = await getAlertConfig(type);
  const severity = config?.severity || AlertSeverity.WARNING;

  const input: AlertInput = {
    type,
    severity,
    title,
    message,
    source,
    metadata
  };

  try {
    const alert = await createAlertModel(input);
    lastAlertTimes.set(type, Date.now());

    logger.warn(`Alert triggered: ${type}`, { alertId: alert.id, title, severity });

    // Send notifications
    await sendNotifications(alert, config);

    return alert;
  } catch (error) {
    logger.error('Failed to create alert', { type, error: (error as Error).message });
    throw error;
  }
}

/**
 * Send notifications for an alert
 */
async function sendNotifications(alert: Alert, config: AlertConfig | null): Promise<void> {
  if (!config) return;

  // Email notification (placeholder - would integrate with email service)
  if (config.notifyEmail && config.emailRecipients && config.emailRecipients.length > 0) {
    logger.info('Email notification would be sent', {
      alertId: alert.id,
      recipients: config.emailRecipients
    });
    // In production: await emailService.sendAlert(alert, config.emailRecipients);
  }

  // Slack notification (placeholder - would integrate with Slack webhook)
  if (config.notifySlack && config.slackWebhook) {
    logger.info('Slack notification would be sent', {
      alertId: alert.id,
      webhook: config.slackWebhook.substring(0, 30) + '...'
    });
    // In production: await slackService.sendAlert(alert, config.slackWebhook);
  }
}

/**
 * Check system health and trigger alerts
 */
export async function checkAndTriggerAlerts(): Promise<void> {
  try {
    const health = await getSystemHealth();
    const metrics = getResponseTimeMetrics();

    // Check database health
    if (health.database.status === 'unhealthy') {
      await triggerAlert(
        AlertType.DATABASE_CONNECTION,
        'Database Connection Issue',
        `Database is unhealthy: ${health.database.error || 'Unknown error'}`,
        'health_check',
        { latencyMs: health.database.latencyMs }
      );
    }

    // Check Redis health
    if (health.redis.status === 'unhealthy') {
      await triggerAlert(
        AlertType.SYSTEM_DOWN,
        'Redis Connection Issue',
        `Redis is unhealthy: ${health.redis.error || 'Unknown error'}`,
        'health_check',
        { latencyMs: health.redis.latencyMs }
      );
    }

    // Check response times
    const slowResponseConfig = await getAlertConfig(AlertType.SLOW_RESPONSE_TIME);
    if (slowResponseConfig && slowResponseConfig.enabled && slowResponseConfig.threshold) {
      if (metrics.p95 > slowResponseConfig.threshold) {
        await triggerAlert(
          AlertType.SLOW_RESPONSE_TIME,
          'Slow Response Times Detected',
          `P95 response time is ${metrics.p95}ms (threshold: ${slowResponseConfig.threshold}ms)`,
          'health_check',
          { p50: metrics.p50, p95: metrics.p95, p99: metrics.p99 }
        );
      }
    }

    // Check memory usage
    if (health.memory.percentUsed > 80) {
      await triggerAlert(
        AlertType.REDIS_MEMORY_HIGH,
        'High Memory Usage',
        `Memory usage is at ${health.memory.percentUsed}%`,
        'health_check',
        health.memory
      );
    }

  } catch (error) {
    logger.error('Error during alert check', { error: (error as Error).message });
  }
}

/**
 * Get all active alerts
 */
export async function getActiveAlerts(): Promise<Alert[]> {
  const result = await getAlertsModel({ status: AlertStatus.ACTIVE });
  return result.alerts;
}

/**
 * Get alerts with pagination and filters
 */
export async function getAlerts(filters: {
  status?: AlertStatus;
  type?: AlertType;
  severity?: AlertSeverity;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
}): Promise<{ alerts: Alert[]; total: number; page: number; pageSize: number }> {
  const pageSize = filters.pageSize || 50;
  const page = filters.page || 1;
  const offset = (page - 1) * pageSize;

  const result = await getAlertsModel({
    status: filters.status,
    type: filters.type,
    severity: filters.severity,
    startDate: filters.startDate,
    endDate: filters.endDate,
    limit: pageSize,
    offset
  });

  return {
    alerts: result.alerts,
    total: result.total,
    page,
    pageSize
  };
}

/**
 * Get alert counts by severity
 */
export async function getAlertCounts(): Promise<{
  total: number;
  bySeverity: Record<AlertSeverity, number>;
}> {
  const counts = await getActiveAlertCountsModel();
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

  return {
    total,
    bySeverity: counts
  };
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: number, adminId: number): Promise<Alert | null> {
  const alert = await acknowledgeAlertModel(alertId, adminId);
  if (alert) {
    logger.info('Alert acknowledged', { alertId, adminId });
  }
  return alert;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: number): Promise<Alert | null> {
  const alert = await resolveAlertModel(alertId);
  if (alert) {
    logger.info('Alert resolved', { alertId });
  }
  return alert;
}

/**
 * Auto-resolve alerts when conditions improve
 */
export async function autoResolveAlerts(): Promise<void> {
  try {
    const health = await getSystemHealth();
    const activeAlerts = await getActiveAlerts();

    for (const alert of activeAlerts) {
      let shouldResolve = false;

      switch (alert.type) {
        case AlertType.DATABASE_CONNECTION:
          shouldResolve = health.database.status === 'ok';
          break;
        case AlertType.SYSTEM_DOWN:
          shouldResolve = health.status === 'healthy';
          break;
        case AlertType.REDIS_MEMORY_HIGH:
          shouldResolve = health.memory.percentUsed < 70;
          break;
      }

      if (shouldResolve) {
        await resolveAlert(alert.id);
        logger.info('Alert auto-resolved', { alertId: alert.id, type: alert.type });
      }
    }
  } catch (error) {
    logger.error('Error during auto-resolve', { error: (error as Error).message });
  }
}

/**
 * Get all alert configurations
 */
export async function getAlertConfigurations(): Promise<AlertConfig[]> {
  return getAllAlertConfigs();
}

/**
 * Update alert configuration
 */
export async function updateAlertConfiguration(
  type: AlertType,
  updates: Partial<AlertConfig>
): Promise<AlertConfig | null> {
  const result = await updateAlertConfigModel(type, updates);
  if (result) {
    logger.info('Alert configuration updated', { type, updates });
  }
  return result;
}

/**
 * Start periodic alert checking
 */
let alertCheckInterval: NodeJS.Timeout | null = null;

export function startAlertMonitoring(intervalSeconds: number = 60): void {
  if (alertCheckInterval) {
    clearInterval(alertCheckInterval);
  }

  alertCheckInterval = setInterval(async () => {
    await checkAndTriggerAlerts();
    await autoResolveAlerts();
  }, intervalSeconds * 1000);

  logger.info('Alert monitoring started', { intervalSeconds });
}

export function stopAlertMonitoring(): void {
  if (alertCheckInterval) {
    clearInterval(alertCheckInterval);
    alertCheckInterval = null;
    logger.info('Alert monitoring stopped');
  }
}

export default {
  initializeAlertSystem,
  triggerAlert,
  checkAndTriggerAlerts,
  getActiveAlerts,
  getAlerts,
  getAlertCounts,
  acknowledgeAlert,
  resolveAlert,
  autoResolveAlerts,
  getAlertConfigurations,
  updateAlertConfiguration,
  startAlertMonitoring,
  stopAlertMonitoring
};
