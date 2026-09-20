/**
 * Rapport PDF professionnel du journal d'audit.
 *
 * Le service reçoit les lignes déjà filtrées. Le tableau détaillé suit
 * volontairement les six colonnes visibles sur la page Audit :
 * Type, Date, Agent, Étudiant, Détail de l'opération, Justification.
 */
import PDFDocument from 'pdfkit';

const COLORS = {
  red: '#B6232A',
  darkRed: '#8E130C',
  gold: '#F0BF31',
  ink: '#1F2937',
  muted: '#64748B',
  line: '#D7DEE8',
  soft: '#F8FAFC',
  cream: '#FFF9F2',
  white: '#FFFFFF'
};

// A4 paysage = ~595 pt de haut. Le pied de page reste volontairement au-dessus
// de la marge PDFKit pour empêcher toute pagination implicite/feuille blanche.
const PAGE = {
  marginLeft: 34,
  marginRight: 34,
  top: 28,
  bottomMargin: 16,
  footerRuleY: 557,
  footerY: 565,
  tableBottom: 548,
  continuedTableY: 105
};

const ACTION_LABELS = {
  validation_manuelle: 'Validation manuelle',
  remboursement: "Remboursement d'excédent",
  annulation_paiement: 'Annulation paiement',
  suppression_paiement: 'Suppression paiement',
  reaffectation_paiement: 'Réaffectation paiement'
};

const compact = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const fallback = (value) => compact(value) || '-';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('fr-FR', {
    timeZone: 'Africa/Kinshasa',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('fr-FR', { timeZone: 'Africa/Kinshasa' });
};

const formatMoney = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return `${Math.abs(numeric).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).replace(/[\u00A0\u202F]/g, ' ')} USD`;
};

const formatPromotion = (audit) => {
  const faculty = compact(audit.faculte_code || audit.faculte_libelle);
  const filiere = compact(audit.filiere_code || audit.filiere_libelle);
  const level = compact(audit.niveau_code || audit.niveau_libelle);
  const year = audit.annee_debut && audit.annee_fin ? `${audit.annee_debut}-${audit.annee_fin}` : '';
  const explicit = compact(audit.promotion_libelle);
  return explicit || [faculty, filiere, level, year].filter(Boolean).join(' - ') || '-';
};

const actionLabel = (type) => ACTION_LABELS[type] || fallback(type);

const buildStudentLabel = (audit) => {
  const lines = [fallback(audit.etudiant_nom)];
  if (compact(audit.etudiant_matricule)) lines.push(`Matricule: ${compact(audit.etudiant_matricule)}`);
  const promotion = formatPromotion(audit);
  if (promotion !== '-') lines.push(`Promotion: ${promotion}`);
  return lines.join('\n');
};

const buildOperationDetail = (audit) => {
  const lines = [];
  const reference = compact(audit.reference_paiement);

  if (reference) lines.push(`Référence: ${reference}`);
  if (audit.date_paiement) lines.push(`Date paiement: ${formatDate(audit.date_paiement)}`);
  if (audit.paiement_montant !== null && audit.paiement_montant !== undefined) {
    lines.push(`Montant: ${formatMoney(audit.paiement_montant)}`);
  }
  if (compact(audit.paiement_statut)) lines.push(`Statut: ${compact(audit.paiement_statut)}`);
  if (compact(audit.description_brute)) lines.push(`Donnée bancaire: ${compact(audit.description_brute)}`);

  const oldValue = compact(audit.ancienne_valeur);
  const newValue = compact(audit.nouvelle_valeur);
  if (oldValue) lines.push(`Avant: ${oldValue}`);
  if (newValue) lines.push(`Après: ${newValue}`);

  // Conserve les identifiants d'audit déjà enregistrés sans créer de colonne
  // supplémentaire : ils restent disponibles dans le détail de l'opération.
  const ids = [
    audit.id ? `Audit #${audit.id}` : '',
    audit.paiement_id ? `Paiement #${audit.paiement_id}` : '',
    audit.etudiant_id ? `Étudiant #${audit.etudiant_id}` : ''
  ].filter(Boolean);
  if (ids.length) lines.push(ids.join(' | '));

  if (lines.length === 0) {
    if (audit.type_action === 'remboursement') return "Remboursement d'un excédent financier enregistré.";
    if (audit.type_action === 'validation_manuelle') return "Attribution manuelle d'un paiement à un étudiant.";
    return 'Opération enregistrée dans le journal d’audit.';
  }

  return lines.join('\n');
};

const buildJustification = (audit) => {
  const justification = compact(audit.justification);
  if (justification) return justification;

  let comment = compact(audit.commentaire);
  if (audit.type_action === 'remboursement') {
    comment = comment.replace(/^REMBOURSEMENT VALIDÉ\s*:\s*/i, '').trim();
  }
  return comment || '-';
};

const reportRows = (audits) => audits.map((audit) => ({
  type: actionLabel(audit.type_action),
  date: formatDateTime(audit.horodatage),
  agent: `${fallback(audit.agent_username)}\nRôle: ${fallback(audit.agent_role)}`,
  student: buildStudentLabel(audit),
  detail: buildOperationDetail(audit),
  justification: buildJustification(audit)
}));

const buildSummary = (audits) => {
  const users = new Set(audits.map((item) => item.agent_id || item.agent_username).filter(Boolean));
  const actions = new Map();
  for (const audit of audits) {
    const key = audit.type_action || 'autre';
    actions.set(key, (actions.get(key) || 0) + 1);
  }

  const dates = audits
    .map((item) => new Date(item.horodatage))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);

  return {
    total: audits.length,
    users: users.size,
    actionTypes: actions.size,
    actionDistribution: [...actions.entries()]
      .map(([key, count]) => `${actionLabel(key)}: ${count}`)
      .join(' | '),
    firstDate: dates[0] || null,
    lastDate: dates.at(-1) || null
  };
};

// Largeur totale : 774 pt, adaptée à la zone imprimable d'un A4 paysage.
const columns = [
  { key: 'type', label: 'TYPE', width: 108 },
  { key: 'date', label: 'DATE', width: 78 },
  { key: 'agent', label: 'AGENT', width: 92 },
  { key: 'student', label: 'ÉTUDIANT', width: 130 },
  { key: 'detail', label: "DÉTAIL DE L'OPÉRATION", width: 244 },
  { key: 'justification', label: 'JUSTIFICATION', width: 122 }
];

const BODY_FONT_SIZE = 6.65;
const BODY_LINE_GAP = 0.9;
const CELL_PADDING_X = 4;
const CELL_PADDING_Y = 4.5;

const textHeight = (doc, text, width, fontSize = BODY_FONT_SIZE, font = 'Helvetica') => {
  doc.font(font).fontSize(fontSize);
  return doc.heightOfString(String(text || '-'), {
    width: Math.max(10, width - (CELL_PADDING_X * 2)),
    lineGap: BODY_LINE_GAP
  });
};

const rowHeight = (doc, row) => Math.max(
  27,
  ...columns.map((column) => textHeight(doc, row[column.key], column.width) + (CELL_PADDING_Y * 2))
);

const fitTextChunk = (doc, text, width, maxHeight) => {
  const normalized = String(text || '-');
  if (textHeight(doc, normalized, width) <= maxHeight) return [normalized, ''];

  let low = 1;
  let high = normalized.length;
  let best = 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    let candidate = normalized.slice(0, mid);
    const lastSpace = candidate.lastIndexOf(' ');
    const lastBreak = candidate.lastIndexOf('\n');
    const safeBreak = Math.max(lastSpace, lastBreak);
    if (safeBreak > Math.floor(mid * 0.6)) candidate = candidate.slice(0, safeBreak);

    if (textHeight(doc, candidate, width) <= maxHeight) {
      best = Math.max(1, candidate.length);
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const head = normalized.slice(0, best).trim();
  const tail = normalized.slice(best).trim();
  return [head || normalized.slice(0, 1), tail];
};

const splitOversizedRow = (doc, row, maxRowHeight) => {
  const maxTextHeight = Math.max(20, maxRowHeight - (CELL_PADDING_Y * 2));
  const remaining = Object.fromEntries(columns.map((column) => [column.key, String(row[column.key] || '-') ]));
  const chunks = [];

  // Limite de sécurité pour empêcher toute boucle infinie sur un contenu
  // pathologique. Avec six colonnes, cette limite est très supérieure à un
  // rapport normal tout en garantissant un PDF fini.
  let guard = 0;
  while (columns.some((column) => remaining[column.key]) && guard < 500) {
    const chunk = {};
    let consumedSomething = false;
    for (const column of columns) {
      if (!remaining[column.key]) {
        chunk[column.key] = '';
        continue;
      }
      const before = remaining[column.key];
      const [head, tail] = fitTextChunk(doc, before, column.width, maxTextHeight);
      chunk[column.key] = head || '';
      remaining[column.key] = tail;
      if (tail.length < before.length) consumedSomething = true;
    }
    chunks.push(chunk);
    guard += 1;
    if (!consumedSomething) break;
  }

  return chunks;
};

const drawInstitutionHeader = (doc, { logoPath, generatedAt }) => {
  const pageWidth = doc.page.width;
  const contentWidth = pageWidth - PAGE.marginLeft - PAGE.marginRight;

  if (logoPath) {
    try {
      doc.image(logoPath, PAGE.marginLeft, 25, { width: 52, height: 52, fit: [52, 52] });
    } catch {
      // Le rapport reste exploitable même si le logo n'est pas disponible.
    }
  }

  doc.font('Helvetica-Bold').fontSize(12.4).fillColor(COLORS.darkRed)
    .text('UNIVERSITÉ LOYOLA DU CONGO', PAGE.marginLeft + 65, 27, {
      width: contentWidth - 130,
      align: 'center'
    });
  doc.font('Helvetica').fontSize(8.3).fillColor(COLORS.muted)
    .text('Loyola Finance - Gestion et suivi financier', PAGE.marginLeft + 65, 45, {
      width: contentWidth - 130,
      align: 'center'
    });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink)
    .text("RAPPORT D'AUDIT", PAGE.marginLeft + 65, 60, {
      width: contentWidth - 130,
      align: 'center'
    });

  doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted)
    .text(`Généré le ${formatDateTime(generatedAt)}`, pageWidth - PAGE.marginRight - 130, 31, {
      width: 130,
      align: 'right'
    });

  doc.moveTo(PAGE.marginLeft, 91).lineTo(pageWidth - PAGE.marginRight, 91)
    .lineWidth(2).strokeColor(COLORS.red).stroke();
  doc.moveTo(PAGE.marginLeft, 94).lineTo(pageWidth - PAGE.marginRight, 94)
    .lineWidth(0.8).strokeColor(COLORS.gold).stroke();
};

const drawFiltersBlock = (doc, { filters, y }) => {
  const width = doc.page.width - PAGE.marginLeft - PAGE.marginRight;
  const labelWidth = 120;
  const itemWidth = (width - labelWidth - 20) / 2;
  const items = [
    `Période: ${filters.periodLabel}`,
    `Utilisateur: ${filters.userLabel}`,
    `Action: ${filters.actionLabel}`,
    filters.searchLabel ? `Recherche: ${filters.searchLabel}` : 'Recherche: aucune'
  ];

  doc.font('Helvetica').fontSize(7.2);
  const firstRowHeight = Math.max(
    doc.heightOfString(items[0], { width: itemWidth - 8, lineGap: 1 }),
    doc.heightOfString(items[1], { width: itemWidth - 8, lineGap: 1 }),
    10
  );
  const secondRowHeight = Math.max(
    doc.heightOfString(items[2], { width: itemWidth - 8, lineGap: 1 }),
    doc.heightOfString(items[3], { width: itemWidth - 8, lineGap: 1 }),
    10
  );
  const blockHeight = Math.max(49, 17 + firstRowHeight + secondRowHeight + 15);

  doc.roundedRect(PAGE.marginLeft, y, width, blockHeight, 7)
    .fillAndStroke(COLORS.cream, '#F3D9A3');
  doc.font('Helvetica-Bold').fontSize(7.4).fillColor(COLORS.darkRed)
    .text('FILTRES APPLIQUÉS', PAGE.marginLeft + 10, y + 8, { width: labelWidth - 10 });

  const valueX = PAGE.marginLeft + labelWidth;
  doc.font('Helvetica').fontSize(7.2).fillColor(COLORS.ink);
  doc.text(items[0], valueX, y + 7, { width: itemWidth - 8, lineGap: 1 });
  doc.text(items[1], valueX + itemWidth, y + 7, { width: itemWidth - 8, lineGap: 1 });
  const secondY = y + 12 + firstRowHeight;
  doc.text(items[2], valueX, secondY, { width: itemWidth - 8, lineGap: 1 });
  doc.text(items[3], valueX + itemWidth, secondY, { width: itemWidth - 8, lineGap: 1 });

  return y + blockHeight + 10;
};

const drawSummary = (doc, { summary, y }) => {
  const width = doc.page.width - PAGE.marginLeft - PAGE.marginRight;
  const gap = 7;
  const cardWidth = (width - (gap * 3)) / 4;
  const cards = [
    ['OPÉRATIONS', String(summary.total)],
    ['UTILISATEURS', String(summary.users)],
    ["TYPES D'ACTION", String(summary.actionTypes)],
    ['PÉRIODE DES RÉSULTATS', summary.firstDate && summary.lastDate
      ? `${formatDate(summary.firstDate)} - ${formatDate(summary.lastDate)}`
      : '-']
  ];

  cards.forEach(([label, value], index) => {
    const x = PAGE.marginLeft + (index * (cardWidth + gap));
    doc.roundedRect(x, y, cardWidth, 42, 6).fillAndStroke(COLORS.soft, COLORS.line);
    doc.font('Helvetica-Bold').fontSize(6.4).fillColor(COLORS.muted)
      .text(label, x + 8, y + 7, { width: cardWidth - 16 });
    doc.font('Helvetica-Bold').fontSize(index === 3 ? 8.2 : 13).fillColor(COLORS.ink)
      .text(value, x + 8, y + 20, { width: cardWidth - 16 });
  });

  const distY = y + 49;
  doc.font('Helvetica-Bold').fontSize(6.8).fillColor(COLORS.darkRed)
    .text('RÉPARTITION :', PAGE.marginLeft, distY, { width: 75 });
  doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted);
  const distributionHeight = Math.max(10, doc.heightOfString(summary.actionDistribution || '-', {
    width: width - 76,
    lineGap: 1
  }));
  doc.text(summary.actionDistribution || '-', PAGE.marginLeft + 76, distY, {
    width: width - 76,
    lineGap: 1
  });

  return distY + distributionHeight + 12;
};

const drawTableHeader = (doc, y) => {
  let x = PAGE.marginLeft;
  const headerHeight = 26;
  for (const column of columns) {
    doc.rect(x, y, column.width, headerHeight).fillAndStroke(COLORS.darkRed, COLORS.white);
    doc.font('Helvetica-Bold').fontSize(6.1).fillColor(COLORS.white)
      .text(column.label, x + CELL_PADDING_X, y + 7, {
        width: column.width - (CELL_PADDING_X * 2),
        height: headerHeight - 9,
        align: 'left'
      });
    x += column.width;
  }
  return y + headerHeight;
};

const drawTableRow = (doc, row, y, height, rowIndex) => {
  let x = PAGE.marginLeft;
  const fill = rowIndex % 2 === 0 ? COLORS.white : COLORS.soft;
  for (const column of columns) {
    doc.rect(x, y, column.width, height).fillAndStroke(fill, COLORS.line);
    doc.font('Helvetica')
      .fontSize(BODY_FONT_SIZE)
      .fillColor(COLORS.ink)
      .text(row[column.key] || '-', x + CELL_PADDING_X, y + CELL_PADDING_Y, {
        width: column.width - (CELL_PADDING_X * 2),
        height: height - (CELL_PADDING_Y * 2),
        lineGap: BODY_LINE_GAP,
        ellipsis: false
      });
    x += column.width;
  }
  return y + height;
};

const addContentPage = (doc, headerData) => {
  doc.addPage();
  drawInstitutionHeader(doc, headerData);
  return drawTableHeader(doc, PAGE.continuedTableY);
};

const drawFooter = (doc, { generatedAt, pageNumber, totalPages }) => {
  const pageWidth = doc.page.width;
  const footerWidth = pageWidth - PAGE.marginLeft - PAGE.marginRight;

  doc.moveTo(PAGE.marginLeft, PAGE.footerRuleY)
    .lineTo(pageWidth - PAGE.marginRight, PAGE.footerRuleY)
    .lineWidth(0.45)
    .strokeColor(COLORS.line)
    .stroke();

  doc.font('Helvetica').fontSize(6.6).fillColor(COLORS.muted)
    .text("Université Loyola du Congo | Rapport d'audit", PAGE.marginLeft, PAGE.footerY, {
      width: footerWidth / 2,
      lineBreak: false
    });
  doc.text(`Généré le ${formatDateTime(generatedAt)}`, PAGE.marginLeft + (footerWidth / 3), PAGE.footerY, {
    width: footerWidth / 3,
    align: 'center',
    lineBreak: false
  });
  doc.font('Helvetica-Bold').fillColor(COLORS.ink)
    .text(`Page ${pageNumber} sur ${totalPages}`, pageWidth - PAGE.marginRight - 110, PAGE.footerY, {
      width: 110,
      align: 'right',
      lineBreak: false
    });
};

/**
 * Construit un flux PDFKit prêt à être pipe() dans la réponse Express.
 */
export const buildAuditReportPdf = ({ audits, filters, logoPath, generatedAt = new Date() }) => {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: {
      top: PAGE.top,
      bottom: PAGE.bottomMargin,
      left: PAGE.marginLeft,
      right: PAGE.marginRight
    },
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: "Rapport d'audit - Loyola Finance",
      Author: 'Université Loyola du Congo',
      Subject: "Journal d'audit financier filtré",
      Keywords: 'audit, finances, Loyola Finance, Université Loyola du Congo'
    }
  });

  const headerData = { logoPath, generatedAt };
  const summary = buildSummary(audits);
  const rows = reportRows(audits);

  doc.addPage();
  drawInstitutionHeader(doc, headerData);
  let y = drawFiltersBlock(doc, { filters, y: 105 });
  y = drawSummary(doc, { summary, y });
  y = drawTableHeader(doc, y);

  let visualRowIndex = 0;
  for (const row of rows) {
    const freshBodyStart = PAGE.continuedTableY + 26;
    const maxFreshRowHeight = PAGE.tableBottom - freshBodyStart;
    const naturalHeight = rowHeight(doc, row);
    const rowSegments = naturalHeight > maxFreshRowHeight
      ? splitOversizedRow(doc, row, maxFreshRowHeight)
      : [row];

    for (let segmentIndex = 0; segmentIndex < rowSegments.length; segmentIndex += 1) {
      const segment = { ...rowSegments[segmentIndex] };
      if (segmentIndex > 0) {
        segment.type = `${row.type} - suite`;
        segment.date = 'Suite';
        segment.agent = '';
        segment.student = '';
      }

      const height = rowHeight(doc, segment);
      if (y + height > PAGE.tableBottom) {
        y = addContentPage(doc, headerData);
      }
      y = drawTableRow(doc, segment, y, height, visualRowIndex);
      visualRowIndex += 1;
    }
  }

  // Important : aucune écriture ne doit provoquer de nouvelle page après que
  // cette plage a été calculée. Les coordonnées du footer sont donc toutes
  // comprises dans la zone imprimable définie par bottomMargin.
  const range = doc.bufferedPageRange();
  const totalPages = range.count;
  for (let pageOffset = 0; pageOffset < totalPages; pageOffset += 1) {
    doc.switchToPage(range.start + pageOffset);
    drawFooter(doc, {
      generatedAt,
      pageNumber: pageOffset + 1,
      totalPages
    });
  }

  return doc;
};

export const auditReportInternals = {
  reportRows,
  buildSummary,
  actionLabel,
  formatDateTime,
  formatDate,
  columns
};
