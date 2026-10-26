import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { permitir } from '../utils/permisos.js';
import { controllers } from '../config/module.factory.js';
import { uploadSingleImage } from '../middleware/upload.middleware.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();
const { senal } = controllers;
const gestionar = permitir('senal.gestionar', 'Tu usuario no puede modificar el catálogo de señales.');
const mover = permitir('stock.mover', 'Solo Operaciones o Producción pueden mover stock.');

// Reverse proxy para imágenes de señales (SharePoint)
router.get('/senales/:id/imagen', optionalAuth, ah(senal.getImagen));
router.get('/senales/:id/foto', optionalAuth, ah(senal.getImagen));

router.get('/senales', ah(senal.getAll));
router.get('/senales/:id', ah(senal.getById));
router.post('/senales', gestionar, uploadSingleImage, ah(senal.create));
router.put('/senales/:id', gestionar, uploadSingleImage, ah(senal.update));
router.post('/senales/upload-sharepoint', gestionar, uploadSingleImage, ah(senal.uploadSharepoint));
router.patch('/senales/:id/activo', gestionar, ah(senal.patchActivo));

// Stock y Kardex
router.get('/senales/:id/kardex', ah(senal.getKardex));
router.post('/stock/movimientos', mover, ah(senal.crearMovimientoStock));

export default router;
