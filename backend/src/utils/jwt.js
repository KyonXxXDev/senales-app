import crypto from 'node:crypto';
import { HttpError } from './http-error.js';

function base64UrlEncode(data) {
  return Buffer.from(typeof data === 'string' ? data : JSON.stringify(data))
    .toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Genera un token JWT firmado con HMAC SHA-256 (HS256).
 */
export function signJwt(payload, secret, { expiresInSeconds = 86400 } = {}) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedPayload = base64UrlEncode(fullPayload);

  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Valida y decodifica un token JWT.
 */
export function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') {
    throw new HttpError(401, 'Token no proporcionado.');
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new HttpError(401, 'Formato de token inválido.');
  }

  const [encodedHeader, encodedPayload, signature] = parts;

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  // Comparación en tiempo constante para evitar ataques de timing
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new HttpError(401, 'Firma de token inválida.');
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    throw new HttpError(401, 'Payload del token corrupto.');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    throw new HttpError(401, 'La sesión ha expirado. Por favor ingresa nuevamente.');
  }

  return payload;
}

export default { signJwt, verifyJwt };

