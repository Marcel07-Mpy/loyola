/**
 * Routes promotion routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import {
  getPromotions,
  getFacultes,
  getFilieresByFaculte,
  getNiveauxByFiliere,
  createPromotion,
  updatePromotion,
  deletePromotion,
  getPromotionsByCriteres
} from '../controllers/promotionController.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// Toutes les routes nécessitent une authentification
router.use(authenticate);

// Routes de lecture
router.get('/', getPromotions);
router.get('/facultes', getFacultes);
router.get('/filieres/:faculteId', getFilieresByFaculte);
router.get('/niveaux/:filiereId', getNiveauxByFiliere);
router.get('/criteres', getPromotionsByCriteres); // ← route ajoutée (déjà présente)

// Routes d'écriture
router.post('/', createPromotion);
router.put('/:id', updatePromotion);
router.delete('/:id', deletePromotion);

export default router;