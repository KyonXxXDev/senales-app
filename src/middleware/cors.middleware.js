import { ACCEPTED_ORIGINS } from '../config/env.config.js';

/**
 * CORS solo hace falta si el frontend se abre desde otro dominio.
 * Con credenciales (cookie de sesión del ERP) no se permite '*'.
 */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ACCEPTED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

export default corsMiddleware;
