/**
 * Security Headers Middleware
 * Day 7: Security Hardening & Audit System
 * Implements security headers similar to Helmet.js
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Security headers configuration options
 */
export interface SecurityHeadersOptions {
  // Content Security Policy
  contentSecurityPolicy?: boolean | {
    directives?: Record<string, string[]>;
  };
  
  // X-Frame-Options
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  
  // X-Content-Type-Options
  noSniff?: boolean;
  
  // X-XSS-Protection
  xssFilter?: boolean;
  
  // Strict-Transport-Security
  hsts?: boolean | {
    maxAge?: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  
  // Referrer-Policy
  referrerPolicy?: string | false;
  
  // Permissions-Policy
  permissionsPolicy?: Record<string, string[]> | false;
  
  // X-DNS-Prefetch-Control
  dnsPrefetchControl?: boolean;
  
  // X-Download-Options
  ieNoOpen?: boolean;
  
  // X-Permitted-Cross-Domain-Policies
  crossDomainPolicies?: 'none' | 'master-only' | 'by-content-type' | 'all' | false;
  
  // Origin-Agent-Cluster
  originAgentCluster?: boolean;
  
  // Cross-Origin headers
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false;
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false;
}

/**
 * Default security headers configuration
 */
const defaultOptions: SecurityHeadersOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'", 'https:', 'data:'],
      connectSrc: ["'self'", 'wss:', 'ws:'],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  frameOptions: 'DENY',
  noSniff: true,
  xssFilter: true,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
    bluetooth: [],
    magnetometer: [],
    accelerometer: [],
    gyroscope: [],
  },
  dnsPrefetchControl: false,
  ieNoOpen: true,
  crossDomainPolicies: 'none',
  originAgentCluster: true,
  crossOriginEmbedderPolicy: false, // Can break some resources
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
};

/**
 * Build Content-Security-Policy header value
 */
function buildCSP(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => {
      const directive = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return values.length > 0 ? `${directive} ${values.join(' ')}` : directive;
    })
    .join('; ');
}

/**
 * Build Permissions-Policy header value
 */
function buildPermissionsPolicy(policies: Record<string, string[]>): string {
  return Object.entries(policies)
    .map(([feature, allowList]) => {
      const normalizedFeature = feature.replace(/([A-Z])/g, '-$1').toLowerCase();
      if (allowList.length === 0) {
        return `${normalizedFeature}=()`;
      }
      return `${normalizedFeature}=(${allowList.join(' ')})`;
    })
    .join(', ');
}

/**
 * Security Headers Middleware
 * Apply security headers based on configuration
 */
export function securityHeaders(options: Partial<SecurityHeadersOptions> = {}) {
  const config = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction) => {
    // Content-Security-Policy
    if (config.contentSecurityPolicy) {
      const directives = typeof config.contentSecurityPolicy === 'object'
        ? config.contentSecurityPolicy.directives || {}
        : (defaultOptions.contentSecurityPolicy as any).directives;
      res.setHeader('Content-Security-Policy', buildCSP(directives));
    }

    // X-Frame-Options
    if (config.frameOptions) {
      res.setHeader('X-Frame-Options', config.frameOptions);
    }

    // X-Content-Type-Options
    if (config.noSniff) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection
    if (config.xssFilter) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Strict-Transport-Security
    if (config.hsts) {
      const hstsConfig = typeof config.hsts === 'object' ? config.hsts : {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: false,
      };
      
      let hstsValue = `max-age=${hstsConfig.maxAge}`;
      if (hstsConfig.includeSubDomains) {
        hstsValue += '; includeSubDomains';
      }
      if (hstsConfig.preload) {
        hstsValue += '; preload';
      }
      res.setHeader('Strict-Transport-Security', hstsValue);
    }

    // Referrer-Policy
    if (config.referrerPolicy) {
      res.setHeader('Referrer-Policy', config.referrerPolicy);
    }

    // Permissions-Policy
    if (config.permissionsPolicy) {
      res.setHeader('Permissions-Policy', buildPermissionsPolicy(config.permissionsPolicy));
    }

    // X-DNS-Prefetch-Control
    res.setHeader('X-DNS-Prefetch-Control', config.dnsPrefetchControl ? 'on' : 'off');

    // X-Download-Options
    if (config.ieNoOpen) {
      res.setHeader('X-Download-Options', 'noopen');
    }

    // X-Permitted-Cross-Domain-Policies
    if (config.crossDomainPolicies) {
      res.setHeader('X-Permitted-Cross-Domain-Policies', config.crossDomainPolicies);
    }

    // Origin-Agent-Cluster
    if (config.originAgentCluster) {
      res.setHeader('Origin-Agent-Cluster', '?1');
    }

    // Cross-Origin-Embedder-Policy
    if (config.crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', config.crossOriginEmbedderPolicy);
    }

    // Cross-Origin-Opener-Policy
    if (config.crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', config.crossOriginOpenerPolicy);
    }

    // Cross-Origin-Resource-Policy
    if (config.crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', config.crossOriginResourcePolicy);
    }

    // Remove powered by header
    res.removeHeader('X-Powered-By');

    next();
  };
}

/**
 * API-specific security headers (less restrictive CSP for API responses)
 */
export const apiSecurityHeaders = securityHeaders({
  contentSecurityPolicy: false, // APIs don't serve HTML
  frameOptions: 'DENY',
  noSniff: true,
  xssFilter: false, // Not applicable for API
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
  referrerPolicy: 'no-referrer',
  crossOriginResourcePolicy: 'same-origin',
});

/**
 * Strict security headers for sensitive pages
 */
export const strictSecurityHeaders = securityHeaders({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  frameOptions: 'DENY',
  crossOriginEmbedderPolicy: 'require-corp',
  crossOriginOpenerPolicy: 'same-origin',
  crossOriginResourcePolicy: 'same-origin',
});

export default securityHeaders;
