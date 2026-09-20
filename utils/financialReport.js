/**
 * Construction centralisée du titre et du nom du rapport financier Excel.
 *
 * Les libellés sont résolus à partir des filtres réellement appliqués par la
 * requête d'export. Aucune donnée ni relation de la base n'est modifiée.
 */
import pool from '../config/db.js';
import {
  formatFiliereLabel,
  formatPromotionLabel,
  getFacultyAbbreviation,
  sanitizeFileName
} from './academicDisplay.js';

const compactText = (value = '') => String(value).replace(/\s+/g, ' ').trim();

const getPromotion = async (promotionId) => {
  if (!promotionId) return null;

  const result = await pool.query(
    `SELECT
       p.id,
       p.libelle AS promotion_libelle,
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
     WHERE p.id = $1`,
    [promotionId]
  );

  return result.rows[0] || null;
};

const getAcademicFilterLabels = async (filters) => {
  const labels = {
    facultyCode: '',
    filiere: '',
    niveau: '',
    academicYear: ''
  };

  if (filters.promotion_id) {
    const promotion = await getPromotion(filters.promotion_id);
    if (promotion) {
      return {
        ...labels,
        promotionLabel: formatPromotionLabel(promotion),
        facultyCode: getFacultyAbbreviation(promotion),
        filiere: formatFiliereLabel(promotion.filiere_libelle),
        niveau: String(promotion.niveau_code || '').toUpperCase(),
        academicYear: `${promotion.annee_debut}-${promotion.annee_fin}`
      };
    }
  }

  if (filters.faculte_id) {
    const result = await pool.query(
      'SELECT code AS faculte_code, libelle AS faculte_libelle FROM facultes WHERE id = $1',
      [filters.faculte_id]
    );
    labels.facultyCode = getFacultyAbbreviation(result.rows[0] || {});
  }

  if (filters.filiere_id) {
    const result = await pool.query(
      'SELECT code AS filiere_code, libelle AS filiere_libelle FROM filieres WHERE id = $1',
      [filters.filiere_id]
    );
    labels.filiere = formatFiliereLabel(result.rows[0]?.filiere_libelle || '');
  }

  if (filters.niveau_id) {
    const result = await pool.query(
      'SELECT code AS niveau_code FROM niveaux WHERE id = $1',
      [filters.niveau_id]
    );
    labels.niveau = String(result.rows[0]?.niveau_code || '').trim().toUpperCase();
  }

  if (filters.annee_debut) {
    const start = Number(filters.annee_debut);
    if (Number.isInteger(start) && start > 1900 && start < 2200) {
      labels.academicYear = `${start}-${start + 1}`;
    }
  }

  return labels;
};

/**
 * Compose les métadonnées à partir de libellés déjà résolus. Cette fonction
 * pure facilite les tests et garantit une construction identique du titre et
 * du nom de fichier.
 */
export const composeFinancialReportMetadata = ({ labels = {}, search = '', generatedAt = new Date() } = {}) => {
  // Le mot GLOBAL reste visible lorsque seule l'année est filtrée. En
  // revanche, dès qu'une faculté, une filière ou un niveau est sélectionné,
  // le titre reprend uniquement ces critères puis l'année académique.
  const academicDetails = [
    labels.facultyCode,
    labels.filiere,
    labels.niveau
  ].filter(Boolean);
  const academicScope = labels.promotionLabel || [
    ...(academicDetails.length > 0 ? academicDetails : ['GLOBAL']),
    labels.academicYear
  ].filter(Boolean).join(' ');

  const baseScope = academicScope || 'GLOBAL';
  const normalizedSearch = compactText(search).slice(0, 60);
  const searchSuffix = normalizedSearch ? ` RECHERCHE ${normalizedSearch}` : '';
  const title = `RAPPORT FINANCIER ${baseScope}${searchSuffix}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  const fileScope = sanitizeFileName(`${baseScope}${searchSuffix}`, 'Global');
  const fileName = `Rapport_financier_${fileScope}.xlsx`;

  return {
    title,
    fileName,
    scopeLabel: baseScope,
    searchLabel: normalizedSearch,
    generatedAt
  };
};

/**
 * Retourne le titre visible dans Excel et le nom du fichier téléchargé à partir
 * des filtres réellement appliqués par la requête d'export.
 */
export const buildFinancialReportMetadata = async ({ filters = {}, search = '' } = {}) => {
  const labels = await getAcademicFilterLabels(filters);
  return composeFinancialReportMetadata({ labels, search });
};
