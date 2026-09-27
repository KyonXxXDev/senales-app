import {
  api, store, esc, fmt, badge, prioridad, progreso, miniatura, options, intentar, toast, leerForm,
  abrirModal, cerrarModal, cargarCatalogos,
} from '../core.js';
import { verPedido } from './pedido-modal.js';

export default async function operaciones(el) {
  let senales = await api('/senales?activos=1');
  let borrador = []; // { key, id_senal?, nueva_senal?, nombre, material, vinil, ancho, alto, imagen, stock, cantidad }
  let modo = 'catalogo';
  let filtros = { estado: '', prioridad: '' };

  const cat = store.cat;
  const matActivos = cat.materiales.filter((m) => m.activo);
  const vinActivos = cat.viniles.filter((v) => v.activo);

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Operaciones</h1><p>Registra pedidos de señales. Lo que haya en stock se asigna solo; lo demás pasa a Marketing y Producción.</p></div>
    </div>
    <div class="grid grid-side">
      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>1. Datos del pedido</h2></div>
          <form class="card-body fields" id="fPedido" autocomplete="off">
            <label class="field full">Cliente / tienda *
              <div class="row"><select name="id_cliente" id="selCliente" required style="flex:1"></select>
              <button type="button" class="btn secondary sm" id="btnNuevoCliente">+ Nuevo</button></div>
            </label>
            <label class="field">Prioridad *
              <select name="prioridad">
                <option value="BAJA">Baja / normal</option><option value="MEDIA">Media</option><option value="ALTA">Alta / urgente</option>
              </select></label>
            <label class="field">Fecha requerida<input type="date" name="fecha_requerida"></label>
            <label class="field full">Observación<textarea name="observacion" maxlength="2000" placeholder="Opcional"></textarea></label>
          </form>
        </section>

        <section class="card">
          <div class="card-head"><h2>2. Agregar señal</h2>
            <div class="seg" role="tablist">
              <button type="button" data-modo="catalogo" class="on">Del catálogo</button>
              <button type="button" data-modo="nueva">Señal nueva</button>
            </div>
          </div>
          <form class="card-body stack" id="fLinea" autocomplete="off">
            <div id="modoCatalogo" class="stack">
              <label class="field">Buscar señal<input type="search" id="buscaSenal" placeholder="Nombre, material, vinil…"></label>
              <label class="field">Señal *<select id="selSenal" size="6"></select></label>
              <div id="infoSenal" class="hint hidden"></div>
            </div>
            <div id="modoNueva" class="fields hidden">
              <label class="field full">Descripción *<input name="nombre" maxlength="150" placeholder="Ej. Salida de emergencia (derecha)"></label>
              <label class="field">Material *<select name="id_material">${options(matActivos, 'id_material', 'nombre')}</select></label>
              <label class="field">Vinil *<select name="id_vinil">${options(vinActivos, 'id_vinil', 'nombre')}</select></label>
              <label class="field">Ancho (cm) *<input type="number" name="ancho_cm" min="0.1" step="0.1"></label>
              <label class="field">Alto (cm) *<input type="number" name="alto_cm" min="0.1" step="0.1"></label>
              <div class="field full image-picker-wrap">
                <label class="field" style="margin-bottom:6px">Imagen referencial</label>
                <div class="seg image-source-seg">
                  <button type="button" class="on" id="btnModoPCOpe">📁 Archivo de PC</button>
                  <button type="button" id="btnModoURLOpe">🌐 URL de la web</button>
                </div>
                <div id="secImgPCOpe">
                  <div class="dropzone-box" id="dropzoneBoxOpe">
                    <input type="file" id="inputFotoOpe" accept="image/*" class="file-hidden-input">
                    <div class="dropzone-prompt">
                      <span class="dropzone-icon">📷</span>
                      <strong>Seleccionar archivo del PC</strong>
                      <span class="muted small">Se guardará automáticamente en SharePoint</span>
                    </div>
                  </div>
                  <div id="spUploadingOpe" class="sp-uploading-msg hidden">
                    <span class="spinner-sm"></span> Subiendo a SharePoint...
                  </div>
                  <div id="previewPCOpe" class="preview-container hidden">
                    <img id="imgThumbPCOpe" class="preview-img" src="" alt="Vista previa">
                    <div class="preview-meta">
                      <strong id="labelNombrePCOpe">Archivo</strong>
                      <span class="badge-sp">☁ SharePoint</span>
                    </div>
                    <button type="button" class="btn ghost danger sm" id="btnQuitarImgOpe" title="Quitar">✕</button>
                  </div>
                </div>
                <div id="secImgURLOpe" class="hidden">
                  <label class="field">URL directa de la imagen
                    <input type="url" id="inputUrlOpe" placeholder="https://… o enlace web">
                  </label>
                </div>
                <input type="hidden" name="imagen_url" id="hiddenImagenUrlOpe" value="">
              </div>
              <p class="muted small full">Si ya existe una señal igual (mismo nombre, material, vinil y medidas), se reutiliza con su stock.</p>
            </div>
            <label class="field">Cantidad *<input type="number" name="cantidad" min="1" step="1" value="1" required></label>
            <button class="btn secondary" type="submit">Agregar al borrador</button>
          </form>
        </section>
      </div>

      <div class="stack">
        <section class="card">
          <div class="card-head"><h2>3. Borrador del pedido</h2><span class="muted" id="totBorrador"></span></div>
          <div class="card-body flush table-wrap" id="tablaBorrador"></div>
          <div class="card-body row" style="border-top:1px solid var(--line)">
            <button class="btn ghost" id="btnVaciar">Vaciar</button><span class="spacer"></span>
            <button class="btn" id="btnConfirmar">Confirmar y enviar pedido</button>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Pedidos registrados</h2>
            <div class="row">
              <select id="fEstado" aria-label="Filtrar por estado">
                <option value="">Todos los estados</option><option>PENDIENTE</option><option>EN PROCESO</option>
                <option>LISTO PARA ENTREGA</option><option>ENTREGADO</option></select>
              <select id="fPrioridad" aria-label="Filtrar por prioridad">
                <option value="">Todas las prioridades</option><option value="ALTA">Alta</option><option value="MEDIA">Media</option><option value="BAJA">Baja</option></select>
            </div>
          </div>
          <div class="card-body flush table-wrap" id="tablaPedidos"></div>
        </section>
      </div>
    </div>`;

  const $ = (s) => el.querySelector(s);

  // ---------- Clientes ----------
  function pintarClientes(sel) {
    $('#selCliente').innerHTML = options(store.cat.clientes.filter((c) => c.activo), 'id_cliente', 'nombre', sel,
      { placeholder: '— Selecciona —' });
  }
  pintarClientes();
  $('#btnNuevoCliente').onclick = () => {
    const { body, foot } = abrirModal({
      titulo: 'Nuevo cliente', estrecho: true,
      cuerpo: '<form id="fCli"><label class="field">Nombre de cliente o tienda<input name="nombre" required maxlength="120" autofocus></label></form>',
      pie: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok>Guardar</button>',
    });
    const guardar = async (e) => {
      e?.preventDefault();
      const nombre = body.querySelector('[name=nombre]').value.trim();
      if (!nombre) return;
      const c = await intentar(() => api('/clientes', { method: 'POST', body: { nombre } }), 'Cliente creado.');
      await cargarCatalogos();
      pintarClientes(c.id_cliente);
      cerrarModal();
    };
    body.querySelector('form').onsubmit = guardar;
    foot.querySelector('[data-ok]').onclick = guardar;
  };

  // ---------- Selección de señal ----------
  function pintarSenales() {
    const q = $('#buscaSenal').value.trim().toLowerCase();
    const lista = senales.filter((s) => !q || `${s.nombre} ${s.material} ${s.vinil}`.toLowerCase().includes(q));
    $('#selSenal').innerHTML = lista.map((s) =>
      `<option value="${s.id_senal}">${esc(s.nombre)} — ${fmt.medida(s.ancho_cm, s.alto_cm)} · ${esc(s.material)} · ${esc(s.vinil)} (stock ${s.stock})</option>`).join('')
      || '<option disabled>Sin resultados</option>';
    $('#infoSenal').classList.add('hidden');
  }
  pintarSenales();
  $('#buscaSenal').addEventListener('input', pintarSenales);
  $('#selSenal').addEventListener('change', () => {
    const s = senales.find((x) => String(x.id_senal) === $('#selSenal').value);
    if (!s) return;
    const info = $('#infoSenal');
    info.innerHTML = `<div class="senal-cell">${miniatura(s.imagen_url || s.imagen_referencial)}<div><strong>${esc(s.nombre)}</strong>
      ${fmt.medida(s.ancho_cm, s.alto_cm)} · ${esc(s.material)} · ${esc(s.vinil)}<br>
      Stock disponible: <strong>${s.stock}</strong></div></div>`;
    info.classList.remove('hidden');
  });

  el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
    modo = b.dataset.modo;
    el.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('on', x === b));
    $('#modoCatalogo').classList.toggle('hidden', modo !== 'catalogo');
    $('#modoNueva').classList.toggle('hidden', modo !== 'nueva');
  }));

  // ---------- Selector de Imagen en Modo Nueva Señal ----------
  let modoImgOpe = 'pc';
  const btnModoPCOpe = $('#btnModoPCOpe');
  const btnModoURLOpe = $('#btnModoURLOpe');
  const secImgPCOpe = $('#secImgPCOpe');
  const secImgURLOpe = $('#secImgURLOpe');
  const dropzoneBoxOpe = $('#dropzoneBoxOpe');
  const inputFotoOpe = $('#inputFotoOpe');
  const spUploadingOpe = $('#spUploadingOpe');
  const previewPCOpe = $('#previewPCOpe');
  const imgThumbPCOpe = $('#imgThumbPCOpe');
  const labelNombrePCOpe = $('#labelNombrePCOpe');
  const btnQuitarImgOpe = $('#btnQuitarImgOpe');
  const inputUrlOpe = $('#inputUrlOpe');
  const hiddenImagenUrlOpe = $('#hiddenImagenUrlOpe');

  btnModoPCOpe.onclick = () => {
    modoImgOpe = 'pc';
    btnModoPCOpe.classList.add('on');
    btnModoURLOpe.classList.remove('on');
    secImgPCOpe.classList.remove('hidden');
    secImgURLOpe.classList.add('hidden');
  };

  btnModoURLOpe.onclick = () => {
    modoImgOpe = 'url';
    btnModoURLOpe.classList.add('on');
    btnModoPCOpe.classList.remove('on');
    secImgURLOpe.classList.remove('hidden');
    secImgPCOpe.classList.add('hidden');
  };

  async function subirFotoSharePointOpe(file) {
    if (!file) return;
    try {
      spUploadingOpe.classList.remove('hidden');
      previewPCOpe.classList.add('hidden');
      const fd = new FormData();
      fd.append('imagen', file);
      const res = await api('/senales/upload-sharepoint', { method: 'POST', body: fd });
      hiddenImagenUrlOpe.value = res.webUrl || res.url;
      imgThumbPCOpe.src = res.webUrl || res.url;
      labelNombrePCOpe.textContent = file.name;
      previewPCOpe.classList.remove('hidden');
      toast('Imagen subida a SharePoint correctamente.');
    } catch (err) {
      toast('Error al subir imagen a SharePoint: ' + (err.message || 'Error desconocido'), 'error');
    } finally {
      spUploadingOpe.classList.add('hidden');
    }
  }

  inputFotoOpe.onchange = (e) => {
    const file = e.target.files?.[0];
    if (file) subirFotoSharePointOpe(file);
  };

  dropzoneBoxOpe.ondragover = (e) => { e.preventDefault(); dropzoneBoxOpe.classList.add('dragover'); };
  dropzoneBoxOpe.ondragleave = () => { dropzoneBoxOpe.classList.remove('dragover'); };
  dropzoneBoxOpe.ondrop = (e) => {
    e.preventDefault();
    dropzoneBoxOpe.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      subirFotoSharePointOpe(file);
    } else {
      toast('Arrastra un archivo de imagen válido.', 'error');
    }
  };

  btnQuitarImgOpe.onclick = () => {
    inputFotoOpe.value = '';
    hiddenImagenUrlOpe.value = '';
    previewPCOpe.classList.add('hidden');
  };

  inputUrlOpe.oninput = () => {
    hiddenImagenUrlOpe.value = inputUrlOpe.value.trim();
  };

  // ---------- Borrador ----------
  $('#fLinea').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = leerForm(e.target);
    const cantidad = parseInt(f.cantidad, 10);
    if (!(cantidad > 0)) return toast('La cantidad debe ser mayor a 0.', 'error');

    if (modo === 'catalogo') {
      const s = senales.find((x) => String(x.id_senal) === $('#selSenal').value);
      if (!s) return toast('Selecciona una señal del catálogo.', 'error');
      const imgSenal = s.imagen_url || s.imagen_referencial || null;
      const existente = borrador.find((b) => b.id_senal === s.id_senal);
      if (existente) existente.cantidad += cantidad;
      else borrador.push({ key: 's' + s.id_senal, id_senal: s.id_senal, nombre: s.nombre, material: s.material,
        vinil: s.vinil, ancho: s.ancho_cm, alto: s.alto_cm, imagen: imgSenal, stock: s.stock, cantidad });
    } else {
      const ancho = parseFloat(f.ancho_cm), alto = parseFloat(f.alto_cm);
      if (!f.nombre.trim() || !(ancho > 0) || !(alto > 0)) return toast('Completa descripción, ancho y alto.', 'error');
      const mat = matActivos.find((m) => String(m.id_material) === f.id_material);
      const vin = vinActivos.find((v) => String(v.id_vinil) === f.id_vinil);
      const imgFinal = hiddenImagenUrlOpe.value.trim() || f.imagen_url || null;

      // Si coincide con una señal existente, se usa esa (con su stock)
      const igual = senales.find((s) => s.nombre.toLowerCase() === f.nombre.trim().toLowerCase()
        && s.id_material === mat.id_material && s.id_vinil === vin.id_vinil
        && ((s.ancho_cm === ancho && s.alto_cm === alto) || (s.ancho_cm === alto && s.alto_cm === ancho)));
      borrador.push({
        key: 'n' + Date.now(),
        ...(igual ? { id_senal: igual.id_senal } : { nueva_senal: { nombre: f.nombre.trim(), id_material: mat.id_material,
          id_vinil: vin.id_vinil, ancho_cm: ancho, alto_cm: alto, imagen_url: imgFinal, imagen_referencial: imgFinal } }),
        nombre: f.nombre.trim(), material: mat.nombre, vinil: vin.nombre, ancho, alto,
        imagen: imgFinal, stock: igual ? igual.stock : 0, cantidad,
      });
      e.target.reset();
      hiddenImagenUrlOpe.value = '';
      previewPCOpe.classList.add('hidden');
    }
    e.target.querySelector('[name=cantidad]').value = 1;
    pintarBorrador();
  });

  function pintarBorrador() {
    const total = borrador.reduce((a, b) => a + b.cantidad, 0);
    $('#totBorrador').textContent = `${borrador.length} señales · ${total} unidades`;
    $('#btnConfirmar').disabled = !borrador.length;
    if (!borrador.length) {
      $('#tablaBorrador').innerHTML = '<div class="empty">Agrega señales desde el panel de la izquierda.</div>';
      return;
    }
    $('#tablaBorrador').innerHTML = `<table>
      <thead><tr><th>Señal</th><th>Medida</th><th class="num">Cantidad</th><th>Estimado</th><th></th></tr></thead>
      <tbody>${borrador.map((b) => {
        const deStock = Math.min(b.stock, b.cantidad);
        return `<tr>
          <td><div class="senal-cell">${miniatura(b.imagen)}<div><strong>${esc(b.nombre)}</strong>
            <span class="muted small">${esc(b.material)} · ${esc(b.vinil)}${b.nueva_senal ? ' · <em>nueva</em>' : ''}</span></div></div></td>
          <td class="nowrap">${fmt.medida(b.ancho, b.alto)}</td>
          <td class="num"><input type="number" min="1" step="1" value="${b.cantidad}" data-cant="${b.key}" aria-label="Cantidad"></td>
          <td class="small">${deStock ? `${deStock} de stock` : ''}${deStock && b.cantidad - deStock ? ' · ' : ''}${b.cantidad - deStock ? `${b.cantidad - deStock} a producir` : ''}</td>
          <td><button class="btn ghost sm" data-quitar="${b.key}">Quitar</button></td></tr>`;
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

  $('#btnConfirmar').onclick = async () => {
    const f = leerForm($('#fPedido'));
    if (!f.id_cliente) return toast('Selecciona el cliente.', 'error');
    const body = {
      id_cliente: Number(f.id_cliente), prioridad: f.prioridad, fecha_requerida: f.fecha_requerida || null,
      observacion: f.observacion || null, id_colaborador_solicita: store.usuario ? Number(store.usuario) : null,
      lineas: borrador.map((b) => (b.id_senal ? { id_senal: b.id_senal, cantidad: b.cantidad } : { nueva_senal: b.nueva_senal, cantidad: b.cantidad })),
    };
    $('#btnConfirmar').disabled = true;
    try {
      const p = await intentar(() => api('/pedidos', { method: 'POST', body }));
      toast(`Pedido #${p.id_pedido} registrado: ${p.unidades_desde_stock} de stock, ${p.unidades_a_producir} a producir.`);
      borrador = [];
      $('#fPedido').reset();
      pintarBorrador();
      senales = await api('/senales?activos=1');
      pintarSenales();
      cargarPedidos();
    } finally {
      $('#btnConfirmar').disabled = !borrador.length;
    }
  };

  // ---------- Lista de pedidos ----------
  async function cargarPedidos() {
    const qs = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v)).toString();
    const pedidos = await api('/pedidos' + (qs ? '?' + qs : ''));
    $('#tablaPedidos').innerHTML = pedidos.length ? `<table>
      <thead><tr><th>#</th><th>Cliente</th><th>Prioridad</th><th>Registrado</th><th class="num">Unid.</th><th>Avance</th><th>Estado</th></tr></thead>
      <tbody>${pedidos.map((p) => `<tr class="click" data-id="${p.id_pedido}" tabindex="0">
        <td><strong>#${p.id_pedido}</strong></td><td>${esc(p.cliente)}</td><td>${prioridad(p.prioridad)}</td>
        <td class="nowrap">${fmt.fechaHora(p.fecha_pedido)}</td><td class="num">${p.unidades}</td>
        <td style="min-width:110px"><div class="small">${p.lineas_finalizadas}/${p.lineas} líneas</div>${progreso(p.avance_pct)}</td>
        <td>${badge(p.estado_pedido)}</td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No hay pedidos con esos filtros.</div>';
    el.querySelectorAll('#tablaPedidos tr[data-id]').forEach((tr) => {
      const abrir = () => verPedido(tr.dataset.id, cargarPedidos);
      tr.addEventListener('click', abrir);
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') abrir(); });
    });
  }
  $('#fEstado').onchange = (e) => { filtros.estado = e.target.value; cargarPedidos(); };
  $('#fPrioridad').onchange = (e) => { filtros.prioridad = e.target.value; cargarPedidos(); };
  await cargarPedidos();
}
