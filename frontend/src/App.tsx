import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink } from 'react-router-dom';
import FlashSaleHub from './components/FlashSaleHub';
import ProductListing from './components/ProductListing';
import QueueStatus from './components/QueueStatus';
import AuthModal from './components/AuthModal';
import { WebSocketProvider } from './contexts/WebSocketContext';
import ConnectionStatus from './components/ConnectionStatus';
import LanguageSwitcher from './components/LanguageSwitcher';
import ProtectedRoute from './components/ProtectedRoute';
import NotFound from './pages/NotFound';

// ─── Lazy-loaded Pages (code-split) ──────────────────────────
const BotSimulationDemo = lazy(() => import('./pages/BotSimulationDemo'));
const ShoppingCart = lazy(() => import('./pages/ShoppingCart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Overview = lazy(() => import('./pages/Overview'));

// Admin sub-pages
const AdvancedAnalytics = lazy(() => import('./pages/admin/AdvancedAnalytics'));
const PerformanceDashboard = lazy(() => import('./pages/admin/PerformanceDashboard'));
const FeatureFlags = lazy(() => import('./pages/admin/FeatureFlags'));
const Analytics = lazy(() => import('./pages/admin/Analytics'));
const FlashSales = lazy(() => import('./pages/admin/FlashSales'));
const SaleDetails = lazy(() => import('./pages/admin/SaleDetails'));
const QueueManagement = lazy(() => import('./pages/admin/QueueManagement'));
const Users = lazy(() => import('./pages/admin/Users'));
const Orders = lazy(() => import('./pages/admin/Orders'));
const AuditLogs = lazy(() => import('./pages/admin/AuditLogs'));
const Alerts = lazy(() => import('./pages/admin/Alerts'));
const SystemHealth = lazy(() => import('./pages/admin/SystemHealth'));
const Deployments = lazy(() => import('./pages/admin/Deployments'));

// ─── Loading Fallback ────────────────────────────────────────
const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center min-h-[60vh]">
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute inset-0 rounded-full border-4 border-purple-500/30" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-purple-500 animate-spin" />
      </div>
      <p className="text-purple-300 text-sm font-medium animate-pulse">Loading...</p>
    </div>
  </div>
);

// ─── Mobile Navigation ───────────────────────────────────────
const MobileNav: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />
      <div className="fixed top-[73px] left-0 right-0 bg-purple-900/95 backdrop-blur-lg border-b border-white/10 z-50 md:hidden animate-slideDown">
        <nav className="flex flex-col p-4 space-y-2">
          <NavLink
            to="/"
            onClick={onClose}
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-white font-medium transition-colors ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
            }
          >
            ⚡ Flash Sales
          </NavLink>
          <NavLink
            to="/products"
            onClick={onClose}
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-white font-medium transition-colors ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
            }
          >
            🛍️ All Products
          </NavLink>
          <NavLink
            to="/queue"
            onClick={onClose}
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-white font-medium transition-colors ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
            }
          >
            📊 Queue Status
          </NavLink>
          <NavLink
            to="/cart"
            onClick={onClose}
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-white font-medium transition-colors ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
            }
          >
            🛒 Cart
          </NavLink>
          <NavLink
            to="/bot-demo"
            onClick={onClose}
            className={({ isActive }) =>
              `px-4 py-3 rounded-lg text-yellow-400 font-bold transition-colors ${isActive ? 'bg-white/20' : 'hover:bg-white/10'}`
            }
          >
            🤖 Bot Demo
          </NavLink>
        </nav>
      </div>
    </>
  );
};

// ─── Public Layout ───────────────────────────────────────────
interface UserData {
  email: string;
  id?: number;
  [key: string]: unknown;
}

const App: React.FC = () => {
  const [user, setUser] = useState<UserData | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <WebSocketProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* ── Admin Login (no auth guard, no admin layout) ── */}
            <Route path="/admin/login" element={<AdminLogin />} />

            {/* ── Admin Routes (nested under AdminDashboard layout) ── */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            >
              <Route index element={<Overview />} />
              <Route path="dashboard" element={<Overview />} />
              <Route path="analytics" element={<Analytics />} />
              <Route path="advanced-analytics" element={<AdvancedAnalytics />} />
              <Route path="performance" element={<PerformanceDashboard />} />
              <Route path="feature-flags" element={<FeatureFlags />} />
              <Route path="sales" element={<FlashSales />} />
              <Route path="sales/:id" element={<SaleDetails />} />
              <Route path="queues" element={<QueueManagement />} />
              <Route path="users" element={<Users />} />
              <Route path="orders" element={<Orders />} />
              <Route path="logs" element={<AuditLogs />} />
              <Route path="alerts" element={<Alerts />} />
              <Route path="system-health" element={<SystemHealth />} />
              <Route path="deployments" element={<Deployments />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* ── Public Routes (with header/nav) ── */}
            <Route
              path="/*"
              element={
                <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex flex-col">
                  {/* Header */}
                  <header className="bg-black/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
                    <div className="max-w-7xl mx-auto px-4 py-4">
                      <div className="flex justify-between items-center">
                        <Link to="/" className="flex items-center space-x-3">
                          <div className="text-4xl">⚡</div>
                          <div>
                            <h1 className="text-2xl font-bold text-white">FlashBuy</h1>
                            <p className="text-purple-200 text-sm">Lightning Fast Deals</p>
                          </div>
                        </Link>

                        {/* Desktop Nav */}
                        <nav className="hidden md:flex space-x-8">
                          <NavLink
                            to="/"
                            end
                            className={({ isActive }) =>
                              `transition-colors ${isActive ? 'text-purple-300 font-semibold' : 'text-white hover:text-purple-300'}`
                            }
                          >
                            Flash Sales
                          </NavLink>
                          <NavLink
                            to="/products"
                            className={({ isActive }) =>
                              `transition-colors ${isActive ? 'text-purple-300 font-semibold' : 'text-white hover:text-purple-300'}`
                            }
                          >
                            All Products
                          </NavLink>
                          <NavLink
                            to="/queue"
                            className={({ isActive }) =>
                              `transition-colors ${isActive ? 'text-purple-300 font-semibold' : 'text-white hover:text-purple-300'}`
                            }
                          >
                            Queue Status
                          </NavLink>
                          <NavLink
                            to="/cart"
                            className={({ isActive }) =>
                              `transition-colors flex items-center gap-1 ${isActive ? 'text-purple-300 font-semibold' : 'text-white hover:text-purple-300'}`
                            }
                          >
                            <span>🛒</span> Cart
                          </NavLink>
                          <NavLink
                            to="/bot-demo"
                            className={({ isActive }) =>
                              `font-bold transition-colors ${isActive ? 'text-yellow-300' : 'text-yellow-400 hover:text-yellow-300'}`
                            }
                          >
                            🤖 Bot Demo
                          </NavLink>
                        </nav>

                        <div className="flex items-center space-x-4">
                          {/* Hamburger (mobile) */}
                          <button
                            onClick={() => setMobileNavOpen(!mobileNavOpen)}
                            className="md:hidden p-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                            aria-label="Toggle navigation menu"
                          >
                            <svg
                              className="w-6 h-6"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              {mobileNavOpen ? (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              ) : (
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M4 6h16M4 12h16M4 18h16"
                                />
                              )}
                            </svg>
                          </button>

                          <LanguageSwitcher compact />

                          {user ? (
                            <div className="flex items-center space-x-3">
                              <span className="text-white hidden sm:inline">
                                Welcome, {user.email}
                              </span>
                              <button
                                onClick={() => setUser(null)}
                                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                              >
                                Logout
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setShowAuthModal(true)}
                              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-2 rounded-lg transition-all transform hover:scale-105"
                            >
                              Login
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </header>

                  {/* Mobile Nav Dropdown */}
                  <MobileNav isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} />

                  {/* Main Content */}
                  <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                    <Routes>
                      <Route path="/" element={<FlashSaleHub user={user} />} />
                      <Route path="/products" element={<ProductListing user={user} />} />
                      <Route path="/queue" element={<QueueStatus user={user} />} />
                      <Route path="/cart" element={<ShoppingCart />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/bot-demo" element={<BotSimulationDemo />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </main>

                  {/* Footer */}
                  <footer className="bg-black/30 backdrop-blur-md border-t border-white/10 mt-auto">
                    <div className="max-w-7xl mx-auto px-4 py-8">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div>
                          <div className="flex items-center space-x-2 mb-3">
                            <span className="text-2xl">⚡</span>
                            <span className="text-xl font-bold text-white">FlashBuy</span>
                          </div>
                          <p className="text-blue-200 text-sm">
                            Lightning-fast flash sales platform built for speed and reliability.
                          </p>
                        </div>
                        <div>
                          <h4 className="text-white font-semibold mb-3">Quick Links</h4>
                          <div className="space-y-2">
                            <Link
                              to="/"
                              className="block text-blue-200 hover:text-white text-sm transition-colors"
                            >
                              Flash Sales
                            </Link>
                            <Link
                              to="/products"
                              className="block text-blue-200 hover:text-white text-sm transition-colors"
                            >
                              All Products
                            </Link>
                            <Link
                              to="/queue"
                              className="block text-blue-200 hover:text-white text-sm transition-colors"
                            >
                              Queue Status
                            </Link>
                          </div>
                        </div>
                        <div>
                          <h4 className="text-white font-semibold mb-3">Platform</h4>
                          <div className="space-y-2">
                            <Link
                              to="/admin/login"
                              className="block text-blue-200 hover:text-white text-sm transition-colors"
                            >
                              Admin Portal
                            </Link>
                            <Link
                              to="/bot-demo"
                              className="block text-blue-200 hover:text-white text-sm transition-colors"
                            >
                              Bot Demo
                            </Link>
                          </div>
                        </div>
                      </div>
                      <div className="border-t border-white/10 mt-6 pt-6 text-center">
                        <p className="text-blue-300 text-sm">
                          &copy; {new Date().getFullYear()} FlashBuy Platform. Built with React,
                          Node.js &amp; Redis.
                        </p>
                      </div>
                    </div>
                  </footer>

                  {/* Auth Modal */}
                  {showAuthModal && (
                    <AuthModal
                      onClose={() => setShowAuthModal(false)}
                      onLogin={(userData: UserData) => {
                        setUser(userData);
                        setShowAuthModal(false);
                      }}
                    />
                  )}

                  <ConnectionStatus showDetails autoHide position="bottom-right" />
                </div>
              }
            />
          </Routes>
        </Suspense>
      </Router>
    </WebSocketProvider>
  );
};

export default App;
