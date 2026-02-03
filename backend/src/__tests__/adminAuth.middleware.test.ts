import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import {
  requireAdmin,
  requireSuperAdmin,
  requirePermission,
  AdminPermission,
} from '../../middleware/adminAuth';

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../utils/config', () => ({
  JWT_SECRET: 'test-secret',
}));

describe('Admin Auth Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('requireAdmin', () => {
    it('should reject request without authorization header', () => {
      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'No token provided',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      mockRequest.headers = { authorization: 'InvalidFormat' };

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token format',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject expired tokens', () => {
      mockRequest.headers = { authorization: 'Bearer expired-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error = new Error('Token expired');
        error.name = 'TokenExpiredError';
        throw error;
      });

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired',
      });
    });

    it('should reject invalid tokens', () => {
      mockRequest.headers = { authorization: 'Bearer invalid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        const error = new Error('Invalid token');
        error.name = 'JsonWebTokenError';
        throw error;
      });

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
      });
    });

    it('should reject non-admin users', () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      (jwt.verify as jest.Mock).mockReturnValue({
        id: 1,
        email: 'user@example.com',
        role: 'user',
        permissions: [],
      });

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient permissions. Admin access required.',
      });
    });

    it('should accept admin users', () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      const adminUser = {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        permissions: [AdminPermission.VIEW_ANALYTICS],
      };
      (jwt.verify as jest.Mock).mockReturnValue(adminUser);

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockRequest as any).adminUser).toEqual(adminUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should accept super admin users', () => {
      mockRequest.headers = { authorization: 'Bearer valid-token' };
      const superAdminUser = {
        id: 1,
        email: 'superadmin@example.com',
        role: 'super_admin',
        permissions: [],
      };
      (jwt.verify as jest.Mock).mockReturnValue(superAdminUser);

      requireAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect((mockRequest as any).adminUser).toEqual(superAdminUser);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('requireSuperAdmin', () => {
    it('should reject users without adminUser', () => {
      requireSuperAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Super admin access required',
      });
    });

    it('should reject regular admin users', () => {
      (mockRequest as any).adminUser = {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        permissions: [],
      };

      requireSuperAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Super admin access required',
      });
    });

    it('should accept super admin users', () => {
      (mockRequest as any).adminUser = {
        id: 1,
        email: 'superadmin@example.com',
        role: 'super_admin',
        permissions: [],
      };

      requireSuperAdmin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    it('should reject users without adminUser', () => {
      const middleware = requirePermission(AdminPermission.CREATE_SALE);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Permission denied',
      });
    });

    it('should reject admin without required permission', () => {
      (mockRequest as any).adminUser = {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        permissions: [AdminPermission.VIEW_ANALYTICS],
      };

      const middleware = requirePermission(AdminPermission.CREATE_SALE);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: `Permission denied. Required: ${AdminPermission.CREATE_SALE}`,
      });
    });

    it('should accept admin with required permission', () => {
      (mockRequest as any).adminUser = {
        id: 1,
        email: 'admin@example.com',
        role: 'admin',
        permissions: [AdminPermission.CREATE_SALE, AdminPermission.VIEW_ANALYTICS],
      };

      const middleware = requirePermission(AdminPermission.CREATE_SALE);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should always accept super admin regardless of permissions', () => {
      (mockRequest as any).adminUser = {
        id: 1,
        email: 'superadmin@example.com',
        role: 'super_admin',
        permissions: [],
      };

      const middleware = requirePermission(AdminPermission.CREATE_SALE);
      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });
});
