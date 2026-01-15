import { Request, Response } from 'express';
import { authService } from '../services/authService';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password } = req.body;

    // Validate required fields
    if (!email || !username || !password) {
      res.status(400).json({
        error: 'Email, username, and password are required',
      });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        error: 'Invalid email format',
      });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({
        error: 'Password must be at least 6 characters long',
      });
      return;
    }

    const result = await authService.register(email, username, password);

    res.status(201).json({
      message: 'User registered successfully',
      data: {
        id: result.id,
        email: result.email,
        username: result.username,
        created_at: result.created_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    res.status(400).json({
      error: message,
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({
        error: 'Email and password are required',
      });
      return;
    }

    const result = await authService.login(email, password);

    res.json({
      message: 'Login successful',
      data: {
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    res.status(401).json({
      error: message,
    });
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        error: 'Not authenticated',
      });
      return;
    }

    await authService.logout(req.user.userId);

    res.json({
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      error: 'Logout failed',
    });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(400).json({
        error: 'Refresh token is required',
      });
      return;
    }

    if (!req.user) {
      res.status(401).json({
        error: 'Not authenticated',
      });
      return;
    }

    const accessToken = await authService.refreshToken(req.user.userId, refreshToken);

    res.json({
      message: 'Token refreshed successfully',
      data: {
        accessToken,
      },
    });
  } catch (error) {
    res.status(401).json({
      error: 'Token refresh failed',
    });
  }
}
