/**
 * Contrôleur paiement controller. Valide la requête HTTP, appelle les modèles/services et construit une réponse cohérente.
 */
import PaiementModel from '../models/PaiementModel.js';
import { matchPaiement } from '../services/matchingService.js';
import { emitImportProgress } from '../utils/importProgress.js';
import { readFirstWorksheetMatrix } from '../utils/excelWorkbook.js';

const MAX_IMPORT_ROWS = 10_000;
const MAX_REFERENCE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1_000;
const REQUIRED_COLUMNS_MESSAGE = 'Fichier non conforme : colonnes requises manquantes. Colonnes attendues : reference number, description, transaction date, debit.';

const normalizeHeader = (value) => String(value ?? '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ');

const normalizeCellText = (value) => String(value ?? '')
  .replace(/[\u00A0\u2000-\u200F\u202F]/g, ' ')
  .replace(/[\x00-\x1F\x7F]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const raw = normalizeCellText(value).replace(/[^0-9,.-]/g, '');
  if (!raw) return NaN;

  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;

  if (lastComma > lastDot) normalized = raw.replace(/\./g, '').replace(',', '.');
  else normalized = raw.replace(/,/g, '');

  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : NaN;
};

const parseTransactionDate = (value) => {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const findHeader = (normalizedHeaders, aliases) => {
  for (const alias of aliases) {
    if (normalizedHeaders.has(alias)) return normalizedHeaders.get(alias);
  }
  return null;
};

export const importPaiements = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Veuillez sélectionner un fichier Excel à importer.' });
  }

  let matrix;
  try {
    matrix = await readFirstWorksheetMatrix(req.file.buffer);
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
    return res.status(400).json({ message: 'Le fichier Excel est illisible, endommagé ou n’est pas au format .xlsx.' });
  }

  const headers = Array.isArray(matrix[0]) ? matrix[0] : [];
  const normalizedHeaders = new Map();

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;
    if (normalizedHeaders.has(normalized)) {
      normalizedHeaders.set(normalized, { duplicate: true, label: header, index });
    } else {
      normalizedHeaders.set(normalized, { duplicate: false, label: header, index });
    }
  });

  const duplicatedHeader = [...normalizedHeaders.values()].find((entry) => entry.duplicate);
  if (duplicatedHeader) {
    return res.status(400).json({
      message: `Fichier non conforme : la colonne « ${normalizeCellText(duplicatedHeader.label)} » est présente plusieurs fois.`
    });
  }

  const refColumn = findHeader(normalizedHeaders, ['reference number', 'reference', 'ref']);
  const descColumn = findHeader(normalizedHeaders, ['description', 'libelle']);
  const dateColumn = findHeader(normalizedHeaders, ['transaction date', 'date', 'transactiondate']);
  const debitColumn = findHeader(normalizedHeaders, ['debit', 'montant', 'amount']);

  if (!refColumn || !descColumn || !dateColumn || !debitColumn) {
    return res.status(400).json({
      code: 'INVALID_BANK_STATEMENT_COLUMNS',
      message: REQUIRED_COLUMNS_MESSAGE
    });
  }

  const rows = matrix.slice(1).filter((row) => row.some((value) => normalizeCellText(value) !== ''));
  if (rows.length === 0) {
    return res.status(400).json({ message: 'Le fichier ne contient aucune ligne de données.' });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({
      message: `Le relevé contient trop de lignes. Maximum autorisé : ${MAX_IMPORT_ROWS}.`
    });
  }

  const total = rows.length;
  let processed = 0;
  let valides = 0;
  let echoues = 0;
  let doublons = 0;
  let revues = 0;

  try {
    for (const row of rows) {
      processed += 1;
      emitImportProgress(req, (processed / total) * 100);

      const reference = normalizeCellText(row[refColumn.index]);
      const description = normalizeCellText(row[descColumn.index]);
      const date_paiement = parseTransactionDate(row[dateColumn.index]);
      const montant = parseAmount(row[debitColumn.index]);

      const invalidRow = (
        !reference
        || !description
        || !date_paiement
        || !Number.isFinite(montant)
        || montant <= 0
        || reference.length > MAX_REFERENCE_LENGTH
        || description.length > MAX_DESCRIPTION_LENGTH
      );

      if (invalidRow) {
        echoues += 1;
        continue;
      }

      const existing = await PaiementModel.findByReference(reference);
      if (existing) {
        doublons += 1;
        continue;
      }

      const matchResult = await matchPaiement(description);
      let statut = 'en_revue';
      let etudiant_id = null;
      let score = typeof matchResult.score === 'number' ? matchResult.score : null;

      if (matchResult.decision.decision === 'auto') {
        statut = 'attribue';
        etudiant_id = matchResult.decision.etudiant.id;
        score = matchResult.decision.etudiant.score;
      }

      try {
        await PaiementModel.create({
          reference_paiement: reference,
          description_brute: description,
          date_paiement,
          montant,
          matricule_extrait: matchResult.matricule_extrait,
          niveau_extrait: matchResult.niveau_extrait,
          faculte_extrait: matchResult.faculte_extrait,
          tokens_nom: matchResult.tokens_nom,
          statut,
          etudiant_id,
          score_composite: score
        });

        if (statut === 'attribue') valides += 1;
        else revues += 1;
      } catch (error) {
        if (error?.code === '23505') doublons += 1;
        else throw error;
      }
    }

    emitImportProgress(req, 100, { completed: true });
    return res.json({ valides, echoues, doublons, revues, total: valides + revues });
  } catch (error) {
    console.error('Erreur import paiements:', error?.message || 'Erreur inconnue');
    return res.status(500).json({
      message: 'Une erreur est survenue pendant le traitement du relevé bancaire.'
    });
  }
};
