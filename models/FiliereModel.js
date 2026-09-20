/**
 * Modèle filiere model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const FiliereModel = {
  findByFaculteId: async (faculteId) => {
    const result = await pool.query(
      'SELECT id, code, libelle FROM filieres WHERE faculte_id = $1 ORDER BY id',
      [faculteId]
    );
    return result.rows;
  },
  findById: async (id) => {
    const result = await pool.query('SELECT * FROM filieres WHERE id = $1', [id]);
    return result.rows[0];
  }
};

export default FiliereModel;