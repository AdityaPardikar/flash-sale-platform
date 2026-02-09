/**
 * System Health Page
 * Day 5: Monitoring, Logging & Alerting
 * Dashboard for monitoring system health and services
 */

import React, { useState, useEffect, useCallback } from 'react';
import { ServiceStatus, HealthSummary, MetricsCard } from '../../components/admin/ServiceStatus';
import { API } from '../../services/api';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  database: {
    status: 'ok' | 'unhealthy';
    latencyMs: number;
    connectionCount?: number;
    error?: string;
  };
  redis: {
    status: 'ok' | 'unhealthy';
    latencyMs?: number;
    version?: string;
    error?: string;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    percentUsed: number;
  };
}

interface Service {
  name: string;
  status: 'ok' | 'degraded' | 'unhealthy';
  latencyMs: number;
  details?: Record<string, any>;
}

interface ResponseMetrics {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  memory: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
  };
}

export const SystemHealth: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [metrics, setMetrics] = useState<ResponseMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealthData = useCallback(async () => {
    try {
      setError(null);
      
      // Fetch all health data in parallel - use relative paths from API base
      const [healthRes, servicesRes, metricsRes] = await Promise.all([
        fetch('/api/health').then(r => r.json()).catch(() => null),
        fetch('/api/health/services').then(r => r.json()).catch(() => null),
        fetch('/api/health/metrics').then(r => r.json()).catch(() => null),
      ]);

      if (healthRes) setHealth(healthRes);
      if (servicesRes?.services) setServices(servicesRes.services);
      if (metricsRes) setMetrics(metricsRes);
      
      setLastUpdated(new Date());
    } catch (err) {
      setError('Failed to fetch health data');
      console.error('Health fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealthData();
  }, [fetchHealthData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchHealthData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealthData]);

  if (loading && !health) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-6">
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 rounded-lg"></div>
            <div className="h-24 bg-gray-200 rounded-lg"></div>
            <div className="h-24 bg-gray-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">System Health</h1>
          <p className="text-gray-600">
            Monitor system status and service health
          </p>
        </div>
        
        <div className="flex items-center gap-4 mt-4 md:mt-0">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300"
            />
            Auto-refresh
          </label>
          
          <button
            onClick={fetchHealthData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Now
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {health && (
        <HealthSummary
          status={health.status}
          uptime={health.uptime}
          memory={health.memory}
        />
      )}

      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Services</h2>
        <ServiceStatus services={services} loading={loading && services.length === 0} />
      </div>

      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricsCard
            title="Response Times"
            metrics={[
              { label: 'P50', value: metrics.responseTime.p50, unit: 'ms' },
              { label: 'P95', value: metrics.responseTime.p95, unit: 'ms' },
              { label: 'P99', value: metrics.responseTime.p99, unit: 'ms' },
              { label: 'Average', value: metrics.responseTime.avg, unit: 'ms' },
            ]}
          />
          
          <MetricsCard
            title="Memory (MB)"
            metrics={[
              { label: 'Heap Used', value: metrics.memory.heapUsed },
              { label: 'Heap Total', value: metrics.memory.heapTotal },
              { label: 'RSS', value: metrics.memory.rss },
            ]}
          />
          
          {health && (
            <MetricsCard
              title="Database"
              metrics={[
                { label: 'Status', value: health.database.status },
                { label: 'Latency', value: health.database.latencyMs, unit: 'ms' },
                { label: 'Connections', value: health.database.connectionCount || 0 },
              ]}
            />
          )}
        </div>
      )}

      {health?.redis && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Redis</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <span className="text-gray-600 text-sm">Status</span>
              <div className={`font-medium ${health.redis.status === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
                {health.redis.status}
              </div>
            </div>
            {health.redis.latencyMs !== undefined && (
              <div>
                <span className="text-gray-600 text-sm">Latency</span>
                <div className="font-medium text-gray-900">{health.redis.latencyMs}ms</div>
              </div>
            )}
            {health.redis.version && (
              <div>
                <span className="text-gray-600 text-sm">Version</span>
                <div className="font-medium text-gray-900">{health.redis.version}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {lastUpdated && (
        <div className="text-sm text-gray-500 text-right">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default SystemHealth;
