/**
 * Metrics Routes
 * Week 6 Day 1: Monitoring, Metrics & Observability
 *
 * Exposes a /metrics endpoint in Prometheus exposition format
 * and a /metrics/json endpoint for dashboard consumption.
 * Also provides tracing query endpoints for admin debugging.
 */

import { Router, Request, Response } from 'express';
import { metricsService } from '../services/metricsService';
import { getRecentSpans, getTraceSpans, getSlowSpans, getErrorSpans } from '../middleware/tracing';

const router = Router();

/**
 * GET /api/v1/metrics
 * Prometheus exposition format – scraped by Prometheus server.
 */
router.get('/', (req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metricsService.getMetrics());
});

/**
 * GET /api/v1/metrics/json
 * JSON metrics snapshot for internal dashboards.
 */
router.get('/json', (req: Request, res: Response) => {
  res.json(metricsService.getMetricsJson());
});

/**
 * GET /api/v1/metrics/traces
 * Recent traces for admin debugging.
 */
router.get('/traces', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const spans = getRecentSpans(limit);

  res.json({
    count: spans.length,
    spans: spans.map(serializeSpan),
  });
});

/**
 * GET /api/v1/metrics/traces/:traceId
 * All spans for a specific trace.
 */
router.get('/traces/:traceId', (req: Request, res: Response) => {
  const spans = getTraceSpans(req.params.traceId);

  if (spans.length === 0) {
    return res.status(404).json({ error: 'Trace not found' });
  }

  res.json({
    traceId: req.params.traceId,
    spanCount: spans.length,
    spans: spans.map(serializeSpan),
  });
});

/**
 * GET /api/v1/metrics/traces/slow
 * Slow spans above a configurable threshold.
 */
router.get('/traces/slow', (req: Request, res: Response) => {
  const thresholdMs = parseInt(req.query.threshold as string, 10) || 500;
  const spans = getSlowSpans(thresholdMs);

  res.json({
    thresholdMs,
    count: spans.length,
    spans: spans.map(serializeSpan),
  });
});

/**
 * GET /api/v1/metrics/traces/errors
 * All error spans.
 */
router.get('/traces/errors', (req: Request, res: Response) => {
  const spans = getErrorSpans();

  res.json({
    count: spans.length,
    spans: spans.map(serializeSpan),
  });
});

// ─── Helpers ────────────────────────────────────────────────

function serializeSpan(span: any): Record<string, any> {
  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId || null,
    operationName: span.operationName,
    durationMs: span.durationMs,
    status: span.status,
    attributes: span.attributes,
    events: span.events,
    error: span.error || null,
  };
}

export default router;
