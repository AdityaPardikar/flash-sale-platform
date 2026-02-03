import React from 'react';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  icon?: string;
  subtitle?: string;
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'red';
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  icon = '📊',
  subtitle,
  color = 'blue',
}) => {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
    orange: 'from-orange-500 to-orange-600',
    red: 'from-red-500 to-red-600',
  };

  const bgColorClasses = {
    blue: 'bg-blue-50',
    green: 'bg-green-50',
    purple: 'bg-purple-50',
    orange: 'bg-orange-50',
    red: 'bg-red-50',
  };

  return (
    <div
      className={`${bgColorClasses[color]} rounded-xl p-6 shadow-md hover:shadow-lg transition-all duration-200`}
    >
      <div className="flex items-center justify-between mb-4">
        <div
          className={`bg-gradient-to-br ${colorClasses[color]} text-white p-3 rounded-lg text-2xl`}
        >
          {icon}
        </div>
        {change !== undefined && (
          <div
            className={`flex items-center space-x-1 ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}
          >
            {change >= 0 ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="text-sm font-semibold">{Math.abs(change)}%</span>
          </div>
        )}
      </div>
      <div>
        <p className="text-gray-600 text-sm font-medium mb-1">{title}</p>
        <p className="text-3xl font-bold text-gray-900">{value}</p>
        {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};

export default MetricCard;
