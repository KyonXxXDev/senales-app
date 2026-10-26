import {
  api, store, esc, fmt, intentar, cargarCatalogos, confirmar, icono, AREA_TXT, etiquetaEtapa, cargando,
  conSpinner, toast,
} from '../core.js';

const SECCIONES = [
  { k: 'colaboradores', txt: 'Colaboradores', ico: 'users' },
  { k: 'clientes', txt: 'Clientes', ico: 'building' },
  { k: 'materiales', txt: 'Sustratos', ico: 'layers' },
  { k: 'viniles', txt: 'Viniles', ico: 'printer' },
  { k: 'etapas', txt: 'Etapas', ico: 'list-filter' },
  { k: 'erp', txt: 'Integración ERP', ico: 'link' },
];

const SIMPLE = {
  clientes: { id: 'id_cliente', clave: 'clientes', titulo: 'Clientes / tiendas' },
  materiales: { id: 'id_material', clave: 'materiales', titulo: 'Sustratos (material)' },
  viniles: { id: 'id_vinil', clave: 'viniles', titulo: 'Viniles' },
};

export default async function catalogos(el) {
  await cargarCatalogos();
  let actual = 'colaboradores';
  const esErp = store.config.modo === 'erp';

  el.innerHTML = `
    <div class="mb-4">
      <h1 class="text-xl font-bold flex items-center gap-2">${icono('settings', 'size-5')}Catálogos</h1>
      <p class="text-sm text-base-content/70">Lo que está en uso no se borra: desactívalo para que no aparezca en formularios nuevos.</p>
    </div>
    <div role="tablist" class="tabs tabs-border mb-4 tabs-scroll flex-nowrap" id="secs">
      ${SECCIONES.map((s) => `<button role="tab" class="tab gap-1.5 whitespace-nowrap ${s.k === actual ? 'tab-active' : ''}" data-sec="${s.k}">${icono(s.ico)}${s.txt}</button>`).join('')}
    </div>
    <div id="contenido"></div>`;

  const cont = el.querySelector('#contenido');
  const pintar = async () => {
    cont.innerHTML = cargando();
    if (actual === 'colaboradores') return colaboradores(cont, esErp);
    if (actual === 'etapas') return etapas(cont);
    if (actual === 'erp') return integracion(cont);
    return simple(cont, actual);
  };
  el.querySelectorAll('[data-sec]').forEach((b) => b.addEventListener('click', () => {
    actual = b.dataset.sec;
    el.querySelectorAll('[data-sec]').forEach((x) => x.classList.toggle('tab-active', x === b));
    pintar();
  }));
  await pintar();
}

// ── Catálogos simples ───────────────────────────────────────────────────
function simple(cont, ruta) {
  const d = SIMPLE[ruta];
  const lista = store.cat[d.clave];
  cont.innerHTML = `<section class="card bg-base-100 border border-base-300 shadow-sm max-w-3xl">
    <div class="card-body p-4 gap-3">
      <div class="flex items-center justify-between"><h2 class="card-title text-base">${d.titulo}</h2>
        <span class="text-xs text-base-content/60">${lista.filter((x) => x.activo).length} activos</span></div>
      ${ruta !== 'clientes' ? `<p class="text-xs text-base-content/60">El enlace con productos del inventario del ERP se configura en <a class="link" href="#/insumos">Insumos</a>.</p>` : ''}
      <form class="join w-full" data-add>
        <input name="nombre" class="input join-item w-full" placeholder="Nombre" required maxlength="120" aria-label="Nombre">
        <button class="btn btn-primary join-item">${icono('plus')}Agregar</button>
      </form>
      <div class="overflow-x-auto max-h-[60vh]"><table class="table table-sm">
        <thead><tr><th>Nombre</th><th>Activo</th><th></th></tr></thead>
        <tbody>${lista.map((x) => `<tr data-id="${x[d.id]}">
          <td><input class="input input-sm input-ghost w-full" value="${esc(x.nombre)}" data-nombre aria-label="Nombre"></td>
          <td><input type="checkbox" class="toggle toggle-sm toggle-success" data-activo ${x.activo ? 'checked' : ''} aria-label="Activo"></td>
          <td class="text-right"><button class="btn btn-ghost btn-xs text-error" data-del aria-label="Eliminar">${icono('trash')}</button></td>
        </tr>`).join('')}</tbody></table></div>
    </div></section>`;

  const refrescar = async () => { await cargarCatalogos(); simple(cont, ruta); };
  cont.querySelector('[data-add]').onsubmit = async (e) => {
    e.preventDefault();
    try { await intentar(() => api(ruta, { method: 'POST', body: { nombre: e.target.nombre.value.trim() } }), 'Agregado.'); } catch { return; }
    refrescar();
  };
  cont.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const actualizar = async (body) => {
      try { await intentar(() => api(`${ruta}/${id}`, { method: 'PUT', body }), 'Guardado.'); } catch { /* toast */ }
      refrescar();
    };
    tr.querySelector('[data-nombre]').onchange = (e) => actualizar({ nombre: e.target.value });
    tr.querySelector('[data-activo]').onchange = (e) => actualizar({ activo: e.target.checked });
    tr.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmar('¿Eliminar este registro?', { ok: 'Eliminar', peligro: true }))) return;
      try { await intentar(() => api(`${ruta}/${id}`, { method: 'DELETE' }), 'Eliminado.'); } catch { return; }
      refrescar();
    };
  });
}

// ── Colaboradores ───────────────────────────────────────────────────────
async function colaboradores(cont, esErp) {
  const lista = await api('colaboradores');
  const areaSel = (c) => `<select class="select select-sm w-40" data-area aria-label="Área">
      <option value="" ${!c.area ? 'selected' : ''}>Solo consulta</option>
      ${Object.entries(AREA_TXT).map(([k, v]) => `<option value="${k}" ${c.area === k ? 'selected' : ''}>${v}</option>`).join('')}
    </select>`;

  cont.innerHTML = `<section class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 gap-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="card-title text-base">Colaboradores</h2>
        ${esErp ? `<button class="btn btn-sm btn-primary" id="btnSync">${icono('refresh-cw')}Sincronizar con RRHH</button>` : ''}
      </div>
      ${esErp ? `<div role="note" class="alert alert-info alert-soft text-sm">${icono('info', 'size-4')}
        <span>Las personas del ERP entran solas la primera vez que abren Señalética. El área se toma de su área en RRHH; si la cambias aquí, queda fija (<span class="badge badge-xs">fija</span>) y la sincronización no la toca.</span></div>` : ''}
      <form class="flex flex-wrap gap-2" data-add>
        <input name="nombre" class="input input-sm flex-1 min-w-48" placeholder="Nombre (sin cuenta en el ERP)" required maxlength="120" aria-label="Nombre">
        <select name="area" class="select select-sm w-40" aria-label="Área">${Object.entries(AREA_TXT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
        <button class="btn btn-sm">${icono('plus')}Agregar</button>
      </form>
      <div class="overflow-x-auto"><table class="table table-sm">
        <thead><tr><th>Colaborador</th><th>Origen</th><th>Área aquí</th><th><span class="tooltip" data-tip="Además, los roles ADMIN/GERENTE/TI del ERP administran siempre">Administrador</span></th><th>Activo</th><th></th></tr></thead>
        <tbody>${lista.map((c) => `<tr data-id="${c.id_colaborador}">
          <td><div class="font-medium">${esc(c.nombre)}</div>
            ${c.origen === 'ERP' ? `<div class="text-xs text-base-content/60">${esc([c.erp_codigo, c.erp_cargo, c.erp_area].filter(Boolean).join(' · '))}</div>` : ''}</td>
          <td>${c.origen === 'ERP'
            ? `<span class="badge badge-sm badge-info badge-soft">ERP</span>${c.erp_rol ? ` <span class="badge badge-sm badge-outline" title="Rol en el ERP">${esc(c.erp_rol)}</span>` : ''}<div class="text-[11px] text-base-content/50">${c.ultima_sincronizacion ? fmt.fechaHora(c.ultima_sincronizacion) : ''}</div>`
            : '<span class="badge badge-sm badge-ghost">Local</span>'}</td>
          <td><div class="flex items-center gap-1">${areaSel(c)}${c.area_fija ? `<button class="badge badge-xs badge-warning" data-soltar title="Volver a tomar el área de RRHH">fija ✕</button>` : ''}</div></td>
          <td><input type="checkbox" class="toggle toggle-sm toggle-secondary" data-admin ${c.es_admin ? 'checked' : ''} aria-label="Administrador"></td>
          <td><input type="checkbox" class="toggle toggle-sm toggle-success" data-activo ${c.activo ? 'checked' : ''} aria-label="Activo"></td>
          <td class="text-right">${c.origen === 'LOCAL' ? `<button class="btn btn-ghost btn-xs text-error" data-del aria-label="Eliminar">${icono('trash')}</button>` : ''}</td>
        </tr>`).join('')}</tbody></table></div>
    </div></section>`;

  const refrescar = async () => { await cargarCatalogos(); colaboradores(cont, esErp); };
  cont.querySelector('[data-add]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await intentar(() => api('colaboradores', { method: 'POST', body: { nombre: f.nombre.value.trim(), area: f.area.value } }), 'Colaborador agregado.'); } catch { return; }
    refrescar();
  };
  cont.querySelector('#btnSync')?.addEventListener('click', async (e) => {
    try {
      const r = await conSpinner(e.currentTarget, () => intentar(() => api('erp/sincronizar-colaboradores', { method: 'POST', body: {} })));
      toast(`RRHH: ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.desactivados} desactivados (${r.revisados} revisados).`);
    } catch { return; }
    refrescar();
  });
  cont.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const actualizar = async (body, msg = 'Guardado.') => {
      try { await intentar(() => api(`colaboradores/${id}`, { method: 'PUT', body }), msg); } catch { /* toast */ }
      refrescar();
    };
    tr.querySelector('[data-area]').onchange = (e) => actualizar({ area: e.target.value || null }, 'Área actualizada.');
    tr.querySelector('[data-soltar]')?.addEventListener('click', () => actualizar({ area_fija: false }, 'El área volverá a tomarse de RRHH en su próximo ingreso.'));
    tr.querySelector('[data-admin]').onchange = (e) => actualizar({ es_admin: e.target.checked });
    tr.querySelector('[data-activo]').onchange = (e) => actualizar({ activo: e.target.checked });
    tr.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmar('¿Eliminar este colaborador?', { ok: 'Eliminar', peligro: true }))) return;
      try { await intentar(() => api(`colaboradores/${id}`, { method: 'DELETE' }), 'Eliminado.'); } catch { return; }
      refrescar();
    });
  });
}

// ── Etapas ──────────────────────────────────────────────────────────────
function etapas(cont) {
  cont.innerHTML = `<div class="grid gap-4 md:grid-cols-2 max-w-3xl">${['MARKETING', 'PRODUCCION'].map((a) => `
    <section class="card bg-base-100 border border-base-300 shadow-sm"><div class="card-body p-4">
      <h2 class="card-title text-base">${AREA_TXT[a]}</h2>
      <ul class="steps steps-vertical">${store.cat.etapas.filter((e) => e.area === a).map((e) => `
        <li class="step ${e.es_final ? 'step-primary' : ''}">${esc(etiquetaEtapa(e.nombre))}${e.es_final ? ' <span class="badge badge-xs badge-primary ml-1">cuenta unidades</span>' : ''}</li>`).join('')}</ul>
    </div></section>`).join('')}</div>
    <p class="text-xs text-base-content/60 mt-3">Las etapas se configuran en la base de datos (tabla <code>etapa</code>).</p>`;
}

// ── Estado de la integración ────────────────────────────────────────────
async function integracion(cont) {
  let e;
  try { e = await api('erp/estado'); } catch (err) {
    cont.innerHTML = `<div role="alert" class="alert alert-error alert-soft">${esc(err.message)}</div>`;
    return;
  }
  const ok = (v, si = 'OK', no = 'No') => `<span class="badge badge-sm ${v ? 'badge-success' : 'badge-error'} badge-soft">${v ? si : no}</span>`;
  cont.innerHTML = `<section class="card bg-base-100 border border-base-300 shadow-sm max-w-3xl"><div class="card-body p-4 gap-3">
    <h2 class="card-title text-base">${icono('link')} Conexión con el ERP (RRHH + Inventario)</h2>
    <ul class="list bg-base-200/40 rounded-box">
      <li class="list-row"><div>Modo de sesión</div><div class="list-col-grow"></div><div>${e.modo_sesion === 'erp' ? '<span class="badge badge-sm badge-info">Sesión única con el ERP</span>' : '<span class="badge badge-sm badge-ghost">Local (sin ERP)</span>'}</div></li>
      <li class="list-row"><div>URL interna del ERP</div><div class="list-col-grow"></div><div class="text-xs"><code>${esc(e.erp_api || '— sin configurar —')}</code></div></li>
      <li class="list-row"><div>El ERP responde</div><div class="list-col-grow"></div><div>${ok(e.erp_responde?.ok, 'Sí', esc(e.erp_responde?.motivo || 'No'))}</div></li>
      <li class="list-row"><div>Secreto JWT compartido</div><div class="list-col-grow"></div><div>${ok(e.secreto_jwt, 'Configurado', 'Falta ERP_JWT_SECRET')}</div></li>
      <li class="list-row"><div>Cuenta de servicio (inventario)</div><div class="list-col-grow"></div>
        <div>${e.cuenta_servicio?.configurada ? ok(e.cuenta_servicio.ok !== false, 'Funciona', 'Rechazada') : '<span class="badge badge-sm badge-warning badge-soft">No configurada</span>'}</div></li>
    </ul>
    ${e.cuenta_servicio?.error ? `<div class="alert alert-error alert-soft text-sm">${esc(e.cuenta_servicio.error)}</div>` : ''}
    <div class="grid gap-3 sm:grid-cols-2 text-sm">
      <div><h3 class="font-semibold mb-1">Áreas del ERP → áreas aquí</h3>
        <ul class="text-xs space-y-1">${Object.entries(e.mapeo_areas || {}).map(([k, v]) => `<li><span class="badge badge-xs badge-primary">${AREA_TXT[k] || k}</span> si el área contiene: ${v.map((x) => `<code>${esc(x)}</code>`).join(', ')}</li>`).join('')}</ul></div>
      <div><h3 class="font-semibold mb-1">Roles del ERP</h3>
        <p class="text-xs">Administran aquí: ${e.roles_admin.map((r) => `<code>${esc(r)}</code>`).join(', ')}</p>
        <p class="text-xs">Registran consumos: ${e.roles_logistica.map((r) => `<code>${esc(r)}</code>`).join(', ')}</p></div>
    </div>
    <p class="text-xs text-base-content/60">Se cambia con las variables de entorno <code>ERP_MAPEO_AREAS</code>, <code>ERP_ROLES_ADMIN</code> y <code>ERP_ROLES_LOGISTICA</code>.</p>
  </div></section>`;
}
