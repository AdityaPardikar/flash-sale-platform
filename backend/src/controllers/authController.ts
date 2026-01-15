import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { generateToken } from '../utils/jwt';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      res.status(400).json({
        error: 'Email, username, and password are required',
      });
      return;
    }

    const result = await authService.register(email, username, password);

    res.status(201).json({
      message: 'User registered successfully',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Registration failed',
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

    const token = generateToken({
      userId: 'temp-user-id',
      email,
    });

    res.json({
      message: 'Login successful',
      token,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Login failed',
    });
  }
}
