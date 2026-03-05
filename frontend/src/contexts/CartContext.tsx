import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import API from '../services/api';

// ─── Types ───────────────────────────────────────────────────

export interface CartItem {
  productId: string;
  saleId?: string;
  quantity: number;
  price: number;
  originalPrice: number;
  name: string;
  imageUrl?: string;
  maxQuantity: number;
}

export interface CartSummary {
  subtotal: number;
  discount: number;
  tax: number;
  shipping: number;
  total: number;
  itemCount: number;
  savings: number;
}

interface CartContextValue {
  items: CartItem[];
  summary: CartSummary;
  isLoading: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
}

// ─── Constants ───────────────────────────────────────────────

const CART_STORAGE_KEY = 'flashbuy_cart';
const TAX_RATE = 0.08;
const FREE_SHIPPING_THRESHOLD = 50;
const SHIPPING_COST = 5.99;

// ─── Context ─────────────────────────────────────────────────

const CartContext = createContext<CartContextValue | undefined>(undefined);

// ─── Helper: Calculate Summary ───────────────────────────────

function calculateSummary(items: CartItem[]): CartSummary {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const originalTotal = items.reduce((sum, item) => sum + item.originalPrice * item.quantity, 0);
  const discount = originalTotal - subtotal;
  const tax = subtotal * TAX_RATE;
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_COST;
  const total = subtotal + tax + shipping;
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const savings = discount;

  return { subtotal, discount, tax, shipping, total, itemCount, savings };
}

// ─── Provider ────────────────────────────────────────────────

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(false);

  // Persist cart to localStorage
  useEffect(() => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // Try to sync cart with backend (graceful fallback to local)
  useEffect(() => {
    const syncCart = async () => {
      try {
        setIsLoading(true);
        const token = localStorage.getItem('token');
        if (token) {
          const serverCart = await API.get<{ items: CartItem[] }>('/cart');
          if (serverCart?.items?.length) {
            setItems(serverCart.items);
          }
        }
      } catch {
        // Silently fall back to local cart — backend might not have cart endpoint yet
      } finally {
        setIsLoading(false);
      }
    };
    syncCart();
  }, []);

  const addItem = useCallback((newItem: CartItem) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === newItem.productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === newItem.productId
            ? { ...item, quantity: Math.min(item.quantity + newItem.quantity, item.maxQuantity) }
            : item,
        );
      }
      return [...prev, newItem];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((item) => item.productId !== productId));
      return;
    }
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(quantity, item.maxQuantity) }
          : item,
      ),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    localStorage.removeItem(CART_STORAGE_KEY);
  }, []);

  const summary = calculateSummary(items);

  return (
    <CartContext.Provider
      value={{
        items,
        summary,
        isLoading,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        itemCount: summary.itemCount,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

// ─── Hook ────────────────────────────────────────────────────

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return ctx;
}
