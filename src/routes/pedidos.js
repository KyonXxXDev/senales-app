import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { permitir } from '../utils/permisos.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { pedido } = controllers;
const gestionar = permitir('pedido.gestionar', 'Solo Operaciones puede registrar o modificar pedidos.');

router.get('/pedidos', ah(pedido.getAll));
router.get('/pedidos/:id', ah(pedido.getById));
router.post('/pedidos', gestionar, ah(pedido.create));
router.patch('/pedidos/:id', gestionar, ah(pedido.update));
router.post('/pedidos/:id/lineas', gestionar, ah(pedido.agregarLinea));
router.post('/pedidos/:id/entregar', gestionar, ah(pedido.marcarEntregado));
router.delete('/pedidos/:id', gestionar, ah(pedido.deletePedido));

// Líneas de detalle
router.get('/detalles/:id/ediciones', ah(pedido.getEdiciones));
router.patch('/detalles/:id', gestionar, ah(pedido.updateLinea)); // cantidad (con historial) / observación
router.delete('/detalles/:id', gestionar, ah(pedido.deleteLinea));

export default router;
