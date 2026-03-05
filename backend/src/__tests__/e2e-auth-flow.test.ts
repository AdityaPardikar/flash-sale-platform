/**
 * Week 7 Day 4 — E2E Auth Flow Tests
 *
 * Validates the complete authentication lifecycle end-to-end:
 *
 *  1.  Registration with validation
 *  2.  Login returning JWT tokens
 *  3.  Token refresh flow
 *  4.  Protected route enforcement
 *  5.  Logout + token invalidation
 *  6.  Edge cases (duplicate registration, bad passwords, expired tokens)
 *
 * All external dependencies are mocked.
 */

// ─── Mock externals BEFORE imports ───────────────────────────────────────────

jest.mock('uuid', () => ({ v4: jest.fn(() => 'auth-e2e-uuid') }));
jest.mock('../utils/database');
jest.mock('../utils/redis');

jest.mock('../services/authService');

import * as authController from '../controllers/authController';
import { authService } from '../services/authService';
import { authenticateToken } from '../middleware/auth';
import { generateToken, verifyToken, generateRefreshToken } from '../utils/jwt';

import {
  buildUser,
  generateTestToken,
  generateExpiredToken,
  authHeader,
  expectErrorEnvelope,
} from './test-helpers';

const mockAuthService = authService as jest.Mocked<typeof authService>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Registration Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Registration Flow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('successful registration returns 201 with user data and no password', async () => {
    const user = buildUser();
    mockAuthService.register.mockResolvedValue({
      id: user.id,
      email: user.email,
      username: user.username,
      created_at: user.created_at,
    } as any);

    const req: any = {
      body: { email: user.email, username: user.username, password: 'StrongPass1!' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const body = json.mock.calls[0][0];
    expect(body.data).toHaveProperty('id');
    expect(body.data).toHaveProperty('email', user.email);
    expect(body.data).toHaveProperty('username', user.username);
    // SECURITY: password hash must NEVER be returned
    expect(body.data).not.toHaveProperty('password_hash');
    expect(body.data).not.toHaveProperty('password');
  });

  it('rejects registration with missing fields', async () => {
    const req: any = { body: { email: 'a@b.com' } }; // no username, no password
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body).toHaveProperty('error');
  });

  it('rejects registration with invalid email', async () => {
    const req: any = {
      body: { email: 'not-an-email', username: 'user1', password: 'StrongPass1!' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('rejects registration with short password (< 6 chars)', async () => {
    const req: any = {
      body: { email: 'a@b.com', username: 'user1', password: '12345' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('handles duplicate email gracefully', async () => {
    mockAuthService.register.mockRejectedValue(new Error('User already exists'));

    const req: any = {
      body: { email: 'dup@e.com', username: 'dupuser', password: 'Password1!' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = json.mock.calls[0][0];
    expect(body.error).toContain('already exists');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Login Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Login Flow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('successful login returns accessToken + refreshToken + user', async () => {
    const user = buildUser();
    mockAuthService.login.mockResolvedValue({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken: 'access-jwt-token',
      refreshToken: 'refresh-jwt-token',
    } as any);

    const req: any = { body: { email: user.email, password: 'Password1!' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.login(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.accessToken).toBe('access-jwt-token');
    expect(body.data.refreshToken).toBe('refresh-jwt-token');
    expect(body.data.user).toHaveProperty('email', user.email);
  });

  it('login with missing email returns 400', async () => {
    const req: any = { body: { password: 'Password1!' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('login with wrong password returns 401', async () => {
    mockAuthService.login.mockRejectedValue(new Error('Invalid credentials'));

    const req: any = { body: { email: 'a@b.com', password: 'wrong' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const body = json.mock.calls[0][0];
    expect(body.error).toContain('Invalid credentials');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Token Refresh Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Token Refresh Flow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('refreshing a valid token returns a new accessToken', async () => {
    mockAuthService.refreshToken.mockResolvedValue('new-access-jwt-token');

    const req: any = {
      body: { refreshToken: 'valid-refresh-token' },
      user: { userId: 'user-1', email: 'u@e.com' },
    };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.refreshToken(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.data.accessToken).toBe('new-access-jwt-token');
  });

  it('refresh without token returns 400', async () => {
    const req: any = { body: {}, user: { userId: 'u-1', email: 'u@e.com' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('refresh without authentication returns 401', async () => {
    const req: any = { body: { refreshToken: 'some-token' }, user: undefined };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('refresh with expired token returns 401', async () => {
    mockAuthService.refreshToken.mockRejectedValue(new Error('Token expired'));

    const req: any = {
      body: { refreshToken: 'expired-refresh-token' },
      user: { userId: 'u-1', email: 'u@e.com' },
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.refreshToken(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. JWT Token Utility Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: JWT Token Utilities', () => {
  it('generateToken → verifyToken round-trip', () => {
    const token = generateToken({ id: 'u-1', userId: 'u-1', email: 'u@e.com' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3); // header.payload.signature

    const decoded = verifyToken(token);
    expect(decoded).toHaveProperty('userId', 'u-1');
    expect(decoded).toHaveProperty('email', 'u@e.com');
  });

  it('generateRefreshToken produces a valid JWT', () => {
    const token = generateRefreshToken({ userId: 'u-2', email: 'r@e.com' });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });

  it('verifyToken rejects tampered tokens', () => {
    const token = generateToken({ id: 'u-1', userId: 'u-1', email: 'u@e.com' });
    const tampered = token.slice(0, -4) + 'XXXX';

    expect(() => verifyToken(tampered)).toThrow();
  });

  it('test helper generateTestToken works with verifyToken', () => {
    const token = generateTestToken();
    const decoded = verifyToken(token);
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('email');
  });

  it('expired test token is rejected', () => {
    const token = generateExpiredToken();
    expect(() => verifyToken(token)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Auth Middleware Integration
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Auth Middleware Integration', () => {
  it('allows request with valid Bearer token', () => {
    const token = generateToken({ id: 'u-1', userId: 'u-1', email: 'u@e.com' });
    const req: any = {
      headers: { authorization: `Bearer ${token}` },
      header: (name: string) =>
        name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
    };
    const res: any = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toHaveProperty('userId', 'u-1');
  });

  it('rejects request without Authorization header', () => {
    const req: any = {
      headers: {},
      header: () => undefined,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects request with expired token', () => {
    const token = generateExpiredToken();
    const req: any = {
      headers: { authorization: `Bearer ${token}` },
      header: (name: string) =>
        name.toLowerCase() === 'authorization' ? `Bearer ${token}` : undefined,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('rejects request with malformed Bearer format', () => {
    const req: any = {
      headers: { authorization: 'NotBearer xyz' },
      header: (name: string) =>
        name.toLowerCase() === 'authorization' ? 'NotBearer xyz' : undefined,
    };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };
    const next = jest.fn();

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Logout Flow
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Logout Flow', () => {
  beforeEach(() => jest.clearAllMocks());

  it('authenticated user can log out', async () => {
    mockAuthService.logout.mockResolvedValue(undefined as any);

    const req: any = { user: { userId: 'u-1', email: 'u@e.com' } };
    const res: any = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.logout(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain('Logged out');
    expect(mockAuthService.logout).toHaveBeenCalledWith('u-1');
  });

  it('unauthenticated user gets 401 on logout', async () => {
    const req: any = { user: undefined };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('handles service error gracefully', async () => {
    mockAuthService.logout.mockRejectedValue(new Error('Redis error'));

    const req: any = { user: { userId: 'u-1', email: 'u@e.com' } };
    const json = jest.fn();
    const res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.logout(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Full Register → Login → Access → Refresh → Logout Journey
// ─────────────────────────────────────────────────────────────────────────────

describe('E2E: Complete Auth Journey', () => {
  beforeEach(() => jest.clearAllMocks());

  it('user registers, logs in, accesses protected resource, refreshes token, logs out', async () => {
    const user = buildUser({ email: 'journey@flash.io', username: 'journeyuser' });

    // Step 1: Register
    mockAuthService.register.mockResolvedValue({
      id: user.id,
      email: user.email,
      username: user.username,
      created_at: user.created_at,
    } as any);

    let req: any = {
      body: { email: user.email, username: user.username, password: 'JourneyPass1!' },
    };
    let json = jest.fn();
    let res: any = { json, status: jest.fn().mockReturnValue({ json }) };

    await authController.register(req, res);
    expect(res.status).toHaveBeenCalledWith(201);

    // Step 2: Login
    const accessToken = generateToken({ id: user.id, userId: user.id, email: user.email });
    const refreshTkn = generateRefreshToken({ userId: user.id, email: user.email });

    mockAuthService.login.mockResolvedValue({
      user: { id: user.id, email: user.email, username: user.username },
      accessToken,
      refreshToken: refreshTkn,
    } as any);

    req = { body: { email: user.email, password: 'JourneyPass1!' } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.login(req, res);

    const loginBody = res.json.mock.calls[0][0];
    expect(loginBody.data.accessToken).toBeTruthy();
    const receivedToken = loginBody.data.accessToken;

    // Step 3: Use token for an authenticated action
    const decoded = verifyToken(receivedToken);
    expect(decoded.userId).toBe(user.id);
    expect(decoded.email).toBe(user.email);

    // Step 4: Refresh token
    mockAuthService.refreshToken.mockResolvedValue('new-access-token');

    req = {
      body: { refreshToken: refreshTkn },
      user: { userId: user.id, email: user.email },
    };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.refreshToken(req, res);

    const refreshBody = res.json.mock.calls[0][0];
    expect(refreshBody.data.accessToken).toBe('new-access-token');

    // Step 5: Logout
    mockAuthService.logout.mockResolvedValue(undefined as any);

    req = { user: { userId: user.id, email: user.email } };
    res = { json: jest.fn(), status: jest.fn().mockReturnThis() };

    await authController.logout(req, res);

    expect(res.json.mock.calls[0][0].message).toContain('Logged out');
    expect(mockAuthService.logout).toHaveBeenCalledWith(user.id);
  });
});
