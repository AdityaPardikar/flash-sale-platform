/**
 * Tests for Analytics Collector Service
 */

import { AnalyticsCollector, initializeAnalyticsCollector } from '../analyticsCollector';
import { EventType, EventSource, AnalyticsEvent } from '../../models/analyticsEvent';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('AnalyticsCollector', () => {
  let collector: AnalyticsCollector;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = new Redis() as jest.Mocked<Redis>;

    collector = new AnalyticsCollector(mockRedis, {
      bufferSize: 10,
      flushInterval: 5000,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('trackEvent', () => {
    it('should buffer events until buffer is full', () => {
      const event: AnalyticsEvent = {
        event_type: EventType.PAGE_VIEW,
        source: EventSource.WEB,
        user_id: 'user123',
        timestamp: new Date(),
        metadata: { page: 'home' },
      };

      collector.trackEvent(event);
      expect(mockRedis.xadd).not.toHaveBeenCalled();
    });

    it('should auto-flush when buffer reaches size limit', async () => {
      mockRedis.xadd.mockResolvedValue('stream-id');

      const event: AnalyticsEvent = {
        event_type: EventType.USER_JOIN_QUEUE,
        source: EventSource.WEB,
        user_id: 'user123',
        timestamp: new Date(),
        queue_id: 'queue1',
      };

      // Add events up to buffer limit
      for (let i = 0; i < 10; i++) {
        collector.trackEvent({ ...event, user_id: `user${i}` });
      }

      // After 10 events, should flush
      expect(mockRedis.xadd).toHaveBeenCalled();
    });

    it('should track unique users and amounts correctly', () => {
      const event1: AnalyticsEvent = {
        event_type: EventType.PURCHASE_COMPLETE,
        source: EventSource.WEB,
        user_id: 'user1',
        order_id: 'order1',
        amount: 100,
        timestamp: new Date(),
      };

      const event2: AnalyticsEvent = {
        event_type: EventType.PURCHASE_COMPLETE,
        source: EventSource.WEB,
        user_id: 'user2',
        order_id: 'order2',
        amount: 150,
        timestamp: new Date(),
      };

      collector.trackEvent(event1);
      collector.trackEvent(event2);

      const stats = collector.getStats();
      expect(stats.unique_users).toBe(2);
      expect(stats.total_amount).toBe(250);
    });
  });

  describe('trackEvents', () => {
    it('should batch add multiple events', () => {
      mockRedis.xadd.mockResolvedValue('stream-id');

      const events: AnalyticsEvent[] = [
        {
          event_type: EventType.PAGE_VIEW,
          source: EventSource.WEB,
          user_id: 'user1',
          timestamp: new Date(),
        },
        {
          event_type: EventType.PAGE_VIEW,
          source: EventSource.WEB,
          user_id: 'user2',
          timestamp: new Date(),
        },
      ];

      collector.trackEvents(events);
      // Events should be buffered
      expect(mockRedis.xadd).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('should flush buffered events to Redis', async () => {
      mockRedis.xadd.mockResolvedValue('stream-id');

      const event: AnalyticsEvent = {
        event_type: EventType.PAGE_VIEW,
        source: EventSource.WEB,
        user_id: 'user123',
        timestamp: new Date(),
      };

      collector.trackEvent(event);
      await collector.flush();

      expect(mockRedis.xadd).toHaveBeenCalled();
    });

    it('should clear buffer after flush', async () => {
      mockRedis.xadd.mockResolvedValue('stream-id');

      const event: AnalyticsEvent = {
        event_type: EventType.PAGE_VIEW,
        source: EventSource.WEB,
        user_id: 'user123',
        timestamp: new Date(),
      };

      collector.trackEvent(event);
      await collector.flush();

      const stats = collector.getStats();
      expect(stats.total_events).toBe(0);
    });
  });

  describe('getStreamEvents', () => {
    it('should retrieve events from Redis stream', async () => {
      const mockStreamData = [
        ['stream-id-1', ['event_type', EventType.PAGE_VIEW, 'user_id', 'user1']],
      ];

      mockRedis.xrange.mockResolvedValue(mockStreamData);

      const events = await collector.getStreamEvents('analytics:stream:all_events');
      expect(mockRedis.xrange).toHaveBeenCalled();
      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return current buffer statistics', () => {
      const event: AnalyticsEvent = {
        event_type: EventType.PAGE_VIEW,
        source: EventSource.WEB,
        user_id: 'user123',
        timestamp: new Date(),
      };

      collector.trackEvent(event);
      const stats = collector.getStats();

      expect(stats.total_events).toBe(1);
      expect(stats.unique_users).toBe(1);
      expect(stats.events_by_type[EventType.PAGE_VIEW]).toBe(1);
    });
  });

  describe('initialization', () => {
    it('should initialize global collector instance', () => {
      const initialized = initializeAnalyticsCollector(mockRedis);
      expect(initialized).toBeDefined();
    });
  });
});
