import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getAttentionNotifications } from '../controllers/notificationController.js';

const router = express.Router();
router.use(authenticate);
router.get('/attention', getAttentionNotifications);

export default router;
