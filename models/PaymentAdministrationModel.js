/**
 * Modèle dédié à l'administration des paiements attribués par erreur.
 *
 * Toutes les requêtes SQL sensibles sont regroupées ici afin de respecter
 * l'architecture MVC et de garder les contrôleurs indépendants de PostgreSQL.
 * Les opérations d'écriture reçoivent un client transactionnel pour garantir
 * qu'une action et sa trace d'audit sont validées ou annulées ensemble.
 */
import pool from '../config/db.js';

const PAYMENT_DETAILS_SELECT = `
  SELECT
    pa.id,
    pa.reference_paiement,
    pa.description_brute,
    pa.date_paiement,
    pa.montant,
    pa.statut,
    pa.etudiant_id,
    pa.score_composite,
    pa.matricule_extrait,
    pa.niveau_extrait,
    pa.faculte_extrait,
    pa.tokens_nom,
    pa.attribue_par,
    pa.commentaire_attribution,
    pa.date_attribution,
    e.matricule AS etudiant_matricule,
    e.nom_complet AS etudiant_nom,
    p.libelle AS promotion_libelle,
    p.annee_debut,
    p.annee_fin,
    f.code AS faculte_code,
    f.libelle AS faculte_libelle,
    fi.code AS filiere_code,
    fi.libelle AS filiere_libelle,
    n.code AS niveau_code,
    n.libelle AS niveau_libelle,
    u.username AS attribue_par_username,
    CASE
      WHEN pa.statut = 'annule' THEN 'administratif'
      WHEN pa.etudiant_id IS NULL THEN 'non_attribue'
      WHEN pa.attribue_par IS NULL THEN 'automatique'
      ELSE 'manuel'
    END AS mode_attribution
  FROM paiements pa
  LEFT JOIN etudiants e ON pa.etudiant_id = e.id
  LEFT JOIN promotions p ON e.promotion_id = p.id
  LEFT JOIN facultes f ON p.faculte_id = f.id
  LEFT JOIN filieres fi ON p.filiere_id = fi.id
  LEFT JOIN niveaux n ON p.niveau_id = n.id
  LEFT JOIN utilisateurs u ON pa.attribue_par = u.id
`;

const PaymentAdministrationModel = {
  /** Recherche progressive des références bancaires pour l'autocomplétion. */
  searchPaymentsByReference: async (query, limit = 12) => {
    const normalized = String(query || '').trim();
    const result = await pool.query(`
      ${PAYMENT_DETAILS_SELECT}
      WHERE pa.reference_paiement ILIKE $1
        AND pa.etudiant_id IS NOT NULL
      ORDER BY
        CASE
          WHEN LOWER(pa.reference_paiement) = LOWER($2) THEN 0
          WHEN LOWER(pa.reference_paiement) LIKE LOWER($2) || '%' THEN 1
          ELSE 2
        END,
        pa.date_paiement DESC,
        pa.id DESC
      LIMIT $3
    `, [`%${normalized}%`, normalized, limit]);

    return result.rows;
  },

  /** Retourne un paiement complet sans verrou, notamment après une mise à jour. */
  findPaymentById: async (id, client = pool) => {
    const result = await client.query(`
      ${PAYMENT_DETAILS_SELECT}
      WHERE pa.id = $1
    `, [id]);

    return result.rows[0] || null;
  },

  /** Verrouille la ligne du paiement pendant une opération critique. */
  findPaymentForUpdate: async (client, id) => {
    const result = await client.query(`
      SELECT *
      FROM paiements
      WHERE id = $1
      FOR UPDATE
    `, [id]);

    return result.rows[0] || null;
  },

  /** Recherche un étudiant par toutes les informations utiles à l'administrateur. */
  searchStudents: async (query, limit = 12) => {
    const normalized = String(query || '').trim();
    const result = await pool.query(`
      SELECT
        e.id,
        e.matricule,
        e.nom_complet,
        e.promotion_id,
        p.libelle AS promotion_libelle,
        p.annee_debut,
        p.annee_fin,
        f.code AS faculte_code,
        f.libelle AS faculte_libelle,
        fi.code AS filiere_code,
        fi.libelle AS filiere_libelle,
        n.code AS niveau_code,
        n.libelle AS niveau_libelle
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      WHERE p.actif = true
        AND (
          e.matricule ILIKE $1
          OR e.nom_complet ILIKE $1
          OR p.libelle ILIKE $1
          OR f.code ILIKE $1
          OR f.libelle ILIKE $1
          OR fi.code ILIKE $1
          OR fi.libelle ILIKE $1
          OR n.code ILIKE $1
          OR n.libelle ILIKE $1
        )
      ORDER BY
        CASE
          WHEN LOWER(e.matricule) = LOWER($2) THEN 0
          WHEN LOWER(e.nom_complet) = LOWER($2) THEN 1
          WHEN LOWER(e.matricule) LIKE LOWER($2) || '%' THEN 2
          WHEN LOWER(e.nom_complet) LIKE LOWER($2) || '%' THEN 3
          ELSE 4
        END,
        e.nom_complet
      LIMIT $3
    `, [`%${normalized}%`, normalized, limit]);

    return result.rows;
  },

  /** Verrouille l'étudiant cible afin d'éviter une réaffectation concurrente incohérente. */
  findStudentForUpdate: async (client, id) => {
    const result = await client.query(`
      SELECT
        e.id,
        e.matricule,
        e.nom_complet,
        e.promotion_id,
        p.libelle AS promotion_libelle,
        p.annee_debut,
        p.annee_fin,
        f.code AS faculte_code,
        f.libelle AS faculte_libelle,
        fi.code AS filiere_code,
        fi.libelle AS filiere_libelle,
        n.code AS niveau_code,
        n.libelle AS niveau_libelle
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      WHERE e.id = $1 AND p.actif = true
      FOR UPDATE OF e
    `, [id]);

    return result.rows[0] || null;
  },

  /** Marque le paiement comme annulé sans supprimer sa ligne ni son historique. */
  cancelPayment: async (client, id, adminId, comment) => {
    const result = await client.query(`
      UPDATE paiements
      SET
        statut = 'annule',
        attribue_par = $1,
        commentaire_attribution = $2,
        date_attribution = NOW()
      WHERE id = $3
      RETURNING *
    `, [adminId, comment, id]);

    return result.rows[0] || null;
  },

  /** Réaffecte le paiement et indique explicitement qu'il s'agit d'une décision manuelle. */
  reassignPayment: async (client, id, studentId, adminId, comment) => {
    const result = await client.query(`
      UPDATE paiements
      SET
        statut = 'attribue',
        etudiant_id = $1,
        score_composite = NULL,
        attribue_par = $2,
        commentaire_attribution = $3,
        date_attribution = NOW()
      WHERE id = $4
      RETURNING *
    `, [studentId, adminId, comment, id]);

    return result.rows[0] || null;
  },

  /**
   * Détache les anciennes lignes d'audit avant une suppression physique.
   * Les commentaires existants restent conservés, mais ne dépendent plus de la
   * clé étrangère du paiement qui va disparaître.
   */
  detachExistingAuditLinks: async (client, paymentId) => {
    await client.query(`
      UPDATE audit_attributions_manuelles
      SET paiement_id = NULL
      WHERE paiement_id = $1
    `, [paymentId]);
  },

  /** Supprime définitivement le paiement après verrouillage et audit. */
  deletePayment: async (client, id) => {
    const result = await client.query(`
      DELETE FROM paiements
      WHERE id = $1
      RETURNING id
    `, [id]);

    return result.rows[0] || null;
  },

  /** Enregistre la justification et les valeurs avant/après dans l'audit existant. */
  insertAudit: async (client, { paymentId, adminId, studentId, comment }) => {
    const result = await client.query(`
      INSERT INTO audit_attributions_manuelles
        (paiement_id, agent_id, etudiant_id, commentaire, horodatage)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id, horodatage
    `, [paymentId, adminId, studentId, comment]);

    return result.rows[0];
  },

  /** Exécute une suite d'écritures dans une transaction PostgreSQL atomique. */
  withTransaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
};

export default PaymentAdministrationModel;
