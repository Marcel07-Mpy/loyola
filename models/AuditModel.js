/**
 * Modèle du journal d'audit.
 *
 * Toutes les consultations (écran et export PDF) passent par le même moteur de
 * filtres afin de garantir que le rapport exporté corresponde exactement aux
 * résultats visibles sur la page Audit.
 */
import pool from '../config/db.js';

export const AUDIT_ACTIONS = [
  'validation_manuelle',
  'remboursement',
  'annulation_paiement',
  'suppression_paiement',
  'reaffectation_paiement'
];

const AUDIT_DATA_QUERY = `
  SELECT
    a.id,
    a.paiement_id,
    a.agent_id,
    a.etudiant_id,
    a.commentaire,
    a.horodatage,
    u.username AS agent_username,
    u.role AS agent_role,
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
    COALESCE(
      pa.reference_paiement,
      NULLIF(BTRIM(SPLIT_PART(SPLIT_PART(a.commentaire, 'REFERENCE:', 2), CHR(10), 1)), '')
    ) AS reference_paiement,
    pa.description_brute,
    pa.date_paiement,
    pa.montant AS paiement_montant,
    pa.statut AS paiement_statut,
    NULLIF(BTRIM(SPLIT_PART(SPLIT_PART(a.commentaire, 'JUSTIFICATION:', 2), CHR(10), 1)), '') AS justification,
    NULLIF(BTRIM(SPLIT_PART(SPLIT_PART(a.commentaire, 'ANCIEN:', 2), CHR(10), 1)), '') AS ancienne_valeur,
    NULLIF(BTRIM(SPLIT_PART(SPLIT_PART(a.commentaire, 'NOUVEAU:', 2), CHR(10), 1)), '') AS nouvelle_valeur,
    CASE
      WHEN a.commentaire LIKE '[ACTION:ANNULATION_PAIEMENT]%' THEN 'annulation_paiement'
      WHEN a.commentaire LIKE '[ACTION:SUPPRESSION_PAIEMENT]%' THEN 'suppression_paiement'
      WHEN a.commentaire LIKE '[ACTION:REAFFECTATION_PAIEMENT]%' THEN 'reaffectation_paiement'
      WHEN a.commentaire ILIKE 'REMBOURSEMENT VALIDÉ :%'
        OR (pa.montant IS NOT NULL AND pa.montant < 0)
      THEN 'remboursement'
      ELSE 'validation_manuelle'
    END AS type_action
  FROM audit_attributions_manuelles a
  LEFT JOIN utilisateurs u ON a.agent_id = u.id
  LEFT JOIN etudiants e ON a.etudiant_id = e.id
  LEFT JOIN promotions p ON e.promotion_id = p.id
  LEFT JOIN facultes f ON p.faculte_id = f.id
  LEFT JOIN filieres fi ON p.filiere_id = fi.id
  LEFT JOIN niveaux n ON p.niveau_id = n.id
  LEFT JOIN paiements pa ON a.paiement_id = pa.id
`;

const buildFilteredAuditQuery = (filters = {}) => {
  const params = [];
  const clauses = [];

  const addParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const search = String(filters.search || '').trim();
  if (search) {
    const token = addParam(`%${search}%`);
    clauses.push(`(
      etudiant_matricule ILIKE ${token}
      OR etudiant_nom ILIKE ${token}
      OR reference_paiement ILIKE ${token}
      OR commentaire ILIKE ${token}
      OR COALESCE(justification, '') ILIKE ${token}
      OR COALESCE(description_brute, '') ILIKE ${token}
      OR COALESCE(agent_username, '') ILIKE ${token}
      OR COALESCE(promotion_libelle, '') ILIKE ${token}
    )`);
  }

  if (filters.agentId) {
    clauses.push(`agent_id = ${addParam(filters.agentId)}`);
  }

  if (filters.action) {
    clauses.push(`type_action = ${addParam(filters.action)}`);
  }

  if (filters.dateFrom) {
    clauses.push(`horodatage >= ${addParam(filters.dateFrom)}::date`);
  }

  if (filters.dateTo) {
    clauses.push(`horodatage < (${addParam(filters.dateTo)}::date + INTERVAL '1 day')`);
  }

  return {
    params,
    whereClause: clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  };
};

const AuditModel = {
  findAll: async (page = 1, limit = 10, filters = {}) => {
    const offset = (page - 1) * limit;
    const { params, whereClause } = buildFilteredAuditQuery(filters);
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    const query = `
      WITH audit_data AS (${AUDIT_DATA_QUERY})
      SELECT *
      FROM audit_data
      ${whereClause}
      ORDER BY horodatage DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;

    const result = await pool.query(query, [...params, limit, offset]);
    const countRes = await pool.query(
      `WITH audit_data AS (${AUDIT_DATA_QUERY})
       SELECT COUNT(*) FROM audit_data ${whereClause}`,
      params
    );
    const total = parseInt(countRes.rows[0].count, 10);

    return {
      audits: result.rows,
      pagination: { page, limit, total, totalPages: Math.max(Math.ceil(total / limit), 1) }
    };
  },

  /** Retourne toutes les lignes correspondant aux filtres, sans pagination. */
  findForExport: async (filters = {}) => {
    const { params, whereClause } = buildFilteredAuditQuery(filters);
    const result = await pool.query(
      `WITH audit_data AS (${AUDIT_DATA_QUERY})
       SELECT * FROM audit_data
       ${whereClause}
       ORDER BY horodatage DESC`,
      params
    );
    return result.rows;
  },

  /**
   * Les utilisateurs proposés dans le filtre sont uniquement ceux présents
   * dans le journal, ce qui évite des choix qui produiraient systématiquement
   * un rapport vide.
   */
  getFilterUsers: async () => {
    const result = await pool.query(`
      SELECT DISTINCT u.id, u.username, u.role
      FROM audit_attributions_manuelles a
      JOIN utilisateurs u ON a.agent_id = u.id
      ORDER BY u.username ASC
    `);
    return result.rows;
  }
};

export default AuditModel;
