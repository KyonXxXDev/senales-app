import {
  api, store, esc, fmt, miniatura, options, intentar, toast, leerForm, abrirModal, cerrarModal,
} from '../core.js';

export default async function stock(el) {
  let senales = [];
  let q = '';
  let soloActivas = true;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Señales y stock</h1><p>Catálogo de señales terminadas. El stock baja solo cuando un pedido lo usa; aquí registras entradas y ajustes.</p></div>
      <div class="row">
        <input type="search" id="busca" placeholder="Buscar señal…" aria-label="Buscar señal">
        <label class="row small"><input type="checkbox" id="soloActivas" checked> Solo activas</label>
        <button class="btn" id="btnNueva">+ Nueva señal</button>
      </div>
    </div>
    <section class="card"><div class="card-body flush table-wrap" id="tabla"></div></section>`;

  const $ = (s) => el.querySelector(s);

  async function cargar() {
    senales = await api('/senales');
    pintar();
  }

  function pintar() {
    const lista = senales.filter((s) => (!soloActivas || s.activo)
      && (!q || `${s.nombre} ${s.material} ${s.vinil}`.toLowerCase().includes(q)));
    $('#tabla').innerHTML = lista.length ? `<table>
      <thead><tr><th>Señal</th><th>Material</th><th>Vinil</th><th>Medida</th><th class="num">m²</th><th class="num">Stock</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map((s) => `<tr>
        <td><div class="senal-cell">${miniatura(s.imagen_url || s.imagen_referencial)}<strong>${esc(s.nombre)}</strong></div></td>
        <td>${esc(s.material)}</td><td>${esc(s.vinil)}</td>
        <td class="nowrap">${fmt.medida(s.ancho_cm, s.alto_cm)}</td>
        <td class="num">${fmt.num(s.area_m2)}</td>
        <td class="num"><strong>${s.stock}</strong>${s.stock === 0 ? ' <span class="badge st-PENDIENTE">Sin stock</span>' : ''}</td>
        <td>${s.activo ? 'Activa' : '<span class="muted">Inactiva</span>'}</td>
        <td class="nowrap">
          <button class="btn secondary sm" data-mov="${s.id_senal}">Movimiento</button>
          <button class="btn ghost sm" data-kardex="${s.id_senal}">Kardex</button>
          <button class="btn ghost sm" data-edit="${s.id_senal}">Editar</button>
        </td></tr>`).join('')}</tbody></table>`
      : '<div class="empty">No hay señales.</div>';

    el.querySelectorAll('[data-mov]').forEach((b) => b.onclick = () => movimiento(senales.find((s) => s.id_senal == b.dataset.mov)));
    el.querySelectorAll('[data-kardex]').forEach((b) => b.onclick = () => kardex(senales.find((s) => s.id_senal == b.dataset.kardex)));
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => formSenal(senales.find((s) => s.id_senal == b.dataset.edit)));
  }

  function formSenal(s = null) {
    const mats = store.cat.materiales.filter((m) => m.activo || m.id_material === s?.id_material);
    const vins = store.cat.viniles.filter((v) => v.activo || v.id_vinil === s?.id_vinil);
    let selectedFile = null;
    let modoImagen = 'pc'; // 'pc' | 'url'
    let imagenExistente = s?.imagen_url || s?.imagen_referencial || '';
    let imagenRemovida = false;

    const { body, foot } = abrirModal({
      titulo: s ? `Editar señal` : 'Nueva señal', estrecho: true,
      cuerpo: `<form class="fields" id="fSenal">
        <label class="field full">Descripción *<input name="nombre" required maxlength="150" value="${esc(s?.nombre || '')}"></label>
        <label class="field">Material *<select name="id_material">${options(mats, 'id_material', 'nombre', s?.id_material)}</select></label>
        <label class="field">Vinil *<select name="id_vinil">${options(vins, 'id_vinil', 'nombre', s?.id_vinil)}</select></label>
        <label class="field">Ancho (cm) *<input type="number" name="ancho_cm" min="0.1" step="0.1" required value="${s?.ancho_cm ?? ''}"></label>
        <label class="field">Alto (cm) *<input type="number" name="alto_cm" min="0.1" step="0.1" required value="${s?.alto_cm ?? ''}"></label>

        <div class="field full image-picker-wrap">
          <label class="field" style="margin-bottom:6px">Imagen de la señal</label>
          <div class="seg image-source-seg">
            <button type="button" class="on" id="btnModoPC">📁 Archivo de mi PC</button>
            <button type="button" id="btnModoURL">🌐 URL de la web</button>
          </div>

          <!-- Opción 1: Archivo de mi PC -->
          <div id="secImgPC">
            <div class="dropzone-box" id="dropzoneBox">
              <input type="file" id="inputFoto" accept="image/*" class="file-hidden-input">
              <div class="dropzone-prompt">
                <span class="dropzone-icon">📷</span>
                <strong>Haz clic para seleccionar o arrastra una imagen</strong>
                <span class="muted small">Se guardará automáticamente en SharePoint</span>
              </div>
            </div>
            <div id="previewPC" class="preview-container ${imagenExistente ? '' : 'hidden'}">
              <img id="imgThumbPC" class="preview-img" src="${esc(imagenExistente || '')}" alt="Vista previa">
              <div class="preview-meta">
                <strong id="labelNombreArchivo">${imagenExistente ? 'Imagen actual en SharePoint' : 'Archivo seleccionado'}</strong>
                <span class="small muted" id="labelTamanoArchivo">${imagenExistente ? `<a href="${esc(imagenExistente)}" target="_blank" rel="noopener">Ver enlace original</a>` : ''}</span>
                <span class="badge-sp">☁ SharePoint</span>
              </div>
              <button type="button" class="btn ghost danger sm" id="btnQuitarImg" title="Quitar archivo">✕</button>
            </div>
          </div>

          <!-- Opción 2: URL de la web -->
          <div id="secImgURL" class="hidden">
            <label class="field">URL directa de la imagen
              <input type="url" name="imagen_url_web" id="inputUrlWeb" placeholder="https://… o enlace de SharePoint" value="${esc(imagenExistente || '')}">
            </label>
            <div id="previewURL" class="preview-container ${imagenExistente ? '' : 'hidden'}" style="margin-top:8px">
              <img id="imgThumbURL" class="preview-img" src="${esc(imagenExistente || '')}" alt="Vista previa URL">
              <div class="preview-meta">
                <strong>Vista previa de URL</strong>
                <span class="small muted">Enlace asignado</span>
              </div>
            </div>
          </div>
        </div>

        ${s ? `<label class="row full small"><input type="checkbox" name="activo" ${s.activo ? 'checked' : ''}> Señal activa (disponible para pedidos)</label>`
            : '<label class="field">Stock inicial<input type="number" name="stock_inicial" min="0" step="1" value="0"></label>'}
      </form>`,
      pie: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok id="btnGuardar">Guardar</button>',
    });

    // Elementos del DOM del modal
    const btnModoPC = body.querySelector('#btnModoPC');
    const btnModoURL = body.querySelector('#btnModoURL');
    const secImgPC = body.querySelector('#secImgPC');
    const secImgURL = body.querySelector('#secImgURL');
    const dropzoneBox = body.querySelector('#dropzoneBox');
    const inputFoto = body.querySelector('#inputFoto');
    const previewPC = body.querySelector('#previewPC');
    const imgThumbPC = body.querySelector('#imgThumbPC');
    const labelNombreArchivo = body.querySelector('#labelNombreArchivo');
    const labelTamanoArchivo = body.querySelector('#labelTamanoArchivo');
    const btnQuitarImg = body.querySelector('#btnQuitarImg');
    const inputUrlWeb = body.querySelector('#inputUrlWeb');
    const previewURL = body.querySelector('#previewURL');
    const imgThumbURL = body.querySelector('#imgThumbURL');
    const btnGuardar = foot.querySelector('#btnGuardar');

    // Manejo de pestañas PC / URL
    btnModoPC.onclick = () => {
      modoImagen = 'pc';
      btnModoPC.classList.add('on');
      btnModoURL.classList.remove('on');
      secImgPC.classList.remove('hidden');
      secImgURL.classList.add('hidden');
    };

    btnModoURL.onclick = () => {
      modoImagen = 'url';
      btnModoURL.classList.add('on');
      btnModoPC.classList.remove('on');
      secImgURL.classList.remove('hidden');
      secImgPC.classList.add('hidden');
    };

    function mostrarArchivoSeleccionado(file) {
      selectedFile = file;
      imagenRemovida = false;
      const objectUrl = URL.createObjectURL(file);
      imgThumbPC.src = objectUrl;
      labelNombreArchivo.textContent = file.name;
      const sizeKB = Math.round(file.size / 1024);
      labelTamanoArchivo.textContent = sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(2)} MB` : `${sizeKB} KB`;
      previewPC.classList.remove('hidden');
    }

    inputFoto.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) mostrarArchivoSeleccionado(file);
    };

    // Drag and drop en la zona de carga
    dropzoneBox.ondragover = (e) => {
      e.preventDefault();
      dropzoneBox.classList.add('dragover');
    };
    dropzoneBox.ondragleave = () => {
      dropzoneBox.classList.remove('dragover');
    };
    dropzoneBox.ondrop = (e) => {
      e.preventDefault();
      dropzoneBox.classList.remove('dragover');
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        mostrarArchivoSeleccionado(file);
      } else {
        toast('Por favor arrastra un archivo de imagen válido.', 'error');
      }
    };

    // Botón quitar archivo
    btnQuitarImg.onclick = () => {
      selectedFile = null;
      imagenRemovida = true;
      inputFoto.value = '';
      imgThumbPC.src = '';
      previewPC.classList.add('hidden');
    };

    // Previsualización de URL web en tiempo real
    inputUrlWeb.oninput = () => {
      const url = inputUrlWeb.value.trim();
      if (url && /^https?:\/\//i.test(url)) {
        imgThumbURL.src = url;
        previewURL.classList.remove('hidden');
      } else {
        previewURL.classList.add('hidden');
      }
    };

    btnGuardar.onclick = async () => {
      const form = body.querySelector('form');
      if (!form.reportValidity()) return;
      const f = leerForm(form);

      btnGuardar.disabled = true;
      const originalBtnText = btnGuardar.innerHTML;

      try {
        if (modoImagen === 'pc' && selectedFile) {
          btnGuardar.innerHTML = '<span class="spinner-sm"></span> Subiendo a SharePoint...';
          const formData = new FormData();
          formData.append('nombre', f.nombre);
          formData.append('id_material', f.id_material);
          formData.append('id_vinil', f.id_vinil);
          formData.append('ancho_cm', f.ancho_cm);
          formData.append('alto_cm', f.alto_cm);
          if (!s) {
            formData.append('stock_inicial', f.stock_inicial || 0);
          } else {
            formData.append('activo', f.activo ? 'true' : 'false');
          }
          if (store.usuario) {
            formData.append('id_colaborador', store.usuario);
          }
          formData.append('imagen', selectedFile);

          await intentar(
            () => (s ? api(`/senales/${s.id_senal}`, { method: 'PUT', body: formData })
                      : api('/senales', { method: 'POST', body: formData })),
            'Señal guardada y subida a SharePoint con éxito.'
          );
        } else {
          // Modo URL o conservación de imagen existente
          let imagenFinal = undefined;
          if (modoImagen === 'url') {
            imagenFinal = inputUrlWeb.value.trim() || null;
          } else if (imagenRemovida) {
            imagenFinal = null;
          } else if (imagenExistente) {
            imagenFinal = imagenExistente;
          }

          const data = {
            ...f,
            activo: s ? !!f.activo : true,
            id_colaborador: store.usuario ? Number(store.usuario) : null,
            ...(imagenFinal !== undefined ? { imagen_url: imagenFinal, imagen_referencial: imagenFinal } : {}),
          };

          await intentar(
            () => (s ? api(`/senales/${s.id_senal}`, { method: 'PUT', body: data })
                      : api('/senales', { method: 'POST', body: data })),
            'Señal guardada correctamente.'
          );
        }

        cerrarModal();
        cargar();
      } catch (err) {
        toast(err.message || 'Error al guardar la señal', 'error');
      } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerHTML = originalBtnText;
      }
    };
  }

  function movimiento(s) {
    const { body, foot } = abrirModal({
      titulo: `Movimiento de stock · ${s.nombre}`, estrecho: true,
      cuerpo: `<p class="muted">Stock actual: <strong>${s.stock}</strong></p>
        <form class="fields">
          <label class="field">Tipo<select name="tipo">
            <option value="ENTRADA">Entrada (+)</option><option value="AJUSTE">Ajuste (+/−)</option></select></label>
          <label class="field">Cantidad<input type="number" name="cantidad" step="1" required></label>
          <label class="field full">Motivo<input name="observacion" maxlength="300" placeholder="Ej. excedente de producción, conteo físico…"></label>
          <p class="small muted full">Para restar usa <strong>Ajuste</strong> con cantidad negativa. Las salidas por pedido se registran solas.</p>
        </form>`,
      pie: '<button class="btn secondary" data-close>Cancelar</button><button class="btn" data-ok>Registrar</button>',
    });
    foot.querySelector('[data-ok]').onclick = async () => {
      const f = leerForm(body.querySelector('form'));
      const cantidad = parseInt(f.cantidad, 10);
      if (!cantidad) return toast('Ingresa una cantidad distinta de 0.', 'error');
      await intentar(() => api('/stock/movimientos', { method: 'POST', body: {
        id_senal: s.id_senal, tipo: f.tipo, cantidad, observacion: f.observacion || null,
        id_colaborador: store.usuario ? Number(store.usuario) : null } }), 'Movimiento registrado.');
      cerrarModal();
      cargar();
    };
  }

  async function kardex(s) {
    const movs = await intentar(() => api(`/senales/${s.id_senal}/kardex`));
    const tipo = { ENTRADA: 'Entrada', SALIDA_PEDIDO: 'Salida a pedido', DEVOLUCION: 'Devolución', AJUSTE: 'Ajuste' };
    abrirModal({
      titulo: `Kardex · ${s.nombre}`,
      cuerpo: movs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Tipo</th><th class="num">Cantidad</th><th class="num">Saldo</th><th>Pedido</th><th>Colaborador</th><th>Motivo</th></tr></thead>
        <tbody>${movs.map((m) => `<tr><td class="nowrap">${fmt.fechaHora(m.fecha)}</td><td>${tipo[m.tipo] || m.tipo}</td>
          <td class="num">${m.cantidad > 0 ? '+' : ''}${m.cantidad}</td><td class="num"><strong>${m.saldo}</strong></td>
          <td>${m.id_pedido ? '#' + m.id_pedido : '—'}</td><td>${esc(m.colaborador || '—')}</td><td>${esc(m.observacion || '')}</td></tr>`).join('')}
        </tbody></table></div>` : '<div class="empty">Sin movimientos.</div>',
      pie: '<button class="btn secondary" data-close>Cerrar</button>',
    });
  }

  $('#busca').oninput = (e) => { q = e.target.value.trim().toLowerCase(); pintar(); };
  $('#soloActivas').onchange = (e) => { soloActivas = e.target.checked; pintar(); };
  $('#btnNueva').onclick = () => formSenal();
  await cargar();
}
