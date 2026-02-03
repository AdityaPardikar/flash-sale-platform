/**
 * Time Series Aggregator
 * Aggregates event data into time-series buckets (minute, hour, day)
 */

import { EventType, AnalyticsEvent, EventAggregation } from '../models/analyticsEvent';

export interface TimeSeriesBucket {
  timestamp: Date;
  time_bucket: 'minute' | 'hour' | 'day';
  events: AnalyticsEvent[];
}

export class TimeSeriesAggregator {
  /**
   * Round timestamp down to the nearest bucket
   */
  static roundToBucket(date: Date, bucket: 'minute' | 'hour' | 'day'): Date {
    const d = new Date(date);

    switch (bucket) {
      case 'minute':
        d.setSeconds(0, 0);
        break;
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
    }

    return d;
  }

  /**
   * Get bucket key string for grouping
   */
  static getBucketKey(date: Date, bucket: 'minute' | 'hour' | 'day'): string {
    const rounded = this.roundToBucket(date, bucket);
    return rounded.toISOString();
  }

  /**
   * Aggregate events into time series buckets
   */
  static aggregateEvents(
    events: AnalyticsEvent[],
    bucket: 'minute' | 'hour' | 'day'
  ): Map<string, EventAggregation> {
    const aggregations = new Map<string, EventAggregation>();

    // Group events by bucket
    const grouped = new Map<string, AnalyticsEvent[]>();
    for (const event of events) {
      const key = this.getBucketKey(event.timestamp, bucket);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(event);
    }

    // Aggregate each bucket
    for (const [bucketKey, bucketEvents] of grouped) {
      const aggregation = this.aggregateBucket(bucketEvents, bucketKey, bucket);
      aggregations.set(bucketKey, aggregation);
    }

    return aggregations;
  }

  /**
   * Aggregate a single time bucket
   */
  private static aggregateBucket(
    events: AnalyticsEvent[],
    bucketKey: string,
    bucket: 'minute' | 'hour' | 'day'
  ): EventAggregation {
    const timestamp = new Date(bucketKey);

    // Count unique users
    const uniqueUsers = new Set(events.filter((e) => e.user_id).map((e) => e.user_id!));

    // Sum metrics
    const successCount = events.filter((e) => e.success).length;
    const errorCount = events.filter((e) => !e.success).length;
    const totalAmount = events.reduce((sum, e) => sum + (e.amount || 0), 0);
    const durations = events.filter((e) => e.duration_ms !== undefined).map((e) => e.duration_ms!);

    const avgDuration =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : undefined;

    // Calculate conversion rate (if applicable)
    const conversionRate = events.length > 0 ? (successCount / events.length) * 100 : 0;

    // Group by event type and create aggregation
    const eventTypeCounts = new Map<EventType, number>();
    for (const event of events) {
      const count = eventTypeCounts.get(event.event_type) || 0;
      eventTypeCounts.set(event.event_type, count + 1);
    }

    // For now, return aggregation for all events in bucket
    return {
      timestamp,
      time_bucket: bucket,
      event_type: events[0]?.event_type || ('page_view' as EventType),
      count: events.length,
      unique_users: uniqueUsers.size,
      conversion_rate: conversionRate,
      avg_duration_ms: avgDuration,
      total_amount: totalAmount > 0 ? totalAmount : undefined,
      success_count: successCount,
      error_count: errorCount,
    };
  }

  /**
   * Calculate conversion funnel from events
   */
  static calculateConversionFunnel(events: AnalyticsEvent[], saleId: string) {
    const steps = [
      { step: 1, name: 'Page View', eventType: 'sale_view' as EventType },
      { step: 2, name: 'Queue Join', eventType: 'user_join_queue' as EventType },
      { step: 3, name: 'Checkout Start', eventType: 'user_checkout_start' as EventType },
      { step: 4, name: 'Purchase Complete', eventType: 'user_purchase_complete' as EventType },
    ];

    const saleEvents = events.filter((e) => e.sale_id === saleId);
    const uniqueUsers = new Set(saleEvents.filter((e) => e.user_id).map((e) => e.user_id!));

    const funnelSteps = steps.map(({ step, name, eventType }) => {
      const stepEventUsers = new Set(
        saleEvents.filter((e) => e.event_type === eventType && e.user_id).map((e) => e.user_id!)
      );

      const dropOff = uniqueUsers.size - stepEventUsers.size;
      const conversionRate =
        uniqueUsers.size > 0 ? (stepEventUsers.size / uniqueUsers.size) * 100 : 0;

      return {
        step,
        name,
        user_count: stepEventUsers.size,
        drop_off_count: dropOff,
        conversion_rate: conversionRate,
      };
    });

    const overallConversionRate =
      uniqueUsers.size > 0
        ? (funnelSteps[funnelSteps.length - 1].user_count / uniqueUsers.size) * 100
        : 0;

    return {
      sale_id: saleId,
      steps: funnelSteps,
      overall_conversion_rate: overallConversionRate,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate retention cohort
   */
  static calculateRetentionCohort(
    events: AnalyticsEvent[],
    cohortProperty: 'country' | 'os' | 'browser',
    dayRange: number = 7
  ) {
    const cohorts = new Map<string, Set<string>>();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - dayRange);

    // Group users by cohort property
    for (const event of events) {
      if (event.timestamp < startDate || !event.user_id) continue;

      const cohortValue = event[cohortProperty as keyof AnalyticsEvent] as string;
      if (!cohortValue) continue;

      if (!cohorts.has(cohortValue)) {
        cohorts.set(cohortValue, new Set());
      }
      cohorts.get(cohortValue)!.add(event.user_id);
    }

    // Convert to retention data
    const retentionData = Array.from(cohorts.entries()).map(([cohort, users]) => ({
      cohort,
      size: users.size,
      users: Array.from(users),
    }));

    return retentionData;
  }

  /**
   * Get date range for period
   */
  static getDateRange(period: 'today' | 'week' | 'month'): [Date, Date] {
    const end = new Date();
    const start = new Date();

    switch (period) {
      case 'today':
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case 'week':
        start.setDate(end.getDate() - 7);
        break;
      case 'month':
        start.setMonth(end.getMonth() - 1);
        break;
    }

    return [start, end];
  }

  /**
   * Filter events by date range
   */
  static filterByDateRange(
    events: AnalyticsEvent[],
    startDate: Date,
    endDate: Date
  ): AnalyticsEvent[] {
    return events.filter((e) => e.timestamp >= startDate && e.timestamp <= endDate);
  }

  /**
   * Filter events by type
   */
  static filterByEventType(events: AnalyticsEvent[], eventType: EventType): AnalyticsEvent[] {
    return events.filter((e) => e.event_type === eventType);
  }

  /**
   * Filter events by sale
   */
  static filterBySale(events: AnalyticsEvent[], saleId: string): AnalyticsEvent[] {
    return events.filter((e) => e.sale_id === saleId);
  }
}
