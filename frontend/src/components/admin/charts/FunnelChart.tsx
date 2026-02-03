/**
 * Funnel Chart Component
 * Displays conversion funnel with drop-off rates
 */

import React from 'react';

export interface FunnelChartDataPoint {
  label: string;
  value: number;
  dropoff?: number; // Percentage dropped at this stage
}

export interface FunnelChartProps {
  title: string;
  data: FunnelChartDataPoint[];
  height?: number;
  showDropoff?: boolean;
  color?: string;
}

export const FunnelChart: React.FC<FunnelChartProps> = ({
  title,
  data,
  height = 350,
  showDropoff = true,
  color = '#667eea',
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
  const padding = { top: 20, bottom: 20, left: 40, right: 40 };
  const chartWidth = 600 - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const segmentHeight = chartHeight / data.length;

  // Calculate dropoff percentages if not provided
  const processedData = data.map((d, i) => {
    const dropoff =
      d.dropoff !== undefined
        ? d.dropoff
        : i > 0
          ? Math.round(((data[i - 1].value - d.value) / data[i - 1].value) * 100)
          : 0;
    return { ...d, dropoff };
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <svg
        width="100%"
        viewBox={`0 0 600 ${height}`}
        className="max-w-full"
        style={{ minHeight: height }}
      >
        {processedData.map((d, i) => {
          const widthPercent = d.value / maxValue;
          const segmentY = padding.top + i * segmentHeight;
          const segmentWidth = chartWidth * widthPercent;
          const leftOffset = (chartWidth - segmentWidth) / 2 + padding.left;

          return (
            <g key={`segment-${i}`}>
              {/* Funnel Segment */}
              <rect
                x={leftOffset}
                y={segmentY}
                width={segmentWidth}
                height={segmentHeight - 8}
                fill={color}
                opacity="0.8"
                className="hover:opacity-100 transition-opacity"
              />

              {/* Label on left */}
              <text
                x={padding.left - 10}
                y={segmentY + segmentHeight / 2}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize="13"
                fontWeight="500"
              >
                {d.label}
              </text>

              {/* Value inside segment */}
              <text
                x={leftOffset + segmentWidth / 2}
                y={segmentY + segmentHeight / 2 - 5}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="14"
                fontWeight="bold"
                fill="white"
              >
                {d.value.toLocaleString()}
              </text>

              {/* Percentage of initial value */}
              {i === 0 ? (
                <text
                  x={leftOffset + segmentWidth / 2}
                  y={segmentY + segmentHeight / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fill="white"
                >
                  100%
                </text>
              ) : (
                <text
                  x={leftOffset + segmentWidth / 2}
                  y={segmentY + segmentHeight / 2 + 12}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fill="white"
                >
                  {((d.value / processedData[0].value) * 100).toFixed(1)}%
                </text>
              )}

              {/* Dropoff info on right */}
              {showDropoff && i > 0 && (
                <text
                  x={leftOffset + segmentWidth + 20}
                  y={segmentY + segmentHeight / 2}
                  dominantBaseline="middle"
                  fontSize="12"
                  fill="#ef4444"
                  fontWeight="500"
                >
                  -{d.dropoff}%
                </text>
              )}
            </g>
          );
        })}

        {/* Conversion Rate Summary */}
        <g>
          <line
            x1={padding.left}
            y1={padding.top + chartHeight + 5}
            x2={600 - padding.right}
            y2={padding.top + chartHeight + 5}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
          <text
            x={300}
            y={padding.top + chartHeight + 25}
            textAnchor="middle"
            fontSize="13"
            fontWeight="600"
            fill="#374151"
          >
            Total Conversion:{' '}
            {(
              (processedData[processedData.length - 1].value / processedData[0].value) *
              100
            ).toFixed(2)}
            %
          </text>
        </g>
      </svg>
    </div>
  );
};

export default FunnelChart;
