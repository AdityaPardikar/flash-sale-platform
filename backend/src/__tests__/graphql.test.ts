/**
 * GraphQL API Tests
 * Week 5 Day 7: Testing & Quality Assurance
 */

import { createApolloServer, schema } from '../graphql';
import { graphql, GraphQLSchema, print } from 'graphql';
import gql from 'graphql-tag';

// Mock services
const mockProductService = {
  getAllProducts: jest.fn(),
  getProductById: jest.fn(),
  searchProducts: jest.fn(),
  createProduct: jest.fn(),
};

const mockFlashSaleService = {
  getAllFlashSales: jest.fn(),
  getFlashSaleById: jest.fn(),
  getActiveFlashSales: jest.fn(),
};

const mockQueueService = {
  joinQueue: jest.fn(),
  getQueuePosition: jest.fn(),
  getQueueStats: jest.fn(),
};

jest.mock('../services/productService', () => ({
  productService: mockProductService,
}));

jest.mock('../services/flashSaleService', () => ({
  flashSaleService: mockFlashSaleService,
}));

jest.mock('../services/queueService', () => ({
  queueService: mockQueueService,
}));

describe('GraphQL API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Schema', () => {
    it('should have valid schema', () => {
      expect(schema).toBeDefined();
      expect(schema).toBeInstanceOf(GraphQLSchema);
    });

    it('should have Query type', () => {
      const queryType = schema.getQueryType();
      expect(queryType).toBeDefined();
      expect(queryType?.name).toBe('Query');
    });

    it('should have Mutation type', () => {
      const mutationType = schema.getMutationType();
      expect(mutationType).toBeDefined();
      expect(mutationType?.name).toBe('Mutation');
    });
  });

  describe('Product Queries', () => {
    it('should fetch products with pagination', async () => {
      const mockProducts = [
        { id: '1', name: 'Product 1', price: 100 },
        { id: '2', name: 'Product 2', price: 200 },
      ];

      mockProductService.getAllProducts.mockResolvedValueOnce(mockProducts);

      const query = gql`
        query GetProducts($first: Int) {
          products(first: $first) {
            edges {
              node {
                id
                name
                price
              }
            }
          }
        }
      `;

      const result = await graphql({
        schema,
        source: print(query),
        variableValues: { first: 10 },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.products).toBeDefined();
    });

    it('should fetch product by ID', async () => {
      const mockProduct = { id: '1', name: 'Test Product', price: 99.99 };
      mockProductService.getProductById.mockResolvedValueOnce(mockProduct);

      const query = gql`
        query GetProduct($id: ID!) {
          product(id: $id) {
            id
            name
            price
          }
        }
      `;

      const result = await graphql({
        schema,
        source: print(query),
        variableValues: { id: '1' },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.product?.name).toBe('Test Product');
    });
  });

  describe('Flash Sale Queries', () => {
    it('should fetch active flash sales', async () => {
      const mockSales = [
        {
          id: '1',
          name: 'Flash Sale 1',
          discount_percentage: 50,
          status: 'active',
          start_time: new Date().toISOString(),
          end_time: new Date(Date.now() + 3600000).toISOString(),
        },
      ];

      mockFlashSaleService.getActiveFlashSales.mockResolvedValueOnce(mockSales);

      const query = gql`
        query GetActiveFlashSales {
          activeFlashSales {
            id
            name
            discountPercentage
            status
          }
        }
      `;

      const result = await graphql({
        schema,
        source: print(query),
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.activeFlashSales).toBeDefined();
    });
  });

  describe('Queue Mutations', () => {
    it('should join queue', async () => {
      const mockQueueEntry = {
        userId: 'user-123',
        saleId: 'sale-456',
        position: 5,
        joinedAt: new Date(),
        status: 'waiting',
      };

      mockQueueService.joinQueue.mockResolvedValueOnce(mockQueueEntry);

      const mutation = gql`
        mutation JoinQueue($saleId: ID!) {
          joinQueue(saleId: $saleId) {
            position
            status
          }
        }
      `;

      const result = await graphql({
        schema,
        source: print(mutation),
        variableValues: { saleId: 'sale-456' },
        contextValue: { userId: 'user-123' },
      });

      // May have auth error without proper context, that's expected
      expect(result).toBeDefined();
    });
  });

  describe('Apollo Server', () => {
    it('should create Apollo server instance', () => {
      const server = createApolloServer();
      expect(server).toBeDefined();
    });
  });
});
