/**
 * Lazy Routes Configuration
 * Week 8 Day 1: Complete Route Architecture
 *
 * Route-based code splitting with React.lazy for:
 * - Reduced initial bundle size
 * - On-demand loading of page components
 * - Loading fallback with skeleton UI
 * - Preloading on hover/focus for instant navigation
 */

import { lazy, ComponentType } from 'react';

// ─── Public Page Imports ─────────────────────────────────────

export const LazyOverview = lazy(() =>
  import('../pages/Overview').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyCheckout = lazy(() =>
  import('../pages/Checkout').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyShoppingCart = lazy(() =>
  import('../pages/ShoppingCart').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyBotDemo = lazy(() =>
  import('../pages/BotSimulationDemo').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyNotFound = lazy(() =>
  import('../pages/NotFound').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

// ─── Admin Page Imports ──────────────────────────────────────

export const LazyAdminDashboard = lazy(() =>
  import('../pages/AdminDashboard').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyAdminLogin = lazy(() =>
  import('../pages/AdminLogin').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyAdminAnalytics = lazy(() =>
  import('../pages/admin/AdvancedAnalytics').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyAnalytics = lazy(() =>
  import('../pages/admin/Analytics').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyFlashSales = lazy(() =>
  import('../pages/admin/FlashSales').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazySaleDetails = lazy(() =>
  import('../pages/admin/SaleDetails').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyQueueManagement = lazy(() =>
  import('../pages/admin/QueueManagement').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyUsers = lazy(() =>
  import('../pages/admin/Users').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyOrders = lazy(() =>
  import('../pages/admin/Orders').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyAuditLogs = lazy(() =>
  import('../pages/admin/AuditLogs').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyAlerts = lazy(() =>
  import('../pages/admin/Alerts').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazySystemHealth = lazy(() =>
  import('../pages/admin/SystemHealth').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyDeployments = lazy(() =>
  import('../pages/admin/Deployments').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyPerformanceDashboard = lazy(() =>
  import('../pages/admin/PerformanceDashboard').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

export const LazyFeatureFlags = lazy(() =>
  import('../pages/admin/FeatureFlags').catch(() => ({
    default: (() => null) as unknown as ComponentType<object>,
  })),
);

// ─── Preloading Utility ──────────────────────────────────────

const preloadedRoutes = new Set<string>();

/**
 * Preload a route's component on demand (e.g., on hover)
 */
export function preloadRoute(routeName: string): void {
  if (preloadedRoutes.has(routeName)) return;
  preloadedRoutes.add(routeName);

  const importMap: Record<string, () => Promise<unknown>> = {
    overview: () => import('../pages/Overview'),
    checkout: () => import('../pages/Checkout'),
    cart: () => import('../pages/ShoppingCart'),
    'bot-demo': () => import('../pages/BotSimulationDemo'),
    'admin-dashboard': () => import('../pages/AdminDashboard'),
    'admin-login': () => import('../pages/AdminLogin'),
    'admin-analytics': () => import('../pages/admin/AdvancedAnalytics'),
    analytics: () => import('../pages/admin/Analytics'),
    'flash-sales': () => import('../pages/admin/FlashSales'),
    'sale-details': () => import('../pages/admin/SaleDetails'),
    'queue-management': () => import('../pages/admin/QueueManagement'),
    users: () => import('../pages/admin/Users'),
    orders: () => import('../pages/admin/Orders'),
    'audit-logs': () => import('../pages/admin/AuditLogs'),
    alerts: () => import('../pages/admin/Alerts'),
    'system-health': () => import('../pages/admin/SystemHealth'),
    deployments: () => import('../pages/admin/Deployments'),
    performance: () => import('../pages/admin/PerformanceDashboard'),
    'feature-flags': () => import('../pages/admin/FeatureFlags'),
  };

  const loader = importMap[routeName];
  if (loader) {
    loader().catch(() => {
      // Preload failed silently — page will load on demand
      preloadedRoutes.delete(routeName);
    });
  }
}

// ─── Route Configuration ─────────────────────────────────────

export interface RouteConfig {
  path: string;
  name: string;
  component: React.LazyExoticComponent<ComponentType<object>>;
  preloadName: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

export const publicRoutes: RouteConfig[] = [
  {
    path: '/',
    name: 'Overview',
    component: LazyOverview,
    preloadName: 'overview',
  },
  {
    path: '/cart',
    name: 'Shopping Cart',
    component: LazyShoppingCart,
    preloadName: 'cart',
    requiresAuth: true,
  },
  {
    path: '/checkout',
    name: 'Checkout',
    component: LazyCheckout,
    preloadName: 'checkout',
    requiresAuth: true,
  },
  {
    path: '/bot-demo',
    name: 'Bot Demo',
    component: LazyBotDemo,
    preloadName: 'bot-demo',
  },
];

export const adminRoutes: RouteConfig[] = [
  {
    path: '/admin/dashboard',
    name: 'Admin Overview',
    component: LazyOverview,
    preloadName: 'overview',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/analytics',
    name: 'Analytics',
    component: LazyAnalytics,
    preloadName: 'analytics',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/advanced-analytics',
    name: 'Advanced Analytics',
    component: LazyAdminAnalytics,
    preloadName: 'admin-analytics',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/performance',
    name: 'Performance',
    component: LazyPerformanceDashboard,
    preloadName: 'performance',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/feature-flags',
    name: 'Feature Flags',
    component: LazyFeatureFlags,
    preloadName: 'feature-flags',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/sales',
    name: 'Flash Sales',
    component: LazyFlashSales,
    preloadName: 'flash-sales',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/queues',
    name: 'Queue Management',
    component: LazyQueueManagement,
    preloadName: 'queue-management',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/users',
    name: 'User Management',
    component: LazyUsers,
    preloadName: 'users',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/orders',
    name: 'Order Management',
    component: LazyOrders,
    preloadName: 'orders',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/logs',
    name: 'Audit Logs',
    component: LazyAuditLogs,
    preloadName: 'audit-logs',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/alerts',
    name: 'Alerts',
    component: LazyAlerts,
    preloadName: 'alerts',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/system-health',
    name: 'System Health',
    component: LazySystemHealth,
    preloadName: 'system-health',
    requiresAuth: true,
    requiresAdmin: true,
  },
  {
    path: '/admin/deployments',
    name: 'Deployments',
    component: LazyDeployments,
    preloadName: 'deployments',
    requiresAuth: true,
    requiresAdmin: true,
  },
];
