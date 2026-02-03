import React, { useState, useEffect } from 'react';
import axios from 'axios';
import MetricCard from '../components/MetricCard';

interface DashboardData {
  todayStats: {
    totalSales: number;
    totalOrders: number;
    totalRevenue: number;
    activeUsers: number;
    queuedUsers: number;
  };
  activeSales: Array<{
    id: number;
    title: string;
    status: string;
    startTime: string;
    queueLength: number;
    ordersCount: number;
  }>;
  recentOrders: Array<{
    id: number;
    userId: number;
    productName: string;
    amount: number;
    status: string;
    createdAt: string;
  }>;
  systemMetrics: {
    redisStatus: string;
    databaseStatus: string;
    queueHealth: string;
  };
}

const Overview: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('adminAccessToken');
      const response = await axios.get('/api/admin/overview', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.data.success) {
        setData(response.data.data);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err: unknown) {
      const error = err as Record<string, any>; // @ts-ignore
      console.error('Error fetching dashboard data:', err);
      setError(error.response?.data?.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();

    // Refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string): 'blue' | 'green' | 'orange' | 'red' => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'completed':
      case 'healthy':
        return 'green';
      case 'scheduled':
      case 'pending':
        return 'blue';
      case 'degraded':
        return 'orange';
      case 'cancelled':
      case 'failed':
      case 'unhealthy':
        return 'red';
      default:
        return 'blue';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-semibold mb-2">Error Loading Dashboard</p>
        <p className="text-red-500 text-sm">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">No dashboard data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Last updated: {lastUpdated.toLocaleTimeString()}</p>
        </div>
        <button
          onClick={fetchDashboardData}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Refresh</span>
        </button>
      </div>

      {/* Today's Stats */}
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Today&apos;s Performance</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Total Sales"
            value={data.todayStats.totalSales}
            icon="⚡"
            color="purple"
          />
          <MetricCard
            title="Total Orders"
            value={data.todayStats.totalOrders}
            icon="📦"
            color="blue"
          />
          <MetricCard
            title="Revenue"
            value={formatCurrency(data.todayStats.totalRevenue)}
            icon="💰"
            color="green"
          />
          <MetricCard
            title="Active Users"
            value={data.todayStats.activeUsers}
            icon="👥"
            color="blue"
          />
          <MetricCard
            title="Queued Users"
            value={data.todayStats.queuedUsers}
            icon="⏳"
            color="orange"
          />
        </div>
      </div>

      {/* System Health */}
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">System Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            title="Redis Status"
            value={data.systemMetrics.redisStatus}
            icon="🔴"
            color={getStatusColor(data.systemMetrics.redisStatus)}
          />
          <MetricCard
            title="Database Status"
            value={data.systemMetrics.databaseStatus}
            icon="💾"
            color={getStatusColor(data.systemMetrics.databaseStatus)}
          />
          <MetricCard
            title="Queue Health"
            value={data.systemMetrics.queueHealth}
            icon="📊"
            color={getStatusColor(data.systemMetrics.queueHealth)}
          />
        </div>
      </div>

      {/* Active Sales & Recent Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sales */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center space-x-2">
            <span>⚡</span>
            <span>Active Flash Sales</span>
          </h2>
          {data.activeSales.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No active sales</p>
          ) : (
            <div className="space-y-3">
              {data.activeSales.map((sale) => (
                <div
                  key={sale.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">{sale.title}</h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        sale.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {sale.status}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                    <div>
                      <span className="font-medium">Queue:</span> {sale.queueLength}
                    </div>
                    <div>
                      <span className="font-medium">Orders:</span> {sale.ordersCount}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Starts: {formatDate(sale.startTime)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4 flex items-center space-x-2">
            <span>📦</span>
            <span>Recent Orders</span>
          </h2>
          {data.recentOrders.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No recent orders</p>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.slice(0, 5).map((order) => (
                <div
                  key={order.id}
                  className="border border-gray-200 rounded-lg p-4 hover:border-purple-300 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">#{order.id}</h3>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        getStatusColor(order.status) === 'green'
                          ? 'bg-green-100 text-green-700'
                          : getStatusColor(order.status) === 'red'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {order.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-1">{order.productName}</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">User #{order.userId}</span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(order.amount)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">{formatDate(order.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Overview;
