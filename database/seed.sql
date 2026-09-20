-- Activer l'extension si ce n'est pas déjà fait
CREATE EXTENSION IF NOT EXISTS pg_trgm;

INSERT INTO facultes (code, libelle) VALUES
('FAST', 'Faculté des Sciences et Technologies'),
('FSAV', 'Faculté des Sciences Agronomiques et Vétérinaires'),
('FSEG', 'Faculté des Sciences Économiques et de Gestion'),
('PHILO', 'Faculté de Philosophie Saint-Pierre Canisius')
ON CONFLICT (code) DO NOTHING;

INSERT INTO filieres (faculte_id, code, libelle)
SELECT f.id, 'GI', 'Génie Informatique'
FROM facultes f WHERE f.code = 'FAST'
UNION ALL
SELECT f.id, 'GINDUS', 'Génie Industriel'
FROM facultes f WHERE f.code = 'FAST'
UNION ALL
SELECT f.id, 'PO', 'Parcours Ouvert'
FROM facultes f WHERE f.code = 'FAST'
ON CONFLICT (faculte_id, code) DO NOTHING;

WITH gi AS (SELECT id FROM filieres WHERE code = 'GI' AND faculte_id = (SELECT id FROM facultes WHERE code = 'FAST'))
INSERT INTO niveaux (filiere_id, code, libelle)
SELECT gi.id, 'Xp', 'Classe préparatoire' FROM gi
UNION ALL SELECT gi.id, 'X1', 'Licence 1' FROM gi
UNION ALL SELECT gi.id, 'X2', 'Licence 2' FROM gi
UNION ALL SELECT gi.id, 'X3', 'Licence 3' FROM gi
UNION ALL SELECT gi.id, 'X4', 'Master 1' FROM gi
UNION ALL SELECT gi.id, 'X5', 'Master 2' FROM gi
ON CONFLICT (filiere_id, code) DO NOTHING;

WITH gindus AS (SELECT id FROM filieres WHERE code = 'GINDUS' AND faculte_id = (SELECT id FROM facultes WHERE code = 'FAST'))
INSERT INTO niveaux (filiere_id, code, libelle)
SELECT gindus.id, 'Lp', 'Classe préparatoire' FROM gindus
UNION ALL SELECT gindus.id, 'L1', 'Licence 1' FROM gindus
UNION ALL SELECT gindus.id, 'L2', 'Licence 2' FROM gindus
UNION ALL SELECT gindus.id, 'L3', 'Licence 3' FROM gindus
UNION ALL SELECT gindus.id, 'I4', 'Master 1' FROM gindus
UNION ALL SELECT gindus.id, 'I5', 'Master 2' FROM gindus
ON CONFLICT (filiere_id, code) DO NOTHING;

WITH po AS (SELECT id FROM filieres WHERE code = 'PO' AND faculte_id = (SELECT id FROM facultes WHERE code = 'FAST'))
INSERT INTO niveaux (filiere_id, code, libelle)
SELECT po.id, 'Op', 'Classe préparatoire' FROM po
UNION ALL SELECT po.id, 'O1', 'Licence 1' FROM po
UNION ALL SELECT po.id, 'O2', 'Licence 2' FROM po
UNION ALL SELECT po.id, 'O3', 'Licence 3' FROM po
UNION ALL SELECT po.id, 'A4', 'Master 1' FROM po
UNION ALL SELECT po.id, 'A5', 'Master 2' FROM po
ON CONFLICT (filiere_id, code) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_etudiants_nom_complet_trgm
ON etudiants USING gin (LOWER(nom_complet) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_etudiants_matricule_exact
ON etudiants (matricule);
