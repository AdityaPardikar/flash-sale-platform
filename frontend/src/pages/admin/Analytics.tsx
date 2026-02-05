/**
 * Analytics Dashboard Page
 * Real-time analytics visualization for admin panel
 */

import React, { useState, useEffect } from 'react';
import { LineChart, LineChartDataPoint } from '../../components/admin/charts/LineChart';
import { BarChart, BarChartDataPoint } from '../../components/admin/charts/BarChart';
import { PieChart, PieChartDataPoint } from '../../components/admin/charts/PieChart';
import { FunnelChart, FunnelChartDataPoint } from '../../components/admin/charts/FunnelChart';
import { API } from '../../services/api';

interface AnalyticsPeriod {
  label: string;
  value: 'today' | 'week' | 'month';
}

interface DateRange {
  startDate: string;
  endDate: string;
}

interface SalesAnalyticsData {
  views: number;
  unique_viewers: number;
  queue_joins: number;
  checkout_starts: number;
  purchases: number;
  revenue: number;
  conversion_rate: number;
  aggregations?: any[];
}

interface UserAnalyticsData {
  active_users: number;
  page_views: number;
  avg_pages_per_user: number;
  queue_join_rate: number;
  purchase_rate: number;
  device_breakdown?: any;
  country_breakdown?: any;
}

interface QueueAnalyticsData {
  joined: number;
  dropped: number;
  admitted: number;
  avg_wait_time: number;
  median_wait_time: number;
  drop_rate: number;
  admission_rate: number;
}

interface FunnelData {
  steps: Array<{
    name: string;
    user_count: number;
    drop_off: number;
  }>;
}

interface RevenueData {
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  median_order_value: number;
  by_product?: Array<{ product: string; revenue: number }>;
  by_currency?: Array<{ currency: string; revenue: number }>;
}

const PERIODS: AnalyticsPeriod[] = [
  { label: 'Today', value: 'today' },
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
];

export const AnalyticsPage: React.FC = () => {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [dateRange, setDateRange] = useState<DateRange>({
    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Analytics data states
  const [salesData, setSalesData] = useState<SalesAnalyticsData | null>(null);
  const [userData, setUserData] = useState<UserAnalyticsData | null>(null);
  const [queueData, setQueueData] = useState<QueueAnalyticsData | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelData | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);

  // Update date range when period changes
  useEffect(() => {
    const now = new Date();
    const startDate = new Date();

    switch (period) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    setDateRange({
      startDate: startDate.toISOString().split('T')[0],
      endDate: now.toISOString().split('T')[0],
    });
  }, [period]);

  // Fetch all analytics data
  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        ...(selectedSaleId && { saleId: selectedSaleId }),
      });

      const [sales, users, queue, funnel, revenue] = await Promise.all([
        API.get(`/admin/analytics/sales?${params}`),
        API.get(`/admin/analytics/users?${params}`),
        API.get(`/admin/analytics/queue?${params}`),
        API.get(`/admin/analytics/funnel?${params}${selectedSaleId ? '' : '&saleId=all'}`),
        API.get(`/admin/analytics/revenue?${params}`),
      ]);

      setSalesData(sales as SalesAnalyticsData);
      setUserData(users as UserAnalyticsData);
      setQueueData(queue as QueueAnalyticsData);
      setFunnelData(funnel as FunnelData);
      setRevenueData(revenue as RevenueData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch analytics');
      console.error('Analytics fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch analytics when date range or sale filter changes
  useEffect(() => {
    fetchAnalytics();
  }, [dateRange, selectedSaleId]);

  // Transform data for charts
  const conversionFunnelData: FunnelChartDataPoint[] =
    funnelData?.steps?.map((step) => ({
      label: step.name,
      value: step.user_count,
      dropoff: step.drop_off,
    })) || [];

  const revenueByProductData: BarChartDataPoint[] =
    revenueData?.by_product?.map((item) => ({
      label: item.product,
      value: item.revenue,
    })) || [];

  const currencyDistributionData: PieChartDataPoint[] =
    revenueData?.by_currency?.map((item) => ({
      label: item.currency,
      value: item.revenue,
    })) || [];

  const deviceDistributionData: PieChartDataPoint[] = userData?.device_breakdown
    ? Object.entries(userData.device_breakdown).map(([device, count]: [string, any]) => ({
        label: device,
        value: count,
      }))
    : [];

  if (loading && !salesData) {
    return (
      <div className="p-6 bg-gray-100 min-h-screen">
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Analytics Dashboard</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Controls */}
        <div className="bg-white rounded-lg shadow-md p-4 flex flex-wrap gap-4">
          {/* Period Selection */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Period:</label>
            <div className="flex gap-2">
              {PERIODS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                    period === p.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">From:</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
            />
            <label className="text-sm font-medium text-gray-700">To:</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchAnalytics}
            className="ml-auto px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      {salesData && userData && queueData && revenueData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="text-gray-600 text-sm font-medium">Total Views</div>
            <div className="text-3xl font-bold text-gray-900">
              {salesData.views?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="text-gray-600 text-sm font-medium">Total Purchases</div>
            <div className="text-3xl font-bold text-gray-900">
              {salesData.purchases?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="text-gray-600 text-sm font-medium">Conversion Rate</div>
            <div className="text-3xl font-bold text-green-600">
              {(salesData.conversion_rate * 100).toFixed(2)}%
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="text-gray-600 text-sm font-medium">Total Revenue</div>
            <div className="text-3xl font-bold text-gray-900">
              ${revenueData.total_revenue?.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <div className="text-gray-600 text-sm font-medium">Active Users</div>
            <div className="text-3xl font-bold text-gray-900">
              {userData.active_users?.toLocaleString() || 0}
            </div>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Conversion Funnel */}
        {conversionFunnelData.length > 0 && (
          <div className="lg:col-span-2">
            <FunnelChart
              title="Conversion Funnel"
              data={conversionFunnelData}
              height={300}
              color="#667eea"
            />
          </div>
        )}

        {/* Revenue by Product */}
        {revenueByProductData.length > 0 && (
          <BarChart
            title="Revenue by Product"
            data={revenueByProductData}
            color="#43e97b"
            showValue={true}
          />
        )}

        {/* Currency Distribution */}
        {currencyDistributionData.length > 0 && (
          <PieChart
            title="Currency Distribution"
            data={currencyDistributionData}
            showPercentage={true}
          />
        )}

        {/* Device Distribution */}
        {deviceDistributionData.length > 0 && (
          <PieChart title="Device Breakdown" data={deviceDistributionData} showPercentage={true} />
        )}

        {/* Queue Statistics */}
        {queueData && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">Queue Analytics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Users Joined</span>
                <span className="text-xl font-bold">{queueData.joined?.toLocaleString() || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Dropped</span>
                <span className="text-xl font-bold text-red-600">
                  {queueData.dropped?.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Admitted</span>
                <span className="text-xl font-bold text-green-600">
                  {queueData.admitted?.toLocaleString() || 0}
                </span>
              </div>
              <hr className="my-3" />
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Avg Wait Time</span>
                <span className="text-lg font-semibold">
                  {Math.round(queueData.avg_wait_time || 0)}s
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Drop Rate</span>
                <span className="text-lg font-semibold">
                  {((queueData.drop_rate || 0) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}

        {/* User Statistics */}
        {userData && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold mb-4">User Analytics</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Page Views</span>
                <span className="text-xl font-bold">
                  {userData.page_views?.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Avg Pages/User</span>
                <span className="text-lg font-semibold">
                  {(userData.avg_pages_per_user || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Queue Join Rate</span>
                <span className="text-lg font-semibold">
                  {((userData.queue_join_rate || 0) * 100).toFixed(2)}%
                </span>
              </div>
              <hr className="my-3" />
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Purchase Rate</span>
                <span className="text-lg font-semibold text-green-600">
                  {((userData.purchase_rate || 0) * 100).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
