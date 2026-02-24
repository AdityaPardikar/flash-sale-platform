/**
 * Sales Funnel Component
 * Week 6 Day 4: Advanced Admin Analytics Dashboard
 *
 * Visualizes the conversion funnel from views → queue → reservation → purchase
 * with drop-off rates between each stage.
 */

import React, { useMemo } from 'react';

interface FunnelStage {
  name: string;
  value: number;
  color: string;
}

interface SalesFunnelProps {
  views: number;
  queueJoins: number;
  reservations: number;
  purchases: number;
  revenue?: number;
  loading?: boolean;
}

const SalesFunnel: React.FC<SalesFunnelProps> = ({
  views,
  queueJoins,
  reservations,
  purchases,
  revenue = 0,
  loading = false,
}) => {
  const stages = useMemo<FunnelStage[]>(
    () => [
      { name: 'Page Views', value: views, color: 'from-blue-500 to-blue-600' },
      { name: 'Queue Joins', value: queueJoins, color: 'from-indigo-500 to-indigo-600' },
      { name: 'Reservations', value: reservations, color: 'from-purple-500 to-purple-600' },
      { name: 'Purchases', value: purchases, color: 'from-green-500 to-green-600' },
    ],
    [views, queueJoins, reservations, purchases]
  );

  const maxValue = useMemo(() => Math.max(...stages.map((s) => s.value), 1), [stages]);

  const dropOffRates = useMemo(() => {
    const rates: Array<{ from: string; to: string; rate: number; lost: number }> = [];
    for (let i = 0; i < stages.length - 1; i++) {
      const from = stages[i];
      const to = stages[i + 1];
      const rate = from.value > 0 ? ((from.value - to.value) / from.value) * 100 : 0;
      rates.push({
        from: from.name,
        to: to.name,
        rate,
        lost: from.value - to.value,
      });
    }
    return rates;
  }, [stages]);

  const overallConversion = views > 0 ? (purchases / views) * 100 : 0;

  if (loading) {
    return (
      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-40 mb-4" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-white/10 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            🔻 Conversion Funnel
          </h3>
          <p className="text-sm text-gray-400 mt-1">
            Overall conversion:{' '}
            <span className="text-green-400 font-medium">{overallConversion.toFixed(2)}%</span>
          </p>
        </div>
        {revenue > 0 && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Revenue</p>
            <p className="text-lg font-bold text-green-400">
              ${revenue >= 1000 ? `${(revenue / 1000).toFixed(1)}K` : revenue.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Funnel Visualization */}
      <div className="space-y-2">
        {stages.map((stage, i) => {
          const widthPercent = maxValue > 0 ? (stage.value / maxValue) * 100 : 0;
          const conversionFromTop = views > 0 ? (stage.value / views) * 100 : 0;

          return (
            <React.Fragment key={stage.name}>
              {/* Stage Bar */}
              <div className="relative">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-24 text-right">{stage.name}</span>
                  <div className="flex-1 relative">
                    <div
                      className={`h-10 bg-gradient-to-r ${stage.color} rounded-lg flex items-center px-3 transition-all duration-500`}
                      style={{
                        width: `${Math.max(widthPercent, 8)}%`,
                        marginLeft: `${(100 - Math.max(widthPercent, 8)) / 2}%`,
                      }}
                    >
                      <span className="text-white text-sm font-bold">
                        {stage.value.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {i === 0 ? '100%' : `${conversionFromTop.toFixed(1)}%`}
                  </span>
                </div>
              </div>

              {/* Drop-off indicator */}
              {i < stages.length - 1 && dropOffRates[i] && (
                <div className="flex items-center gap-3 py-1">
                  <span className="w-24" />
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600">↓</span>
                      <span
                        className={`${dropOffRates[i].rate > 50 ? 'text-red-400' : dropOffRates[i].rate > 25 ? 'text-yellow-400' : 'text-green-400'}`}
                      >
                        {dropOffRates[i].rate.toFixed(1)}% drop-off
                      </span>
                      <span className="text-gray-600">
                        ({dropOffRates[i].lost.toLocaleString()} lost)
                      </span>
                    </div>
                  </div>
                  <span className="w-12" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mt-6 pt-4 border-t border-white/10">
        <div className="text-center">
          <p className="text-xs text-gray-400">View → Queue</p>
          <p
            className={`text-sm font-bold ${
              dropOffRates[0]?.rate > 50 ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {views > 0 ? ((queueJoins / views) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Queue → Reserve</p>
          <p
            className={`text-sm font-bold ${
              dropOffRates[1]?.rate > 50 ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {queueJoins > 0 ? ((reservations / queueJoins) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-400">Reserve → Buy</p>
          <p
            className={`text-sm font-bold ${
              dropOffRates[2]?.rate > 50 ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {reservations > 0 ? ((purchases / reservations) * 100).toFixed(1) : '0.0'}%
          </p>
        </div>
      </div>
    </div>
  );
};

export default SalesFunnel;
