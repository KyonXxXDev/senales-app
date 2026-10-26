import {
  api, store, esc, fmt, miniatura, options, intentar, toast, leerForm, abrirModal, icono, puede, vacio,
  cargando, conSpinner,
} from '../core.js';
import { selectorImagen } from './imagen-picker.js';

export default async function senales(el) {
  let lista = [];
  let q = '';
  let soloActivas = true;
  let soloSinStock = false;
  const gestiona = puede('senal.gestionar');
  const mueve = puede('stock.mover');

  el.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-bold flex items-center gap-2">${icono('boxes', 'size-5')}Señales y stock</h1>
        <p class="text-sm text-base-content/70">Catálogo de señales terminadas. El stock baja solo cuando un pedido lo usa; aquí registras entradas y ajustes.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <label class="input input-sm w-56">${icono('search', 'size-4 opacity-50')}<input type="search" id="busca" placeholder="Buscar señal"></label>
        <label class="label text-sm gap-2 cursor-pointer"><input type="checkbox" id="soloActivas" class="toggle toggle-sm" checked>Solo activas</label>
        <label class="label text-sm gap-2 cursor-pointer"><input type="checkbox" id="sinStock" class="toggle toggle-sm toggle-warning">Sin stock</label>
        ${gestiona ? `<button class="btn btn-primary btn-sm" id="btnNueva">${icono('plus')}Nueva señal</button>` : ''}
      </div>
    </div>
    <section class="card bg-base-100 border border-base-300 shadow-sm"><div class="overflow-x-auto" id="tabla">${cargando()}</div></section>`;

  const $ = (s) => el.querySelector(s);

  async function cargar() {
    lista = await api('senales');
    pintar();
  }

  function pintar() {
    const filas = lista.filter((s) => (!soloActivas || s.activo) && (!soloSinStock || s.stock === 0)
      && (!q || `${s.nombre} ${s.material} ${s.vinil}`.toLowerCase().includes(q)));
    $('#tabla').innerHTML = filas.length ? `<table class="table table-sm">
      <thead><tr><th>Señal</th><th>Material</th><th>Vinil</th><th>Medida</th><th class="num">m²</th><th class="num">Stock</th><th>Estado</th><th></th></tr></thead>
      <tbody>${filas.map((s) => `<tr class="hover:bg-base-200/60">
        <td><div class="flex items-center gap-3">${miniatura(s.imagen_url)}<span class="font-medium">${esc(s.nombre)}</span></div></td>
        <td>${esc(s.material)}</td><td>${esc(s.vinil)}</td>
        <td class="whitespace-nowrap">${fmt.medida(s.ancho_cm, s.alto_cm)}</td>
        <td class="num">${fmt.num(s.area_m2)}</td>
        <td class="num"><span class="font-semibold">${s.stock}</span>${s.stock === 0 ? ' <span class="badge badge-xs badge-warning badge-soft">sin stock</span>' : ''}</td>
        <td>${s.activo ? '<span class="badge badge-sm badge-success badge-soft">Activa</span>' : '<span class="badge badge-sm badge-ghost">Inactiva</span>'}</td>
        <td class="whitespace-nowrap text-right">
          ${mueve ? `<button class="btn btn-ghost btn-xs" data-mov="${s.id_senal}" title="Movimiento de stock">${icono('arrow-left-right')}</button>` : ''}
          <button class="btn btn-ghost btn-xs" data-kardex="${s.id_senal}" title="Kardex">${icono('rotate-ccw-clock')}</button>
          ${gestiona ? `<button class="btn btn-ghost btn-xs" data-edit="${s.id_senal}" title="Editar">${icono('pencil')}</button>` : ''}
        </td></tr>`).join('')}</tbody></table>` : vacio('No hay señales con esos filtros.', 'boxes');

    const buscar = (id) => lista.find((s) => String(s.id_senal) === id);
    el.querySelectorAll('[data-mov]').forEach((b) => { b.onclick = () => movimiento(buscar(b.dataset.mov)); });
    el.querySelectorAll('[data-kardex]').forEach((b) => { b.onclick = () => kardex(buscar(b.dataset.kardex)); });
    el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => formSenal(buscar(b.dataset.edit)); });
  }

  function formSenal(s = null) {
    const mats = store.cat.materiales.filter((m) => m.activo || m.id_material === s?.id_material);
    const vins = store.cat.viniles.filter((v) => v.activo || v.id_vinil === s?.id_vinil);
    const { body, foot, cerrar } = abrirModal({
      titulo: s ? `Editar señal · ${s.nombre}` : 'Nueva señal',
      cuerpo: `<form class="grid grid-cols-2 gap-x-3">
        <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Descripción *</legend>
          <input name="nombre" class="input w-full" required maxlength="150" value="${esc(s?.nombre || '')}"></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Material *</legend>
          <select name="id_material" class="select w-full">${options(mats, 'id_material', 'nombre', s?.id_material)}</select></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Vinil *</legend>
          <select name="id_vinil" class="select w-full">${options(vins, 'id_vinil', 'nombre', s?.id_vinil)}</select></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Ancho (cm) *</legend>
          <input type="number" name="ancho_cm" class="input w-full" min="0.1" step="0.1" required value="${s?.ancho_cm ?? ''}"></fieldset>
        <fieldset class="fieldset"><legend class="fieldset-legend">Alto (cm) *</legend>
          <input type="number" name="alto_cm" class="input w-full" min="0.1" step="0.1" required value="${s?.alto_cm ?? ''}"></fieldset>
        <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Imagen referencial</legend><div id="imgSenal"></div></fieldset>
        ${s
          ? `<label class="label col-span-2 mt-2 gap-2 cursor-pointer"><input type="checkbox" name="activo" class="toggle toggle-sm" ${s.activo ? 'checked' : ''}>Señal activa (disponible para pedidos)</label>`
          : `<fieldset class="fieldset"><legend class="fieldset-legend">Stock inicial</legend><input type="number" name="stock_inicial" class="input w-full" min="0" step="1" value="0"></fieldset>`}
      </form>`,
      pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icono('check')}Guardar</button>`,
    });
    const img = selectorImagen(body.querySelector('#imgSenal'), { valor: s?.imagen_url || '', subirAlElegir: false });

    foot.querySelector('[data-ok]').onclick = async (e) => {
      const form = body.querySelector('form');
      if (!form.reportValidity()) return;
      const f = leerForm(form);
      const fd = new FormData();
      for (const k of ['nombre', 'id_material', 'id_vinil', 'ancho_cm', 'alto_cm']) fd.append(k, f[k]);
      if (s) fd.append('activo', f.activo ? 'true' : 'false');
      else fd.append('stock_inicial', f.stock_inicial || '0');
      if (img.archivo()) fd.append('imagen', img.archivo());
      else fd.append('imagen_url', img.valor() || '');
      try {
        await conSpinner(e.currentTarget, () => intentar(
          () => (s ? api(`senales/${s.id_senal}`, { method: 'PUT', body: fd }) : api('senales', { method: 'POST', body: fd })),
          img.archivo() ? 'Señal guardada; imagen subida a SharePoint.' : 'Señal guardada.'));
      } catch { return; }
      cerrar();
      cargar();
    };
  }

  function movimiento(s) {
    const { body, foot, cerrar } = abrirModal({
      titulo: `Movimiento de stock · ${s.nombre}`, tamano: 'sm',
      cuerpo: `<div class="stats w-full bg-base-200/60 border border-base-300 mb-3"><div class="stat py-2"><div class="stat-title">Stock actual</div><div class="stat-value text-2xl">${s.stock}</div></div></div>
        <form class="grid grid-cols-2 gap-x-3">
          <fieldset class="fieldset"><legend class="fieldset-legend">Tipo</legend>
            <select name="tipo" class="select w-full"><option value="ENTRADA">Entrada (+)</option><option value="AJUSTE">Ajuste (+/−)</option></select></fieldset>
          <fieldset class="fieldset"><legend class="fieldset-legend">Cantidad</legend>
            <input type="number" name="cantidad" class="input w-full" step="1" required></fieldset>
          <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Motivo</legend>
            <input name="observacion" class="input w-full" maxlength="300" placeholder="Ej. excedente de producción, conteo físico…"></fieldset>
          <p class="col-span-2 text-xs text-base-content/60">Para restar usa <strong>Ajuste</strong> con cantidad negativa. Las salidas por pedido se registran solas.</p>
        </form>`,
      pie: `<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Registrar</button>`,
    });
    foot.querySelector('[data-ok]').onclick = async (e) => {
      const f = leerForm(body.querySelector('form'));
      const cantidad = parseInt(f.cantidad, 10);
      if (!cantidad) return toast('Ingresa una cantidad distinta de 0.', 'error');
      try {
        await conSpinner(e.currentTarget, () => intentar(() => api('stock/movimientos', { method: 'POST', body: {
          id_senal: s.id_senal, tipo: f.tipo, cantidad, observacion: f.observacion || null } }), 'Movimiento registrado.'));
      } catch { return; }
      cerrar();
      cargar();
    };
  }

  async function kardex(s) {
    const ref = abrirModal({ titulo: `Kardex · ${s.nombre}`, tamano: 'lg', cuerpo: cargando() });
    const movs = await api(`senales/${s.id_senal}/kardex`);
    const tipo = {
      ENTRADA: ['badge-success', 'Entrada'], SALIDA_PEDIDO: ['badge-warning', 'Salida a pedido'],
      DEVOLUCION: ['badge-info', 'Devolución'], AJUSTE: ['badge-ghost', 'Ajuste'],
    };
    ref.body.innerHTML = movs.length ? `<div class="overflow-x-auto"><table class="table table-sm">
      <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Saldo</th><th>Pedido</th><th>Colaborador</th><th>Motivo</th></tr></thead>
      <tbody>${movs.map((m) => `<tr><td class="whitespace-nowrap">${fmt.fechaHora(m.fecha)}</td>
        <td><span class="badge badge-sm badge-soft ${(tipo[m.tipo] || ['badge-ghost'])[0]}">${(tipo[m.tipo] || [0, m.tipo])[1]}</span></td>
        <td class="num ${m.cantidad > 0 ? 'text-success' : 'text-error'}">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td>
        <td class="num font-semibold">${m.saldo}</td><td>${m.id_pedido ? `<a class="link" href="#/pedido/${m.id_pedido}">#${m.id_pedido}</a>` : '—'}</td>
        <td>${esc(m.colaborador || '—')}</td><td class="text-xs">${esc(m.observacion || '')}</td></tr>`).join('')}</tbody></table></div>`
      : vacio('Sin movimientos.', 'rotate-ccw-clock');
    ref.body.querySelectorAll('a[href^="#/pedido"]').forEach((a) => a.addEventListener('click', () => ref.cerrar()));
  }

  $('#busca').oninput = (e) => { q = e.target.value.trim().toLowerCase(); pintar(); };
  $('#soloActivas').onchange = (e) => { soloActivas = e.target.checked; pintar(); };
  $('#sinStock').onchange = (e) => { soloSinStock = e.target.checked; pintar(); };
  $('#btnNueva')?.addEventListener('click', () => formSenal());
  await cargar();
}
