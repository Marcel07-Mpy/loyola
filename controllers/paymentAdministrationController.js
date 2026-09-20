/**
 * Contrôleur HTTP de la gestion administrative des paiements.
 *
 * Il traduit les requêtes du frontend en appels métier, sans contenir de SQL.
 * Les messages techniques restent dans les journaux du serveur tandis que les
 * réponses envoyées à l'utilisateur demeurent simples et compréhensibles.
 */
import {
  PaymentAdministrationError,
  searchPaymentsByReference,
  searchStudentsForReassignment,
  cancelPayment,
  deletePayment,
  reassignPayment
} from '../services/paymentAdministrationService.js';

/** Collecte uniquement le contexte technique utile à la traçabilité. */
const getRequestMeta = (req) => ({
  userAgent: req.get('user-agent') || 'indisponible'
});

/** Réponse uniforme pour les erreurs métier et les erreurs inattendues. */
const handleControllerError = (res, error, context) => {
  if (error instanceof PaymentAdministrationError) {
    return res.status(error.status).json({ message: error.message, code: error.code });
  }

  // Les détails sont journalisés sans exposer la requête ou les secrets au client.
  console.error(`[${context}]`, error?.message || 'Erreur inconnue');
  return res.status(500).json({
    message: 'Une erreur interne empêche momentanément cette opération.'
  });
};

export const searchPayments = async (req, res) => {
  try {
    const payments = await searchPaymentsByReference(req.query.query);
    return res.json({ payments });
  } catch (error) {
    return handleControllerError(res, error, 'Recherche paiement administrative');
  }
};

export const searchStudents = async (req, res) => {
  try {
    const students = await searchStudentsForReassignment(req.query.query);
    return res.json({ students });
  } catch (error) {
    return handleControllerError(res, error, 'Recherche étudiant pour réaffectation');
  }
};

export const cancelSelectedPayment = async (req, res) => {
  try {
    const payment = await cancelPayment({
      paymentId: req.params.id,
      admin: req.user,
      comment: req.body.comment,
      requestMeta: getRequestMeta(req)
    });

    return res.json({
      message: 'Le paiement a été annulé et l’opération a été enregistrée dans l’audit.',
      payment
    });
  } catch (error) {
    return handleControllerError(res, error, 'Annulation administrative de paiement');
  }
};

export const deleteSelectedPayment = async (req, res) => {
  try {
    const result = await deletePayment({
      paymentId: req.params.id,
      expectedReference: req.body.reference,
      admin: req.user,
      comment: req.body.comment,
      requestMeta: getRequestMeta(req)
    });

    return res.json({
      message: 'Le paiement a été supprimé définitivement et la trace d’audit a été conservée.',
      ...result
    });
  } catch (error) {
    return handleControllerError(res, error, 'Suppression administrative de paiement');
  }
};

export const reassignSelectedPayment = async (req, res) => {
  try {
    const payment = await reassignPayment({
      paymentId: req.params.id,
      newStudentId: req.body.etudiant_id,
      admin: req.user,
      comment: req.body.comment,
      requestMeta: getRequestMeta(req)
    });

    return res.json({
      message: 'Le paiement a été réaffecté au nouvel étudiant et l’ancienne attribution reste auditée.',
      payment
    });
  } catch (error) {
    return handleControllerError(res, error, 'Réaffectation administrative de paiement');
  }
};
