import { Router } from 'express';
import { ah } from '../utils/async-handler.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { controllers } from '../config/module.factory.js';

const router = Router();
const { auth } = controllers;

router.get('/colaboradores', ah(auth.getColaboradores));
router.post('/login', ah(auth.login));
router.get('/me', requireAuth, ah(auth.me));

export default router;

