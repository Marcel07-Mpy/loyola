/**
 * Contrôleur excedent controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import pool from '../config/db.js';

export const getExcedents = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';
    const PaiementModel = (await import('../models/PaiementModel.js')).default;
    const data = await PaiementModel.findExcedents(search, page, limit);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur récupération excédents' });
  }
};

export const getDetailsExcedent = async (req, res) => {
  try {
    const { etudiantId } = req.params;
    const etudiantQuery = `
      SELECT e.id, e.matricule, e.nom_complet,
             p.libelle as promotion_libelle, p.annee_debut, p.annee_fin, p.montant_du,
             f.code as faculte_code, f.libelle as faculte_libelle,
             fi.code as filiere_code, fi.libelle as filiere_libelle,
             n.code as niveau_code, n.libelle as niveau_libelle
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      WHERE e.id = $1
    `;
    const etudiantRes = await pool.query(etudiantQuery, [etudiantId]);
    if (etudiantRes.rows.length === 0) return res.status(404).json({ message: 'Étudiant non trouvé' });

    const etudiant = etudiantRes.rows[0];
    const paiementsQuery = `
      SELECT reference_paiement, date_paiement, montant, description_brute, date_attribution
      FROM paiements
      WHERE etudiant_id = $1 AND statut = 'attribue'
      ORDER BY date_paiement DESC
    `;
    const paiementsRes = await pool.query(paiementsQuery, [etudiantId]);
    const totalPaye = paiementsRes.rows.reduce((sum, paiement) => sum + parseFloat(paiement.montant), 0);
    const excedent = totalPaye - parseFloat(etudiant.montant_du);

    return res.json({
      etudiant,
      paiements: paiementsRes.rows,
      totalPaye,
      excedent
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: err.message });
  }
};

export const validerRemboursement = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { etudiantId } = req.params;
    const commentaire = typeof req.body.commentaire === 'string'
      ? req.body.commentaire.replace(/\s+/g, ' ').trim()
      : '';
    const userId = req.user.id;

    if (commentaire.length < 31) {
      return res.status(400).json({ message: 'Le commentaire doit contenir au moins 31 caractères.' });
    }

    await client.query('BEGIN');
    transactionStarted = true;

    // Verrouille l'étudiant pour empêcher deux remboursements simultanés
    // de consommer le même excédent.
    const studentLock = await client.query(
      'SELECT id FROM etudiants WHERE id = $1 FOR UPDATE',
      [etudiantId]
    );

    if (studentLock.rowCount === 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(404).json({ message: 'Étudiant non trouvé' });
    }

    const checkRes = await client.query(
      `SELECT COALESCE(SUM(pa.montant), 0) AS total_paye, p.montant_du
       FROM etudiants e
       JOIN promotions p ON e.promotion_id = p.id
       LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
       WHERE e.id = $1
       GROUP BY p.montant_du`,
      [etudiantId]
    );

    const totalPaye = parseFloat(checkRes.rows[0].total_paye);
    const montantDu = parseFloat(checkRes.rows[0].montant_du);
    const excedent = totalPaye - montantDu;

    if (excedent <= 0) {
      await client.query('ROLLBACK');
      transactionStarted = false;
      return res.status(400).json({ message: 'Aucun excédent à rembourser' });
    }

    // L'opération négative reste dans l'historique financier et son identifiant
    // est utilisé par l'audit. Cette approche garantit l'intégrité sans exiger
    // aucune modification du schéma existant de la base de données.
    const remboursementRef = `RMB-${Date.now()}-${etudiantId}`;
    const remboursementRes = await client.query(
      `INSERT INTO paiements
       (reference_paiement, description_brute, date_paiement, montant, statut,
        etudiant_id, attribue_par, commentaire_attribution, date_attribution)
       VALUES ($1, $2, NOW(), $3, 'attribue', $4, $5, $6, NOW())
       RETURNING id`,
      [
        remboursementRef,
        `Remboursement excédent pour étudiant ${etudiantId}`,
        -excedent,
        etudiantId,
        userId,
        commentaire
      ]
    );

    const remboursementPaiementId = remboursementRes.rows[0].id;
    await client.query(
      `INSERT INTO audit_attributions_manuelles
       (paiement_id, agent_id, etudiant_id, commentaire, horodatage)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        remboursementPaiementId,
        userId,
        etudiantId,
        `REMBOURSEMENT VALIDÉ : ${commentaire}`
      ]
    );

    await client.query('COMMIT');
    transactionStarted = false;

    return res.json({
      message: 'Remboursement validé avec succès',
      montant_rembourse: excedent,
      reference_remboursement: remboursementRef
    });
  } catch (err) {
    if (transactionStarted) await client.query('ROLLBACK');
    console.error(err);
    return res.status(500).json({ message: err.message });
  } finally {
    client.release();
  }
};
