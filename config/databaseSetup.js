/**
 * Prépare PostgreSQL pour l'application sans modifier une base déjà initialisée.
 * Sur une base neuve (ex. Neon), le schéma et les référentiels sont créés une fois.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from './db.js';
import { hashPassword } from '../services/authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bootstrapSqlPath = path.join(__dirname, '..', 'database', 'bootstrap.sql');
const BOOTSTRAP_LOCK_ID = 27092026;

let databaseCapabilities = Object.freeze({ pgTrgm: false });
let readinessPromise = null;

const tableExists = async (client, tableName) => {
  const result = await client.query('SELECT to_regclass($1) AS relation', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.relation);
};

const initializeEmptyDatabase = async (client) => {
  if (await tableExists(client, 'utilisateurs')) return;

  await client.query('SELECT pg_advisory_lock($1)', [BOOTSTRAP_LOCK_ID]);
  try {
    if (await tableExists(client, 'utilisateurs')) return;
    const sql = await readFile(bootstrapSqlPath, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    console.log('✅ Schéma PostgreSQL Loyola Finance initialisé');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [BOOTSTRAP_LOCK_ID]);
  }
};

const ensureBootstrapAdmin = async (client) => {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return;

  const username = process.env.ADMIN_USERNAME || 'admin';
  const existing = await client.query(
    'SELECT id FROM utilisateurs WHERE username = $1 LIMIT 1',
    [username]
  );
  if (existing.rowCount > 0) return;

  const passwordHash = await hashPassword(password);
  await client.query(
    `INSERT INTO utilisateurs (username, password_hash, role, actif)
     VALUES ($1, $2, 'admin', true)
     ON CONFLICT (username) DO NOTHING`,
    [username, passwordHash]
  );
};

export const ensureDatabaseReady = async () => {
  if (!readinessPromise) {
    readinessPromise = (async () => {
      const client = await pool.connect();
      try {
        await initializeEmptyDatabase(client);
        await ensureBootstrapAdmin(client);
      } finally {
        client.release();
      }
      return inspectDatabaseFeatures();
    })().catch((error) => {
      readinessPromise = null;
      throw error;
    });
  }
  return readinessPromise;
};

export const inspectDatabaseFeatures = async () => {
  const result = await pool.query(`
    SELECT EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE p.proname = 'similarity'
        AND pg_get_function_identity_arguments(p.oid) = 'text, text'
    ) AS pg_trgm_available
  `);

  databaseCapabilities = Object.freeze({
    pgTrgm: Boolean(result.rows[0]?.pg_trgm_available)
  });

  return databaseCapabilities;
};

export const getDatabaseCapabilities = () => databaseCapabilities;

export const setDatabaseCapabilities = (capabilities = {}) => {
  databaseCapabilities = Object.freeze({
    pgTrgm: Boolean(capabilities.pgTrgm)
  });
};
