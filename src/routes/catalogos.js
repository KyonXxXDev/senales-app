import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { permitir, puede } from '../utils/permisos.js';
import { HttpError } from '../utils/http-error.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { catalogo, material, vinil, client, colaborador, etapa } = controllers;
const admin = permitir('catalogo.admin', 'Solo un administrador puede modificar los catálogos.');
// Operaciones puede dar de alta clientes desde el formulario de pedido
const altaCliente = (req, res, next) => (puede(req.user, 'catalogo.admin') || puede(req.user, 'pedido.gestionar')
  ? next() : next(new HttpError(403, 'No puedes registrar clientes.')));

router.get('/catalogos', ah(catalogo.getCatalogos));

router.get('/materiales', ah(material.getAll));
router.get('/materiales/:id', ah(material.getById));
router.post('/materiales', admin, ah(material.create));
router.put('/materiales/:id', admin, ah(material.update));
router.delete('/materiales/:id', admin, ah(material.delete));

router.get('/viniles', ah(vinil.getAll));
router.get('/viniles/:id', ah(vinil.getById));
router.post('/viniles', admin, ah(vinil.create));
router.put('/viniles/:id', admin, ah(vinil.update));
router.delete('/viniles/:id', admin, ah(vinil.delete));

router.get('/clientes', ah(client.getAll));
router.get('/clientes/:id', ah(client.getById));
router.post('/clientes', altaCliente, ah(client.create));
router.put('/clientes/:id', admin, ah(client.update));
router.delete('/clientes/:id', admin, ah(client.delete));

router.get('/colaboradores', ah(colaborador.getAll));
router.get('/colaboradores/:id', ah(colaborador.getById));
router.post('/colaboradores', admin, ah(colaborador.create));
router.put('/colaboradores/:id', admin, ah(colaborador.update));
router.delete('/colaboradores/:id', admin, ah(colaborador.delete));

router.get('/etapas', ah(etapa.getAll));
router.get('/etapas/:area', ah(etapa.getByArea));
router.get('/etapas/detalle/:id', ah(etapa.getById));

export default router;
