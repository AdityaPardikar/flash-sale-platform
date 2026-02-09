/**
 * Privacy Controller
 * Day 7: Security Hardening & Audit System
 * Endpoints for GDPR compliance features
 */

import { Request, Response } from 'express';
import { privacyService, ConsentType } from '../services/privacyService';
import { dataExportService } from '../services/dataExportService';
import { logger } from '../utils/logger';

/**
 * Privacy Controller - GDPR endpoints
 */
export const privacyController = {
  /**
   * Get user's consent settings
   */
  async getConsents(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const consents = await privacyService.getUserConsents(userId);

      res.json({
        consents,
        consentTypes: Object.values(ConsentType),
      });
    } catch (error) {
      logger.error('Error fetching consents', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to fetch consent settings' });
    }
  },

  /**
   * Update consent settings
   */
  async updateConsent(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { type, granted } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!type || typeof granted !== 'boolean') {
        return res.status(400).json({ error: 'Invalid consent data' });
      }

      if (type === ConsentType.ESSENTIAL) {
        return res.status(400).json({ error: 'Essential consent cannot be modified' });
      }

      if (!Object.values(ConsentType).includes(type)) {
        return res.status(400).json({ error: 'Invalid consent type' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      await privacyService.recordConsent(userId, type, granted, ipAddress, 'settings');

      res.json({
        success: true,
        message: `Consent ${granted ? 'granted' : 'withdrawn'} for ${type}`,
      });
    } catch (error) {
      logger.error('Error updating consent', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to update consent' });
    }
  },

  /**
   * Withdraw all consents
   */
  async withdrawAllConsents(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      await privacyService.withdrawAllConsents(userId, ipAddress);

      res.json({
        success: true,
        message: 'All optional consents withdrawn',
      });
    } catch (error) {
      logger.error('Error withdrawing consents', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to withdraw consents' });
    }
  },

  /**
   * Request data export (GDPR Article 20)
   */
  async requestDataExport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const exportId = await dataExportService.requestExport(userId);

      res.json({
        success: true,
        exportId,
        message: 'Data export requested. You will be notified when ready.',
        estimatedTime: '5-10 minutes',
      });
    } catch (error) {
      logger.error('Error requesting export', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to request data export' });
    }
  },

  /**
   * Get data export status
   */
  async getExportStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { exportId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const status = await dataExportService.getExportStatus(exportId);

      if (!status || status.userId !== userId) {
        return res.status(404).json({ error: 'Export not found' });
      }

      res.json(status);
    } catch (error) {
      logger.error('Error fetching export status', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to fetch export status' });
    }
  },

  /**
   * List user's exports
   */
  async listExports(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const exports = await dataExportService.getUserExports(userId);

      res.json({ exports });
    } catch (error) {
      logger.error('Error listing exports', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to list exports' });
    }
  },

  /**
   * Download export data
   */
  async downloadExport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { exportId } = req.params;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const data = await dataExportService.downloadExport(exportId, userId);

      if (!data) {
        return res.status(404).json({ error: 'Export not found or expired' });
      }

      // Set download headers
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition', 
        `attachment; filename="data-export-${new Date().toISOString().split('T')[0]}.json"`
      );

      res.json(data);
    } catch (error) {
      logger.error('Error downloading export', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to download export' });
    }
  },

  /**
   * Request account deletion (GDPR Article 17)
   */
  async requestDeletion(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { confirmation } = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (confirmation !== 'DELETE_MY_ACCOUNT') {
        return res.status(400).json({
          error: 'Confirmation required',
          message: 'Please send confirmation: "DELETE_MY_ACCOUNT"',
        });
      }

      const ipAddress = req.ip || req.socket.remoteAddress;
      const deletionId = await privacyService.requestAccountDeletion(userId, ipAddress);

      res.json({
        success: true,
        deletionId,
        message: 'Account deletion requested. This process may take up to 30 days.',
        note: 'Some data may be retained for legal compliance',
      });
    } catch (error) {
      logger.error('Error requesting deletion', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to request account deletion' });
    }
  },

  /**
   * Get deletion status
   */
  async getDeletionStatus(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const status = await privacyService.getDeletionStatus(userId);

      if (!status) {
        return res.json({ hasPendingDeletion: false });
      }

      res.json({
        hasPendingDeletion: status.status === 'pending' || status.status === 'processing',
        ...status,
      });
    } catch (error) {
      logger.error('Error fetching deletion status', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to fetch deletion status' });
    }
  },

  /**
   * Get privacy report
   */
  async getPrivacyReport(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const report = await privacyService.generatePrivacyReport(userId);

      res.json(report);
    } catch (error) {
      logger.error('Error generating privacy report', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to generate privacy report' });
    }
  },

  /**
   * Get retention policies
   */
  async getRetentionPolicies(req: Request, res: Response) {
    try {
      const policies = privacyService.getRetentionPolicies();
      res.json({ policies });
    } catch (error) {
      logger.error('Error fetching policies', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to fetch retention policies' });
    }
  },
};

export default privacyController;
