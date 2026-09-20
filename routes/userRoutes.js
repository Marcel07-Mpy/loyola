/**
 * Routes user routes. Associe les URL de l'API aux contrôleurs et aux middleware de sécurité nécessaires.
 */
import express from 'express';
import { getUsers, createUser, updateUser, deleteUser } from '../controllers/userController.js';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Toutes ces routes nécessitent admin
router.use(authenticate, authorizeAdmin);

router.get('/', getUsers);
router.post('/', createUser);
router.put('/:id', updateUser);
router.delete('/:id', deleteUser);

export default router;