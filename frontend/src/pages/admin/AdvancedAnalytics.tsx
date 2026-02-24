/**
 * Advanced Analytics Dashboard Page
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Comprehensive admin dashboard with executive summary, revenue charts,
 * conversion funnels, live metrics, traffic patterns, and CSV exports.
 */

import React, { useState, useEffect, useCallback } from 'react';
import RevenueChart from '../../components/admin/RevenueChart';
import SalesFunnel from '../../components/admin/SalesFunnel';
import LiveMetrics from '../../components/admin/LiveMetrics';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

interface DateRange {
  startDate: string;
  endDate: string;
}

interface ExecutiveSummary {
  kpis: {
    totalRevenue: number;
    revenueGrowth: number;
    totalOrders: number;
    orderGrowth: number;
    avgOrderValue: number;
    totalUsers: number;
    userGrowth: number;
    conversionRate: number;
    activeSales: number;
  };
  topPerformingSales: Array<{
    saleId: string;
    productName: string;
    totalViews: number;
    queueJoins: number;
    reservations: number;
    purchases: number;
    revenue: number;
    conversionRate: number;
    inventorySoldPercent: number;
  }>;
  revenueTimeline: Array<{ date: string; revenue: number }>;
  alerts: Array<{ type: string; message: string; severity: 'info' | 'warning' | 'critical' }>;
}

interface RevenueData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  medianOrderValue: number;
  revenueByDay: Array<{ date: string; revenue: number; orders: number }>;
  revenueByProduct: Array<{
    productId: string;
    productName: string;
    revenue: number;
    units: number;
  }>;
  comparisonPeriod?: {
    totalRevenue: number;
    totalOrders: number;
    revenueChange: number;
    orderChange: number;
  };
}

interface TrafficData {
  hourlyDistribution: Array<{ hour: number; requests: number; uniqueUsers: number }>;
  peakHour: number;
  peakDay: string;
  avgRequestsPerMinute: number;
}

interface UserRetentionData {
  totalUsers: number;
  newUsers: number;
  returningUsers: number;
  retentionRate: number;
  churnRate: number;
  usersBySegment: Array<{ segment: string; count: number; revenue: number }>;
}

const PERIOD_OPTIONS = [
  { label: 'Today', value: 'today' },
  { label: '7 Days', value: 'week' },
  { label: '30 Days', value: 'month' },
  { label: '90 Days', value: 'quarter' },
] as const;

function getDateRange(period: string): DateRange {
  const end = new Date();
  const start = new Date();
  switch (period) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week':
      start.setDate(start.getDate() - 7);
      break;
    case 'month':
      start.setDate(start.getDate() - 30);
      break;
    case 'quarter':
      start.setDate(start.getDate() - 90);
      break;
  }
  return {
    startDate: start.toISOString(),
    endDate: end.toISOString(),
  };
}

async function fetchAnalytics<T>(endpoint: string, range: DateRange): Promise<T | null> {
  try {
    const token = localStorage.getItem('token');
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate,
    });
    const res = await fetch(`${API_BASE}/analytics/${endpoint}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data as T;
  } catch (error) {
    console.error(`Failed to fetch ${endpoint}:`, error);
    return null;
  }
}

const AdvancedAnalytics: React.FC = () => {
  const [period, setPeriod] = useState<string>('week');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [trafficData, setTrafficData] = useState<TrafficData | null>(null);
  const [retentionData, setRetentionData] = useState<UserRetentionData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'traffic' | 'users'>(
    'overview'
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const range = getDateRange(period);

    const [summaryRes, revenueRes, trafficRes, retentionRes] = await Promise.all([
      fetchAnalytics<ExecutiveSummary>('executive-summary', range),
      fetchAnalytics<RevenueData>('revenue', range),
      fetchAnalytics<TrafficData>('traffic', range),
      fetchAnalytics<UserRetentionData>('user-retention', range),
    ]);

    setSummary(summaryRes);
    setRevenueData(revenueRes);
    setTrafficData(trafficRes);
    setRetentionData(retentionRes);
    setLoading(false);
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExport = async (type: string) => {
    try {
      const token = localStorage.getItem('token');
      const range = getDateRange(period);
      const params = new URLSearchParams({
        startDate: range.startDate,
        endDate: range.endDate,
      });
      const res = await fetch(`${API_BASE}/analytics/export/${type}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  // Aggregate funnel data from top sales
  const funnelTotals = summary?.topPerformingSales?.reduce(
    (acc, sale) => ({
      views: acc.views + sale.totalViews,
      queueJoins: acc.queueJoins + sale.queueJoins,
      reservations: acc.reservations + sale.reservations,
      purchases: acc.purchases + sale.purchases,
      revenue: acc.revenue + sale.revenue,
    }),
    { views: 0, queueJoins: 0, reservations: 0, purchases: 0, revenue: 0 }
  ) || { views: 0, queueJoins: 0, reservations: 0, purchases: 0, revenue: 0 };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white">📈 Advanced Analytics</h1>
          <p className="text-gray-400 mt-1">Comprehensive business intelligence dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex bg-white/5 rounded-xl p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.value
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {/* Export Dropdown */}
          <div className="relative group">
            <button className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl text-sm transition-colors">
              📥 Export
            </button>
            <div className="absolute right-0 mt-1 bg-gray-900 rounded-xl shadow-xl border border-white/10 hidden group-hover:block z-20 min-w-[160px]">
              <button
                onClick={() => handleExport('revenue')}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-t-xl"
              >
                Revenue CSV
              </button>
              <button
                onClick={() => handleExport('sales')}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10"
              >
                Sales CSV
              </button>
              <button
                onClick={() => handleExport('users')}
                className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-white/10 rounded-b-xl"
              >
                Users CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1">
        {(['overview', 'revenue', 'traffic', 'users'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {tab === 'overview'
              ? '🏠 Overview'
              : tab === 'revenue'
                ? '💰 Revenue'
                : tab === 'traffic'
                  ? '📊 Traffic'
                  : '👥 Users'}
          </button>
        ))}
      </div>

      {/* KPI Summary Row */}
      {summary && (
        <div className="grid grid-cols-5 gap-3">
          {(
            [
              {
                label: 'Revenue',
                value: `$${(summary.kpis.totalRevenue / 1000).toFixed(1)}K`,
                change: summary.kpis.revenueGrowth,
                icon: '💰',
              },
              {
                label: 'Orders',
                value: summary.kpis.totalOrders.toLocaleString(),
                change: summary.kpis.orderGrowth,
                icon: '📦',
              },
              {
                label: 'AOV',
                value: `$${summary.kpis.avgOrderValue.toFixed(2)}`,
                change: undefined,
                icon: '🎯',
              },
              {
                label: 'Users',
                value: summary.kpis.totalUsers.toLocaleString(),
                change: summary.kpis.userGrowth,
                icon: '👥',
              },
              {
                label: 'Conversion',
                value: `${summary.kpis.conversionRate.toFixed(2)}%`,
                change: undefined,
                icon: '📈',
              },
            ] as Array<{ label: string; value: string; change?: number; icon: string }>
          ).map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg">{kpi.icon}</span>
                {kpi.change !== undefined && (
                  <span
                    className={`text-xs font-medium ${kpi.change >= 0 ? 'text-green-400' : 'text-red-400'}`}
                  >
                    {kpi.change >= 0 ? '+' : ''}
                    {typeof kpi.change === 'number' ? kpi.change.toFixed(1) : kpi.change}%
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-white mt-2">{kpi.value}</p>
              <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {/* Revenue Chart */}
          <RevenueChart
            data={revenueData?.revenueByDay || []}
            productBreakdown={revenueData?.revenueByProduct}
            comparisonData={revenueData?.comparisonPeriod}
            totalRevenue={revenueData?.totalRevenue || 0}
            totalOrders={revenueData?.totalOrders || 0}
            avgOrderValue={revenueData?.avgOrderValue || 0}
            loading={loading}
          />

          {/* Sales Funnel */}
          <SalesFunnel
            views={funnelTotals.views}
            queueJoins={funnelTotals.queueJoins}
            reservations={funnelTotals.reservations}
            purchases={funnelTotals.purchases}
            revenue={funnelTotals.revenue}
            loading={loading}
          />

          {/* Live Metrics - Full Width */}
          <div className="col-span-2">
            <LiveMetrics
              initialKpis={summary?.kpis}
              alerts={summary?.alerts}
              onRefresh={loadData}
            />
          </div>
        </div>
      )}

      {activeTab === 'revenue' && (
        <div className="space-y-6">
          <RevenueChart
            data={revenueData?.revenueByDay || []}
            productBreakdown={revenueData?.revenueByProduct}
            comparisonData={revenueData?.comparisonPeriod}
            totalRevenue={revenueData?.totalRevenue || 0}
            totalOrders={revenueData?.totalOrders || 0}
            avgOrderValue={revenueData?.avgOrderValue || 0}
            loading={loading}
          />

          {/* Top Sales Table */}
          {summary?.topPerformingSales && summary.topPerformingSales.length > 0 && (
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">🏆 Top Performing Sales</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 border-b border-white/10">
                      <th className="text-left py-3 px-2">Product</th>
                      <th className="text-right py-3 px-2">Views</th>
                      <th className="text-right py-3 px-2">Purchases</th>
                      <th className="text-right py-3 px-2">Revenue</th>
                      <th className="text-right py-3 px-2">Conversion</th>
                      <th className="text-right py-3 px-2">Inv. Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.topPerformingSales.map((sale) => (
                      <tr key={sale.saleId} className="border-b border-white/5 hover:bg-white/5">
                        <td className="py-3 px-2 text-white">{sale.productName}</td>
                        <td className="py-3 px-2 text-right text-gray-300">
                          {sale.totalViews.toLocaleString()}
                        </td>
                        <td className="py-3 px-2 text-right text-gray-300">{sale.purchases}</td>
                        <td className="py-3 px-2 text-right text-green-400">
                          ${sale.revenue.toFixed(2)}
                        </td>
                        <td className="py-3 px-2 text-right text-blue-400">
                          {sale.conversionRate.toFixed(1)}%
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span
                            className={`${sale.inventorySoldPercent > 90 ? 'text-red-400' : sale.inventorySoldPercent > 50 ? 'text-yellow-400' : 'text-green-400'}`}
                          >
                            {sale.inventorySoldPercent.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'traffic' && trafficData && (
        <div className="space-y-6">
          {/* Traffic KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white/5 backdrop-blur-md rounded-xl p-5 border border-white/10 text-center">
              <p className="text-3xl font-bold text-blue-400">{trafficData.peakHour}:00</p>
              <p className="text-sm text-gray-400 mt-1">Peak Hour</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl p-5 border border-white/10 text-center">
              <p className="text-3xl font-bold text-purple-400">{trafficData.peakDay}</p>
              <p className="text-sm text-gray-400 mt-1">Peak Day</p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-xl p-5 border border-white/10 text-center">
              <p className="text-3xl font-bold text-yellow-400">
                {trafficData.avgRequestsPerMinute.toFixed(1)}
              </p>
              <p className="text-sm text-gray-400 mt-1">Avg Req/min</p>
            </div>
          </div>

          {/* Hourly Heatmap */}
          <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-4">
              🕐 Hourly Traffic Distribution
            </h3>
            <div className="flex items-end gap-1 h-48">
              {trafficData.hourlyDistribution.map((h) => {
                const maxReqs = Math.max(
                  ...trafficData.hourlyDistribution.map((x) => x.requests),
                  1
                );
                const heightPercent = (h.requests / maxReqs) * 100;
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                      <div className="bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg whitespace-nowrap">
                        <p className="font-bold">{h.hour}:00</p>
                        <p>{h.requests} requests</p>
                        <p>{h.uniqueUsers} users</p>
                      </div>
                    </div>
                    <div
                      className="w-full rounded-t-sm transition-all cursor-pointer min-h-[2px]"
                      style={{
                        height: `${heightPercent}%`,
                        backgroundColor: `hsl(${220 + heightPercent * 1.2}, 70%, ${40 + heightPercent * 0.2}%)`,
                      }}
                    />
                    <span className="text-[10px] text-gray-500 mt-1">{h.hour}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'users' && retentionData && (
        <div className="space-y-6">
          {/* User KPIs */}
          <div className="grid grid-cols-4 gap-4">
            {[
              {
                label: 'Total Users',
                value: retentionData.totalUsers.toLocaleString(),
                icon: '👥',
                color: 'text-blue-400',
              },
              {
                label: 'New Users',
                value: retentionData.newUsers.toLocaleString(),
                icon: '🆕',
                color: 'text-green-400',
              },
              {
                label: 'Retention',
                value: `${retentionData.retentionRate.toFixed(1)}%`,
                icon: '🔄',
                color: 'text-purple-400',
              },
              {
                label: 'Churn',
                value: `${retentionData.churnRate.toFixed(1)}%`,
                icon: '📉',
                color: retentionData.churnRate > 50 ? 'text-red-400' : 'text-yellow-400',
              },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-white/5 backdrop-blur-md rounded-xl p-5 border border-white/10 text-center"
              >
                <span className="text-2xl">{kpi.icon}</span>
                <p className={`text-2xl font-bold ${kpi.color} mt-2`}>{kpi.value}</p>
                <p className="text-xs text-gray-400 mt-1">{kpi.label}</p>
              </div>
            ))}
          </div>

          {/* User Segments */}
          {retentionData.usersBySegment.length > 0 && (
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
              <h3 className="text-lg font-semibold text-white mb-4">👤 User Segments</h3>
              <div className="space-y-3">
                {retentionData.usersBySegment.map((segment) => {
                  const maxCount = Math.max(...retentionData.usersBySegment.map((s) => s.count), 1);
                  const widthPercent = (segment.count / maxCount) * 100;
                  return (
                    <div key={segment.segment} className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-20">{segment.segment}</span>
                      <div className="flex-1 bg-white/5 rounded-full h-8 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full flex items-center px-3"
                          style={{ width: `${Math.max(widthPercent, 8)}%` }}
                        >
                          <span className="text-xs text-white font-medium">
                            {segment.count} users
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-green-400 w-24 text-right">
                        ${segment.revenue.toFixed(0)} revenue
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdvancedAnalytics;
