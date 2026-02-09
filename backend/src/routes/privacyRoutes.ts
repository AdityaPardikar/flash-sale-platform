/**
 * Privacy Routes
 * Day 7: Security Hardening & Audit System
 * GDPR compliance endpoints
 */

import { Router } from 'express';
import { privacyController } from '../controllers/privacyController';
import { authMiddleware } from '../middleware/auth';
import { rateLimiters } from '../middleware/rateLimiter';

const router = Router();

// All privacy routes require authentication
router.use(authMiddleware);

// Consent management
router.get('/consents', privacyController.getConsents);
router.post('/consents', privacyController.updateConsent);
router.post('/consents/withdraw-all', privacyController.withdrawAllConsents);

// Data export (GDPR Article 20)
router.post('/export', rateLimiters.export, privacyController.requestDataExport);
router.get('/export', privacyController.listExports);
router.get('/export/:exportId', privacyController.getExportStatus);
router.get('/export/:exportId/download', privacyController.downloadExport);

// Account deletion (GDPR Article 17)
router.post('/deletion', privacyController.requestDeletion);
router.get('/deletion', privacyController.getDeletionStatus);

// Privacy information
router.get('/report', privacyController.getPrivacyReport);
router.get('/retention-policies', privacyController.getRetentionPolicies);

export default router;
