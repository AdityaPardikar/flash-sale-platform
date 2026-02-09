/**
 * Alerts Page
 * Day 5: Monitoring, Logging & Alerting
 * View and manage system alerts
 */

import React, { useState, useEffect, useCallback } from 'react';
import { AlertConfigList, AlertConfigData } from '../../components/admin/AlertConfig';
import { API } from '../../services/api';

interface Alert {
  id: number;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  status: 'active' | 'acknowledged' | 'resolved' | 'muted';
  title: string;
  message: string;
  source: string;
  metadata?: Record<string, any>;
  acknowledgedBy?: number;
  acknowledgedAt?: string;
  resolvedAt?: string;
  createdAt: string;
}

type TabType = 'active' | 'history' | 'config';

const severityColors: Record<string, { bg: string; text: string; border: string }> = {
  info: { bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  warning: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
  critical: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
};

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-red-100', text: 'text-red-800' },
  acknowledged: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  resolved: { bg: 'bg-green-100', text: 'text-green-800' },
  muted: { bg: 'bg-gray-100', text: 'text-gray-800' },
};

export const Alerts: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [configs, setConfigs] = useState<AlertConfigData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [alertCounts, setAlertCounts] = useState<{
    total: number;
    bySeverity: Record<string, number>;
  }>({ total: 0, bySeverity: {} });

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const status = activeTab === 'active' ? 'active' : undefined;
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      
      const response = await API.get(`/admin/alerts?${params}`);
      setAlerts(response.alerts || []);
    } catch (err) {
      setError('Failed to fetch alerts');
      console.error('Fetch alerts error:', err);
    }
  }, [activeTab]);

  const fetchAlertCounts = useCallback(async () => {
    try {
      const response = await API.get('/admin/alerts/counts');
      setAlertCounts(response);
    } catch (err) {
      console.error('Fetch alert counts error:', err);
    }
  }, []);

  const fetchConfigs = useCallback(async () => {
    try {
      const response = await API.get('/admin/alerts/configs');
      setConfigs(response || []);
    } catch (err) {
      console.error('Fetch configs error:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchAlerts(),
        fetchAlertCounts(),
        activeTab === 'config' ? fetchConfigs() : Promise.resolve(),
      ]);
      setLoading(false);
    };
    loadData();
  }, [activeTab, fetchAlerts, fetchAlertCounts, fetchConfigs]);

  const handleAcknowledge = async (alertId: number) => {
    try {
      await API.post(`/admin/alerts/${alertId}/acknowledge`);
      await fetchAlerts();
      await fetchAlertCounts();
    } catch (err) {
      console.error('Acknowledge error:', err);
    }
  };

  const handleResolve = async (alertId: number) => {
    try {
      await API.post(`/admin/alerts/${alertId}/resolve`);
      await fetchAlerts();
      await fetchAlertCounts();
    } catch (err) {
      console.error('Resolve error:', err);
    }
  };

  const handleConfigUpdate = async (type: string, updates: Partial<AlertConfigData>) => {
    try {
      await API.patch(`/admin/alerts/configs/${type}`, updates);
      await fetchConfigs();
    } catch (err) {
      console.error('Config update error:', err);
      throw err;
    }
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const formatType = (type: string): string => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
        <p className="text-gray-600">Monitor and manage system alerts</p>
      </div>

      {/* Alert Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-gray-900">{alertCounts.total}</div>
          <div className="text-sm text-gray-600">Active Alerts</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-red-800">
            {alertCounts.bySeverity?.critical || 0}
          </div>
          <div className="text-sm text-red-600">Critical</div>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-yellow-800">
            {alertCounts.bySeverity?.warning || 0}
          </div>
          <div className="text-sm text-yellow-600">Warning</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-blue-800">
            {alertCounts.bySeverity?.info || 0}
          </div>
          <div className="text-sm text-blue-600">Info</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {[
            { key: 'active', label: 'Active Alerts' },
            { key: 'history', label: 'History' },
            { key: 'config', label: 'Configuration' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {loading ? (
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
      ) : activeTab === 'config' ? (
        <AlertConfigList configs={configs} onUpdate={handleConfigUpdate} />
      ) : (
        <div className="space-y-4">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <div className="text-4xl mb-2">✓</div>
              <div className="text-lg font-medium text-gray-900">
                {activeTab === 'active' ? 'No active alerts' : 'No alerts found'}
              </div>
              <div className="text-gray-600">
                {activeTab === 'active'
                  ? 'All systems are running normally'
                  : 'Try adjusting your filters'}
              </div>
            </div>
          ) : (
            alerts.map((alert) => {
              const severityStyle = severityColors[alert.severity] || severityColors.info;
              const statusStyle = statusColors[alert.status] || statusColors.active;

              return (
                <div
                  key={alert.id}
                  className={`${severityStyle.bg} ${severityStyle.border} border rounded-lg p-4`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`font-semibold ${severityStyle.text}`}>
                          {alert.title}
                        </h3>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${statusStyle.bg} ${statusStyle.text}`}
                        >
                          {alert.status}
                        </span>
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded ${severityStyle.bg} ${severityStyle.text}`}
                        >
                          {alert.severity}
                        </span>
                      </div>
                      
                      <p className="text-gray-700 mb-2">{alert.message}</p>
                      
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>Type: {formatType(alert.type)}</span>
                        <span>Source: {alert.source}</span>
                        <span>Created: {formatDate(alert.createdAt)}</span>
                      </div>
                      
                      {alert.metadata && Object.keys(alert.metadata).length > 0 && (
                        <div className="mt-2 text-sm text-gray-600">
                          <details>
                            <summary className="cursor-pointer hover:text-gray-800">
                              Details
                            </summary>
                            <pre className="mt-2 p-2 bg-white/50 rounded text-xs overflow-auto">
                              {JSON.stringify(alert.metadata, null, 2)}
                            </pre>
                          </details>
                        </div>
                      )}
                    </div>

                    {alert.status === 'active' && (
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-3 py-1 text-sm bg-yellow-500 text-white rounded hover:bg-yellow-600"
                        >
                          Acknowledge
                        </button>
                        <button
                          onClick={() => handleResolve(alert.id)}
                          className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default Alerts;
