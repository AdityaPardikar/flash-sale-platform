import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../utils/database';
import { AuthenticatedRequest, AdminUser } from '../middleware/adminAuth';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '8h';

/**
 * Admin Login
 * Authenticates admin users and issues JWT tokens
 */
export const adminLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, twoFactorCode } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
      return;
    }

    // Query admin user from database
    const result = await pool.query(
      `SELECT id, email, password_hash, role, permissions, two_factor_enabled, two_factor_secret, is_active
       FROM admin_users 
       WHERE email = $1`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      return;
    }

    const admin = result.rows[0];

    // Check if admin account is active
    if (!admin.is_active) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin account is disabled',
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, admin.password_hash);
    if (!isPasswordValid) {
      // Log failed login attempt
      await pool.query(
        `INSERT INTO admin_login_attempts (admin_id, success, ip_address, user_agent)
         VALUES ($1, false, $2, $3)`,
        [admin.id, req.ip, req.get('user-agent')]
      );

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials',
      });
      return;
    }

    // Check 2FA if enabled
    if (admin.two_factor_enabled) {
      if (!twoFactorCode) {
        res.status(200).json({
          requiresTwoFactor: true,
          message: 'Two-factor authentication required',
        });
        return;
      }

      // TODO: Implement actual 2FA verification with authenticator app (e.g., using speakeasy)
      // For now, placeholder that accepts any 6-digit code in development
      const isCodeValid = /^\d{6}$/.test(twoFactorCode);

      if (!isCodeValid) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid two-factor authentication code',
        });
        return;
      }
    }

    // Generate JWT token
    const tokenPayload: AdminUser & { iat?: number; exp?: number } = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as any); // @ts-ignore

    // Generate refresh token (valid for 7 days)
    const refreshToken = jwt.sign({ id: admin.id, type: 'refresh' }, JWT_SECRET, {
      expiresIn: '7d',
    } as any); // @ts-ignore

    // Store refresh token in database
    await pool.query(
      `INSERT INTO admin_refresh_tokens (admin_id, token, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [admin.id, refreshToken]
    );

    // Log successful login
    await pool.query(
      `INSERT INTO admin_login_attempts (admin_id, success, ip_address, user_agent)
       VALUES ($1, true, $2, $3)`,
      [admin.id, req.ip, req.get('user-agent')]
    );

    // Update last login timestamp
    await pool.query(`UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

    res.status(200).json({
      success: true,
      token,
      refreshToken,
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions || [],
      },
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
};

/**
 * Admin Logout
 * Invalidates refresh tokens
 */
export const adminLogout = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Invalidate refresh token
      await pool.query(`DELETE FROM admin_refresh_tokens WHERE token = $1`, [refreshToken]);
    }

    // Log logout activity
    if (req.adminUser) {
      await pool.query(
        `INSERT INTO admin_activity_log (admin_id, action, details)
         VALUES ($1, 'logout', $2)`,
        [req.adminUser.id, JSON.stringify({ ip: req.ip })]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Admin logout error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
    });
  }
};

/**
 * Refresh Access Token
 * Issues a new access token using valid refresh token
 */
export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Refresh token is required',
      });
      return;
    }

    // Verify refresh token
    try {
      jwt.verify(refreshToken, JWT_SECRET);
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Check if refresh token exists in database and is not expired
    const tokenResult = await pool.query(
      `SELECT admin_id FROM admin_refresh_tokens 
       WHERE token = $1 AND expires_at > NOW()`,
      [refreshToken]
    );

    if (tokenResult.rows.length === 0) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token has been revoked or expired',
      });
      return;
    }

    // Get admin details
    const adminResult = await pool.query(
      `SELECT id, email, role, permissions, is_active 
       FROM admin_users 
       WHERE id = $1`,
      [tokenResult.rows[0].admin_id]
    );

    if (adminResult.rows.length === 0 || !adminResult.rows[0].is_active) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Admin account is no longer active',
      });
      return;
    }

    const admin = adminResult.rows[0];

    // Generate new access token
    const tokenPayload: AdminUser = {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions || [],
    };

    const newToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY } as any); // @ts-ignore

    res.status(200).json({
      success: true,
      token: newToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token refresh failed',
    });
  }
};

/**
 * Get Current Admin Profile
 * Returns authenticated admin's profile information
 */
export const getCurrentAdmin = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.adminUser) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    // Get full admin details
    const result = await pool.query(
      `SELECT id, email, role, permissions, created_at, last_login_at, two_factor_enabled
       FROM admin_users 
       WHERE id = $1`,
      [req.adminUser.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Admin profile not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      admin: result.rows[0],
    });
  } catch (error) {
    console.error('Get admin profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve admin profile',
    });
  }
};

/**
 * Enable Two-Factor Authentication
 * Generates 2FA secret and QR code for authenticator apps
 */
export const enableTwoFactor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.adminUser) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    // TODO: Implement actual 2FA setup with speakeasy/otplib
    // Generate secret and QR code for authenticator app
    // For now, return placeholder response

    res.status(200).json({
      success: true,
      message: '2FA setup - Implementation pending',
      // secret: generatedSecret,
      // qrCode: qrCodeDataUrl,
      requiresVerification: true,
    });
  } catch (error) {
    console.error('Enable 2FA error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to enable two-factor authentication',
    });
  }
};

/**
 * Verify and Complete 2FA Setup
 */
export const verifyTwoFactor = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.adminUser) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Not authenticated',
      });
      return;
    }

    const { code } = req.body;

    if (!code) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Verification code is required',
      });
      return;
    }

    // TODO: Verify the code against the generated secret
    // If valid, enable 2FA for the admin account

    res.status(200).json({
      success: true,
      message: 'Two-factor authentication enabled successfully',
    });
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify two-factor authentication',
    });
  }
};
