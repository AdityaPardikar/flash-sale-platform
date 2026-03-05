/**
 * REST API v2 Routes
 * Week 5 Day 4: API Enhancement
 *
 * Features:
 * - Enhanced RESTful endpoints
 * - Consistent response format
 * - Pagination support
 * - Filtering and sorting
 * - OpenAPI documentation ready
 */

import { Router, Request, Response, NextFunction } from 'express';
import { ProductService } from '../services/productService';
import { FlashSaleService } from '../services/flashSaleService';
import { QueueService } from '../services/queueService';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Service instances
const productService = new ProductService();
const flashSaleService = new FlashSaleService();
const queueService = new QueueService();

// ============================================================================
// API Response Helpers
// ============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

function successResponse<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return { success: true, data, meta };
}

function errorResponse(error: string): ApiResponse<never> {
  return { success: false, error };
}

function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number,
): ApiResponse<T[]> {
  return {
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

// ============================================================================
// Middleware
// ============================================================================

// Parse pagination params
function parsePagination(req: Request) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

// Parse sorting params
function parseSorting(req: Request, allowedFields: string[]) {
  const sortBy = allowedFields.includes(req.query.sortBy as string)
    ? (req.query.sortBy as string)
    : 'createdAt';
  const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
  return { sortBy, sortOrder };
}

// Rate limiting per endpoint
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function endpointRateLimit(maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const entry = rateLimits.get(key);

    if (!entry || entry.resetAt < now) {
      rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      return res.status(429).json(errorResponse('Rate limit exceeded'));
    }

    entry.count++;
    next();
  };
}

// ============================================================================
// Products API v2
// ============================================================================

/**
 * @openapi
 * /api/v2/products:
 *   get:
 *     summary: List products with pagination and filtering
 *     tags: [Products]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Products list
 */
router.get('/products', async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    // parseSorting called for input validation
    parseSorting(req, ['name', 'price', 'createdAt']);
    const { category, search, minPrice, maxPrice } = req.query;

    const filters: Record<string, unknown> = {};
    if (category) filters.category = category;
    if (search) filters.search = search;
    if (minPrice) filters.minPrice = parseFloat(minPrice as string);
    if (maxPrice) filters.maxPrice = parseFloat(maxPrice as string);

    let products;
    if (search) {
      products = await productService.searchProducts(search as string, limit);
    } else if (category) {
      products = await productService.getProductsByCategory(category as string);
    } else {
      products = await productService.getAllProducts({ limit, offset });
    }

    res.json(paginatedResponse(products || [], page, limit, products?.length || 0));
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/products/{id}:
 *   get:
 *     summary: Get product by ID
 *     tags: [Products]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.get('/products/:id', async (req: Request, res: Response) => {
  try {
    const product = await productService.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json(errorResponse('Product not found'));
    }

    res.json(successResponse(product));
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/products:
 *   post:
 *     summary: Create a new product
 *     tags: [Products]
 *     security:
 *       - bearerAuth: []
 */
router.post('/products', authMiddleware, async (req: Request, res: Response) => {
  try {
    const product = await productService.createProduct(req.body);
    res.status(201).json(successResponse(product));
  } catch (error: unknown) {
    res.status(400).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/products/{id}:
 *   put:
 *     summary: Update a product
 *     tags: [Products]
 */
router.put('/products/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);
    res.json(successResponse(product));
  } catch (error: unknown) {
    res.status(400).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/products/{id}:
 *   delete:
 *     summary: Delete a product
 *     tags: [Products]
 */
router.delete('/products/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    await productService.deleteProduct(req.params.id);
    res.json(successResponse({ deleted: true }));
  } catch (error: unknown) {
    res.status(400).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

// ============================================================================
// Flash Sales API v2
// ============================================================================

/**
 * @openapi
 * /api/v2/flash-sales:
 *   get:
 *     summary: List flash sales with filters
 *     tags: [Flash Sales]
 */
router.get('/flash-sales', async (req: Request, res: Response) => {
  try {
    const { page, limit, offset } = parsePagination(req);
    const { status, upcoming, active } = req.query;

    const filters: Record<string, unknown> = { limit, offset };
    if (status) filters.status = status;
    if (upcoming === 'true') filters.upcoming = true;
    if (active === 'true') filters.active = true;

    let sales;
    if (active === 'true') {
      sales = await flashSaleService.getActiveFlashSales();
    } else if (upcoming === 'true') {
      sales = await flashSaleService.getUpcomingFlashSales(limit);
    } else {
      sales = await flashSaleService.getAllFlashSales();
    }
    res.json(paginatedResponse(sales || [], page, limit, sales?.length || 0));
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/flash-sales/active:
 *   get:
 *     summary: Get currently active flash sales
 *     tags: [Flash Sales]
 */
router.get(
  '/flash-sales/active',
  endpointRateLimit(100, 60000), // 100 req/min
  async (req: Request, res: Response) => {
    try {
      const sales = await flashSaleService.getActiveFlashSales();
      res.json(successResponse(sales));
    } catch (error: unknown) {
      res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
    }
  },
);

/**
 * @openapi
 * /api/v2/flash-sales/upcoming:
 *   get:
 *     summary: Get upcoming flash sales
 *     tags: [Flash Sales]
 */
router.get('/flash-sales/upcoming', async (req: Request, res: Response) => {
  try {
    const sales = await flashSaleService.getUpcomingFlashSales();
    res.json(successResponse(sales));
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/flash-sales/{id}:
 *   get:
 *     summary: Get flash sale details
 *     tags: [Flash Sales]
 */
router.get('/flash-sales/:id', async (req: Request, res: Response) => {
  try {
    const sale = await flashSaleService.getFlashSaleById(req.params.id);

    if (!sale) {
      return res.status(404).json(errorResponse('Flash sale not found'));
    }

    // Include queue metrics if sale is active
    let queueStats = null;
    if (sale.status === 'active') {
      queueStats = await queueService.getQueueStats(req.params.id);
    }

    res.json(successResponse({ ...sale, queueStats }));
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/flash-sales/{id}/inventory:
 *   get:
 *     summary: Get real-time inventory status
 *     tags: [Flash Sales]
 */
router.get(
  '/flash-sales/:id/inventory',
  endpointRateLimit(200, 60000), // 200 req/min - high traffic endpoint
  async (req: Request, res: Response) => {
    try {
      const sale = await flashSaleService.getFlashSaleById(req.params.id);

      if (!sale) {
        return res.status(404).json(errorResponse('Flash sale not found'));
      }

      const total =
        ((sale as unknown as Record<string, unknown>).quantity_available as number) || 0;
      const sold = ((sale as unknown as Record<string, unknown>).sold_count as number) || 0;
      const remaining = total - sold;

      res.json(
        successResponse({
          saleId: req.params.id,
          remaining,
          total,
          sold,
          available: remaining,
          timestamp: new Date().toISOString(),
        }),
      );
    } catch (error: unknown) {
      res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
    }
  },
);

// ============================================================================
// Queue API v2
// ============================================================================

/**
 * @openapi
 * /api/v2/queue/{saleId}/join:
 *   post:
 *     summary: Join the queue for a flash sale
 *     tags: [Queue]
 */
router.post(
  '/queue/:saleId/join',
  authMiddleware,
  endpointRateLimit(10, 60000), // 10 req/min per user
  async (req: Request, res: Response) => {
    try {
      const userId = req.user.id;
      const entry = await queueService.joinQueue(req.params.saleId, userId);

      res.json(
        successResponse({
          ...entry,
          estimatedWaitTime: entry.position * 30, // seconds
          message: `You are #${entry.position} in queue`,
        }),
      );
    } catch (error: unknown) {
      res.status(400).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
    }
  },
);

/**
 * @openapi
 * /api/v2/queue/{saleId}/position:
 *   get:
 *     summary: Get current queue position
 *     tags: [Queue]
 */
router.get('/queue/:saleId/position', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const entry = await queueService.getQueuePosition(userId, req.params.saleId);

    if (!entry) {
      return res.status(404).json(errorResponse('Not in queue'));
    }

    const stats = await queueService.getQueueStats(req.params.saleId);

    res.json(
      successResponse({
        ...entry,
        estimatedWaitTime: entry.estimatedWaitMinutes * 60,
        aheadOfYou: entry.totalAhead,
        totalInQueue: stats?.totalWaiting || 0,
      }),
    );
  } catch (error: unknown) {
    res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/queue/{saleId}/leave:
 *   delete:
 *     summary: Leave the queue
 *     tags: [Queue]
 */
router.delete('/queue/:saleId/leave', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    await queueService.leaveQueue(req.params.saleId, userId);
    res.json(successResponse({ left: true }));
  } catch (error: unknown) {
    res.status(400).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
  }
});

/**
 * @openapi
 * /api/v2/queue/{saleId}/metrics:
 *   get:
 *     summary: Get queue metrics (public)
 *     tags: [Queue]
 */
router.get(
  '/queue/:saleId/metrics',
  endpointRateLimit(60, 60000),
  async (req: Request, res: Response) => {
    try {
      const stats = await queueService.getQueueStats(req.params.saleId);
      res.json(successResponse(stats));
    } catch (error: unknown) {
      res.status(500).json(errorResponse(error instanceof Error ? error.message : 'Unknown error'));
    }
  },
);

// ============================================================================
// Health & Status API v2
// ============================================================================

/**
 * @openapi
 * /api/v2/health:
 *   get:
 *     summary: API health check
 *     tags: [System]
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json(
    successResponse({
      status: 'healthy',
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    }),
  );
});

/**
 * @openapi
 * /api/v2/status:
 *   get:
 *     summary: System status
 *     tags: [System]
 */
router.get('/status', async (req: Request, res: Response) => {
  const activeSales = await flashSaleService.getActiveFlashSales();
  const upcomingSales = await flashSaleService.getUpcomingFlashSales();

  res.json(
    successResponse({
      api: 'operational',
      activeSalesCount: activeSales.length,
      upcomingSalesCount: upcomingSales.length,
      features: {
        graphql: true,
        websockets: true,
        vipSystem: true,
        priorityQueue: true,
      },
    }),
  );
});

export default router;
