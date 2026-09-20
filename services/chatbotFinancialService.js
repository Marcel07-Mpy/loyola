/**
 * Réponses financières déterministes du chatbot.
 *
 * Les questions de situation financière sont résolues directement depuis
 * PostgreSQL afin d'obtenir des données exactes, à jour et beaucoup plus
 * rapidement qu'en demandant au modèle IA d'inférer les montants.
 */
import pool from '../config/db.js';

const STUDENT_MATRICULE_PATTERN = /\b\d{2,4}\s*\/\s*\d{1,8}\b/;
const STRONG_FINANCIAL_INTENT_PATTERN = /(statut\s+financier|situation\s+financi[èe]re|[ée]tat\s+financier|bilan\s+financier|solde|reste(?:nt)?\s+[àa]\s+payer|montant\s+(?:total\s+)?(?:pay[ée]|vers[ée]|restant|d[uû])|combien\s+.*(?:pay[ée]|vers[ée])|(?:pay[ée]|vers[ée])\s+combien|total\s+(?:pay[ée]|vers[ée])|dette|impay[ée]|recouvrement|total\s+attendu|total\s+re[cç]u|encaiss[ée]|exc[ée]dent|progression\s+financi[èe]re)/i;
const STUDENT_HINT_PATTERN = /\b(?:[ée]tudiant(?:e)?s?|matricule)\b/i;
const PROMOTION_HINT_PATTERN = /\b(promotions?|promo|classe|cohorte)\b/i;
const ACADEMIC_LEVEL_PATTERN = /\b(?:XP|X[1-5]|LP|L[1-3]|I[45]|OP|O[1-3]|A[45])\b/i;
const PAID_AMOUNT_INTENT_PATTERN = /(?:combien\s+(?:a\s+)?(?:pay[ée]|vers[ée])|combien\s+.+\s+(?:a\s+)?(?:pay[ée]|vers[ée])|(?:a\s+)?(?:pay[ée]|vers[ée])\s+combien|montant\s+(?:total\s+)?(?:pay[ée]|vers[ée])|total\s+(?:pay[ée]|vers[ée]))/i;
const REMAINING_AMOUNT_INTENT_PATTERN = /(?:reste(?:nt)?\s+[àa]\s+payer|reste\s+combien|dette|solde\s+(?:restant|[àa]\s+payer))/i;
const STATUS_INTENT_PATTERN = /(?:statut\s+financier|[ée]tat\s+financier|est[- ]?il\s+(?:sold[ée]|en\s+ordre)|a[- ]?t[- ]?il\s+(?:tout\s+)?pay[ée])/i;

const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const normalizeMatricule = (value) => normalize(value).replace(/\s*\/\s*/g, '/');

const STOP_WORDS = new Set([
  'quel', 'quelle', 'quels', 'quelles', 'est', 'sont', 'le', 'la', 'les', 'un', 'une', 'des',
  'du', 'de', 'd', 'au', 'aux', 'a', 'à', 'pour', 'sur', 'concernant', 'donne', 'donnez', 'moi',
  'affiche', 'afficher', 'voir', 'montre', 'montrer', 'peux', 'tu', 'vous', 'svp', 's', 'il', 'elle',
  'statut', 'situation', 'etat', 'état', 'bilan', 'financier', 'financiere', 'financière', 'finance',
  'solde', 'reste', 'restant', 'dette', 'paiement', 'paiements', 'paye', 'payé', 'payee', 'payée',
  'combien', 'montant', 'attendu', 'recu', 'reçu', 'encaisse', 'encaissé', 'recouvrement', 'progression',
  'etudiant', 'étudiant', 'etudiante', 'étudiante', 'promotion', 'promo', 'classe', 'cohorte'
]);

const foldAccents = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('fr-FR');

const tokenizeSearch = (value) => normalize(value)
  .replace(/[?!.:,;()\[\]{}"'’\-/]/g, ' ')
  .split(/\s+/)
  .map((token) => token.trim())
  .filter((token) => token.length >= 2 && !STOP_WORDS.has(token.toLocaleLowerCase('fr-FR')))
  .map(foldAccents)
  .slice(0, 10);

const formatMoney = (value) => `${new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
}).format(Number(value || 0))} USD`;

const formatPercent = (value) => `${new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
}).format(Number(value || 0))} %`;

const formatDate = (value) => {
  if (!value) return 'Aucun paiement attribué';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date indisponible';
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
};

const getStudentStatusLabel = ({ totalPaye, montantDu }) => {
  if (totalPaye <= 0) return 'Impayé';
  if (totalPaye > montantDu) return 'Excédentaire';
  if (totalPaye >= montantDu) return 'Soldé';
  return 'Partiellement payé';
};

const extractQuotedValue = (message) => {
  const match = message.match(/["“”«](.+?)["“”»]/);
  return normalize(match?.[1]);
};

const cleanStudentCandidate = (value, promotionHint = '') => {
  let candidate = normalize(value)
    .replace(/[?.!]+$/g, '')
    .replace(/^(?:l['’]\s*)?(?:[ée]tudiant(?:e)?\s+)/i, '')
    .replace(/\b(?:a\s+)?(?:pay[ée]|vers[ée])\s+combien\b.*$/i, '')
    .replace(/\bcombien\s+(?:a\s+)?(?:pay[ée]|vers[ée])\b.*$/i, '')
    .replace(/\b(?:doit|reste\s+[àa]\s+payer|a\s+comme\s+solde)\b.*$/i, '')
    .trim();

  if (promotionHint) {
    const escaped = promotionHint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    candidate = candidate.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), ' ').replace(/\s+/g, ' ').trim();
  }

  return candidate;
};

const extractStudentSearch = (message) => {
  const matricule = message.match(STUDENT_MATRICULE_PATTERN)?.[0];
  const promotionHint = message.match(ACADEMIC_LEVEL_PATTERN)?.[0]?.toUpperCase() || '';
  if (matricule) return { matricule: normalizeMatricule(matricule), search: '', promotionHint };

  const quoted = extractQuotedValue(message);
  if (quoted) return { matricule: '', search: cleanStudentCandidate(quoted, promotionHint), promotionHint };

  const patterns = [
    /(?:l['’]\s*)?[ée]tudiant(?:e)?\s+(.+?)\s+(?:a\s+(?:pay[ée]|vers[ée])(?:\s+combien)?|doit|reste\s+[àa]\s+payer|a\s+comme\s+solde)(?=\s|[?!.,]|$)/i,
    /^(.+?)\s+(?:a\s+)?(?:pay[ée]|vers[ée])\s+combien(?=\s|[?!.,]|$)/i,
    /combien\s+(?:a\s+)?(?:pay[ée]|vers[ée])\s+(?:l['’]\s*)?(?:[ée]tudiant(?:e)?\s+)?(.+)$/i,
    /combien\s+(.+?)\s+(?:a\s+)?(?:pay[ée]|vers[ée])(?=\s|[?!.,]|$)/i,
    /(?:montant\s+(?:total\s+)?(?:pay[ée]|vers[ée])|paiements?)\s+(?:de|du|par)\s+(?:l['’]\s*)?(?:[ée]tudiant(?:e)?\s+)?(.+)$/i,
    /(?:de|du|pour|concernant)\s+(?:l['’]\s*)?(?:[ée]tudiant(?:e)?\s+)?(.+)$/i,
    /(?:[ée]tudiant(?:e)?s?)\s+(.+)$/i
  ];

  for (const pattern of patterns) {
    const candidate = cleanStudentCandidate(message.match(pattern)?.[1], promotionHint);
    if (candidate) return { matricule: '', search: candidate, promotionHint };
  }

  return { matricule: '', search: '', promotionHint };
};

const extractPromotionSearch = (message) => {
  const quoted = extractQuotedValue(message);
  if (quoted) return quoted;

  const promotionMatch = message.match(/\b(?:promotions?|promo|classe|cohorte)\b\s*(?:de|du|des)?\s*[:\-]?\s*(.+)$/i);
  if (promotionMatch?.[1]) return normalize(promotionMatch[1]).replace(/[?.!]+$/g, '').trim();

  const afterPreposition = message.match(/(?:de|du|pour|concernant)\s+(.+)$/i);
  return normalize(afterPreposition?.[1]).replace(/[?.!]+$/g, '').trim();
};

const findStudents = async ({ matricule, search, promotionHint = '' }) => {
  if (matricule) {
    const values = [matricule];
    const promotionCondition = promotionHint
      ? ` AND CONCAT(' ', p.libelle, ' ') ILIKE $2`
      : '';
    if (promotionHint) values.push(`% ${promotionHint} %`);

    const result = await pool.query(`
      SELECT e.id, e.matricule, e.nom_complet, p.libelle AS promotion_libelle
      FROM etudiants e
      JOIN promotions p ON p.id = e.promotion_id
      WHERE e.matricule = $1${promotionCondition}
      LIMIT 2
    `, values);
    return result.rows;
  }

  const tokens = tokenizeSearch(search);
  if (!tokens.length) return [];

  const foldedStudentName = `translate(lower(e.nom_complet), 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')`;
  const conditions = tokens.map((_, index) => `${foldedStudentName} LIKE $${index + 1}`);
  const values = tokens.map((token) => `%${token}%`);

  if (promotionHint) {
    values.push(`% ${promotionHint} %`);
    conditions.push(`CONCAT(' ', p.libelle, ' ') ILIKE $${values.length}`);
  }

  const result = await pool.query(`
    SELECT e.id, e.matricule, e.nom_complet, p.libelle AS promotion_libelle
    FROM etudiants e
    JOIN promotions p ON p.id = e.promotion_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY LENGTH(e.nom_complet), e.nom_complet
    LIMIT 6
  `, values);
  return result.rows;
};

const getStudentFinancialStatus = async (studentId) => {
  const result = await pool.query(`
    SELECT
      e.id,
      e.matricule,
      e.nom_complet,
      p.libelle AS promotion_libelle,
      p.montant_du,
      COALESCE(SUM(pa.montant), 0)::numeric AS total_paye,
      COUNT(pa.id)::int AS nombre_paiements,
      MAX(pa.date_paiement) AS dernier_paiement
    FROM etudiants e
    JOIN promotions p ON p.id = e.promotion_id
    LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
    WHERE e.id = $1
    GROUP BY e.id, e.matricule, e.nom_complet, p.libelle, p.montant_du
  `, [studentId]);
  return result.rows[0];
};

const findPromotions = async (search) => {
  const tokens = tokenizeSearch(search);
  if (!tokens.length) return [];

  const searchable = `translate(lower(CONCAT_WS(' ', p.libelle, f.code, f.libelle, fi.code, fi.libelle, n.code, n.libelle, p.annee_debut::text, p.annee_fin::text)), 'àáâäãåçèéêëìíîïñòóôöõùúûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')`;
  const conditions = tokens.map((_, index) => `${searchable} LIKE $${index + 1}`);
  const values = tokens.map((token) => `%${token}%`);

  const result = await pool.query(`
    SELECT
      p.id,
      p.libelle,
      p.annee_debut,
      p.annee_fin,
      f.code AS faculte_code,
      fi.code AS filiere_code,
      n.code AS niveau_code
    FROM promotions p
    JOIN facultes f ON f.id = p.faculte_id
    JOIN filieres fi ON fi.id = p.filiere_id
    JOIN niveaux n ON n.id = p.niveau_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY p.actif DESC, p.annee_debut DESC, p.libelle
    LIMIT 6
  `, values);
  return result.rows;
};

const getPromotionFinancialStatus = async (promotionId) => {
  const result = await pool.query(`
    WITH student_finance AS (
      SELECT
        e.id,
        p.id AS promotion_id,
        p.libelle,
        p.montant_du,
        p.actif,
        COALESCE(SUM(pa.montant), 0)::numeric AS total_paye,
        MAX(pa.date_paiement) AS dernier_paiement
      FROM etudiants e
      JOIN promotions p ON p.id = e.promotion_id
      LEFT JOIN paiements pa ON pa.etudiant_id = e.id AND pa.statut = 'attribue'
      WHERE p.id = $1
      GROUP BY e.id, p.id, p.libelle, p.montant_du, p.actif
    )
    SELECT
      promotion_id,
      MAX(libelle) AS libelle,
      BOOL_OR(actif) AS actif,
      COUNT(*)::int AS nb_etudiants,
      COALESCE(SUM(montant_du), 0)::numeric AS total_attendu,
      COALESCE(SUM(total_paye), 0)::numeric AS total_paye,
      COALESCE(SUM(GREATEST(montant_du - total_paye, 0)), 0)::numeric AS total_restant,
      COALESCE(SUM(GREATEST(total_paye - montant_du, 0)), 0)::numeric AS total_excedent,
      COUNT(*) FILTER (WHERE total_paye = montant_du)::int AS nb_soldes,
      COUNT(*) FILTER (WHERE total_paye > montant_du)::int AS nb_excedentaires,
      COUNT(*) FILTER (WHERE total_paye > 0 AND total_paye < montant_du)::int AS nb_partiels,
      COUNT(*) FILTER (WHERE total_paye = 0)::int AS nb_impayes,
      MAX(dernier_paiement) AS dernier_paiement
    FROM student_finance
    GROUP BY promotion_id
  `, [promotionId]);
  return result.rows[0];
};

const detectFinancialIntent = (message) => {
  if (PAID_AMOUNT_INTENT_PATTERN.test(message)) return 'paid_amount';
  if (REMAINING_AMOUNT_INTENT_PATTERN.test(message)) return 'remaining_amount';
  if (STATUS_INTENT_PATTERN.test(message)) return 'status';
  return 'full';
};

const buildStudentAnswer = (row, intent = 'full') => {
  const montantDu = Number(row.montant_du || 0);
  const totalPaye = Number(row.total_paye || 0);
  const restant = Math.max(montantDu - totalPaye, 0);
  const excedent = Math.max(totalPaye - montantDu, 0);
  const progression = montantDu > 0 ? (totalPaye / montantDu) * 100 : 0;
  const status = getStudentStatusLabel({ totalPaye, montantDu });
  const identity = `${row.nom_complet} (${row.matricule})`;

  if (intent === 'paid_amount') {
    return [
      `${identity} a payé ${formatMoney(totalPaye)} au total.`,
      `Promotion : ${row.promotion_libelle}`,
      `Reste à payer : ${formatMoney(restant)}${excedent > 0 ? ` · Excédent : ${formatMoney(excedent)}` : ''}`,
      `Dernier paiement : ${formatDate(row.dernier_paiement)} (${Number(row.nombre_paiements || 0)} paiement(s) attribué(s))`
    ].join('\n');
  }

  if (intent === 'remaining_amount') {
    return [
      `${identity} doit encore payer ${formatMoney(restant)}.`,
      `Payé : ${formatMoney(totalPaye)} sur ${formatMoney(montantDu)}`,
      `Statut : ${status}`
    ].join('\n');
  }

  if (intent === 'status') {
    return [
      `${identity} — Statut : ${status}.`,
      `Payé : ${formatMoney(totalPaye)} sur ${formatMoney(montantDu)}`,
      `Reste à payer : ${formatMoney(restant)}${excedent > 0 ? ` · Excédent : ${formatMoney(excedent)}` : ''}`
    ].join('\n');
  }

  const lines = [
    `Situation financière — ${identity}`,
    `Promotion : ${row.promotion_libelle}`,
    `Statut : ${status}`,
    `Attendu : ${formatMoney(montantDu)}`,
    `Payé : ${formatMoney(totalPaye)}`,
    `Reste à payer : ${formatMoney(restant)}`
  ];

  if (excedent > 0) lines.push(`Excédent : ${formatMoney(excedent)}`);
  lines.push(`Progression : ${formatPercent(progression)}`);
  lines.push(`Dernier paiement : ${formatDate(row.dernier_paiement)} (${Number(row.nombre_paiements || 0)} paiement(s) attribué(s))`);
  return lines.join('\n');
};

const buildPromotionAnswer = (row) => {
  const totalAttendu = Number(row.total_attendu || 0);
  const totalPaye = Number(row.total_paye || 0);
  const taux = totalAttendu > 0 ? (totalPaye / totalAttendu) * 100 : 0;

  return [
    `Situation financière — ${row.libelle}`,
    `Étudiants : ${Number(row.nb_etudiants || 0)}`,
    `Attendu : ${formatMoney(totalAttendu)}`,
    `Reçu : ${formatMoney(totalPaye)}`,
    `À recouvrer : ${formatMoney(row.total_restant)}`,
    `Excédents : ${formatMoney(row.total_excedent)}`,
    `Taux d’encaissement : ${formatPercent(taux)}`,
    `Soldés : ${Number(row.nb_soldes || 0)} · Partiels : ${Number(row.nb_partiels || 0)} · Impayés : ${Number(row.nb_impayes || 0)} · Excédentaires : ${Number(row.nb_excedentaires || 0)}`,
    `Dernier paiement : ${formatDate(row.dernier_paiement)}`
  ].join('\n');
};

const buildStudentAmbiguityAnswer = (students) => {
  const choices = students.slice(0, 5).map((student) => `• ${student.nom_complet} — ${student.matricule} — ${student.promotion_libelle}`);
  return `J’ai trouvé plusieurs étudiants correspondants. Indiquez le matricule pour obtenir la bonne situation financière :\n${choices.join('\n')}`;
};

const buildPromotionAmbiguityAnswer = (promotions) => {
  const choices = promotions.slice(0, 5).map((promotion) => `• ${promotion.libelle}`);
  return `J’ai trouvé plusieurs promotions correspondantes. Précisez la promotion :\n${choices.join('\n')}`;
};

export const isFinancialQuestion = (message) => {
  const normalized = normalize(message);
  if (!normalized) return false;
  if (STUDENT_MATRICULE_PATTERN.test(normalized)) return true;
  if (/\bcomment\b/i.test(normalized) && /\b(?:payer|paiement|solde)\b/i.test(normalized)) return false;
  if (!STRONG_FINANCIAL_INTENT_PATTERN.test(normalized)) return false;
  if (STUDENT_HINT_PATTERN.test(normalized) || PROMOTION_HINT_PATTERN.test(normalized)) return true;
  if (/\b(application|dashboard|tableau de bord|loyola finance)\b/i.test(normalized)) return false;
  if (ACADEMIC_LEVEL_PATTERN.test(normalized)) return true;
  return /\b(?:de|du|pour|par|concernant)\b/i.test(normalized)
    || /(?:combien\s+.+\s+(?:a\s+)?(?:pay[ée]|vers[ée])|.+\s+(?:a\s+)?(?:pay[ée]|vers[ée])\s+combien)/i.test(normalized);
};

/**
 * @returns {Promise<{handled: boolean, answer?: string, dataType?: string}>}
 */
export const answerFinancialQuestion = async (message) => {
  const normalized = normalize(message);
  if (!isFinancialQuestion(normalized)) return { handled: false };
  const intent = detectFinancialIntent(normalized);

  const matricule = normalized.match(STUDENT_MATRICULE_PATTERN)?.[0];
  const promotionLabelHint = /\b(?:FAST|FSAV|FSEG|PHILO)\b/i.test(normalized)
    && /\b(?:L|X|I|O|A)\d\b/i.test(normalized);
  const promotionIntent = (PROMOTION_HINT_PATTERN.test(normalized) || promotionLabelHint) && !matricule;

  if (promotionIntent) {
    const search = extractPromotionSearch(normalized);
    const promotions = await findPromotions(search);
    if (!promotions.length) {
      return {
        handled: true,
        dataType: 'promotion',
        answer: 'Je n’ai trouvé aucune promotion correspondant à cette demande. Indiquez son libellé, son niveau ou son année académique, par exemple : « FAST GENIE INDUSTRIEL L1 2025-2026 ».'
      };
    }
    if (promotions.length > 1) {
      return { handled: true, dataType: 'promotion', answer: buildPromotionAmbiguityAnswer(promotions) };
    }

    const finance = await getPromotionFinancialStatus(promotions[0].id);
    if (!finance) {
      return {
        handled: true,
        dataType: 'promotion',
        answer: `La promotion « ${promotions[0].libelle} » existe, mais elle ne contient actuellement aucun étudiant permettant de calculer une situation financière.`
      };
    }
    return { handled: true, dataType: 'promotion', answer: buildPromotionAnswer(finance) };
  }

  const studentSearch = extractStudentSearch(normalized);
  const students = await findStudents(studentSearch);
  if (!students.length) {
    return {
      handled: true,
      dataType: 'student',
      answer: 'Je n’ai pas trouvé l’étudiant demandé. Indiquez de préférence son matricule (ex. 2021/329) ou son nom complet.'
    };
  }
  if (students.length > 1) {
    return { handled: true, dataType: 'student', answer: buildStudentAmbiguityAnswer(students) };
  }

  const finance = await getStudentFinancialStatus(students[0].id);
  if (!finance) {
    return { handled: true, dataType: 'student', answer: 'La situation financière de cet étudiant est momentanément indisponible.' };
  }
  return { handled: true, dataType: 'student', answer: buildStudentAnswer(finance, intent) };
};

export const financialChatbotInternals = {
  tokenizeSearch,
  extractStudentSearch,
  extractPromotionSearch,
  detectFinancialIntent,
  buildStudentAnswer,
  buildPromotionAnswer
};
