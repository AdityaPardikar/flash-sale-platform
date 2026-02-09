/**
 * Logger Utility
 * Day 5: Monitoring, Logging & Alerting
 * Structured logging with Winston-like interface
 * Uses native Node.js with file output capability
 */

import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: Record<string, any>;
  requestId?: string;
  userId?: string;
}

interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  logDir: string;
  maxFileSize: number; // in bytes
  maxFiles: number;
}

const defaultConfig: LoggerConfig = {
  level: process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG,
  enableConsole: true,
  enableFile: process.env.NODE_ENV === 'production',
  logDir: 'logs',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
};

let config: LoggerConfig = { ...defaultConfig };

// Ensure log directory exists
function ensureLogDir(): void {
  if (config.enableFile && !fs.existsSync(config.logDir)) {
    fs.mkdirSync(config.logDir, { recursive: true });
  }
}

// Get log file path
function getLogFilePath(type: 'combined' | 'error'): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(config.logDir, `${type}-${date}.log`);
}

// Format log entry
function formatLogEntry(entry: LogEntry): string {
  const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  const requestIdStr = entry.requestId ? ` [req:${entry.requestId}]` : '';
  const userIdStr = entry.userId ? ` [user:${entry.userId}]` : '';
  
  return `${entry.timestamp} [${entry.level}]${requestIdStr}${userIdStr} ${entry.message}${metaStr}`;
}

// Write to file
function writeToFile(entry: LogEntry): void {
  if (!config.enableFile) return;
  
  ensureLogDir();
  const logLine = formatLogEntry(entry) + '\n';
  
  // Write to combined log
  fs.appendFileSync(getLogFilePath('combined'), logLine);
  
  // Write errors to separate file
  if (entry.level === 'ERROR') {
    fs.appendFileSync(getLogFilePath('error'), logLine);
  }
}

// Color codes for console output
const colors: Record<string, string> = {
  ERROR: '\x1b[31m', // Red
  WARN: '\x1b[33m',  // Yellow
  INFO: '\x1b[32m',  // Green
  DEBUG: '\x1b[36m', // Cyan
  RESET: '\x1b[0m'
};

// Write to console
function writeToConsole(entry: LogEntry): void {
  if (!config.enableConsole) return;
  
  const color = colors[entry.level] || colors.RESET;
  const formattedMessage = `${color}${formatLogEntry(entry)}${colors.RESET}`;
  
  if (entry.level === 'ERROR') {
    console.error(formattedMessage);
  } else if (entry.level === 'WARN') {
    console.warn(formattedMessage);
  } else {
    console.log(formattedMessage);
  }
}

// Get numeric level from string
function getLevelNumber(level: string): LogLevel {
  switch (level) {
    case 'ERROR': return LogLevel.ERROR;
    case 'WARN': return LogLevel.WARN;
    case 'INFO': return LogLevel.INFO;
    case 'DEBUG': return LogLevel.DEBUG;
    default: return LogLevel.INFO;
  }
}

// Create log entry
function createLogEntry(level: string, message: string, meta?: Record<string, any>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    meta,
    requestId: (global as any).__requestId,
    userId: (global as any).__userId
  };
}

// Main log function
function log(level: string, message: string, meta?: Record<string, any>): void {
  const levelNum = getLevelNumber(level);
  
  if (levelNum > config.level) return;
  
  const entry = createLogEntry(level, message, meta);
  
  writeToConsole(entry);
  writeToFile(entry);
}

// Logger instance
export const logger = {
  error: (message: string, meta?: Record<string, any>) => log('ERROR', message, meta),
  warn: (message: string, meta?: Record<string, any>) => log('WARN', message, meta),
  info: (message: string, meta?: Record<string, any>) => log('INFO', message, meta),
  debug: (message: string, meta?: Record<string, any>) => log('DEBUG', message, meta),
  
  // Set request context
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
  
  // Log HTTP request
  http: (req: any, res: any, duration: number) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `${req.method} ${req.path} ${res.statusCode} ${duration}ms`,
      meta: {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      },
      requestId: req.requestId,
      userId: req.user?.id
    };
    
    writeToConsole(entry);
    writeToFile(entry);
  },
  
  // Log error with stack trace
  errorWithStack: (message: string, error: Error, meta?: Record<string, any>) => {
    log('ERROR', message, {
      ...meta,
      error: error.message,
      stack: error.stack
    });
  },
  
  // Log audit event
  audit: (action: string, userId: string, details: Record<string, any>) => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: `AUDIT: ${action}`,
      meta: {
        action,
        userId,
        ...details
      }
    };
    
    writeToConsole(entry);
    writeToFile(entry);
    
    // Also write to audit-specific log
    if (config.enableFile) {
      ensureLogDir();
      const auditLine = formatLogEntry(entry) + '\n';
      const auditFile = path.join(config.logDir, `audit-${new Date().toISOString().split('T')[0]}.log`);
      fs.appendFileSync(auditFile, auditLine);
    }
  },
  
  // Log performance metric
  performance: (operation: string, durationMs: number, meta?: Record<string, any>) => {
    log('DEBUG', `PERF: ${operation} took ${durationMs}ms`, meta);
  }
};

export default logger;
