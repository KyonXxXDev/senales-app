import multer from 'multer';

// Almacenamiento en memoria para transferir los buffers directamente a SharePoint (Microsoft Graph)
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // Máximo 15MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen (JPG, PNG, WEBP, SVG, etc.).'), false);
    }
  },
});

/**
 * Middleware para procesar un único archivo de imagen,
 * permitiendo nombres de campo habituales: 'imagen', 'file', o 'photo'.
 */
export const uploadSingleImage = upload.fields([
  { name: 'imagen', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'photo', maxCount: 1 },
]);
