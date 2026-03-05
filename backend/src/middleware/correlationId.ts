/**
 * Correlation ID Middleware
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Generates or propagates a unique correlation ID for each request.
 * The ID flows through the entire request lifecycle, appears in logs,
 * response headers, and downstream service calls for end-to-end tracing.
 *
 * Header precedence: X-Correlation-ID → X-Request-ID → generated UUID
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// ─── AsyncLocalStorage for request-scoped context ───────────

import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  correlationId: string;
  requestId: string;
  userId?: string;
  startTime: bigint;
  traceId?: string;
  spanId?: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current request context (from any depth in the call stack).
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.getStore();
}

/**
 * Get the current correlation ID.
 */
export function getCorrelationId(): string | undefined {
  return requestContextStorage.getStore()?.correlationId;
}

// ─── Middleware ──────────────────────────────────────────────

export const correlationIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  // Extract or generate correlation ID
  const correlationId =
    (req.headers['x-correlation-id'] as string) ||
    (req.headers['x-request-id'] as string) ||
    uuidv4();

  // Request-level unique ID (always new)
  const requestId = uuidv4();

  // Attach to request for downstream middleware
  (req as any).correlationId = correlationId;
  (req as any).requestId = requestId;

  // Set response headers so callers can trace
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);

  // Set logger context (backwards-compatible with existing logger)
  logger.setRequestContext(requestId, req.user?.id);

  // Create request-scoped context via AsyncLocalStorage
  const context: RequestContext = {
    correlationId,
    requestId,
    startTime: process.hrtime.bigint(),
    userId: req.user?.id,
  };

  requestContextStorage.run(context, () => {
    // Clean up on response finish
    res.on('finish', () => {
      logger.clearRequestContext();
    });

    next();
  });
};

/**
 * Utility: Attach correlation headers to outgoing HTTP requests.
 * Use when calling downstream services.
 */
export function getCorrelationHeaders(): Record<string, string> {
  const ctx = getRequestContext();
  if (!ctx) return {};
  return {
    'X-Correlation-ID': ctx.correlationId,
    'X-Request-ID': ctx.requestId,
    ...(ctx.traceId ? { 'X-Trace-ID': ctx.traceId } : {}),
    ...(ctx.spanId ? { 'X-Span-ID': ctx.spanId } : {}),
  };
}

export default correlationIdMiddleware;
