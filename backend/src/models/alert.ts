/**
 * Alert Model
 * Day 5: Monitoring, Logging & Alerting
 * Database model for alerts and alert configurations
 */

import { query } from '../utils/database';

export enum AlertType {
  HIGH_ERROR_RATE = 'high_error_rate',
  SLOW_RESPONSE_TIME = 'slow_response_time',
  QUEUE_OVERFLOW = 'queue_overflow',
  DATABASE_CONNECTION = 'database_connection',
  REDIS_MEMORY_HIGH = 'redis_memory_high',
  FAILED_PAYMENT_RATE = 'failed_payment_rate',
  LOW_INVENTORY = 'low_inventory',
  SALE_ENDING = 'sale_ending',
  SYSTEM_DOWN = 'system_down',
  CUSTOM = 'custom'
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  MUTED = 'muted'
}

export interface Alert {
  id: number;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
  acknowledgedBy?: number;
  acknowledgedAt?: Date;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertConfig {
  id: number;
  type: AlertType;
  enabled: boolean;
  threshold?: number;
  thresholdUnit?: string;
  checkInterval: number; // in seconds
  cooldownPeriod: number; // in seconds
  severity: AlertSeverity;
  notifyEmail: boolean;
  notifySlack: boolean;
  emailRecipients?: string[];
  slackWebhook?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AlertInput {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
}

/**
 * Create alerts table
 */
export async function createAlertsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      status VARCHAR(20) DEFAULT 'active',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      source VARCHAR(100) NOT NULL,
      metadata JSONB,
      acknowledged_by INTEGER,
      acknowledged_at TIMESTAMP,
      resolved_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity)
  `);
  await query(`
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(created_at DESC)
  `);
}

/**
 * Create alert_configs table
 */
export async function createAlertConfigsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS alert_configs (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) UNIQUE NOT NULL,
      enabled BOOLEAN DEFAULT true,
      threshold NUMERIC,
      threshold_unit VARCHAR(20),
      check_interval INTEGER DEFAULT 60,
      cooldown_period INTEGER DEFAULT 300,
      severity VARCHAR(20) DEFAULT 'warning',
      notify_email BOOLEAN DEFAULT false,
      notify_slack BOOLEAN DEFAULT false,
      email_recipients TEXT[],
      slack_webhook VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Initialize default alert configurations
 */
export async function initializeDefaultAlertConfigs(): Promise<void> {
  const defaults: Partial<AlertConfig>[] = [
    {
      type: AlertType.HIGH_ERROR_RATE,
      threshold: 1,
      thresholdUnit: 'percent',
      checkInterval: 60,
      cooldownPeriod: 300,
      severity: AlertSeverity.CRITICAL
    },
    {
      type: AlertType.SLOW_RESPONSE_TIME,
      threshold: 200,
      thresholdUnit: 'ms',
      checkInterval: 60,
      cooldownPeriod: 300,
      severity: AlertSeverity.WARNING
    },
    {
      type: AlertType.QUEUE_OVERFLOW,
      threshold: 10000,
      thresholdUnit: 'users',
      checkInterval: 30,
      cooldownPeriod: 600,
      severity: AlertSeverity.WARNING
    },
    {
      type: AlertType.DATABASE_CONNECTION,
      threshold: 1,
      thresholdUnit: 'failures',
      checkInterval: 30,
      cooldownPeriod: 60,
      severity: AlertSeverity.CRITICAL
    },
    {
      type: AlertType.REDIS_MEMORY_HIGH,
      threshold: 80,
      thresholdUnit: 'percent',
      checkInterval: 60,
      cooldownPeriod: 300,
      severity: AlertSeverity.WARNING
    },
    {
      type: AlertType.FAILED_PAYMENT_RATE,
      threshold: 5,
      thresholdUnit: 'percent',
      checkInterval: 60,
      cooldownPeriod: 600,
      severity: AlertSeverity.CRITICAL
    }
  ];

  for (const config of defaults) {
    await query(
      `INSERT INTO alert_configs (type, threshold, threshold_unit, check_interval, cooldown_period, severity)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (type) DO NOTHING`,
      [config.type, config.threshold, config.thresholdUnit, config.checkInterval, config.cooldownPeriod, config.severity]
    );
  }
}

/**
 * Create a new alert
 */
export async function createAlert(input: AlertInput): Promise<Alert> {
  const result = await query(
    `INSERT INTO alerts (type, severity, title, message, source, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.type, input.severity, input.title, input.message, input.source, 
     input.metadata ? JSON.stringify(input.metadata) : null]
  );

  return mapRowToAlert(result.rows[0]);
}

/**
 * Get alerts with filters
 */
export async function getAlerts(filters: {
  status?: AlertStatus;
  type?: AlertType;
  severity?: AlertSeverity;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
} = {}): Promise<{ alerts: Alert[]; total: number }> {
  const conditions: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.status) {
    conditions.push(`status = $${paramIndex++}`);
    params.push(filters.status);
  }

  if (filters.type) {
    conditions.push(`type = $${paramIndex++}`);
    params.push(filters.type);
  }

  if (filters.severity) {
    conditions.push(`severity = $${paramIndex++}`);
    params.push(filters.severity);
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

  const countResult = await query(
    `SELECT COUNT(*) as total FROM alerts ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;

  const result = await query(
    `SELECT * FROM alerts ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    alerts: result.rows.map(mapRowToAlert),
    total
  };
}

/**
 * Get active alerts count by severity
 */
export async function getActiveAlertCounts(): Promise<Record<AlertSeverity, number>> {
  const result = await query(
    `SELECT severity, COUNT(*) as count FROM alerts
     WHERE status = 'active'
     GROUP BY severity`
  );

  const counts: Record<AlertSeverity, number> = {
    [AlertSeverity.INFO]: 0,
    [AlertSeverity.WARNING]: 0,
    [AlertSeverity.CRITICAL]: 0
  };

  for (const row of result.rows) {
    counts[row.severity as AlertSeverity] = parseInt(row.count, 10);
  }

  return counts;
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(alertId: number, userId: number): Promise<Alert | null> {
  const result = await query(
    `UPDATE alerts
     SET status = 'acknowledged', acknowledged_by = $2, acknowledged_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [alertId, userId]
  );

  return result.rows.length > 0 ? mapRowToAlert(result.rows[0]) : null;
}

/**
 * Resolve an alert
 */
export async function resolveAlert(alertId: number): Promise<Alert | null> {
  const result = await query(
    `UPDATE alerts
     SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING *`,
    [alertId]
  );

  return result.rows.length > 0 ? mapRowToAlert(result.rows[0]) : null;
}

/**
 * Get alert configuration by type
 */
export async function getAlertConfig(type: AlertType): Promise<AlertConfig | null> {
  const result = await query(
    'SELECT * FROM alert_configs WHERE type = $1',
    [type]
  );

  return result.rows.length > 0 ? mapRowToAlertConfig(result.rows[0]) : null;
}

/**
 * Get all alert configurations
 */
export async function getAllAlertConfigs(): Promise<AlertConfig[]> {
  const result = await query('SELECT * FROM alert_configs ORDER BY type');
  return result.rows.map(mapRowToAlertConfig);
}

/**
 * Update alert configuration
 */
export async function updateAlertConfig(
  type: AlertType,
  updates: Partial<AlertConfig>
): Promise<AlertConfig | null> {
  const setClauses: string[] = [];
  const params: any[] = [];
  let paramIndex = 1;

  if (updates.enabled !== undefined) {
    setClauses.push(`enabled = $${paramIndex++}`);
    params.push(updates.enabled);
  }
  if (updates.threshold !== undefined) {
    setClauses.push(`threshold = $${paramIndex++}`);
    params.push(updates.threshold);
  }
  if (updates.checkInterval !== undefined) {
    setClauses.push(`check_interval = $${paramIndex++}`);
    params.push(updates.checkInterval);
  }
  if (updates.cooldownPeriod !== undefined) {
    setClauses.push(`cooldown_period = $${paramIndex++}`);
    params.push(updates.cooldownPeriod);
  }
  if (updates.severity !== undefined) {
    setClauses.push(`severity = $${paramIndex++}`);
    params.push(updates.severity);
  }
  if (updates.notifyEmail !== undefined) {
    setClauses.push(`notify_email = $${paramIndex++}`);
    params.push(updates.notifyEmail);
  }
  if (updates.notifySlack !== undefined) {
    setClauses.push(`notify_slack = $${paramIndex++}`);
    params.push(updates.notifySlack);
  }
  if (updates.emailRecipients !== undefined) {
    setClauses.push(`email_recipients = $${paramIndex++}`);
    params.push(updates.emailRecipients);
  }
  if (updates.slackWebhook !== undefined) {
    setClauses.push(`slack_webhook = $${paramIndex++}`);
    params.push(updates.slackWebhook);
  }

  if (setClauses.length === 0) return null;

  setClauses.push('updated_at = CURRENT_TIMESTAMP');
  params.push(type);

  const result = await query(
    `UPDATE alert_configs SET ${setClauses.join(', ')} WHERE type = $${paramIndex} RETURNING *`,
    params
  );

  return result.rows.length > 0 ? mapRowToAlertConfig(result.rows[0]) : null;
}

function mapRowToAlert(row: any): Alert {
  return {
    id: row.id,
    type: row.type as AlertType,
    severity: row.severity as AlertSeverity,
    status: row.status as AlertStatus,
    title: row.title,
    message: row.message,
    source: row.source,
    metadata: row.metadata,
    acknowledgedBy: row.acknowledged_by,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapRowToAlertConfig(row: any): AlertConfig {
  return {
    id: row.id,
    type: row.type as AlertType,
    enabled: row.enabled,
    threshold: row.threshold ? parseFloat(row.threshold) : undefined,
    thresholdUnit: row.threshold_unit,
    checkInterval: row.check_interval,
    cooldownPeriod: row.cooldown_period,
    severity: row.severity as AlertSeverity,
    notifyEmail: row.notify_email,
    notifySlack: row.notify_slack,
    emailRecipients: row.email_recipients,
    slackWebhook: row.slack_webhook,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export default {
  createAlertsTable,
  createAlertConfigsTable,
  initializeDefaultAlertConfigs,
  createAlert,
  getAlerts,
  getActiveAlertCounts,
  acknowledgeAlert,
  resolveAlert,
  getAlertConfig,
  getAllAlertConfigs,
  updateAlertConfig
};
