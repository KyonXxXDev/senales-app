import { HttpError } from '../utils/http-error.js';

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la petición.' });
  }

  switch (err.code) {
    case 'P0001': // RAISE EXCEPTION de triggers PostgreSQL: mensajes de negocio
      return res.status(409).json({ error: err.message });
    case '23505':
      return res.status(409).json({
        error: 'Ya existe un registro con esos mismos datos.',
        detalle: err.detail,
      });
    case '23503':
      return res.status(409).json({
        error: 'El registro está relacionado con otros datos (o referencia uno que no existe).',
        detalle: err.detail,
      });
    case '23514':
      if (err.constraint === 'senal_stock_check') {
        return res.status(409).json({ error: 'El movimiento dejaría el stock en negativo.' });
      }
      return res.status(400).json({
        error: 'Los datos no cumplen una regla de validación de la base de datos.',
        detalle: err.constraint,
      });
    case '22P02':
    case '22007':
    case '22008':
      return res.status(400).json({
        error: 'Formato de dato inválido.',
        detalle: err.message,
      });
    default:
      console.error('[Error no controlado]:', err);
      return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

export default errorHandler;

