import { pool } from '../config/database.js';

export default class CatalogoRepository {
  constructor(db = pool) {
    this.db = db;
  }

  async getCatalogosCompletos() {
    const [materiales, viniles, clientes, colaboradores, etapas] = await Promise.all([
      this.db.query('SELECT * FROM material ORDER BY nombre'),
      this.db.query('SELECT * FROM vinil ORDER BY nombre'),
      this.db.query('SELECT * FROM cliente ORDER BY nombre'),
      this.db.query('SELECT * FROM colaborador ORDER BY area, nombre'),
      this.db.query('SELECT * FROM etapa ORDER BY area, orden'),
    ]);

    return {
      materiales: materiales.rows,
      viniles: viniles.rows,
      clientes: clientes.rows,
      colaboradores: colaboradores.rows,
      etapas: etapas.rows,
      prioridades: ['BAJA', 'MEDIA', 'ALTA'],
      areas: ['OPERACIONES', 'MARKETING', 'PRODUCCION'],
    };
  }
}

