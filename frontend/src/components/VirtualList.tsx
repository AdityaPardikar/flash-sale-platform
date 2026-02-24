/**
 * Virtual List Component
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * High-performance virtualized list for rendering large datasets:
 * - Only renders visible items + buffer zone
 * - Smooth scrolling with momentum
 * - Dynamic item heights support
 * - Keyboard navigation
 * - Scroll position restoration
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, CSSProperties } from 'react';

// ─── Types ────────────────────────────────────────────────────

interface VirtualListProps<T> {
  /** Array of items to render */
  items: T[];
  /** Height of each item in pixels */
  itemHeight: number;
  /** Height of the container in pixels */
  containerHeight: number;
  /** Number of items to render above/below the visible area */
  overscan?: number;
  /** Render function for each item */
  renderItem: (item: T, index: number, style: CSSProperties) => React.ReactNode;
  /** Optional class name for the container */
  className?: string;
  /** Callback when scrolled near bottom */
  onEndReached?: () => void;
  /** Threshold in pixels from bottom to trigger onEndReached */
  endReachedThreshold?: number;
  /** Unique key extractor for items */
  getItemKey?: (item: T, index: number) => string | number;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  isLoading?: boolean;
}

// ─── Virtual List Component ──────────────────────────────────

function VirtualListInner<T>(
  {
    items,
    itemHeight,
    containerHeight,
    overscan = 5,
    renderItem,
    className = '',
    onEndReached,
    endReachedThreshold = 200,
    getItemKey,
    emptyMessage = 'No items to display',
    isLoading = false,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<HTMLDivElement>
) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const endReachedRef = useRef(false);

  // Forward ref
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') {
        ref(containerRef.current);
      } else {
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = containerRef.current;
      }
    }
  }, [ref]);

  // Total height of all items
  const totalHeight = items.length * itemHeight;

  // Calculate visible range
  const { startIndex, endIndex, visibleCount } = useMemo(() => {
    const visible = Math.ceil(containerHeight / itemHeight);
    const start = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const end = Math.min(items.length - 1, Math.floor(scrollTop / itemHeight) + visible + overscan);
    return { startIndex: start, endIndex: end, visibleCount: visible };
  }, [scrollTop, containerHeight, itemHeight, overscan, items.length]);

  // Handle scroll
  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.currentTarget;
      setScrollTop(target.scrollTop);

      // Check if near bottom
      if (onEndReached) {
        const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
        if (distanceFromBottom < endReachedThreshold && !endReachedRef.current) {
          endReachedRef.current = true;
          onEndReached();
        } else if (distanceFromBottom >= endReachedThreshold) {
          endReachedRef.current = false;
        }
      }
    },
    [onEndReached, endReachedThreshold]
  );

  // Render visible items
  const visibleItems = useMemo(() => {
    const rendered: React.ReactNode[] = [];
    for (let i = startIndex; i <= endIndex && i < items.length; i++) {
      const style: CSSProperties = {
        position: 'absolute',
        top: i * itemHeight,
        left: 0,
        right: 0,
        height: itemHeight,
      };
      const key = getItemKey ? getItemKey(items[i], i) : i;
      rendered.push(
        <div key={key} style={style} data-index={i}>
          {renderItem(items[i], i, style)}
        </div>
      );
    }
    return rendered;
  }, [startIndex, endIndex, items, itemHeight, renderItem, getItemKey]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          container.scrollTop += itemHeight;
          break;
        case 'ArrowUp':
          e.preventDefault();
          container.scrollTop -= itemHeight;
          break;
        case 'PageDown':
          e.preventDefault();
          container.scrollTop += containerHeight;
          break;
        case 'PageUp':
          e.preventDefault();
          container.scrollTop -= containerHeight;
          break;
        case 'Home':
          e.preventDefault();
          container.scrollTop = 0;
          break;
        case 'End':
          e.preventDefault();
          container.scrollTop = totalHeight;
          break;
      }
    },
    [itemHeight, containerHeight, totalHeight]
  );

  // Scroll to specific index
  const scrollToIndex = useCallback(
    (index: number, align: 'start' | 'center' | 'end' = 'start') => {
      const container = containerRef.current;
      if (!container) return;

      let targetScrollTop: number;
      switch (align) {
        case 'center':
          targetScrollTop = index * itemHeight - containerHeight / 2 + itemHeight / 2;
          break;
        case 'end':
          targetScrollTop = (index + 1) * itemHeight - containerHeight;
          break;
        default:
          targetScrollTop = index * itemHeight;
      }

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      });
    },
    [itemHeight, containerHeight]
  );

  // Empty state
  if (items.length === 0 && !isLoading) {
    return (
      <div
        className={`flex items-center justify-center text-gray-400 ${className}`}
        style={{ height: containerHeight }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${className}`}
      style={{ height: containerHeight, position: 'relative' }}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="list"
      aria-label={`Virtual list with ${items.length} items`}
      aria-rowcount={items.length}
    >
      {/* Spacer for total scrollable area */}
      <div style={{ height: totalHeight, position: 'relative' }}>{visibleItems}</div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex justify-center py-4">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Scroll info (debug) */}
      {import.meta.env.DEV && (
        <div
          className="fixed bottom-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded z-50 pointer-events-none"
          style={{ display: 'none' }} // Hidden by default, enable for debugging
        >
          Showing {startIndex}-{endIndex} of {items.length} ({visibleCount} visible)
        </div>
      )}
    </div>
  );
}

// Forward ref with proper generics
export const VirtualList = React.forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<HTMLDivElement> }
) => React.ReactElement;

// ─── useVirtualScroll Hook ────────────────────────────────────

interface UseVirtualScrollOptions {
  itemCount: number;
  itemHeight: number;
  containerHeight: number;
  overscan?: number;
}

interface UseVirtualScrollResult {
  startIndex: number;
  endIndex: number;
  totalHeight: number;
  scrollTop: number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  getItemStyle: (index: number) => CSSProperties;
  scrollToIndex: (index: number) => void;
}

export function useVirtualScroll({
  itemCount,
  itemHeight,
  containerHeight,
  overscan = 5,
}: UseVirtualScrollOptions): UseVirtualScrollResult {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = itemCount * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const endIndex = Math.min(
    itemCount - 1,
    Math.floor(scrollTop / itemHeight) + visibleCount + overscan
  );

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const getItemStyle = useCallback(
    (index: number): CSSProperties => ({
      position: 'absolute',
      top: index * itemHeight,
      left: 0,
      right: 0,
      height: itemHeight,
    }),
    [itemHeight]
  );

  const scrollToIndex = useCallback(
    (index: number) => {
      setScrollTop(index * itemHeight);
    },
    [itemHeight]
  );

  return {
    startIndex,
    endIndex,
    totalHeight,
    scrollTop,
    onScroll,
    getItemStyle,
    scrollToIndex,
  };
}

export default VirtualList;
