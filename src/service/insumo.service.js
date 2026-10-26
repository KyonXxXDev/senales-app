import { HttpError } from '../utils/http-error.js';

export default class InsumoService {
  /**
   * @param {import('../repository/insumo.repository.js').default} insumoRepository
   * @param {import('../integrations/erp.client.js').ErpClient} erpClient
   */
  constructor(insumoRepository, erpClient) {
    this.repo = insumoRepository;
    this.erp = erpClient;
  }

  /**
   * Insumos + stock actual en el inventario del ERP (por almacén).
   * Si el ERP no responde, se devuelve igual la lista con el error por insumo.
   */
  async listar({ tokenUsuario } = {}) {
    const insumos = await this.repo.listar();
    const enlazados = insumos.filter((i) => i.erp_product_id);
    let almacenes = [];
    let errorErp = null;

    if (enlazados.length && this.erp.configurado) {
      try {
        almacenes = await this.erp.almacenes({ tokenUsuario });
      } catch (e) {
        errorErp = e.message;
      }
      const nombreAlmacen = new Map(almacenes.map((a) => [String(a.id), a.name]));
      await Promise.all(enlazados.map(async (i) => {
        try {
          const filas = await this.erp.stockProducto(i.erp_product_id, { tokenUsuario });
          const porAlmacen = filas.map((f) => ({
            almacen: nombreAlmacen.get(String(f.warehouse_id)) || `Almacén ${f.warehouse_id}`,
            stock: Number(f.current_stock || 0),
            minimo: Number(f.min_stock || 0),
            alerta: Boolean(f.is_alert) || Number(f.current_stock || 0) <= Number(f.min_stock || 0),
            ubicacion: f.layout_location || null,
          }));
          i.stock_erp = {
            total: porAlmacen.reduce((a, f) => a + f.stock, 0),
            minimo: porAlmacen.reduce((a, f) => a + f.minimo, 0),
            alerta: porAlmacen.some((f) => f.alerta),
            por_almacen: porAlmacen,
          };
        } catch (e) {
          i.stock_erp = { error: e.message };
          errorErp = errorErp || e.message;
        }
      }));
    } else if (enlazados.length) {
      errorErp = 'La integración con el ERP no está configurada (ERP_API_URL).';
    }

    for (const i of insumos) {
      if (i.stock_erp && !i.stock_erp.error) {
        const disponible = i.stock_erp.total - Number(i.cantidad_pendiente || 0);
        i.stock_erp.despues_de_descargar = Math.round(disponible * 10000) / 10000;
      }
    }
    return { insumos, error_erp: errorErp };
  }

  async buscarProductos(q, { tokenUsuario } = {}) {
    const lista = await this.erp.productos({ q, limite: 30, tokenUsuario });
    return lista.map((p) => ({
      id: p.id, codigo: p.code, nombre: p.name, unidad: p.unit_measure || null,
      costo: p.unit_cost ?? null, activo: p.is_active !== false,
    }));
  }

  async enlazar(tipo, id, datos, { tokenUsuario } = {}) {
    if (!datos.erp_product_id) {
      const r = await this.repo.enlazar(tipo, id, {
        erp_product_id: null, erp_product_codigo: null, erp_product_nombre: null, erp_unidad: null,
        factor_m2: datos.factor_m2 || 1,
      });
      if (!r) throw new HttpError(404, 'Insumo no encontrado.');
      return r;
    }

    // Completar código/nombre/unidad con lo que diga el ERP
    let prod = null;
    try {
      prod = await this.erp.producto(datos.erp_product_id, { tokenUsuario });
    } catch (e) {
      if (!datos.erp_product_nombre) throw e;
    }
    const r = await this.repo.enlazar(tipo, id, {
      erp_product_id: datos.erp_product_id,
      erp_product_codigo: prod?.code || datos.erp_product_codigo || null,
      erp_product_nombre: prod?.name || datos.erp_product_nombre || null,
      erp_unidad: datos.erp_unidad || prod?.unit_measure || null,
      factor_m2: datos.factor_m2 || 1,
    });
    if (!r) throw new HttpError(404, 'Insumo no encontrado.');
    return r;
  }

  async consumos(filtros) {
    return this.repo.consumos(filtros);
  }

  async resumenPendiente() {
    return this.repo.resumenPendiente();
  }

  async registrar(ids, referencia, idColaborador) {
    if (!ids.length) throw new HttpError(400, 'Selecciona al menos un consumo.');
    const n = await this.repo.marcar(ids, 'REGISTRADO', referencia, idColaborador);
    return { actualizados: n };
  }

  async anular(ids, motivo, idColaborador) {
    if (!ids.length) throw new HttpError(400, 'Selecciona al menos un consumo.');
    if (!motivo) throw new HttpError(400, 'Indica el motivo de la anulación.');
    const n = await this.repo.marcar(ids, 'ANULADO', motivo, idColaborador);
    return { actualizados: n };
  }
}
