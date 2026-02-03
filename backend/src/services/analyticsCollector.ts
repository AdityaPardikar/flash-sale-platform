/**
 * Analytics Collector Service
 * Collects, stores, and streams analytics events using Redis Streams
 */

import { Redis } from 'ioredis';
import { AnalyticsEvent, EventType, EventSource } from '../models/analyticsEvent';

export interface EventTrackerConfig {
  redisClient: Redis;
  maxBufferSize?: number;
  flushIntervalMs?: number;
}

export class AnalyticsCollector {
  private redisClient: Redis;
  private eventBuffer: AnalyticsEvent[] = [];
  private maxBufferSize: number;
  private flushIntervalMs: number;
  private flushInterval: NodeJS.Timeout | null = null;

  readonly STREAMS_KEY = {
    ALL_EVENTS: 'analytics:stream:all_events',
    EVENTS_BY_TYPE: (type: EventType) => `analytics:stream:events:${type}`,
    SALE_EVENTS: (saleId: string) => `analytics:stream:sale:${saleId}`,
    USER_EVENTS: (userId: string) => `analytics:stream:user:${userId}`,
    QUEUE_EVENTS: (queueId: string) => `analytics:stream:queue:${queueId}`,
  };

  readonly ANALYTICS_KEYS = {
    DAILY_STATS: (date: string) => `analytics:daily:${date}`,
    HOURLY_STATS: (date: string, hour: number) => `analytics:hourly:${date}:${hour}`,
    SALE_STATS: (saleId: string) => `analytics:sale:${saleId}`,
    QUEUE_STATS: (queueId: string) => `analytics:queue:${queueId}`,
    USER_STATS: (userId: string) => `analytics:user:${userId}`,
  };

  constructor(config: EventTrackerConfig) {
    this.redisClient = config.redisClient;
    this.maxBufferSize = config.maxBufferSize || 100;
    this.flushIntervalMs = config.flushIntervalMs || 5000; // 5 seconds

    // Start auto-flush interval
    this.startAutoFlush();
  }

  /**
   * Track a single event
   */
  async trackEvent(event: AnalyticsEvent): Promise<void> {
    // Add to buffer
    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Track multiple events at once
   */
  async trackEvents(events: AnalyticsEvent[]): Promise<void> {
    this.eventBuffer.push(...events);

    if (this.eventBuffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Flush buffered events to Redis Streams
   */
  async flush(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const eventsToFlush = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      for (const event of eventsToFlush) {
        await this.writeEventToStreams(event);
        await this.updateAnalyticsStats(event);
      }
    } catch (error) {
      console.error('Error flushing analytics events:', error);
      // Re-add failed events to buffer
      this.eventBuffer.unshift(...eventsToFlush);
    }
  }

  /**
   * Write event to all relevant Redis Streams
   */
  private async writeEventToStreams(event: AnalyticsEvent): Promise<void> {
    const eventData = this.serializeEvent(event);
    const timestamp = Date.now();

    // Write to main stream
    await this.redisClient.xadd(this.STREAMS_KEY.ALL_EVENTS, '*', ...this.objectToArray(eventData));

    // Write to type-specific stream
    await this.redisClient.xadd(
      this.STREAMS_KEY.EVENTS_BY_TYPE(event.event_type),
      '*',
      ...this.objectToArray(eventData)
    );

    // Write to sale stream if applicable
    if (event.sale_id) {
      await this.redisClient.xadd(
        this.STREAMS_KEY.SALE_EVENTS(event.sale_id),
        '*',
        ...this.objectToArray(eventData)
      );
    }

    // Write to user stream if applicable
    if (event.user_id) {
      await this.redisClient.xadd(
        this.STREAMS_KEY.USER_EVENTS(event.user_id),
        '*',
        ...this.objectToArray(eventData)
      );
    }

    // Write to queue stream if applicable
    if (event.queue_id) {
      await this.redisClient.xadd(
        this.STREAMS_KEY.QUEUE_EVENTS(event.queue_id),
        '*',
        ...this.objectToArray(eventData)
      );
    }

    // Trim streams to keep only recent events (keep last 10k)
    const maxLen = 10000;
    await this.redisClient.xtrim(this.STREAMS_KEY.ALL_EVENTS, 'MAXLEN', '~', maxLen.toString());
  }

  /**
   * Update analytics stats based on event
   */
  private async updateAnalyticsStats(event: AnalyticsEvent): Promise<void> {
    const date = new Date(event.timestamp);
    const dateKey = date.toISOString().split('T')[0];
    const hour = date.getHours();

    // Update daily stats
    const dailyKey = this.ANALYTICS_KEYS.DAILY_STATS(dateKey);
    await this.incrementStats(dailyKey, event);

    // Update hourly stats
    const hourlyKey = this.ANALYTICS_KEYS.HOURLY_STATS(dateKey, hour);
    await this.incrementStats(hourlyKey, event);

    // Update sale stats
    if (event.sale_id) {
      const saleKey = this.ANALYTICS_KEYS.SALE_STATS(event.sale_id);
      await this.incrementStats(saleKey, event);
    }

    // Update queue stats
    if (event.queue_id) {
      const queueKey = this.ANALYTICS_KEYS.QUEUE_STATS(event.queue_id);
      await this.incrementStats(queueKey, event);
    }

    // Update user stats
    if (event.user_id) {
      const userKey = this.ANALYTICS_KEYS.USER_STATS(event.user_id);
      await this.incrementStats(userKey, event);
    }
  }

  /**
   * Increment stats counters
   */
  private async incrementStats(key: string, event: AnalyticsEvent): Promise<void> {
    const pipe = this.redisClient.pipeline();

    // Increment total count
    pipe.hincrby(key, 'total_events', 1);

    // Increment by event type
    pipe.hincrby(key, `events:${event.event_type}`, 1);

    // Track successes
    if (event.success) {
      pipe.hincrby(key, 'success_count', 1);
    } else {
      pipe.hincrby(key, 'error_count', 1);
    }

    // Track unique users
    if (event.user_id) {
      pipe.sadd(`${key}:users`, event.user_id);
    }

    // Track amounts
    if (event.amount) {
      pipe.hincrbyfloat(key, 'total_amount', event.amount);
    }

    // Set expiration (30 days for hourly, 90 days for daily)
    const isHourly = key.includes('hourly');
    const expireSeconds = isHourly ? 30 * 24 * 60 * 60 : 90 * 24 * 60 * 60;
    pipe.expire(key, expireSeconds);

    await pipe.exec();
  }

  /**
   * Get events from a stream
   */
  async getStreamEvents(streamKey: string, limit: number = 100): Promise<AnalyticsEvent[]> {
    const messages = await this.redisClient.xrevrange(streamKey, '+', '-', 'COUNT', limit);

    return messages.map(([, data]) => this.deserializeEvent(data));
  }

  /**
   * Get events by date range and type
   */
  async getEvents(
    startDate: Date,
    endDate: Date,
    eventType?: EventType,
    limit: number = 1000
  ): Promise<AnalyticsEvent[]> {
    const streamKey = eventType
      ? this.STREAMS_KEY.EVENTS_BY_TYPE(eventType)
      : this.STREAMS_KEY.ALL_EVENTS;

    const allMessages = await this.redisClient.xrange(streamKey, '-', '+', 'COUNT', limit);

    const events = allMessages
      .map(([, data]) => this.deserializeEvent(data))
      .filter((e) => e.timestamp >= startDate && e.timestamp <= endDate);

    return events;
  }

  /**
   * Get aggregated stats
   */
  async getStats(key: string): Promise<Record<string, any>> {
    const stats = await this.redisClient.hgetall(key);

    // Convert to proper types
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(stats)) {
      if (k === 'total_amount') {
        result[k] = parseFloat(v);
      } else if (k.startsWith('events:') || k.endsWith('_count')) {
        result[k] = parseInt(v, 10);
      } else {
        result[k] = v;
      }
    }

    // Get unique user count
    const usersKey = `${key}:users`;
    const userCount = await this.redisClient.scard(usersKey);
    result['unique_users'] = userCount;

    return result;
  }

  /**
   * Get daily stats
   */
  async getDailyStats(date: string): Promise<Record<string, any>> {
    return this.getStats(this.ANALYTICS_KEYS.DAILY_STATS(date));
  }

  /**
   * Get hourly stats
   */
  async getHourlyStats(date: string, hour: number): Promise<Record<string, any>> {
    return this.getStats(this.ANALYTICS_KEYS.HOURLY_STATS(date, hour));
  }

  /**
   * Start auto-flush interval
   */
  private startAutoFlush(): void {
    this.flushInterval = setInterval(async () => {
      if (this.eventBuffer.length > 0) {
        await this.flush();
      }
    }, this.flushIntervalMs);
  }

  /**
   * Stop auto-flush interval and flush remaining events
   */
  async shutdown(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    await this.flush();
  }

  /**
   * Serialize event to Redis format
   */
  private serializeEvent(event: AnalyticsEvent): Record<string, string> {
    const data: Record<string, string> = {
      event_type: event.event_type,
      timestamp: event.timestamp.toISOString(),
      source: event.source,
      success: event.success ? 'true' : 'false',
    };

    if (event.user_id) data.user_id = event.user_id;
    if (event.session_id) data.session_id = event.session_id;
    if (event.device_id) data.device_id = event.device_id;
    if (event.sale_id) data.sale_id = event.sale_id;
    if (event.product_id) data.product_id = event.product_id;
    if (event.queue_id) data.queue_id = event.queue_id;
    if (event.order_id) data.order_id = event.order_id;
    if (event.amount) data.amount = event.amount.toString();
    if (event.currency) data.currency = event.currency;
    if (event.duration_ms) data.duration_ms = event.duration_ms.toString();
    if (event.wait_time_ms) data.wait_time_ms = event.wait_time_ms.toString();
    if (event.position_in_queue) data.position_in_queue = event.position_in_queue.toString();
    if (event.country) data.country = event.country;
    if (event.region) data.region = event.region;
    if (event.browser) data.browser = event.browser;
    if (event.os) data.os = event.os;
    if (event.ip_address) data.ip_address = event.ip_address;
    if (event.error_message) data.error_message = event.error_message;
    if (event.metadata) data.metadata = JSON.stringify(event.metadata);

    return data;
  }

  /**
   * Deserialize event from Redis format
   */
  private deserializeEvent(data: string[]): AnalyticsEvent {
    const obj: Record<string, string> = {};
    for (let i = 0; i < data.length; i += 2) {
      obj[data[i]] = data[i + 1];
    }

    return {
      event_type: obj.event_type as EventType,
      timestamp: new Date(obj.timestamp),
      source: obj.source as EventSource,
      success: obj.success === 'true',
      user_id: obj.user_id,
      session_id: obj.session_id,
      device_id: obj.device_id,
      sale_id: obj.sale_id,
      product_id: obj.product_id,
      queue_id: obj.queue_id,
      order_id: obj.order_id,
      amount: obj.amount ? parseFloat(obj.amount) : undefined,
      currency: obj.currency,
      duration_ms: obj.duration_ms ? parseInt(obj.duration_ms, 10) : undefined,
      wait_time_ms: obj.wait_time_ms ? parseInt(obj.wait_time_ms, 10) : undefined,
      position_in_queue: obj.position_in_queue ? parseInt(obj.position_in_queue, 10) : undefined,
      country: obj.country,
      region: obj.region,
      browser: obj.browser,
      os: obj.os,
      ip_address: obj.ip_address,
      error_message: obj.error_message,
      metadata: obj.metadata ? JSON.parse(obj.metadata) : undefined,
    };
  }

  /**
   * Convert object to Redis array format [key, value, key, value, ...]
   */
  private objectToArray(obj: Record<string, string>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(obj)) {
      result.push(key, value);
    }
    return result;
  }
}

// Global instance
let globalCollector: AnalyticsCollector | null = null;

export function initializeAnalyticsCollector(config: EventTrackerConfig): AnalyticsCollector {
  globalCollector = new AnalyticsCollector(config);
  return globalCollector;
}

export function getAnalyticsCollector(): AnalyticsCollector {
  if (!globalCollector) {
    throw new Error('Analytics collector not initialized');
  }
  return globalCollector;
}
