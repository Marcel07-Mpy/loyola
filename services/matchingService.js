/**
 * Implémente le moteur de rapprochement hybride entre un libellé bancaire et les étudiants candidats.
 */
import pool from '../config/db.js';
import { getDatabaseCapabilities, setDatabaseCapabilities } from '../config/databaseSetup.js';
import * as fuzzball from 'fuzzball';

const MATRICULE_PATTERN = /^20[0-9]{2}\/\d+$/;
const MATRICULE_NAME_THRESHOLD = 0.80;
const MIN_NAME_SIMILARITY_WITHOUT_MATRICULE = 0.90;
const AUTO_MATCH_THRESHOLD = 0.90;
const MINIMUM_SCORE_GAP = 0.05;
const NO_ACADEMIC_CRITERIA_PENALTY = 0.15;
const LEVEL_BONUS = 0.04;
const FACULTY_BONUS = 0.03;
const MAX_CODE_DISTANCE = 2;
const MAX_REVIEW_CANDIDATES = 5;
const MAX_CANDIDATE_POOL = 500;

const NAME_WEIGHTS = Object.freeze({
  tokenSet: 0.50,
  tokenSort: 0.30,
  trigram: 0.20
});

const niveauMapping = {
  xp: 'Xp', x1: 'X1', x2: 'X2', x3: 'X3', x4: 'X4', x5: 'X5', y5: 'X5',
  lp: 'Lp', l1: 'L1', l2: 'L2', l3: 'L3', i4: 'I4', i5: 'I5',
  op: 'Op', o1: 'O1', o2: 'O2', o3: 'O3', a4: 'A4', a5: 'A5'
};

const faculteMapping = {
  fast: 'FAST', fst: 'FAST', fazt: 'FAST',
  fsav: 'FSAV', fseg: 'FSEG', philo: 'PHILO'
};

// Termes fréquents qui décrivent l'opération bancaire ou le contexte académique,
// mais ne font pas partie de l'identité de l'étudiant.
const GENERIC_TOKENS = new Set([
  'paiement', 'paiements', 'payer', 'paye', 'payement',
  'versement', 'versements', 'virement', 'virements', 'transaction', 'transactions',
  'frais', 'minerval', 'scolarite', 'inscription', 'reinscription',
  'academique', 'academiques', 'universitaire', 'universitaires',
  'banque', 'bancaire', 'tmb', 'cash', 'depot', 'depots',
  'usd', 'cdf', 'fc', 'dollar', 'dollars', 'franc', 'francs',
  'reference', 'ref', 'recu', 'bordereau', 'compte',
  'faculte', 'filiere', 'promotion', 'niveau', 'classe', 'annee',
  'genie', 'informatique', 'industriel', 'industrielle', 'parcours', 'ouvert', 'ouverte',
  'etudiant', 'etudiante', 'etudiants', 'etudiantes',
  'ulc', 'universite', 'loyola', 'congo'
]);

export const cleanString = (value) => {
  if (value === null || value === undefined) return '';

  return String(value)
    .replace(/[\u00A0\u2000-\u200F\u2028\u2029\u202F\u205F\u3000]/g, ' ')
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const preprocessDescription = (description) => cleanString(description)
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[,.;:_\-\\]+/g, ' ')
  .replace(/[^a-z0-9/]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ')
  .filter(Boolean);

const removeGenericTokens = (tokens) => tokens.filter((token) => (
  /[a-z]/i.test(token) && !GENERIC_TOKENS.has(token)
));

export const extractNameTokens = (tokens) => removeGenericTokens(tokens);

const normalizeName = (value) => {
  const tokens = Array.isArray(value) ? value : preprocessDescription(value);
  return removeGenericTokens(tokens).join(' ');
};

const buildTrigrams = (value) => {
  const normalized = `  ${normalizeName(value)} `;
  const trigrams = new Set();
  if (normalized.trim().length === 0) return trigrams;
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    trigrams.add(normalized.slice(index, index + 3));
  }
  return trigrams;
};

const javascriptTrigramSimilarity = (left, right) => {
  const leftSet = buildTrigrams(left);
  const rightSet = buildTrigrams(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;

  let intersection = 0;
  for (const trigram of leftSet) {
    if (rightSet.has(trigram)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
};

export const calculateNameMetrics = (left, right, pgTrgmSimilarity = null) => {
  const normalizedLeft = normalizeName(left);
  const normalizedRight = normalizeName(right);
  if (!normalizedLeft || !normalizedRight) {
    return { tokenSet: 0, tokenSort: 0, trigram: 0, combined: 0 };
  }

  const tokenSet = fuzzball.token_set_ratio(normalizedLeft, normalizedRight) / 100;
  const tokenSort = fuzzball.token_sort_ratio(normalizedLeft, normalizedRight) / 100;
  const hasPgTrgmValue = pgTrgmSimilarity !== null
    && pgTrgmSimilarity !== undefined
    && Number.isFinite(Number(pgTrgmSimilarity));
  const trigram = hasPgTrgmValue
    ? Math.max(0, Math.min(1, Number(pgTrgmSimilarity)))
    : javascriptTrigramSimilarity(normalizedLeft, normalizedRight);

  const combined = (
    tokenSet * NAME_WEIGHTS.tokenSet
    + tokenSort * NAME_WEIGHTS.tokenSort
    + trigram * NAME_WEIGHTS.trigram
  );

  return {
    tokenSet,
    tokenSort,
    trigram,
    combined: Math.max(0, Math.min(1, combined))
  };
};

export const extractMatricule = (tokens) => {
  const remainingTokens = [...tokens];
  const index = remainingTokens.findIndex((token) => MATRICULE_PATTERN.test(token));
  if (index === -1) return { matricule: null, remainingTokens };

  const [matricule] = remainingTokens.splice(index, 1);
  return { matricule, remainingTokens };
};

export const levenshteinDistance = (left, right) => {
  const a = String(left ?? '');
  const b = String(right ?? '');
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + substitutionCost
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
};

const isPlausibleAcademicToken = (token, dictionaryType) => {
  if (dictionaryType === 'niveau') return /^[xylioa][a-z0-9]$/i.test(token);
  return /^[a-z]{3,6}$/i.test(token);
};

const findClosestDictionaryEntry = (token, dictionary, dictionaryType) => {
  if (!isPlausibleAcademicToken(token, dictionaryType)) return null;

  let bestMatch = null;
  for (const [key, normalizedValue] of Object.entries(dictionary)) {
    const distance = levenshteinDistance(token, key);
    if (distance > MAX_CODE_DISTANCE) continue;
    if (!bestMatch || distance < bestMatch.distance) {
      bestMatch = { key, value: normalizedValue, distance };
      if (distance === 0) break;
    }
  }
  return bestMatch;
};

export const extractAcademicCodes = (tokens) => {
  let niveau_extrait = null;
  let faculte_extrait = null;
  const remainingTokens = [];

  for (const token of tokens) {
    if (!niveau_extrait) {
      const niveauMatch = findClosestDictionaryEntry(token, niveauMapping, 'niveau');
      if (niveauMatch) {
        niveau_extrait = niveauMatch.value;
        continue;
      }
    }

    if (!faculte_extrait) {
      const faculteMatch = findClosestDictionaryEntry(token, faculteMapping, 'faculte');
      if (faculteMatch) {
        faculte_extrait = faculteMatch.value;
        continue;
      }
    }

    remainingTokens.push(token);
  }

  return { niveau_extrait, faculte_extrait, remainingTokens };
};

const analyzeDescription = (descriptionBrute) => {
  const initialTokens = preprocessDescription(descriptionBrute);
  const { matricule, remainingTokens: tokensSansMatricule } = extractMatricule(initialTokens);
  const {
    niveau_extrait,
    faculte_extrait,
    remainingTokens: tokensSansCodes
  } = extractAcademicCodes(tokensSansMatricule);

  return {
    matricule_extrait: matricule,
    niveau_extrait,
    faculte_extrait,
    tokens_nom: extractNameTokens(tokensSansCodes)
  };
};

const runStudentQuery = async (queryWithTrigram, queryWithoutTrigram, params) => {
  if (getDatabaseCapabilities().pgTrgm) {
    try {
      return await pool.query(queryWithTrigram, params);
    } catch (error) {
      // 42883 = fonction non définie. Le service reste disponible sans DDL.
      if (error?.code !== '42883') throw error;
      setDatabaseCapabilities({ pgTrgm: false });
    }
  }
  return pool.query(queryWithoutTrigram, params);
};

const findActiveStudentByMatricule = async (matricule, paiementName) => {
  if (!matricule) return null;

  const baseSelect = `
    SELECT e.id, e.matricule, e.nom_complet, e.promotion_id,
           p.libelle AS promotion_libelle, p.annee_debut, p.annee_fin,
           p.faculte_id, p.filiere_id, p.niveau_id,
           f.code AS faculte_code, f.libelle AS faculte_libelle,
           fi.code AS filiere_code, fi.libelle AS filiere_libelle,
           n.code AS niveau_code, n.libelle AS niveau_libelle`;
  const joinsAndWhere = `
    FROM etudiants e
    JOIN promotions p ON e.promotion_id = p.id
    JOIN facultes f ON p.faculte_id = f.id
    JOIN filieres fi ON p.filiere_id = fi.id
    JOIN niveaux n ON p.niveau_id = n.id
    WHERE p.actif = true AND e.matricule = $1
    LIMIT 1`;

  const withTrigram = `${baseSelect}, similarity(LOWER(e.nom_complet), LOWER($2::text)) AS trigram_similarity ${joinsAndWhere}`;
  const withoutTrigram = `${baseSelect}, (0 + LENGTH($2::text) * 0)::real AS trigram_similarity ${joinsAndWhere}`;
  const result = await runStudentQuery(withTrigram, withoutTrigram, [matricule, paiementName]);
  return result.rows[0] || null;
};

const verifyExtractedMatricule = async (matricule, tokensNom) => {
  const paiementName = tokensNom.join(' ');
  const student = await findActiveStudentByMatricule(matricule, paiementName);
  if (!student) {
    return {
      valid: false,
      reason: 'matricule_inexistant',
      student: null,
      nameMetrics: calculateNameMetrics(paiementName, '')
    };
  }

  const nameMetrics = calculateNameMetrics(
    paiementName,
    student.nom_complet,
    getDatabaseCapabilities().pgTrgm ? student.trigram_similarity : null
  );

  return {
    valid: nameMetrics.combined >= MATRICULE_NAME_THRESHOLD,
    reason: nameMetrics.combined >= MATRICULE_NAME_THRESHOLD
      ? 'matricule_et_nom_concordants'
      : 'nom_non_concordant',
    student,
    nameMetrics
  };
};

const findCandidates = async (faculte_extrait, niveau_extrait, tokensNom) => {
  const paiementName = tokensNom.join(' ');
  if (!paiementName) return [];

  const params = [];
  const filters = ['p.actif = true'];

  if (faculte_extrait) {
    params.push(faculte_extrait);
    filters.push(`UPPER(f.code) = UPPER($${params.length})`);
  }

  if (niveau_extrait) {
    params.push(niveau_extrait);
    filters.push(`UPPER(n.code) = UPPER($${params.length})`);
  }

  params.push(paiementName);
  const nameParamIndex = params.length;
  params.push(MAX_CANDIDATE_POOL);
  const limitParamIndex = params.length;

  const commonSelect = `
    SELECT e.id, e.matricule, e.nom_complet, e.promotion_id,
           p.libelle AS promotion_libelle, p.annee_debut, p.annee_fin,
           p.faculte_id, p.filiere_id, p.niveau_id,
           f.code AS faculte_code, f.libelle AS faculte_libelle,
           fi.code AS filiere_code, fi.libelle AS filiere_libelle,
           n.code AS niveau_code, n.libelle AS niveau_libelle`;
  const commonFrom = `
    FROM etudiants e
    JOIN promotions p ON e.promotion_id = p.id
    JOIN facultes f ON p.faculte_id = f.id
    JOIN filieres fi ON p.filiere_id = fi.id
    JOIN niveaux n ON p.niveau_id = n.id
    WHERE ${filters.join(' AND ')}`;

  const withTrigram = `
    ${commonSelect}, similarity(LOWER(e.nom_complet), LOWER($${nameParamIndex}::text)) AS trigram_similarity
    ${commonFrom}
    ORDER BY trigram_similarity DESC, e.id ASC
    LIMIT $${limitParamIndex}`;

  const withoutTrigram = `
    ${commonSelect}, (0 + LENGTH($${nameParamIndex}::text) * 0)::real AS trigram_similarity
    ${commonFrom}
    ORDER BY e.id ASC
    LIMIT $${limitParamIndex}`;

  const result = await runStudentQuery(withTrigram, withoutTrigram, params);
  const noAcademicCriteria = !faculte_extrait && !niveau_extrait;

  const scored = result.rows.map((student) => {
    const metrics = calculateNameMetrics(
      paiementName,
      student.nom_complet,
      getDatabaseCapabilities().pgTrgm ? student.trigram_similarity : null
    );

    let score = metrics.combined;
    if (niveau_extrait && student.niveau_code?.toUpperCase() === niveau_extrait.toUpperCase()) {
      score += LEVEL_BONUS;
    }
    if (faculte_extrait && student.faculte_code?.toUpperCase() === faculte_extrait.toUpperCase()) {
      score += FACULTY_BONUS;
    }
    if (noAcademicCriteria) score -= NO_ACADEMIC_CRITERIA_PENALTY;

    return {
      ...student,
      score: Math.max(0, Math.min(1, score)),
      name_similarity: metrics.combined,
      similarity_token_set: metrics.tokenSet,
      similarity_token_sort: metrics.tokenSort,
      similarity_trigram: metrics.trigram,
      exact_matricule: false
    };
  });

  scored.sort((left, right) => (
    right.score - left.score
    || right.name_similarity - left.name_similarity
    || right.similarity_trigram - left.similarity_trigram
    || left.nom_complet.localeCompare(right.nom_complet, 'fr')
  ));

  return scored.slice(0, MAX_REVIEW_CANDIDATES);
};

export const decideAttribution = (candidats, options = {}) => {
  const hasAcademicCriteria = Boolean(options.hasAcademicCriteria);
  if (candidats.length === 0) return { decision: 'revue', candidats: [], scoreGap: 0 };

  const best = candidats[0];
  const secondScore = candidats[1]?.score ?? 0;
  const scoreGap = best.score - secondScore;

  const canAutoAssign = (
    hasAcademicCriteria
    && best.name_similarity >= MIN_NAME_SIMILARITY_WITHOUT_MATRICULE
    && best.score >= AUTO_MATCH_THRESHOLD
    && scoreGap >= MINIMUM_SCORE_GAP
  );

  if (canAutoAssign) return { decision: 'auto', etudiant: best, scoreGap };
  return { decision: 'revue', candidats, scoreGap };
};

export const matchPaiement = async (description_brute) => {
  const analysis = analyzeDescription(description_brute);
  const {
    matricule_extrait,
    niveau_extrait,
    faculte_extrait,
    tokens_nom
  } = analysis;
  const hasAcademicCriteria = Boolean(niveau_extrait || faculte_extrait);

  if (matricule_extrait) {
    const matriculeVerification = await verifyExtractedMatricule(matricule_extrait, tokens_nom);

    if (matriculeVerification.valid) {
      const verifiedStudent = {
        ...matriculeVerification.student,
        score: matriculeVerification.nameMetrics.combined,
        name_similarity: matriculeVerification.nameMetrics.combined,
        similarity_token_set: matriculeVerification.nameMetrics.tokenSet,
        similarity_token_sort: matriculeVerification.nameMetrics.tokenSort,
        similarity_trigram: matriculeVerification.nameMetrics.trigram,
        exact_matricule: true
      };

      return {
        ...analysis,
        verification_matricule: {
          valide: true,
          raison: matriculeVerification.reason,
          similarite_nom: matriculeVerification.nameMetrics.combined
        },
        decision: { decision: 'auto', etudiant: verifiedStudent, scoreGap: 1 },
        score: verifiedStudent.score
      };
    }

    const candidats = await findCandidates(faculte_extrait, niveau_extrait, tokens_nom);
    const decision = decideAttribution(candidats, { hasAcademicCriteria });

    return {
      ...analysis,
      verification_matricule: {
        valide: false,
        raison: matriculeVerification.reason,
        similarite_nom: matriculeVerification.nameMetrics.combined
      },
      decision,
      score: decision.decision === 'auto'
        ? decision.etudiant.score
        : (candidats[0]?.score || 0)
    };
  }

  const candidats = await findCandidates(faculte_extrait, niveau_extrait, tokens_nom);
  const decision = decideAttribution(candidats, { hasAcademicCriteria });

  return {
    ...analysis,
    verification_matricule: null,
    decision,
    score: decision.decision === 'auto'
      ? decision.etudiant.score
      : (candidats[0]?.score || 0)
  };
};

export const getCandidatsForPaiement = async (description_brute) => {
  const analysis = analyzeDescription(description_brute);
  const candidats = await findCandidates(
    analysis.faculte_extrait,
    analysis.niveau_extrait,
    analysis.tokens_nom
  );

  return candidats.map((candidate) => ({
    id: candidate.id,
    matricule: candidate.matricule || '',
    nom_complet: candidate.nom_complet || '',
    promotion: {
      id: candidate.promotion_id,
      promotion_libelle: candidate.promotion_libelle || '',
      faculte_code: candidate.faculte_code || '',
      faculte_libelle: candidate.faculte_libelle || '',
      filiere_code: candidate.filiere_code || '',
      filiere_libelle: candidate.filiere_libelle || '',
      niveau_code: candidate.niveau_code || '',
      niveau_libelle: candidate.niveau_libelle || '',
      annee_debut: candidate.annee_debut || null,
      annee_fin: candidate.annee_fin || null
    },
    score: candidate.score || 0,
    name_similarity: candidate.name_similarity || 0,
    similarity_token_set: candidate.similarity_token_set || 0,
    similarity_token_sort: candidate.similarity_token_sort || 0,
    similarity_trigram: candidate.similarity_trigram || 0,
    exact_matricule: false
  }));
};

export const matchingConstants = Object.freeze({
  MATRICULE_NAME_THRESHOLD,
  MIN_NAME_SIMILARITY_WITHOUT_MATRICULE,
  AUTO_MATCH_THRESHOLD,
  MINIMUM_SCORE_GAP,
  NO_ACADEMIC_CRITERIA_PENALTY,
  LEVEL_BONUS,
  FACULTY_BONUS,
  MAX_CODE_DISTANCE,
  MAX_REVIEW_CANDIDATES,
  NAME_WEIGHTS
});
