/**
 * Analytics Event Models
 * Defines event types and schemas for tracking user behavior and system metrics
 */

export enum EventType {
  // Page views
  PAGE_VIEW = 'page_view',
  PRODUCT_VIEW = 'product_view',
  SALE_VIEW = 'sale_view',
  QUEUE_PAGE_VIEW = 'queue_page_view',

  // User actions
  USER_JOIN_QUEUE = 'user_join_queue',
  USER_LEAVE_QUEUE = 'user_leave_queue',
  USER_CHECKOUT_START = 'user_checkout_start',
  USER_CHECKOUT_COMPLETE = 'user_checkout_complete',
  USER_PURCHASE_COMPLETE = 'user_purchase_complete',
  USER_PURCHASE_FAILED = 'user_purchase_failed',
  USER_CART_ABANDONED = 'user_cart_abandoned',

  // Queue metrics
  QUEUE_USER_JOINED = 'queue_user_joined',
  QUEUE_USER_ADMITTED = 'queue_user_admitted',
  QUEUE_USER_DROPPED = 'queue_user_dropped',
  QUEUE_TIMEOUT = 'queue_timeout',

  // Sales metrics
  SALE_STARTED = 'sale_started',
  SALE_PAUSED = 'sale_paused',
  SALE_RESUMED = 'sale_resumed',
  SALE_ENDED = 'sale_ended',
  SALE_OUT_OF_STOCK = 'sale_out_of_stock',

  // System events
  SYSTEM_ERROR = 'system_error',
  INVENTORY_SYNC = 'inventory_sync',
  CACHE_UPDATE = 'cache_update',
}

export enum EventSource {
  WEB = 'web',
  MOBILE = 'mobile',
  API = 'api',
  SYSTEM = 'system',
  ADMIN = 'admin',
}

export interface AnalyticsEvent {
  // Core event info
  event_type: EventType;
  timestamp: Date;
  source: EventSource;

  // User context
  user_id?: string;
  session_id?: string;
  device_id?: string;

  // Sale/Product context
  sale_id?: string;
  product_id?: string;

  // Queue context
  queue_id?: string;
  position_in_queue?: number;
  wait_time_ms?: number;

  // Transaction context
  order_id?: string;
  amount?: number;
  currency?: string;

  // Location/Browser context
  country?: string;
  region?: string;
  browser?: string;
  os?: string;
  ip_address?: string;

  // Custom metrics
  duration_ms?: number;
  success: boolean;
  error_message?: string;
  metadata?: Record<string, any>;
}

export interface EventAggregation {
  timestamp: Date;
  time_bucket: 'minute' | 'hour' | 'day';
  event_type: EventType;
  count: number;
  unique_users: number;
  conversion_rate?: number;
  avg_duration_ms?: number;
  total_amount?: number;
  success_count: number;
  error_count: number;
}

export interface SalesAnalytics {
  sale_id: string;
  total_views: number;
  unique_viewers: number;
  queue_joins: number;
  checkout_starts: number;
  purchases: number;
  conversion_rate: number;
  cart_abandonment_rate: number;
  total_revenue: number;
  avg_order_value: number;
  top_products: Array<{
    product_id: string;
    name: string;
    quantity_sold: number;
    revenue: number;
  }>;
  timestamp: Date;
}

export interface QueueAnalytics {
  queue_id: string;
  sale_id: string;
  total_joined: number;
  currently_waiting: number;
  total_admitted: number;
  total_dropped: number;
  avg_wait_time_ms: number;
  median_wait_time_ms: number;
  max_wait_time_ms: number;
  min_wait_time_ms: number;
  drop_rate: number;
  peak_size: number;
  timestamp: Date;
}

export interface UserBehaviorAnalytics {
  time_period: string;
  total_active_users: number;
  new_users: number;
  returning_users: number;
  avg_session_duration_ms: number;
  pages_per_session: number;
  queue_join_rate: number;
  purchase_rate: number;
  device_breakdown: Record<string, number>;
  country_breakdown: Record<string, number>;
  browser_breakdown: Record<string, number>;
  timestamp: Date;
}

export interface ConversionFunnelStep {
  step: number;
  name: string;
  user_count: number;
  drop_off_count: number;
  conversion_rate: number;
}

export interface ConversionFunnel {
  sale_id: string;
  steps: ConversionFunnelStep[];
  overall_conversion_rate: number;
  timestamp: Date;
}

export interface RevenueAnalytics {
  time_period: string;
  total_revenue: number;
  total_orders: number;
  avg_order_value: number;
  median_order_value: number;
  revenue_by_payment_method: Record<string, number>;
  revenue_by_product: Record<string, number>;
  revenue_by_country: Record<string, number>;
  currency: string;
  timestamp: Date;
}

export interface SystemMetrics {
  timestamp: Date;
  cpu_usage_percent: number;
  memory_usage_percent: number;
  active_connections: number;
  database_response_time_ms: number;
  redis_response_time_ms: number;
  error_rate: number;
  requests_per_second: number;
}
