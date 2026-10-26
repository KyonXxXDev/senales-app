import { Router } from 'express';
import { pool } from '../config/database.js';
import { AUTH_MODE } from '../config/env.config.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { erpClient } from '../integrations/erp.client.js';

import { controllers } from '../config/module.factory.js';
import { ah } from '../utils/async-handler.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

import authRouter from './auth.routes.js';
import catalogosRouter from './catalogos.js';
import senalesRouter from './senales.js';
import pedidosRouter from './pedidos.js';
import trabajoRouter from './trabajo.js';
import kpisRouter from './kpis.js';
import notificacionesRouter from './notificaciones.js';
import integracionRouter from './integracion.js';

const api = Router();

// Salud (público): base de datos y, en modo ERP, si el ERP responde
api.get('/salud', async (req, res) => {
  const estado = { ok: true, servicio: 'senales', modo_sesion: AUTH_MODE };
  try {
    await pool.query('SELECT 1');
    estado.bd = 'conectada';
  } catch (e) {
    estado.ok = false;
    estado.bd = e.message;
  }
  if (erpClient.configurado) estado.erp = await erpClient.salud();
  res.status(estado.ok ? 200 : 503).json(estado);
});

// Sesión
api.use('/auth', authRouter);

// Reverse proxy de imágenes de señales (sesión opcional: no bloquea etiquetas <img> de navegadores)
api.get('/senales/:id/imagen', optionalAuth, ah(controllers.senal.getImagen));
api.get('/senales/:id/foto', optionalAuth, ah(controllers.senal.getImagen));

// Todo lo demás requiere sesión (del ERP o local)
api.use(requireAuth);
api.use(catalogosRouter);
api.use(senalesRouter);
api.use(pedidosRouter);
api.use(trabajoRouter);
api.use(kpisRouter);
api.use(notificacionesRouter);
api.use(integracionRouter);

api.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));

export default api;
