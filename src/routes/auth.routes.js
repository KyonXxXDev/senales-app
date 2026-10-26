import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { auth } = controllers;

router.get('/config', ah(auth.config));            // público: modo de sesión
router.get('/colaboradores', ah(auth.getColaboradores)); // solo modo local
router.post('/login', ah(auth.login));             // solo modo local
router.get('/me', requireAuth, ah(auth.me));

export default router;
