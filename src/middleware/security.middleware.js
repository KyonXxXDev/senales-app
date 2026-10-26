import { FRAME_ANCESTORS } from '../config/env.config.js';

/**
 * Cabeceras de seguridad. La app puede mostrarse dentro del ERP (iframe):
 *  - mismo dominio (recomendado, detrás del nginx del ERP): basta con 'self'
 *  - otro dominio: agregar el origen del ERP en FRAME_ANCESTORS
 */
const ancestros = ["'self'", ...FRAME_ANCESTORS].join(' ');

export function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Content-Security-Policy', [
    "default-src 'self'",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self'",
    "connect-src 'self'",
    `frame-ancestors ${ancestros}`,
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '));
  if (!FRAME_ANCESTORS.length) res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
}

export default securityHeaders;
