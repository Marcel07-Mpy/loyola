/**
 * Contrôleur revue controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import PaiementModel from '../models/PaiementModel.js';
import { getCandidatsForPaiement } from '../services/matchingService.js';
import pool from '../config/db.js';

export const getPaiementsRevue = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = (req.query.search || '').trim();
    const data = await PaiementModel.findByStatut('en_revue', page, limit, search);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur récupération paiements' });
  }
};

export const getCandidats = async (req, res) => {
  try {
    const { id } = req.params;
    const paiement = await PaiementModel.findById(id);
    if (!paiement) return res.status(404).json({ message: 'Paiement non trouvé' });
    const candidats = await getCandidatsForPaiement(paiement.description_brute);
    res.json({ paiement, candidats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const rechercherEtudiants = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);
    const result = await pool.query(
      `SELECT e.id, e.matricule, e.nom_complet,
              p.libelle as promotion_libelle, p.annee_debut, p.annee_fin,
              f.code as faculte_code, f.libelle as faculte_libelle,
              fi.code as filiere_code, fi.libelle as filiere_libelle,
              n.code as niveau_code, n.libelle as niveau_libelle
       FROM etudiants e
       JOIN promotions p ON e.promotion_id = p.id
       JOIN facultes f ON p.faculte_id = f.id
       JOIN filieres fi ON p.filiere_id = fi.id
       JOIN niveaux n ON p.niveau_id = n.id
       WHERE p.actif = true 
         AND (e.matricule ILIKE $1 OR e.nom_complet ILIKE $1)
       LIMIT 10`,
      [`%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const attribuerPaiement = async (req, res) => {
  try {
    const { id } = req.params;
    const { etudiant_id } = req.body;
    const commentaire = typeof req.body.commentaire === 'string'
      ? req.body.commentaire.replace(/\s+/g, ' ').trim()
      : '';
    if (!etudiant_id) {
      return res.status(400).json({ message: 'Veuillez sélectionner un étudiant.' });
    }
    if (commentaire.length < 31) {
      return res.status(400).json({ message: 'Le commentaire doit contenir au moins 31 caractères.' });
    }
    const userId = req.user.id; // Récupéré depuis le middleware authenticate
    const updated = await PaiementModel.attribuer(id, etudiant_id, userId, commentaire);
    res.json({ message: 'Paiement validé', paiement: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};