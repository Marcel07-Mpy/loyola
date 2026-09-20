/**
 * Routes Audit. L'ensemble du module reste reserve aux administrateurs.
 */
import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware.js';
import {
  exportAuditReport,
  getAuditFilterOptions,
  getAudits
} from '../controllers/auditController.js';

const router = express.Router();
router.use(authenticate);
router.use(authorizeAdmin);

router.get('/filters', getAuditFilterOptions);
router.get('/export', exportAuditReport);
router.get('/', getAudits);

export default router;
