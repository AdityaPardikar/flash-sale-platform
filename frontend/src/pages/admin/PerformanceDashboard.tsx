/**
 * Performance Dashboard Page
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Admin dashboard for monitoring application performance:
 * - Endpoint response times (avg, p95, p99)
 * - Memory usage over time
 * - Event loop lag
 * - Cache hit rates
 * - Web Vitals summary
 */

import React, { useState, useEffect, useCallback } from 'react';
import { webVitals, WebVitalMetric } from '../../utils/webVitals';

// ─── Types ────────────────────────────────────────────────────

// Chrome-specific performance.memory interface
interface PerformanceMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

interface PerformanceWithMemory extends Performance {
  memory?: PerformanceMemory;
}

// ─── Helpers ──────────────────────────────────────────────────

const formatMs = (ms: number): string => {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const formatBytes = (bytes: number): string => {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)}MB`;
};

const vitalRatingColor = (rating: string): string => {
  switch (rating) {
    case 'good':
      return 'text-green-400';
    case 'needs-improvement':
      return 'text-yellow-400';
    case 'poor':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
};

// ─── Component ────────────────────────────────────────────────

const PerformanceDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'endpoints' | 'memory' | 'vitals' | 'slow'>(
    'endpoints',
  );
  const [vitalsMetrics, setVitalsMetrics] = useState<WebVitalMetric[]>([]);

  // Refresh Web Vitals
  const refreshVitals = useCallback(() => {
    setVitalsMetrics(webVitals.getMetrics());
  }, []);

  useEffect(() => {
    refreshVitals();
    const interval = setInterval(refreshVitals, 5000);
    return () => clearInterval(interval);
  }, [refreshVitals]);

  // Get latest value per metric name
  const latestVitals = vitalsMetrics.reduce<Record<string, WebVitalMetric>>((acc, m) => {
    acc[m.name] = m;
    return acc;
  }, {});

  const tabs = [
    { id: 'endpoints' as const, label: 'Endpoints' },
    { id: 'memory' as const, label: 'Memory' },
    { id: 'vitals' as const, label: 'Web Vitals' },
    { id: 'slow' as const, label: 'Slow Ops' },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Performance Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              Real-time performance monitoring & optimization insights
            </p>
          </div>
          <button
            onClick={refreshVitals}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: 'LCP',
              value: latestVitals.LCP ? `${Math.round(latestVitals.LCP.value)}ms` : '—',
              rating: latestVitals.LCP?.rating || 'unknown',
              desc: 'Largest Contentful Paint',
            },
            {
              label: 'FID',
              value: latestVitals.FID ? `${Math.round(latestVitals.FID.value)}ms` : '—',
              rating: latestVitals.FID?.rating || 'unknown',
              desc: 'First Input Delay',
            },
            {
              label: 'CLS',
              value: latestVitals.CLS ? latestVitals.CLS.value.toFixed(3) : '—',
              rating: latestVitals.CLS?.rating || 'unknown',
              desc: 'Cumulative Layout Shift',
            },
            {
              label: 'TTFB',
              value: latestVitals.TTFB ? `${Math.round(latestVitals.TTFB.value)}ms` : '—',
              rating: latestVitals.TTFB?.rating || 'unknown',
              desc: 'Time to First Byte',
            },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-400 text-xs uppercase tracking-wide">{kpi.label}</span>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    kpi.rating === 'good'
                      ? 'bg-green-900/50 text-green-400'
                      : kpi.rating === 'needs-improvement'
                        ? 'bg-yellow-900/50 text-yellow-400'
                        : kpi.rating === 'poor'
                          ? 'bg-red-900/50 text-red-400'
                          : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {kpi.rating}
                </span>
              </div>
              <div className={`text-2xl font-bold ${vitalRatingColor(kpi.rating)}`}>
                {kpi.value}
              </div>
              <div className="text-gray-500 text-xs mt-1">{kpi.desc}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 bg-gray-800 rounded-lg p-1 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          {activeTab === 'vitals' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Core Web Vitals</h3>
              {vitalsMetrics.length === 0 ? (
                <p className="text-gray-400">
                  No Web Vitals data collected yet. Interact with the page to generate metrics.
                </p>
              ) : (
                <div className="space-y-3">
                  {vitalsMetrics.map((metric, i) => (
                    <div
                      key={`${metric.name}-${i}`}
                      className="flex items-center justify-between bg-gray-900 rounded-lg p-3"
                    >
                      <div className="flex items-center space-x-3">
                        <span className={`text-lg font-bold ${vitalRatingColor(metric.rating)}`}>
                          {metric.name === 'CLS'
                            ? metric.value.toFixed(3)
                            : `${Math.round(metric.value)}ms`}
                        </span>
                        <span className="text-gray-400 text-sm">{metric.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            metric.rating === 'good'
                              ? 'bg-green-900/50 text-green-400'
                              : metric.rating === 'needs-improvement'
                                ? 'bg-yellow-900/50 text-yellow-400'
                                : 'bg-red-900/50 text-red-400'
                          }`}
                        >
                          {metric.rating}
                        </span>
                        <span className="text-gray-500 text-xs">
                          {new Date(metric.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'endpoints' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Endpoint Performance</h3>
              <p className="text-gray-400 text-sm mb-4">
                Endpoint timing data is collected server-side. Connect to the performance API for
                live data.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-3 pr-4">Endpoint</th>
                      <th className="pb-3 pr-4 text-right">Requests</th>
                      <th className="pb-3 pr-4 text-right">Avg</th>
                      <th className="pb-3 pr-4 text-right">P95</th>
                      <th className="pb-3 pr-4 text-right">P99</th>
                      <th className="pb-3 text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="text-gray-500 border-b border-gray-700/50">
                      <td className="py-3 pr-4" colSpan={6}>
                        Performance API integration pending — data collected by backend
                        PerformanceProfiler
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'memory' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Memory Usage</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-900 rounded-lg p-4">
                  <h4 className="text-sm text-gray-400 mb-2">Browser Memory</h4>
                  {(() => {
                    const perfWithMemory = performance as PerformanceWithMemory;
                    return perfWithMemory.memory ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Used JS Heap</span>
                          <span className="font-mono text-green-400">
                            {formatBytes(perfWithMemory.memory.usedJSHeapSize)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Total JS Heap</span>
                          <span className="font-mono text-blue-400">
                            {formatBytes(perfWithMemory.memory.totalJSHeapSize)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Heap Limit</span>
                          <span className="font-mono text-gray-400">
                            {formatBytes(perfWithMemory.memory.jsHeapSizeLimit)}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">
                        performance.memory API not available in this browser
                      </p>
                    );
                  })()}
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
                  <h4 className="text-sm text-gray-400 mb-2">Navigation Timing</h4>
                  {(() => {
                    const nav = performance.getEntriesByType('navigation')[0] as
                      | PerformanceNavigationTiming
                      | undefined;
                    if (!nav) return <p className="text-gray-500 text-sm">No navigation data</p>;
                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">DOM Interactive</span>
                          <span className="font-mono text-green-400">
                            {formatMs(nav.domInteractive)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">DOM Complete</span>
                          <span className="font-mono text-blue-400">
                            {formatMs(nav.domComplete)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400 text-sm">Load Event</span>
                          <span className="font-mono text-purple-400">
                            {formatMs(nav.loadEventEnd)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'slow' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Slow Operations</h3>
              <p className="text-gray-400 text-sm mb-4">
                Operations exceeding 100ms threshold. Tracked by the backend PerformanceProfiler.
              </p>
              <div className="bg-gray-900 rounded-lg p-4">
                <p className="text-gray-500 text-sm">
                  Connect to the performance API for real-time slow operation alerts. Slow
                  operations are also logged server-side with full metadata.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="mt-6 text-center text-gray-500 text-xs">
          Web Vitals Summary: {webVitals.getSummary() || 'Collecting...'}
        </div>
      </div>
    </div>
  );
};

export default PerformanceDashboard;
