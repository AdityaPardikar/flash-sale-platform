/**
 * Logger Utility
 * Day 5: Monitoring, Logging & Alerting
 * Enhanced Week 6 Day 1: Structured JSON logging, correlation IDs,
 * sensitive data redaction, log sampling, and per-module levels.
 */

import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  correlationId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  module?: string;
  meta?: Record<string, any>;
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
  /** Week 6: output structured JSON instead of plain text */
  jsonOutput: boolean;
  /** Week 6: per-module log levels */
  moduleLevels: Record<string, LogLevel>;
  /** Week 6: sampling rate for DEBUG logs (0.0–1.0) */
  debugSamplingRate: number;
  /** Week 6: fields to redact from meta */
  redactFields: string[];
}

const defaultConfig: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  logDir: 'logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5,
  jsonOutput: process.env.LOG_FORMAT === 'json' || process.env.NODE_ENV === 'production',
  moduleLevels: {},
  debugSamplingRate: 1.0,
  redactFields: [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'creditCard',
    'cardNumber',
    'cvv',
    'ssn',
    'accessToken',
    'refreshToken',
  ],
};

let config: LoggerConfig = { ...defaultConfig };

// ─── Correlation context (Week 6 AsyncLocalStorage aware) ───

function getContextFromALS(): {
  correlationId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
} {
  try {
    // Dynamic import to avoid circular dependency
    const store = require('../middleware/correlationId').requestContextStorage?.getStore?.();
    if (store) {
      return {
        correlationId: store.correlationId,
        requestId: store.requestId,
        traceId: store.traceId,
        spanId: store.spanId,
        userId: store.userId,
      };
    }
  } catch {
    // Middleware not loaded yet – fall back to globals
  }

  return {
    requestId: (global as any).__requestId,
    userId: (global as any).__userId,
  };
}

// ─── Redaction ──────────────────────────────────────────────

function redactSensitive(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (config.redactFields.some((f) => lowerKey.includes(f.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = redactSensitive(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ─── File helpers ───────────────────────────────────────────

function ensureLogDir(): void {
  if (config.enableFile && !fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

function getLogFilePath(type: 'combined' | 'error'): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(config.logDir, `${type}-${date}.log`);
}

// ─── Formatters ─────────────────────────────────────────────

function formatLogEntryPlain(entry: LogEntry): string {
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  const corrStr = entry.correlationId ? ` [corr:${entry.correlationId}]` : '';
  const reqStr = entry.requestId ? ` [req:${entry.requestId}]` : '';
  const traceStr = entry.traceId ? ` [trace:${entry.traceId}]` : '';
  const userStr = entry.userId ? ` [user:${entry.userId}]` : '';
  const modStr = entry.module ? ` [${entry.module}]` : '';

  return `${entry.timestamp} [${entry.level}]${modStr}${corrStr}${reqStr}${traceStr}${userStr} ${entry.message}${metaStr}`;
}

function formatLogEntryJson(entry: LogEntry): string {
  const obj: Record<string, any> = {
    '@timestamp': entry.timestamp,
    level: entry.level,
    message: entry.message,
  };
  if (entry.correlationId) obj.correlationId = entry.correlationId;
  if (entry.requestId) obj.requestId = entry.requestId;
  if (entry.traceId) obj.traceId = entry.traceId;
  if (entry.spanId) obj.spanId = entry.spanId;
  if (entry.userId) obj.userId = entry.userId;
  if (entry.module) obj.module = entry.module;
  if (entry.meta) obj.meta = entry.meta;
  return JSON.stringify(obj);
}

function formatLogEntry(entry: LogEntry): string {
  return config.jsonOutput ? formatLogEntryJson(entry) : formatLogEntryPlain(entry);
}

// ─── Writers ────────────────────────────────────────────────

function writeToFile(entry: LogEntry): void {
  if (!config.enableFile) return;

  ensureLogDir();
  const logLine = formatLogEntry(entry) + '\n';
  fs.appendFileSync(getLogFilePath('combined'), logLine);
  if (entry.level === 'ERROR') {
    fs.appendFileSync(getLogFilePath('error'), logLine);
  }
}

const colors: Record<string, string> = {
  ERROR: '\x1b[31m',
  WARN: '\x1b[33m',
  INFO: '\x1b[32m',
  DEBUG: '\x1b[36m',
  RESET: '\x1b[0m',
};

function writeToConsole(entry: LogEntry): void {
  if (!config.enableConsole) return;

  if (config.jsonOutput) {
    // In JSON mode just emit raw JSON
    const line = formatLogEntryJson(entry);
    if (entry.level === 'ERROR') console.error(line);
    else console.log(line);
    return;
  }

  const color = colors[entry.level] || colors.RESET;
  const msg = `${color}${formatLogEntryPlain(entry)}${colors.RESET}`;
  if (entry.level === 'ERROR') console.error(msg);
  else if (entry.level === 'WARN') console.warn(msg);
  else console.log(msg);
}

// ─── Level helpers ──────────────────────────────────────────

function getLevelNumber(level: string): LogLevel {
  switch (level) {
    case 'ERROR':
      return LogLevel.ERROR;
    case 'WARN':
      return LogLevel.WARN;
    case 'INFO':
      return LogLevel.INFO;
    case 'DEBUG':
      return LogLevel.DEBUG;
    default:
      return LogLevel.INFO;
  }
}

function getEffectiveLevel(module?: string): LogLevel {
  if (module && config.moduleLevels[module] !== undefined) {
    return config.moduleLevels[module];
  }
  return config.level;
}

// ─── Sampling ───────────────────────────────────────────────

function shouldSample(level: string): boolean {
  if (level === 'DEBUG' && config.debugSamplingRate < 1) {
    return Math.random() < config.debugSamplingRate;
  }
  return true;
}

// ─── Core log function ──────────────────────────────────────

function createLogEntry(
  level: string,
  message: string,
  meta?: Record<string, any>,
  module?: string
): LogEntry {
  const ctx = getContextFromALS();
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta: meta ? redactSensitive(meta) : undefined,
    correlationId: ctx.correlationId,
    requestId: ctx.requestId,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    userId: ctx.userId,
    module,
  };
}

function log(level: string, message: string, meta?: Record<string, any>, module?: string): void {
  const levelNum = getLevelNumber(level);
  if (levelNum > getEffectiveLevel(module)) return;
  if (!shouldSample(level)) return;

  const entry = createLogEntry(level, message, meta, module);
  writeToConsole(entry);
  writeToFile(entry);
}

// ─── Logger Instance ───────────────────────────────────────

export const logger = {
  error: (message: string, meta?: Record<string, any>) => log('ERROR', message, meta),
  warn: (message: string, meta?: Record<string, any>) => log('WARN', message, meta),
  info: (message: string, meta?: Record<string, any>) => log('INFO', message, meta),
  debug: (message: string, meta?: Record<string, any>) => log('DEBUG', message, meta),

  /**
   * Create a child logger scoped to a module.
   * Respects per-module level configuration.
   */
  child: (moduleName: string) => ({
    error: (message: string, meta?: Record<string, any>) => log('ERROR', message, meta, moduleName),
    warn: (message: string, meta?: Record<string, any>) => log('WARN', message, meta, moduleName),
    info: (message: string, meta?: Record<string, any>) => log('INFO', message, meta, moduleName),
    debug: (message: string, meta?: Record<string, any>) => log('DEBUG', message, meta, moduleName),
  }),

  // Set request context (backwards-compatible)
  setRequestContext: (requestId: string, userId?: string) => {
    (global as any).__requestId = requestId;
    (global as any).__userId = userId;
  },

  // Clear request context
  clearRequestContext: () => {
    (global as any).__requestId = undefined;
    (global as any).__userId = undefined;
  },

  // Configure logger
  configure: (newConfig: Partial<LoggerConfig>) => {
    config = { ...config, ...newConfig };
  },

  // Set per-module level
  setModuleLevel: (module: string, level: LogLevel) => {
    config.moduleLevels[module] = level;
  },

  // Log HTTP request
  http: (req: any, res: any, duration: number) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
      meta: redactSensitive({
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      }),
      requestId: req.requestId,
      userId: req.user?.id,
    };

    writeToConsole(entry);
    writeToFile(entry);
  },

  // Log error with stack trace
  errorWithStack: (message: string, error: Error, meta?: Record<string, any>) => {
    log('ERROR', message, {
      ...meta,
      error: error.message,
      stack: error.stack,
    });
  },

  // Log audit event
  audit: (action: string, userId: string, details: Record<string, any>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `AUDIT: ${action}`,
      meta: redactSensitive({
        action,
        userId,
        ...details,
      }),
    };

    writeToConsole(entry);
    writeToFile(entry);

    if (config.enableFile) {
      ensureLogDir();
      const auditLine = formatLogEntry(entry) + '\n';
      const auditFile = path.join(
        config.logDir,
        `audit-${new Date().toISOString().split('T')[0]}.log`
      );
      fs.appendFileSync(auditFile, auditLine);
    }
  },

  // Log performance metric
  performance: (operation: string, durationMs: number, meta?: Record<string, any>) => {
    log('DEBUG', `PERF: ${operation} took ${durationMs}ms`, meta);
  },
};

export default logger;
