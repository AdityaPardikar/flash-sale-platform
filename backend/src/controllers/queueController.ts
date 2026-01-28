import { Request, Response } from 'express';
import { queueService } from '../services/queueService';
import { queueEntryManager } from '../services/queueEntryManager';

/**
 * Join a flash sale queue
 */
export const joinQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = (req as Request & { userId?: string }).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    // Check if user is already in queue
    const isAlreadyInQueue = await queueService.isInQueue(userId, saleId);
    if (isAlreadyInQueue) {
      // Return current position instead of error
      const position = await queueService.getQueuePosition(userId, saleId);
      res.status(200).json({
        success: true,
        message: 'Already in queue',
        data: position,
      });
      return;
    }

    // Join queue
    const position = await queueService.joinQueue(userId, saleId);

    res.status(201).json({
      success: true,
      message: 'Successfully joined queue',
      data: position,
    });
  } catch (error) {
    console.error('Error in joinQueue:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to join queue',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Leave a flash sale queue
 */
export const leaveQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = (req as Request & { userId?: string }).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const success = await queueService.leaveQueue(userId, saleId);

    if (!success) {
      res.status(404).json({
        success: false,
        message: 'Not in queue',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Successfully left queue',
    });
  } catch (error) {
    console.error('Error in leaveQueue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to leave queue',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get user's position in queue
 */
export const getPosition = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const userId = (req as Request & { userId?: string }).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const position = await queueService.getQueuePosition(userId, saleId);

    res.status(200).json({
      success: true,
      data: position,
    });
  } catch (error) {
    console.error('Error in getPosition:', error);

    if (error instanceof Error && error.message === 'User not in queue') {
      res.status(404).json({
        success: false,
        message: 'Not in queue',
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to get position',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get queue statistics
 */
export const getQueueStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;

    // Get Redis queue stats
    const redisStats = await queueService.getQueueStats(saleId);

    // Get database queue stats
    const dbStats = await queueEntryManager.getQueueStats(saleId);

    res.status(200).json({
      success: true,
      data: {
        ...redisStats,
        history: dbStats,
      },
    });
  } catch (error) {
    console.error('Error in getQueueStats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue stats',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get queue length
 */
export const getQueueLength = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;

    const length = await queueService.getQueueLength(saleId);

    res.status(200).json({
      success: true,
      data: {
        length,
      },
    });
  } catch (error) {
    console.error('Error in getQueueLength:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue length',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get all users in queue (Admin only)
 */
export const getAllQueueUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 100;

    const users = await queueService.getAllQueueUsers(saleId, limit);

    res.status(200).json({
      success: true,
      data: users,
      count: users.length,
    });
  } catch (error) {
    console.error('Error in getAllQueueUsers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queue users',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Clear entire queue (Admin only)
 */
export const clearQueue = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;

    const count = await queueService.clearQueue(saleId);

    res.status(200).json({
      success: true,
      message: `Cleared ${count} users from queue`,
      data: {
        clearedCount: count,
      },
    });
  } catch (error) {
    console.error('Error in clearQueue:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear queue',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Get current user's queues
 */
export const getMyQueues = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as Request & { userId?: string }).userId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const queues = await queueEntryManager.getUserQueueHistory(userId, 10);

    res.status(200).json({
      success: true,
      data: queues,
      count: queues.length,
    });
  } catch (error) {
    console.error('Error in getMyQueues:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get queues',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Admit next batch from queue (Admin only)
 */
export const admitNextBatch = async (req: Request, res: Response): Promise<void> => {
  try {
    const { saleId } = req.params;
    const batchSize = req.body.batchSize ? parseInt(req.body.batchSize, 10) : undefined;

    const admittedUsers = await queueService.admitNextBatch(saleId, batchSize);

    res.status(200).json({
      success: true,
      message: `Admitted ${admittedUsers.length} users`,
      data: {
        admittedUsers,
        count: admittedUsers.length,
      },
    });
  } catch (error) {
    console.error('Error in admitNextBatch:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to admit batch',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};
