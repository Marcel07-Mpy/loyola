/**
 * Contrôleur des étudiants.
 *
 * Il regroupe les opérations CRUD, les imports/exports et la génération du
 * reçu académique, tout en déléguant l’accès aux données aux modèles.
 */
import EtudiantModel from '../models/EtudiantModel.js';
import PromotionModel from '../models/PromotionModel.js';
import { fileURLToPath } from 'node:url';
import { emitImportProgress } from '../utils/importProgress.js';
import { readFirstWorksheetMatrix } from '../utils/excelWorkbook.js';
import { buildStudentReceiptPdf } from '../services/receiptPdfService.js';
import { buildFinancialReportMetadata } from '../utils/financialReport.js';
import { buildFinancialReportWorkbook } from '../services/financialReportExcelService.js';

/**
 * Construit un nom de fichier PDF lisible à partir du nom complet.
 * Le fallback évite un en-tête Content-Disposition vide ou invalide.
 */
const buildReceiptFileName = (fullName) => {
  const readableName = String(fullName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(^|[\s'-])[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s'-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return `Recu_${readableName || 'Etudiant'}.pdf`;
};

// ======================================================
// CRUD ÉTUDIANTS
// ======================================================

export const getEtudiants = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const filters = {
      faculte_id: req.query.faculte_id || null,
      filiere_id: req.query.filiere_id || null,
      niveau_id: req.query.niveau_id || null,
      promotion_id: req.query.promotion_id || null,
      annee_debut: req.query.annee_debut || null
    };

    const search = req.query.search || '';

    const data = await EtudiantModel.findAll(
      filters,
      search,
      page,
      limit
    );

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: 'Erreur récupération étudiants'
    });
  }
};

export const getEtudiantById = async (req, res) => {
  try {
    const etudiant = await EtudiantModel.findById(req.params.id);

    if (!etudiant) {
      return res.status(404).json({
        message: 'Étudiant non trouvé'
      });
    }

    const paiements =
      await EtudiantModel.getPaiementsByEtudiant(req.params.id);

    res.json({
      etudiant,
      paiements
    });
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

export const createEtudiant = async (req, res) => {
  try {
    const {
      matricule,
      nom_complet,
      promotion_id
    } = req.body;

    if (!matricule || !nom_complet || !promotion_id) {
      return res.status(400).json({
        message: 'Tous les champs sont requis'
      });
    }

    const promo = await PromotionModel.findById(promotion_id);

    if (!promo || !promo.actif) {
      return res.status(400).json({
        message:
          'La promotion sélectionnée n\'est pas active'
      });
    }

    try {
      const newEtudiant =
        await EtudiantModel.create(
          matricule,
          nom_complet,
          promotion_id
        );

      res.status(201).json(newEtudiant);

    } catch (err) {

      if (
        err.code === '23514' &&
        err.constraint === 'chk_matricule_format'
      ) {
        return res.status(400).json({
          message:
            'Le format du matricule est invalide (ex: 2021/329)'
        });
      }

      throw err;
    }

  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

export const updateEtudiant = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      matricule,
      nom_complet,
      promotion_id
    } = req.body;

    const promo =
      await PromotionModel.findById(promotion_id);

    if (!promo || !promo.actif) {
      return res.status(400).json({
        message:
          'La promotion sélectionnée n\'est pas active'
      });
    }

    const updated = await EtudiantModel.update(id, {
      matricule,
      nom_complet,
      promotion_id
    });

    res.json(updated);

  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

export const deleteEtudiant = async (req, res) => {
  try {

    await EtudiantModel.delete(req.params.id);

    res.json({
      message: 'Étudiant supprimé'
    });

  } catch (err) {
    res.status(400).json({
      message: err.message
    });
  }
};

// ======================================================
// IMPORT EXCEL
// ======================================================

export const importEtudiants = async (req, res) => {


  const { promotion_id } = req.body;

  if (!promotion_id) {
    return res.status(400).json({
      message: 'Promotion requise'
    });
  }

  const promo =
    await PromotionModel.findById(promotion_id);

  if (!promo || !promo.actif) {
    return res.status(400).json({
      message: 'Promotion inactive'
    });
  }

  if (!req.file) {
    return res.status(400).json({
      message: 'Fichier requis'
    });
  }

  let rows;
  try {
    rows = await readFirstWorksheetMatrix(req.file.buffer);
  } catch (error) {
    if (error?.message === 'NO_WORKSHEET') {
      return res.status(400).json({ message: 'Le fichier ne contient aucune feuille exploitable.' });
    }
    if (error?.message === 'TOO_MANY_COLUMNS') {
      return res.status(400).json({ message: 'Le fichier contient trop de colonnes.' });
    }
    if (['ARCHIVE_TOO_COMPLEX', 'ARCHIVE_TOO_LARGE'].includes(error?.message)) {
      return res.status(400).json({ message: 'Le fichier Excel est trop complexe ou décompressé dépasse la limite de sécurité.' });
    }
    return res.status(400).json({
      message: 'Le fichier Excel est illisible, endommagé ou n’est pas au format .xlsx.'
    });
  }

  const headers = rows[0] || [];
  const dataRows = rows.slice(1).filter((row) => row.some((value) => String(value ?? '').trim() !== ''));

  if (dataRows.length === 0) {
    return res.status(400).json({ message: 'Le fichier ne contient aucune ligne étudiant.' });
  }
  if (dataRows.length > 10000) {
    return res.status(400).json({ message: 'Le fichier dépasse la limite de 10 000 étudiants par import.' });
  }

  const matColIdx = headers.findIndex(h =>
    h &&
    h.toString().toLowerCase().includes('matricule')
  );

  const nomColIdx = headers.findIndex(h =>
    h &&
    (
      h.toString().toLowerCase().includes('nom') ||
      h.toString().toLowerCase().includes('noms')
    )
  );

  if (matColIdx === -1 || nomColIdx === -1) {
    return res.status(400).json({
      message:
        'Colonnes "matricule" et "noms" introuvables'
    });
  }

  const total = dataRows.length;

  let processed = 0;
  let inseres = 0;
  let doublons = 0;

  const erreurs = [];
  const homonymesList = [];

  for (let i = 0; i < dataRows.length; i++) {

    const row = dataRows[i];
    const ligneNum = i + 2;

    const matricule =
      row[matColIdx]?.toString().trim();

    const nom =
      row[nomColIdx]?.toString().trim();

    if (!matricule || !nom) {

      erreurs.push({
        ligne: ligneNum,
        raison: 'Matricule ou nom vide'
      });

      processed++;

      emitImportProgress(req, (processed / total) * 100);

      continue;
    }

    const existing =
      await EtudiantModel.checkExisting(matricule);

    if (existing) {

      doublons++;

      erreurs.push({
        ligne: ligneNum,
        raison:
          `Doublon matricule "${matricule}" déjà existant`
      });

      processed++;

      emitImportProgress(req, (processed / total) * 100);

      continue;
    }

    const similaires =
      await EtudiantModel.findSimilarByNameAndPromotion(
        nom,
        promotion_id
      );

    if (similaires.length > 0) {

      homonymesList.push({
        ligne: ligneNum,
        matricule,
        nom,
        similaires: similaires.map(s => ({
          matricule: s.matricule,
          nom: s.nom_complet
        }))
      });

      processed++;

      emitImportProgress(req, (processed / total) * 100);

      continue;
    }

    try {

      await EtudiantModel.create(
        matricule,
        nom,
        promotion_id
      );

      inseres++;

    } catch (err) {

      if (
        err.code === '23514' &&
        err.constraint === 'chk_matricule_format'
      ) {

        erreurs.push({
          ligne: ligneNum,
          raison:
            'Format matricule invalide'
        });

      } else {

        erreurs.push({
          ligne: ligneNum,
          raison: err.message
        });
      }
    }

    processed++;

    emitImportProgress(req, (processed / total) * 100);
  }

  emitImportProgress(req, 100, { completed: true });

  res.json({
    inseres,
    doublons,
    homonymes: homonymesList.length,
    homonymesList,
    totalLignes: total,
    erreurs
  });
};

// ======================================================
// EXPORT EXCEL - SITUATION FINANCIÈRE
// ======================================================

/**
 * Exporte la situation financière correspondant exactement aux filtres actifs.
 * Le titre visible et le nom du fichier proviennent du même utilitaire afin
 * d'éviter toute divergence entre le contenu et le téléchargement.
 */
export const exportEtudiants = async (req, res) => {
  try {
    const filters = {
      faculte_id: req.query.faculte_id || null,
      filiere_id: req.query.filiere_id || null,
      niveau_id: req.query.niveau_id || null,
      promotion_id: req.query.promotion_id || null,
      annee_debut: req.query.annee_debut || null
    };
    const search = String(req.query.search || '').trim();

    const [{ etudiants }, reportMetadata] = await Promise.all([
      EtudiantModel.findAll(filters, search, 1, 10000),
      buildFinancialReportMetadata({ filters, search })
    ]);

    const workbook = buildFinancialReportWorkbook({
      etudiants,
      reportMetadata
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${reportMetadata.fileName}"; filename*=UTF-8''${encodeURIComponent(reportMetadata.fileName)}`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Erreur export Excel :', error);
    res.status(500).json({ message: 'Erreur export Excel' });
  }
};

// ======================================================
// REÇU PDF ACADÉMIQUE
// ======================================================

/**
 * Génère le reçu officiel d’un étudiant.
 *
 * Le contrôleur se limite à vérifier les données, préparer les chemins des
 * ressources visuelles et envoyer le flux produit par le service PDF.
 */
export const generateRecuPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const etudiant = await EtudiantModel.findById(id);

    if (!etudiant) {
      return res.status(404).json({ message: 'Étudiant introuvable' });
    }

    // Le nom et la promotion sont obligatoires sur le reçu. Cette vérification
    // évite de produire un document académique incomplet.
    if (!etudiant.nom_complet || !etudiant.promotion_libelle) {
      return res.status(422).json({
        message: 'Le nom complet et la promotion sont requis pour générer le reçu.'
      });
    }

    const paiements = await EtudiantModel.getPaiementsByEtudiant(id);
    const logoPath = fileURLToPath(new URL('../assets/logo.png', import.meta.url));
    const flagPath = fileURLToPath(new URL('../assets/flag-rdc.png', import.meta.url));
    const receiptFileName = buildReceiptFileName(etudiant.nom_complet);

    const doc = await buildStudentReceiptPdf({
      etudiant,
      paiements,
      logoPath,
      flagPath
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${receiptFileName}"; filename*=UTF-8''${encodeURIComponent(receiptFileName)}`
    );

    doc.pipe(res);
    doc.end();
  } catch (error) {
    console.error('Erreur lors de la génération du reçu :', error);

    if (!res.headersSent) {
      return res.status(500).json({ message: 'Erreur génération PDF' });
    }

    res.end();
  }
};

