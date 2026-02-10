/**
 * Checkout Component
 * Week 5 Day 1: Payment System & Shopping Cart
 *
 * Features:
 * - Shipping address form
 * - Payment method selection
 * - Stripe Elements integration (simulated)
 * - Order review
 * - Payment processing
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// Types
interface ShippingAddress {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface PaymentDetails {
  cardNumber: string;
  expiryDate: string;
  cvv: string;
  cardName: string;
}

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

type CheckoutStep = 'shipping' | 'payment' | 'review' | 'confirmation';

// Mock order data
const mockOrderItems: OrderItem[] = [
  { name: 'iPhone 15 Pro Max - Flash Deal', quantity: 1, price: 699.99 },
  { name: 'Sony WH-1000XM5 Headphones', quantity: 2, price: 149.99 },
  { name: 'Premium USB-C Cable Bundle', quantity: 1, price: 59.99 },
];

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<CheckoutStep>('shipping');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [shipping, setShipping] = useState<ShippingAddress>({
    fullName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'United States',
  });

  const [payment, setPayment] = useState<PaymentDetails>({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardName: '',
  });

  const [orderId, setOrderId] = useState<string | null>(null);

  // Calculate totals
  const subtotal = mockOrderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const tax = subtotal * 0.08;
  const shipping_cost = subtotal >= 50 ? 0 : 5.99;
  const total = subtotal + tax + shipping_cost;

  // Step Components
  const steps = [
    { key: 'shipping', label: 'Shipping', icon: '📦' },
    { key: 'payment', label: 'Payment', icon: '💳' },
    { key: 'review', label: 'Review', icon: '📋' },
    { key: 'confirmation', label: 'Confirmation', icon: '✅' },
  ];

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipping.fullName || !shipping.email || !shipping.address || !shipping.city) {
      setError('Please fill in all required fields');
      return;
    }
    setError(null);
    setCurrentStep('payment');
  };

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment.cardNumber || !payment.expiryDate || !payment.cvv || !payment.cardName) {
      setError('Please fill in all payment details');
      return;
    }
    setError(null);
    setCurrentStep('review');
  };

  const processPayment = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // Simulate payment processing
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Generate order ID
      const newOrderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
      setOrderId(newOrderId);
      setCurrentStep('confirmation');
    } catch (err) {
      setError('Payment failed. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Format card number with spaces
  const formatCardNumber = (value: string): string => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  // Format expiry date
  const formatExpiry = (value: string): string => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return `${v.substring(0, 2)}/${v.substring(2, 4)}`;
    }
    return v;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-white">🔒 Secure Checkout</h1>
          <Link to="/cart" className="text-purple-400 hover:text-purple-300">
            ← Back to Cart
          </Link>
        </div>

        {/* Progress Steps */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-4 mb-8 border border-white/20">
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div
                key={step.key}
                className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
              >
                <div
                  className={`flex items-center gap-2 ${
                    currentStep === step.key
                      ? 'text-purple-400'
                      : steps.findIndex((s) => s.key === currentStep) > index
                        ? 'text-green-400'
                        : 'text-gray-500'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      currentStep === step.key
                        ? 'bg-purple-500 text-white'
                        : steps.findIndex((s) => s.key === currentStep) > index
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-700 text-gray-400'
                    }`}
                  >
                    {step.icon}
                  </div>
                  <span className="hidden sm:inline font-medium">{step.label}</span>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-4 rounded ${
                      steps.findIndex((s) => s.key === currentStep) > index
                        ? 'bg-green-500'
                        : 'bg-gray-700'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-4 mb-6 text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Shipping Step */}
            {currentStep === 'shipping' && (
              <form
                onSubmit={handleShippingSubmit}
                className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20"
              >
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <span>📦</span> Shipping Information
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-gray-300 text-sm mb-2">Full Name *</label>
                    <input
                      type="text"
                      value={shipping.fullName}
                      onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="John Doe"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Email *</label>
                    <input
                      type="email"
                      value={shipping.email}
                      onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="john@example.com"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Phone</label>
                    <input
                      type="tel"
                      value={shipping.phone}
                      onChange={(e) => setShipping({ ...shipping, phone: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-gray-300 text-sm mb-2">Address *</label>
                    <input
                      type="text"
                      value={shipping.address}
                      onChange={(e) => setShipping({ ...shipping, address: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="123 Main Street, Apt 4"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">City *</label>
                    <input
                      type="text"
                      value={shipping.city}
                      onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="New York"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">State</label>
                    <input
                      type="text"
                      value={shipping.state}
                      onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="NY"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">ZIP Code</label>
                    <input
                      type="text"
                      value={shipping.zipCode}
                      onChange={(e) => setShipping({ ...shipping, zipCode: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="10001"
                    />
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Country</label>
                    <select
                      value={shipping.country}
                      onChange={(e) => setShipping({ ...shipping, country: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="United States">United States</option>
                      <option value="Canada">Canada</option>
                      <option value="United Kingdom">United Kingdom</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full mt-6 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all"
                >
                  Continue to Payment →
                </button>
              </form>
            )}

            {/* Payment Step */}
            {currentStep === 'payment' && (
              <form
                onSubmit={handlePaymentSubmit}
                className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20"
              >
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <span>💳</span> Payment Details
                </h2>

                <div className="mb-6 p-4 bg-blue-500/20 border border-blue-500/50 rounded-xl">
                  <p className="text-blue-300 text-sm">
                    🔒 Your payment information is encrypted and secure. We never store your full
                    card details.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Card Number *</label>
                    <input
                      type="text"
                      value={payment.cardNumber}
                      onChange={(e) =>
                        setPayment({ ...payment, cardNumber: formatCardNumber(e.target.value) })
                      }
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="4242 4242 4242 4242"
                      maxLength={19}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-gray-300 text-sm mb-2">Expiry Date *</label>
                      <input
                        type="text"
                        value={payment.expiryDate}
                        onChange={(e) =>
                          setPayment({ ...payment, expiryDate: formatExpiry(e.target.value) })
                        }
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        placeholder="MM/YY"
                        maxLength={5}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-gray-300 text-sm mb-2">CVV *</label>
                      <input
                        type="text"
                        value={payment.cvv}
                        onChange={(e) =>
                          setPayment({
                            ...payment,
                            cvv: e.target.value.replace(/\D/g, '').substring(0, 4),
                          })
                        }
                        className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        placeholder="123"
                        maxLength={4}
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-300 text-sm mb-2">Name on Card *</label>
                    <input
                      type="text"
                      value={payment.cardName}
                      onChange={(e) => setPayment({ ...payment, cardName: e.target.value })}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      placeholder="JOHN DOE"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('shipping')}
                    className="flex-1 bg-gray-700 text-white py-4 rounded-xl font-semibold hover:bg-gray-600 transition-all"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white py-4 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all"
                  >
                    Review Order →
                  </button>
                </div>
              </form>
            )}

            {/* Review Step */}
            {currentStep === 'review' && (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <span>📋</span> Review Your Order
                </h2>

                {/* Shipping Summary */}
                <div className="mb-6 p-4 bg-white/5 rounded-xl">
                  <h3 className="text-white font-semibold mb-2">Shipping Address</h3>
                  <p className="text-gray-300">
                    {shipping.fullName}
                    <br />
                    {shipping.address}
                    <br />
                    {shipping.city}, {shipping.state} {shipping.zipCode}
                    <br />
                    {shipping.country}
                  </p>
                </div>

                {/* Payment Summary */}
                <div className="mb-6 p-4 bg-white/5 rounded-xl">
                  <h3 className="text-white font-semibold mb-2">Payment Method</h3>
                  <p className="text-gray-300">💳 Card ending in {payment.cardNumber.slice(-4)}</p>
                </div>

                {/* Order Items */}
                <div className="mb-6">
                  <h3 className="text-white font-semibold mb-4">Order Items</h3>
                  <div className="space-y-3">
                    {mockOrderItems.map((item, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center p-3 bg-white/5 rounded-xl"
                      >
                        <div>
                          <p className="text-white">{item.name}</p>
                          <p className="text-gray-400 text-sm">Qty: {item.quantity}</p>
                        </div>
                        <p className="text-white font-semibold">
                          ${(item.price * item.quantity).toFixed(2)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('payment')}
                    className="flex-1 bg-gray-700 text-white py-4 rounded-xl font-semibold hover:bg-gray-600 transition-all"
                    disabled={isProcessing}
                  >
                    ← Back
                  </button>
                  <button
                    onClick={processPayment}
                    disabled={isProcessing}
                    className="flex-1 bg-gradient-to-r from-green-500 to-emerald-500 text-white py-4 rounded-xl font-semibold hover:from-green-600 hover:to-emerald-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isProcessing ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>🔒 Place Order - ${total.toFixed(2)}</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Confirmation Step */}
            {currentStep === 'confirmation' && (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-8 border border-white/20 text-center">
                <div className="text-8xl mb-6">🎉</div>
                <h2 className="text-3xl font-bold text-white mb-4">Order Confirmed!</h2>
                <p className="text-gray-300 mb-6">
                  Thank you for your purchase. Your order has been successfully placed.
                </p>

                <div className="bg-green-500/20 border border-green-500/50 rounded-xl p-4 mb-6">
                  <p className="text-green-300 text-sm">Order ID</p>
                  <p className="text-green-400 text-xl font-mono font-bold">{orderId}</p>
                </div>

                <p className="text-gray-400 text-sm mb-6">
                  A confirmation email has been sent to {shipping.email}
                </p>

                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => navigate('/')}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-8 py-3 rounded-xl font-semibold hover:from-purple-600 hover:to-pink-600 transition-all"
                  >
                    Continue Shopping
                  </button>
                  <button
                    onClick={() => navigate('/orders')}
                    className="bg-white/10 text-white px-8 py-3 rounded-xl font-semibold hover:bg-white/20 transition-all"
                  >
                    View Orders
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Order Summary Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-6 border border-white/20 sticky top-4">
              <h3 className="text-xl font-bold text-white mb-6">Order Summary</h3>

              <div className="space-y-3 mb-6">
                {mockOrderItems.map((item, index) => (
                  <div key={index} className="flex justify-between text-sm">
                    <span className="text-gray-300">
                      {item.name} × {item.quantity}
                    </span>
                    <span className="text-white">${(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/20 pt-4 space-y-3">
                <div className="flex justify-between text-gray-300">
                  <span>Subtotal</span>
                  <span>${subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Shipping</span>
                  <span>{shipping_cost === 0 ? 'FREE' : `$${shipping_cost.toFixed(2)}`}</span>
                </div>
                <div className="flex justify-between text-gray-300">
                  <span>Tax</span>
                  <span>${tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-white text-xl font-bold pt-3 border-t border-white/20">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-green-500/20 border border-green-500/50 rounded-xl">
                <p className="text-green-400 text-sm flex items-center gap-2">
                  <span>🎁</span> You're saving 30% with Flash Sale!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
