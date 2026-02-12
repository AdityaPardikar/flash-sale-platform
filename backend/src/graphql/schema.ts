/**
 * GraphQL Schema
 * Week 5 Day 4: API Enhancement & GraphQL
 *
 * Features:
 * - Type definitions for flash sales, products, queues
 * - Query types for data fetching
 * - Mutation types for data modification
 * - Subscription types for real-time updates
 */

import gql from 'graphql-tag';

export const typeDefs = gql`
  # Scalars
  scalar DateTime
  scalar JSON

  # Enums
  enum FlashSaleStatus {
    PENDING
    UPCOMING
    ACTIVE
    PAUSED
    COMPLETED
    SOLD_OUT
    CANCELLED
  }

  enum QueueStatus {
    WAITING
    PROCESSING
    READY
    EXPIRED
    COMPLETED
    ABANDONED
  }

  enum VIPTier {
    STANDARD
    BRONZE
    SILVER
    GOLD
    PLATINUM
  }

  enum PaymentStatus {
    PENDING
    PROCESSING
    SUCCEEDED
    FAILED
    REFUNDED
    CANCELLED
  }

  # Types
  type Product {
    id: ID!
    name: String!
    description: String
    basePrice: Float!
    category: String
    imageUrl: String
    inventory: Int
    isActive: Boolean!
    createdAt: DateTime
    flashSales: [FlashSale!]
  }

  type FlashSale {
    id: ID!
    product: Product!
    name: String!
    description: String
    originalPrice: Float!
    salePrice: Float!
    discountPercentage: Float!
    quantity: Int!
    soldCount: Int!
    remainingQuantity: Int!
    startTime: DateTime!
    endTime: DateTime!
    status: FlashSaleStatus!
    isActive: Boolean!
    queueMetrics: QueueMetrics
    createdAt: DateTime
  }

  type QueueEntry {
    id: ID!
    userId: ID!
    saleId: ID!
    position: Int!
    priority: Float!
    joinedAt: DateTime!
    estimatedWaitTime: Int!
    status: QueueStatus!
    vipTier: VIPTier!
  }

  type QueueMetrics {
    totalInQueue: Int!
    processingCount: Int!
    averageWaitTime: Int!
    throughput: Float!
    healthScore: Int!
    congestionLevel: String!
  }

  type VIPMembership {
    userId: ID!
    tier: VIPTier!
    startDate: DateTime!
    expiryDate: DateTime!
    isActive: Boolean!
    pointsEarned: Int!
    benefits: VIPBenefits!
  }

  type VIPBenefits {
    tier: VIPTier!
    queuePriority: Int!
    earlyAccessMinutes: Int!
    discountPercentage: Int!
    freeShipping: Boolean!
    exclusiveDeals: Boolean!
    dedicatedSupport: Boolean!
  }

  type CartItem {
    productId: ID!
    product: Product
    quantity: Int!
    price: Float!
    addedAt: DateTime
  }

  type Cart {
    id: ID!
    userId: ID
    items: [CartItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    total: Float!
    itemCount: Int!
    expiresAt: DateTime
  }

  type Payment {
    id: ID!
    userId: ID!
    orderId: ID!
    amount: Float!
    currency: String!
    status: PaymentStatus!
    paymentMethod: String
    stripePaymentIntentId: String
    createdAt: DateTime
    updatedAt: DateTime
  }

  type Order {
    id: ID!
    userId: ID!
    items: [OrderItem!]!
    subtotal: Float!
    tax: Float!
    shipping: Float!
    total: Float!
    status: String!
    paymentStatus: PaymentStatus!
    shippingAddress: Address
    createdAt: DateTime
  }

  type OrderItem {
    productId: ID!
    product: Product
    quantity: Int!
    priceAtPurchase: Float!
  }

  type Address {
    street: String!
    city: String!
    state: String!
    zipCode: String!
    country: String!
  }

  type User {
    id: ID!
    email: String!
    name: String
    vipMembership: VIPMembership
    cart: Cart
    orders: [Order!]
    createdAt: DateTime
  }

  type Recommendation {
    productId: ID!
    product: Product
    score: Float!
    reason: String!
  }

  type PriceRecommendation {
    productId: ID!
    currentPrice: Float!
    recommendedPrice: Float!
    minPrice: Float!
    maxPrice: Float!
    confidence: Float!
    reason: String!
  }

  type Analytics {
    totalRevenue: Float!
    totalOrders: Int!
    totalCustomers: Int!
    averageOrderValue: Float!
    conversionRate: Float!
    forecasts: SalesForecast
  }

  type SalesForecast {
    nextDayRevenue: Float!
    nextWeekRevenue: Float!
    trend: String!
    confidence: Float!
  }

  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
    totalCount: Int!
  }

  type ProductConnection {
    edges: [ProductEdge!]!
    pageInfo: PageInfo!
  }

  type ProductEdge {
    node: Product!
    cursor: String!
  }

  type FlashSaleConnection {
    edges: [FlashSaleEdge!]!
    pageInfo: PageInfo!
  }

  type FlashSaleEdge {
    node: FlashSale!
    cursor: String!
  }

  # Inputs
  input ProductInput {
    name: String!
    description: String
    basePrice: Float!
    category: String
    imageUrl: String
    inventory: Int
  }

  input FlashSaleInput {
    productId: ID!
    name: String!
    description: String
    salePrice: Float!
    quantity: Int!
    startTime: DateTime!
    endTime: DateTime!
  }

  input CartItemInput {
    productId: ID!
    quantity: Int!
  }

  input AddressInput {
    street: String!
    city: String!
    state: String!
    zipCode: String!
    country: String!
  }

  input PaymentInput {
    paymentMethodId: String!
    currency: String
    savePaymentMethod: Boolean
  }

  # Queries
  type Query {
    # Products
    product(id: ID!): Product
    products(first: Int, after: String, category: String, search: String): ProductConnection!

    # Flash Sales
    flashSale(id: ID!): FlashSale
    flashSales(
      first: Int
      after: String
      status: FlashSaleStatus
      upcoming: Boolean
      active: Boolean
    ): FlashSaleConnection!
    activeFlashSales: [FlashSale!]!
    upcomingFlashSales: [FlashSale!]!

    # Queue
    queueEntry(saleId: ID!): QueueEntry
    queueMetrics(saleId: ID!): QueueMetrics

    # User
    me: User
    myCart: Cart
    myVIPStatus: VIPMembership

    # Recommendations
    recommendations(limit: Int): [Recommendation!]!
    trendingProducts(limit: Int): [Recommendation!]!
  }

  # Mutations
  type Mutation {
    # Products
    createProduct(input: ProductInput!): Product!
    updateProduct(id: ID!, input: ProductInput!): Product!
    deleteProduct(id: ID!): Boolean!

    # Flash Sales
    createFlashSale(input: FlashSaleInput!): FlashSale!
    updateFlashSale(id: ID!, input: FlashSaleInput!): FlashSale!
    cancelFlashSale(id: ID!): FlashSale

    # Queue
    joinQueue(saleId: ID!): QueueEntry!
    leaveQueue(saleId: ID!): Boolean!

    # Cart
    addToCart(input: CartItemInput!): Cart!
    updateCartItem(productId: ID!, quantity: Int!): Cart!
    removeFromCart(productId: ID!): Cart!
    clearCart: Cart!

    # VIP
    upgradeToVIP(tier: VIPTier!): VIPMembership!

    # User Tracking
    trackProductView(productId: ID!): Boolean!
    trackAddToCart(productId: ID!): Boolean!
  }
`;

export default typeDefs;
