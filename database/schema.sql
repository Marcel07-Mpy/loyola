BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS utilisateurs (
  id SERIAL PRIMARY KEY,
  username VARCHAR(120) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('admin', 'agent_financier')),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facultes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  libelle VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS filieres (
  id SERIAL PRIMARY KEY,
  faculte_id INTEGER NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
  code VARCHAR(32) NOT NULL,
  libelle VARCHAR(255) NOT NULL,
  CONSTRAINT filieres_faculte_code_unique UNIQUE (faculte_id, code)
);

CREATE TABLE IF NOT EXISTS niveaux (
  id SERIAL PRIMARY KEY,
  filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
  code VARCHAR(32) NOT NULL,
  libelle VARCHAR(255) NOT NULL,
  CONSTRAINT niveaux_filiere_code_unique UNIQUE (filiere_id, code)
);

CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  libelle VARCHAR(255) NOT NULL,
  faculte_id INTEGER NOT NULL REFERENCES facultes(id) ON DELETE RESTRICT,
  filiere_id INTEGER NOT NULL REFERENCES filieres(id) ON DELETE RESTRICT,
  niveau_id INTEGER NOT NULL REFERENCES niveaux(id) ON DELETE RESTRICT,
  annee_debut INTEGER NOT NULL,
  annee_fin INTEGER NOT NULL,
  montant_du NUMERIC(14,2) NOT NULL CHECK (montant_du > 0),
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT promotions_annees_valides CHECK (annee_fin = annee_debut + 1),
  CONSTRAINT promotions_parcours_annee_unique
    UNIQUE (faculte_id, filiere_id, niveau_id, annee_debut, annee_fin)
);

CREATE TABLE IF NOT EXISTS etudiants (
  id SERIAL PRIMARY KEY,
  matricule VARCHAR(64) NOT NULL UNIQUE,
  nom_complet VARCHAR(255) NOT NULL,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS paiements (
  id SERIAL PRIMARY KEY,
  reference_paiement VARCHAR(200) NOT NULL UNIQUE,
  description_brute VARCHAR(1000) NOT NULL,
  date_paiement TIMESTAMPTZ NOT NULL,
  montant NUMERIC(14,2) NOT NULL CHECK (montant <> 0),
  matricule_extrait VARCHAR(128),
  niveau_extrait VARCHAR(64),
  faculte_extrait VARCHAR(64),
  tokens_nom TEXT[],
  statut VARCHAR(32) NOT NULL DEFAULT 'en_revue'
    CHECK (statut IN ('en_revue', 'attribue', 'annule')),
  etudiant_id INTEGER REFERENCES etudiants(id) ON DELETE SET NULL,
  score_composite DOUBLE PRECISION,
  attribue_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  commentaire_attribution TEXT,
  date_attribution TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_attributions_manuelles (
  id SERIAL PRIMARY KEY,
  paiement_id INTEGER REFERENCES paiements(id) ON DELETE SET NULL,
  agent_id INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  etudiant_id INTEGER REFERENCES etudiants(id) ON DELETE SET NULL,
  commentaire TEXT NOT NULL,
  horodatage TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_commentaire_obligatoire CHECK (BTRIM(commentaire) <> '')
);

CREATE INDEX IF NOT EXISTS idx_filieres_faculte_id ON filieres(faculte_id);
CREATE INDEX IF NOT EXISTS idx_niveaux_filiere_id ON niveaux(filiere_id);
CREATE INDEX IF NOT EXISTS idx_promotions_faculte_id ON promotions(faculte_id);
CREATE INDEX IF NOT EXISTS idx_promotions_filiere_id ON promotions(filiere_id);
CREATE INDEX IF NOT EXISTS idx_promotions_niveau_id ON promotions(niveau_id);
CREATE INDEX IF NOT EXISTS idx_promotions_actif ON promotions(actif);
CREATE INDEX IF NOT EXISTS idx_etudiants_promotion_id ON etudiants(promotion_id);
CREATE INDEX IF NOT EXISTS idx_etudiants_matricule_exact ON etudiants(matricule);
CREATE INDEX IF NOT EXISTS idx_etudiants_nom_complet_trgm
  ON etudiants USING gin (LOWER(nom_complet) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_paiements_statut ON paiements(statut);
CREATE INDEX IF NOT EXISTS idx_paiements_etudiant_id ON paiements(etudiant_id);
CREATE INDEX IF NOT EXISTS idx_paiements_date_paiement ON paiements(date_paiement DESC);
CREATE INDEX IF NOT EXISTS idx_paiements_reference ON paiements(reference_paiement);
CREATE INDEX IF NOT EXISTS idx_audit_horodatage ON audit_attributions_manuelles(horodatage DESC);
CREATE INDEX IF NOT EXISTS idx_audit_agent_id ON audit_attributions_manuelles(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_etudiant_id ON audit_attributions_manuelles(etudiant_id);

COMMIT;
