ALTER TABLE audit_attributions_manuelles
ALTER COLUMN paiement_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_commentaire_obligatoire'
      AND conrelid = 'audit_attributions_manuelles'::regclass
  ) THEN
    ALTER TABLE audit_attributions_manuelles
    ADD CONSTRAINT audit_commentaire_obligatoire
    CHECK (commentaire IS NOT NULL AND BTRIM(commentaire) <> '') NOT VALID;
  END IF;
END
$$;
