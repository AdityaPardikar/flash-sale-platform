/**
 * Currency & Number Formatting Utilities
 * Week 6 Day 3: Internationalization & Localization
 *
 * Features:
 * - Multi-currency display (USD, EUR, GBP, INR, SAR, JPY, etc.)
 * - Locale-aware number formatting
 * - Date/time localization
 * - Relative time formatting ("2 hours ago")
 * - Exchange rate conversion
 * - Currency preference persistence
 */

// ─── Types ──────────────────────────────────────────────────

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  locale: string;
  decimalPlaces: number;
}

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
}

// ─── Supported Currencies ───────────────────────────────────

export const CURRENCIES: CurrencyConfig[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', locale: 'en-US', decimalPlaces: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', locale: 'de-DE', decimalPlaces: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', locale: 'en-GB', decimalPlaces: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', locale: 'en-IN', decimalPlaces: 2 },
  { code: 'SAR', symbol: 'ر.س', name: 'Saudi Riyal', locale: 'ar-SA', decimalPlaces: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP', decimalPlaces: 0 },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', locale: 'zh-CN', decimalPlaces: 2 },
  { code: 'MXN', symbol: '$', name: 'Mexican Peso', locale: 'es-MX', decimalPlaces: 2 },
];

// ─── Default Exchange Rates (to USD) ──────────────────────

const DEFAULT_EXCHANGE_RATES: ExchangeRates = {
  base: 'USD',
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    INR: 83.12,
    SAR: 3.75,
    JPY: 149.5,
    CNY: 7.24,
    MXN: 17.15,
  },
  updatedAt: new Date().toISOString(),
};

// ─── State ──────────────────────────────────────────────────

let currentCurrency = 'USD';
let exchangeRates = DEFAULT_EXCHANGE_RATES;

// ─── Currency Functions ─────────────────────────────────────

/**
 * Format a price in the specified currency and locale.
 */
export function formatCurrency(amount: number, currencyCode?: string, locale?: string): string {
  const code = currencyCode || currentCurrency;
  const config = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
  const loc = locale || config.locale;

  try {
    return new Intl.NumberFormat(loc, {
      style: 'currency',
      currency: code,
      minimumFractionDigits: config.decimalPlaces,
      maximumFractionDigits: config.decimalPlaces,
    }).format(amount);
  } catch {
    return `${config.symbol}${amount.toFixed(config.decimalPlaces)}`;
  }
}

/**
 * Convert amount from one currency to another using exchange rates.
 */
export function convertCurrency(amount: number, fromCurrency: string, toCurrency: string): number {
  if (fromCurrency === toCurrency) return amount;

  const fromRate = exchangeRates.rates[fromCurrency] || 1;
  const toRate = exchangeRates.rates[toCurrency] || 1;

  // Convert to USD first, then to target
  const usdAmount = amount / fromRate;
  return usdAmount * toRate;
}

/**
 * Format and convert a price for display in the user's preferred currency.
 */
export function formatPrice(amount: number, sourceCurrency = 'USD', locale?: string): string {
  const converted = convertCurrency(amount, sourceCurrency, currentCurrency);
  return formatCurrency(converted, currentCurrency, locale);
}

// ─── Number Formatting ─────────────────────────────────────

/**
 * Format a number according to locale.
 */
export function formatNumber(
  value: number,
  locale?: string,
  options?: Intl.NumberFormatOptions
): string {
  const loc = locale || getLocaleForCurrency(currentCurrency);
  try {
    return new Intl.NumberFormat(loc, options).format(value);
  } catch {
    return value.toString();
  }
}

/**
 * Format a compact number (e.g., 1.2K, 3.5M).
 */
export function formatCompactNumber(value: number, locale?: string): string {
  const loc = locale || getLocaleForCurrency(currentCurrency);
  try {
    return new Intl.NumberFormat(loc, {
      notation: 'compact',
      compactDisplay: 'short',
      maximumFractionDigits: 1,
    }).format(value);
  } catch {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
    return value.toString();
  }
}

/**
 * Format a percentage.
 */
export function formatPercent(value: number, locale?: string): string {
  const loc = locale || 'en-US';
  try {
    return new Intl.NumberFormat(loc, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(1)}%`;
  }
}

// ─── Date/Time Formatting ───────────────────────────────────

/**
 * Format a date according to locale.
 */
export function formatDate(
  date: Date | string | number,
  locale?: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = new Date(date);
  const loc = locale || getLocaleForCurrency(currentCurrency);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  };
  try {
    return new Intl.DateTimeFormat(loc, defaultOptions).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

/**
 * Format a time according to locale.
 */
export function formatTime(
  date: Date | string | number,
  locale?: string,
  hour12?: boolean
): string {
  const d = new Date(date);
  const loc = locale || getLocaleForCurrency(currentCurrency);
  try {
    return new Intl.DateTimeFormat(loc, {
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: hour12 ?? true,
    }).format(d);
  } catch {
    return d.toLocaleTimeString();
  }
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 minutes").
 */
export function formatRelativeTime(date: Date | string | number, locale?: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const loc = locale || getLocaleForCurrency(currentCurrency);

  try {
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });

    if (Math.abs(diffSec) < 60) return rtf.format(-diffSec, 'second');
    if (Math.abs(diffMin) < 60) return rtf.format(-diffMin, 'minute');
    if (Math.abs(diffHr) < 24) return rtf.format(-diffHr, 'hour');
    return rtf.format(-diffDay, 'day');
  } catch {
    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${diffDay}d ago`;
  }
}

/**
 * Format a countdown timer display (days, hours, minutes, seconds).
 */
export function formatCountdown(totalSeconds: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  display: string;
} {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return { days, hours, minutes, seconds, display: parts.join(' ') };
}

// ─── Preference Management ─────────────────────────────────

/**
 * Get the current currency code.
 */
export function getCurrentCurrency(): string {
  return currentCurrency;
}

/**
 * Set the preferred currency and persist it.
 */
export function setCurrentCurrency(code: string): void {
  if (CURRENCIES.some((c) => c.code === code)) {
    currentCurrency = code;
    try {
      localStorage.setItem('preferred_currency', code);
    } catch {
      // localStorage may not be available
    }
  }
}

/**
 * Load persisted currency preference.
 */
export function loadCurrencyPreference(): void {
  try {
    const saved = localStorage.getItem('preferred_currency');
    if (saved && CURRENCIES.some((c) => c.code === saved)) {
      currentCurrency = saved;
    }
  } catch {
    // Use default
  }
}

/**
 * Update exchange rates (call from API response).
 */
export function updateExchangeRates(rates: ExchangeRates): void {
  exchangeRates = rates;
}

/**
 * Get currency info by code.
 */
export function getCurrencyInfo(code: string): CurrencyConfig | undefined {
  return CURRENCIES.find((c) => c.code === code);
}

// ─── Helpers ────────────────────────────────────────────────

function getLocaleForCurrency(code: string): string {
  const config = CURRENCIES.find((c) => c.code === code);
  return config?.locale || 'en-US';
}

// Initialize currency preference on load
loadCurrencyPreference();
