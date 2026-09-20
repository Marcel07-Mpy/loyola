/**
 * Génération du classeur Excel de situation financière.
 *
 * Ce service reçoit uniquement les étudiants déjà filtrés et les métadonnées
 * du rapport. Il ne réalise aucun calcul métier supplémentaire et ne modifie
 * donc ni les montants ni les données persistées.
 */
import ExcelJS from 'exceljs';
import { formatPromotionLabel } from '../utils/academicDisplay.js';

const COLORS = {
  black: 'FF111111',
  ink: 'FF2B2B2B',
  muted: 'FF5F6368',
  red: 'FFB6232A',
  gold: 'FFF0BF31',
  border: 'FFE5E7EB',
  white: 'FFFFFFFF'
};

/** Construit un classeur professionnel prêt à être envoyé ou sauvegardé. */
export const buildFinancialReportWorkbook = ({ etudiants = [], reportMetadata }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Université Loyola du Congo';
  workbook.lastModifiedBy = 'Loyola Finance';
  workbook.created = reportMetadata.generatedAt;
  workbook.modified = reportMetadata.generatedAt;
  workbook.subject = 'Situation financière des étudiants';
  workbook.title = reportMetadata.title;

  const worksheet = workbook.addWorksheet('Situation financière', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.55,
        bottom: 0.55,
        header: 0.2,
        footer: 0.2
      }
    },
    properties: { defaultRowHeight: 20 }
  });

  worksheet.pageSetup.printTitlesRow = '1:5';
  worksheet.views = [{ state: 'frozen', ySplit: 5, activeCell: 'A6' }];
  worksheet.columns = [
    { key: 'matricule', width: 19 },
    { key: 'nom_complet', width: 34 },
    { key: 'promotion', width: 46 },
    { key: 'montant_du', width: 18 },
    { key: 'montant_restant', width: 20 },
    { key: 'excedent', width: 18 }
  ];

  // Le titre et les métadonnées occupent uniquement la zone au-dessus du tableau.
  worksheet.mergeCells('A1:F1');
  worksheet.getCell('A1').value = reportMetadata.title;
  worksheet.getCell('A1').font = {
    name: 'Arial',
    size: 16,
    bold: true,
    color: { argb: COLORS.black }
  };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
  worksheet.getRow(1).height = 30;
  worksheet.getRow(1).border = {
    bottom: { style: 'medium', color: { argb: COLORS.red } }
  };

  worksheet.mergeCells('A2:F2');
  worksheet.getCell('A2').value = `Date de génération : ${reportMetadata.generatedAt.toLocaleString('fr-FR')}`;
  worksheet.getCell('A2').font = {
    name: 'Arial',
    size: 10,
    italic: true,
    color: { argb: COLORS.muted }
  };
  worksheet.getCell('A2').alignment = { horizontal: 'center' };
  worksheet.getRow(2).height = 20;

  worksheet.mergeCells('A3:F3');
  worksheet.getCell('A3').value = reportMetadata.searchLabel
    ? `Périmètre : ${reportMetadata.scopeLabel} | Recherche appliquée : ${reportMetadata.searchLabel}`
    : `Périmètre : ${reportMetadata.scopeLabel}`;
  worksheet.getCell('A3').font = { name: 'Arial', size: 10, color: { argb: COLORS.ink } };
  worksheet.getCell('A3').alignment = { horizontal: 'center' };
  worksheet.getRow(3).height = 20;

  const headerRow = worksheet.getRow(5);
  headerRow.values = [
    'Matricule',
    'Nom complet',
    'Promotion',
    'Montant dû',
    'Montant restant',
    'Excédent'
  ];
  headerRow.height = 27;
  headerRow.font = { name: 'Arial', bold: true, color: { argb: COLORS.white }, size: 10 };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.black } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.black } },
      left: { style: 'thin', color: { argb: 'FFD7D7D7' } },
      bottom: { style: 'medium', color: { argb: COLORS.gold } },
      right: { style: 'thin', color: { argb: 'FFD7D7D7' } }
    };
  });

  etudiants.forEach((etudiant) => {
    const row = worksheet.addRow({
      matricule: etudiant.matricule,
      nom_complet: etudiant.nom_complet,
      promotion: formatPromotionLabel(etudiant),
      montant_du: Number(etudiant.montant_du || 0),
      montant_restant: Number(etudiant.montant_restant || 0),
      excedent: Number(etudiant.excedent || 0)
    });

    row.height = 24;
    row.alignment = { vertical: 'middle' };
    row.getCell(2).alignment = { vertical: 'middle', wrapText: true };
    row.getCell(3).alignment = { vertical: 'middle', wrapText: true };

    [4, 5, 6].forEach((columnIndex) => {
      row.getCell(columnIndex).numFmt = '#,##0.00 "USD"';
      row.getCell(columnIndex).alignment = { vertical: 'middle', horizontal: 'right' };
    });

    row.eachCell((cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: COLORS.ink } };
      cell.border = {
        left: { style: 'thin', color: { argb: COLORS.border } },
        bottom: { style: 'thin', color: { argb: COLORS.border } },
        right: { style: 'thin', color: { argb: COLORS.border } }
      };
    });
  });

  const lastDataRow = Math.max(5, worksheet.lastRow.number);
  worksheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: lastDataRow, column: 6 }
  };
  worksheet.headerFooter.oddFooter = '&LUniversité Loyola du Congo&CPage &P / &N&R&D';

  return workbook;
};
