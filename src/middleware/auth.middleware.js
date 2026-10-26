import { AUTH_MODE, ERP_JWT_SECRET, SECRET_KEY } from '../config/env.config.js';
import { verifyJwt } from '../utils/jwt.js';
import { HttpError } from '../utils/http-error.js';
import { services } from '../config/module.factory.js';

/** Lee una cookie sin dependencias extra */
function leerCookie(req, nombre) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const parte of raw.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(parte.slice(i + 1).trim()); } catch { return null; }
    }
  }
  return null;
}

/**
 * Tokens candidatos, en orden:
 *  1. Authorization: Bearer <token>
 *  2. Cookie httpOnly "access_token" del ERP (mismo dominio detrás de nginx)
 */
function tokensDe(req) {
  const lista = [];
  const h = req.headers.authorization;
  if (h && /^Bearer\s+/i.test(h)) lista.push(h.replace(/^Bearer\s+/i, '').replace(/^"(.*)"$/, '$1').trim());
  if (AUTH_MODE === 'erp') {
    const c = leerCookie(req, 'access_token');
    if (c) lista.push(c);
  }
  return [...new Set(lista.filter(Boolean))];
}

async function resolverUsuario(req) {
  const tokens = tokensDe(req);
  if (!tokens.length) return null;

  let ultimoError = null;
  for (const token of tokens) {
    try {
      if (AUTH_MODE === 'erp') {
        if (!ERP_JWT_SECRET) throw new HttpError(500, 'Falta ERP_JWT_SECRET (debe ser igual al SECRET_KEY del ERP).');
        const payload = verifyJwt(token, ERP_JWT_SECRET);
        req.erpToken = token;
        return await services.identidad.desdeTokenErp(payload, token);
      }
      const payload = verifyJwt(token, SECRET_KEY);
      return await services.identidad.desdeTokenLocal(payload);
    } catch (err) {
      ultimoError = err;
    }
  }
  throw ultimoError;
}

/** Exige sesión válida; deja el colaborador en req.user */
export async function requireAuth(req, res, next) {
  try {
    const user = await resolverUsuario(req);
    if (!user) {
      throw new HttpError(401, AUTH_MODE === 'erp'
        ? 'Sesión del ERP no encontrada. Inicia sesión en el ERP.'
        : 'Autenticación requerida. Identifícate con tu colaborador.');
    }
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof HttpError && err.status >= 500) return next(err);
    next(err instanceof HttpError ? err : new HttpError(401, 'Sesión inválida.'));
  }
}

/** Si hay token válido lo usa; si no, continúa sin usuario */
export async function optionalAuth(req, res, next) {
  try {
    const user = await resolverUsuario(req);
    if (user) req.user = user;
  } catch { /* sin sesión */ }
  next();
}

export default { requireAuth, optionalAuth };
