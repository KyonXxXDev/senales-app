import {
  api, store, esc, fmt, badge, prioridad, progreso, miniatura, intentar, etapasDe, etiquetaEtapa, icono,
  puede, abrirModal, confirmar, options, leerForm, vacio, cargando, conSpinner, AREA_TXT,
} from '../core.js';
import { verPedido, marcaEditada } from './pedido-modal.js';

const TEXTOS = {
  MARKETING: {
    titulo: 'Marketing · Diseño e impresión', ico: 'printer', unidad: 'impresas',
    desc: 'Líneas que no se cubrieron con stock. Inicia cada etapa y, al terminar, indica cuántas unidades salieron.',
  },
  PRODUCCION: {
    titulo: 'Producción · Fabricación', ico: 'factory', unidad: 'terminadas',
    desc: 'Corte de sustrato, armado y control. "Vinil" indica si Marketing ya terminó la impresión.',
  },
};

export default async function trabajo(el, area) {
  const t = TEXTOS[area];
  const etapas = etapasDe(area);
  const trabaja = puede(`trabajo.${area}`);
  const filtros = { prioridad: '', terminados: false };

  el.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-bold flex items-center gap-2">${icono(t.ico, 'size-5')}${t.titulo}</h1>
        <p class="text-sm text-base-content/70">${t.desc}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <select id="fPrioridad" class="select select-sm w-auto" aria-label="Prioridad">
          <option value="">Todas las prioridades</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
        </select>
        <label class="label text-sm cursor-pointer gap-2"><input type="checkbox" id="fTerminados" class="toggle toggle-sm"> Mostrar terminadas</label>
        <button class="btn btn-sm" id="btnRefrescar">${icono('refresh-cw')}Actualizar</button>
      </div>
    </div>
    ${trabaja ? '' : `<div role="note" class="alert alert-info alert-soft mb-4 text-sm">${icono('eye', 'size-4')}<span>Vista de consulta: solo ${AREA_TXT[area]} registra tiempos aquí.</span></div>`}
    <div id="resumen" class="stats stats-horizontal overflow-x-auto w-full bg-base-100 border border-base-300 shadow-sm mb-4"></div>
    <div id="lista">${cargando()}</div>`;

  const $ = (s) => el.querySelector(s);

  async function cargar() {
    const qs = new URLSearchParams();
    if (filtros.prioridad) qs.set('prioridad', filtros.prioridad);
    if (filtros.terminados) qs.set('terminados', '1');
    const lineas = await api(`bandeja/${area}?${qs}`);
    pintarResumen(lineas);
    pintar(lineas);
  }

  function pintarResumen(lineas) {
    const abiertas = lineas.filter((l) => l.estado_area !== 'TERMINADO');
    const stat = (titulo, valor, desc, ico, cls = '') => `<div class="stat py-3">
      <div class="stat-figure ${cls}">${icono(ico, 'size-7')}</div>
      <div class="stat-title">${titulo}</div><div class="stat-value text-2xl ${cls}">${valor}</div><div class="stat-desc">${desc}</div></div>`;
    $('#resumen').innerHTML =
      stat('Pendientes', lineas.filter((l) => l.estado_area === 'PENDIENTE').length, 'líneas sin empezar', 'clock', 'text-warning')
      + stat('En proceso', lineas.filter((l) => l.estado_area === 'EN PROCESO').length, 'con trabajo iniciado', 'timer', 'text-info')
      + stat('Urgentes', abiertas.filter((l) => l.prioridad === 'ALTA').length, 'prioridad alta', 'triangle-alert', 'text-error')
      + stat('Unidades por hacer', abiertas.reduce((a, l) => a + Math.max(0, l.cantidad_a_producir - l.unidades_terminadas), 0), `aún no ${t.unidad}`, 'package')
      + stat('Editadas', abiertas.filter((l) => l.cantidad_editada).length, 'cambiaron de cantidad', 'file-pen', 'text-warning');
  }

  function pintar(lineas) {
    if (!lineas.length) {
      $('#lista').innerHTML = `<div class="card bg-base-100 border border-base-300">${vacio('No hay trabajo pendiente en esta área.', 'circle-check')}</div>`;
      return;
    }
    const porPedido = new Map();
    for (const l of lineas) {
      if (!porPedido.has(l.id_pedido)) porPedido.set(l.id_pedido, []);
      porPedido.get(l.id_pedido).push(l);
    }
    $('#lista').innerHTML = [...porPedido.values()].map((ls) => {
      const p = ls[0];
      const vencido = p.fecha_requerida && new Date(p.fecha_requerida + 'T23:59:59') < new Date();
      return `<section class="card bg-base-100 border border-base-300 shadow-sm mb-4">
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-base-300">
          <div class="flex items-center gap-2">
            <button class="btn btn-ghost btn-sm font-bold" data-pedido="${p.id_pedido}">Pedido #${p.id_pedido}</button>
            <span class="font-medium">${esc(p.cliente)}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            ${prioridad(p.prioridad)}
            <span class="text-base-content/60">${icono('calendar', 'size-3 inline')} ${fmt.fechaHora(p.fecha_pedido)}</span>
            ${p.fecha_requerida ? `<span class="badge badge-sm ${vencido ? 'badge-error' : 'badge-ghost'}">Requerido ${fmt.fecha(p.fecha_requerida)}${vencido ? ' · vencido' : ''}</span>` : ''}
          </div>
        </div>
        ${p.observacion ? `<div class="px-4 py-2 text-sm bg-info/10 text-info-content/90 border-b border-base-300">${icono('info', 'size-4 inline')} ${esc(p.observacion)}</div>` : ''}
        <div class="divide-y divide-base-300">${ls.map(linea).join('')}</div>
      </section>`;
    }).join('');
    enlazar(lineas);
  }

  function linea(l) {
    const pct = l.cantidad_a_producir ? (100 * l.unidades_terminadas) / l.cantidad_a_producir : 0;
    const regs = l.registros || [];
    const terminado = l.estado_area === 'TERMINADO';
    const filasEtapa = etapas.map((e) => {
      const deEtapa = regs.filter((r) => r.id_etapa === e.id_etapa);
      const abierta = deEtapa.find((r) => !r.fin);
      const hechas = deEtapa.filter((r) => r.fin).reduce((a, r) => a + r.cantidad_procesada, 0);
      const minutos = deEtapa.reduce((a, r) => a + (r.duracion_min || 0), 0);
      const faltan = Math.max(0, l.cantidad_a_producir - (e.es_final ? l.unidades_terminadas : 0));
      const resumen = deEtapa.length
        ? `<span class="text-xs text-success flex items-center gap-1">${icono('check', 'size-3.5')}${fmt.min(minutos)}${hechas ? ` · ${hechas} u.` : ''}</span>`
        : '<span class="text-xs text-base-content/50">Sin iniciar</span>';
      return `<div class="flex flex-wrap items-center gap-2 rounded-box border px-3 py-2 ${abierta ? 'border-primary bg-primary/5' : 'border-base-300 bg-base-200/40'}">
        <span class="font-medium text-sm min-w-32">${esc(etiquetaEtapa(e.nombre))}${e.es_final ? ' <span class="text-[11px] font-normal text-base-content/50">· cuenta unidades</span>' : ''}</span>
        ${abierta ? `
          <span class="timer text-sm" data-desde="${esc(abierta.inicio)}">${fmt.cronometro(abierta.inicio)}</span>
          <span class="text-xs text-base-content/60">${esc(abierta.colaborador || '')}</span>
          ${trabaja ? `<span class="ml-auto flex items-center gap-2">
            <label class="input input-sm w-28">${icono('hash', 'size-3.5 opacity-50')}<input type="number" min="0" ${e.es_final ? `max="${faltan}"` : ''} step="1"
              value="${e.es_final ? faltan : l.cantidad_a_producir}" data-cant="${abierta.id_registro_tiempo}" aria-label="Unidades procesadas"></label>
            <button class="btn btn-sm btn-primary" data-fin="${abierta.id_registro_tiempo}">${icono('square', 'size-3.5')}Finalizar</button></span>` : ''}`
        : `${resumen}
          ${trabaja && !(terminado && e.es_final) ? `<button class="btn btn-sm btn-outline ml-auto" data-ini="${e.id_etapa}" data-det="${l.id_detalle_pedido}">${icono('play', 'size-3.5')}${deEtapa.length ? 'Nueva sesión' : 'Iniciar'}</button>` : ''}`}
      </div>`;
    }).join('');

    return `<div class="grid gap-4 p-4 lg:grid-cols-[minmax(220px,1.2fr)_minmax(160px,.7fr)_minmax(320px,2fr)]">
      <div class="flex items-start gap-3 min-w-0">${miniatura(l.imagen_url, 'thumb-lg')}
        <div class="min-w-0">
          <div class="font-semibold">${esc(l.senal)}</div>
          <div class="text-xs">${fmt.medida(l.ancho_cm, l.alto_cm)}</div>
          <div class="text-xs text-base-content/60">${esc(l.material)} · ${esc(l.vinil)}</div>
          ${l.imagen_url ? `<a class="link link-primary text-xs inline-flex items-center gap-1" href="${esc(l.imagen_url)}" target="_blank" rel="noopener">${icono('external-link', 'size-3')}Ver arte</a>` : ''}
          ${l.observacion_linea ? `<div class="text-xs text-info mt-1">${esc(l.observacion_linea)}</div>` : ''}
        </div>
      </div>
      <div class="flex flex-col gap-1.5">
        <div class="flex flex-wrap gap-1">${badge(l.estado_area)} ${marcaEditada(l)}</div>
        <div class="text-sm"><strong>${l.unidades_terminadas}</strong> / ${l.cantidad_a_producir} ${t.unidad}</div>
        ${progreso(pct, 'progress-sm')}
        ${l.cantidad_editada ? `<div class="text-xs text-warning">Pedido original: ${l.cantidad_original} · ahora ${l.cantidad}</div>` : ''}
        ${l.cantidad_desde_stock ? `<div class="text-xs text-base-content/60">${l.cantidad_desde_stock} de ${l.cantidad} salieron de stock</div>` : ''}
        ${area === 'PRODUCCION' ? `<div class="text-xs flex items-center gap-1">Vinil: ${badge(l.estado_marketing)}</div>` : ''}
      </div>
      <div class="flex flex-col gap-2">${filasEtapa}
        ${regs.length ? `<details class="collapse collapse-arrow bg-base-200/40 border border-base-300">
          <summary class="collapse-title text-xs py-2 min-h-0">${regs.length} ${regs.length === 1 ? 'sesión registrada' : 'sesiones registradas'}</summary>
          <div class="collapse-content overflow-x-auto"><table class="table table-xs">
            <thead><tr><th>Etapa</th><th>Colaborador</th><th>Inicio</th><th>Fin</th><th class="num">Duración</th><th class="num">Unid.</th>${trabaja ? '<th></th>' : ''}</tr></thead>
            <tbody>${regs.map((r) => `<tr><td>${esc(etiquetaEtapa(r.etapa))}</td><td>${esc(r.colaborador || '—')}</td>
              <td class="whitespace-nowrap">${fmt.fechaHora(r.inicio)}</td><td class="whitespace-nowrap">${r.fin ? fmt.fechaHora(r.fin) : '<span class="badge badge-xs badge-info">en curso</span>'}</td>
              <td class="num">${fmt.min(r.duracion_min)}</td><td class="num">${r.cantidad_procesada}</td>
              ${trabaja ? `<td class="whitespace-nowrap text-right">
                <button class="btn btn-ghost btn-xs" data-editar-reg="${r.id_registro_tiempo}" data-det="${l.id_detalle_pedido}" aria-label="Editar sesión">${icono('pencil', 'size-3.5')}</button>
                <button class="btn btn-ghost btn-xs text-error" data-borrar-reg="${r.id_registro_tiempo}" aria-label="Eliminar sesión">${icono('trash', 'size-3.5')}</button></td>` : ''}</tr>`).join('')}</tbody>
          </table></div>
        </details>` : ''}
      </div>
    </div>`;
  }

  function enlazar(lineas) {
    el.querySelectorAll('[data-pedido]').forEach((b) => b.addEventListener('click', () => verPedido(Number(b.dataset.pedido), cargar)));

    el.querySelectorAll('[data-ini]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await conSpinner(b, () => intentar(() => api('tiempos', { method: 'POST', body: {
          id_detalle_pedido: Number(b.dataset.det), id_etapa: Number(b.dataset.ini) } }), 'Etapa iniciada.'));
      } catch { return; }
      cargar();
    }));

    el.querySelectorAll('[data-fin]').forEach((b) => b.addEventListener('click', async () => {
      const cantidad = parseInt(el.querySelector(`[data-cant="${b.dataset.fin}"]`).value, 10);
      if (!(cantidad >= 0)) return;
      try {
        await conSpinner(b, () => intentar(() => api(`tiempos/${b.dataset.fin}/finalizar`, { method: 'PATCH', body: { cantidad_procesada: cantidad } }), 'Sesión cerrada.'));
      } catch { return; }
      cargar();
    }));

    el.querySelectorAll('[data-editar-reg]').forEach((b) => b.addEventListener('click', () => {
      const l = lineas.find((x) => String(x.id_detalle_pedido) === b.dataset.det);
      const reg = l.registros.find((r) => String(r.id_registro_tiempo) === b.dataset.editarReg);
      editarSesion(reg);
    }));

    el.querySelectorAll('[data-borrar-reg]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar esta sesión? El avance y el estado de la línea se recalculan.', { ok: 'Eliminar', peligro: true }))) return;
      try { await intentar(() => api(`tiempos/${b.dataset.borrarReg}`, { method: 'DELETE' }), 'Sesión eliminada.'); } catch { return; }
      cargar();
    }));
  }

  function editarSesion(reg) {
    const colabs = store.cat.colaboradores.filter((c) => c.activo && (c.area === area || c.id_colaborador === reg.id_colaborador));
    const { body, foot, cerrar } = abrirModal({
      titulo: `Editar sesión · ${etiquetaEtapa(reg.etapa)}`,
      tamano: 'sm',
      cuerpo: `<form class="grid grid-cols-2 gap-x-3">
        <fieldset class="fieldset"><legend class="fieldset-legend">Etapa</legend>
          <select name="id_etapa" class="select w-full">${options(etapas, 'id_etapa', (e) => etiquetaEtapa(e.nombre), reg.id_etapa)}</select></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Colaborador</legend>
          <select name="id_colaborador" class="select w-full" ${store.me.es_admin ? '' : 'disabled'}>${options(colabs, 'id_colaborador', 'nombre', reg.id_colaborador, { placeholder: '— Sin asignar —' })}</select></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Inicio</legend>
          <input type="datetime-local" name="inicio" class="input w-full" required value="${fmt.inputFechaHora(reg.inicio)}"></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Fin</legend>
          <input type="datetime-local" name="fin" class="input w-full" value="${fmt.inputFechaHora(reg.fin)}"></fieldset>
        <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Unidades procesadas</legend>
          <input type="number" name="cantidad_procesada" class="input w-full" min="0" step="1" required value="${reg.cantidad_procesada ?? 0}"></fieldset>
        <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Observación</legend>
          <input name="observacion" class="input w-full" maxlength="500" value="${esc(reg.observacion || '')}"></fieldset>
      </form>`,
      pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icono('check')}Guardar</button>`,
    });
    foot.querySelector('[data-ok]').onclick = async (e) => {
      const form = body.querySelector('form');
      if (!form.reportValidity()) return;
      const v = leerForm(form);
      const payload = {
        id_etapa: Number(v.id_etapa),
        inicio: new Date(v.inicio).toISOString(),
        fin: v.fin ? new Date(v.fin).toISOString() : null,
        cantidad_procesada: Number(v.cantidad_procesada),
        observacion: v.observacion || '',
      };
      if (store.me.es_admin) payload.id_colaborador = v.id_colaborador ? Number(v.id_colaborador) : null;
      try {
        await conSpinner(e.currentTarget, () => intentar(() => api(`tiempos/${reg.id_registro_tiempo}`, { method: 'PUT', body: payload }), 'Sesión actualizada.'));
      } catch { return; }
      cerrar();
      cargar();
    };
  }

  $('#fPrioridad').onchange = (e) => { filtros.prioridad = e.target.value; cargar(); };
  $('#fTerminados').onchange = (e) => { filtros.terminados = e.target.checked; cargar(); };
  $('#btnRefrescar').onclick = (e) => conSpinner(e.currentTarget, () => intentar(cargar));

  const reloj = setInterval(() => {
    el.querySelectorAll('.timer[data-desde]').forEach((s) => { s.textContent = fmt.cronometro(s.dataset.desde); });
  }, 1000);
  const auto = setInterval(() => { if (!document.hidden && !document.querySelector('dialog[open]')) cargar().catch(() => {}); }, 120_000);

  await cargar();
  return () => { clearInterval(reloj); clearInterval(auto); };
}
