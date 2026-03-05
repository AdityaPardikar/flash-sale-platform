/**
 * Express Request Type Augmentation
 * Shared type declarations for authenticated requests
 */

import { TokenPayload } from '../utils/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      requestId?: string;
      startTime?: number;
    }
  }
}

export {};
