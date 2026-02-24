/**
 * Revenue Chart Component
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Interactive revenue visualization with trend lines,
 * comparison periods, and product breakdown.
 */

import React, { useState, useMemo } from 'react';

interface RevenueDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

interface ProductRevenue {
  productId: string;
  productName: string;
  revenue: number;
  units: number;
}

interface RevenueChartProps {
  data: RevenueDataPoint[];
  productBreakdown?: ProductRevenue[];
  comparisonData?: {
    totalRevenue: number;
    totalOrders: number;
    revenueChange: number;
    orderChange: number;
  };
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  loading?: boolean;
}

const RevenueChart: React.FC<RevenueChartProps> = ({
  data,
  productBreakdown = [],
  comparisonData,
  totalRevenue,
  totalOrders,
  avgOrderValue,
  loading = false,
}) => {
  const [view, setView] = useState<'chart' | 'products'>('chart');

  // Calculate chart dimensions
  const maxRevenue = useMemo(() => {
    if (data.length === 0) return 100;
    return Math.max(...data.map((d) => d.revenue)) * 1.1;
  }, [data]);

  const maxOrders = useMemo(() => {
    if (data.length === 0) return 10;
    return Math.max(...data.map((d) => d.orders)) * 1.1;
  }, [data]);

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
  };

  const formatChange = (val: number) => {
    const sign = val >= 0 ? '+' : '';
    return `${sign}${val.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-48 mb-4" />
        <div className="h-64 bg-white/10 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            💰 Revenue Analytics
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            {data.length > 0 ? `${data[0].date} — ${data[data.length - 1].date}` : 'No data'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView('chart')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              view === 'chart'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            Chart
          </button>
          <button
            onClick={() => setView('products')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              view === 'products'
                ? 'bg-blue-600 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
            }`}
          >
            By Product
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Revenue</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(totalRevenue)}</p>
          {comparisonData && (
            <p
              className={`text-xs mt-1 ${comparisonData.revenueChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {formatChange(comparisonData.revenueChange)} vs prev
            </p>
          )}
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Total Orders</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{totalOrders.toLocaleString()}</p>
          {comparisonData && (
            <p
              className={`text-xs mt-1 ${comparisonData.orderChange >= 0 ? 'text-green-400' : 'text-red-400'}`}
            >
              {formatChange(comparisonData.orderChange)} vs prev
            </p>
          )}
        </div>
        <div className="bg-white/5 rounded-xl p-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Order Value</p>
          <p className="text-2xl font-bold text-purple-400 mt-1">{formatCurrency(avgOrderValue)}</p>
        </div>
      </div>

      {/* Chart / Product View */}
      {view === 'chart' ? (
        <div className="relative">
          {/* SVG Bar Chart */}
          <div className="h-64 flex items-end gap-1 px-2">
            {data.map((point, i) => {
              const heightPercent = maxRevenue > 0 ? (point.revenue / maxRevenue) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 text-white text-xs rounded-lg p-2 shadow-lg whitespace-nowrap">
                      <p className="font-bold">{point.date}</p>
                      <p className="text-green-400">{formatCurrency(point.revenue)}</p>
                      <p className="text-blue-400">{point.orders} orders</p>
                    </div>
                  </div>
                  {/* Bar */}
                  <div
                    className="w-full bg-gradient-to-t from-blue-600 to-purple-500 rounded-t-sm hover:from-blue-500 hover:to-purple-400 transition-all cursor-pointer min-h-[2px]"
                    style={{ height: `${heightPercent}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex justify-between mt-2 px-2">
            {data.length > 0 && (
              <>
                <span className="text-xs text-gray-500">{data[0].date}</span>
                {data.length > 2 && (
                  <span className="text-xs text-gray-500">
                    {data[Math.floor(data.length / 2)].date}
                  </span>
                )}
                <span className="text-xs text-gray-500">{data[data.length - 1].date}</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {productBreakdown.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No product data available</p>
          ) : (
            productBreakdown.map((product, i) => {
              const widthPercent = totalRevenue > 0 ? (product.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={product.productId || i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-300 w-32 truncate">{product.productName}</span>
                  <div className="flex-1 bg-white/5 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-600 to-emerald-500 rounded-full flex items-center px-2"
                      style={{ width: `${Math.max(widthPercent, 5)}%` }}
                    >
                      <span className="text-xs text-white font-medium truncate">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">
                    {product.units} sold
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default RevenueChart;
