import { HttpError } from './http-error.js';

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

export default { int, num, str, oneOf, date };

