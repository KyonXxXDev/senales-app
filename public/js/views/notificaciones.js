import { api, esc, fmt, intentar, icono, vacio, cargando, store } from '../core.js';

const TIPO = {
  INFO: ['alert-info', 'info'],
  ALERTA: ['alert-warning', 'triangle-alert'],
  URGENTE: ['alert-error', 'circle-alert'],
};

/** Contador del ícono de la barra superior */
export async function actualizarBadge() {
  if (!store.me) return;
  const b = document.querySelector('#notifBadge');
  if (!b) return;
  try {
    const items = await api('notificaciones?solo_no_leidas=1');
    b.textContent = items.length > 99 ? '99+' : String(items.length);
    b.classList.toggle('hidden', !items.length);
  } catch { /* sin conexión */ }
}

export default async function notificaciones(el) {
  let soloNoLeidas = false;
  el.innerHTML = `
    <div class="flex flex-wrap items-end justify-between gap-3 mb-4 max-w-3xl">
      <div><h1 class="text-xl font-bold flex items-center gap-2">${icono('bell', 'size-5')}Notificaciones</h1>
        <p class="text-sm text-base-content/70">Avisos de cambios en pedidos y líneas terminadas.</p></div>
      <div class="flex items-center gap-2">
        <label class="label text-sm gap-2 cursor-pointer"><input type="checkbox" class="toggle toggle-sm" id="fNoLeidas">Solo no leídas</label>
        <button class="btn btn-sm" id="btnTodas">${icono('check-check')}Marcar todas</button>
      </div>
    </div>
    <div id="lista" class="flex flex-col gap-2 max-w-3xl">${cargando()}</div>`;

  async function cargar() {
    const items = await api(`notificaciones${soloNoLeidas ? '?solo_no_leidas=1' : ''}`);
    el.querySelector('#lista').innerHTML = items.length ? items.map((n) => {
      const [cls, ico] = TIPO[n.tipo] || TIPO.INFO;
      return `<div role="status" class="alert ${cls} ${n.leida ? 'alert-outline opacity-70' : 'alert-soft'} items-start">
        ${icono(ico, 'size-5 shrink-0 mt-0.5')}
        <div class="flex-1 min-w-0">
          <div class="font-semibold">${esc(n.titulo)}</div>
          <div class="text-sm">${esc(n.mensaje)}</div>
          <div class="text-xs opacity-70 mt-1">${fmt.fechaHora(n.fecha_creacion)}</div>
        </div>
        <div class="flex gap-1">
          ${n.url && n.url.startsWith('#/') ? `<a class="btn btn-xs" href="${esc(n.url)}" data-ir="${n.id_notificacion}">Ver</a>` : ''}
          ${n.leida ? '' : `<button class="btn btn-xs btn-ghost" data-leer="${n.id_notificacion}">${icono('check', 'size-3.5')}Leída</button>`}
        </div>
      </div>`;
    }).join('') : `<div class="card bg-base-100 border border-base-300">${vacio('No tienes notificaciones.', 'bell')}</div>`;

    el.querySelectorAll('[data-leer]').forEach((b) => b.addEventListener('click', async () => {
      await intentar(() => api(`notificaciones/${b.dataset.leer}/leer`, { method: 'PATCH', body: {} }));
      cargar(); actualizarBadge();
    }));
    el.querySelectorAll('[data-ir]').forEach((a) => a.addEventListener('click', () => {
      api(`notificaciones/${a.dataset.ir}/leer`, { method: 'PATCH', body: {} }).then(actualizarBadge).catch(() => {});
    }));
  }

  el.querySelector('#fNoLeidas').onchange = (e) => { soloNoLeidas = e.target.checked; cargar(); };
  el.querySelector('#btnTodas').onclick = async () => {
    await intentar(() => api('notificaciones/leer-todas', { method: 'PATCH', body: {} }), 'Todas marcadas como leídas.');
    cargar(); actualizarBadge();
  };
  await cargar();
  actualizarBadge();
}
