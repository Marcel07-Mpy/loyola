/**
 * Script utilitaire create admin. Automatise une opération de maintenance ou de préparation du projet.
 */
import dotenv from 'dotenv';
import pool from '../config/db.js';
import { hashPassword } from '../services/authService.js';

dotenv.config();

const createAdmin = async () => {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error('ADMIN_PASSWORD est requis pour créer le compte administrateur.');
  }
  const hashed = await hashPassword(password);
  try {
    await pool.query(
      `INSERT INTO utilisateurs (username, password_hash, role, actif) 
       VALUES ($1, $2, 'admin', true)
       ON CONFLICT (username) DO NOTHING`,
      [username, hashed]
    );
    console.log('✅ Admin créé ou déjà existant');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

createAdmin();