import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  joinQueue,
  leaveQueue,
  getPosition,
  getQueueStats,
  getQueueLength,
  getAllQueueUsers,
  clearQueue,
  getMyQueues,
  admitNextBatch,
} from '../controllers/queueController';

const router = Router();

// Public routes
router.get('/length/:saleId', getQueueLength);
router.get('/stats/:saleId', getQueueStats);

// Authenticated user routes
router.post('/join/:saleId', authenticateToken, joinQueue);
router.delete('/leave/:saleId', authenticateToken, leaveQueue);
router.get('/position/:saleId', authenticateToken, getPosition);
router.get('/my-queues', authenticateToken, getMyQueues);

// Admin routes (require authentication - in production, add admin role check)
router.get('/users/:saleId', authenticateToken, getAllQueueUsers);
router.delete('/clear/:saleId', authenticateToken, clearQueue);
router.post('/admit/:saleId', authenticateToken, admitNextBatch);

export default router;
