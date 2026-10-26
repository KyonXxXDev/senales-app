/**
 * Permisos por acción. Un "usuario" aquí es lo que deja el middleware en req.user:
 *   { id_colaborador, nombre, area, es_admin, es_logistica, origen }
 * area = OPERACIONES | MARKETING | PRODUCCION | null (solo consulta)
 */
import { HttpError } from './http-error.js';

const REGLAS = {
  // Registrar, editar, entregar y eliminar pedidos
  'pedido.gestionar': (u) => u.area === 'OPERACIONES',
  // Registrar tiempos de cada área
  'trabajo.MARKETING': (u) => u.area === 'MARKETING',
  'trabajo.PRODUCCION': (u) => u.area === 'PRODUCCION',
  // Crear/editar señales del catálogo (imagen, medidas)
  'senal.gestionar': (u) => ['OPERACIONES', 'MARKETING', 'PRODUCCION'].includes(u.area),
  // Entradas y ajustes manuales de stock de señales
  'stock.mover': (u) => ['OPERACIONES', 'PRODUCCION'].includes(u.area),
  // Catálogos, colaboradores, enlace con el ERP
  'catalogo.admin': () => false,
  // Marcar consumos de insumos como descargados en el inventario del ERP
  'insumos.registrar': (u) => u.es_logistica,
};

export const ACCIONES = Object.keys(REGLAS);

export function puede(usuario, accion) {
  if (!usuario) return false;
  if (usuario.es_admin) return true;
  const regla = REGLAS[accion];
  return regla ? Boolean(regla(usuario)) : false;
}

export function permisosDe(usuario) {
  return ACCIONES.filter((a) => puede(usuario, a));
}

export function exigir(usuario, accion, mensaje) {
  if (!usuario) throw new HttpError(401, 'Inicia sesión para continuar.');
  if (!puede(usuario, accion)) {
    throw new HttpError(403, mensaje || 'Tu usuario no tiene permiso para esta acción.');
  }
}

/** Middleware de Express: router.post('/x', permitir('pedido.gestionar'), handler) */
export const permitir = (accion, mensaje) => (req, res, next) => {
  try {
    exigir(req.user, accion, mensaje);
    next();
  } catch (e) {
    next(e);
  }
};

export default { puede, permisosDe, exigir, permitir, ACCIONES };
