/**
 * Sale Metrics Component
 * Displays real-time metrics and performance data for a flash sale
 */

import React, { useState, useEffect } from 'react';
import { API } from '../../services/api';
import { LineChart } from './charts/LineChart';

interface SaleMetricsData {
  sale_id: string;
  name: string;
  views: number;
  unique_viewers: number;
  queue_joins: number;
  purchases: number;
  revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  inventory_remaining: number;
  inventory_sold: number;
  inventory_utilization: number;
  status: string;
}

interface QueueStatsData {
  sale_id: string;
  total_joined: number;
  currently_waiting: number;
  admitted: number;
  dropped: number;
  avg_wait_time: number;
  drop_rate: number;
}

interface SaleMetricsProps {
  saleId: string;
  refreshInterval?: number;
}

export const SaleMetrics: React.FC<SaleMetricsProps> = ({ saleId, refreshInterval = 10000 }) => {
  const [metrics, setMetrics] = useState<SaleMetricsData | null>(null);
  const [queueStats, setQueueStats] = useState<QueueStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, refreshInterval);
    return () => clearInterval(interval);
  }, [saleId, refreshInterval]);

  const fetchMetrics = async () => {
    try {
      setError(null);
      const [metricsRes, queueRes] = await Promise.all([
        API.get(`/admin/sales/${saleId}/metrics`),
        API.get(`/admin/sales/${saleId}/queue-stats`),
      ]);

      setMetrics(metricsRes);
      setQueueStats(queueRes);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      console.error('Error fetching metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Loading metrics...</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">{error}</div>;
  }

  if (!metrics || !queueStats) {
    return <div className="p-4 bg-gray-100 text-gray-700 rounded">No metrics available</div>;
  }

  return (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-gray-600 text-sm font-medium">Total Views</div>
          <div className="text-3xl font-bold text-gray-900 mt-2">
            {metrics.views.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">{metrics.unique_viewers} unique</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-gray-600 text-sm font-medium">Purchases</div>
          <div className="text-3xl font-bold text-green-600 mt-2">
            {metrics.purchases.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            ${metrics.avg_order_value.toFixed(2)} avg
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-gray-600 text-sm font-medium">Conversion Rate</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">
            {(metrics.conversion_rate * 100).toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">{metrics.queue_joins} joined queue</div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="text-gray-600 text-sm font-medium">Total Revenue</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">
            ${metrics.revenue.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">Sale: {metrics.status}</div>
        </div>
      </div>

      {/* Inventory Status */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Inventory Status</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-gray-700 font-medium">Stock Remaining</span>
              <span className="text-gray-700 font-bold">
                {metrics.inventory_remaining} /{' '}
                {metrics.inventory_sold + metrics.inventory_remaining}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (metrics.inventory_remaining / (metrics.inventory_sold + metrics.inventory_remaining)) * 100)}%`,
                }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Sold: {metrics.inventory_sold}</span>
              <span>Utilization: {metrics.inventory_utilization.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Queue Statistics */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-4">Queue Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-gray-600 text-sm">Total Joined</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {queueStats.total_joined.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600 text-sm">Currently Waiting</div>
            <div className="text-2xl font-bold text-yellow-600 mt-1">
              {queueStats.currently_waiting.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600 text-sm">Admitted</div>
            <div className="text-2xl font-bold text-green-600 mt-1">
              {queueStats.admitted.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600 text-sm">Dropped</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {queueStats.dropped.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="border-t pt-4">
            <div className="text-gray-600 text-sm font-medium">Avg Wait Time</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">
              {Math.round(queueStats.avg_wait_time)}s
            </div>
          </div>
          <div className="border-t pt-4">
            <div className="text-gray-600 text-sm font-medium">Drop Rate</div>
            <div className="text-2xl font-bold text-red-600 mt-1">
              {(queueStats.drop_rate * 100).toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      <div className="text-xs text-gray-500 text-right">
        Last updated: {lastUpdated?.toLocaleTimeString() || 'Never'}
      </div>
    </div>
  );
};

export default SaleMetrics;
