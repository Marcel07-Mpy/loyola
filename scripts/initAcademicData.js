/**
 * Script utilitaire init academic data. Automatise une opération de maintenance ou de préparation du projet.
 */
import pool from '../config/db.js';
import dotenv from 'dotenv';
dotenv.config();

const init = async () => {
  try {
    // Insérer facultés
    await pool.query(`
      INSERT INTO facultes (code, libelle) VALUES
      ('FAST', 'Faculté des Sciences et Technologies'),
      ('FSAV', 'Faculté des Sciences Agronomiques et Vétérinaires'),
      ('FSEG', 'Faculté des Sciences Économiques et de Gestion'),
      ('PHILO', 'Faculté de Philosophie Saint-Pierre Canisius')
      ON CONFLICT (code) DO NOTHING;
    `);

    // Récupérer id de FAST
    const fast = await pool.query("SELECT id FROM facultes WHERE code = 'FAST'");
    const fastId = fast.rows[0].id;

    // Insérer filières FAST
    await pool.query(`
      INSERT INTO filieres (faculte_id, code, libelle) VALUES
      ($1, 'GI', 'Génie Informatique'),
      ($1, 'GINDUS', 'Génie Industriel'),
      ($1, 'PO', 'Parcours Ouvert')
      ON CONFLICT (faculte_id, code) DO NOTHING;
    `, [fastId]);

    // Récupérer ids des filières
    const gi = await pool.query("SELECT id FROM filieres WHERE code = 'GI' AND faculte_id = $1", [fastId]);
    const gindus = await pool.query("SELECT id FROM filieres WHERE code = 'GINDUS' AND faculte_id = $1", [fastId]);
    const po = await pool.query("SELECT id FROM filieres WHERE code = 'PO' AND faculte_id = $1", [fastId]);

    // Insérer niveaux pour GI
    const niveauxGI = ['Xp','X1','X2','X3','X4','X5'];
    for (const code of niveauxGI) {
      await pool.query(`
        INSERT INTO niveaux (filiere_id, code, libelle) VALUES ($1, $2, $3)
        ON CONFLICT (filiere_id, code) DO NOTHING;
      `, [gi.rows[0].id, code, code]);
    }
    // Niveaux pour GINDUS
    const niveauxGINDUS = ['Lp','L1','L2','L3','I4','I5'];
    for (const code of niveauxGINDUS) {
      await pool.query(`
        INSERT INTO niveaux (filiere_id, code, libelle) VALUES ($1, $2, $3)
        ON CONFLICT (filiere_id, code) DO NOTHING;
      `, [gindus.rows[0].id, code, code]);
    }
    // Niveaux pour PO
    const niveauxPO = ['Op','O1','O2','O3','A4','A5'];
    for (const code of niveauxPO) {
      await pool.query(`
        INSERT INTO niveaux (filiere_id, code, libelle) VALUES ($1, $2, $3)
        ON CONFLICT (filiere_id, code) DO NOTHING;
      `, [po.rows[0].id, code, code]);
    }

    console.log('✅ Données académiques initialisées');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

init();