/**
 * Localization Middleware
 * Week 6 Day 3: Internationalization & Localization
 *
 * Backend middleware for:
 * - Accept-Language header parsing
 * - Locale-aware error messages
 * - Request locale detection (header, query, cookie)
 * - Response content negotiation
 */

import { Request, Response, NextFunction } from 'express';

// ─── Types ──────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      locale?: string;
      currency?: string;
    }
  }
}

// ─── Supported Locales ──────────────────────────────────────

const SUPPORTED_LOCALES = ['en', 'es', 'fr', 'hi', 'ar'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const DEFAULT_LOCALE: SupportedLocale = 'en';

// ─── Error Messages ────────────────────────────────────────

const ERROR_MESSAGES: Record<SupportedLocale, Record<string, string>> = {
  en: {
    not_found: 'Resource not found',
    unauthorized: 'Authentication required',
    forbidden: 'Access denied',
    validation_error: 'Validation error',
    server_error: 'Internal server error',
    rate_limited: 'Too many requests. Please try again later.',
    out_of_stock: 'Item is out of stock',
    sale_expired: 'This sale has expired',
    payment_failed: 'Payment processing failed',
    invalid_input: 'Invalid input provided',
    missing_field: 'Required field is missing: {{field}}',
    already_exists: 'This resource already exists',
    queue_full: 'The queue is full. Please try again later.',
  },
  es: {
    not_found: 'Recurso no encontrado',
    unauthorized: 'Autenticación requerida',
    forbidden: 'Acceso denegado',
    validation_error: 'Error de validación',
    server_error: 'Error interno del servidor',
    rate_limited: 'Demasiadas solicitudes. Inténtelo más tarde.',
    out_of_stock: 'Artículo agotado',
    sale_expired: 'Esta oferta ha expirado',
    payment_failed: 'Error en el procesamiento del pago',
    invalid_input: 'Entrada no válida',
    missing_field: 'Campo obligatorio faltante: {{field}}',
    already_exists: 'Este recurso ya existe',
    queue_full: 'La cola está llena. Inténtelo más tarde.',
  },
  fr: {
    not_found: 'Ressource non trouvée',
    unauthorized: 'Authentification requise',
    forbidden: 'Accès refusé',
    validation_error: 'Erreur de validation',
    server_error: 'Erreur interne du serveur',
    rate_limited: 'Trop de requêtes. Veuillez réessayer plus tard.',
    out_of_stock: 'Article en rupture de stock',
    sale_expired: 'Cette offre a expiré',
    payment_failed: 'Échec du traitement du paiement',
    invalid_input: 'Entrée invalide',
    missing_field: 'Champ obligatoire manquant : {{field}}',
    already_exists: 'Cette ressource existe déjà',
    queue_full: 'La file est pleine. Veuillez réessayer plus tard.',
  },
  hi: {
    not_found: 'संसाधन नहीं मिला',
    unauthorized: 'प्रमाणीकरण आवश्यक है',
    forbidden: 'पहुंच अस्वीकृत',
    validation_error: 'सत्यापन त्रुटि',
    server_error: 'आंतरिक सर्वर त्रुटि',
    rate_limited: 'बहुत अधिक अनुरोध। कृपया बाद में पुनः प्रयास करें।',
    out_of_stock: 'आइटम स्टॉक में नहीं है',
    sale_expired: 'यह ऑफर समाप्त हो गया है',
    payment_failed: 'भुगतान प्रसंस्करण विफल',
    invalid_input: 'अमान्य इनपुट प्रदान किया गया',
    missing_field: 'आवश्यक फ़ील्ड गायब है: {{field}}',
    already_exists: 'यह संसाधन पहले से मौजूद है',
    queue_full: 'कतार भरी हुई है। कृपया बाद में पुनः प्रयास करें।',
  },
  ar: {
    not_found: 'المورد غير موجود',
    unauthorized: 'المصادقة مطلوبة',
    forbidden: 'الوصول مرفوض',
    validation_error: 'خطأ في التحقق',
    server_error: 'خطأ داخلي في الخادم',
    rate_limited: 'طلبات كثيرة جداً. يرجى المحاولة لاحقاً.',
    out_of_stock: 'المنتج غير متوفر',
    sale_expired: 'انتهى هذا العرض',
    payment_failed: 'فشل معالجة الدفع',
    invalid_input: 'إدخال غير صالح',
    missing_field: 'حقل مطلوب مفقود: {{field}}',
    already_exists: 'هذا المورد موجود بالفعل',
    queue_full: 'الطابور ممتلئ. يرجى المحاولة لاحقاً.',
  },
};

// ─── Currency Mapping ───────────────────────────────────────

const LOCALE_CURRENCY_MAP: Record<string, string> = {
  en: 'USD',
  es: 'MXN',
  fr: 'EUR',
  hi: 'INR',
  ar: 'SAR',
};

// ─── Middleware ─────────────────────────────────────────────

/**
 * Localization middleware - detects locale from request and makes
 * it available throughout the request lifecycle.
 */
export function localizationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Detect locale from multiple sources (priority order)
  const locale = detectLocale(req);

  req.locale = locale;
  req.currency = LOCALE_CURRENCY_MAP[locale] || 'USD';

  // Set response headers
  res.setHeader('Content-Language', locale);

  next();
}

/**
 * Get a localized error message.
 */
export function getLocalizedError(
  errorKey: string,
  locale: string = DEFAULT_LOCALE,
  params?: Record<string, string>
): string {
  const lang = (
    SUPPORTED_LOCALES.includes(locale as SupportedLocale) ? locale : DEFAULT_LOCALE
  ) as SupportedLocale;

  let message =
    ERROR_MESSAGES[lang][errorKey] || ERROR_MESSAGES[DEFAULT_LOCALE][errorKey] || errorKey;

  // Interpolate parameters
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      message = message.replace(`{{${key}}}`, value);
    });
  }

  return message;
}

/**
 * Create a localized error response.
 */
export function localizedErrorResponse(
  res: Response,
  statusCode: number,
  errorKey: string,
  params?: Record<string, string>
): void {
  const locale = (res.req as Request).locale || DEFAULT_LOCALE;
  const message = getLocalizedError(errorKey, locale, params);

  res.status(statusCode).json({
    error: errorKey,
    message,
    locale,
  });
}

// ─── Detection ──────────────────────────────────────────────

/**
 * Detect locale from request sources:
 * 1. Query parameter (?lang=es)
 * 2. Custom header (X-Locale)
 * 3. Accept-Language header
 * 4. Default locale
 */
function detectLocale(req: Request): string {
  // 1. Query parameter
  const queryLang = req.query.lang as string;
  if (queryLang && isSupported(queryLang)) {
    return queryLang;
  }

  // 2. Custom header
  const headerLocale = req.headers['x-locale'] as string;
  if (headerLocale && isSupported(headerLocale)) {
    return headerLocale;
  }

  // 3. Accept-Language header
  const acceptLanguage = req.headers['accept-language'];
  if (acceptLanguage) {
    const parsed = parseAcceptLanguage(acceptLanguage);
    for (const lang of parsed) {
      if (isSupported(lang)) return lang;
      // Try base language (e.g., en-US → en)
      const base = lang.split('-')[0];
      if (isSupported(base)) return base;
    }
  }

  // 4. Default
  return DEFAULT_LOCALE;
}

/**
 * Parse Accept-Language header into sorted list of language codes.
 */
function parseAcceptLanguage(header: string): string[] {
  return header
    .split(',')
    .map((part) => {
      const [lang, quality] = part.trim().split(';q=');
      return {
        lang: lang.trim().toLowerCase(),
        quality: quality ? parseFloat(quality) : 1,
      };
    })
    .sort((a, b) => b.quality - a.quality)
    .map((item) => item.lang);
}

function isSupported(locale: string): boolean {
  return SUPPORTED_LOCALES.includes(locale.toLowerCase() as SupportedLocale);
}

export default localizationMiddleware;
