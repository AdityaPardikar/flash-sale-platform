/**
 * Distributed Tracing Middleware
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Lightweight distributed tracing that creates spans for API requests
 * and key operations. Compatible with OpenTelemetry trace/span ID format.
 *
 * Features:
 * - W3C Trace Context propagation (traceparent header)
 * - Span creation for key operations
 * - Cross-service trace linking
 * - Error tracing with stack attachment
 * - Performance bottleneck identification via span duration
 * - Configurable trace sampling
 */

import { Request, Response, NextFunction } from 'express';
import { randomBytes } from 'crypto';
import { getRequestContext, requestContextStorage, RequestContext } from './correlationId';
import { logger } from '../utils/logger';

// ─── Types ──────────────────────────────────────────────────

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: bigint;
  endTime?: bigint;
  durationMs?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: SpanEvent[];
  error?: {
    message: string;
    stack?: string;
    type: string;
  };
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface TracingConfig {
  /** Sampling rate 0.0 – 1.0 (default 1.0 = trace everything) */
  samplingRate: number;
  /** Max spans to buffer before flushing (default 1000) */
  maxBufferSize: number;
  /** Whether to log completed spans for debugging */
  logSpans: boolean;
  /** Operations to always trace regardless of sampling */
  alwaysTrace: string[];
}

// ─── Configuration ──────────────────────────────────────────

const defaultConfig: TracingConfig = {
  samplingRate: parseFloat(process.env.TRACE_SAMPLING_RATE || '1.0'),
  maxBufferSize: 1000,
  logSpans: process.env.NODE_ENV !== 'production',
  alwaysTrace: ['flash-sale-purchase', 'payment-process', 'inventory-reserve'],
};

let config: TracingConfig = { ...defaultConfig };

// ─── Span Buffer ────────────────────────────────────────────

const spanBuffer: Span[] = [];
const spanListeners: Array<(span: Span) => void> = [];

function flushSpan(span: Span): void {
  spanBuffer.push(span);

  // Notify listeners
  for (const listener of spanListeners) {
    try {
      listener(span);
    } catch {
      // Listeners should not break tracing
    }
  }

  // Trim buffer
  while (spanBuffer.length > config.maxBufferSize) {
    spanBuffer.shift();
  }

  // Debug logging
  if (config.logSpans && span.durationMs !== undefined && span.durationMs > 100) {
    logger.debug(`[Trace] Slow span: ${span.operationName} took ${span.durationMs}ms`, {
      traceId: span.traceId,
      spanId: span.spanId,
      status: span.status,
    });
  }
}

// ─── ID Generation ──────────────────────────────────────────

function generateTraceId(): string {
  return randomBytes(16).toString('hex');
}

function generateSpanId(): string {
  return randomBytes(8).toString('hex');
}

// ─── W3C Trace Context Parsing ──────────────────────────────

interface TraceContext {
  traceId: string;
  parentSpanId: string;
  sampled: boolean;
}

function parseTraceparent(header: string): TraceContext | null {
  // Format: version-traceId-parentSpanId-flags
  // Example: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
  const parts = header.split('-');
  if (parts.length !== 4) return null;

  const [_version, traceId, parentSpanId, flags] = parts;
  if (traceId.length !== 32 || parentSpanId.length !== 16) return null;

  return {
    traceId,
    parentSpanId,
    sampled: (parseInt(flags, 16) & 0x01) === 1,
  };
}

function formatTraceparent(traceId: string, spanId: string, sampled: boolean): string {
  const flags = sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

// ─── Sampling ───────────────────────────────────────────────

function shouldSample(operationName: string): boolean {
  if (config.alwaysTrace.includes(operationName)) return true;
  return Math.random() < config.samplingRate;
}

// ─── Middleware ──────────────────────────────────────────────

export const tracingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const operationName = `${req.method} ${req.path}`;

  // Parse incoming trace context
  const traceparent = req.headers['traceparent'] as string | undefined;
  let traceCtx: TraceContext | null = null;
  if (traceparent) {
    traceCtx = parseTraceparent(traceparent);
  }

  // Determine sampling
  const sampled = traceCtx ? traceCtx.sampled : shouldSample(operationName);

  if (!sampled) {
    return next();
  }

  const traceId = traceCtx?.traceId || generateTraceId();
  const spanId = generateSpanId();
  const parentSpanId = traceCtx?.parentSpanId;

  // Propagate trace context downstream
  res.setHeader('traceparent', formatTraceparent(traceId, spanId, true));

  // Enrich the request context with trace info
  const ctx = getRequestContext();
  if (ctx) {
    ctx.traceId = traceId;
    ctx.spanId = spanId;
  }

  // Create the root span for this request
  const span: Span = {
    traceId,
    spanId,
    parentSpanId,
    operationName,
    startTime: process.hrtime.bigint(),
    status: 'unset',
    attributes: {
      'http.method': req.method,
      'http.url': req.originalUrl,
      'http.target': req.path,
      'http.user_agent': req.get('User-Agent') || '',
      'net.peer.ip': req.ip || req.socket?.remoteAddress || '',
    },
    events: [],
  };

  // Attach span to request for downstream use
  (req as any).__span = span;

  res.on('finish', () => {
    span.endTime = process.hrtime.bigint();
    span.durationMs = Number(span.endTime - span.startTime) / 1e6;
    span.attributes['http.status_code'] = res.statusCode;
    span.attributes['http.response_content_length'] = parseInt(
      (res.getHeader('content-length') as string) || '0',
      10
    );
    span.status = res.statusCode >= 400 ? 'error' : 'ok';

    flushSpan(span);
  });

  next();
};

// ─── Manual Span Creation ───────────────────────────────────

/**
 * Create a child span for tracing a specific operation.
 *
 * Usage:
 *   const span = startSpan('db.query.findUser');
 *   try {
 *     const user = await findUser(id);
 *     endSpan(span);
 *   } catch (err) {
 *     endSpan(span, err as Error);
 *   }
 */
export function startSpan(
  operationName: string,
  attributes: Record<string, string | number | boolean> = {}
): Span {
  const ctx = getRequestContext();
  const traceId = ctx?.traceId || generateTraceId();
  const parentSpanId = ctx?.spanId;

  return {
    traceId,
    spanId: generateSpanId(),
    parentSpanId,
    operationName,
    startTime: process.hrtime.bigint(),
    status: 'unset',
    attributes,
    events: [],
  };
}

/**
 * End a span and flush it to the buffer.
 */
export function endSpan(span: Span, error?: Error): void {
  span.endTime = process.hrtime.bigint();
  span.durationMs = Number(span.endTime - span.startTime) / 1e6;

  if (error) {
    span.status = 'error';
    span.error = {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
    };
    span.events.push({
      name: 'exception',
      timestamp: Date.now(),
      attributes: { 'exception.message': error.message, 'exception.type': error.constructor.name },
    });
  } else {
    span.status = 'ok';
  }

  flushSpan(span);
}

/**
 * Add an event to an active span.
 */
export function addSpanEvent(
  span: Span,
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  span.events.push({ name, timestamp: Date.now(), attributes });
}

/**
 * Set a single attribute on a span.
 */
export function setSpanAttribute(span: Span, key: string, value: string | number | boolean): void {
  span.attributes[key] = value;
}

// ─── Query API ──────────────────────────────────────────────

/**
 * Get recent spans (for admin dashboard / debugging).
 */
export function getRecentSpans(limit = 50): Span[] {
  return spanBuffer.slice(-limit).reverse();
}

/**
 * Get all spans for a specific trace ID.
 */
export function getTraceSpans(traceId: string): Span[] {
  return spanBuffer.filter((s) => s.traceId === traceId);
}

/**
 * Get slow spans (above a duration threshold in ms).
 */
export function getSlowSpans(thresholdMs = 500): Span[] {
  return spanBuffer.filter((s) => (s.durationMs || 0) > thresholdMs);
}

/**
 * Get error spans.
 */
export function getErrorSpans(): Span[] {
  return spanBuffer.filter((s) => s.status === 'error');
}

/**
 * Register a listener for completed spans (e.g. for exporting to Jaeger, etc).
 */
export function onSpanComplete(listener: (span: Span) => void): void {
  spanListeners.push(listener);
}

// ─── Configuration ──────────────────────────────────────────

export function configureTracing(partial: Partial<TracingConfig>): void {
  config = { ...config, ...partial };
}

export function getTracingConfig(): Readonly<TracingConfig> {
  return { ...config };
}

export default tracingMiddleware;
