/**
 * Modèle faculte model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const FaculteModel = {
  findAll: async () => {
    const result = await pool.query('SELECT id, code, libelle FROM facultes ORDER BY id');
    return result.rows;
  },
  findByCode: async (code) => {
    const result = await pool.query('SELECT * FROM facultes WHERE code = $1', [code]);
    return result.rows[0];
  },
  findById: async (id) => {
    const result = await pool.query('SELECT * FROM facultes WHERE id = $1', [id]);
    return result.rows[0];
  }
};

export default FaculteModel;