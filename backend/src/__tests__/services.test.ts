import productService, { CreateProductDto, UpdateProductDto } from '../services/productService';
import flashSaleService, { CreateFlashSaleDto } from '../services/flashSaleService';
import inventoryManager from '../services/inventoryManager';
import { pool } from '../utils/database';

// Mock database module
jest.mock('../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));

// Mock Redis client
jest.mock('../utils/redis', () => ({
  default: {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
    incrby: jest.fn(),
    eval: jest.fn(),
    exists: jest.fn(),
    ttl: jest.fn(),
    keys: jest.fn(),
  },
}));

describe('ProductService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createProduct', () => {
    it('should create a new product successfully', async () => {
      const mockProduct = {
        id: '123',
        name: 'Test Product',
        description: 'Test Description',
        base_price: 99.99,
        category: 'electronics',
        image_url: 'https://via.placeholder.com/400',
        created_at: new Date(),
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockProduct] });

      const productData: CreateProductDto = {
        name: 'Test Product',
        description: 'Test Description',
        base_price: 99.99,
        category: 'electronics',
      };

      const result = await productService.createProduct(productData);

      expect(result).toEqual(mockProduct);
      expect(pool.query).toHaveBeenCalled();
    });

    it('should throw error for invalid product data', async () => {
      const invalidData: CreateProductDto = {
        name: '',
        description: 'Test',
        base_price: 99.99,
        category: 'electronics',
      };

      await expect(productService.createProduct(invalidData)).rejects.toThrow(
        'Product name is required'
      );
    });

    it('should throw error for negative price', async () => {
      const invalidData: CreateProductDto = {
        name: 'Test',
        description: 'Test',
        base_price: -10,
        category: 'electronics',
      };

      await expect(productService.createProduct(invalidData)).rejects.toThrow(
        'Price cannot be negative'
      );
    });
  });

  describe('getProductById', () => {
    it('should return a product when found', async () => {
      const mockProduct = {
        id: '123',
        name: 'Test Product',
        base_price: 99.99,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockProduct] });

      const result = await productService.getProductById('123');

      expect(result).toEqual(mockProduct);
      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM products WHERE id = $1', ['123']);
    });

    it('should return null when product not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await productService.getProductById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteProduct', () => {
    it('should delete product successfully', async () => {
      const mockProduct = { id: '123', name: 'Test' };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProduct] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({});

      const result = await productService.deleteProduct('123');

      expect(result).toBe(true);
    });

    it('should return false when product not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await productService.deleteProduct('nonexistent');

      expect(result).toBe(false);
    });

    it('should throw error when product has active sales', async () => {
      const mockProduct = { id: '123' };
      const mockActiveSales = [{ id: 'sale123' }];

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProduct] })
        .mockResolvedValueOnce({ rows: mockActiveSales });

      await expect(productService.deleteProduct('123')).rejects.toThrow(
        'Cannot delete product with active or upcoming flash sales'
      );
    });
  });
});

describe('FlashSaleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createFlashSale', () => {
    it('should create a flash sale successfully', async () => {
      const mockProduct = {
        id: 'prod123',
        base_price: 100,
      };

      const mockSale = {
        id: 'sale123',
        product_id: 'prod123',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() + 3600000),
        end_time: new Date(Date.now() + 7200000),
        status: 'upcoming',
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProduct] })
        .mockResolvedValueOnce({ rows: [mockSale] });

      const saleData: CreateFlashSaleDto = {
        product_id: 'prod123',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() + 3600000),
        end_time: new Date(Date.now() + 7200000),
      };

      const result = await flashSaleService.createFlashSale(saleData);

      expect(result).toEqual(mockSale);
    });

    it('should throw error for flash price >= base price', async () => {
      const mockProduct = {
        id: 'prod123',
        base_price: 100,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockProduct] });

      const saleData: CreateFlashSaleDto = {
        product_id: 'prod123',
        flash_price: 150,
        quantity_available: 100,
        start_time: new Date(Date.now() + 3600000),
        end_time: new Date(Date.now() + 7200000),
      };

      await expect(flashSaleService.createFlashSale(saleData)).rejects.toThrow(
        'Flash price must be less than base price'
      );
    });

    it('should throw error for invalid timing', async () => {
      const mockProduct = {
        id: 'prod123',
        base_price: 100,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [mockProduct] });

      const saleData: CreateFlashSaleDto = {
        product_id: 'prod123',
        flash_price: 50,
        quantity_available: 100,
        start_time: new Date(Date.now() + 7200000),
        end_time: new Date(Date.now() + 3600000),
      };

      await expect(flashSaleService.createFlashSale(saleData)).rejects.toThrow(
        'End time must be after start time'
      );
    });
  });

  describe('calculateDiscountPercentage', () => {
    it('should calculate discount correctly', () => {
      const result = flashSaleService.calculateDiscountPercentage(100, 75);
      expect(result).toBe(25);
    });

    it('should handle zero base price', () => {
      const result = flashSaleService.calculateDiscountPercentage(0, 50);
      expect(result).toBe(0);
    });
  });
});

describe('Price Calculation Utils', () => {
  const {
    calculateDiscountedPrice,
    calculateDiscountPercentage,
    formatPrice,
  } = require('../utils/priceCalculations');

  describe('calculateDiscountedPrice', () => {
    it('should calculate discounted price correctly', () => {
      const result = calculateDiscountedPrice(100, 20);
      expect(result).toBe(80);
    });

    it('should throw error for invalid discount percentage', () => {
      expect(() => calculateDiscountedPrice(100, 150)).toThrow();
      expect(() => calculateDiscountedPrice(100, -10)).toThrow();
    });
  });

  describe('calculateDiscountPercentage', () => {
    it('should calculate discount percentage correctly', () => {
      const result = calculateDiscountPercentage(100, 75);
      expect(result).toBe(25);
    });

    it('should throw error when sale price > original price', () => {
      expect(() => calculateDiscountPercentage(100, 150)).toThrow();
    });
  });

  describe('formatPrice', () => {
    it('should format price with USD currency', () => {
      const result = formatPrice(99.99, 'USD');
      expect(result).toContain('99.99');
    });
  });
});
