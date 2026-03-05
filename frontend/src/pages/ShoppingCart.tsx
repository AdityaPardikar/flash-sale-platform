/**
 * Shopping Cart Component
 * Week 8 Day 3: Refactored to use CartContext (real state management)
 *
 * Features:
 * - View cart items with CartContext
 * - Update quantities via context
 * - Remove items
 * - Cart summary with tax/shipping
 * - Proceed to checkout
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';

const ShoppingCart: React.FC = () => {
  const navigate = useNavigate();
  const {
    items,
    summary,
    isLoading,
    updateQuantity: updateCartQuantity,
    removeItem: removeCartItem,
    clearCart: clearCartItems,
  } = useCart();
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Update quantity (with brief loading indicator)
  const updateQuantity = async (productId: string, newQuantity: number) => {
    setUpdatingItem(productId);
    setError(null);
    try {
      updateCartQuantity(productId, newQuantity);
    } catch {
      setError('Failed to update cart');
    } finally {
      setTimeout(() => setUpdatingItem(null), 200);
    }
  };

  // Remove item
  const removeItem = async (productId: string) => {
    setUpdatingItem(productId);
    setError(null);
    try {
      removeCartItem(productId);
    } catch {
      setError('Failed to remove item');
    } finally {
      setTimeout(() => setUpdatingItem(null), 200);
    }
  };

  // Clear cart
  const clearCart = () => {
    if (!window.confirm('Are you sure you want to clear your cart?')) return;
    clearCartItems();
  };

  // Proceed to checkout
  const proceedToCheckout = () => {
    if (items.length === 0) {
      setError('Your cart is empty');
      return;
    }
    navigate('/checkout');
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-12 text-center border border-white/20">
            <div className="text-8xl mb-6">🛒</div>
            <h2 className="text-3xl font-bold text-white mb-4">Your Cart is Empty</h2>
            <p className="text-gray-300 mb-8">
              Looks like you haven&apos;t added any items to your cart yet. Check out our flash
              sales for amazing deals!
            </p>
            <Link
              to="/"
              className="inline-block bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-3 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all"
            >
              Browse Flash Sales
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span>🛒</span> Shopping Cart
            <span className="text-lg bg-purple-500 px-3 py-1 rounded-full">
              {summary.itemCount} items
            </span>
          </h1>
          <button
            onClick={clearCart}
            className="text-red-400 hover:text-red-300 text-sm flex items-center gap-2"
            disabled={isLoading}
          >
            <span>🗑️</span> Clear Cart
          </button>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.productId}
                className={`bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 transition-all ${
                  updatingItem === item.productId ? 'opacity-50' : ''
                }`}
              >
                <div className="flex gap-6">
                  {/* Product Image */}
                  <div className="w-24 h-24 bg-white/10 rounded-xl overflow-hidden flex-shrink-0">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">
                        📦
                      </div>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{item.name}</h3>
                        {item.saleId && (
                          <span className="inline-block bg-red-500 text-white text-xs px-2 py-1 rounded-full mt-1">
                            ⚡ Flash Sale
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-gray-400 hover:text-red-400 p-1"
                        disabled={updatingItem === item.productId}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      {/* Price */}
                      <div>
                        <div className="text-2xl font-bold text-white">
                          ${item.price.toFixed(2)}
                        </div>
                        {item.originalPrice > item.price && (
                          <div className="text-sm text-gray-400 line-through">
                            ${item.originalPrice.toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Quantity Controls */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                          className="w-10 h-10 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                          disabled={updatingItem === item.productId}
                        >
                          −
                        </button>
                        <span className="text-white font-semibold w-8 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                          className="w-10 h-10 bg-white/10 rounded-lg text-white hover:bg-white/20 transition-colors disabled:opacity-50"
                          disabled={
                            updatingItem === item.productId || item.quantity >= item.maxQuantity
                          }
                        >
                          +
                        </button>
                      </div>

                      {/* Item Total */}
                      <div className="text-right">
                        <div className="text-sm text-gray-400">Subtotal</div>
                        <div className="text-lg font-semibold text-white">
                          ${(item.price * item.quantity).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {item.quantity >= item.maxQuantity && (
                      <div className="mt-2 text-sm text-yellow-400">
                        ⚠️ Maximum quantity reached ({item.maxQuantity})
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 sticky top-4">
              <h2 className="text-xl font-bold text-white mb-6">Order Summary</h2>

              <div className="space-y-4">
                <div className="flex justify-between text-gray-300">
                  <span>Subtotal ({summary.itemCount} items)</span>
                  <span>${(summary.subtotal + summary.discount).toFixed(2)}</span>
                </div>

                {summary.savings > 0 && (
                  <div className="flex justify-between text-green-400">
                    <span>Flash Sale Savings</span>
                    <span>−${summary.savings.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex justify-between text-gray-300">
                  <span>Tax (8%)</span>
                  <span>${summary.tax.toFixed(2)}</span>
                </div>

                <div className="flex justify-between text-gray-300">
                  <span>Shipping</span>
                  <span>{summary.shipping === 0 ? 'FREE' : `$${summary.shipping.toFixed(2)}`}</span>
                </div>

                {summary.shipping === 0 && (
                  <div className="text-sm text-green-400">✨ You qualify for free shipping!</div>
                )}

                <div className="border-t border-white/20 pt-4">
                  <div className="flex justify-between text-white text-xl font-bold">
                    <span>Total</span>
                    <span>${summary.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={proceedToCheckout}
                className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all flex items-center justify-center gap-2"
                disabled={isLoading}
              >
                <span>🔒</span> Proceed to Checkout
              </button>

              <div className="mt-4 text-center text-sm text-gray-400">
                <p>🔒 Secure checkout with SSL encryption</p>
              </div>

              {/* Accepted Payment Methods */}
              <div className="mt-6 pt-6 border-t border-white/20">
                <p className="text-sm text-gray-400 mb-3">Accepted Payment Methods</p>
                <div className="flex justify-center gap-4 text-2xl">
                  <span title="Visa">💳</span>
                  <span title="Mastercard">💳</span>
                  <span title="Apple Pay">🍎</span>
                  <span title="Google Pay">📱</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Continue Shopping */}
        <div className="mt-8 text-center">
          <Link
            to="/"
            className="text-purple-400 hover:text-purple-300 flex items-center justify-center gap-2"
          >
            ← Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ShoppingCart;
