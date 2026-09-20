/**
 * Lit et valide les classeurs Excel de manière centralisée avant les imports en base.
 */
import { readSheet } from 'read-excel-file/node';
import JSZip from 'jszip';

const MAX_COLUMNS = 100;
const MAX_ARCHIVE_ENTRIES = 500;
const MAX_UNCOMPRESSED_SIZE = 50 * 1024 * 1024;

/**
 * Lit uniquement la première feuille d'un fichier .xlsx.
 * La bibliothèque ne calcule aucune formule : elle lit uniquement les valeurs
 * déjà enregistrées dans le classeur.
 */
export const readFirstWorksheetMatrix = async (buffer) => {
  const zip = await JSZip.loadAsync(buffer, { checkCRC32: false, createFolders: false });
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('ARCHIVE_TOO_COMPLEX');

  const uncompressedSize = entries.reduce((total, entry) => {
    const size = Number(entry?._data?.uncompressedSize) || 0;
    return total + size;
  }, 0);
  if (uncompressedSize > MAX_UNCOMPRESSED_SIZE) throw new Error('ARCHIVE_TOO_LARGE');

  const rows = await readSheet(buffer);
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('NO_WORKSHEET');

  const maxColumns = rows.reduce(
    (maximum, row) => Math.max(maximum, Array.isArray(row) ? row.length : 0),
    0
  );
  if (maxColumns > MAX_COLUMNS) throw new Error('TOO_MANY_COLUMNS');

  return rows.map((row) => (Array.isArray(row) ? row : []));
};
