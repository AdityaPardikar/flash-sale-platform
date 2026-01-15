import * as authController from '../controllers/authController';
import { authService } from '../services/authService';

// Mock functions
jest.mock('../services/authService');
jest.mock('../utils/database');

describe('Auth Controller', () => {
  let req: any;
  let res: any;

  beforeEach(() => {
    req = {
      body: {},
      user: null,
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('register', () => {
    it('should register user successfully', async () => {
      req.body = {
        email: 'test@example.com',
        username: 'testuser',
        password: 'password123',
      };

      (authService.register as jest.Mock).mockResolvedValue({
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
        created_at: new Date(),
      });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalled();
    });

    it('should fail without required fields', async () => {
      req.body = {
        email: 'test@example.com',
      };

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('login', () => {
    it('should login user successfully', async () => {
      req.body = {
        email: 'test@example.com',
        password: 'password123',
      };

      (authService.login as jest.Mock).mockResolvedValue({
        user: { id: '123', email: 'test@example.com', username: 'testuser' },
        accessToken: 'token',
        refreshToken: 'refresh',
      });

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalled();
    });
  });
});
