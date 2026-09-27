import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { catalogo, material, vinil, client, colaborador, etapa } = controllers;

// Resumen de catálogos completo para el frontend
router.get('/catalogos', ah(catalogo.getCatalogos));

// Materiales
router.get('/materiales', ah(material.getAll));
router.get('/materiales/:id', ah(material.getById));
router.post('/materiales', ah(material.create));
router.put('/materiales/:id', ah(material.update));
router.delete('/materiales/:id', ah(material.delete));

// Viniles
router.get('/viniles', ah(vinil.getAll));
router.get('/viniles/:id', ah(vinil.getById));
router.post('/viniles', ah(vinil.create));
router.put('/viniles/:id', ah(vinil.update));
router.delete('/viniles/:id', ah(vinil.delete));

// Clientes
router.get('/clientes', ah(client.getAll));
router.get('/clientes/:id', ah(client.getById));
router.post('/clientes', ah(client.create));
router.put('/clientes/:id', ah(client.update));
router.delete('/clientes/:id', ah(client.delete));

// Colaboradores
router.get('/colaboradores', ah(colaborador.getAll));
router.get('/colaboradores/:id', ah(colaborador.getById));
router.post('/colaboradores', ah(colaborador.create));
router.put('/colaboradores/:id', ah(colaborador.update));
router.delete('/colaboradores/:id', ah(colaborador.delete));

// Etapas
router.get('/etapas', ah(etapa.getAll));
router.get('/etapas/:area', ah(etapa.getByArea));
router.get('/etapas/detalle/:id', ah(etapa.getById));

export default router;
