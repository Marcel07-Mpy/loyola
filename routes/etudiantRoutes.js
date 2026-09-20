/**
 * Routes etudiant routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import {
  getEtudiants,
  getEtudiantById,
  createEtudiant,
  updateEtudiant,
  deleteEtudiant,
  importEtudiants,
  exportEtudiants,
  generateRecuPDF
} from '../controllers/etudiantController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import upload from '../middleware/upload.js';

const router = express.Router();

router.use(authenticate);

// Routes spécifiques (sans paramètre dynamique) AVANT les routes avec paramètres
router.get('/export', exportEtudiants);
router.post('/import', upload.single('file'), importEtudiants);

// Routes avec paramètres
router.get('/:id/recu', generateRecuPDF);
router.get('/:id', getEtudiantById);
router.put('/:id', updateEtudiant);
router.delete('/:id', deleteEtudiant);

// Routes sans paramètre en dernier
router.get('/', getEtudiants);
router.post('/', createEtudiant);

export default router;