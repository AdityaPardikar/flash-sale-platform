import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import FlashSaleHub from './components/FlashSaleHub';
import ProductListing from './components/ProductListing';
import QueueStatus from './components/QueueStatus';
import AuthModal from './components/AuthModal';
import BotSimulationDemo from './pages/BotSimulationDemo';
import ShoppingCart from './pages/ShoppingCart';
import Checkout from './pages/Checkout';

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900">
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

              <nav className="hidden md:flex space-x-8">
                <Link to="/" className="text-white hover:text-purple-300 transition-colors">
                  Flash Sales
                </Link>
                <Link to="/products" className="text-white hover:text-purple-300 transition-colors">
                  All Products
                </Link>
                <Link to="/queue" className="text-white hover:text-purple-300 transition-colors">
                  Queue Status
                </Link>
                <Link
                  to="/cart"
                  className="text-white hover:text-purple-300 transition-colors flex items-center gap-1"
                >
                  <span>🛒</span> Cart
                </Link>
                <Link
                  to="/bot-demo"
                  className="text-yellow-400 hover:text-yellow-300 transition-colors font-bold"
                >
                  🤖 Bot Demo
                </Link>
              </nav>

              <div className="flex items-center space-x-4">
                {user ? (
                  <div className="flex items-center space-x-3">
                    <span className="text-white">Welcome, {user.email}</span>
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

        <main className="max-w-7xl mx-auto px-4 py-8">
          <Routes>
            <Route path="/" element={<FlashSaleHub user={user} />} />
            <Route path="/products" element={<ProductListing user={user} />} />
            <Route path="/queue" element={<QueueStatus user={user} />} />
            <Route path="/cart" element={<ShoppingCart />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/bot-demo" element={<BotSimulationDemo />} />
          </Routes>
        </main>

        {showAuthModal && (
          <AuthModal
            onClose={() => setShowAuthModal(false)}
            onLogin={(userData) => {
              setUser(userData);
              setShowAuthModal(false);
            }}
          />
        )}
      </div>
    </Router>
  );
};

export default App;
