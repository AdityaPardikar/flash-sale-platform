/**
 * Web Vitals Monitoring
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Core Web Vitals tracking:
 * - LCP (Largest Contentful Paint) — loading performance
 * - FID (First Input Delay) — interactivity
 * - CLS (Cumulative Layout Shift) — visual stability
 * - FCP (First Contentful Paint)
 * - TTFB (Time to First Byte)
 * - INP (Interaction to Next Paint)
 *
 * Reports metrics to console and optional analytics endpoint
 */

// ─── Types ────────────────────────────────────────────────────

export interface WebVitalMetric {
  name: 'LCP' | 'FID' | 'CLS' | 'FCP' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  navigationType: string;
}

interface VitalsConfig {
  /** Enable console logging */
  debug: boolean;
  /** Analytics endpoint to send metrics to */
  analyticsUrl?: string;
  /** Sampling rate (0-1), percentage of sessions to track */
  sampleRate: number;
}

// ─── Thresholds (per Google standards) ────────────────────────

const THRESHOLDS = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
  INP: { good: 200, poor: 500 },
};

// ─── Rating Calculator ───────────────────────────────────────

function getRating(
  name: keyof typeof THRESHOLDS,
  value: number
): 'good' | 'needs-improvement' | 'poor' {
  const threshold = THRESHOLDS[name];
  if (value <= threshold.good) return 'good';
  if (value <= threshold.poor) return 'needs-improvement';
  return 'poor';
}

// ─── Metrics Collector ───────────────────────────────────────

class WebVitalsCollector {
  private metrics: WebVitalMetric[] = [];
  private config: VitalsConfig;
  private isTracking: boolean = false;
  private observers: PerformanceObserver[] = [];

  constructor(config: Partial<VitalsConfig> = {}) {
    this.config = {
      debug: config.debug ?? import.meta.env.DEV === true,
      analyticsUrl: config.analyticsUrl,
      sampleRate: config.sampleRate ?? 1.0,
    };
  }

  /**
   * Start collecting Web Vitals
   */
  start(): void {
    // Sampling check
    if (Math.random() > this.config.sampleRate) {
      return;
    }

    if (this.isTracking) return;
    this.isTracking = true;

    if (typeof window === 'undefined' || !window.PerformanceObserver) {
      console.warn('[WebVitals] PerformanceObserver not supported');
      return;
    }

    this.observeLCP();
    this.observeFID();
    this.observeCLS();
    this.observeFCP();
    this.observeTTFB();
    this.observeINP();

    if (this.config.debug) {
      console.log('[WebVitals] Started collecting metrics');
    }
  }

  /**
   * Stop collecting and disconnect observers
   */
  stop(): void {
    this.observers.forEach((obs) => obs.disconnect());
    this.observers = [];
    this.isTracking = false;
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): WebVitalMetric[] {
    return [...this.metrics];
  }

  /**
   * Get the latest metric for each vital
   */
  getLatestMetrics(): Partial<Record<string, WebVitalMetric>> {
    const latest: Partial<Record<string, WebVitalMetric>> = {};
    for (const metric of this.metrics) {
      latest[metric.name] = metric;
    }
    return latest;
  }

  /**
   * Get a summary string for display
   */
  getSummary(): string {
    const latest = this.getLatestMetrics();
    const lines: string[] = [];
    for (const [name, metric] of Object.entries(latest)) {
      if (metric) {
        const unit = name === 'CLS' ? '' : 'ms';
        const value = name === 'CLS' ? metric.value.toFixed(3) : Math.round(metric.value);
        lines.push(`${name}: ${value}${unit} (${metric.rating})`);
      }
    }
    return lines.join(' | ');
  }

  // ─── Observer Implementations ─────────────────────────────

  private observeLCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1] as PerformanceEntry;
        if (lastEntry) {
          this.recordMetric('LCP', lastEntry.startTime);
        }
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // LCP not supported
    }
  }

  private observeFID(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];
        for (const entry of entries) {
          if (entry.processingStart) {
            this.recordMetric('FID', entry.processingStart - entry.startTime);
          }
        }
      });
      observer.observe({ type: 'first-input', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // FID not supported
    }
  }

  private observeCLS(): void {
    try {
      let clsValue = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as any[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value;
          }
        }
        this.recordMetric('CLS', clsValue);
      });
      observer.observe({ type: 'layout-shift', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // CLS not supported
    }
  }

  private observeFCP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntriesByName('first-contentful-paint');
        if (entries.length > 0) {
          this.recordMetric('FCP', entries[0].startTime);
        }
      });
      observer.observe({ type: 'paint', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // FCP not supported
    }
  }

  private observeTTFB(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const navEntries = list.getEntries() as PerformanceNavigationTiming[];
        if (navEntries.length > 0) {
          this.recordMetric('TTFB', navEntries[0].responseStart);
        }
      });
      observer.observe({ type: 'navigation', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // TTFB via Navigation Timing not supported
    }
  }

  private observeINP(): void {
    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceEventTiming[];
        for (const entry of entries) {
          if (entry.duration) {
            this.recordMetric('INP', entry.duration);
          }
        }
      });
      observer.observe({ type: 'event', buffered: true });
      this.observers.push(observer);
    } catch (e) {
      // INP not supported
    }
  }

  // ─── Metric Recording ─────────────────────────────────────

  private recordMetric(name: WebVitalMetric['name'], value: number): void {
    const metric: WebVitalMetric = {
      name,
      value,
      rating: getRating(name, value),
      timestamp: Date.now(),
      navigationType: this.getNavigationType(),
    };

    this.metrics.push(metric);

    if (this.config.debug) {
      const color =
        metric.rating === 'good' ? '🟢' : metric.rating === 'needs-improvement' ? '🟡' : '🔴';
      const unit = name === 'CLS' ? '' : 'ms';
      const display = name === 'CLS' ? value.toFixed(3) : Math.round(value);
      console.log(`[WebVitals] ${color} ${name}: ${display}${unit} (${metric.rating})`);
    }

    // Send to analytics endpoint
    if (this.config.analyticsUrl) {
      this.sendMetric(metric);
    }
  }

  private getNavigationType(): string {
    if (typeof window !== 'undefined' && window.performance) {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return nav?.type || 'unknown';
    }
    return 'unknown';
  }

  private sendMetric(metric: WebVitalMetric): void {
    if (!this.config.analyticsUrl) return;

    // Use Beacon API for reliability
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(this.config.analyticsUrl, JSON.stringify(metric));
    } else {
      fetch(this.config.analyticsUrl, {
        method: 'POST',
        body: JSON.stringify(metric),
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {
        // Silently fail
      });
    }
  }
}

// ─── Singleton Export ────────────────────────────────────────

export const webVitals = new WebVitalsCollector();
export { WebVitalsCollector };
