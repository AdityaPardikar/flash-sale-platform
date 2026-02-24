/**
 * Lazy Routes Configuration
 * Week 6 Day 5: Performance Profiling & Optimization
 *
 * Route-based code splitting with React.lazy for:
 * - Reduced initial bundle size
 * - On-demand loading of page components
 * - Loading fallback with skeleton UI
 * - Preloading on hover/focus for instant navigation
 */

import { lazy, ComponentType } from 'react';

// ─── Lazy Page Imports ────────────────────────────────────────

export const LazyOverview = lazy(() =>
  import('../pages/Overview').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyCheckout = lazy(() =>
  import('../pages/Checkout').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyShoppingCart = lazy(() =>
  import('../pages/ShoppingCart').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyBotDemo = lazy(() =>
  import('../pages/BotSimulationDemo').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyAdminDashboard = lazy(() =>
  import('../pages/AdminDashboard').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyAdminLogin = lazy(() =>
  import('../pages/AdminLogin').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
);

export const LazyAdminAnalytics = lazy(() =>
  import('../pages/admin/AdvancedAnalytics').catch(() => ({
    default: (() => null) as unknown as ComponentType<any>,
  }))
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
  component: React.LazyExoticComponent<ComponentType<any>>;
  preloadName: string;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

export const routeConfigs: RouteConfig[] = [
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
  {
    path: '/admin/analytics',
    name: 'Admin Analytics',
    component: LazyAdminAnalytics,
    preloadName: 'admin-analytics',
    requiresAuth: true,
    requiresAdmin: true,
  },
];
