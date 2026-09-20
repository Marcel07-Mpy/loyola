/**
 * Utilitaires de présentation des données académiques côté backend.
 *
 * Ces fonctions ne modifient jamais les valeurs stockées en base. Elles
 * construisent uniquement des libellés courts et cohérents pour les documents
 * générés (PDF et Excel) ainsi que pour les réponses enrichies de l'API.
 */

const FACULTY_ABBREVIATIONS = [
  {
    code: 'FAST',
    labels: [
      'FACULTE DES SCIENCES ET TECHNOLOGIES',
      'FACULTÉ DES SCIENCES ET TECHNOLOGIES'
    ]
  },
  {
    code: 'FSAV',
    labels: [
      'FACULTE DES SCIENCES AGRONOMIQUES ET VETERINAIRES',
      'FACULTÉ DES SCIENCES AGRONOMIQUES ET VÉTÉRINAIRES'
    ]
  },
  {
    code: 'FSEG',
    labels: [
      'FACULTE DES SCIENCES ECONOMIQUES ET DE GESTION',
      'FACULTÉ DES SCIENCES ÉCONOMIQUES ET DE GESTION'
    ]
  },
  {
    code: 'PHILO',
    labels: [
      'FACULTE DE PHILOSOPHIE',
      'FACULTÉ DE PHILOSOPHIE'
    ]
  }
];

const FILIERE_LABELS = new Map([
  ['GENIE INFORMATIQUE', 'GÉNIE INFORMATIQUE'],
  ['GÉNIE INFORMATIQUE', 'GÉNIE INFORMATIQUE'],
  ['GENIE INDUSTRIEL', 'GÉNIE INDUSTRIEL'],
  ['GÉNIE INDUSTRIEL', 'GÉNIE INDUSTRIEL'],
  ['SCIENCES AGRONOMIQUES', 'SCIENCES AGRONOMIQUES'],
  ['AGRONOMIE', 'AGRONOMIE'],
  ['SCIENCES ECONOMIQUES', 'SCIENCES ÉCONOMIQUES'],
  ['SCIENCES ÉCONOMIQUES', 'SCIENCES ÉCONOMIQUES'],
  ['ECONOMIE', 'ÉCONOMIE'],
  ['ÉCONOMIE', 'ÉCONOMIE'],
  ['PARCOURS OUVERT', 'PARCOURS OUVERT']
]);

const normalizeForLookup = (value = '') => String(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeRecord = (record = {}) => {
  if (typeof record === 'string') return { promotion_libelle: record };
  return record || {};
};

/**
 * Retourne le sigle officiel déjà présent dans les données ou le déduit du
 * nom complet de la faculté lorsque seul le libellé historique est disponible.
 */
export const getFacultyAbbreviation = (input = {}) => {
  const record = normalizeRecord(input);
  const nestedPromotion = record.promotion || {};

  const directCode = record.faculte_code
    || record.faculteCode
    || record.facultyCode
    || record.abbreviation
    || record.abreviation
    || record.code_faculte
    || record.sigle
    || nestedPromotion.faculte_code
    || nestedPromotion.faculteCode
    || nestedPromotion.facultyCode
    || nestedPromotion.abbreviation
    || nestedPromotion.abreviation
    || nestedPromotion.sigle;

  if (directCode) {
    return String(directCode)
      .replace(/[^\p{L}\p{N}]/gu, '')
      .trim()
      .toUpperCase();
  }

  const source = record.faculte_libelle
    || record.facultyName
    || nestedPromotion.faculte_libelle
    || nestedPromotion.facultyName
    || record.promotion_libelle
    || record.libelle
    || '';

  const normalizedSource = normalizeForLookup(source);
  const matchedFaculty = FACULTY_ABBREVIATIONS.find(({ labels }) => (
    labels.some((label) => normalizedSource.includes(normalizeForLookup(label)))
  ));

  return matchedFaculty?.code || '';
};

/** Harmonise la casse et les accents des filières pour l'affichage seulement. */
export const formatFiliereLabel = (value = '') => {
  const compact = String(value).replace(/\s+/g, ' ').trim().toUpperCase();
  return FILIERE_LABELS.get(compact) || compact;
};

/** Retourne l'année académique au format 2025-2026 lorsque les deux bornes existent. */
export const formatAcademicYear = (input = {}) => {
  const record = normalizeRecord(input);
  const nestedPromotion = record.promotion || {};
  const start = record.annee_debut ?? nestedPromotion.annee_debut;
  const end = record.annee_fin ?? nestedPromotion.annee_fin;

  if (start && end) return `${start}-${end}`;

  const source = String(record.promotion_libelle || record.libelle || '');
  const yearMatch = source.match(/\b(20\d{2})\s*[-/]\s*(20\d{2})\b/);
  return yearMatch ? `${yearMatch[1]}-${yearMatch[2]}` : '';
};

/**
 * Produit le format global SIGLE FILIÈRE NIVEAU ANNÉE.
 * Exemple : FAST GÉNIE INDUSTRIEL I4 2025-2026.
 */
export const formatPromotionLabel = (input = {}) => {
  const record = normalizeRecord(input);
  const nestedPromotion = record.promotion || {};

  const facultyCode = getFacultyAbbreviation(record);
  const filiere = formatFiliereLabel(
    record.filiere_libelle
      || record.filiere
      || nestedPromotion.filiere_libelle
      || nestedPromotion.filiere
      || ''
  );
  const niveau = String(
    record.niveau_code
      || record.niveau
      || nestedPromotion.niveau_code
      || nestedPromotion.niveau
      || ''
  ).trim().toUpperCase();
  const academicYear = formatAcademicYear(record);

  const structuredLabel = [facultyCode, filiere, niveau, academicYear]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Un ancien libellé peut contenir la filière et le niveau sans champs
  // structurés séparés. Dans ce cas, on transforme d'abord le libellé complet
  // afin de ne pas perdre ces informations en ne gardant que le sigle et l'année.
  let fallback = String(
    record.promotion_libelle
      || record.libelle
      || nestedPromotion.promotion_libelle
      || nestedPromotion.libelle
      || ''
  ).replace(/\s+/g, ' ').trim();

  if (structuredLabel && (filiere || niveau || !fallback)) return structuredLabel;

  for (const { code, labels } of FACULTY_ABBREVIATIONS) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      fallback = fallback.replace(new RegExp(escaped, 'ig'), code);
    }
  }

  fallback = fallback
    .replace(/\bF\.?A\.?S\.?T\.?\b/gi, 'FAST')
    .replace(/\bF\.?S\.?A\.?V\.?\b/gi, 'FSAV')
    .replace(/\bF\.?S\.?E\.?G\.?\b/gi, 'FSEG')
    .replace(/\bGENIE\b/gi, 'GÉNIE')
    .replace(/\bECONOMIE\b/gi, 'ÉCONOMIE')
    .replace(/\s+/g, ' ')
    .trim();

  return fallback.toUpperCase();
};

/** Retire les caractères interdits afin de produire un nom de fichier portable. */
export const sanitizeFileName = (value, fallback = 'Document') => {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[^a-zA-Z0-9._\-\s]/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_\.\-]+|[_\.\-]+$/g, '')
    .slice(0, 180);

  return cleaned || fallback;
};
