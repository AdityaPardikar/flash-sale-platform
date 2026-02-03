import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  adminLogin,
  adminLogout,
  refreshAccessToken,
  getCurrentAdmin,
} from '../../controllers/adminAuthController';
import pool from '../../utils/database';

// Mock dependencies
jest.mock('bcrypt');
jest.mock('jsonwebtoken');
jest.mock('../../utils/database', () => ({
  pool: {
    query: jest.fn(),
  },
}));
jest.mock('../../utils/config', () => ({
  JWT_SECRET: 'test-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
}));

describe('Admin Auth Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      body: {},
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
  });

  describe('adminLogin', () => {
    it('should reject login without email', async () => {
      mockRequest.body = { password: 'password123' };

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email and password are required',
      });
    });

    it('should reject login without password', async () => {
      mockRequest.body = { email: 'admin@example.com' };

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Email and password are required',
      });
    });

    it('should reject login for non-existent admin', async () => {
      mockRequest.body = { email: 'nonexistent@example.com', password: 'password123' };
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
      });
    });

    it('should reject login for inactive admin', async () => {
      mockRequest.body = { email: 'admin@example.com', password: 'password123' };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            password_hash: 'hashed',
            role: 'admin',
            is_active: false,
          },
        ],
      });

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Admin account is disabled',
      });
    });

    it('should reject login with wrong password', async () => {
      mockRequest.body = { email: 'admin@example.com', password: 'wrongpassword' };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            password_hash: 'hashed',
            role: 'admin',
            is_active: true,
          },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
      });
    });

    it('should request 2FA code if enabled', async () => {
      mockRequest.body = { email: 'admin@example.com', password: 'password123' };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            password_hash: 'hashed',
            role: 'admin',
            is_active: true,
            two_factor_enabled: true,
          },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: '2FA verification required',
        requiresTwoFactor: true,
      });
    });

    it('should successfully login without 2FA', async () => {
      mockRequest.body = { email: 'admin@example.com', password: 'password123' };
      mockRequest.headers = { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test' };

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            password_hash: 'hashed',
            role: 'admin',
            permissions: ['VIEW_ANALYTICS'],
            is_active: true,
            two_factor_enabled: false,
          },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(jwt.sign).toHaveBeenCalledTimes(2);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
          admin: {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
            permissions: ['VIEW_ANALYTICS'],
          },
        },
        message: 'Login successful',
      });
    });

    it('should successfully login with valid 2FA code', async () => {
      mockRequest.body = {
        email: 'admin@example.com',
        password: 'password123',
        twoFactorCode: '123456',
      };
      mockRequest.headers = { 'x-forwarded-for': '127.0.0.1', 'user-agent': 'test' };

      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            password_hash: 'hashed',
            role: 'admin',
            permissions: [],
            is_active: true,
            two_factor_enabled: true,
            two_factor_secret: 'secret',
          },
        ],
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (jwt.sign as jest.Mock)
        .mockReturnValueOnce('access-token')
        .mockReturnValueOnce('refresh-token');

      await adminLogin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });
  });

  describe('adminLogout', () => {
    it('should successfully logout admin', async () => {
      (mockRequest as any).adminUser = { id: 1 };
      mockRequest.body = { refreshToken: 'refresh-token' };
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await adminLogout(mockRequest as Request, mockResponse as Response);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM admin_refresh_tokens'),
        expect.any(Array)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logout successful',
      });
    });

    it('should handle logout without refresh token', async () => {
      (mockRequest as any).adminUser = { id: 1 };
      mockRequest.body = {};

      await adminLogout(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logout successful',
      });
    });
  });

  describe('refreshAccessToken', () => {
    it('should reject refresh without token', async () => {
      mockRequest.body = {};

      await refreshAccessToken(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Refresh token is required',
      });
    });

    it('should reject invalid refresh token', async () => {
      mockRequest.body = { refreshToken: 'invalid-token' };
      (jwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await refreshAccessToken(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid refresh token',
      });
    });

    it('should successfully refresh access token', async () => {
      mockRequest.body = { refreshToken: 'valid-refresh-token' };
      (jwt.verify as jest.Mock).mockReturnValue({ adminId: 1 });
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              admin_id: 1,
              token: 'valid-refresh-token',
              expires_at: new Date(Date.now() + 86400000),
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 1,
              email: 'admin@example.com',
              role: 'admin',
              permissions: [],
              is_active: true,
            },
          ],
        });
      (jwt.sign as jest.Mock).mockReturnValue('new-access-token');

      await refreshAccessToken(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          accessToken: 'new-access-token',
        },
      });
    });
  });

  describe('getCurrentAdmin', () => {
    it('should return current admin profile', async () => {
      (mockRequest as any).adminUser = { id: 1 };
      (pool.query as jest.Mock).mockResolvedValue({
        rows: [
          {
            id: 1,
            email: 'admin@example.com',
            role: 'admin',
            permissions: ['VIEW_ANALYTICS'],
            created_at: new Date(),
            last_login_at: new Date(),
          },
        ],
      });

      await getCurrentAdmin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          id: 1,
          email: 'admin@example.com',
          role: 'admin',
        }),
      });
    });

    it('should handle admin not found', async () => {
      (mockRequest as any).adminUser = { id: 999 };
      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await getCurrentAdmin(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Admin not found',
      });
    });
  });
});
