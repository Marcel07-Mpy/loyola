/**
 * Routes réservées à la correction administrative des paiements.
 * L'authentification et le rôle administrateur sont vérifiés avant toute route.
 */
import express from 'express';
import { authenticate, authorizeAdmin } from '../middleware/authMiddleware.js';
import { adminPaymentActionRateLimit } from '../middleware/adminPaymentActionRateLimit.js';
import {
  searchPayments,
  searchStudents,
  cancelSelectedPayment,
  deleteSelectedPayment,
  reassignSelectedPayment
} from '../controllers/paymentAdministrationController.js';

const router = express.Router();

router.use(authenticate, authorizeAdmin);

// Les routes de recherche précèdent les routes paramétrées pour éviter les collisions.
router.get('/search', searchPayments);
router.get('/students/search', searchStudents);

// Les écritures critiques sont limitées et entièrement auditées.
router.post('/:id/cancel', adminPaymentActionRateLimit, cancelSelectedPayment);
router.post('/:id/reassign', adminPaymentActionRateLimit, reassignSelectedPayment);
router.delete('/:id', adminPaymentActionRateLimit, deleteSelectedPayment);

export default router;
