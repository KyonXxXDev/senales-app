import {
  api, esc, fmt, badge, prioridad, progreso, miniatura, abrirModal, confirmar, intentar,
  etiquetaEtapa, icono, puede, AREA_TXT, conSpinner, cargando, vacio,
} from '../core.js';
import { actualizarBadge } from './notificaciones.js';

/** Marca visible de cantidad editada (línea) */
export function marcaEditada(l) {
  if (!l.cantidad_editada) return '';
  return `<span class="tooltip" data-tip="Registrada con ${l.cantidad_original} · editada ${l.veces_editada} ${l.veces_editada === 1 ? 'vez' : 'veces'}${l.editado_por ? ' · ' + esc(l.editado_por) : ''}">
    <span class="badge badge-xs badge-warning gap-1">${icono('file-pen', 'size-3')}Editada</span></span>`;
}

/** Modal con el detalle de un pedido. onCambio se llama tras cualquier modificación. */
export async function verPedido(id, onCambio = () => {}) {
  const ref = abrirModal({ titulo: `Pedido #${id}`, tamano: 'xl', cuerpo: cargando() });
  let p;
  try {
    p = await api(`pedidos/${id}`);
  } catch (e) {
    ref.body.innerHTML = `<div role="alert" class="alert alert-error alert-soft">${esc(e.message)}</div>`;
    return;
  }
  const entregado = !!p.fecha_entrega;
  const gestiona = puede('pedido.gestionar') && !entregado;

  const filas = p.lineas.map((l) => `
    <tr>
      <td><div class="flex items-center gap-3">${miniatura(l.imagen_url)}<div class="min-w-0">
        <div class="font-medium flex items-center gap-1.5 flex-wrap">${esc(l.senal)} ${marcaEditada(l)}</div>
        <div class="text-xs text-base-content/60">${esc(l.material)} · ${esc(l.vinil)}</div>
        ${l.observacion_linea ? `<div class="text-xs text-info mt-0.5">${icono('info', 'size-3 inline')} ${esc(l.observacion_linea)}</div>` : ''}
      </div></div></td>
      <td class="whitespace-nowrap text-sm">${fmt.medida(l.ancho_cm, l.alto_cm)}</td>
      <td class="num">
        <span class="font-semibold">${l.cantidad}</span>
        ${l.cantidad_editada ? `<div class="text-[11px] text-base-content/50 line-through" title="Cantidad original">${l.cantidad_original}</div>` : ''}
      </td>
      <td class="num">${l.cantidad_desde_stock}</td>
      <td class="num">${l.cantidad_a_producir}</td>
      <td>${badge(l.estado_marketing)}</td>
      <td>${badge(l.estado_produccion)}</td>
      <td>${badge(l.estado_global)}</td>
      <td class="whitespace-nowrap text-right">
        <button class="btn btn-ghost btn-xs" data-tiempos="${l.id_detalle_pedido}" title="Tiempos registrados">${icono('clock')}</button>
        ${gestiona ? `
          <button class="btn btn-ghost btn-xs" data-editar="${l.id_detalle_pedido}" title="Editar cantidad u observación">${icono('pencil')}</button>
          <button class="btn btn-ghost btn-xs text-error" data-borrar="${l.id_detalle_pedido}" title="Quitar línea">${icono('trash')}</button>` : ''}
      </td>
    </tr>
    <tr class="hidden" id="tiempos-${l.id_detalle_pedido}"><td colspan="9" class="bg-base-200/60"></td></tr>`).join('');

  const historial = (p.ediciones || []).length ? `
    <div class="collapse collapse-arrow bg-base-200/60 border border-base-300 mt-4">
      <input type="checkbox" aria-label="Ver historial de cambios">
      <div class="collapse-title text-sm font-medium flex items-center gap-2">${icono('rotate-ccw-clock')} Historial de cambios de cantidad
        <span class="badge badge-sm badge-warning">${p.ediciones.length}</span></div>
      <div class="collapse-content overflow-x-auto">
        <table class="table table-xs">
          <thead><tr><th>Fecha</th><th>Señal</th><th class="num">Antes</th><th class="num">Después</th><th class="num">Stock tomado</th><th>Quién</th><th>Motivo</th></tr></thead>
          <tbody>${p.ediciones.map((e) => `<tr>
            <td class="whitespace-nowrap">${fmt.fechaHora(e.fecha)}</td><td>${esc(e.senal || '#' + e.id_detalle_pedido)}</td>
            <td class="num">${e.cantidad_anterior}</td><td class="num font-semibold">${e.cantidad_nueva}</td>
            <td class="num">${e.desde_stock_anterior} → ${e.desde_stock_nuevo}</td>
            <td>${esc(e.colaborador || '—')}</td><td>${esc(e.motivo || '')}</td></tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : '';

  const listo = p.estado_pedido === 'LISTO PARA ENTREGA';
  ref.body.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      ${dato('Cliente', `<span class="font-semibold">${esc(p.cliente)}</span>`)}
      ${dato('Prioridad', gestiona
        ? `<select id="pPrioridad" class="select select-sm w-full">${['BAJA', 'MEDIA', 'ALTA'].map((x) => `<option ${x === p.prioridad ? 'selected' : ''} value="${x}">${{ BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta' }[x]}</option>`).join('')}</select>`
        : prioridad(p.prioridad))}
      ${dato('Estado', `${badge(p.estado_pedido)} ${p.cantidad_editada ? `<span class="badge badge-sm badge-warning ml-1">${p.lineas_editadas} con cantidad editada</span>` : ''}`)}
      ${dato('Avance', `<div class="flex items-center gap-2"><span class="font-semibold">${fmt.pct(p.avance_pct)}</span>${progreso(p.avance_pct, 'progress-sm')}</div>`)}
      ${dato('Registrado', fmt.fechaHora(p.fecha_pedido))}
      ${dato('Fecha requerida', fmt.fecha(p.fecha_requerida))}
      ${dato('Unidades', `<span class="font-semibold">${p.unidades}</span> <span class="text-xs text-base-content/60">(${p.unidades_desde_stock} de stock${p.cantidad_editada ? ` · originalmente ${p.unidades_originales}` : ''})</span>`)}
      ${dato('Solicitado por', esc(p.solicitado_por || '—'))}
      ${entregado ? dato('Entregado', `${fmt.fechaHora(p.fecha_entrega)}<div class="text-xs">${esc(p.entregado_por || '')}</div>`) : ''}
    </div>
    ${p.observacion ? `<div role="note" class="alert alert-info alert-soft text-sm mb-4">${icono('info', 'size-4')}<span>${esc(p.observacion)}</span></div>` : ''}
    <div class="overflow-x-auto rounded-box border border-base-300">
      <table class="table table-sm">
        <thead><tr><th>Señal</th><th>Medida</th><th class="num">Cant.</th><th class="num">De stock</th><th class="num">A producir</th>
          <th>Marketing</th><th>Producción</th><th>Global</th><th></th></tr></thead>
        <tbody>${filas || `<tr><td colspan="9">${vacio('Sin líneas')}</td></tr>`}</tbody>
      </table>
    </div>
    <p class="text-xs text-base-content/60 mt-2">Una línea queda <strong>Finalizada</strong> cuando Marketing y Producción terminaron, o cuando salió completa de stock.</p>
    ${historial}`;

  if (ref.foot === null) {
    const pie = document.createElement('div');
    pie.className = 'modal-action m-0 px-5 py-3 border-t border-base-300 flex-wrap';
    pie.dataset.foot = '';
    ref.dlg.querySelector('.modal-box').append(pie);
    ref.foot = pie;
  }
  ref.foot.innerHTML = gestiona ? `
    <button class="btn btn-ghost text-error mr-auto" data-borrar-pedido>${icono('trash')}Eliminar pedido</button>
    <button class="btn btn-ghost" data-close>Cerrar</button>
    <span class="${listo ? '' : 'tooltip'}" data-tip="Todas las líneas deben estar finalizadas">
      <button class="btn btn-primary" data-entregar ${listo ? '' : 'disabled'}>${icono('truck')}Marcar como entregado</button></span>`
    : '<button class="btn" data-close>Cerrar</button>';

  const recargar = () => { ref.cerrar(); onCambio(); verPedido(id, onCambio); };

  ref.body.querySelector('#pPrioridad')?.addEventListener('change', async (e) => {
    await intentar(() => api(`pedidos/${id}`, { method: 'PATCH', body: { prioridad: e.target.value } }), 'Prioridad actualizada.');
    onCambio();
  });

  ref.body.querySelectorAll('[data-tiempos]').forEach((b) => b.addEventListener('click', async () => {
    const fila = ref.body.querySelector(`#tiempos-${b.dataset.tiempos}`);
    if (!fila.classList.contains('hidden')) { fila.classList.add('hidden'); return; }
    fila.classList.remove('hidden');
    fila.firstElementChild.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    const regs = await intentar(() => api(`detalles/${b.dataset.tiempos}/tiempos`));
    fila.firstElementChild.innerHTML = regs.length ? `<table class="table table-xs">
      <thead><tr><th>Área</th><th>Etapa</th><th>Colaborador</th><th>Inicio</th><th>Fin</th><th class="num">Duración</th><th class="num">Unid.</th></tr></thead>
      <tbody>${regs.map((r) => `<tr><td>${AREA_TXT[r.area] || r.area}</td><td>${esc(etiquetaEtapa(r.etapa))}</td>
        <td>${esc(r.colaborador || '—')}</td><td>${fmt.fechaHora(r.inicio)}</td><td>${r.fin ? fmt.fechaHora(r.fin) : '<span class="badge badge-xs badge-info">en curso</span>'}</td>
        <td class="num">${fmt.min(r.duracion_min)}</td><td class="num">${r.cantidad_procesada}</td></tr>`).join('')}</tbody></table>`
      : '<p class="text-xs text-base-content/60 py-2">Aún no hay tiempos registrados.</p>';
  }));

  ref.body.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
    const l = p.lineas.find((x) => String(x.id_detalle_pedido) === b.dataset.editar);
    editarLinea(l, recargar);
  }));

  ref.body.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmar('¿Quitar esta línea del pedido? Si tomó stock, se devuelve al inventario.', { ok: 'Quitar', peligro: true }))) return;
    try { await intentar(() => api(`detalles/${b.dataset.borrar}`, { method: 'DELETE' }), 'Línea eliminada.'); } catch { return; }
    recargar();
  }));

  ref.foot.querySelector('[data-entregar]')?.addEventListener('click', async (e) => {
    try {
      await conSpinner(e.currentTarget, () => intentar(() => api(`pedidos/${id}/entregar`, { method: 'POST', body: {} }), 'Pedido marcado como entregado.'));
    } catch { return; }
    recargar();
  });

  ref.foot.querySelector('[data-borrar-pedido]')?.addEventListener('click', async () => {
    if (!(await confirmar(`¿Eliminar el pedido #${id}? El stock que tomó vuelve al inventario.`, { ok: 'Eliminar', peligro: true }))) return;
    try { await intentar(() => api(`pedidos/${id}`, { method: 'DELETE' }), 'Pedido eliminado.'); } catch { return; }
    ref.cerrar();
    onCambio();
  });
}

function dato(titulo, html) {
  return `<div class="rounded-box bg-base-200/60 border border-base-300 px-3 py-2 min-w-0">
    <div class="text-[11px] uppercase tracking-wide text-base-content/60">${titulo}</div><div class="text-sm mt-0.5">${html}</div></div>`;
}

/** Edición de cantidad con vista previa del efecto en stock y producción */
function editarLinea(l, alGuardar) {
  const { body, foot, cerrar } = abrirModal({
    titulo: `Editar línea · ${l.senal}`,
    tamano: 'sm',
    cuerpo: `
      <form id="fLinea" class="flex flex-col gap-3">
        <div class="stats stats-horizontal bg-base-200/60 border border-base-300 w-full text-center">
          <div class="stat py-2 px-3"><div class="stat-title text-xs">Registrada</div><div class="stat-value text-lg">${l.cantidad_original}</div></div>
          <div class="stat py-2 px-3"><div class="stat-title text-xs">Actual</div><div class="stat-value text-lg">${l.cantidad}</div></div>
          <div class="stat py-2 px-3"><div class="stat-title text-xs">Stock libre</div><div class="stat-value text-lg">${l.stock_actual}</div></div>
        </div>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Nueva cantidad</legend>
          <input type="number" name="cantidad" class="input w-full" min="1" step="1" value="${l.cantidad}" required>
          <p class="label text-wrap" id="efecto"></p>
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Motivo del cambio <span class="text-base-content/50 font-normal">(queda en el historial)</span></legend>
          <input name="motivo" class="input w-full" maxlength="500" placeholder="Ej. el cliente amplió el pedido">
        </fieldset>
        <fieldset class="fieldset">
          <legend class="fieldset-legend">Observación de la línea</legend>
          <textarea name="observacion" class="textarea w-full" rows="2" maxlength="2000" placeholder="Opcional">${esc(l.observacion_linea || '')}</textarea>
        </fieldset>
        <div role="note" class="alert alert-warning alert-soft text-xs">${icono('bell', 'size-4')}<span>Si cambias la cantidad se avisa a Marketing y Producción, y la línea queda marcada como <strong>editada</strong>.</span></div>
      </form>`,
    pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icono('check')}Guardar</button>`,
  });

  const input = body.querySelector('[name=cantidad]');
  const efecto = body.querySelector('#efecto');
  const calcular = () => {
    const n = parseInt(input.value, 10);
    if (!(n > 0) || n === l.cantidad) { efecto.textContent = 'Sin cambio de cantidad.'; return; }
    if (n > l.cantidad) {
      const tomar = Math.min(l.stock_actual, n - l.cantidad);
      const prod = l.cantidad_a_producir + (n - l.cantidad - tomar);
      efecto.textContent = `Se tomarán ${tomar} del stock y quedarán ${prod} por producir.`;
    } else {
      const bajaProd = Math.min(l.cantidad - n, l.cantidad_a_producir);
      const devolver = (l.cantidad - n) - bajaProd;
      efecto.textContent = `Bajan ${bajaProd} por producir${devolver > 0 ? ` y vuelven ${devolver} al stock` : ''}. No puede quedar por debajo de lo ya terminado.`;
    }
  };
  input.addEventListener('input', calcular);
  calcular();

  foot.querySelector('[data-ok]').onclick = async (e) => {
    const form = body.querySelector('form');
    if (!form.reportValidity()) return;
    const cantidad = Number(form.cantidad.value);
    const datos = { observacion: form.observacion.value.trim() || null, motivo: form.motivo.value.trim() || null };
    if (cantidad !== l.cantidad) datos.cantidad = cantidad;
    try {
      await conSpinner(e.currentTarget, () => intentar(() => api(`detalles/${l.id_detalle_pedido}`, { method: 'PATCH', body: datos }),
        cantidad !== l.cantidad ? 'Cantidad actualizada. Se avisó a Marketing y Producción.' : 'Línea actualizada.'));
    } catch { return; }
    cerrar();
    actualizarBadge();
    alGuardar();
  };
}

