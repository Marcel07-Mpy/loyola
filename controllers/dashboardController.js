/**
 * Contrôleur dashboard controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import pool from '../config/db.js';

export const getDashboardStats = async (req, res) => {
  try {
    const { faculte_id, promotion_id, annee_debut } = req.query;
    let whereConditions = [];
    let params = [];
    let idx = 1;

    if (faculte_id && faculte_id !== '') {
      whereConditions.push(`p.faculte_id = $${idx++}`);
      params.push(faculte_id);
    }
    if (promotion_id && promotion_id !== '') {
      whereConditions.push(`e.promotion_id = $${idx++}`);
      params.push(promotion_id);
    }
    if (annee_debut && annee_debut !== '') {
      whereConditions.push(`p.annee_debut = $${idx++}`);
      params.push(annee_debut);
    }

    const whereClause = whereConditions.length ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Requête pour les agrégats
    const statsQuery = `
      SELECT 
        COALESCE(SUM(p.montant_du), 0) as total_attendu,
        COALESCE(SUM(pa.montant_paye), 0) as total_paye,
        COUNT(DISTINCT e.id) as nb_etudiants,
        SUM(CASE WHEN COALESCE(pa.montant_paye, 0) >= p.montant_du THEN 1 ELSE 0 END) as nb_payes,
        SUM(CASE WHEN COALESCE(pa.montant_paye, 0) = 0 THEN 1 ELSE 0 END) as nb_impayes
      FROM etudiants e
      JOIN promotions p ON e.promotion_id = p.id
      LEFT JOIN (
        SELECT etudiant_id, SUM(montant) as montant_paye
        FROM paiements
        WHERE statut = 'attribue'
        GROUP BY etudiant_id
      ) pa ON pa.etudiant_id = e.id
      ${whereClause}
    `;
    const statsRes = await pool.query(statsQuery, params);
    const stats = statsRes.rows[0];
    const totalRestant = Number(stats.total_attendu) - Number(stats.total_paye);

    // Excédent réel agrégé par étudiant (sans compenser les étudiants encore débiteurs).
    const excedentQuery = `
      SELECT COALESCE(SUM(GREATEST(student_finance.total_paye - student_finance.montant_du, 0)), 0) AS total_excedent
      FROM (
        SELECT e.id, p.montant_du, COALESCE(SUM(pa.montant), 0) AS total_paye
        FROM etudiants e
        JOIN promotions p ON e.promotion_id = p.id
        LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
        ${whereClause}
        GROUP BY e.id, p.montant_du
      ) student_finance
    `;
    const excedentRes = await pool.query(excedentQuery, params);
    const totalExcedent = Number(excedentRes.rows[0]?.total_excedent || 0);

    // Données pour le graphique par faculté (montant payé par faculté)
    const facultesQuery = `
      SELECT f.libelle, COALESCE(SUM(pa.montant_paye), 0) as total
      FROM facultes f
      LEFT JOIN promotions p ON p.faculte_id = f.id
      LEFT JOIN etudiants e ON e.promotion_id = p.id
      LEFT JOIN (
        SELECT etudiant_id, SUM(montant) as montant_paye
        FROM paiements
        WHERE statut = 'attribue'
        GROUP BY etudiant_id
      ) pa ON pa.etudiant_id = e.id
      WHERE f.code IN ('FAST', 'FSAV', 'FSEG', 'PHILO')
      GROUP BY f.id, f.libelle
      ORDER BY f.id
    `;
    const facultesRes = await pool.query(facultesQuery);
    const paiementsParFaculte = facultesRes.rows;

    // Évolution temporelle des encaissements attribués. Les mêmes filtres que
    // les KPI sont appliqués afin que le graphique reste cohérent avec l'écran.
    const evolutionFilter = whereConditions.length ? `AND ${whereConditions.join(' AND ')}` : '';
    const evolutionQuery = `
      SELECT
        DATE_TRUNC('month', pa.date_paiement) AS mois,
        COALESCE(SUM(pa.montant), 0) AS total
      FROM paiements pa
      JOIN etudiants e ON pa.etudiant_id = e.id
      JOIN promotions p ON e.promotion_id = p.id
      WHERE pa.statut = 'attribue'
      ${evolutionFilter}
      GROUP BY mois
      ORDER BY mois
    `;
    const evolutionRes = await pool.query(evolutionQuery, params);
    const evolution = evolutionRes.rows;

    res.json({
      kpi: {
        total_attendu: parseFloat(stats.total_attendu),
        total_paye: parseFloat(stats.total_paye),
        total_restant: parseFloat(totalRestant),
        total_excedent: totalExcedent,
        nb_etudiants: parseInt(stats.nb_etudiants),
        nb_payes: parseInt(stats.nb_payes),
        nb_impayes: parseInt(stats.nb_impayes)
      },
      paiementsParFaculte,
      evolution
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur récupération dashboard' });
  }
};