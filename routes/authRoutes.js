/**
 * Routes auth routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import { login, logout, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { loginRateLimit } from '../middleware/loginRateLimit.js';

const router = express.Router();

router.post('/login', loginRateLimit, login);
router.post('/logout', logout);
router.get('/me', authenticate, me);

export default router;