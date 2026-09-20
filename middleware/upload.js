/**
 * Configure Multer et contrôle les fichiers envoyés avant leur traitement par les contrôleurs.
 */
import path from 'node:path';
import multer from 'multer';

const storage = multer.memoryStorage();
const allowedExtensions = new Set(['.xlsx']);
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream'
]);

const fileFilter = (req, file, callback) => {
  const extension = path.extname(file.originalname || '').toLowerCase();
  const validExtension = allowedExtensions.has(extension);
  const validMime = !file.mimetype || allowedMimeTypes.has(file.mimetype);

  if (!validExtension || !validMime) {
    const error = new Error('Format accepté : fichier Excel .xlsx uniquement.');
    error.code = 'INVALID_EXCEL_FILE';
    return callback(error);
  }

  return callback(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
    fields: 10,
    parts: 12
  }
});

export default upload;
