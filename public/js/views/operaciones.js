import {
  api, store, esc, fmt, badge, prioridad, progreso, miniatura, options, intentar, toast, leerForm,
  abrirModal, cargarCatalogos, icono, puede, vacio, cargando, conSpinner,
} from '../core.js';
import { verPedido } from './pedido-modal.js';
import { selectorImagen } from './imagen-picker.js';

export default async function operaciones(el) {
  const gestiona = puede('pedido.gestionar');
  let senales = gestiona ? await api('senales?activos=1') : [];
  let borrador = [];
  let modo = 'catalogo';
  const filtros = { estado: '', prioridad: '', q: '' };
  let pedidos = [];

  const matActivos = store.cat.materiales.filter((m) => m.activo);
  const vinActivos = store.cat.viniles.filter((v) => v.activo);

  el.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div>
        <h1 class="text-xl font-bold">Operaciones</h1>
        <p class="text-sm text-base-content/70">Registra pedidos de señales. Lo que haya en stock se asigna solo; lo demás pasa a Marketing y Producción.</p>
      </div>
    </div>
    <div class="grid gap-4 ${gestiona ? 'xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]' : ''}">
      ${gestiona ? `
      <div class="flex flex-col gap-4">
        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 gap-3">
            <h2 class="card-title text-base"><span class="badge badge-primary badge-sm">1</span> Datos del pedido</h2>
            <form id="fPedido" class="grid grid-cols-2 gap-x-3" autocomplete="off">
              <fieldset class="fieldset col-span-2">
                <legend class="fieldset-legend">Cliente / tienda *</legend>
                <div class="join w-full">
                  <select name="id_cliente" id="selCliente" class="select join-item w-full" required></select>
                  <button type="button" class="btn join-item" id="btnNuevoCliente" title="Nuevo cliente">${icono('plus')}</button>
                </div>
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Prioridad *</legend>
                <select name="prioridad" class="select w-full">
                  <option value="BAJA">Baja / normal</option><option value="MEDIA">Media</option><option value="ALTA">Alta / urgente</option>
                </select>
              </fieldset>
              <fieldset class="fieldset">
                <legend class="fieldset-legend">Fecha requerida</legend>
                <input type="date" name="fecha_requerida" class="input w-full">
              </fieldset>
              <fieldset class="fieldset col-span-2">
                <legend class="fieldset-legend">Observación</legend>
                <textarea name="observacion" class="textarea w-full" rows="2" maxlength="2000" placeholder="Opcional"></textarea>
              </fieldset>
            </form>
          </div>
        </section>

        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 gap-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <h2 class="card-title text-base"><span class="badge badge-primary badge-sm">2</span> Agregar señal</h2>
              <div role="tablist" class="tabs tabs-box tabs-sm">
                <button type="button" role="tab" class="tab tab-active" data-modo="catalogo">Del catálogo</button>
                <button type="button" role="tab" class="tab" data-modo="nueva">Señal nueva</button>
              </div>
            </div>
            <form id="fLinea" class="flex flex-col gap-2" autocomplete="off">
              <div id="modoCatalogo" class="flex flex-col gap-2">
                <label class="input input-sm w-full">${icono('search', 'size-4 opacity-50')}
                  <input type="search" id="buscaSenal" placeholder="Buscar por nombre, material o vinil"></label>
                <div id="listaSenales" class="max-h-64 overflow-y-auto rounded-box border border-base-300 divide-y divide-base-300" role="listbox" aria-label="Señales del catálogo"></div>
              </div>
              <div id="modoNueva" class="hidden grid grid-cols-2 gap-x-3">
                <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Descripción *</legend>
                  <input name="nombre" class="input w-full" maxlength="150" placeholder="Ej. Salida de emergencia (derecha)"></fieldset>
                <fieldset class="fieldset"><legend class="fieldset-legend">Material *</legend>
                  <select name="id_material" class="select w-full">${options(matActivos, 'id_material', 'nombre')}</select></fieldset>
                <fieldset class="fieldset"><legend class="fieldset-legend">Vinil *</legend>
                  <select name="id_vinil" class="select w-full">${options(vinActivos, 'id_vinil', 'nombre')}</select></fieldset>
                <fieldset class="fieldset"><legend class="fieldset-legend">Ancho (cm) *</legend>
                  <input type="number" name="ancho_cm" class="input w-full" min="0.1" step="0.1"></fieldset>
                <fieldset class="fieldset"><legend class="fieldset-legend">Alto (cm) *</legend>
                  <input type="number" name="alto_cm" class="input w-full" min="0.1" step="0.1"></fieldset>
                <fieldset class="fieldset col-span-2"><legend class="fieldset-legend">Imagen referencial</legend>
                  <div id="imgNueva"></div></fieldset>
                <p class="col-span-2 text-xs text-base-content/60">Si ya existe una señal igual (nombre, material, vinil y medidas) se reutiliza con su stock.</p>
              </div>
              <div class="flex items-end gap-2">
                <fieldset class="fieldset flex-1"><legend class="fieldset-legend">Cantidad *</legend>
                  <input type="number" name="cantidad" class="input w-full" min="1" step="1" value="1" required></fieldset>
                <button class="btn btn-secondary" type="submit">${icono('plus')}Agregar</button>
              </div>
            </form>
          </div>
        </section>
      </div>` : ''}

      <div class="flex flex-col gap-4 min-w-0">
        ${gestiona ? `
        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 gap-3">
            <div class="flex items-center justify-between gap-2">
              <h2 class="card-title text-base"><span class="badge badge-primary badge-sm">3</span> Borrador del pedido</h2>
              <span class="text-sm text-base-content/60" id="totBorrador"></span>
            </div>
            <div id="tablaBorrador" class="overflow-x-auto"></div>
            <div class="card-actions justify-between">
              <button class="btn btn-ghost btn-sm" id="btnVaciar">${icono('trash')}Vaciar</button>
              <button class="btn btn-primary" id="btnConfirmar">${icono('check')}Confirmar y enviar pedido</button>
            </div>
          </div>
        </section>` : ''}

        <section class="card bg-base-100 border border-base-300 shadow-sm">
          <div class="card-body p-4 gap-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <h2 class="card-title text-base">${icono('clipboard-list')} Pedidos registrados</h2>
              <div class="flex flex-wrap gap-2">
                <label class="input input-sm w-44">${icono('search', 'size-4 opacity-50')}<input type="search" id="fBuscar" placeholder="Cliente o #"></label>
                <select id="fEstado" class="select select-sm w-auto" aria-label="Estado">
                  <option value="">Todos los estados</option><option value="PENDIENTE">Pendiente</option><option value="EN PROCESO">En proceso</option>
                  <option value="LISTO PARA ENTREGA">Listo para entrega</option><option value="ENTREGADO">Entregado</option></select>
                <select id="fPrioridad" class="select select-sm w-auto" aria-label="Prioridad">
                  <option value="">Todas las prioridades</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option></select>
              </div>
            </div>
            <div id="tablaPedidos" class="overflow-x-auto">${cargando()}</div>
          </div>
        </section>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);

  // ── Lista de pedidos ──────────────────────────────────────────────────
  async function cargarPedidos() {
    const qs = new URLSearchParams(Object.entries({ estado: filtros.estado, prioridad: filtros.prioridad }).filter(([, v]) => v));
    pedidos = await api('pedidos' + (qs.toString() ? '?' + qs : ''));
    pintarPedidos();
  }

  function pintarPedidos() {
    const q = filtros.q.toLowerCase();
    const lista = pedidos.filter((p) => !q || p.cliente.toLowerCase().includes(q) || String(p.id_pedido) === q.replace('#', ''));
    $('#tablaPedidos').innerHTML = lista.length ? `
      <table class="table table-sm">
        <thead><tr><th>#</th><th>Cliente</th><th>Prioridad</th><th>Registrado</th><th>Requerido</th><th class="num">Unid.</th><th class="min-w-28">Avance</th><th>Estado</th></tr></thead>
        <tbody>${lista.map((p) => `
          <tr class="hover:bg-base-200 cursor-pointer" data-id="${p.id_pedido}" tabindex="0">
            <td class="font-semibold">#${p.id_pedido}</td>
            <td><div class="flex items-center gap-1.5">${esc(p.cliente)}
              ${p.cantidad_editada ? `<span class="tooltip" data-tip="${p.lineas_editadas} línea(s) con cantidad editada (original ${p.unidades_originales} u.)"><span class="badge badge-xs badge-warning gap-1">${icono('file-pen', 'size-3')}Editado</span></span>` : ''}</div></td>
            <td>${prioridad(p.prioridad)}</td>
            <td class="whitespace-nowrap text-sm">${fmt.fechaHora(p.fecha_pedido)}</td>
            <td class="whitespace-nowrap text-sm">${fmt.fecha(p.fecha_requerida)}</td>
            <td class="num">${p.unidades}</td>
            <td><div class="text-xs mb-1">${p.lineas_finalizadas}/${p.lineas} líneas</div>${progreso(p.avance_pct, 'progress-xs h-1.5')}</td>
            <td>${badge(p.estado_pedido)}</td>
          </tr>`).join('')}</tbody>
      </table>` : vacio('No hay pedidos con esos filtros.', 'clipboard-list');
    el.querySelectorAll('#tablaPedidos tr[data-id]').forEach((tr) => {
      const abrir = () => verPedido(Number(tr.dataset.id), cargarPedidos);
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  }

  $('#fEstado').onchange = (e) => { filtros.estado = e.target.value; cargarPedidos(); };
  $('#fPrioridad').onchange = (e) => { filtros.prioridad = e.target.value; cargarPedidos(); };
  $('#fBuscar').oninput = (e) => { filtros.q = e.target.value.trim(); pintarPedidos(); };

  if (!gestiona) {
    await cargarPedidos();
    return undefined;
  }

  // ── Clientes ──────────────────────────────────────────────────────────
  const pintarClientes = (sel) => {
    $('#selCliente').innerHTML = options(store.cat.clientes.filter((c) => c.activo), 'id_cliente', 'nombre', sel, { placeholder: '— Selecciona —' });
  };
  pintarClientes();
  $('#btnNuevoCliente').onclick = () => {
    const { body, foot, cerrar } = abrirModal({
      titulo: 'Nuevo cliente', tamano: 'sm',
      cuerpo: `<form><fieldset class="fieldset"><legend class="fieldset-legend">Nombre del cliente o tienda</legend>
        <input name="nombre" class="input w-full" required maxlength="120" autofocus></fieldset></form>`,
      pie: '<button class="btn btn-ghost" data-close>Cancelar</button><button class="btn btn-primary" data-ok>Guardar</button>',
    });
    const guardar = async (e) => {
      e?.preventDefault();
      const nombre = body.querySelector('[name=nombre]').value.trim();
      if (!nombre) return;
      const c = await intentar(() => api('clientes', { method: 'POST', body: { nombre } }), 'Cliente creado.');
      await cargarCatalogos();
      pintarClientes(c.id_cliente);
      cerrar();
    };
    body.querySelector('form').onsubmit = guardar;
    foot.querySelector('[data-ok]').onclick = guardar;
  };

  // ── Selección de señal ────────────────────────────────────────────────
  let seleccion = null;
  function pintarSenales() {
    const q = $('#buscaSenal').value.trim().toLowerCase();
    const lista = senales.filter((s) => !q || `${s.nombre} ${s.material} ${s.vinil}`.toLowerCase().includes(q)).slice(0, 80);
    $('#listaSenales').innerHTML = lista.map((s) => `
      <button type="button" role="option" class="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-base-200 ${seleccion === s.id_senal ? 'bg-primary/10' : ''}"
        data-senal="${s.id_senal}" aria-selected="${seleccion === s.id_senal}">
        ${miniatura(s.imagen_url)}
        <span class="min-w-0 flex-1"><span class="block text-sm font-medium truncate">${esc(s.nombre)}</span>
          <span class="block text-xs text-base-content/60 truncate">${fmt.medida(s.ancho_cm, s.alto_cm)} · ${esc(s.material)} · ${esc(s.vinil)}</span></span>
        <span class="badge badge-sm ${s.stock > 0 ? 'badge-success' : 'badge-ghost'} badge-soft whitespace-nowrap">stock ${s.stock}</span>
      </button>`).join('') || vacio('Sin resultados. Usa “Señal nueva”.', 'search');
    el.querySelectorAll('[data-senal]').forEach((b) => b.addEventListener('click', () => {
      seleccion = Number(b.dataset.senal);
      pintarSenales();
    }));
  }
  pintarSenales();
  $('#buscaSenal').addEventListener('input', pintarSenales);

  const img = selectorImagen($('#imgNueva'), { subirAlElegir: true, nombreSugerido: () => $('#fLinea [name=nombre]').value || 'senal' });

  el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
    modo = b.dataset.modo;
    el.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('tab-active', x === b));
    $('#modoCatalogo').classList.toggle('hidden', modo !== 'catalogo');
    $('#modoNueva').classList.toggle('hidden', modo !== 'nueva');
  }));

  // ── Borrador ──────────────────────────────────────────────────────────
  $('#fLinea').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = leerForm(e.target);
    const cantidad = parseInt(f.cantidad, 10);
    if (!(cantidad > 0)) return toast('La cantidad debe ser mayor a 0.', 'error');

    if (modo === 'catalogo') {
      const s = senales.find((x) => x.id_senal === seleccion);
      if (!s) return toast('Selecciona una señal del catálogo.', 'error');
      const existente = borrador.find((b) => b.id_senal === s.id_senal);
      if (existente) existente.cantidad += cantidad;
      else borrador.push({ key: 's' + s.id_senal, id_senal: s.id_senal, nombre: s.nombre, material: s.material, vinil: s.vinil,
        ancho: s.ancho_cm, alto: s.alto_cm, imagen: s.imagen_url, stock: s.stock, cantidad });
    } else {
      const ancho = parseFloat(f.ancho_cm), alto = parseFloat(f.alto_cm);
      if (!f.nombre?.trim() || !(ancho > 0) || !(alto > 0)) return toast('Completa descripción, ancho y alto.', 'error');
      const mat = matActivos.find((m) => String(m.id_material) === f.id_material);
      const vin = vinActivos.find((v) => String(v.id_vinil) === f.id_vinil);
      const imagen = img.valor();
      const igual = senales.find((s) => s.nombre.toLowerCase() === f.nombre.trim().toLowerCase()
        && s.id_material === mat.id_material && s.id_vinil === vin.id_vinil
        && ((s.ancho_cm === ancho && s.alto_cm === alto) || (s.ancho_cm === alto && s.alto_cm === ancho)));
      borrador.push({
        key: 'n' + Date.now(),
        ...(igual ? { id_senal: igual.id_senal } : { nueva_senal: { nombre: f.nombre.trim(), id_material: mat.id_material,
          id_vinil: vin.id_vinil, ancho_cm: ancho, alto_cm: alto, imagen_url: imagen } }),
        nombre: f.nombre.trim(), material: mat.nombre, vinil: vin.nombre, ancho, alto,
        imagen, stock: igual ? igual.stock : 0, cantidad,
      });
      e.target.reset();
      img.limpiar();
    }
    e.target.querySelector('[name=cantidad]').value = 1;
    pintarBorrador();
  });

  function pintarBorrador() {
    const total = borrador.reduce((a, b) => a + b.cantidad, 0);
    $('#totBorrador').textContent = borrador.length ? `${borrador.length} señales · ${total} unidades` : '';
    $('#btnConfirmar').disabled = !borrador.length;
    if (!borrador.length) {
      $('#tablaBorrador').innerHTML = vacio('Agrega señales desde el paso 2.', 'package');
      return;
    }
    $('#tablaBorrador').innerHTML = `<table class="table table-sm">
      <thead><tr><th>Señal</th><th>Medida</th><th class="w-24">Cantidad</th><th>Estimado</th><th></th></tr></thead>
      <tbody>${borrador.map((b) => {
        const deStock = Math.min(b.stock, b.cantidad);
        const prod = b.cantidad - deStock;
        return `<tr>
          <td><div class="flex items-center gap-3">${miniatura(b.imagen)}<div class="min-w-0"><div class="font-medium">${esc(b.nombre)}</div>
            <div class="text-xs text-base-content/60">${esc(b.material)} · ${esc(b.vinil)}${b.nueva_senal ? ' · <span class="badge badge-xs badge-info badge-soft">nueva</span>' : ''}</div></div></div></td>
          <td class="whitespace-nowrap text-sm">${fmt.medida(b.ancho, b.alto)}</td>
          <td><input type="number" min="1" step="1" value="${b.cantidad}" class="input input-sm w-20" data-cant="${b.key}" aria-label="Cantidad"></td>
          <td class="text-xs">${deStock ? `<span class="badge badge-xs badge-success badge-soft">${deStock} de stock</span> ` : ''}${prod ? `<span class="badge badge-xs badge-warning badge-soft">${prod} a producir</span>` : ''}</td>
          <td class="text-right"><button class="btn btn-ghost btn-xs text-error" data-quitar="${b.key}" aria-label="Quitar">${icono('x')}</button></td></tr>`;
      }).join('')}</tbody></table>`;
    el.querySelectorAll('[data-cant]').forEach((i) => i.addEventListener('change', () => {
      const b = borrador.find((x) => x.key === i.dataset.cant);
      const v = parseInt(i.value, 10);
      if (v > 0) b.cantidad = v; else i.value = b.cantidad;
      pintarBorrador();
    }));
    el.querySelectorAll('[data-quitar]').forEach((btn) => btn.addEventListener('click', () => {
      borrador = borrador.filter((x) => x.key !== btn.dataset.quitar);
      pintarBorrador();
    }));
  }
  pintarBorrador();

  $('#btnVaciar').onclick = () => { borrador = []; pintarBorrador(); };

  $('#btnConfirmar').onclick = async (e) => {
    const form = $('#fPedido');
    const f = leerForm(form);
    if (!f.id_cliente) { form.reportValidity(); return toast('Selecciona el cliente.', 'error'); }
    const body = {
      id_cliente: Number(f.id_cliente), prioridad: f.prioridad, fecha_requerida: f.fecha_requerida || null,
      observacion: f.observacion || null,
      lineas: borrador.map((b) => (b.id_senal ? { id_senal: b.id_senal, cantidad: b.cantidad } : { nueva_senal: b.nueva_senal, cantidad: b.cantidad })),
    };
    try {
      const p = await conSpinner(e.currentTarget, () => intentar(() => api('pedidos', { method: 'POST', body })));
      toast(`Pedido #${p.id_pedido} registrado: ${p.unidades_desde_stock} de stock, ${p.unidades_a_producir} a producir.`);
      borrador = [];
      form.reset();
      pintarBorrador();
      senales = await api('senales?activos=1');
      pintarSenales();
      cargarPedidos();
    } catch { /* toast ya mostrado */ }
  };

  await cargarPedidos();
  return undefined;
}
