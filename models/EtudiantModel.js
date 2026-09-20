/**
 * Modèle etudiant model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const EtudiantModel = {
  // Récupération avec pagination, filtres, recherche, et calcul des montants
  findAll: async (filters = {}, search = '', page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    let whereClauses = [];
    let values = [];
    let idx = 1;

    // Filtres sur promotion via jointures
    if (filters.promotion_id) {
      whereClauses.push(`e.promotion_id = $${idx++}`);
      values.push(filters.promotion_id);
    }
    if (filters.faculte_id) {
      whereClauses.push(`p.faculte_id = $${idx++}`);
      values.push(filters.faculte_id);
    }
    if (filters.filiere_id) {
      whereClauses.push(`p.filiere_id = $${idx++}`);
      values.push(filters.filiere_id);
    }
    if (filters.niveau_id) {
      whereClauses.push(`p.niveau_id = $${idx++}`);
      values.push(filters.niveau_id);
    }
    if (filters.annee_debut) {
      whereClauses.push(`p.annee_debut = $${idx++}`);
      values.push(filters.annee_debut);
    }

    // Barre de recherche (matricule ou nom)
    if (search) {
      whereClauses.push(`(e.matricule ILIKE $${idx++} OR e.nom_complet ILIKE $${idx++})`);
      values.push(`%${search}%`, `%${search}%`);
    }

    // Ne montrer que les étudiants de promotions actives (actif = true)
    whereClauses.push(`p.actif = true`);

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Requête pour compter le total
    const countQuery = `
      SELECT COUNT(DISTINCT e.id)
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      ${whereSql}
    `;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count);

    // Requête principale avec calcul des sommes de paiements attribués
    const dataQuery = `
      SELECT
        e.id, e.matricule, e.nom_complet, e.promotion_id,
        p.libelle AS promotion_libelle,
        p.annee_debut,
        p.annee_fin,
        p.montant_du,
        f.code AS faculte_code,
        f.libelle AS faculte_libelle,
        fi.code AS filiere_code,
        fi.libelle AS filiere_libelle,
        n.code AS niveau_code,
        n.libelle AS niveau_libelle,
        COALESCE(SUM(pa.montant), 0) AS total_paye,
        (p.montant_du - COALESCE(SUM(pa.montant), 0)) AS montant_restant,
        CASE
          WHEN COALESCE(SUM(pa.montant), 0) > p.montant_du
          THEN COALESCE(SUM(pa.montant), 0) - p.montant_du
          ELSE 0
        END AS excedent
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
      ${whereSql}
      GROUP BY
        e.id,
        p.libelle,
        p.annee_debut,
        p.annee_fin,
        p.montant_du,
        f.code,
        f.libelle,
        fi.code,
        fi.libelle,
        n.code,
        n.libelle
      ORDER BY e.nom_complet
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const dataRes = await pool.query(dataQuery, values);
    return {
      etudiants: dataRes.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  findById: async (id) => {
    const result = await pool.query(`
      SELECT
        e.*,
        p.libelle AS promotion_libelle,
        p.annee_debut,
        p.annee_fin,
        p.montant_du,
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
      WHERE e.id = $1
    `, [id]);
    return result.rows[0];
  },

  getPaiementsByEtudiant: async (etudiantId) => {
    const result = await pool.query(`
      SELECT reference_paiement, date_paiement, montant, description_brute, date_attribution
      FROM paiements
      WHERE etudiant_id = $1 AND statut = 'attribue'
      ORDER BY date_paiement DESC
    `, [etudiantId]);
    return result.rows;
  },

  create: async (matricule, nom_complet, promotion_id) => {
    // Vérification personnalisée du format du matricule
    if (!/^\d+\/\d+$/.test(matricule)) {
      throw new Error('Le format du matricule est invalide. Veuillez respecter le format requis (ex: 2021/329).');
    }
    // Vérifier unicité du matricule
    const existing = await pool.query('SELECT id FROM etudiants WHERE matricule = $1', [matricule]);
    if (existing.rows.length) throw new Error('Ce matricule existe déjà');
    const result = await pool.query(
      `INSERT INTO etudiants (matricule, nom_complet, promotion_id) VALUES ($1, $2, $3) RETURNING *`,
      [matricule, nom_complet, promotion_id]
    );
    return result.rows[0];
  },

  update: async (id, { matricule, nom_complet, promotion_id }) => {
    const existing = await pool.query('SELECT id FROM etudiants WHERE matricule = $1 AND id != $2', [matricule, id]);
    if (existing.rows.length) throw new Error('Ce matricule est déjà utilisé par un autre étudiant');
    const result = await pool.query(
      `UPDATE etudiants SET matricule = $1, nom_complet = $2, promotion_id = $3 WHERE id = $4 RETURNING *`,
      [matricule, nom_complet, promotion_id, id]
    );
    return result.rows[0];
  },

  delete: async (id) => {
    // Vérifier aucun paiement attribué
    const paiements = await pool.query('SELECT id FROM paiements WHERE etudiant_id = $1 AND statut = $2', [id, 'attribue']);
    if (paiements.rows.length) throw new Error('Impossible de supprimer : des paiements sont attribués à cet étudiant');
    const result = await pool.query('DELETE FROM etudiants WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },

  // Pour import par lot (vérification doublons / homonymes)
  checkExisting: async (matricule) => {
    const result = await pool.query('SELECT id, nom_complet, promotion_id FROM etudiants WHERE matricule = $1', [matricule]);
    return result.rows[0];
  },

  findSimilarByNameAndPromotion: async (nom, promotion_id) => {
    // Utilisation de pg_trgm pour similarité > 0.95
    const result = await pool.query(`
      SELECT id, matricule, nom_complet, similarity(nom_complet, $1) as sim
      FROM etudiants
      WHERE promotion_id = $2 AND similarity(nom_complet, $1) > 0.95
      ORDER BY sim DESC
    `, [nom, promotion_id]);
    return result.rows;
  }
};

export default EtudiantModel;