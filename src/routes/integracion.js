import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { permitir } from '../utils/permisos.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { integracion } = controllers;
const admin = permitir('catalogo.admin', 'Solo un administrador puede configurar la integración con el ERP.');
const logistica = permitir('insumos.registrar', 'Solo Logística o un administrador puede registrar consumos en el ERP.');

// Estado y sincronización con el ERP
router.get('/erp/estado', admin, ah(integracion.estado));
router.post('/erp/sincronizar-colaboradores', admin, ah(integracion.sincronizarColaboradores));
router.get('/erp/productos', admin, ah(integracion.buscarProductos));

// Insumos (material / vinil) enlazados al inventario del ERP
router.get('/insumos', ah(integracion.listarInsumos));
router.put('/insumos/:tipo/:id/enlace', admin, ah(integracion.enlazar));
router.delete('/insumos/:tipo/:id/enlace', admin, ah(integracion.desenlazar));

// Consumo de insumos generado por la producción
router.get('/insumos/consumos', ah(integracion.consumos));
router.post('/insumos/consumos/registrar', logistica, ah(integracion.registrarConsumos));
router.post('/insumos/consumos/anular', logistica, ah(integracion.anularConsumos));

export default router;
