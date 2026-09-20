/**
 * Contrôleur promotion controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import PromotionModel from '../models/PromotionModel.js';
import FaculteModel from '../models/FaculteModel.js';
import FiliereModel from '../models/FiliereModel.js';
import NiveauModel from '../models/NiveauModel.js';
import pool from '../config/db.js';

// Helper pour générer le libellé automatique
const generateLibelle = (faculte, filiere, niveau, annee_debut, annee_fin) => {
  return `${faculte.libelle} ${filiere.libelle} ${niveau.code} ${annee_debut}-${annee_fin}`.toUpperCase();
};

// Récupérer toutes les promotions avec pagination et filtres
export const getPromotions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const filters = {
      faculte_id: req.query.faculte_id || null,
      filiere_id: req.query.filiere_id || null,
      niveau_id: req.query.niveau_id || null,
      libelle: req.query.libelle || null
    };
    const data = await PromotionModel.findAll(filters, page, limit);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la récupération des promotions' });
  }
};

// Récupérer toutes les facultés
export const getFacultes = async (req, res) => {
  try {
    const facultes = await FaculteModel.findAll();
    res.json(facultes);
  } catch (err) {
    res.status(500).json({ message: 'Erreur chargement facultés' });
  }
};

// Récupérer les filières d'une faculté
export const getFilieresByFaculte = async (req, res) => {
  try {
    const { faculteId } = req.params;
    const filieres = await FiliereModel.findByFaculteId(faculteId);
    res.json(filieres);
  } catch (err) {
    res.status(500).json({ message: 'Erreur chargement filières' });
  }
};

// Récupérer les niveaux d'une filière
export const getNiveauxByFiliere = async (req, res) => {
  try {
    const { filiereId } = req.params;
    const niveaux = await NiveauModel.findByFiliereId(filiereId);
    res.json(niveaux);
  } catch (err) {
    res.status(500).json({ message: 'Erreur chargement niveaux' });
  }
};

// Récupérer les promotions actives selon critères (cascade)
export const getPromotionsByCriteres = async (req, res) => {
  try {
    const { faculte_id, filiere_id, niveau_id, annee_debut } = req.query;
    let query = `
      SELECT
        p.id,
        p.libelle,
        p.annee_debut,
        p.annee_fin,
        f.code AS faculte_code,
        f.libelle AS faculte_libelle,
        fi.code AS filiere_code,
        fi.libelle AS filiere_libelle,
        n.code AS niveau_code,
        n.libelle AS niveau_libelle
      FROM promotions p
      JOIN facultes f ON p.faculte_id = f.id
      JOIN filieres fi ON p.filiere_id = fi.id
      JOIN niveaux n ON p.niveau_id = n.id
      WHERE p.actif = true`;
    const values = [];
    let idx = 1;
    if (faculte_id) {
      query += ` AND p.faculte_id = $${idx++}`;
      values.push(faculte_id);
    }
    if (filiere_id) {
      query += ` AND p.filiere_id = $${idx++}`;
      values.push(filiere_id);
    }
    if (niveau_id) {
      query += ` AND p.niveau_id = $${idx++}`;
      values.push(niveau_id);
    }
    if (annee_debut) {
      query += ` AND p.annee_debut = $${idx++}`;
      values.push(annee_debut);
    }
    query += ` ORDER BY p.libelle`;
    const result = await pool.query(query, values);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Créer une promotion
export const createPromotion = async (req, res) => {
  try {
    let { faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif } = req.body;
    montant_du = parseFloat(montant_du);
    if (!faculte_id || !filiere_id || !niveau_id || !annee_debut || !annee_fin || !montant_du || montant_du <= 0) {
      return res.status(400).json({ message: 'Tous les champs sont requis et le montant doit être > 0' });
    }
    // Validation année académique
    if (parseInt(annee_fin) !== parseInt(annee_debut) + 1) {
      return res.status(400).json({ message: "L'année de fin doit être égale à l'année de début + 1" });
    }
    // Récupérer les libellés pour générer le libellé automatique
    const faculte = await FaculteModel.findById(faculte_id);
    const filiere = await FiliereModel.findById(filiere_id);
    const niveau = await NiveauModel.findById(niveau_id);
    if (!faculte || !filiere || !niveau) {
      return res.status(400).json({ message: 'Références invalides (faculté, filière ou niveau inexistant)' });
    }
    const libelle = generateLibelle(faculte, filiere, niveau, annee_debut, annee_fin);
    // Vérifier unicité
    const isUnique = await PromotionModel.checkUnique(faculte_id, filiere_id, niveau_id, annee_debut, annee_fin);
    if (!isUnique) {
      return res.status(409).json({ message: 'Cette promotion existe déjà (combinaison faculté/filière/niveau/année unique).' });
    }
    const newPromo = await PromotionModel.create(libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif !== undefined ? actif : true);
    res.status(201).json(newPromo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message || 'Erreur serveur' });
  }
};

// Modifier une promotion
export const updatePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const { faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif } = req.body;
    if (montant_du <= 0) {
      return res.status(400).json({ message: 'Le montant doit être > 0' });
    }
    if (parseInt(annee_fin) !== parseInt(annee_debut) + 1) {
      return res.status(400).json({ message: "L'année de fin doit être l'année de début + 1" });
    }
    const existing = await PromotionModel.findById(id);
    if (!existing) return res.status(404).json({ message: 'Promotion non trouvée' });
    // Récupérer les libellés
    const faculte = await FaculteModel.findById(faculte_id);
    const filiere = await FiliereModel.findById(filiere_id);
    const niveau = await NiveauModel.findById(niveau_id);
    if (!faculte || !filiere || !niveau) {
      return res.status(400).json({ message: 'Références invalides' });
    }
    const libelle = generateLibelle(faculte, filiere, niveau, annee_debut, annee_fin);
    const isUnique = await PromotionModel.checkUnique(faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, id);
    if (!isUnique) {
      return res.status(409).json({ message: 'Conflit : une promotion avec ces attributs existe déjà.' });
    }
    const updated = await PromotionModel.update(id, { libelle, faculte_id, filiere_id, niveau_id, annee_debut, annee_fin, montant_du, actif });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

// Supprimer une promotion (vérification étudiants)
export const deletePromotion = async (req, res) => {
  try {
    const { id } = req.params;
    const promo = await PromotionModel.findById(id);
    if (!promo) return res.status(404).json({ message: 'Promotion non trouvée' });
    if (promo.nb_etudiants > 0) {
      return res.status(400).json({ message: 'Impossible de supprimer : des étudiants sont inscrits.' });
    }
    await PromotionModel.delete(id);
    res.json({ message: 'Promotion supprimée avec succès' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};