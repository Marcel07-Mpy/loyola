/**
 * Vérifie les capacités nécessaires de PostgreSQL au démarrage sans modifier le schéma de la base.
 */
import pool from './db.js';

let databaseCapabilities = Object.freeze({
  pgTrgm: false
});

/**
 * Vérifie uniquement les capacités déjà disponibles dans PostgreSQL.
 * Aucune instruction DDL n'est exécutée ici : le schéma et les données
 * existants restent strictement inchangés.
 */
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
