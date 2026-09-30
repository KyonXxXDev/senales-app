import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { pedido } = controllers;

router.get('/pedidos', ah(pedido.getAll));
router.get('/pedidos/:id', ah(pedido.getById));
router.post('/pedidos', ah(pedido.create));
router.patch('/pedidos/:id', ah(pedido.update));
router.post('/pedidos/:id/lineas', ah(pedido.agregarLinea));
router.post('/pedidos/:id/entregar', ah(pedido.marcarEntregado));
router.delete('/pedidos/:id', ah(pedido.deletePedido));

// Líneas de detalle
router.patch('/detalles/:id', ah(pedido.updateLinea));  // editar línea + notificación
router.delete('/detalles/:id', ah(pedido.deleteLinea));

export default router;
