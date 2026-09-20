/**
 * Modèle user model. Centralise les requêtes PostgreSQL et la transformation des données de ce domaine.
 */
import pool from '../config/db.js';

const UserModel = {
  // Trouver un utilisateur par son username
  findByUsername: async (username) => {
    const result = await pool.query(
      'SELECT id, username, password_hash, role, actif, created_at FROM utilisateurs WHERE username = $1',
      [username]
    );
    return result.rows[0];
  },

  // Trouver par ID
  findById: async (id) => {
    const result = await pool.query(
      'SELECT id, username, role, actif, created_at FROM utilisateurs WHERE id = $1',
      [id]
    );
    return result.rows[0];
  },

  // Lister tous les utilisateurs (avec pagination)
  findAll: async (limit = 10, offset = 0) => {
    const result = await pool.query(
      `SELECT id, username, role, actif, created_at 
       FROM utilisateurs 
       ORDER BY created_at DESC 
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const countResult = await pool.query('SELECT COUNT(*) FROM utilisateurs');
    return {
      users: result.rows,
      total: parseInt(countResult.rows[0].count)
    };
  },

  // Créer un utilisateur
  create: async (username, passwordHash, role) => {
    const result = await pool.query(
      `INSERT INTO utilisateurs (username, password_hash, role, actif) 
       VALUES ($1, $2, $3, true) 
       RETURNING id, username, role, actif, created_at`,
      [username, passwordHash, role]
    );
    return result.rows[0];
  },

  // Mettre à jour (mot de passe, rôle, actif)
  update: async (id, { username, passwordHash, role, actif }) => {
    let query = 'UPDATE utilisateurs SET ';
    const updates = [];
    const values = [];
    let idx = 1;
    if (username !== undefined) {
      updates.push(`username = $${idx++}`);
      values.push(username);
    }
    if (passwordHash !== undefined) {
      updates.push(`password_hash = $${idx++}`);
      values.push(passwordHash);
    }
    if (role !== undefined) {
      updates.push(`role = $${idx++}`);
      values.push(role);
    }
    if (actif !== undefined) {
      updates.push(`actif = $${idx++}`);
      values.push(actif);
    }
    if (updates.length === 0) return null;
    values.push(id);
    query += updates.join(', ') + ` WHERE id = $${idx} RETURNING id, username, role, actif, created_at`;
    const result = await pool.query(query, values);
    return result.rows[0];
  },

  // Supprimer un utilisateur
  delete: async (id) => {
    const result = await pool.query('DELETE FROM utilisateurs WHERE id = $1 RETURNING id', [id]);
    return result.rows[0];
  },

  // Compter les admins actifs
  countAdmins: async () => {
    const result = await pool.query("SELECT COUNT(*) FROM utilisateurs WHERE role = 'admin' AND actif = true");
    return parseInt(result.rows[0].count);
  }
};

export default UserModel;