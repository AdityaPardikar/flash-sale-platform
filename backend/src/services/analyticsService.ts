import pool from '../utils/database';
import { v4 as uuidv4 } from 'uuid';

// Event types for analytics tracking
export type AnalyticsEventType =
  | 'sale_view'
  | 'sale_click'
  | 'product_view'
  | 'queue_join'
  | 'queue_leave'
  | 'reservation_made'
  | 'reservation_expired'
  | 'purchase_attempt'
  | 'purchase_complete'
  | 'purchase_failed'
  | 'order_initiated'
  | 'order_completed'
  | 'order_cancelled';

interface AnalyticsEvent {
  id: string;
  event_type: AnalyticsEventType;
  user_id?: string;
  sale_id?: string;
  product_id?: string;
  metadata?: Record<string, unknown>;
  created_at: Date;
}

interface EventMetadata {
  [key: string]: unknown;
}

interface SaleAnalytics {
  saleId: string;
  totalViews: number;
  totalClicks: number;
  totalQueueJoins: number;
  totalReservations: number;
  totalPurchases: number;
  conversionRate: number; // purchases / views
  averageTimeToReservation?: number; // in seconds
}

interface UserAnalytics {
  userId: string;
  totalViews: number;
  totalPurchases: number;
  totalSpent?: number;
  favoriteCategories?: string[];
}

class AnalyticsService {
  /**
   * Track an analytics event
   */
  async trackEvent(
    eventType: AnalyticsEventType,
    userId?: string,
    saleId?: string,
    productId?: string,
    metadata?: EventMetadata
  ): Promise<AnalyticsEvent> {
    try {
      const id = uuidv4();

      const query = `
        INSERT INTO analytics_events (id, event_type, user_id, sale_id, product_id, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const values = [
        id,
        eventType,
        userId || null,
        saleId || null,
        productId || null,
        metadata ? JSON.stringify(metadata) : null,
      ];

      const result = await pool.query<AnalyticsEvent>(query, values);

      console.log(`Tracked event: ${eventType} (user: ${userId}, sale: ${saleId})`);

      return result.rows[0];
    } catch (error) {
      console.error('Error tracking analytics event:', error);
      throw error;
    }
  }

  /**
   * Track a sale view event
   */
  async trackSaleView(saleId: string, userId?: string): Promise<AnalyticsEvent> {
    return this.trackEvent('sale_view', userId, saleId);
  }

  /**
   * Track a product view event
   */
  async trackProductView(productId: string, userId?: string): Promise<AnalyticsEvent> {
    return this.trackEvent('product_view', userId, undefined, productId);
  }

  /**
   * Track a queue join event
   */
  async trackQueueJoin(saleId: string, userId: string, position?: number): Promise<AnalyticsEvent> {
    return this.trackEvent('queue_join', userId, saleId, undefined, {
      position,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track a reservation event
   */
  async trackReservation(
    saleId: string,
    userId: string,
    productId: string,
    quantity: number
  ): Promise<AnalyticsEvent> {
    return this.trackEvent('reservation_made', userId, saleId, productId, {
      quantity,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Track a purchase completion event
   */
  async trackPurchase(
    saleId: string,
    userId: string,
    productId: string,
    amount: number,
    quantity: number
  ): Promise<AnalyticsEvent> {
    return this.trackEvent('purchase_complete', userId, saleId, productId, {
      amount,
      quantity,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get analytics for a specific sale
   */
  async getSaleAnalytics(saleId: string): Promise<SaleAnalytics> {
    try {
      const query = `
        SELECT 
          event_type,
          COUNT(*) as count
        FROM analytics_events
        WHERE sale_id = $1
        GROUP BY event_type
      `;

      const result = await pool.query(query, [saleId]);

      const analytics: SaleAnalytics = {
        saleId,
        totalViews: 0,
        totalClicks: 0,
        totalQueueJoins: 0,
        totalReservations: 0,
        totalPurchases: 0,
        conversionRate: 0,
      };

      result.rows.forEach((row) => {
        const count = parseInt(row.count, 10);
        switch (row.event_type) {
          case 'sale_view':
            analytics.totalViews = count;
            break;
          case 'sale_click':
            analytics.totalClicks = count;
            break;
          case 'queue_join':
            analytics.totalQueueJoins = count;
            break;
          case 'reservation_made':
            analytics.totalReservations = count;
            break;
          case 'purchase_complete':
            analytics.totalPurchases = count;
            break;
        }
      });

      // Calculate conversion rate
      if (analytics.totalViews > 0) {
        analytics.conversionRate = analytics.totalPurchases / analytics.totalViews;
      }

      return analytics;
    } catch (error) {
      console.error('Error fetching sale analytics:', error);
      throw error;
    }
  }

  /**
   * Get analytics for a specific user
   */
  async getUserAnalytics(userId: string): Promise<UserAnalytics> {
    try {
      const query = `
        SELECT 
          event_type,
          COUNT(*) as count
        FROM analytics_events
        WHERE user_id = $1
        GROUP BY event_type
      `;

      const result = await pool.query(query, [userId]);

      const analytics: UserAnalytics = {
        userId,
        totalViews: 0,
        totalPurchases: 0,
      };

      result.rows.forEach((row) => {
        const count = parseInt(row.count, 10);
        switch (row.event_type) {
          case 'sale_view':
          case 'product_view':
            analytics.totalViews += count;
            break;
          case 'purchase_complete':
            analytics.totalPurchases = count;
            break;
        }
      });

      // Get total spent (would need to join with orders table in real implementation)
      const spentQuery = `
        SELECT 
          SUM((metadata->>'amount')::numeric) as total_spent
        FROM analytics_events
        WHERE user_id = $1 AND event_type = 'purchase_complete'
      `;

      const spentResult = await pool.query(spentQuery, [userId]);
      if (spentResult.rows[0] && spentResult.rows[0].total_spent) {
        analytics.totalSpent = parseFloat(spentResult.rows[0].total_spent);
      }

      return analytics;
    } catch (error) {
      console.error('Error fetching user analytics:', error);
      throw error;
    }
  }

  /**
   * Get top performing sales
   */
  async getTopSales(limit: number = 10): Promise<
    Array<{
      saleId: string;
      eventCount: number;
      purchaseCount: number;
      viewCount: number;
    }>
  > {
    try {
      const query = `
        SELECT 
          sale_id,
          COUNT(*) as event_count,
          SUM(CASE WHEN event_type = 'purchase_complete' THEN 1 ELSE 0 END) as purchase_count,
          SUM(CASE WHEN event_type = 'sale_view' THEN 1 ELSE 0 END) as view_count
        FROM analytics_events
        WHERE sale_id IS NOT NULL
        GROUP BY sale_id
        ORDER BY purchase_count DESC, view_count DESC
        LIMIT $1
      `;

      const result = await pool.query(query, [limit]);

      return result.rows.map((row) => ({
        saleId: row.sale_id,
        eventCount: parseInt(row.event_count, 10),
        purchaseCount: parseInt(row.purchase_count, 10),
        viewCount: parseInt(row.view_count, 10),
      }));
    } catch (error) {
      console.error('Error fetching top sales:', error);
      throw error;
    }
  }

  /**
   * Get events within a time range
   */
  async getEventsByTimeRange(
    startDate: Date,
    endDate: Date,
    eventType?: AnalyticsEventType
  ): Promise<AnalyticsEvent[]> {
    try {
      let query = `
        SELECT * FROM analytics_events
        WHERE created_at BETWEEN $1 AND $2
      `;

      const values: (Date | string)[] = [startDate, endDate];

      if (eventType) {
        query += ' AND event_type = $3';
        values.push(eventType);
      }

      query += ' ORDER BY created_at DESC';

      const result = await pool.query<AnalyticsEvent>(query, values);
      return result.rows;
    } catch (error) {
      console.error('Error fetching events by time range:', error);
      throw error;
    }
  }

  /**
   * Get funnel conversion metrics for a sale
   */
  async getSaleFunnel(saleId: string): Promise<{
    views: number;
    queueJoins: number;
    reservations: number;
    purchases: number;
    viewToQueueRate: number;
    queueToReservationRate: number;
    reservationToPurchaseRate: number;
  }> {
    try {
      const analytics = await this.getSaleAnalytics(saleId);

      const funnel = {
        views: analytics.totalViews,
        queueJoins: analytics.totalQueueJoins,
        reservations: analytics.totalReservations,
        purchases: analytics.totalPurchases,
        viewToQueueRate:
          analytics.totalViews > 0 ? analytics.totalQueueJoins / analytics.totalViews : 0,
        queueToReservationRate:
          analytics.totalQueueJoins > 0
            ? analytics.totalReservations / analytics.totalQueueJoins
            : 0,
        reservationToPurchaseRate:
          analytics.totalReservations > 0
            ? analytics.totalPurchases / analytics.totalReservations
            : 0,
      };

      return funnel;
    } catch (error) {
      console.error('Error calculating sale funnel:', error);
      throw error;
    }
  }

  /**
   * Clean up old analytics events (for data retention)
   */
  async cleanupOldEvents(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const query = `
        DELETE FROM analytics_events
        WHERE created_at < $1
      `;

      const result = await pool.query(query, [cutoffDate]);

      console.log(`Cleaned up ${result.rowCount} old analytics events`);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up old events:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService();
export { AnalyticsService, AnalyticsEvent, SaleAnalytics, UserAnalytics };
