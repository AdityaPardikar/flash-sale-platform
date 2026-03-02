/**
 * Deployment & Release Management Routes
 * Week 7 Day 6: Deployment Dashboard & Release Management
 *
 * Provides REST endpoints for deployment status, environment health,
 * build pipeline data, release history, and rollback operations.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth';
import deploymentService, {
  Environment,
  DeploymentStatus,
  BuildStage,
} from '../services/deploymentService';

const router = Router();

// ─── Public endpoints ────────────────────────────────────────────────────────

/**
 * @route   GET /api/v1/deployments/version
 * @desc    Get current build/version info
 * @access  Public
 */
router.get('/version', (_req: Request, res: Response) => {
  const info = deploymentService.getBuildInfo();
  res.json({ success: true, data: info });
});

// ─── Authenticated endpoints (Admin) ─────────────────────────────────────────

/**
 * @route   GET /api/v1/deployments
 * @desc    List deployments with optional filters
 * @access  Private (Admin)
 * @query   environment, status, limit, offset, from, to
 */
router.get('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { environment, status, limit, offset, from, to } = req.query;

    const result = await deploymentService.listDeployments({
      environment: environment as Environment | undefined,
      status: status as DeploymentStatus | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
      from: from as string | undefined,
      to: to as string | undefined,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/deployments/stats
 * @desc    Get aggregate deployment statistics
 * @access  Private (Admin)
 * @query   days (default: 30)
 */
router.get('/stats', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const stats = await deploymentService.getDeploymentStats(days);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/v1/deployments/environments
 * @desc    Get health status of all environments
 * @access  Private (Admin)
 */
router.get(
  '/environments',
  authenticateToken,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const statuses = await deploymentService.getEnvironmentStatuses();
      res.json({ success: true, data: statuses });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/deployments/environments/:env
 * @desc    Get health status of a specific environment
 * @access  Private (Admin)
 */
router.get(
  '/environments/:env',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const env = req.params.env as Environment;
      if (!['development', 'staging', 'production'].includes(env)) {
        return res.status(400).json({ success: false, error: 'Invalid environment' });
      }

      const status = await deploymentService.getEnvironmentStatus(env);
      if (!status) {
        return res.status(404).json({ success: false, error: 'Environment not found' });
      }

      res.json({ success: true, data: status });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/deployments/environments/compare
 * @desc    Compare two environments side by side
 * @access  Private (Admin)
 * @query   envA, envB
 */
router.get(
  '/compare',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const envA = req.query.envA as Environment;
      const envB = req.query.envB as Environment;

      if (!envA || !envB) {
        return res
          .status(400)
          .json({ success: false, error: 'envA and envB query params required' });
      }

      const comparison = await deploymentService.compareEnvironments(envA, envB);
      res.json({ success: true, data: comparison });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/deployments/releases
 * @desc    List release history
 * @access  Private (Admin)
 * @query   limit, offset
 */
router.get(
  '/releases',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : 0;
      const result = await deploymentService.listReleases(limit, offset);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/deployments/releases/:id
 * @desc    Get a specific release
 * @access  Private (Admin)
 */
router.get(
  '/releases/:id',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const release = await deploymentService.getRelease(req.params.id);
      if (!release) {
        return res.status(404).json({ success: false, error: 'Release not found' });
      }
      res.json({ success: true, data: release });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   POST /api/v1/deployments/releases
 * @desc    Create a new release
 * @access  Private (Admin)
 */
router.post(
  '/releases',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { version, tag, title, description, changelog } = req.body;

      if (!version || !tag || !title) {
        return res
          .status(400)
          .json({ success: false, error: 'version, tag, and title are required' });
      }

      const release = await deploymentService.createRelease({
        version,
        tag,
        title,
        description: description || '',
        changelog: changelog || [],
        createdBy: req.user?.userId || 'unknown',
      });

      res.status(201).json({ success: true, data: release });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   GET /api/v1/deployments/:id
 * @desc    Get a specific deployment
 * @access  Private (Admin)
 */
router.get('/:id', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const deployment = await deploymentService.getDeployment(req.params.id);
    if (!deployment) {
      return res.status(404).json({ success: false, error: 'Deployment not found' });
    }
    res.json({ success: true, data: deployment });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/v1/deployments
 * @desc    Create a new deployment
 * @access  Private (Admin)
 */
router.post('/', authenticateToken, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { environment, version, gitCommit, gitBranch, gitMessage, metadata } = req.body;

    if (!environment || !version || !gitCommit) {
      return res.status(400).json({
        success: false,
        error: 'environment, version, and gitCommit are required',
      });
    }

    const deployment = await deploymentService.createDeployment({
      environment,
      version,
      gitCommit,
      gitBranch: gitBranch || 'main',
      gitMessage: gitMessage || '',
      deployedBy: req.user?.userId || 'unknown',
      metadata,
    });

    res.status(201).json({ success: true, data: deployment });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PATCH /api/v1/deployments/:id/steps/:stage
 * @desc    Update a build step status
 * @access  Private (Admin / CI pipeline)
 */
router.patch(
  '/:id/steps/:stage',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id, stage } = req.params;
      const { status, logs } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, error: 'status is required' });
      }

      const deployment = await deploymentService.updateBuildStep(
        id,
        stage as BuildStage,
        status,
        logs,
      );

      if (!deployment) {
        return res.status(404).json({ success: false, error: 'Deployment or stage not found' });
      }

      res.json({ success: true, data: deployment });
    } catch (error) {
      next(error);
    }
  },
);

/**
 * @route   POST /api/v1/deployments/:id/rollback
 * @desc    Rollback to a specific deployment
 * @access  Private (Admin)
 */
router.post(
  '/:id/rollback',
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetId = req.params.id;
      const { environment } = req.body;

      if (!environment) {
        return res.status(400).json({ success: false, error: 'environment is required' });
      }

      const deployment = await deploymentService.rollback(
        environment,
        targetId,
        req.user?.userId || 'unknown',
      );

      if (!deployment) {
        return res.status(404).json({ success: false, error: 'Target deployment not found' });
      }

      res.json({ success: true, data: deployment });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
