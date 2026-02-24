// ============================================
// Flash Sale Platform - Environment Validator
// Week 7 Day 1: Docker Production Optimization
// ============================================
// Validates all required environment variables at startup
// Fails fast with clear error messages for missing config
// ============================================

interface EnvRule {
  key: string;
  required: boolean;
  default?: string;
  validator?: (value: string) => boolean;
  description: string;
  sensitive?: boolean;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  loaded: Record<string, string>;
}

const ENV_RULES: EnvRule[] = [
  // ── Application ──
  {
    key: 'NODE_ENV',
    required: false,
    default: 'development',
    validator: (v) => ['development', 'staging', 'production', 'test'].includes(v),
    description: 'Application environment',
  },
  {
    key: 'PORT',
    required: false,
    default: '3000',
    validator: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n > 0 && n <= 65535;
    },
    description: 'Server port',
  },
  {
    key: 'LOG_LEVEL',
    required: false,
    default: 'info',
    validator: (v) => ['error', 'warn', 'info', 'debug', 'trace'].includes(v),
    description: 'Logging level',
  },

  // ── Database ──
  {
    key: 'DB_HOST',
    required: false,
    default: 'localhost',
    description: 'Database host',
  },
  {
    key: 'DB_PORT',
    required: false,
    default: '5432',
    validator: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n > 0 && n <= 65535;
    },
    description: 'Database port',
  },
  {
    key: 'DB_NAME',
    required: false,
    default: 'flash_sale_db',
    description: 'Database name',
  },
  {
    key: 'DB_USER',
    required: false,
    default: 'flash_user',
    description: 'Database user',
  },
  {
    key: 'DB_PASSWORD',
    required: false,
    default: 'flash_password',
    sensitive: true,
    description: 'Database password',
  },

  // ── Redis ──
  {
    key: 'REDIS_HOST',
    required: false,
    default: 'localhost',
    description: 'Redis host',
  },
  {
    key: 'REDIS_PORT',
    required: false,
    default: '6379',
    validator: (v) => {
      const n = parseInt(v, 10);
      return !isNaN(n) && n > 0 && n <= 65535;
    },
    description: 'Redis port',
  },

  // ── Auth ──
  {
    key: 'JWT_SECRET',
    required: true,
    sensitive: true,
    validator: (v) => v.length >= 16,
    description: 'JWT signing secret (min 16 chars)',
  },

  // ── CORS ──
  {
    key: 'CORS_ORIGIN',
    required: false,
    default: 'http://localhost',
    description: 'CORS allowed origin',
  },
];

/**
 * Validates environment variables against defined rules.
 * Call this early in the application startup to fail fast.
 */
export function validateEnvironment(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const loaded: Record<string, string> = {};

  for (const rule of ENV_RULES) {
    const value = process.env[rule.key];

    if (!value && rule.required) {
      errors.push(`Missing required env var: ${rule.key} - ${rule.description}`);
      continue;
    }

    if (!value && rule.default) {
      process.env[rule.key] = rule.default;
      loaded[rule.key] = rule.sensitive ? '***' : rule.default;
      continue;
    }

    if (value && rule.validator && !rule.validator(value)) {
      errors.push(
        `Invalid value for ${rule.key}: ${rule.sensitive ? '***' : value} - ${rule.description}`
      );
      continue;
    }

    if (value) {
      loaded[rule.key] = rule.sensitive ? '***' : value;
    }
  }

  // Production-specific warnings
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') {
    if (process.env.JWT_SECRET === 'your-super-secret-jwt-key') {
      errors.push('JWT_SECRET must be changed from default in production');
    }
    if (process.env.DB_PASSWORD === 'flash_password') {
      warnings.push('DB_PASSWORD is using default value - change for production');
    }
    if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN === 'http://localhost') {
      warnings.push('CORS_ORIGIN should be set to your production domain');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    loaded,
  };
}

/**
 * Validates environment and logs results.
 * Throws in production if validation fails.
 */
export function validateAndReport(): void {
  const result = validateEnvironment();
  const env = process.env.NODE_ENV || 'development';

  if (result.warnings.length > 0) {
    console.warn('\n⚠️  Environment Warnings:');
    result.warnings.forEach((w) => console.warn(`   - ${w}`));
  }

  if (!result.valid) {
    console.error('\n❌ Environment Validation Failed:');
    result.errors.forEach((e) => console.error(`   - ${e}`));

    if (env === 'production') {
      throw new Error(
        `Environment validation failed with ${result.errors.length} error(s). Fix before starting.`
      );
    } else {
      console.warn('\n⚠️  Continuing in development mode despite validation errors.\n');
    }
  } else {
    console.log(`\n✅ Environment validated (${env})`);
    console.log(`   Loaded ${Object.keys(result.loaded).length} configuration values\n`);
  }
}

/**
 * Returns the current environment name.
 */
export function getEnvironment(): string {
  return process.env.NODE_ENV || 'development';
}

/**
 * Checks if running in production.
 */
export function isProduction(): boolean {
  return getEnvironment() === 'production';
}

/**
 * Checks if running in development.
 */
export function isDevelopment(): boolean {
  return getEnvironment() === 'development';
}

/**
 * Gets a config value with a fallback default.
 */
export function getConfig(key: string, fallback?: string): string {
  const value = process.env[key];
  if (value !== undefined) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required configuration: ${key}`);
}
