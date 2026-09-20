/**
 * Routes revue routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { getPaiementsRevue, getCandidats, rechercherEtudiants, attribuerPaiement } from '../controllers/revueController.js';

const router = express.Router();
router.use(authenticate);

router.get('/', getPaiementsRevue);
router.get('/:id/candidats', getCandidats);
router.get('/recherche/etudiants', rechercherEtudiants);
router.post('/:id/attribuer', attribuerPaiement);

export default router;