/**
 * Input Validator Middleware
 * Day 7: Security Hardening & Audit System
 * Request validation with schema-based approach
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Validation error structure
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Field validation rules
 */
export interface FieldValidator {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'uuid' | 'date';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any, field: string) => string | null;
  sanitize?: boolean;
  arrayOf?: FieldValidator;
  properties?: Record<string, FieldValidator>;
}

/**
 * Validation schema
 */
export interface ValidationSchema {
  body?: Record<string, FieldValidator>;
  query?: Record<string, FieldValidator>;
  params?: Record<string, FieldValidator>;
}

// Email regex pattern
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// UUID regex pattern
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ISO Date regex pattern
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Validate a single value against rules
 */
function validateField(
  value: any, 
  fieldName: string, 
  rules: FieldValidator
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required
  if (rules.required && (value === undefined || value === null || value === '')) {
    errors.push({
      field: fieldName,
      message: `${fieldName} is required`,
    });
    return errors;
  }

  // Skip further validation if value is empty and not required
  if (value === undefined || value === null || value === '') {
    return errors;
  }

  // Type validation
  if (rules.type) {
    let typeValid = false;
    switch (rules.type) {
      case 'string':
        typeValid = typeof value === 'string';
        break;
      case 'number':
        typeValid = typeof value === 'number' || !isNaN(Number(value));
        break;
      case 'boolean':
        typeValid = typeof value === 'boolean' || value === 'true' || value === 'false';
        break;
      case 'array':
        typeValid = Array.isArray(value);
        break;
      case 'object':
        typeValid = typeof value === 'object' && !Array.isArray(value);
        break;
      case 'email':
        typeValid = typeof value === 'string' && EMAIL_REGEX.test(value);
        if (!typeValid) {
          errors.push({ field: fieldName, message: `${fieldName} must be a valid email` });
          return errors;
        }
        break;
      case 'uuid':
        typeValid = typeof value === 'string' && UUID_REGEX.test(value);
        if (!typeValid) {
          errors.push({ field: fieldName, message: `${fieldName} must be a valid UUID` });
          return errors;
        }
        break;
      case 'date':
        typeValid = value instanceof Date || (typeof value === 'string' && ISO_DATE_REGEX.test(value));
        if (!typeValid) {
          errors.push({ field: fieldName, message: `${fieldName} must be a valid date` });
          return errors;
        }
        break;
    }
    
    if (!typeValid && rules.type !== 'email' && rules.type !== 'uuid' && rules.type !== 'date') {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be of type ${rules.type}`,
      });
      return errors;
    }
  }

  // String validations
  if (typeof value === 'string') {
    if (rules.minLength !== undefined && value.length < rules.minLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at least ${rules.minLength} characters`,
      });
    }
    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at most ${rules.maxLength} characters`,
      });
    }
    if (rules.pattern && !rules.pattern.test(value)) {
      errors.push({
        field: fieldName,
        message: `${fieldName} has invalid format`,
      });
    }
  }

  // Number validations
  const numValue = typeof value === 'number' ? value : Number(value);
  if (!isNaN(numValue)) {
    if (rules.min !== undefined && numValue < rules.min) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at least ${rules.min}`,
      });
    }
    if (rules.max !== undefined && numValue > rules.max) {
      errors.push({
        field: fieldName,
        message: `${fieldName} must be at most ${rules.max}`,
      });
    }
  }

  // Enum validation
  if (rules.enum && !rules.enum.includes(value)) {
    errors.push({
      field: fieldName,
      message: `${fieldName} must be one of: ${rules.enum.join(', ')}`,
    });
  }

  // Array item validation
  if (Array.isArray(value) && rules.arrayOf) {
    value.forEach((item, index) => {
      const itemErrors = validateField(item, `${fieldName}[${index}]`, rules.arrayOf!);
      errors.push(...itemErrors);
    });
  }

  // Object properties validation
  if (rules.properties && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(rules.properties).forEach(([propName, propRules]) => {
      const propErrors = validateField(value[propName], `${fieldName}.${propName}`, propRules);
      errors.push(...propErrors);
    });
  }

  // Custom validation
  if (rules.custom) {
    const customError = rules.custom(value, fieldName);
    if (customError) {
      errors.push({
        field: fieldName,
        message: customError,
      });
    }
  }

  return errors;
}

/**
 * Validate request data against schema
 */
function validateData(
  data: Record<string, any>, 
  schema: Record<string, FieldValidator>
): ValidationError[] {
  const errors: ValidationError[] = [];

  Object.entries(schema).forEach(([fieldName, rules]) => {
    const fieldErrors = validateField(data[fieldName], fieldName, rules);
    errors.push(...fieldErrors);
  });

  return errors;
}

/**
 * Input validator middleware factory
 */
export function inputValidator(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const allErrors: ValidationError[] = [];

    // Validate body
    if (schema.body) {
      const bodyErrors = validateData(req.body || {}, schema.body);
      allErrors.push(...bodyErrors);
    }

    // Validate query params
    if (schema.query) {
      const queryErrors = validateData(req.query || {}, schema.query);
      allErrors.push(...queryErrors);
    }

    // Validate URL params
    if (schema.params) {
      const paramsErrors = validateData(req.params || {}, schema.params);
      allErrors.push(...paramsErrors);
    }

    if (allErrors.length > 0) {
      logger.warn('Validation failed', {
        path: req.path,
        method: req.method,
        errors: allErrors,
      });

      return res.status(400).json({
        error: 'Validation Error',
        message: 'Request validation failed',
        details: allErrors,
      });
    }

    next();
  };
}

/**
 * Common validation schemas
 */
export const commonSchemas = {
  // Pagination
  pagination: {
    query: {
      page: { type: 'number' as const, min: 1 },
      limit: { type: 'number' as const, min: 1, max: 100 },
    },
  },

  // ID parameter
  idParam: {
    params: {
      id: { required: true, type: 'uuid' as const },
    },
  },

  // User login
  login: {
    body: {
      email: { required: true, type: 'email' as const },
      password: { required: true, type: 'string' as const, minLength: 1 },
    },
  },

  // User registration
  register: {
    body: {
      email: { required: true, type: 'email' as const },
      password: { required: true, type: 'string' as const, minLength: 8, maxLength: 128 },
      name: { required: true, type: 'string' as const, minLength: 1, maxLength: 100 },
    },
  },

  // Queue join
  queueJoin: {
    body: {
      flashSaleId: { required: true, type: 'uuid' as const },
    },
  },

  // Order create
  orderCreate: {
    body: {
      flashSaleId: { required: true, type: 'uuid' as const },
      quantity: { required: true, type: 'number' as const, min: 1, max: 10 },
    },
  },

  // Product create/update
  product: {
    body: {
      name: { required: true, type: 'string' as const, minLength: 1, maxLength: 200 },
      description: { type: 'string' as const, maxLength: 2000 },
      price: { required: true, type: 'number' as const, min: 0 },
      inventory: { required: true, type: 'number' as const, min: 0 },
    },
  },

  // Flash sale create
  flashSale: {
    body: {
      productId: { required: true, type: 'uuid' as const },
      startTime: { required: true, type: 'date' as const },
      endTime: { required: true, type: 'date' as const },
      discountPercent: { type: 'number' as const, min: 0, max: 100 },
      maxQuantity: { type: 'number' as const, min: 1 },
    },
  },
};

export default inputValidator;
