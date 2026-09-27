import { api, store, esc, intentar, cargarCatalogos, pintarSelectorUsuario, confirmar } from '../core.js';

const AREAS = { OPERACIONES: 'Operaciones', MARKETING: 'Marketing', PRODUCCION: 'Producción' };

const DEF = [
  { ruta: 'materiales', clave: 'materiales', id: 'id_material', titulo: 'Materiales (sustrato)' },
  { ruta: 'viniles', clave: 'viniles', id: 'id_vinil', titulo: 'Viniles' },
  { ruta: 'clientes', clave: 'clientes', id: 'id_cliente', titulo: 'Clientes / tiendas' },
  { ruta: 'colaboradores', clave: 'colaboradores', id: 'id_colaborador', titulo: 'Colaboradores', conArea: true },
];

export default async function catalogos(el) {
  await cargarCatalogos();

  el.innerHTML = `
    <div class="page-head"><div><h1>Catálogos</h1>
      <p>Lo que está en uso no se puede borrar: desactívalo para que no aparezca en formularios nuevos.</p></div></div>
    <div class="grid grid-2">${DEF.map((d) => `<section class="card" id="cat-${d.ruta}"></section>`).join('')}</div>
    <section class="card" style="margin-top:16px">
      <div class="card-head"><h2>Etapas de trabajo</h2></div>
      <div class="card-body">
        <p class="muted small" style="margin-top:0">Las etapas se configuran en la base de datos (tabla <code>etapa</code>). La marcada como final es la que cuenta unidades terminadas.</p>
        <div class="grid grid-2">${['MARKETING', 'PRODUCCION'].map((a) => `<div><h3>${AREAS[a]}</h3><ol>
          ${store.cat.etapas.filter((e) => e.area === a).map((e) => `<li>${esc(e.nombre)}${e.es_final ? ' <span class="muted small">(final)</span>' : ''}</li>`).join('')}
        </ol></div>`).join('')}</div>
      </div>
    </section>`;

  DEF.forEach((d) => pintar(el.querySelector(`#cat-${d.ruta}`), d));
}

function pintar(box, d) {
  const lista = store.cat[d.clave];
  box.innerHTML = `
    <div class="card-head"><h2>${d.titulo}</h2><span class="muted small">${lista.filter((x) => x.activo).length} activos</span></div>
    <form class="card-body row" data-add style="border-bottom:1px solid var(--line)">
      <input name="nombre" placeholder="Nombre" required maxlength="120" style="flex:1" aria-label="Nombre">
      ${d.conArea ? `<select name="area" aria-label="Área">${Object.entries(AREAS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>` : ''}
      <button class="btn sm">Agregar</button>
    </form>
    <div class="card-body flush table-wrap" style="max-height:340px;overflow:auto"><table><tbody>
      ${lista.map((x) => `<tr data-id="${x[d.id]}">
        <td><input value="${esc(x.nombre)}" data-nombre aria-label="Nombre" style="width:100%"></td>
        ${d.conArea ? `<td><select data-area aria-label="Área">${Object.entries(AREAS).map(([k, v]) =>
          `<option value="${k}" ${x.area === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>` : ''}
        <td class="nowrap"><label class="row small"><input type="checkbox" data-activo ${x.activo ? 'checked' : ''}> Activo</label></td>
        <td><button class="btn ghost sm" data-del aria-label="Eliminar">Eliminar</button></td>
      </tr>`).join('') || '<tr><td class="empty">Vacío</td></tr>'}
    </tbody></table></div>`;

  const refrescar = async () => {
    await cargarCatalogos();
    pintarSelectorUsuario();
    pintar(box, d);
  };

  box.querySelector('[data-add]').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    await intentar(() => api(`/${d.ruta}`, { method: 'POST', body }), 'Agregado.');
    refrescar();
  };

  box.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const actualizar = async (body) => {
      try { await intentar(() => api(`/${d.ruta}/${id}`, { method: 'PUT', body }), 'Guardado.'); } catch { /* toast */ }
      refrescar();
    };
    tr.querySelector('[data-nombre]').onchange = (e) => actualizar({ nombre: e.target.value });
    tr.querySelector('[data-area]')?.addEventListener('change', (e) => actualizar({ area: e.target.value }));
    tr.querySelector('[data-activo]').onchange = (e) => actualizar({ activo: e.target.checked });
    tr.querySelector('[data-del]').onclick = async () => {
      if (!(await confirmar('¿Eliminar este registro?', { ok: 'Eliminar', peligro: true }))) return;
      try { await intentar(() => api(`/${d.ruta}/${id}`, { method: 'DELETE' }), 'Eliminado.'); } catch { /* toast */ }
      refrescar();
    };
  });
}
