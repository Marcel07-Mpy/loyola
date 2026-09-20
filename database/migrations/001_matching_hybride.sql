CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_etudiants_nom_complet_trgm
ON etudiants USING gin (LOWER(nom_complet) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_etudiants_matricule_exact
ON etudiants (matricule);
