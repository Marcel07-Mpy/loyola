/**
 * Routes dashboard routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getDashboardStats } from '../controllers/dashboardController.js';

const router = express.Router();
router.use(authenticate);
router.get('/stats', getDashboardStats);

export default router;