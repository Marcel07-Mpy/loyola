/**
 * Routes paiement routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import upload from '../middleware/upload.js';
import { importPaiements } from '../controllers/paiementController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(authenticate);
router.post('/import', upload.single('file'), importPaiements);

export default router;