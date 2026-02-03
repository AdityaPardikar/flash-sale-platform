/**
 * Bar Chart Component
 * Displays categorical data as vertical bars
 */

import React from 'react';

export interface BarChartDataPoint {
  label: string;
  value: number;
}

export interface BarChartProps {
  title: string;
  data: BarChartDataPoint[];
  color?: string;
  height?: number;
  showValue?: boolean;
  yAxisLabel?: string;
}

export const BarChart: React.FC<BarChartProps> = ({
  title,
  data,
  color = '#667eea',
  height = 300,
  showValue = true,
  yAxisLabel,
}) => {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6" style={{ height }}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="flex items-center justify-center h-full text-gray-500">
          No data available
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 800 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const barWidth = (chartWidth / data.length) * 0.8;
  const barSpacing = chartWidth / data.length;

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <svg
          width="100%"
          viewBox={`0 0 800 ${height}`}
          className="max-w-full"
          style={{ minHeight: height }}
        >
          {/* Grid Lines */}
          {Array.from({ length: 5 }).map((_, i) => {
            const y = padding.top + (i * chartHeight) / 4;
            return (
              <line
                key={`grid-${i}`}
                x1={padding.left}
                y1={y}
                x2={800 - padding.right}
                y2={y}
                stroke="#e5e7eb"
                strokeDasharray="5,5"
              />
            );
          })}

          {/* Y Axis */}
          <line
            x1={padding.left}
            y1={padding.top}
            x2={padding.left}
            y2={padding.top + chartHeight}
            stroke="#000"
            strokeWidth="2"
          />

          {/* X Axis */}
          <line
            x1={padding.left}
            y1={padding.top + chartHeight}
            x2={800 - padding.right}
            y2={padding.top + chartHeight}
            stroke="#000"
            strokeWidth="2"
          />

          {/* Y Axis Labels */}
          {Array.from({ length: 5 }).map((_, i) => {
            const value = Math.round((i * maxValue) / 4);
            const y = padding.top + chartHeight - (i * chartHeight) / 4;
            return (
              <text
                key={`y-label-${i}`}
                x={padding.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
              >
                {value}
              </text>
            );
          })}

          {/* Bars */}
          {data.map((d, i) => {
            const barHeight = (d.value / maxValue) * chartHeight;
            const x = padding.left + i * barSpacing + (barSpacing - barWidth) / 2;
            const y = padding.top + chartHeight - barHeight;

            return (
              <g key={`bar-${i}`}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  opacity="0.8"
                  className="hover:opacity-100 transition-opacity cursor-pointer"
                />

                {/* Value Label */}
                {showValue && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 5}
                    textAnchor="middle"
                    fontSize="12"
                    fontWeight="bold"
                  >
                    {d.value}
                  </text>
                )}

                {/* X Label */}
                <text
                  x={x + barWidth / 2}
                  y={padding.top + chartHeight + 20}
                  textAnchor="middle"
                  fontSize="12"
                >
                  {d.label.substring(0, 12)}
                </text>
              </g>
            );
          })}

          {/* Y Axis Label */}
          {yAxisLabel && (
            <text x={20} y={padding.top - 10} fontSize="14" fontWeight="bold">
              {yAxisLabel}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};

export default BarChart;
