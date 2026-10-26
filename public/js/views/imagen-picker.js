import { api, esc, icono, toast } from '../core.js';

/**
 * Selector de imagen referencial: archivo del PC (se sube a SharePoint) o URL.
 * pintar(contenedor, { valor, subirAlElegir }) devuelve { valor(), archivo(), limpiar() }
 *  - subirAlElegir=true  -> sube en cuanto se elige el archivo (Operaciones)
 *  - subirAlElegir=false -> guarda el archivo para enviarlo con el formulario (Señales)
 */
export function selectorImagen(cont, { valor = '', subirAlElegir = true, nombreSugerido = () => 'senal' } = {}) {
  let url = valor || '';
  let archivo = null;
  const id = Math.random().toString(36).slice(2, 8);

  cont.innerHTML = `
    <div role="tablist" class="tabs tabs-box tabs-sm w-fit mb-2">
      <button type="button" role="tab" class="tab tab-active gap-1" data-modo="pc">${icono('upload', 'size-3.5')}Archivo</button>
      <button type="button" role="tab" class="tab gap-1" data-modo="url">${icono('link', 'size-3.5')}URL</button>
    </div>
    <div data-sec="pc">
      <label class="flex items-center gap-3 rounded-box border-2 border-dashed border-base-300 hover:border-primary p-3 cursor-pointer transition-colors" data-drop>
        ${icono('cloud-upload', 'size-6 text-base-content/50')}
        <span class="text-sm"><strong>Elegir imagen</strong> o arrastrarla aquí
          <span class="block text-xs text-base-content/60">${subirAlElegir ? 'Se guarda en SharePoint' : 'Se sube a SharePoint al guardar'}</span></span>
        <input type="file" accept="image/*" class="hidden" id="img-${id}">
      </label>
      <div class="hidden items-center gap-2 text-sm mt-2" data-subiendo><span class="loading loading-spinner loading-sm"></span>Subiendo a SharePoint…</div>
    </div>
    <div data-sec="url" class="hidden">
      <input type="url" class="input input-sm w-full" placeholder="https://…" data-url value="${esc(/^https?:/i.test(url) ? url : '')}">
    </div>
    <div class="hidden items-center gap-3 mt-2 p-2 rounded-box bg-base-200/70" data-prev>
      <img alt="Vista previa" class="thumb" data-prev-img>
      <span class="text-xs min-w-0 truncate flex-1" data-prev-txt></span>
      <button type="button" class="btn btn-ghost btn-xs" data-quitar aria-label="Quitar imagen">${icono('x')}</button>
    </div>`;

  const $ = (s) => cont.querySelector(s);
  const prev = (src, txt) => {
    if (!src) { $('[data-prev]').classList.add('hidden'); $('[data-prev]').classList.remove('flex'); return; }
    $('[data-prev-img]').src = src;
    $('[data-prev-txt]').textContent = txt || src;
    $('[data-prev]').classList.remove('hidden');
    $('[data-prev]').classList.add('flex');
  };
  if (url) prev(url, 'Imagen actual');

  cont.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => {
    cont.querySelectorAll('[data-modo]').forEach((x) => x.classList.toggle('tab-active', x === b));
    $('[data-sec="pc"]').classList.toggle('hidden', b.dataset.modo !== 'pc');
    $('[data-sec="url"]').classList.toggle('hidden', b.dataset.modo !== 'url');
  }));

  async function elegir(file) {
    if (!file || !file.type.startsWith('image/')) return toast('Elige un archivo de imagen.', 'error');
    if (!subirAlElegir) {
      archivo = file;
      prev(URL.createObjectURL(file), `${file.name} · ${Math.round(file.size / 1024)} KB`);
      return;
    }
    const sub = $('[data-subiendo]');
    sub.classList.remove('hidden'); sub.classList.add('flex');
    try {
      const fd = new FormData();
      fd.append('imagen', file);
      fd.append('nombre', nombreSugerido());
      const r = await api('senales/upload-sharepoint', { method: 'POST', body: fd });
      url = r.webUrl || r.url;
      prev(url, file.name);
      toast('Imagen guardada en SharePoint.');
    } catch (e) {
      toast(`No se pudo subir a SharePoint: ${e.message}`, 'error');
    } finally {
      sub.classList.add('hidden'); sub.classList.remove('flex');
    }
  }

  $(`#img-${id}`).addEventListener('change', (e) => elegir(e.target.files?.[0]));
  const drop = $('[data-drop]');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('border-primary'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('border-primary'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('border-primary'); elegir(e.dataTransfer?.files?.[0]); });
  $('[data-url]').addEventListener('input', (e) => {
    url = e.target.value.trim();
    archivo = null;
    prev(/^https?:\/\//i.test(url) ? url : '', url);
  });
  $('[data-quitar]').addEventListener('click', () => {
    url = ''; archivo = null;
    $(`#img-${id}`).value = '';
    $('[data-url]').value = '';
    prev('');
  });

  return {
    valor: () => url || null,
    archivo: () => archivo,
    limpiar: () => $('[data-quitar]').click(),
  };
}
