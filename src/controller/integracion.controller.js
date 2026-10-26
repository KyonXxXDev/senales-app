import { AUTH_MODE, ERP_API_URL, ERP_JWT_SECRET, ERP_MAPEO_AREAS, ERP_ROLES_ADMIN, ERP_ROLES_LOGISTICA } from '../config/env.config.js';
import { HttpError } from '../utils/http-error.js';
import { int, num, oneOf, str } from '../utils/validators.js';

const TIPOS = ['MATERIAL', 'VINIL'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default class IntegracionController {
  constructor({ insumoService, identidadService, erpClient }) {
    this.insumos = insumoService;
    this.identidad = identidadService;
    this.erp = erpClient;
  }

  estado = async (req, res) => {
    const salud = await this.erp.salud();
    let cuentaServicio = { configurada: this.erp.tieneCuentaServicio };
    if (this.erp.tieneCuentaServicio && salud.ok) {
      try {
        await this.erp.almacenes({ tokenUsuario: req.erpToken });
        cuentaServicio.ok = true;
      } catch (e) {
        cuentaServicio = { ...cuentaServicio, ok: false, error: e.message };
      }
    }
    res.json({
      modo_sesion: AUTH_MODE,
      erp_api: ERP_API_URL || null,
      secreto_jwt: Boolean(ERP_JWT_SECRET),
      erp_responde: salud,
      cuenta_servicio: cuentaServicio,
      mapeo_areas: ERP_MAPEO_AREAS,
      roles_admin: ERP_ROLES_ADMIN,
      roles_logistica: ERP_ROLES_LOGISTICA,
    });
  };

  sincronizarColaboradores = async (req, res) => {
    res.json(await this.identidad.sincronizarEmpleados({ tokenUsuario: req.erpToken }));
  };

  buscarProductos = async (req, res) => {
    const q = str(req.query.q, 'q', { required: false, max: 100 }) || '';
    res.json(await this.insumos.buscarProductos(q, { tokenUsuario: req.erpToken }));
  };

  listarInsumos = async (req, res) => {
    res.json(await this.insumos.listar({ tokenUsuario: req.erpToken }));
  };

  enlazar = async (req, res) => {
    const tipo = oneOf(req.params.tipo, 'tipo', TIPOS);
    const id = int(req.params.id, 'id');
    const erpId = req.body.erp_product_id ? String(req.body.erp_product_id) : null;
    if (erpId && !UUID.test(erpId)) throw new HttpError(400, 'erp_product_id debe ser el UUID del producto del ERP.');
    const factor = num(req.body.factor_m2, 'factor_m2', { required: false, positive: true }) || 1;
    const fila = await this.insumos.enlazar(tipo, id, {
      erp_product_id: erpId,
      erp_product_codigo: str(req.body.erp_product_codigo, 'erp_product_codigo', { required: false, max: 50 }),
      erp_product_nombre: str(req.body.erp_product_nombre, 'erp_product_nombre', { required: false, max: 200 }),
      erp_unidad: str(req.body.erp_unidad, 'erp_unidad', { required: false, max: 50 }),
      factor_m2: factor,
    }, { tokenUsuario: req.erpToken });
    res.json(fila);
  };

  desenlazar = async (req, res) => {
    const tipo = oneOf(req.params.tipo, 'tipo', TIPOS);
    const id = int(req.params.id, 'id');
    res.json(await this.insumos.enlazar(tipo, id, { erp_product_id: null }));
  };

  consumos = async (req, res) => {
    const estado = req.query.estado ? oneOf(req.query.estado, 'estado', ['PENDIENTE', 'REGISTRADO', 'ANULADO']) : null;
    const tipo = req.query.tipo ? oneOf(req.query.tipo, 'tipo', TIPOS) : null;
    const [lista, resumen] = await Promise.all([
      this.insumos.consumos({ estado, tipo }),
      this.insumos.resumenPendiente(),
    ]);
    res.json({ consumos: lista, resumen_pendiente: resumen });
  };

  #ids(body) {
    const ids = Array.isArray(body.ids) ? body.ids.map((x) => int(x, 'ids')) : [];
    if (ids.length > 2000) throw new HttpError(400, 'Demasiados registros a la vez.');
    return ids;
  }

  registrarConsumos = async (req, res) => {
    const referencia = str(req.body.referencia, 'referencia', { required: false, max: 300 });
    res.json(await this.insumos.registrar(this.#ids(req.body), referencia, req.user.id_colaborador));
  };

  anularConsumos = async (req, res) => {
    const motivo = str(req.body.motivo, 'motivo', { max: 300 });
    res.json(await this.insumos.anular(this.#ids(req.body), motivo, req.user.id_colaborador));
  };
}
