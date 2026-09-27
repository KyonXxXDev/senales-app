import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { controllers } from '../config/module.factory.js';
import { uploadSingleImage } from '../middleware/upload.middleware.js';

const router = Router();
const { senal } = controllers;

router.get('/senales', ah(senal.getAll));
router.get('/senales/:id', ah(senal.getById));
router.post('/senales', uploadSingleImage, ah(senal.create));
router.put('/senales/:id', uploadSingleImage, ah(senal.update));
router.post('/senales/upload-sharepoint', uploadSingleImage, ah(senal.uploadSharepoint));
router.patch('/senales/:id/activo', ah(senal.patchActivo));

// Stock y Kardex
router.get('/senales/:id/kardex', ah(senal.getKardex));
router.post('/stock/movimientos', ah(senal.crearMovimientoStock));

export default router;
