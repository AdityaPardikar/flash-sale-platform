/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GraphQL Resolvers
 * Week 5 Day 4: API Enhancement & GraphQL
 *
 * Simplified resolvers that match actual service APIs
 */

import DataLoader from 'dataloader';
import { ProductService } from '../services/productService';
import { FlashSaleService } from '../services/flashSaleService';
import { QueueService } from '../services/queueService';
import { vipService } from '../services/vipService';
import { cartService } from '../services/cartService';
import { redisClient } from '../utils/redis';

// Service instances
const productService = new ProductService();
const flashSaleService = new FlashSaleService();
const queueService = new QueueService();

// DataLoader factory for batching
export const createDataLoaders = () => ({
  productLoader: new DataLoader<string, unknown>(async (ids) => {
    const products = await Promise.all(ids.map((id) => productService.getProductById(id)));
    return products;
  }),

  flashSaleLoader: new DataLoader<string, unknown>(async (ids) => {
    const sales = await Promise.all(ids.map((id) => flashSaleService.getFlashSaleById(id)));
    return sales;
  }),
});

// Authentication check
function requireAuth(context: Record<string, unknown>) {
  if (!context.user) {
    throw new Error('Authentication required');
  }
  return context.user as { id: string; isAdmin?: boolean };
}

// Admin check
function requireAdmin(context: Record<string, unknown>) {
  const user = requireAuth(context);
  if (!user.isAdmin) {
    throw new Error('Admin privileges required');
  }
  return user;
}

// Resolvers
export const resolvers = {
  // Custom scalars
  DateTime: {
    serialize: (value: Date | string) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    },
    parseValue: (value: string) => new Date(value),
    parseLiteral: (ast: unknown) => {
      if (
        typeof ast === 'object' &&
        ast !== null &&
        'kind' in ast &&
        (ast as { kind: string }).kind === 'StringValue' &&
        'value' in ast
      ) {
        return new Date((ast as { value: string }).value);
      }
      return null;
    },
  },

  // Type resolvers
  Product: {
    flashSales: async (product: any) => {
      const allSales = await flashSaleService.getAllFlashSales();
      return allSales.filter((s: any) => s.product_id === product.id);
    },
  },

  FlashSale: {
    product: async (sale: any, _: any, context: any) => {
      return context.loaders.productLoader.load(sale.product_id);
    },
    remainingQuantity: (sale: any) => {
      return sale.quantity - (sale.sold_count || 0);
    },
    discountPercentage: (sale: any) => {
      if (!sale.original_price || !sale.sale_price) return 0;
      return Math.round((1 - sale.sale_price / sale.original_price) * 100);
    },
    queueStats: async (sale: any) => {
      try {
        return await queueService.getQueueStats(sale.id);
      } catch {
        return null;
      }
    },
  },

  CartItem: {
    product: async (item: any, _: any, context: any) => {
      return context.loaders.productLoader.load(item.productId);
    },
  },

  User: {
    vipMembership: async (user: any) => {
      try {
        return await vipService.getMembership(user.id);
      } catch {
        return null;
      }
    },
    cart: async (user: any) => {
      try {
        return await cartService.getCart(user.id);
      } catch {
        return null;
      }
    },
  },

  // Query resolvers
  Query: {
    // Products
    product: async (_: any, { id }: { id: string }, context: any) => {
      return context.loaders.productLoader.load(id);
    },

    products: async (_: any, args: any) => {
      const { first = 10, category, search } = args;

      let products;
      if (search) {
        products = await productService.searchProducts(search, first);
      } else if (category) {
        products = await productService.getProductsByCategory(category);
      } else {
        products = await productService.getAllProducts({ limit: first });
      }

      return {
        edges: (products || []).map((p: any) => ({
          node: p,
          cursor: Buffer.from(p.id.toString()).toString('base64'),
        })),
        pageInfo: {
          hasNextPage: (products?.length || 0) === first,
          hasPreviousPage: false,
          startCursor: products?.[0]?.id
            ? Buffer.from(products[0].id.toString()).toString('base64')
            : null,
          endCursor: products?.length
            ? Buffer.from(products[products.length - 1].id.toString()).toString('base64')
            : null,
          totalCount: products?.length || 0,
        },
      };
    },

    // Flash Sales
    flashSale: async (_: any, { id }: { id: string }, context: any) => {
      return context.loaders.flashSaleLoader.load(id);
    },

    flashSales: async (_: any, args: any) => {
      const { first = 10, active, upcoming } = args;
      let sales = [];

      if (active) {
        sales = await flashSaleService.getActiveFlashSales();
      } else if (upcoming) {
        sales = await flashSaleService.getUpcomingFlashSales(first);
      } else {
        sales = await flashSaleService.getAllFlashSales();
      }

      const limitedSales = sales.slice(0, first);

      return {
        edges: limitedSales.map((s: any) => ({
          node: s,
          cursor: Buffer.from(s.id.toString()).toString('base64'),
        })),
        pageInfo: {
          hasNextPage: sales.length > first,
          hasPreviousPage: false,
          startCursor: limitedSales[0]?.id
            ? Buffer.from(limitedSales[0].id.toString()).toString('base64')
            : null,
          endCursor: limitedSales.length
            ? Buffer.from(limitedSales[limitedSales.length - 1].id.toString()).toString('base64')
            : null,
          totalCount: limitedSales.length,
        },
      };
    },

    activeFlashSales: async () => {
      return flashSaleService.getActiveFlashSales();
    },

    upcomingFlashSales: async () => {
      return flashSaleService.getUpcomingFlashSales();
    },

    // Queue
    queueEntry: async (_: any, { saleId }: { saleId: string }, context: any) => {
      const user = requireAuth(context);
      try {
        return await queueService.getQueuePosition(user.id, saleId);
      } catch {
        return null;
      }
    },

    queueMetrics: async (_: any, { saleId }: { saleId: string }) => {
      return queueService.getQueueStats(saleId);
    },

    // User
    me: async (_: any, __: any, context: any) => {
      return context.user || null;
    },

    myCart: async (_: any, __: any, context: any) => {
      const user = requireAuth(context);
      return cartService.getCart(user.id);
    },

    myVIPStatus: async (_: any, __: any, context: any) => {
      const user = requireAuth(context);
      return vipService.getMembership(user.id);
    },

    // Recommendations (simplified)
    recommendations: async () => {
      // Return top products as recommendations
      const products = await productService.getAllProducts({ limit: 10 });
      return products.map((p: any) => ({
        productId: p.id,
        product: p,
        score: Math.random(),
        reason: 'Popular item',
      }));
    },

    trendingProducts: async (_: any, { limit = 10 }: { limit?: number }) => {
      const products = await productService.getAllProducts({ limit });
      return products.map((p: any) => ({
        productId: p.id,
        product: p,
        score: Math.random(),
        reason: 'Trending',
      }));
    },
  },

  // Mutation resolvers
  Mutation: {
    // Products
    createProduct: async (_: any, { input }: { input: any }, context: any) => {
      requireAdmin(context);
      return productService.createProduct(input);
    },

    updateProduct: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      requireAdmin(context);
      return productService.updateProduct(id, input);
    },

    deleteProduct: async (_: any, { id }: { id: string }, context: any) => {
      requireAdmin(context);
      await productService.deleteProduct(id);
      return true;
    },

    // Flash Sales
    createFlashSale: async (_: any, { input }: { input: any }, context: any) => {
      requireAdmin(context);
      return flashSaleService.createFlashSale(input);
    },

    updateFlashSale: async (_: any, { id, input }: { id: string; input: any }, context: any) => {
      requireAdmin(context);
      return flashSaleService.updateFlashSale(id, input);
    },

    cancelFlashSale: async (_: any, { id }: { id: string }, context: any) => {
      requireAdmin(context);
      return flashSaleService.cancelFlashSale(id);
    },

    // Queue
    joinQueue: async (_: any, { saleId }: { saleId: string }, context: any) => {
      const user = requireAuth(context);
      return queueService.joinQueue(user.id, saleId);
    },

    leaveQueue: async (_: any, { saleId }: { saleId: string }, context: any) => {
      const user = requireAuth(context);
      await queueService.leaveQueue(user.id, saleId);
      return true;
    },

    // Cart
    addToCart: async (_: any, { input }: { input: any }, context: any) => {
      const user = requireAuth(context);
      return cartService.addItem(user.id, input.productId, input.quantity);
    },

    updateCartItem: async (_: any, { productId, quantity }: any, context: any) => {
      const user = requireAuth(context);
      return cartService.updateItem(user.id, undefined, { productId, quantity });
    },

    removeFromCart: async (_: any, { productId }: { productId: string }, context: any) => {
      const user = requireAuth(context);
      return cartService.removeItem(user.id, undefined, productId);
    },

    clearCart: async (_: any, __: any, context: any) => {
      const user = requireAuth(context);
      await cartService.clearCart(user.id);
      return { items: [], subtotal: 0, tax: 0, shipping: 0, total: 0, itemCount: 0 };
    },

    // VIP
    upgradeToVIP: async (_: any, { tier }: { tier: string }, context: any) => {
      const user = requireAuth(context);
      return vipService.upgradeMembership(user.id, tier as any);
    },

    // Tracking
    trackProductView: async (_: any, { productId }: { productId: string }, context: any) => {
      // Track in Redis for analytics
      if (context.user) {
        const key = `tracking:views:${context.user.id}`;
        await redisClient.lpush(key, productId);
        await redisClient.ltrim(key, 0, 99); // Keep last 100
      }
      return true;
    },

    trackAddToCart: async (_: any, { productId }: { productId: string }, context: any) => {
      if (context.user) {
        const key = `tracking:cart:${context.user.id}`;
        await redisClient.lpush(key, productId);
        await redisClient.ltrim(key, 0, 99);
      }
      return true;
    },
  },
};

export default resolvers;
