/**
 * NotificacionService
 *
 * Gestiona notificaciones in-app almacenadas en la tabla `notificacion`.
 * Se puede extender para enviar correos o mensajes de Teams en el futuro.
 */
export default class NotificacionService {
  constructor(db) {
    /** @type {import('pg').Pool} */
    this.db = db;
  }

  /**
   * Crea una notificación en base de datos para uno o varios colaboradores.
   *
   * @param {object} opts
   * @param {number|number[]} opts.idColaboradores  - Destinatario(s)
   * @param {'INFO'|'ALERTA'|'URGENTE'} opts.tipo
   * @param {string} opts.titulo
   * @param {string} opts.mensaje
   * @param {string|null} [opts.url]               - Enlace de contexto (ej: /pedidos/5)
   * @param {object} [client]                      - Cliente de transacción opcional
   */
  async crear({ idColaboradores, tipo = 'INFO', titulo, mensaje, url = null }, client) {
    const ids = Array.isArray(idColaboradores) ? idColaboradores : [idColaboradores];
    const db = client || this.db;

    // Inserción en lote para todos los destinatarios
    for (const idColab of ids) {
      if (!idColab) continue;
      try {
        await db.query(
          `INSERT INTO notificacion (id_colaborador, tipo, titulo, mensaje, url)
           VALUES ($1, $2, $3, $4, $5)`,
          [idColab, tipo, titulo, mensaje, url]
        );
      } catch (err) {
        // No interrumpir el flujo principal si falla la notificación
        console.warn(`[NotificacionService] No se pudo crear notificación para colaborador ${idColab}:`, err.message);
      }
    }
  }

  /**
   * Obtiene las notificaciones pendientes (no leídas) de un colaborador.
   */
  async obtenerPendientes(idColaborador) {
    const { rows } = await this.db.query(
      `SELECT * FROM notificacion
        WHERE id_colaborador = $1 AND leida = FALSE
        ORDER BY fecha_creacion DESC`,
      [idColaborador]
    );
    return rows;
  }

  /**
   * Obtiene todas las notificaciones de un colaborador (leídas y no leídas).
   */
  async obtenerTodas(idColaborador) {
    const { rows } = await this.db.query(
      `SELECT * FROM notificacion
        WHERE id_colaborador = $1
        ORDER BY fecha_creacion DESC
        LIMIT 100`,
      [idColaborador]
    );
    return rows;
  }

  /**
   * Marca una notificación como leída.
   */
  async marcarLeida(idNotificacion, idColaborador) {
    const { rowCount } = await this.db.query(
      `UPDATE notificacion SET leida = TRUE, fecha_lectura = now()
        WHERE id_notificacion = $1 AND id_colaborador = $2`,
      [idNotificacion, idColaborador]
    );
    return rowCount > 0;
  }

  /**
   * Marca todas las notificaciones de un colaborador como leídas.
   */
  async marcarTodasLeidas(idColaborador) {
    const { rowCount } = await this.db.query(
      `UPDATE notificacion SET leida = TRUE, fecha_lectura = now()
        WHERE id_colaborador = $1 AND leida = FALSE`,
      [idColaborador]
    );
    return rowCount;
  }
}
