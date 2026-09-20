/**
 * Routes excedent routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getExcedents, getDetailsExcedent, validerRemboursement } from '../controllers/excedentController.js';

const router = express.Router();
router.use(authenticate);

router.get('/', getExcedents);
router.get('/:etudiantId', getDetailsExcedent);
router.post('/:etudiantId/rembourser', validerRemboursement);

export default router;