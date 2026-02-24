/**
 * Live Metrics Widget
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Real-time metric counters that update via WebSocket,
 * showing server health, active users, revenue ticker,
 * and alert notifications.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../../contexts/WebSocketContext';

interface MetricCard {
  label: string;
  value: string | number;
  icon: string;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: string;
  color: string;
}

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
}

interface LiveMetricsProps {
  /** Initial KPIs from the executive summary */
  initialKpis?: {
    totalRevenue: number;
    totalOrders: number;
    activeSales: number;
    totalUsers: number;
    conversionRate: number;
  };
  alerts?: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }>;
  onRefresh?: () => void;
  compact?: boolean;
}

const LiveMetrics: React.FC<LiveMetricsProps> = ({
  initialKpis,
  alerts: initialAlerts = [],
  onRefresh,
  compact = false,
}) => {
  const { connectionState, latency } = useWebSocket();
  const [metrics, setMetrics] = useState({
    activeConnections: 0,
    requestsPerSecond: 0,
    avgResponseTime: 0,
    errorRate: 0,
    memoryUsage: 0,
    cpuUsage: 0,
  });
  const [alerts, setAlerts] = useState<Alert[]>(
    initialAlerts.map((a, i) => ({
      id: `init-${i}`,
      ...a,
      timestamp: new Date(),
    }))
  );
  const [revenueCounter, setRevenueCounter] = useState(initialKpis?.totalRevenue || 0);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  // Simulate live metric updates (in production, these would come from WebSocket)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setMetrics((prev) => ({
        activeConnections: Math.max(0, prev.activeConnections + Math.floor(Math.random() * 5) - 2),
        requestsPerSecond: Math.max(
          0,
          Math.round((prev.requestsPerSecond * 0.8 + Math.random() * 50) * 10) / 10
        ),
        avgResponseTime: Math.max(
          5,
          Math.round((prev.avgResponseTime * 0.9 + Math.random() * 200) * 10) / 10
        ),
        errorRate: Math.max(0, Math.round((prev.errorRate * 0.95 + Math.random() * 2) * 100) / 100),
        memoryUsage: Math.min(100, Math.max(20, prev.memoryUsage + (Math.random() - 0.5) * 5)),
        cpuUsage: Math.min(100, Math.max(5, prev.cpuUsage + (Math.random() - 0.5) * 10)),
      }));
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
  };

  const metricCards: MetricCard[] = [
    {
      label: 'Active Users',
      value: metrics.activeConnections,
      icon: '👥',
      color: 'text-blue-400',
      trend: metrics.activeConnections > 10 ? 'up' : 'stable',
    },
    {
      label: 'Req/sec',
      value: metrics.requestsPerSecond.toFixed(1),
      icon: '⚡',
      color: 'text-yellow-400',
      trend: metrics.requestsPerSecond > 30 ? 'up' : 'stable',
    },
    {
      label: 'Avg Response',
      value: `${metrics.avgResponseTime.toFixed(0)}ms`,
      icon: '⏱️',
      color: metrics.avgResponseTime > 200 ? 'text-red-400' : 'text-green-400',
      trend: metrics.avgResponseTime > 200 ? 'up' : 'down',
    },
    {
      label: 'Error Rate',
      value: `${metrics.errorRate.toFixed(2)}%`,
      icon: '🔴',
      color: metrics.errorRate > 1 ? 'text-red-400' : 'text-green-400',
      trend: metrics.errorRate > 1 ? 'up' : 'stable',
    },
  ];

  const serverCards: MetricCard[] = [
    {
      label: 'Memory',
      value: `${metrics.memoryUsage.toFixed(0)}%`,
      icon: '💾',
      color:
        metrics.memoryUsage > 80
          ? 'text-red-400'
          : metrics.memoryUsage > 60
            ? 'text-yellow-400'
            : 'text-green-400',
    },
    {
      label: 'CPU',
      value: `${metrics.cpuUsage.toFixed(0)}%`,
      icon: '🖥️',
      color:
        metrics.cpuUsage > 80
          ? 'text-red-400'
          : metrics.cpuUsage > 60
            ? 'text-yellow-400'
            : 'text-green-400',
    },
    {
      label: 'WS Latency',
      value: latency !== null ? `${latency}ms` : 'N/A',
      icon: '📡',
      color: latency !== null && latency < 100 ? 'text-green-400' : 'text-yellow-400',
    },
    {
      label: 'Connection',
      value: connectionState,
      icon: connectionState === 'connected' ? '🟢' : '🔴',
      color: connectionState === 'connected' ? 'text-green-400' : 'text-red-400',
    },
  ];

  if (compact) {
    return (
      <div className="flex gap-3 flex-wrap">
        {metricCards.slice(0, 4).map((card) => (
          <div key={card.label} className="bg-white/5 rounded-lg px-3 py-2 flex items-center gap-2">
            <span>{card.icon}</span>
            <span className={`text-sm font-medium ${card.color}`}>{card.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live Status Bar */}
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            📊 Live Metrics
            <span className="relative flex h-3 w-3 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
            </span>
          </h3>
          {onRefresh && (
            <button
              onClick={onRefresh}
              className="text-xs text-gray-400 hover:text-white transition-colors px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10"
            >
              ↻ Refresh
            </button>
          )}
        </div>

        {/* Traffic Metrics */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {metricCards.map((card) => (
            <div key={card.label} className="bg-white/5 rounded-xl p-3 text-center">
              <span className="text-lg">{card.icon}</span>
              <p className={`text-xl font-bold ${card.color} mt-1`}>{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.label}</p>
              {card.trend && (
                <span
                  className={`text-xs ${
                    card.trend === 'up'
                      ? 'text-green-400'
                      : card.trend === 'down'
                        ? 'text-red-400'
                        : 'text-gray-500'
                  }`}
                >
                  {card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : '→'}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Server Health */}
        <div className="grid grid-cols-4 gap-3">
          {serverCards.map((card) => (
            <div key={card.label} className="bg-white/5 rounded-xl p-3 text-center">
              <span className="text-lg">{card.icon}</span>
              <p className={`text-lg font-bold ${card.color} mt-1`}>{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Revenue KPIs */}
        {initialKpis && (
          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
            <div className="text-center">
              <p className="text-xs text-gray-400">Revenue</p>
              <p className="text-lg font-bold text-green-400">
                {formatCurrency(initialKpis.totalRevenue)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Active Sales</p>
              <p className="text-lg font-bold text-purple-400">{initialKpis.activeSales}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-400">Conversion</p>
              <p className="text-lg font-bold text-blue-400">
                {initialKpis.conversionRate.toFixed(2)}%
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Alerts Feed */}
      {alerts.length > 0 && (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-4 border border-white/10">
          <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            🔔 Active Alerts
            <span className="bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
              {alerts.length}
            </span>
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  alert.severity === 'critical'
                    ? 'bg-red-900/30 border border-red-800'
                    : alert.severity === 'warning'
                      ? 'bg-yellow-900/30 border border-yellow-800'
                      : 'bg-blue-900/30 border border-blue-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>
                    {alert.severity === 'critical'
                      ? '🚨'
                      : alert.severity === 'warning'
                        ? '⚠️'
                        : 'ℹ️'}
                  </span>
                  <span className="text-sm text-white">{alert.message}</span>
                </div>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="text-gray-400 hover:text-white text-xs ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMetrics;
