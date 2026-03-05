import React from 'react';

interface SkeletonCardProps {
  lines?: number;
  showImage?: boolean;
  className?: string;
}

/**
 * SkeletonCard — Loading placeholder card
 * Week 8 Day 2: Loading States
 */
const SkeletonCard: React.FC<SkeletonCardProps> = ({
  lines = 3,
  showImage = false,
  className = '',
}) => {
  return (
    <div
      className={`bg-white/5 backdrop-blur-sm rounded-xl p-6 border border-white/10 animate-pulse ${className}`}
    >
      {showImage && <div className="w-full h-40 bg-white/10 rounded-lg mb-4" />}
      <div className="space-y-3">
        <div className="h-5 bg-white/10 rounded w-3/4" />
        {Array.from({ length: lines - 1 }).map((_, i) => (
          <div
            key={i}
            className="h-4 bg-white/10 rounded"
            style={{ width: `${60 + Math.random() * 30}%` }}
          />
        ))}
      </div>
      <div className="flex gap-3 mt-4">
        <div className="h-8 bg-white/10 rounded-lg flex-1" />
        <div className="h-8 bg-white/10 rounded-lg w-20" />
      </div>
    </div>
  );
};

/**
 * SkeletonGrid — Multiple skeleton cards in a grid
 */
export const SkeletonGrid: React.FC<{ count?: number; showImage?: boolean }> = ({
  count = 6,
  showImage = true,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} showImage={showImage} />
      ))}
    </div>
  );
};

export default SkeletonCard;
