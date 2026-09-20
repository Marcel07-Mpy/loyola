/**
 * Modèle paiement model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const PaiementModel = {
  findByReference: async (reference) => {
    const result = await pool.query('SELECT id FROM paiements WHERE reference_paiement = $1', [reference]);
    return result.rows[0];
  },
  findById: async (id) => {
    const result = await pool.query('SELECT * FROM paiements WHERE id = $1', [id]);
    return result.rows[0];
  },
  create: async (data) => {
    const { reference_paiement, description_brute, date_paiement, montant,
            matricule_extrait, niveau_extrait, faculte_extrait, tokens_nom,
            statut, etudiant_id, score_composite } = data;
    const result = await pool.query(
      `INSERT INTO paiements 
       (reference_paiement, description_brute, date_paiement, montant,
        matricule_extrait, niveau_extrait, faculte_extrait, tokens_nom,
        statut, etudiant_id, score_composite)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [reference_paiement, description_brute, date_paiement, montant,
       matricule_extrait, niveau_extrait, faculte_extrait, tokens_nom,
       statut, etudiant_id, score_composite]
    );
    return result.rows[0];
  },
  updateStatus: async (id, statut, etudiant_id, score_composite, attribue_par, commentaire) => {
    const result = await pool.query(
      `UPDATE paiements 
       SET statut = $1, etudiant_id = $2, score_composite = $3,
           attribue_par = $4, commentaire_attribution = $5, date_attribution = NOW()
       WHERE id = $6
       RETURNING *`,
      [statut, etudiant_id, score_composite, attribue_par, commentaire, id]
    );
    return result.rows[0];
  },
  findByStatut: async (statut, page = 1, limit = 10, search = '') => {
    const offset = (page - 1) * limit;
    const normalizedSearch = search.trim();
    const params = [statut];
    let searchCondition = '';

    if (normalizedSearch) {
      params.push(`%${normalizedSearch}%`);
      searchCondition = `
        AND (
          COALESCE(matricule_extrait, '') ILIKE $2
          OR COALESCE(description_brute, '') ILIKE $2
          OR COALESCE(tokens_nom::text, '') ILIKE $2
        )
      `;
    }

    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;
    const dataQuery = `
      SELECT * FROM paiements
      WHERE statut = $1
      ${searchCondition}
      ORDER BY date_paiement DESC
      LIMIT $${limitIndex} OFFSET $${offsetIndex}
    `;
    const result = await pool.query(dataQuery, [...params, limit, offset]);

    const countQuery = `
      SELECT COUNT(*) FROM paiements
      WHERE statut = $1
      ${searchCondition}
    `;
    const countRes = await pool.query(countQuery, params);

    return {
      paiements: result.rows,
      total: parseInt(countRes.rows[0].count, 10)
    };
  },
  attribuer: async (id, etudiant_id, attribue_par, commentaire) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updateQuery = `
        UPDATE paiements 
        SET statut = 'attribue', etudiant_id = $1, attribue_par = $2, 
            commentaire_attribution = $3, date_attribution = NOW()
        WHERE id = $4
        RETURNING *
      `;
      const updateRes = await client.query(updateQuery, [etudiant_id, attribue_par, commentaire, id]);
      if (updateRes.rowCount === 0) throw new Error('Paiement non trouvé');
      const auditQuery = `
        INSERT INTO audit_attributions_manuelles 
        (paiement_id, agent_id, etudiant_id, commentaire, horodatage)
        VALUES ($1, $2, $3, $4, NOW())
      `;
      await client.query(auditQuery, [id, attribue_par, etudiant_id, commentaire]);
      await client.query('COMMIT');
      return updateRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
  // Version robuste de findExcedents (remplacée)
  findExcedents: async (search = '', page = 1, limit = 10) => {
    const offset = (page - 1) * limit;
    let searchCondition = '';
    let queryParams = [];
    let idx = 1;
    if (search) {
      searchCondition = `AND (e.matricule ILIKE $${idx} OR e.nom_complet ILIKE $${idx})`;
      queryParams.push(`%${search}%`);
      idx++;
    }
    // Requête principale pour obtenir les étudiants avec excédent
    const mainQuery = `
      SELECT 
        e.id as etudiant_id,
        e.matricule,
        e.nom_complet,
        p.libelle as promotion_libelle,
        p.annee_debut,
        p.annee_fin,
        f.code as faculte_code,
        f.libelle as faculte_libelle,
        fi.code as filiere_code,
        fi.libelle as filiere_libelle,
        n.code as niveau_code,
        n.libelle as niveau_libelle,
        p.montant_du,
        COALESCE(SUM(pa.montant), 0) as total_paye,
        (COALESCE(SUM(pa.montant), 0) - p.montant_du) as excedent
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
      WHERE p.actif = true
      ${searchCondition}
      GROUP BY e.id, p.libelle, p.annee_debut, p.annee_fin,
               f.code, f.libelle, fi.code, fi.libelle, n.code, n.libelle, p.montant_du
      HAVING COALESCE(SUM(pa.montant), 0) > p.montant_du
      ORDER BY e.nom_complet
      LIMIT $${idx} OFFSET $${idx+1}
    `;
    queryParams.push(limit, offset);
    const result = await pool.query(mainQuery, queryParams);
    // Compter le nombre total d'étudiants avec excédent (sans LIMIT/OFFSET)
    const countQuery = `
      SELECT COUNT(*) FROM (
        SELECT e.id
        FROM etudiants e
        JOIN promotions p ON e.promotion_id = p.id
        LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
        WHERE p.actif = true
        ${searchCondition}
        GROUP BY e.id, p.montant_du
        HAVING COALESCE(SUM(pa.montant), 0) > p.montant_du
      ) AS subquery
    `;
    const countParams = search ? [`%${search}%`] : [];
    const countRes = await pool.query(countQuery, countParams);
    const total = parseInt(countRes.rows[0].count);
    return {
      excedents: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  }
};

export default PaiementModel;