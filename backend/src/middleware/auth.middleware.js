import { SECRET_KEY } from '../config/env.config.js';
import { verifyJwt } from '../utils/jwt.js';
import { HttpError } from '../utils/http-error.js';

/**
 * Middleware que exige autenticación mediante JWT (Bearer token).
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new HttpError(401, 'Autenticación requerida. Identifícate con tu colaborador.'));
  }

  const token = authHeader.slice(7).trim();
  try {
    const user = verifyJwt(token, SECRET_KEY);
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware opcional: si viene token lo decodifica en req.user, si no, continúa.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    try {
      req.user = verifyJwt(token, SECRET_KEY);
    } catch {
      // Ignorar token inválido si es opcional
    }
  }
  next();
}

export default { requireAuth, optionalAuth };

