/**
 * Centre d'attention financier : agrège les paiements qui nécessitent une
 * intervention sans modifier le schéma existant de la base de données.
 */
import pool from '../config/db.js';

export const getAttentionNotifications = async (req, res) => {
  try {
    const [reviewResult, reviewCountResult, excessResult, excessCountResult] = await Promise.all([
      pool.query(`
        SELECT id, reference_paiement, montant, date_paiement, description_brute
        FROM paiements
        WHERE statut = 'en_revue'
        ORDER BY date_paiement DESC, id DESC
        LIMIT 5
      `),
      pool.query(`SELECT COUNT(*)::int AS total FROM paiements WHERE statut = 'en_revue'`),
      pool.query(`
        SELECT
          e.id AS etudiant_id,
          e.matricule,
          e.nom_complet,
          p.montant_du,
          COALESCE(SUM(pa.montant), 0) AS total_paye,
          COALESCE(SUM(pa.montant), 0) - p.montant_du AS excedent
        FROM etudiants e
        JOIN promotions p ON e.promotion_id = p.id
        LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
        WHERE p.actif = true
        GROUP BY e.id, e.matricule, e.nom_complet, p.montant_du
        HAVING COALESCE(SUM(pa.montant), 0) > p.montant_du
        ORDER BY excedent DESC, e.id DESC
        LIMIT 5
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT e.id
          FROM etudiants e
          JOIN promotions p ON e.promotion_id = p.id
          LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
          WHERE p.actif = true
          GROUP BY e.id, p.montant_du
          HAVING COALESCE(SUM(pa.montant), 0) > p.montant_du
        ) attention_excedents
      `)
    ]);

    const manualReviewCount = Number(reviewCountResult.rows[0]?.total || 0);
    const excessCount = Number(excessCountResult.rows[0]?.total || 0);

    return res.json({
      total: manualReviewCount + excessCount,
      counts: {
        manualReview: manualReviewCount,
        excess: excessCount
      },
      manualReview: reviewResult.rows.map((row) => ({
        ...row,
        montant: Number(row.montant || 0)
      })),
      excess: excessResult.rows.map((row) => ({
        ...row,
        montant_du: Number(row.montant_du || 0),
        total_paye: Number(row.total_paye || 0),
        excedent: Number(row.excedent || 0)
      })),
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Erreur centre de notifications:', error);
    return res.status(500).json({ message: 'Impossible de charger les notifications financières.' });
  }
};
