import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { kpi } = controllers;

router.get('/kpis', ah(kpi.getKpis));

export default router;
