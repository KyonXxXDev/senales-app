'use strict';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Envuelve handlers async para que los errores lleguen al middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- validación mínima ----------
export function int(value, field, { required = true, min = null } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `El campo "${field}" debe ser un número entero.`);
  if (min !== null && n < min) throw new HttpError(400, `El campo "${field}" debe ser mayor o igual a ${min}.`);
  return n;
}

export function num(value, field, { required = true, positive = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio.`);
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, `El campo "${field}" debe ser numérico.`);
  if (positive && n <= 0) throw new HttpError(400, `El campo "${field}" debe ser mayor a 0.`);
  return n;
}

export function str(value, field, { required = true, max = 500 } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio.`);
    return null;
  }
  const s = String(value).trim();
  if (s.length > max) throw new HttpError(400, `El campo "${field}" admite máximo ${max} caracteres.`);
  return s;
}

export function oneOf(value, field, options, { required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio.`);
    return null;
  }
  const v = String(value).toUpperCase();
  if (!options.includes(v)) throw new HttpError(400, `"${field}" debe ser uno de: ${options.join(', ')}.`);
  return v;
}

export function date(value, field, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `El campo "${field}" es obligatorio.`);
    return null;
  }
  if (Number.isNaN(Date.parse(value))) throw new HttpError(400, `El campo "${field}" no es una fecha válida.`);
  return value;
}

// ---------- traducción de errores de PostgreSQL ----------
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });

  switch (err.code) {
    case 'P0001': // RAISE EXCEPTION de los triggers: mensajes de negocio
      return res.status(409).json({ error: err.message });
    case '23505':
      return res.status(409).json({ error: 'Ya existe un registro con esos mismos datos.', detalle: err.detail });
    case '23503':
      return res.status(409).json({
        error: 'El registro está relacionado con otros datos (o referencia uno que no existe).',
        detalle: err.detail,
      });
    case '23514':
      if (err.constraint === 'senal_stock_check')
        return res.status(409).json({ error: 'El movimiento dejaría el stock en negativo.' });
      return res.status(400).json({ error: 'Los datos no cumplen una regla de validación.', detalle: err.constraint });
    case '22P02':
    case '22007':
    case '22008':
      return res.status(400).json({ error: 'Formato de dato inválido.', detalle: err.message });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
