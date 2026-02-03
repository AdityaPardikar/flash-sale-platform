/**
 * Pie Chart Component
 * Displays data distribution as proportional slices
 */

import React from 'react';

export interface PieChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

export interface PieChartProps {
  title: string;
  data: PieChartDataPoint[];
  height?: number;
  showLegend?: boolean;
  showPercentage?: boolean;
}

const DEFAULT_COLORS = [
  '#667eea',
  '#764ba2',
  '#f093fb',
  '#4facfe',
  '#43e97b',
  '#fa709a',
  '#30cfd0',
  '#330867',
];

export const PieChart: React.FC<PieChartProps> = ({
  title,
  data,
  height = 300,
  showLegend = true,
  showPercentage = true,
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

  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6" style={{ height }}>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="flex items-center justify-center h-full text-gray-500">
          No data available
        </div>
      </div>
    );
  }

  const chartHeight = height - 60;
  const chartWidth = 500;
  const centerX = chartWidth / 2;
  const centerY = chartHeight / 2 + 30;
  const radius = Math.min(centerX, centerY) - 40;

  let currentAngle = -Math.PI / 2;
  const slices = data.map((d, i) => {
    const sliceAngle = (d.value / total) * 2 * Math.PI;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;

    const x1 = centerX + radius * Math.cos(startAngle);
    const y1 = centerY + radius * Math.sin(startAngle);
    const x2 = centerX + radius * Math.cos(endAngle);
    const y2 = centerY + radius * Math.sin(endAngle);

    const largeArc = sliceAngle > Math.PI ? 1 : 0;
    const pathData = [
      `M ${centerX} ${centerY}`,
      `L ${x1} ${y1}`,
      `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      'Z',
    ].join(' ');

    const labelAngle = startAngle + sliceAngle / 2;
    const labelRadius = radius * 0.65;
    const labelX = centerX + labelRadius * Math.cos(labelAngle);
    const labelY = centerY + labelRadius * Math.sin(labelAngle);

    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    const percentage = ((d.value / total) * 100).toFixed(1);

    currentAngle = endAngle;

    return { pathData, labelX, labelY, color, percentage, ...d };
  });

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <div className="flex flex-col items-center">
        <svg
          width="100%"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="max-w-full"
          style={{ height: chartHeight }}
        >
          {slices.map((slice, i) => (
            <g key={`slice-${i}`}>
              <path
                d={slice.pathData}
                fill={slice.color}
                opacity="0.8"
                className="hover:opacity-100 transition-opacity cursor-pointer"
              />
              {showPercentage && (
                <text
                  x={slice.labelX}
                  y={slice.labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="12"
                  fontWeight="bold"
                  fill="white"
                  pointerEvents="none"
                >
                  {slice.percentage}%
                </text>
              )}
            </g>
          ))}
        </svg>

        {showLegend && (
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {slices.map((slice, i) => (
              <div key={`legend-${i}`} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: slice.color }} />
                <span className="text-sm text-gray-700">
                  {slice.label} ({slice.value})
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PieChart;
