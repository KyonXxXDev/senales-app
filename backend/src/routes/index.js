import { Router } from 'express';
import { pool } from '../config/database.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

import authRouter from './auth.routes.js';
import catalogosRouter from './catalogos.js';
import senalesRouter from './senales.js';
import pedidosRouter from './pedidos.js';
import trabajoRouter from './trabajo.js';
import kpisRouter from './kpis.js';

const api = Router();

// Inyectar usuario autenticado opcionalmente en todas las peticiones
api.use(optionalAuth);

// Salud del servidor y base de datos
api.get('/salud', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, bd: 'conectada' });
  } catch (e) {
    res.status(503).json({ ok: false, bd: e.message });
  }
});

// Rutas de autenticación
api.use('/auth', authRouter);

// Rutas operativas de la aplicación
api.use(catalogosRouter);
api.use(senalesRouter);
api.use(pedidosRouter);
api.use(trabajoRouter);
api.use(kpisRouter);

// 404 para cualquier ruta de /api no coincidente
api.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));

export default api;

