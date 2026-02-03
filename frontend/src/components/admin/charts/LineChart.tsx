/**
 * Line Chart Component
 * Displays time-series data as a line chart
 */

import React from 'react';

export interface LineChartDataPoint {
  label: string;
  value: number;
  timestamp?: Date;
}

export interface LineChartProps {
  title: string;
  data: LineChartDataPoint[];
  color?: string;
  height?: number;
  showLegend?: boolean;
  showGrid?: boolean;
  yAxisLabel?: string;
  xAxisLabel?: string;
}

export const LineChart: React.FC<LineChartProps> = ({
  title,
  data,
  color = '#667eea',
  height = 300,
  showLegend = true,
  showGrid = true,
  yAxisLabel,
  xAxisLabel,
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

  // Find min and max values
  const values = data.map((d) => d.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values, 0);
  const range = maxValue - minValue || 1;

  // Calculate points for SVG
  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartWidth = 800 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const pointSpacing = chartWidth / (data.length - 1 || 1);

  // Create path data
  const points = data.map((d, i) => {
    const x = padding.left + i * pointSpacing;
    const y = padding.top + chartHeight - ((d.value - minValue) / range) * chartHeight;
    return { x, y, ...d };
  });

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

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
          {/* Grid */}
          {showGrid && (
            <>
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
            </>
          )}

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
            const value = minValue + (i * range) / 4;
            const y = padding.top + chartHeight - (i * chartHeight) / 4;
            return (
              <text
                key={`label-${i}`}
                x={padding.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="12"
              >
                {Math.round(value)}
              </text>
            );
          })}

          {/* X Axis Labels */}
          {points.map((p, i) => {
            if (i % Math.max(1, Math.floor(data.length / 5)) === 0) {
              return (
                <text
                  key={`x-label-${i}`}
                  x={p.x}
                  y={padding.top + chartHeight + 20}
                  textAnchor="middle"
                  fontSize="12"
                >
                  {p.label.substring(0, 10)}
                </text>
              );
            }
            return null;
          })}

          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Points */}
          {points.map((p, i) => (
            <circle
              key={`point-${i}`}
              cx={p.x}
              cy={p.y}
              r="4"
              fill={color}
              className="cursor-pointer hover:r-6 transition-all"
            />
          ))}

          {/* Axis Labels */}
          {yAxisLabel && (
            <text x={20} y={padding.top - 10} fontSize="14" fontWeight="bold">
              {yAxisLabel}
            </text>
          )}

          {xAxisLabel && (
            <text
              x={padding.left + chartWidth / 2}
              y={height - 5}
              textAnchor="middle"
              fontSize="14"
              fontWeight="bold"
            >
              {xAxisLabel}
            </text>
          )}
        </svg>
      </div>
    </div>
  );
};

export default LineChart;
