import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/**
 * NotFound — 404 Page
 * Week 8 Day 1: Routing Overhaul
 *
 * Animated 404 page with navigation suggestions.
 * Detects if user was trying to access /admin/* routes.
 */
const NotFound: React.FC = () => {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        {/* Animated 404 */}
        <div className="relative mb-8">
          <h1 className="text-[10rem] font-black text-white/10 leading-none select-none animate-pulse">
            404
          </h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-6xl animate-bounce">⚡</span>
          </div>
        </div>

        <h2 className="text-3xl font-bold text-white mb-4">Page Not Found</h2>
        <p className="text-blue-200 mb-8 text-lg">
          The page{' '}
          <code className="bg-white/10 px-2 py-1 rounded text-purple-300">{location.pathname}</code>{' '}
          doesn&apos;t exist or has been moved.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {isAdminRoute ? (
            <>
              <Link
                to="/admin/dashboard"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Go to Admin Dashboard
              </Link>
              <Link
                to="/"
                className="px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-all border border-white/20"
              >
                Back to Store
              </Link>
            </>
          ) : (
            <>
              <Link
                to="/"
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 transition-all transform hover:scale-105 shadow-lg"
              >
                Go to Homepage
              </Link>
              <Link
                to="/products"
                className="px-6 py-3 bg-white/10 text-white rounded-xl font-semibold hover:bg-white/20 transition-all border border-white/20"
              >
                Browse Products
              </Link>
            </>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-12 pt-8 border-t border-white/10">
          <p className="text-blue-300 text-sm mb-3">Quick Links</p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/" className="text-purple-300 hover:text-white text-sm transition-colors">
              Flash Sales
            </Link>
            <span className="text-white/20">•</span>
            <Link
              to="/products"
              className="text-purple-300 hover:text-white text-sm transition-colors"
            >
              Products
            </Link>
            <span className="text-white/20">•</span>
            <Link
              to="/queue"
              className="text-purple-300 hover:text-white text-sm transition-colors"
            >
              Queue Status
            </Link>
            <span className="text-white/20">•</span>
            <Link to="/cart" className="text-purple-300 hover:text-white text-sm transition-colors">
              Cart
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
