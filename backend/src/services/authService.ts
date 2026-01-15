import { query } from '../utils/database';
import { hashPassword, comparePassword, generateRandomId } from '../utils/helpers';
import { generateToken, generateRefreshToken } from '../utils/jwt';
import { setSession, deleteSession } from '../utils/redisOperations';

export interface RegisterData {
  id: string;
  email: string;
  username: string;
  created_at: Date;
}

export interface LoginData {
  user: {
    id: string;
    email: string;
    username: string;
  };
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  async register(email: string, username: string, password: string): Promise<RegisterData> {
    // Validate input
    if (!email || !username || !password) {
      throw new Error('Email, username, and password are required');
    }

    // Check if user exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [
      email,
      username,
    ]);

    if (existingUser.rows.length > 0) {
      throw new Error('User with this email or username already exists');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const userId = generateRandomId();
    const result = await query(
      'INSERT INTO users (id, email, username, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, email, username, created_at',
      [userId, email, username, passwordHash]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create user');
    }

    return result.rows[0];
  }

  async login(email: string, password: string): Promise<LoginData> {
    // Validate input
    if (!email || !password) {
      throw new Error('Email and password are required');
    }

    // Find user
    const result = await query('SELECT id, email, username, password_hash FROM users WHERE email = $1', [
      email,
    ]);

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0];

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    // Generate tokens
    const accessToken = generateToken({
      userId: user.id,
      email: user.email,
    });

    const refreshToken = generateRefreshToken(user.id);

    // Store session in Redis
    await setSession(user.id, accessToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      accessToken,
      refreshToken,
    };
  }

  async validateUser(userId: string) {
    const result = await query('SELECT id, email, username FROM users WHERE id = $1', [userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  }

  async logout(userId: string): Promise<void> {
    await deleteSession(userId);
  }

  async refreshToken(userId: string, refreshToken: string): Promise<string> {
    // Validate refresh token would be implemented here
    const accessToken = generateToken({
      userId,
      email: 'user@example.com', // Would fetch from DB
    });

    await setSession(userId, accessToken);
    return accessToken;
  }
}

export const authService = new AuthService();
