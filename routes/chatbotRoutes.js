import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { chatWithApplicationAssistant } from '../controllers/chatbotController.js';

const router = express.Router();
router.use(authenticate);
router.post('/message', chatWithApplicationAssistant);

export default router;
