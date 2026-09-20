/**
 * Initialise une base PostgreSQL vide pour Loyola Finance.
 * Idempotent : peut être relancé sans recréer les données métier.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const sqlFiles = [
  'database/schema.sql',
  'database/migrations/001_matching_hybride.sql',
  'database/migrations/002_tracabilite_audit.sql',
  'database/seed.sql',
];

const main = async () => {
  const client = await pool.connect();
  try {
    for (const relativePath of sqlFiles) {
      const sql = await readFile(path.join(root, relativePath), 'utf8');
      await client.query(sql);
      console.log(`✅ ${relativePath}`);
    }
    console.log('✅ Base Loyola Finance initialisée.');
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((error) => {
  console.error('❌ Initialisation PostgreSQL échouée :', error.message);
  process.exit(1);
});
