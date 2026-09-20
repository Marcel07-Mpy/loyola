/**
 * Service métier de correction administrative des paiements.
 *
 * Ce module applique les règles de sécurité, contrôle les transitions d'état,
 * orchestre les transactions et construit une trace d'audit exploitable sans
 * modifier le schéma de la base de données.
 */
import PaymentAdministrationModel from '../models/PaymentAdministrationModel.js';
import { formatPromotionLabel } from '../utils/academicDisplay.js';

const MIN_COMMENT_LENGTH = 31;
const MAX_COMMENT_LENGTH = 1_000;
const MAX_SEARCH_LENGTH = 200;
const SEARCH_LIMIT = 12;

/** Erreur métier enrichie d'un code HTTP compréhensible par le contrôleur. */
export class PaymentAdministrationError extends Error {
  constructor(message, status = 400, code = 'PAYMENT_ADMINISTRATION_ERROR') {
    super(message);
    this.name = 'PaymentAdministrationError';
    this.status = status;
    this.code = code;
  }
}

/** Nettoie une valeur libre avant de l'insérer dans une trace textuelle. */
const cleanAuditValue = (value, maxLength = 600) => String(value ?? '')
  .replace(/[\r\n]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maxLength);

/** Valide et retourne un identifiant numérique strictement positif. */
export const parsePositiveId = (value, label = 'Identifiant') => {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new PaymentAdministrationError(`${label} invalide.`, 400, 'INVALID_ID');
  }
  return id;
};

/** Le commentaire est obligatoire et suffisamment explicite pour l'audit. */
export const validateRequiredComment = (value) => {
  const comment = cleanAuditValue(value, MAX_COMMENT_LENGTH);
  if (!comment) {
    throw new PaymentAdministrationError(
      'Un commentaire de justification est obligatoire.',
      400,
      'COMMENT_REQUIRED'
    );
  }
  if (comment.length < MIN_COMMENT_LENGTH) {
    throw new PaymentAdministrationError(
      `Le commentaire doit contenir au moins ${MIN_COMMENT_LENGTH} caractères.`,
      400,
      'COMMENT_TOO_SHORT'
    );
  }
  return comment;
};

/** Limite les termes de recherche afin d'éviter les requêtes excessives. */
const validateSearchQuery = (value, label) => {
  const query = cleanAuditValue(value, MAX_SEARCH_LENGTH);
  if (query.length < 2) {
    throw new PaymentAdministrationError(
      `${label} doit contenir au moins 2 caractères.`,
      400,
      'SEARCH_QUERY_TOO_SHORT'
    );
  }
  return query;
};

/** Construit une représentation lisible de l'étudiant lié au paiement. */
const studentSummary = (record) => {
  if (!record?.etudiant_id && !record?.id) return 'Aucun étudiant';
  const matricule = record.etudiant_matricule || record.matricule || 'Sans matricule';
  const name = record.etudiant_nom || record.nom_complet || 'Nom indisponible';
  const promotion = formatPromotionLabel(record) || 'Promotion indisponible';
  return `${matricule} - ${name} - ${promotion}`;
};

/** Résume l'état utile du paiement pour les valeurs anciennes et nouvelles. */
export const summarizePaymentState = (record, overrides = {}) => ({
  statut: overrides.statut ?? record?.statut ?? null,
  etudiant: overrides.etudiant ?? studentSummary(record),
  montant: Number(record?.montant ?? 0),
  mode_attribution: overrides.mode_attribution ?? record?.mode_attribution ?? null
});

/** Transforme un état en texte compact, stable et facile à lire dans l'audit. */
const serializeState = (state) => [
  `statut=${cleanAuditValue(state.statut || 'non défini', 80)}`,
  `étudiant=${cleanAuditValue(state.etudiant || 'Aucun étudiant', 420)}`,
  `montant=${Number(state.montant || 0).toFixed(2)} USD`,
  `mode=${cleanAuditValue(state.mode_attribution || 'non défini', 80)}`
].join('; ');

/**
 * Construit une trace structurée dans le champ commentaire existant.
 * Le préfixe ACTION permet à la page Audit de catégoriser l'opération.
 */
export const buildAdministrationAuditComment = ({
  action,
  reference,
  justification,
  oldState,
  newState,
  userAgent
}) => [
  `[ACTION:${action}]`,
  `REFERENCE:${cleanAuditValue(reference, 200)}`,
  `JUSTIFICATION:${cleanAuditValue(justification, MAX_COMMENT_LENGTH)}`,
  `ANCIEN:${serializeState(oldState)}`,
  `NOUVEAU:${serializeState(newState)}`,
  `USER_AGENT:${cleanAuditValue(userAgent || 'indisponible', 240)}`
].join('\n');

/** Ajoute le libellé court de promotion à une réponse destinée au frontend. */
const presentPayment = (payment) => payment ? {
  ...payment,
  promotion_affichage: formatPromotionLabel(payment)
} : null;

/** Recherche les paiements par référence bancaire. */
export const searchPaymentsByReference = async (query) => {
  const normalized = validateSearchQuery(query, 'La référence bancaire');
  const rows = await PaymentAdministrationModel.searchPaymentsByReference(normalized, SEARCH_LIMIT);
  return rows.map(presentPayment);
};

/** Recherche les étudiants par identité, matricule ou informations académiques. */
export const searchStudentsForReassignment = async (query) => {
  const normalized = validateSearchQuery(query, 'La recherche d’étudiant');
  const rows = await PaymentAdministrationModel.searchStudents(normalized, SEARCH_LIMIT);
  return rows.map((student) => ({
    ...student,
    promotion_affichage: formatPromotionLabel(student)
  }));
};

/** Annule le paiement tout en conservant sa ligne et son étudiant historique. */
export const cancelPayment = async ({ paymentId, admin, comment, requestMeta }) => {
  const id = parsePositiveId(paymentId, 'Paiement');
  const justification = validateRequiredComment(comment);

  return PaymentAdministrationModel.withTransaction(async (client) => {
    const lockedPayment = await PaymentAdministrationModel.findPaymentForUpdate(client, id);
    if (!lockedPayment) {
      throw new PaymentAdministrationError(
        'Paiement introuvable ou déjà supprimé.',
        404,
        'PAYMENT_NOT_FOUND'
      );
    }
    if (!lockedPayment.etudiant_id) {
      throw new PaymentAdministrationError(
        'Cette page traite uniquement les paiements déjà attribués à un étudiant.',
        409,
        'PAYMENT_NOT_ASSIGNED'
      );
    }
    if (lockedPayment.statut === 'annule') {
      throw new PaymentAdministrationError(
        'Ce paiement est déjà annulé.',
        409,
        'PAYMENT_ALREADY_CANCELLED'
      );
    }

    const currentPayment = await PaymentAdministrationModel.findPaymentById(id, client);
    const oldState = summarizePaymentState(currentPayment);
    const newState = summarizePaymentState(currentPayment, {
      statut: 'annule',
      mode_attribution: 'administratif'
    });
    const auditComment = buildAdministrationAuditComment({
      action: 'ANNULATION_PAIEMENT',
      reference: currentPayment.reference_paiement,
      justification,
      oldState,
      newState,
      ...requestMeta
    });

    await PaymentAdministrationModel.cancelPayment(client, id, admin.id, justification);
    await PaymentAdministrationModel.insertAudit(client, {
      paymentId: id,
      adminId: admin.id,
      studentId: currentPayment.etudiant_id,
      comment: auditComment
    });

    return presentPayment(await PaymentAdministrationModel.findPaymentById(id, client));
  });
};

/** Supprime physiquement le paiement après confirmation et conservation de l'audit. */
export const deletePayment = async ({
  paymentId,
  expectedReference,
  admin,
  comment,
  requestMeta
}) => {
  const id = parsePositiveId(paymentId, 'Paiement');
  const justification = validateRequiredComment(comment);

  return PaymentAdministrationModel.withTransaction(async (client) => {
    const lockedPayment = await PaymentAdministrationModel.findPaymentForUpdate(client, id);
    if (!lockedPayment) {
      throw new PaymentAdministrationError(
        'Paiement introuvable ou déjà supprimé.',
        404,
        'PAYMENT_NOT_FOUND'
      );
    }
    if (!lockedPayment.etudiant_id) {
      throw new PaymentAdministrationError(
        'Cette page traite uniquement les paiements déjà attribués à un étudiant.',
        409,
        'PAYMENT_NOT_ASSIGNED'
      );
    }

    const currentPayment = await PaymentAdministrationModel.findPaymentById(id, client);
    if (cleanAuditValue(expectedReference, 200) !== currentPayment.reference_paiement) {
      throw new PaymentAdministrationError(
        'La référence de confirmation ne correspond pas au paiement sélectionné.',
        400,
        'REFERENCE_CONFIRMATION_MISMATCH'
      );
    }

    const oldState = summarizePaymentState(currentPayment);
    const newState = {
      statut: 'supprime',
      etudiant: 'Paiement supprimé de la base',
      montant: Number(currentPayment.montant || 0),
      mode_attribution: 'administratif'
    };
    const auditComment = buildAdministrationAuditComment({
      action: 'SUPPRESSION_PAIEMENT',
      reference: currentPayment.reference_paiement,
      justification,
      oldState,
      newState,
      ...requestMeta
    });

    // Les audits antérieurs gardent leur commentaire mais ne bloquent pas la suppression.
    await PaymentAdministrationModel.detachExistingAuditLinks(client, id);
    await PaymentAdministrationModel.deletePayment(client, id);
    await PaymentAdministrationModel.insertAudit(client, {
      paymentId: null,
      adminId: admin.id,
      studentId: currentPayment.etudiant_id,
      comment: auditComment
    });

    return {
      id,
      reference_paiement: currentPayment.reference_paiement,
      deleted: true
    };
  });
};

/** Réaffecte un paiement attribué au mauvais étudiant. */
export const reassignPayment = async ({
  paymentId,
  newStudentId,
  admin,
  comment,
  requestMeta
}) => {
  const id = parsePositiveId(paymentId, 'Paiement');
  const targetStudentId = parsePositiveId(newStudentId, 'Étudiant');
  const justification = validateRequiredComment(comment);

  return PaymentAdministrationModel.withTransaction(async (client) => {
    const lockedPayment = await PaymentAdministrationModel.findPaymentForUpdate(client, id);
    if (!lockedPayment) {
      throw new PaymentAdministrationError(
        'Paiement introuvable ou déjà supprimé.',
        404,
        'PAYMENT_NOT_FOUND'
      );
    }
    if (lockedPayment.statut === 'annule') {
      throw new PaymentAdministrationError(
        'Un paiement annulé ne peut pas être réaffecté. Sélectionnez une autre action.',
        409,
        'CANCELLED_PAYMENT_CANNOT_BE_REASSIGNED'
      );
    }
    if (lockedPayment.statut !== 'attribue' || !lockedPayment.etudiant_id) {
      throw new PaymentAdministrationError(
        'Seul un paiement déjà attribué peut être réaffecté depuis cette page.',
        409,
        'PAYMENT_NOT_ASSIGNED'
      );
    }
    if (Number(lockedPayment.etudiant_id) === targetStudentId) {
      throw new PaymentAdministrationError(
        'Le nouvel étudiant est identique à l’étudiant actuellement lié.',
        409,
        'SAME_STUDENT'
      );
    }

    const newStudent = await PaymentAdministrationModel.findStudentForUpdate(client, targetStudentId);
    if (!newStudent) {
      throw new PaymentAdministrationError(
        'Le nouvel étudiant est introuvable ou sa promotion est inactive.',
        404,
        'STUDENT_NOT_FOUND'
      );
    }

    const currentPayment = await PaymentAdministrationModel.findPaymentById(id, client);
    const oldState = summarizePaymentState(currentPayment);
    const newState = summarizePaymentState(currentPayment, {
      statut: 'attribue',
      etudiant: studentSummary(newStudent),
      mode_attribution: 'manuel'
    });
    const auditComment = buildAdministrationAuditComment({
      action: 'REAFFECTATION_PAIEMENT',
      reference: currentPayment.reference_paiement,
      justification,
      oldState,
      newState,
      ...requestMeta
    });

    await PaymentAdministrationModel.reassignPayment(
      client,
      id,
      targetStudentId,
      admin.id,
      justification
    );
    await PaymentAdministrationModel.insertAudit(client, {
      paymentId: id,
      adminId: admin.id,
      studentId: targetStudentId,
      comment: auditComment
    });

    return presentPayment(await PaymentAdministrationModel.findPaymentById(id, client));
  });
};
