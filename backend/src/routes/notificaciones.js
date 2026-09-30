import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { int } from '../utils/validators.js';
import { pool } from '../config/database.js';
import NotificacionService from '../service/notificacion.service.js';

const router = Router();
const notificacionService = new NotificacionService(pool);

/**
 * GET /notificaciones
 * Obtiene notificaciones del colaborador autenticado.
 * Query param: solo_no_leidas=1 → solo pendientes (para el badge)
 *              (sin param)       → las últimas 100 (leídas + no leídas)
 */
router.get('/notificaciones', ah(async (req, res) => {
  const idColab =
    req.user?.id_colaborador ||
    (req.query.id_colaborador ? int(req.query.id_colaborador, 'id_colaborador') : null);

  if (!idColab) return res.json([]);

  const soloNoLeidas = req.query.solo_no_leidas === '1';
  const rows = soloNoLeidas
    ? await notificacionService.obtenerPendientes(idColab)
    : await notificacionService.obtenerTodas(idColab);

  res.json(rows);
}));

/**
 * PATCH /notificaciones/:id/leer
 * Marca una notificación como leída.
 */
router.patch('/notificaciones/:id/leer', ah(async (req, res) => {
  const idNotif = int(req.params.id, 'id');
  const idColab =
    req.user?.id_colaborador ||
    (req.body?.id_colaborador ? int(req.body.id_colaborador, 'id_colaborador') : null);

  if (!idColab) return res.status(400).json({ error: 'Colaborador requerido.' });

  const ok = await notificacionService.marcarLeida(idNotif, idColab);
  res.json({ ok });
}));

/**
 * PATCH /notificaciones/leer-todas
 * Marca todas las notificaciones del colaborador como leídas.
 * IMPORTANTE: esta ruta debe registrarse ANTES de /notificaciones/:id/leer
 * para que "leer-todas" no sea interpretado como un :id.
 */
router.patch('/notificaciones/leer-todas', ah(async (req, res) => {
  const idColab =
    req.user?.id_colaborador ||
    (req.body?.id_colaborador ? int(req.body.id_colaborador, 'id_colaborador') : null);

  if (!idColab) return res.status(400).json({ error: 'Colaborador requerido.' });

  const count = await notificacionService.marcarTodasLeidas(idColab);
  res.json({ marcadas: count });
}));

export default router;
