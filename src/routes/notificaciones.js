import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { int } from '../utils/validators.js';
import { services } from '../config/module.factory.js';

const router = Router();
const notif = () => services.notificacion;

// Notificaciones del usuario con sesión (nunca de otro colaborador)
router.get('/notificaciones', ah(async (req, res) => {
  const id = req.user.id_colaborador;
  res.json(req.query.solo_no_leidas === '1'
    ? await notif().obtenerPendientes(id)
    : await notif().obtenerTodas(id));
}));

router.patch('/notificaciones/leer-todas', ah(async (req, res) => {
  res.json({ marcadas: await notif().marcarTodasLeidas(req.user.id_colaborador) });
}));

router.patch('/notificaciones/:id/leer', ah(async (req, res) => {
  res.json({ ok: await notif().marcarLeida(int(req.params.id, 'id'), req.user.id_colaborador) });
}));

export default router;
