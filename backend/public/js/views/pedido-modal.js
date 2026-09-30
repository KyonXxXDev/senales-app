import {
  api, store, esc, fmt, badge, prioridad, progreso, miniatura, abrirModal, cerrarModal,
  confirmar, intentar, toast, options, etiquetaEtapa,
} from '../core.js';
import { actualizarBadge } from './notificaciones.js';

/** Modal con el detalle de un pedido. onCambio se llama tras cualquier modificación. */
export async function verPedido(id, onCambio = () => {}) {
  const p = await intentar(() => api(`/pedidos/${id}`));
  const entregado = !!p.fecha_entrega;

  const filas = p.lineas.map((l) => `
    <tr>
      <td><div class="senal-cell">${miniatura(l.imagen_referencial)}<div><strong>${esc(l.senal)}</strong>
        <span class="muted small">${esc(l.material)} · ${esc(l.vinil)}</span></div></div></td>
      <td class="nowrap">${fmt.medida(l.ancho_cm, l.alto_cm)}</td>
      <td class="num">${l.cantidad}</td>
      <td class="num">${l.cantidad_desde_stock}</td>
      <td class="num">${l.cantidad_a_producir}</td>
      <td>${badge(l.estado_marketing)}</td>
      <td>${badge(l.estado_produccion)}</td>
      <td>${badge(l.estado_global)}</td>
      <td class="nowrap">
        <button class="btn ghost sm" data-tiempos="${l.id_detalle_pedido}">Tiempos</button>
        ${entregado ? '' : `
          <button class="btn ghost sm" data-editar-linea="${l.id_detalle_pedido}"
            data-cant="${l.cantidad}" data-obs="${esc(l.observacion_linea || '')}"
            title="Editar cantidad u observación">✏️ Editar</button>
          <button class="btn ghost sm" data-borrar-linea="${l.id_detalle_pedido}" aria-label="Eliminar línea">Quitar</button>
        `}
      </td>
    </tr>
    <tr class="hidden" id="tiempos-${l.id_detalle_pedido}"><td colspan="9"></td></tr>`).join('');

  const cuerpo = `
    <div class="kv">
      <div><span>Cliente</span><strong>${esc(p.cliente)}</strong></div>
      <div><span>Prioridad</span>${entregado ? prioridad(p.prioridad)
        : `<select id="pPrioridad">${options(store.cat.prioridades.map((x) => ({ x })), 'x', 'x', p.prioridad)}</select>`}</div>
      <div><span>Registrado</span><strong>${fmt.fechaHora(p.fecha_pedido)}</strong></div>
      <div><span>Fecha requerida</span><strong>${fmt.fecha(p.fecha_requerida)}</strong></div>
      <div><span>Estado</span>${badge(p.estado_pedido)}</div>
      <div><span>Avance</span><strong>${fmt.pct(p.avance_pct)}</strong>${progreso(p.avance_pct)}</div>
      <div><span>Unidades</span><strong>${p.unidades}</strong> <span class="muted small">(${p.unidades_desde_stock} de stock)</span></div>
      <div><span>Solicitado por</span><strong>${esc(p.solicitado_por || '—')}</strong></div>
      ${entregado ? `<div><span>Entregado</span><strong>${fmt.fechaHora(p.fecha_entrega)}</strong><br><span class="small">${esc(p.entregado_por)}</span></div>` : ''}
    </div>
    ${p.observacion ? `<p class="hint">${esc(p.observacion)}</p>` : ''}
    <div class="table-wrap card"><table>
      <thead><tr><th>Señal</th><th>Medida</th><th class="num">Cant.</th><th class="num">De stock</th>
        <th class="num">A producir</th><th>Marketing</th><th>Producción</th><th>Global</th><th></th></tr></thead>
      <tbody>${filas || '<tr><td colspan="9" class="empty">Sin líneas</td></tr>'}</tbody>
    </table></div>
    <p class="muted small">Una línea está <strong>Finalizada</strong> solo cuando Marketing y Producción terminaron (o no la necesitaron porque salió de stock).</p>`;

  const listo = p.estado_pedido === 'LISTO PARA ENTREGA';
  const pie = entregado ? '<button class="btn secondary" data-close>Cerrar</button>' : `
    <button class="btn danger" data-borrar-pedido>Eliminar pedido</button>
    <span class="spacer"></span>
    <button class="btn secondary" data-close>Cerrar</button>
    <button class="btn" data-entregar ${listo ? '' : 'disabled title="Todas las líneas deben estar finalizadas"'}>Marcar como entregado</button>`;

  const { body, foot } = abrirModal({ titulo: `Pedido #${p.id_pedido}`, cuerpo, pie });

  body.querySelector('#pPrioridad')?.addEventListener('change', async (e) => {
    await intentar(() => api(`/pedidos/${id}`, { method: 'PATCH', body: { prioridad: e.target.value } }), 'Prioridad actualizada.');
    onCambio();
  });

  body.querySelectorAll('[data-tiempos]').forEach((b) => b.addEventListener('click', async () => {
    const fila = body.querySelector(`#tiempos-${b.dataset.tiempos}`);
    if (!fila.classList.contains('hidden')) { fila.classList.add('hidden'); return; }
    const regs = await intentar(() => api(`/detalles/${b.dataset.tiempos}/tiempos`));
    fila.firstElementChild.innerHTML = regs.length ? `<table>
      <thead><tr><th>Área</th><th>Etapa</th><th>Colaborador</th><th>Inicio</th><th>Fin</th><th class="num">Duración</th><th class="num">Unid.</th></tr></thead>
      <tbody>${regs.map((r) => `<tr><td>${r.area === 'MARKETING' ? 'Marketing' : 'Producción'}</td><td>${esc(etiquetaEtapa(r.etapa))}</td>
        <td>${esc(r.colaborador || '—')}</td><td>${fmt.fechaHora(r.inicio)}</td><td>${r.fin ? fmt.fechaHora(r.fin) : '<em>en curso</em>'}</td>
        <td class="num">${fmt.min(r.duracion_min)}</td><td class="num">${r.cantidad_procesada}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted small">Aún no hay tiempos registrados.</p>';
    fila.classList.remove('hidden');
  }));

  // ── Editar línea ──────────────────────────────────────────────────────────
  body.querySelectorAll('[data-editar-linea]').forEach((b) => b.addEventListener('click', () => {
    const idDetalle = b.dataset.editarLinea;
    const cantActual = b.dataset.cant;
    const obsActual  = b.dataset.obs;

    const { body: mBody, foot: mFoot } = abrirModal({
      titulo: 'Editar línea del pedido',
      cuerpo: `
        <p class="hint" style="margin-top:0">
          ⚠️ Editar la cantidad notificará automáticamente a los colaboradores de Marketing y Producción.
        </p>
        <form id="fEditarLinea" class="fields">
          <label class="field full">
            Nueva cantidad *
            <input type="number" name="cantidad" min="1" step="1" value="${esc(cantActual)}" required>
            <span class="muted small">Cantidad actual: <strong>${esc(cantActual)}</strong></span>
          </label>
          <label class="field full">
            Observación de la línea
            <textarea name="observacion" maxlength="500" rows="3" placeholder="Opcional…">${esc(obsActual)}</textarea>
          </label>
        </form>`,
      pie: `
        <button class="btn secondary" data-close>Cancelar</button>
        <button class="btn primary" id="btnGuardarLinea">Guardar y notificar</button>`,
      estrecho: true,
    });

    mFoot.querySelector('#btnGuardarLinea').onclick = async () => {
      const form = mBody.querySelector('#fEditarLinea');
      if (!form.reportValidity()) return;
      const cantidad    = Number(form.cantidad.value);
      const observacion = form.observacion.value.trim() || null;

      try {
        await intentar(
          () => api(`/detalles/${idDetalle}`, { method: 'PATCH', body: { cantidad, observacion } }),
          'Línea actualizada y notificación enviada.'
        );
        cerrarModal();
        actualizarBadge();
        onCambio();
        verPedido(id, onCambio);
      } catch { /* toast ya disparado */ }
    };
  }));

  body.querySelectorAll('[data-borrar-linea]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('¿Quitar esta línea del pedido? Si tomó stock, se devuelve.', { ok: 'Quitar', peligro: true }))) {
      return verPedido(id, onCambio);
    }
    try { await intentar(() => api(`/detalles/${b.dataset.borrarLinea}`, { method: 'DELETE' }), 'Línea eliminada.'); } catch { /* toast */ }
    onCambio();
    verPedido(id, onCambio);
  }));

  foot.querySelector('[data-entregar]')?.addEventListener('click', async () => {
    if (!store.usuario) return toast('Selecciona tu nombre arriba ("Trabajando como") para registrar la entrega.', 'error');
    await intentar(() => api(`/pedidos/${id}/entregar`, { method: 'POST', body: { id_colaborador: Number(store.usuario) } }),
      'Pedido marcado como entregado.');
    onCambio();
    verPedido(id, onCambio);
  });

  foot.querySelector('[data-borrar-pedido]')?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar el pedido #${id}? El stock que tomó vuelve al inventario.`, { ok: 'Eliminar', peligro: true }))) {
      return verPedido(id, onCambio);
    }
    await intentar(() => api(`/pedidos/${id}`, { method: 'DELETE' }), 'Pedido eliminado.');
    cerrarModal();
    onCambio();
  });
}
