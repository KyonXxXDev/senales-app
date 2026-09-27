import {
  api, store, esc, fmt, badge, prioridad, progreso, miniatura, intentar, toast, etapasDe, etiquetaEtapa,
  abrirModal, cerrarModal, confirmar, options, leerForm,
} from '../core.js';
import { verPedido } from './pedido-modal.js';

const TEXTOS = {
  MARKETING: {
    titulo: 'Marketing · Diseño e impresión',
    desc: 'Líneas que no se cubrieron con stock. Inicia cada etapa y, al terminar, indica cuántas unidades salieron.',
    unidad: 'impresas',
  },
  PRODUCCION: {
    titulo: 'Producción · Fabricación',
    desc: 'Corte de sustrato, armado y control. La columna "Vinil" indica si Marketing ya terminó la impresión.',
    unidad: 'terminadas',
  },
};

export default async function trabajo(el, area) {
  const t = TEXTOS[area];
  const etapas = etapasDe(area);
  let filtros = { prioridad: '', terminados: false };
  let timer = null;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>${t.titulo}</h1><p>${t.desc}</p></div>
      <div class="row">
        <select id="fPrioridad" aria-label="Filtrar por prioridad">
          <option value="">Todas las prioridades</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option>
        </select>
        <label class="row small"><input type="checkbox" id="fTerminados"> Mostrar terminadas</label>
        <button class="btn secondary" id="btnRefrescar">Actualizar</button>
      </div>
    </div>
    <div id="resumen" class="grid grid-4" style="margin-bottom:16px"></div>
    <div id="lista"></div>`;

  const $ = (s) => el.querySelector(s);

  async function cargar() {
    const qs = new URLSearchParams();
    if (filtros.prioridad) qs.set('prioridad', filtros.prioridad);
    if (filtros.terminados) qs.set('terminados', '1');
    const lineas = await api(`/bandeja/${area}?${qs}`);
    pintarResumen(lineas);
    pintar(lineas);
  }

  function pintarResumen(lineas) {
    const pend = lineas.filter((l) => l.estado_area === 'PENDIENTE');
    const proc = lineas.filter((l) => l.estado_area === 'EN PROCESO');
    const urg = lineas.filter((l) => l.prioridad === 'ALTA' && l.estado_area !== 'TERMINADO');
    const faltan = lineas.filter((l) => l.estado_area !== 'TERMINADO')
      .reduce((a, l) => a + Math.max(0, l.cantidad_a_producir - l.unidades_terminadas), 0);
    const tile = (label, value, sub) => `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;
    $('#resumen').innerHTML =
      tile('Pendientes', pend.length, 'líneas sin empezar') +
      tile('En proceso', proc.length, 'líneas con trabajo iniciado') +
      tile('Urgentes', urg.length, 'líneas de prioridad alta') +
      tile('Unidades por hacer', faltan, `aún no ${t.unidad}`);
  }

  function pintar(lineas) {
    if (!lineas.length) {
      $('#lista').innerHTML = '<div class="card empty">No hay trabajo pendiente en esta área. 🎉</div>';
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
      return `<section class="card pedido-block">
        <div class="card-head">
          <h3><button class="btn ghost sm" data-pedido="${p.id_pedido}">Pedido #${p.id_pedido}</button> ${esc(p.cliente)}</h3>
          <div class="row small">${prioridad(p.prioridad)}
            <span class="muted">Registrado ${fmt.fechaHora(p.fecha_pedido)}</span>
            ${p.fecha_requerida ? `<span class="${vencido ? 'badge st-PENDIENTE' : 'muted'}">Requerido ${fmt.fecha(p.fecha_requerida)}${vencido ? ' · vencido' : ''}</span>` : ''}
          </div>
        </div>
        ${p.observacion ? `<div class="card-body hint" style="border-radius:0">${esc(p.observacion)}</div>` : ''}
        ${ls.map(linea).join('')}
      </section>`;
    }).join('');
    enlazar(lineas);
  }

  function linea(l) {
    const pct = l.cantidad_a_producir ? (100 * l.unidades_terminadas) / l.cantidad_a_producir : 0;
    const regs = l.registros;
    const filasEtapa = etapas.map((e) => {
      const deEtapa = regs.filter((r) => r.id_etapa === e.id_etapa);
      const abierta = deEtapa.find((r) => !r.fin);
      const hechas = deEtapa.filter((r) => r.fin).reduce((a, r) => a + r.cantidad_procesada, 0);
      const minutos = deEtapa.reduce((a, r) => a + (r.duracion_min || 0), 0);
      const faltan = Math.max(0, l.cantidad_a_producir - (e.es_final ? l.unidades_terminadas : 0));
      const estado = abierta ? '' : deEtapa.length ? `<span class="small muted">✓ ${fmt.min(minutos)}${hechas ? ` · ${hechas} u.` : ''}</span>` : '<span class="small muted">Sin iniciar</span>';
      const terminado = l.estado_area === 'TERMINADO';
      return `<div class="etapa ${abierta ? 'corriendo' : ''}">
        <span class="nombre">${esc(etiquetaEtapa(e.nombre))}${e.es_final ? ' <span class="muted small">(cuenta unidades)</span>' : ''}</span>
        ${abierta ? `<span class="timer" data-desde="${esc(abierta.inicio)}">${fmt.cronometro(abierta.inicio)}</span>
            <span class="small muted">${esc(abierta.colaborador || '')}</span>
            <span class="spacer"></span>
            <label class="row small">Unid. <input type="number" min="0" max="${e.es_final ? faltan : ''}" step="1"
              value="${e.es_final ? faltan : l.cantidad_a_producir}" data-cant="${abierta.id_registro_tiempo}" aria-label="Unidades procesadas"></label>
            <button class="btn sm" data-fin="${abierta.id_registro_tiempo}">Finalizar</button>`
          : `${estado}<span class="spacer"></span>
            ${terminado && e.es_final ? '' : `<button class="btn secondary sm" data-ini="${e.id_etapa}" data-det="${l.id_detalle_pedido}">${deEtapa.length ? 'Nueva sesión' : 'Iniciar'}</button>`}`}
      </div>`;
    }).join('');

    return `<div class="linea">
      <div class="senal-cell" style="align-items:flex-start">${miniatura(l.imagen_referencial)}
        <div><strong>${esc(l.senal)}</strong>
          <div class="small">${fmt.medida(l.ancho_cm, l.alto_cm)}</div>
          <div class="small muted">${esc(l.material)} · ${esc(l.vinil)}</div>
          ${l.imagen_referencial && /^https?:/i.test(l.imagen_referencial) ? `<a class="small" href="${esc(l.imagen_referencial)}" target="_blank" rel="noopener">Ver arte</a>` : ''}
        </div></div>
      <div class="stack" style="gap:6px">
        <div>${badge(l.estado_area)}</div>
        <div class="small"><strong>${l.unidades_terminadas}</strong> / ${l.cantidad_a_producir} ${t.unidad}</div>
        ${progreso(pct)}
        ${l.cantidad_desde_stock ? `<div class="small muted">${l.cantidad_desde_stock} de ${l.cantidad} salieron de stock</div>` : ''}
        ${area === 'PRODUCCION' ? `<div class="small">Vinil: ${badge(l.estado_marketing)}</div>` : ''}
      </div>
      <div class="etapas">${filasEtapa}
        ${regs.length ? `<details class="sesiones"><summary>${regs.length} ${regs.length === 1 ? 'sesión registrada' : 'sesiones registradas'}</summary>
          <table>
            <thead>
              <tr>
                <th>Etapa</th>
                <th>Colaborador</th>
                <th>Inicio</th>
                <th>Fin</th>
                <th class="num">Duración</th>
                <th class="num">Unid.</th>
                <th style="width:70px;text-align:right">Acciones</th>
              </tr>
            </thead>
            <tbody>${regs.map((r) => `<tr>
              <td>${esc(etiquetaEtapa(r.etapa))}</td>
              <td>${esc(r.colaborador || '—')}</td>
              <td>${fmt.fechaHora(r.inicio)}</td>
              <td>${r.fin ? fmt.fechaHora(r.fin) : '<em>en curso</em>'}</td>
              <td class="num">${fmt.min(r.duracion_min)}</td>
              <td class="num">${r.cantidad_procesada}</td>
              <td class="nowrap" style="text-align:right">
                <button type="button" class="btn-icon-action" data-editar-tiempo="${r.id_registro_tiempo}" title="Editar sesión">✏️</button>
                <button type="button" class="btn-icon-action danger" data-eliminar-tiempo="${r.id_registro_tiempo}" title="Eliminar sesión">🗑️</button>
              </td>
            </tr>`).join('')}</tbody>
          </table>
        </details>` : ''}
      </div>
    </div>`;
  }

  function enlazar(lineas = []) {
    el.querySelectorAll('[data-pedido]').forEach((b) => b.addEventListener('click', () => verPedido(b.dataset.pedido, cargar)));

    // Mapa de registros para búsqueda rápida al editar
    const mapaRegistros = new Map();
    for (const l of lineas) {
      for (const r of l.registros || []) {
        mapaRegistros.set(r.id_registro_tiempo, { ...r, id_detalle_pedido: l.id_detalle_pedido });
      }
    }

    // Editar sesión de tiempo
    el.querySelectorAll('[data-editar-tiempo]').forEach((b) => b.addEventListener('click', () => {
      const idReg = Number(b.dataset.editarTiempo);
      const reg = mapaRegistros.get(idReg);
      if (!reg) return toast('Sesión no encontrada.', 'error');

      const aIsoLocal = (dtStr) => {
        if (!dtStr) return '';
        const d = new Date(dtStr);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      };

      const activos = (store.cat?.colaboradores || []).filter((c) => c.activo);

      const { body, foot } = abrirModal({
        titulo: `Editar Sesión #${idReg}`,
        cuerpo: `
          <form id="fEditarTiempo" class="fields">
            <label class="field">
              Etapa *
              <select name="id_etapa" required>
                ${options(etapas, 'id_etapa', 'nombre', reg.id_etapa)}
              </select>
            </label>
            <label class="field">
              Colaborador
              <select name="id_colaborador">
                ${options(activos, 'id_colaborador', (c) => `${c.nombre} · ${c.area}`, reg.id_colaborador, { placeholder: '— Sin asignar —' })}
              </select>
            </label>
            <label class="field">
              Inicio *
              <input type="datetime-local" name="inicio" required value="${aIsoLocal(reg.inicio)}">
            </label>
            <label class="field">
              Fin
              <input type="datetime-local" name="fin" value="${aIsoLocal(reg.fin)}">
            </label>
            <label class="field full">
              Cantidad procesada (unidades) *
              <input type="number" name="cantidad_procesada" min="0" step="1" required value="${reg.cantidad_procesada ?? 0}">
            </label>
            <label class="field full">
              Observación
              <input name="observacion" maxlength="500" value="${esc(reg.observacion || '')}">
            </label>
          </form>
        `,
        pie: `
          <button type="button" class="btn secondary" data-close>Cancelar</button>
          <button type="button" class="btn primary" id="btnGuardarEdicionTiempo">Guardar cambios</button>
        `,
        estrecho: true,
      });

      foot.querySelector('#btnGuardarEdicionTiempo').onclick = async () => {
        const form = body.querySelector('#fEditarTiempo');
        if (!form.reportValidity()) return;
        const vals = leerForm(form);

        const payload = {
          id_etapa: Number(vals.id_etapa),
          id_colaborador: vals.id_colaborador ? Number(vals.id_colaborador) : null,
          inicio: new Date(vals.inicio).toISOString(),
          fin: vals.fin ? new Date(vals.fin).toISOString() : null,
          cantidad_procesada: Number(vals.cantidad_procesada),
          observacion: vals.observacion || '',
        };

        try {
          await intentar(() => api(`/tiempos/${idReg}`, { method: 'PUT', body: payload }), 'Sesión actualizada.');
          cerrarModal();
          cargar();
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    }));

    // Eliminar sesión de tiempo
    el.querySelectorAll('[data-eliminar-tiempo]').forEach((b) => b.addEventListener('click', async () => {
      const idReg = Number(b.dataset.eliminarTiempo);
      const conf = await confirmar('¿Seguro que deseas eliminar esta sesión de tiempo? El avance y estado de la línea se recalcularán automáticamente.', { ok: 'Eliminar', peligro: true });
      if (!conf) return;

      try {
        await intentar(() => api(`/tiempos/${idReg}`, { method: 'DELETE' }), 'Sesión eliminada.');
        cargar();
      } catch (err) {
        toast(err.message, 'error');
      }
    }));

    el.querySelectorAll('[data-ini]').forEach((b) => b.addEventListener('click', async () => {
      if (!store.usuario) toast('Consejo: elige tu nombre en la barra superior para que el tiempo quede a tu nombre.');
      b.disabled = true;
      try {
        await intentar(() => api('/tiempos', { method: 'POST', body: {
          id_detalle_pedido: Number(b.dataset.det), id_etapa: Number(b.dataset.ini),
          id_colaborador: store.usuario ? Number(store.usuario) : null } }), 'Etapa iniciada.');
      } catch { b.disabled = false; return; }
      cargar();
    }));

    el.querySelectorAll('[data-fin]').forEach((b) => b.addEventListener('click', async () => {
      const input = el.querySelector(`[data-cant="${b.dataset.fin}"]`);
      const cantidad = parseInt(input.value, 10);
      if (!(cantidad >= 0)) return toast('Ingresa las unidades procesadas (0 o más).', 'error');
      b.disabled = true;
      try {
        await intentar(() => api(`/tiempos/${b.dataset.fin}/finalizar`, { method: 'PATCH', body: { cantidad_procesada: cantidad } }),
          'Sesión cerrada.');
      } catch { b.disabled = false; return; }
      cargar();
    }));
  }

  $('#fPrioridad').onchange = (e) => { filtros.prioridad = e.target.value; cargar(); };
  $('#fTerminados').onchange = (e) => { filtros.terminados = e.target.checked; cargar(); };
  $('#btnRefrescar').onclick = () => intentar(cargar);

  // Cronómetros en vivo
  timer = setInterval(() => {
    el.querySelectorAll('.timer[data-desde]').forEach((s) => { s.textContent = fmt.cronometro(s.dataset.desde); });
  }, 1000);

  await cargar();
  return () => clearInterval(timer);
}
