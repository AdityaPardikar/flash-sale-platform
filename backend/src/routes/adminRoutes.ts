import { Router, Request, Response } from 'express';
import { adminController } from '../controllers/adminController';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All admin routes require authentication
router.use(authMiddleware);

// Dashboard endpoints
router.get('/dashboard/overview', (req: Request, res: Response) =>
  adminController.getDashboardOverview(req, res)
);

router.get('/sales/metrics', (req: Request, res: Response) =>
  adminController.getAllSalesMetrics(req, res)
);

router.get('/sales/:saleId/metrics', (req: Request, res: Response) =>
  adminController.getLiveMetrics(req, res)
);

router.get('/sales/:saleId/queue', (req: Request, res: Response) =>
  adminController.getQueueDetails(req, res)
);

// Admin actions
router.post('/queue/remove', (req: Request, res: Response) =>
  adminController.removeFromQueue(req, res)
);

router.patch('/sales/:saleId/status', (req: Request, res: Response) =>
  adminController.updateSaleStatus(req, res)
);

// Analytics
router.get('/users/:userId/activity', (req: Request, res: Response) =>
  adminController.getUserActivityLogs(req, res)
);

router.get('/reports/performance', (req: Request, res: Response) =>
  adminController.getPerformanceReport(req, res)
);

export default router;
