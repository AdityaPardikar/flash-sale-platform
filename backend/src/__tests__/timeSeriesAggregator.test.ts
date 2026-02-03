/**
 * Tests for Time Series Aggregator Utility
 */

import { TimeSeriesAggregator } from '../timeSeriesAggregator';
import { EventType, EventSource, AnalyticsEvent } from '../../models/analyticsEvent';

describe('TimeSeriesAggregator', () => {
  describe('roundToBucket', () => {
    it('should round to nearest minute', () => {
      const date = new Date('2024-02-01T10:30:45.000Z');
      const rounded = TimeSeriesAggregator.roundToBucket(date, 'minute');

      expect(rounded.getUTCMinutes()).toBe(30);
      expect(rounded.getUTCSeconds()).toBe(0);
    });

    it('should round to nearest hour', () => {
      const date = new Date('2024-02-01T10:30:45.000Z');
      const rounded = TimeSeriesAggregator.roundToBucket(date, 'hour');

      expect(rounded.getUTCHours()).toBe(10);
      expect(rounded.getUTCMinutes()).toBe(0);
    });

    it('should round to start of day', () => {
      const date = new Date('2024-02-01T10:30:45.000Z');
      const rounded = TimeSeriesAggregator.roundToBucket(date, 'day');

      expect(rounded.getUTCHours()).toBe(0);
      expect(rounded.getUTCMinutes()).toBe(0);
      expect(rounded.getUTCDate()).toBe(1);
    });
  });

  describe('getBucketKey', () => {
    it('should generate consistent bucket keys', () => {
      const date = new Date('2024-02-01T10:30:00.000Z');
      const key1 = TimeSeriesAggregator.getBucketKey('page_view', date, 'hour');
      const key2 = TimeSeriesAggregator.getBucketKey(
        'page_view',
        new Date('2024-02-01T10:45:00.000Z'),
        'hour'
      );

      // Same hour bucket should produce same key
      expect(key1).toBe(key2);
    });

    it('should differentiate different hours', () => {
      const date1 = new Date('2024-02-01T10:30:00.000Z');
      const date2 = new Date('2024-02-01T11:30:00.000Z');
      const key1 = TimeSeriesAggregator.getBucketKey('page_view', date1, 'hour');
      const key2 = TimeSeriesAggregator.getBucketKey('page_view', date2, 'hour');

      expect(key1).not.toBe(key2);
    });
  });

  describe('aggregateEvents', () => {
    const createEvent = (
      eventType: EventType,
      userId: string = 'user1',
      timestamp: Date = new Date(),
      saleId?: string
    ): AnalyticsEvent => ({
      event_type: eventType,
      source: EventSource.WEB,
      user_id: userId,
      timestamp,
      sale_id: saleId,
    });

    it('should aggregate events by hour', () => {
      const now = new Date();
      const events: AnalyticsEvent[] = [
        createEvent(EventType.PAGE_VIEW, 'user1', now),
        createEvent(EventType.PAGE_VIEW, 'user2', new Date(now.getTime() + 10000)),
        createEvent(EventType.PAGE_VIEW, 'user1', new Date(now.getTime() + 20000)),
      ];

      const aggregations = TimeSeriesAggregator.aggregateEvents(events, 'hour');

      expect(aggregations).toHaveLength(1);
      expect(aggregations[0].count).toBe(3);
      expect(aggregations[0].unique_users).toBe(2);
    });

    it('should count events by type', () => {
      const now = new Date();
      const events: AnalyticsEvent[] = [
        createEvent(EventType.PAGE_VIEW, 'user1', now),
        createEvent(EventType.USER_JOIN_QUEUE, 'user2', now),
        createEvent(EventType.PAGE_VIEW, 'user3', now),
      ];

      const aggregations = TimeSeriesAggregator.aggregateEvents(events, 'day');

      expect(aggregations[0].count).toBe(3);
      expect(aggregations[0].events_by_type).toHaveProperty(EventType.PAGE_VIEW);
      expect(aggregations[0].events_by_type).toHaveProperty(EventType.USER_JOIN_QUEUE);
    });
  });

  describe('calculateConversionFunnel', () => {
    const createEvent = (
      eventType: EventType,
      userId: string,
      timestamp: Date
    ): AnalyticsEvent => ({
      event_type: eventType,
      source: EventSource.WEB,
      user_id: userId,
      timestamp,
    });

    it('should calculate conversion funnel steps', () => {
      const baseTime = new Date();
      const events: AnalyticsEvent[] = [
        // User 1: Complete flow
        createEvent(EventType.PRODUCT_VIEW, 'user1', new Date(baseTime.getTime())),
        createEvent(EventType.USER_JOIN_QUEUE, 'user1', new Date(baseTime.getTime() + 10000)),
        createEvent(EventType.CHECKOUT_START, 'user1', new Date(baseTime.getTime() + 20000)),
        createEvent(EventType.PURCHASE_COMPLETE, 'user1', new Date(baseTime.getTime() + 30000)),

        // User 2: Drop at checkout
        createEvent(EventType.PRODUCT_VIEW, 'user2', new Date(baseTime.getTime())),
        createEvent(EventType.USER_JOIN_QUEUE, 'user2', new Date(baseTime.getTime() + 10000)),

        // User 3: Drop at queue
        createEvent(EventType.PRODUCT_VIEW, 'user3', new Date(baseTime.getTime())),
      ];

      const funnel = TimeSeriesAggregator.calculateConversionFunnel(events);

      expect(funnel.steps).toHaveLength(4);
      expect(funnel.steps[0].user_count).toBe(3); // All viewed
      expect(funnel.steps[1].user_count).toBe(2); // 2 joined queue
      expect(funnel.steps[2].user_count).toBe(1); // 1 started checkout
      expect(funnel.steps[3].user_count).toBe(1); // 1 completed purchase
    });

    it('should calculate drop-off percentages', () => {
      const baseTime = new Date();
      const events: AnalyticsEvent[] = [
        createEvent(EventType.PRODUCT_VIEW, 'user1', new Date(baseTime.getTime())),
        createEvent(EventType.PRODUCT_VIEW, 'user2', new Date(baseTime.getTime())),
        createEvent(EventType.USER_JOIN_QUEUE, 'user1', new Date(baseTime.getTime() + 10000)),
      ];

      const funnel = TimeSeriesAggregator.calculateConversionFunnel(events);

      // 50% drop from view to queue
      expect(funnel.steps[1].drop_off).toBe(50);
    });

    it('should calculate overall conversion rate', () => {
      const baseTime = new Date();
      const events: AnalyticsEvent[] = [
        createEvent(EventType.PRODUCT_VIEW, 'user1', new Date(baseTime.getTime())),
        createEvent(EventType.PRODUCT_VIEW, 'user2', new Date(baseTime.getTime())),
        createEvent(EventType.PRODUCT_VIEW, 'user3', new Date(baseTime.getTime())),
        createEvent(EventType.PRODUCT_VIEW, 'user4', new Date(baseTime.getTime())),
        createEvent(EventType.PURCHASE_COMPLETE, 'user1', new Date(baseTime.getTime() + 60000)),
      ];

      const funnel = TimeSeriesAggregator.calculateConversionFunnel(events);

      // 1 out of 4 converted = 25%
      expect(funnel.overall_conversion_rate).toBe(25);
    });
  });

  describe('filterByDateRange', () => {
    it('should filter events by date range', () => {
      const start = new Date('2024-02-01');
      const end = new Date('2024-02-05');
      const events: AnalyticsEvent[] = [
        {
          event_type: EventType.PAGE_VIEW,
          source: EventSource.WEB,
          user_id: 'user1',
          timestamp: new Date('2024-02-02'),
        },
        {
          event_type: EventType.PAGE_VIEW,
          source: EventSource.WEB,
          user_id: 'user2',
          timestamp: new Date('2024-02-10'),
        },
      ];

      const filtered = TimeSeriesAggregator.filterByDateRange(events, start, end);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].user_id).toBe('user1');
    });
  });

  describe('getDateRange', () => {
    it('should return today range', () => {
      const range = TimeSeriesAggregator.getDateRange('today');
      const now = new Date();

      expect(range.start.getFullYear()).toBe(now.getFullYear());
      expect(range.start.getMonth()).toBe(now.getMonth());
      expect(range.start.getDate()).toBe(now.getDate());
      expect(range.start.getHours()).toBe(0);
    });

    it('should return week range', () => {
      const range = TimeSeriesAggregator.getDateRange('week');
      const now = new Date();
      const expectedStart = new Date(now);
      expectedStart.setDate(now.getDate() - 7);

      expect(range.start.getDate()).toBe(expectedStart.getDate());
    });

    it('should return month range', () => {
      const range = TimeSeriesAggregator.getDateRange('month');
      const now = new Date();
      const expectedStart = new Date(now);
      expectedStart.setMonth(now.getMonth() - 1);

      expect(range.start.getMonth()).toBeLessThanOrEqual(expectedStart.getMonth() + 1);
    });
  });
});
