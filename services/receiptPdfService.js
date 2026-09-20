/**
 * Génération du reçu académique PDF.
 *
 * Le document reprend la hiérarchie visuelle du modèle « Annonce du 16 mars » :
 * emblème à gauche, identité institutionnelle centrée, drapeau à droite, titre
 * sobre, filet rouge et filigrane du logo. Aucune donnée n'est lue en base dans
 * ce service ; le contrôleur lui transmet uniquement les informations utiles.
 */
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatPromotionLabel } from '../utils/academicDisplay.js';

const COLORS = {
  black: '#111111',
  ink: '#242424',
  muted: '#5F6368',
  line: '#D7D7D7',
  softLine: '#ECECEC',
  red: '#B6232A',
  darkRed: '#8E130C',
  gold: '#F0BF31',
  white: '#FFFFFF'
};

const PAGE = {
  left: 42,
  right: 553,
  width: 511,
  bottom: 760
};

/** Formate un montant en conservant une présentation homogène en USD. */
const formatAmount = (value) => {
  const amount = Number(value || 0).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).replace(/[\u00A0\u202F]/g, ' ');

  return `${amount} USD`;
};

/** Retourne une date lisible ou un tiret lorsque la valeur est absente. */
const formatDate = (value) => {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('fr-FR');
};

/**
 * Construit et retourne un flux PDFKit prêt à être envoyé dans la réponse HTTP.
 */
export const buildStudentReceiptPdf = async ({
  etudiant,
  paiements,
  logoPath,
  flagPath
}) => {
  const totalPaye = paiements.reduce(
    (sum, paiement) => sum + Number(paiement.montant || 0),
    0
  );
  const montantDu = Number(etudiant.montant_du || 0);
  const montantRestant = Math.max(0, montantDu - totalPaye);
  const excedent = Math.max(0, totalPaye - montantDu);
  const dateEmission = new Date();
  const receiptNumber = `REC-${dateEmission.getFullYear()}-${String(etudiant.id).padStart(6, '0')}`;
  const promotionLabel = formatPromotionLabel(etudiant);

  // Le QR code contient uniquement les informations nécessaires pour vérifier
  // le reçu, sans détails techniques ni données d'authentification.
  const qrPayload = [
    `Reçu: ${receiptNumber}`,
    `Étudiant: ${etudiant.nom_complet}`,
    `Matricule: ${etudiant.matricule}`,
    `Promotion: ${promotionLabel}`,
    `Total payé: ${totalPaye.toFixed(2)} USD`,
    `Émis le: ${dateEmission.toLocaleDateString('fr-FR')}`
  ].join('\n');
  const qrImage = await QRCode.toDataURL(qrPayload, { margin: 1, width: 220 });

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 26, bottom: 50, left: PAGE.left, right: 42 },
    bufferPages: true,
    autoFirstPage: false,
    info: {
      Title: `Reçu officiel - ${etudiant.matricule}`,
      Author: 'Université Loyola du Congo',
      Subject: 'Reçu de paiement académique',
      Keywords: 'reçu, paiement, étudiant, ULC-Icam'
    }
  });

  /** Dessine le logo de l'université en arrière-plan, avec une opacité faible. */
  const drawWatermark = () => {
    doc.save();
    doc.opacity(0.045);
    doc.image(logoPath, 155, 250, { width: 285, align: 'center' });
    doc.restore();
  };

  /**
   * Reproduit l'en-tête académique observé sur le modèle fourni, sans la ligne
   * ministérielle explicitement exclue du reçu.
   */
  const drawAcademicHeader = ({ continuation = false } = {}) => {
    doc.addPage();
    drawWatermark();

    // Logo institutionnel à gauche et drapeau officiel à droite.
    doc.image(logoPath, 45, 31, { width: 67, height: 67, fit: [67, 67] });
    doc.image(flagPath, 481, 35, { width: 69, height: 52, fit: [69, 52] });

    // Identité institutionnelle centrée : la mention du ministère est absente.
    doc.font('Helvetica').fontSize(9.5).fillColor(COLORS.black)
      .text('RÉPUBLIQUE DÉMOCRATIQUE DU CONGO', 122, 27, {
        width: 349,
        align: 'center'
      });
    doc.font('Helvetica-Bold').fontSize(11.5)
      .text('UNIVERSITÉ LOYOLA DU CONGO', 122, 43, {
        width: 349,
        align: 'center'
      });
    doc.font('Helvetica').fontSize(8.2).fillColor(COLORS.ink)
      .text('Université agréée par l’Arrêté Ministériel', 122, 60, {
        width: 349,
        align: 'center'
      });
    doc.fontSize(7.5)
      .text('N° Réf. : 171/MINESU/CABMIN/TMF/RK3/CPM/2016 du 21 avril 2016', 122, 73, {
        width: 349,
        align: 'center'
      });
    doc.font('Helvetica-Bold').fontSize(12.5).fillColor(COLORS.red)
      .text('Faculté des sciences et technologies / ULC-Icam', 92, 91, {
        width: 411,
        align: 'center'
      });

    // Le filet rouge reprend le repère institutionnel du modèle académique.
    doc.moveTo(PAGE.left, 113).lineTo(PAGE.right, 113)
      .lineWidth(1.7).strokeColor(COLORS.red).stroke();

    const title = continuation
      ? 'REÇU OFFICIEL DE PAIEMENT ACADÉMIQUE - SUITE'
      : 'REÇU OFFICIEL DE PAIEMENT ACADÉMIQUE';

    // Le titre reste sobre : aucun surlignement ni forme colorée autour du texte.
    doc.font('Times-Bold').fontSize(16.5).fillColor(COLORS.black)
      .text(title, PAGE.left, 136, { width: PAGE.width, align: 'center' });
    doc.moveTo(178, 162).lineTo(417, 162)
      .lineWidth(0.9).strokeColor(COLORS.darkRed).stroke();

    doc.font('Helvetica').fontSize(8.2).fillColor(COLORS.muted)
      .text(`N° ${receiptNumber}`, PAGE.left, 173, { width: 250 });
    doc.text(`Émis à Kinshasa, le ${dateEmission.toLocaleDateString('fr-FR')}`, 303, 173, {
      width: 250,
      align: 'right'
    });

    return 198;
  };

  /** Affiche un titre de section avec une simple ligne, sans cartouche coloré. */
  const drawSectionTitle = (title, y) => {
    doc.font('Times-Bold').fontSize(11.5).fillColor(COLORS.darkRed)
      .text(title, PAGE.left, y, { width: PAGE.width });
    doc.moveTo(PAGE.left, y + 17).lineTo(PAGE.right, y + 17)
      .lineWidth(0.7).strokeColor(COLORS.line).stroke();
    return y + 29;
  };

  /** Dessine une information sous la forme libellé/valeur. */
  const drawInfoLine = ({ label, value, y, labelWidth = 120, bold = false }) => {
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(COLORS.muted)
      .text(label.toUpperCase(), PAGE.left, y, { width: labelWidth });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(COLORS.ink)
      .text(value || '—', PAGE.left + labelWidth, y - 1, {
        width: PAGE.width - labelWidth,
        ellipsis: true
      });
    doc.moveTo(PAGE.left, y + 17).lineTo(PAGE.right, y + 17)
      .lineWidth(0.45).strokeColor(COLORS.softLine).stroke();
    return y + 25;
  };

  /** Dessine l'en-tête simple du tableau des paiements. */
  const drawPaymentsHeader = (y) => {
    doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y)
      .lineWidth(1.1).strokeColor(COLORS.red).stroke();
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(COLORS.black);
    doc.text('RÉFÉRENCE', 47, y + 8, { width: 175 });
    doc.text('DATE', 233, y + 8, { width: 75 });
    doc.text('MONTANT', 320, y + 8, { width: 100, align: 'right' });
    doc.text('STATUT', 450, y + 8, { width: 88, align: 'center' });
    doc.moveTo(PAGE.left, y + 25).lineTo(PAGE.right, y + 25)
      .lineWidth(0.7).strokeColor(COLORS.black).stroke();
    return y + 26;
  };

  /** Dessine une ligne du tableau et retourne la position verticale suivante. */
  const drawPaymentRow = (paiement, y) => {
    const rowHeight = 27;

    doc.font('Helvetica').fontSize(8.2).fillColor(COLORS.ink)
      .text(paiement.reference_paiement || '—', 47, y + 8, {
        width: 175,
        height: 12,
        ellipsis: true
      });
    doc.text(formatDate(paiement.date_paiement), 233, y + 8, { width: 75 });
    doc.font('Helvetica-Bold')
      .text(formatAmount(paiement.montant), 320, y + 8, {
        width: 100,
        align: 'right'
      });
    doc.font('Helvetica').fontSize(7.8).fillColor(COLORS.darkRed)
      .text('VALIDÉ', 450, y + 8, { width: 88, align: 'center' });

    doc.moveTo(PAGE.left, y + rowHeight).lineTo(PAGE.right, y + rowHeight)
      .lineWidth(0.45).strokeColor(COLORS.softLine).stroke();
    return y + rowHeight;
  };

  let currentY = drawAcademicHeader();

  currentY = drawSectionTitle('IDENTIFICATION DE L’ÉTUDIANT', currentY);
  currentY = drawInfoLine({
    label: 'Nom complet',
    value: etudiant.nom_complet,
    y: currentY,
    bold: true
  });
  currentY = drawInfoLine({
    label: 'Matricule',
    value: etudiant.matricule,
    y: currentY,
    bold: true
  });
  currentY = drawInfoLine({
    label: 'Promotion',
    value: promotionLabel,
    y: currentY,
    bold: true
  });
  currentY = drawInfoLine({
    label: 'Montant dû',
    value: formatAmount(montantDu),
    y: currentY
  });

  currentY += 10;
  currentY = drawSectionTitle('HISTORIQUE DES PAIEMENTS', currentY);
  currentY = drawPaymentsHeader(currentY);

  if (paiements.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted)
      .text('Aucun paiement enregistré pour cet étudiant.', PAGE.left, currentY + 11, {
        width: PAGE.width,
        align: 'center'
      });
    currentY += 38;
  } else {
    for (const paiement of paiements) {
      if (currentY + 27 > PAGE.bottom) {
        currentY = drawAcademicHeader({ continuation: true });
        currentY = drawSectionTitle('HISTORIQUE DES PAIEMENTS - SUITE', currentY);
        currentY = drawPaymentsHeader(currentY);
      }
      currentY = drawPaymentRow(paiement, currentY);
    }
  }

  // Réserve une nouvelle page lorsque le récapitulatif ne tient plus dans la
  // zone imprimable restante.
  if (currentY + 205 > PAGE.bottom) {
    currentY = drawAcademicHeader({ continuation: true });
  } else {
    currentY += 18;
  }

  currentY = drawSectionTitle('SITUATION FINANCIÈRE', currentY);

  const financialRows = [
    ['Montant académique dû', formatAmount(montantDu)],
    ['Total payé', formatAmount(totalPaye)],
    ['Montant restant', formatAmount(montantRestant)],
    ['Excédent', formatAmount(excedent)]
  ];

  financialRows.forEach(([label, value], index) => {
    const isTotal = index === 1;
    doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(isTotal ? 10.5 : 9.3)
      .fillColor(isTotal ? COLORS.black : COLORS.ink)
      .text(label, PAGE.left, currentY + 5, { width: 250 });
    doc.font('Helvetica-Bold').fontSize(isTotal ? 11 : 9.5)
      .text(value, 303, currentY + 5, { width: 250, align: 'right' });
    doc.moveTo(PAGE.left, currentY + 22).lineTo(PAGE.right, currentY + 22)
      .lineWidth(isTotal ? 0.9 : 0.45)
      .strokeColor(isTotal ? COLORS.red : COLORS.softLine).stroke();
    currentY += 28;
  });

  currentY += 14;
  doc.font('Times-Bold').fontSize(10.5).fillColor(COLORS.black)
    .text('VALIDATION', PAGE.left, currentY);

  // Zones de signature sobres, alignées avec le modèle académique.
  doc.moveTo(54, currentY + 62).lineTo(215, currentY + 62)
    .lineWidth(0.7).strokeColor(COLORS.ink).stroke();
  doc.font('Helvetica').fontSize(8.3).fillColor(COLORS.muted)
    .text('Agent financier', 54, currentY + 68, { width: 161, align: 'center' });

  doc.moveTo(270, currentY + 62).lineTo(431, currentY + 62)
    .lineWidth(0.7).strokeColor(COLORS.ink).stroke();
  doc.text('Cachet officiel', 270, currentY + 68, { width: 161, align: 'center' });

  doc.image(qrImage, 477, currentY + 2, { width: 62 });
  doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted)
    .text('Vérification', 473, currentY + 66, { width: 70, align: 'center' });

  // Ajoute le pied de page sur toutes les pages après le calcul de la pagination.
  const pageRange = doc.bufferedPageRange();
  for (let pageIndex = 0; pageIndex < pageRange.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const previousBottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.moveTo(56, 795).lineTo(539, 795)
      .lineWidth(1.3).strokeColor(COLORS.red).stroke();
    doc.font('Helvetica-Oblique').fontSize(6.8).fillColor(COLORS.ink)
      .text(
        'Siège : Mission catholique de Kimwenzo, C/Mont Ngafula - Université Loyola du Congo',
        56,
        802,
        { width: 415, align: 'left', lineBreak: false }
      );
    doc.font('Helvetica-Bold').fontSize(7).fillColor(COLORS.darkRed)
      .text(`Page ${pageIndex + 1} / ${pageRange.count}`, 477, 802, {
        width: 62,
        align: 'right',
        lineBreak: false
      });

    doc.page.margins.bottom = previousBottomMargin;
  }

  return doc;
};
