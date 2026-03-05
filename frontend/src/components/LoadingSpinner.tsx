import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  fullScreen?: boolean;
}

/**
 * LoadingSpinner — Reusable loading indicator
 * Week 8 Day 2: Loading States
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label = 'Loading...',
  fullScreen = false,
}) => {
  const sizeMap = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  };

  const spinner = (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative">
        <div className={`${sizeMap[size]} rounded-full border-4 border-purple-500/30`} />
        <div
          className={`absolute inset-0 ${sizeMap[size]} rounded-full border-4 border-transparent border-t-purple-500 animate-spin`}
        />
      </div>
      {label && <p className="text-purple-300 text-sm font-medium animate-pulse">{label}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        {spinner}
      </div>
    );
  }

  return <div className="flex items-center justify-center py-12">{spinner}</div>;
};

export default LoadingSpinner;
