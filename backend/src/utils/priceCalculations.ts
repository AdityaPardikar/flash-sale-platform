/**
 * Utility functions for price and discount calculations
 */

/**
 * Calculate the discounted price
 */
export const calculateDiscountedPrice = (basePrice: number, discountPercentage: number): number => {
  if (basePrice < 0 || discountPercentage < 0 || discountPercentage > 100) {
    throw new Error('Invalid price or discount percentage');
  }

  const discount = basePrice * (discountPercentage / 100);
  return Math.round((basePrice - discount) * 100) / 100; // Round to 2 decimal places
};

/**
 * Calculate discount percentage from two prices
 */
export const calculateDiscountPercentage = (originalPrice: number, salePrice: number): number => {
  if (originalPrice <= 0 || salePrice < 0 || salePrice > originalPrice) {
    throw new Error('Invalid prices for discount calculation');
  }

  const discount = ((originalPrice - salePrice) / originalPrice) * 100;
  return Math.round(discount * 10) / 10; // Round to 1 decimal place
};

/**
 * Calculate savings amount
 */
export const calculateSavings = (originalPrice: number, salePrice: number): number => {
  if (originalPrice < salePrice) {
    throw new Error('Sale price cannot be higher than original price');
  }

  return Math.round((originalPrice - salePrice) * 100) / 100;
};

/**
 * Validate discount percentage
 */
export const validateDiscountPercentage = (percentage: number): boolean => {
  return percentage >= 0 && percentage <= 100;
};

/**
 * Format price for display (with currency symbol)
 */
export const formatPrice = (price: number, currency: string = 'USD'): string => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formatter.format(price);
};

/**
 * Format price without currency symbol
 */
export const formatPriceNumber = (price: number): string => {
  return price.toFixed(2);
};

/**
 * Calculate total price for quantity
 */
export const calculateTotalPrice = (unitPrice: number, quantity: number): number => {
  if (unitPrice < 0 || quantity < 0) {
    throw new Error('Invalid price or quantity');
  }

  return Math.round(unitPrice * quantity * 100) / 100;
};

/**
 * Apply tax to price
 */
export const applyTax = (price: number, taxRate: number): number => {
  if (price < 0 || taxRate < 0) {
    throw new Error('Invalid price or tax rate');
  }

  return Math.round((price + price * (taxRate / 100)) * 100) / 100;
};

/**
 * Calculate price with tax included
 */
export const calculatePriceWithTax = (
  basePrice: number,
  taxRate: number = 0
): { basePrice: number; tax: number; totalPrice: number } => {
  const tax = Math.round(basePrice * (taxRate / 100) * 100) / 100;
  const totalPrice = Math.round((basePrice + tax) * 100) / 100;

  return {
    basePrice,
    tax,
    totalPrice,
  };
};

/**
 * Check if price is valid flash sale price
 */
export const isValidFlashPrice = (basePrice: number, flashPrice: number): boolean => {
  return flashPrice > 0 && flashPrice < basePrice;
};

/**
 * Calculate price range for products
 */
export const calculatePriceRange = (
  prices: number[]
): { min: number; max: number; average: number } => {
  if (prices.length === 0) {
    return { min: 0, max: 0, average: 0 };
  }

  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const sum = prices.reduce((acc, price) => acc + price, 0);
  const average = Math.round((sum / prices.length) * 100) / 100;

  return { min, max, average };
};

/**
 * Round price to nearest value
 */
export const roundPrice = (price: number, nearest: number = 0.01): number => {
  return Math.round(price / nearest) * nearest;
};

/**
 * Generate price tiers based on quantity
 */
export const generatePriceTiers = (
  basePrice: number,
  tiers: { quantity: number; discount: number }[]
): { quantity: number; pricePerUnit: number; totalPrice: number; discount: number }[] => {
  return tiers.map((tier) => {
    const discountedPrice = calculateDiscountedPrice(basePrice, tier.discount);
    return {
      quantity: tier.quantity,
      pricePerUnit: discountedPrice,
      totalPrice: calculateTotalPrice(discountedPrice, tier.quantity),
      discount: tier.discount,
    };
  });
};

/**
 * Calculate flash sale price with optional time-based discount
 */
export const calculateFlashPrice = (
  basePrice: number,
  discountPercentage: number,
  timeRemaining?: number,
  totalDuration?: number
): number => {
  // Base flash sale discount
  let finalDiscount = discountPercentage;

  // Optional: adjust discount based on time remaining (early bird gets bigger discount)
  if (timeRemaining !== undefined && totalDuration !== undefined && totalDuration > 0) {
    const timeProgress = 1 - timeRemaining / totalDuration;
    // Reduce discount as time passes (max 10% reduction)
    const timeAdjustment = timeProgress * 10;
    finalDiscount = Math.max(discountPercentage - timeAdjustment, discountPercentage * 0.5);
  }

  return calculateDiscountedPrice(basePrice, finalDiscount);
};
