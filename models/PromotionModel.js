/**
 * Modèle promotion model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
// backend/models/PromotionModel.js
import pool from '../config/db.js';

const PromotionModel = {
  // Récupérer toutes les promotions avec pagination, filtres, et comptage étudiants
  findAll: async (filters = {}, page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    let whereClauses = [];
    let values = [];
    let idx = 1;

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
    if (filters.libelle) {
      whereClauses.push(`p.libelle ILIKE $${idx++}`);
      values.push(`%${filters.libelle}%`);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*) 
      FROM promotions p
      ${whereSql}
    `;
    const countRes = await pool.query(countQuery, values);
    const total = parseInt(countRes.rows[0].count);

    const dataQuery = `
      SELECT 
        p.id, p.libelle, p.faculte_id, p.filiere_id, p.niveau_id,
        p.annee_debut, p.annee_fin, p.montant_du, p.actif, p.created_at,
        f.code as faculte_code, f.libelle as faculte_libelle,
        fi.code as filiere_code, fi.libelle as filiere_libelle,
        n.code as niveau_code, n.libelle as niveau_libelle,
        (SELECT COUNT(*) FROM etudiants WHERE promotion_id = p.id) as nb_etudiants
      FROM promotions p
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      ${whereSql}
      ORDER BY p.annee_debut DESC, p.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `;
    values.push(limit, offset);
    const dataRes = await pool.query(dataQuery, values);
    return {
      promotions: dataRes.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  // Vérifier l'unicité
  checkUnique: async (faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, excludeId = null) => {
    let query = `
      SELECT id FROM promotions 
      WHERE faculte_id = $1 AND filiere_id = $2 AND niveau_id = $3 
      AND annee_debut = $4 AND annee_fin = $5
    `;
    let values = [faculte_id, filiere_id, niveau_id, annee_debut, annee_fin];
    if (excludeId) {
      query += ` AND id != $6`;
      values.push(excludeId);
    }
    const result = await pool.query(query, values);
    return result.rows.length === 0;
  },

  create: async (libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif = true) => {
    const result = await pool.query(
      `INSERT INTO promotions (libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif]
    );
    return result.rows[0];
  },

  findById: async (id) => {
    const result = await pool.query(`
      SELECT p.*, 
             (SELECT COUNT(*) FROM etudiants WHERE promotion_id = p.id) as nb_etudiants
      FROM promotions p WHERE p.id = $1
    `, [id]);
    return result.rows[0];
  },

  update: async (id, { libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif }) => {
    const result = await pool.query(
      `UPDATE promotions 
       SET libelle = $1, faculte_id = $2, filiere_id = $3, niveau_id = $4, 
           annee_debut = $5, annee_fin = $6, montant_du = $7, actif = $8
       WHERE id = $9
       RETURNING *`,
      [libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif, id]
    );
    return result.rows[0];
  },

  delete: async (id) => {
    // Vérifier si aucun étudiant n'est inscrit
    const check = await pool.query('SELECT COUNT(*) FROM etudiants WHERE promotion_id = $1', [id]);
    if (parseInt(check.rows[0].count) > 0) {
      throw new Error('Impossible de supprimer une promotion qui contient des étudiants.');
    }
    const result = await pool.query('DELETE FROM promotions WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  }
};

export default PromotionModel;