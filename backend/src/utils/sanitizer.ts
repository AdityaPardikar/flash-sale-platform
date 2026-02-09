/**
 * Input Sanitizer
 * Day 7: Security Hardening & Audit System
 * Sanitize user input to prevent XSS and injection attacks
 */

/**
 * HTML entities to escape
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

/**
 * SQL injection patterns to detect
 */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|EXEC)\b)/gi,
  /(--)/g,
  /(;)/g,
  /(\b(OR|AND)\b\s+\d+\s*=\s*\d+)/gi,
  /(\bunion\b\s+\bselect\b)/gi,
];

/**
 * Escape HTML entities
 */
export function escapeHtml(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"'`=\/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(str: string): string {
  if (typeof str !== 'string') return str;
  const unescapeMap: Record<string, string> = {};
  Object.entries(HTML_ENTITIES).forEach(([char, entity]) => {
    unescapeMap[entity] = char;
  });
  
  return str.replace(/&(amp|lt|gt|quot|#x27|#x2F|#x60|#x3D);/g, (entity) => {
    return unescapeMap[entity] || entity;
  });
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Remove null bytes and other dangerous characters
 */
export function stripNullBytes(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/\0/g, '');
}

/**
 * Normalize whitespace
 */
export function normalizeWhitespace(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Detect potential SQL injection attempt
 */
export function detectSqlInjection(str: string): boolean {
  if (typeof str !== 'string') return false;
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(str));
}

/**
 * Sanitize string for safe display
 */
export function sanitizeString(str: string, options: {
  escapeHtml?: boolean;
  stripHtml?: boolean;
  normalizeWhitespace?: boolean;
  maxLength?: number;
} = {}): string {
  if (typeof str !== 'string') return '';
  
  const {
    escapeHtml: doEscapeHtml = true,
    stripHtml: doStripHtml = false,
    normalizeWhitespace: doNormalizeWhitespace = true,
    maxLength,
  } = options;

  let result = str;

  // Remove null bytes
  result = stripNullBytes(result);

  // Strip or escape HTML
  if (doStripHtml) {
    result = stripHtml(result);
  } else if (doEscapeHtml) {
    result = escapeHtml(result);
  }

  // Normalize whitespace
  if (doNormalizeWhitespace) {
    result = normalizeWhitespace(result);
  }

  // Truncate if needed
  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength);
  }

  return result;
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  
  return email
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '')
    .substring(0, 254); // Max email length
}

/**
 * Sanitize phone number - keep only digits and allowed characters
 */
export function sanitizePhone(phone: string): string {
  if (typeof phone !== 'string') return '';
  return phone.replace(/[^\d+\-\s()]/g, '').trim();
}

/**
 * Sanitize URL
 */
export function sanitizeUrl(url: string): string {
  if (typeof url !== 'string') return '';
  
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

/**
 * Sanitize filename - remove path traversal characters
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== 'string') return '';
  
  return filename
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim();
}

/**
 * Sanitize object recursively
 */
export function sanitizeObject<T extends object>(obj: T, options: {
  escapeHtml?: boolean;
  stripHtml?: boolean;
  maxStringLength?: number;
  allowedFields?: string[];
  excludeFields?: string[];
  maxDepth?: number;
} = {}): T {
  const {
    escapeHtml: doEscapeHtml = true,
    stripHtml: doStripHtml = false,
    maxStringLength,
    allowedFields,
    excludeFields = [],
    maxDepth = 10,
  } = options;

  function sanitize(value: any, depth: number): any {
    if (depth > maxDepth) {
      return null;
    }

    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return sanitizeString(value, {
        escapeHtml: doEscapeHtml,
        stripHtml: doStripHtml,
        maxLength: maxStringLength,
      });
    }

    if (Array.isArray(value)) {
      return value.map(item => sanitize(item, depth + 1));
    }

    if (typeof value === 'object') {
      const sanitized: Record<string, any> = {};
      
      for (const [key, val] of Object.entries(value)) {
        // Skip excluded fields
        if (excludeFields.includes(key)) continue;
        
        // Only include allowed fields if specified
        if (allowedFields && !allowedFields.includes(key)) continue;
        
        sanitized[key] = sanitize(val, depth + 1);
      }
      
      return sanitized;
    }

    return value;
  }

  return sanitize(obj, 0) as T;
}

/**
 * Sanitize query parameters
 */
export function sanitizeQuery(query: Record<string, any>): Record<string, any> {
  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(query)) {
    // Sanitize key
    const sanitizedKey = sanitizeString(key, { maxLength: 100 });
    
    // Sanitize value
    if (typeof value === 'string') {
      sanitized[sanitizedKey] = sanitizeString(value, { maxLength: 1000 });
    } else if (Array.isArray(value)) {
      sanitized[sanitizedKey] = value.map(v => 
        typeof v === 'string' ? sanitizeString(v, { maxLength: 1000 }) : v
      );
    } else {
      sanitized[sanitizedKey] = value;
    }
  }

  return sanitized;
}

/**
 * Create safe JSON parse function
 */
export function safeJsonParse<T = any>(json: string, defaultValue?: T): T | undefined {
  try {
    const parsed = JSON.parse(json);
    // Prevent prototype pollution
    if (parsed && typeof parsed === 'object') {
      delete parsed.__proto__;
      delete parsed.constructor;
      delete parsed.prototype;
    }
    return parsed;
  } catch {
    return defaultValue;
  }
}

/**
 * Remove sensitive fields from object (for logging)
 */
export function removeSensitiveFields(obj: Record<string, any>): Record<string, any> {
  const sensitiveFields = [
    'password',
    'passwordHash',
    'token',
    'accessToken',
    'refreshToken',
    'apiKey',
    'secret',
    'creditCard',
    'cardNumber',
    'cvv',
    'ssn',
    'socialSecurity',
  ];

  const sanitized: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    if (sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key] = removeSensitiveFields(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export default {
  escapeHtml,
  unescapeHtml,
  stripHtml,
  stripNullBytes,
  normalizeWhitespace,
  detectSqlInjection,
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeUrl,
  sanitizeFilename,
  sanitizeObject,
  sanitizeQuery,
  safeJsonParse,
  removeSensitiveFields,
};
