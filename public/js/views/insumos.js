import {
  api, store, esc, fmt, badge, intentar, toast, abrirModal, icono, etiquetaEtapa, puede, vacio, cargando, conSpinner,
} from '../core.js';

/**
 * Insumos (material y vinil) enlazados al inventario del ERP:
 *  - stock real por almacén leído del ERP
 *  - consumo generado por la producción, pendiente de descargar en el ERP
 */
export default async function insumos(el) {
  const admin = puede('catalogo.admin');
  const logistica = puede('insumos.registrar');
  const erpUrl = store.config.erp?.inventario || null;
  let estadoConsumo = 'PENDIENTE';

  el.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-bold flex items-center gap-2">${icono('warehouse', 'size-5')}Insumos e inventario</h1>
        <p class="text-sm text-base-content/70">Sustratos y viniles enlazados a productos del inventario del ERP. Cada sesión terminada genera su consumo en m².</p>
      </div>
      <div class="flex gap-2">
        ${erpUrl ? `<a class="btn btn-sm" href="${esc(erpUrl)}" target="_top">${icono('external-link')}Movimientos en el ERP</a>` : ''}
        <button class="btn btn-sm" id="btnRefrescar">${icono('refresh-cw')}Actualizar</button>
      </div>
    </div>
    <div id="avisoErp"></div>
    <section class="card bg-base-100 border border-base-300 shadow-sm mb-4">
      <div class="card-body p-4 gap-3">
        <h2 class="card-title text-base">${icono('layers')} Stock de insumos</h2>
        <div id="tablaInsumos" class="overflow-x-auto">${cargando()}</div>
      </div>
    </section>
    <section class="card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-4 gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h2 class="card-title text-base">${icono('clipboard-list')} Consumo de producción</h2>
          <div role="tablist" class="tabs tabs-box tabs-sm" id="tabsConsumo">
            <button role="tab" class="tab tab-active" data-estado="PENDIENTE">Pendientes</button>
            <button role="tab" class="tab" data-estado="REGISTRADO">Registrados</button>
            <button role="tab" class="tab" data-estado="ANULADO">Anulados</button>
          </div>
        </div>
        <div id="resumenConsumo"></div>
        <div id="tablaConsumos" class="overflow-x-auto">${cargando()}</div>
      </div>
    </section>`;

  const $ = (s) => el.querySelector(s);

  // ── Stock ─────────────────────────────────────────────────────────────
  async function cargarInsumos() {
    const { insumos: lista, error_erp: errorErp } = await api('insumos');
    $('#avisoErp').innerHTML = errorErp
      ? `<div role="alert" class="alert alert-warning alert-soft mb-4 text-sm">${icono('triangle-alert', 'size-4')}<span>No se pudo leer el inventario del ERP: ${esc(errorErp)}</span></div>`
      : '';
    $('#tablaInsumos').innerHTML = lista.length ? `<table class="table table-sm">
      <thead><tr><th>Insumo</th><th>Producto del ERP</th><th class="num">1 unidad =</th><th class="num">Stock ERP</th><th class="num">Consumo pendiente</th><th class="num">Tras descargar</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${lista.map((i) => {
        const s = i.stock_erp;
        const unidad = esc(i.erp_unidad || 'u.');
        let stock = '<span class="text-base-content/40">—</span>';
        if (s?.error) stock = `<span class="tooltip tooltip-left" data-tip="${esc(s.error)}"><span class="badge badge-sm badge-error badge-soft">sin datos</span></span>`;
        else if (s) {
          stock = `<span class="tooltip tooltip-left" data-tip="${esc(s.por_almacen.map((a) => `${a.almacen}: ${fmt.num(a.stock)} (mín ${fmt.num(a.minimo)})`).join(' · ') || 'Sin stock registrado en almacenes')}">
            <span class="font-semibold ${s.alerta ? 'text-error' : ''}">${fmt.num(s.total)}</span> <span class="text-xs">${unidad}</span>
            ${s.alerta ? `<span class="badge badge-xs badge-error ml-1">mínimo</span>` : ''}</span>`;
        }
        const despues = s && !s.error ? `<span class="${s.despues_de_descargar < 0 ? 'text-error font-semibold' : ''}">${fmt.num(s.despues_de_descargar)}</span>` : '—';
        return `<tr>
          <td><div class="flex items-center gap-2"><span class="badge badge-xs ${i.tipo === 'MATERIAL' ? 'badge-primary' : 'badge-secondary'} badge-soft">${i.tipo === 'MATERIAL' ? 'Sustrato' : 'Vinil'}</span>
            <span class="font-medium">${esc(i.nombre)}</span>${i.activo ? '' : '<span class="badge badge-xs badge-ghost">inactivo</span>'}</div></td>
          <td>${i.erp_product_id
            ? `<div class="text-sm">${esc(i.erp_product_nombre || '')}</div><div class="text-xs text-base-content/60">${esc(i.erp_product_codigo || '')}</div>`
            : '<span class="badge badge-sm badge-ghost gap-1">' + icono('unlink', 'size-3') + 'Sin enlazar</span>'}</td>
          <td class="num text-sm">${fmt.num(i.factor_m2)} m²</td>
          <td class="num">${stock}</td>
          <td class="num">${Number(i.cantidad_pendiente) ? `${fmt.num(i.cantidad_pendiente)} <span class="text-xs">${unidad}</span><div class="text-[11px] text-base-content/50">${fmt.num(i.m2_pendiente)} m²</div>` : '<span class="text-base-content/40">0</span>'}</td>
          <td class="num">${despues}</td>
          ${admin ? `<td class="text-right"><button class="btn btn-ghost btn-xs" data-enlazar="${i.tipo}:${i.id}">${icono('link')}${i.erp_product_id ? 'Cambiar' : 'Enlazar'}</button></td>` : ''}
        </tr>`;
      }).join('')}</tbody></table>` : vacio('No hay insumos registrados.', 'layers');

    el.querySelectorAll('[data-enlazar]').forEach((b) => b.addEventListener('click', () => {
      const [tipo, id] = b.dataset.enlazar.split(':');
      enlazar(lista.find((i) => i.tipo === tipo && String(i.id) === id));
    }));
  }

  function enlazar(insumo) {
    let elegido = insumo.erp_product_id
      ? { id: insumo.erp_product_id, nombre: insumo.erp_product_nombre, codigo: insumo.erp_product_codigo, unidad: insumo.erp_unidad }
      : null;
    const { body, foot, cerrar } = abrirModal({
      titulo: `Enlazar ${insumo.tipo === 'MATERIAL' ? 'sustrato' : 'vinil'} · ${insumo.nombre}`,
      cuerpo: `
        <label class="input w-full mb-2">${icono('search', 'size-4 opacity-50')}<input type="search" id="qProd" placeholder="Buscar producto en el inventario del ERP (código o nombre)"></label>
        <div id="resProd" class="max-h-56 overflow-y-auto rounded-box border border-base-300 divide-y divide-base-300 mb-3">${vacio('Escribe para buscar.', 'search')}</div>
        <div id="elegido" class="mb-3"></div>
        <div class="grid grid-cols-2 gap-x-3">
          <fieldset class="fieldset"><legend class="fieldset-legend">Unidad en el ERP</legend>
            <input id="unidad" class="input w-full" maxlength="50" placeholder="m2, plancha, rollo…"></fieldset>
          <fieldset class="fieldset"><legend class="fieldset-legend">m² que rinde 1 unidad</legend>
            <input id="factor" type="number" class="input w-full" min="0.0001" step="0.0001" value="${insumo.factor_m2 || 1}"></fieldset>
        </div>
        <details class="collapse collapse-arrow bg-base-200/60 border border-base-300 mt-2">
          <summary class="collapse-title text-sm min-h-0 py-2">${icono('ruler', 'size-4 inline')} Calcular desde las medidas (plancha o rollo)</summary>
          <div class="collapse-content flex flex-wrap items-end gap-2">
            <fieldset class="fieldset"><legend class="fieldset-legend">Ancho (m)</legend><input id="calcA" type="number" step="0.01" class="input input-sm w-28" placeholder="1.22"></fieldset>
            <fieldset class="fieldset"><legend class="fieldset-legend">Largo (m)</legend><input id="calcL" type="number" step="0.01" class="input input-sm w-28" placeholder="2.44"></fieldset>
            <button type="button" class="btn btn-sm" id="btnCalc">Usar</button>
          </div>
        </details>
        <p class="text-xs text-base-content/60 mt-2">Si el ERP mide este insumo en m², deja 1. El consumo de cada sesión se calcula como m² de la señal × unidades ÷ este valor.</p>`,
      pie: `${insumo.erp_product_id ? `<button class="btn btn-ghost text-error mr-auto" data-quitar>${icono('unlink')}Quitar enlace</button>` : ''}
        <button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icono('check')}Guardar</button>`,
    });
    const $m = (s) => body.querySelector(s);
    $m('#unidad').value = insumo.erp_unidad || '';
    const pintarElegido = () => {
      $m('#elegido').innerHTML = elegido
        ? `<div class="alert alert-success alert-soft text-sm py-2">${icono('link', 'size-4')}<span><strong>${esc(elegido.nombre || '')}</strong> ${elegido.codigo ? `· ${esc(elegido.codigo)}` : ''}</span></div>`
        : '<div class="text-sm text-base-content/60">Ningún producto elegido.</div>';
    };
    pintarElegido();

    let timer = null;
    $m('#qProd').addEventListener('input', (e) => {
      clearTimeout(timer);
      const q = e.target.value.trim();
      timer = setTimeout(async () => {
        $m('#resProd').innerHTML = '<div class="p-3"><span class="loading loading-dots loading-sm"></span></div>';
        try {
          const prods = await api(`erp/productos?q=${encodeURIComponent(q)}`);
          $m('#resProd').innerHTML = prods.length ? prods.map((p) => `
            <button type="button" class="w-full text-left px-3 py-2 hover:bg-base-200 flex items-center gap-2" data-prod='${esc(JSON.stringify(p))}'>
              <span class="flex-1 min-w-0"><span class="block text-sm truncate">${esc(p.nombre)}</span><span class="block text-xs text-base-content/60">${esc(p.codigo || '')}${p.unidad ? ' · ' + esc(p.unidad) : ''}</span></span>
              ${p.activo ? '' : '<span class="badge badge-xs badge-ghost">inactivo</span>'}</button>`).join('') : vacio('Sin resultados en el ERP.', 'search');
          $m('#resProd').querySelectorAll('[data-prod]').forEach((b) => b.addEventListener('click', () => {
            elegido = JSON.parse(b.dataset.prod);
            if (elegido.unidad && !$m('#unidad').value) $m('#unidad').value = elegido.unidad;
            pintarElegido();
          }));
        } catch (err) {
          $m('#resProd').innerHTML = `<div class="p-3 text-sm text-error">${esc(err.message)}</div>`;
        }
      }, 300);
    });
    $m('#btnCalc').addEventListener('click', () => {
      const a = Number($m('#calcA').value), l = Number($m('#calcL').value);
      if (a > 0 && l > 0) $m('#factor').value = (a * l).toFixed(4);
    });

    foot.querySelector('[data-quitar]')?.addEventListener('click', async () => {
      try { await intentar(() => api(`insumos/${insumo.tipo}/${insumo.id}/enlace`, { method: 'DELETE' }), 'Enlace quitado.'); } catch { return; }
      cerrar();
      cargarTodo();
    });
    foot.querySelector('[data-ok]').addEventListener('click', async (e) => {
      if (!elegido) return toast('Elige un producto del ERP.', 'error');
      const factor = Number($m('#factor').value);
      if (!(factor > 0)) return toast('El rendimiento en m² debe ser mayor a 0.', 'error');
      try {
        await conSpinner(e.currentTarget, () => intentar(() => api(`insumos/${insumo.tipo}/${insumo.id}/enlace`, { method: 'PUT', body: {
          erp_product_id: elegido.id, erp_product_codigo: elegido.codigo, erp_product_nombre: elegido.nombre,
          erp_unidad: $m('#unidad').value.trim() || null, factor_m2: factor,
        } }), 'Insumo enlazado al inventario del ERP.'));
      } catch { return; }
      cerrar();
      cargarTodo();
    });
  }

  // ── Consumos ──────────────────────────────────────────────────────────
  async function cargarConsumos() {
    const { consumos, resumen_pendiente: resumen } = await api(`insumos/consumos?estado=${estadoConsumo}`);
    $('#resumenConsumo').innerHTML = estadoConsumo === 'PENDIENTE' && resumen.length ? `
      <div class="flex flex-wrap gap-2">${resumen.map((r) => `
        <div class="rounded-box border border-base-300 bg-base-200/50 px-3 py-2 text-sm">
          <div class="font-medium">${esc(r.erp_product_nombre || r.insumo)}</div>
          <div class="text-xs text-base-content/60">${r.erp_product_codigo ? esc(r.erp_product_codigo) + ' · ' : ''}${r.registros} registros</div>
          <div class="mt-1"><span class="font-semibold">${fmt.num(r.cantidad_erp)}</span> ${esc(r.unidad_erp || 'u.')}
            <span class="text-xs text-base-content/60">(${fmt.num(r.m2)} m²)</span>
            ${r.erp_product_id ? '' : '<span class="badge badge-xs badge-warning ml-1">sin enlazar</span>'}</div>
        </div>`).join('')}</div>` : '';

    const marcable = logistica && estadoConsumo === 'PENDIENTE';
    $('#tablaConsumos').innerHTML = consumos.length ? `
      ${marcable ? `<div class="flex flex-wrap items-center gap-2 mb-2">
        <button class="btn btn-sm btn-success" id="btnRegistrar" disabled>${icono('badge-check')}Marcar como descargado en el ERP</button>
        <button class="btn btn-sm btn-ghost text-error" id="btnAnular" disabled>${icono('circle-x')}Anular</button>
        <span class="text-xs text-base-content/60" id="selInfo"></span></div>` : ''}
      <table class="table table-sm">
        <thead><tr>${marcable ? '<th><input type="checkbox" class="checkbox checkbox-sm" id="chkTodos" aria-label="Seleccionar todos"></th>' : ''}
          <th>Fecha</th><th>Pedido</th><th>Señal</th><th>Insumo</th><th>Etapa / quién</th><th class="num">Señales</th><th class="num">m²</th><th class="num">Cantidad ERP</th>
          ${estadoConsumo !== 'PENDIENTE' ? '<th>Referencia</th>' : ''}</tr></thead>
        <tbody>${consumos.map((c) => `<tr>
          ${marcable ? `<td><input type="checkbox" class="checkbox checkbox-sm" data-sel="${c.id_consumo}" aria-label="Seleccionar"></td>` : ''}
          <td class="whitespace-nowrap text-sm">${fmt.fechaHora(c.fecha)}</td>
          <td>${c.id_pedido ? `<a class="link" href="#/pedido/${c.id_pedido}">#${c.id_pedido}</a><div class="text-xs text-base-content/60">${esc(c.cliente || '')}</div>` : '—'}</td>
          <td class="text-sm">${esc(c.senal || '—')}</td>
          <td><span class="badge badge-xs ${c.tipo === 'MATERIAL' ? 'badge-primary' : 'badge-secondary'} badge-soft">${c.tipo === 'MATERIAL' ? 'Sustrato' : 'Vinil'}</span>
            <span class="text-sm">${esc(c.erp_product_nombre || c.insumo)}</span></td>
          <td class="text-xs">${esc(etiquetaEtapa(c.etapa || ''))}<div class="text-base-content/60">${esc(c.colaborador || '')}</div></td>
          <td class="num">${c.unidades_senal}</td>
          <td class="num">${fmt.num(c.m2)}</td>
          <td class="num font-semibold">${fmt.num(c.cantidad_erp)} <span class="text-xs font-normal">${esc(c.unidad_erp || '')}</span></td>
          ${estadoConsumo !== 'PENDIENTE' ? `<td class="text-xs">${badge(c.estado)} ${esc(c.referencia_erp || '')}<div class="text-base-content/60">${esc(c.registrado_por || '')} · ${fmt.fechaHora(c.fecha_registro_erp)}</div></td>` : ''}
        </tr>`).join('')}</tbody>
      </table>` : vacio(estadoConsumo === 'PENDIENTE' ? 'No hay consumo pendiente de descargar.' : 'Sin registros.', 'clipboard-list');

    if (!marcable || !consumos.length) return;
    const sel = () => [...el.querySelectorAll('[data-sel]:checked')].map((c) => Number(c.dataset.sel));
    const actualizar = () => {
      const n = sel().length;
      $('#btnRegistrar').disabled = !n;
      $('#btnAnular').disabled = !n;
      $('#selInfo').textContent = n ? `${n} seleccionados` : '';
    };
    el.querySelectorAll('[data-sel]').forEach((c) => c.addEventListener('change', actualizar));
    $('#chkTodos').addEventListener('change', (e) => {
      el.querySelectorAll('[data-sel]').forEach((c) => { c.checked = e.target.checked; });
      actualizar();
    });
    $('#btnRegistrar').addEventListener('click', () => {
      const ids = sel();
      const { body, foot, cerrar } = abrirModal({
        titulo: 'Marcar como descargado en el ERP', tamano: 'sm',
        cuerpo: `<p class="text-sm mb-2">Confirma que registraste la salida de estos ${ids.length} consumos en el inventario del ERP.</p>
          <fieldset class="fieldset"><legend class="fieldset-legend">Referencia del movimiento en el ERP</legend>
          <input class="input w-full" id="ref" maxlength="300" placeholder="Ej. N° de guía o del movimiento"></fieldset>`,
        pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-success" data-ok>${icono('check')}Confirmar</button>`,
      });
      foot.querySelector('[data-ok]').onclick = async (e) => {
        try {
          await conSpinner(e.currentTarget, () => intentar(() => api('insumos/consumos/registrar', { method: 'POST',
            body: { ids, referencia: body.querySelector('#ref').value.trim() || null } }), 'Consumos marcados como registrados.'));
        } catch { return; }
        cerrar();
        cargarTodo();
      };
    });
    $('#btnAnular').addEventListener('click', async () => {
      const ids = sel();
      const { body, foot, cerrar } = abrirModal({
        titulo: 'Anular consumos', tamano: 'sm',
        cuerpo: `<fieldset class="fieldset"><legend class="fieldset-legend">Motivo</legend>
          <input class="input w-full" id="motivo" maxlength="300" required placeholder="Ej. sesión registrada por error"></fieldset>`,
        pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-error" data-ok>Anular ${ids.length}</button>`,
      });
      foot.querySelector('[data-ok]').onclick = async () => {
        const motivo = body.querySelector('#motivo').value.trim();
        if (!motivo) return toast('Indica el motivo.', 'error');
        try { await intentar(() => api('insumos/consumos/anular', { method: 'POST', body: { ids, motivo } }), 'Consumos anulados.'); } catch { return; }
        cerrar();
        cargarTodo();
      };
    });
  }

  el.querySelectorAll('#tabsConsumo [data-estado]').forEach((b) => b.addEventListener('click', () => {
    estadoConsumo = b.dataset.estado;
    el.querySelectorAll('#tabsConsumo [data-estado]').forEach((x) => x.classList.toggle('tab-active', x === b));
    cargarConsumos();
  }));

  async function cargarTodo() {
    await Promise.all([cargarInsumos(), cargarConsumos()]);
  }
  $('#btnRefrescar').onclick = (e) => conSpinner(e.currentTarget, () => intentar(cargarTodo));
  await cargarTodo();
}
