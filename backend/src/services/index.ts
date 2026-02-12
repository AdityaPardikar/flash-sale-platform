/**
 * Services Index
 * Central export point for all services
 */

// Core Services
export { FlashSaleService } from './flashSaleService';
export { ProductService } from './productService';
export { QueueService, queueService } from './queueService';
export { AuthService } from './authService';

// Payment & Cart
export { cartService } from './cartService';
export { paymentService } from './paymentService';
export { paymentProcessor } from './paymentProcessor';
export { orderValidator } from './orderValidator';

// VIP & Queue
export { vipService } from './vipService';
export { priorityQueueService } from './priorityQueueService';
export { smartQueueService } from './smartQueueService';
export { queueAnalyticsService } from './queueAnalyticsService';
export { queueEntryManager } from './queueEntryManager';

// Analytics & AI
export { recommendationService } from './recommendationService';
export { dynamicPricingService } from './dynamicPricingService';
export { fraudDetectionService } from './fraudDetectionService';
export { predictiveAnalyticsService } from './predictiveAnalyticsService';
export { privacyService } from './privacyService';

// Real-time & State
export { realtimeService } from './realtimeService';
export { stateMachine } from './stateMachine';
export { saleTimingService } from './saleTimingService';

// Admin & Monitoring
export { auditLogService } from './auditLogService';
export { dataExportService } from './dataExportService';

// Health & Cache
export * from './healthCheckService';
export * from './cacheService';
export * from './alertService';

// Analytics Collector
export {
  AnalyticsCollector,
  initializeAnalyticsCollector,
  getAnalyticsCollector,
} from './analyticsCollector';

// Inventory
export { InventoryManager, inventoryManager } from './inventoryManager';

// Service instances (created on import for use in resolvers)
import { FlashSaleService } from './flashSaleService';
import { ProductService } from './productService';

// Export singleton instances for direct use
export const flashSaleService = new FlashSaleService();
export const productService = new ProductService();

// Analytics service (compatible with GraphQL resolvers)
export const analyticsService = {
  getAnalytics: async () => {
    // Return basic analytics data
    return {
      totalRevenue: 0,
      totalOrders: 0,
      totalCustomers: 0,
      averageOrderValue: 0,
      conversionRate: 0,
      forecasts: {
        nextDayRevenue: 0,
        nextWeekRevenue: 0,
        trend: 'stable',
        confidence: 0.8,
      },
    };
  },
};

// Pricing AI service wrapper
export const pricingAIService = {
  getRecommendation: async (productId: string) => {
    const { dynamicPricingService } = require('./dynamicPricingService');
    return dynamicPricingService.getPriceRecommendation(productId);
  },
};
