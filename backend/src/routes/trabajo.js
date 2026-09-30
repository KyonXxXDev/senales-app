'use strict';
import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { trabajo } = controllers;

// Bandeja de trabajo por área (MARKETING o PRODUCCION)
router.get('/bandeja/:area', ah(trabajo.getBandeja));

// Gestión de sesiones de tiempo
router.post('/tiempos', ah(trabajo.iniciarSesion));
router.patch('/tiempos/:id/finalizar', ah(trabajo.finalizarSesion));
router.put('/tiempos/:id', ah(trabajo.modificarSesion));
router.delete('/tiempos/:id', ah(trabajo.eliminarSesion));

// Historial de una línea (ambas áreas)
router.get('/detalles/:id/tiempos', ah(trabajo.getHistorialLinea));

export default router;
