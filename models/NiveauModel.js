/**
 * Modèle niveau model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const NiveauModel = {
  findByFiliereId: async (filiereId) => {
    const result = await pool.query(
      'SELECT id, code, libelle FROM niveaux WHERE filiere_id = $1 ORDER BY id',
      [filiereId]
    );
    return result.rows;
  },
  findById: async (id) => {
    const result = await pool.query('SELECT * FROM niveaux WHERE id = $1', [id]);
    return result.rows[0];
  }
};

export default NiveauModel;