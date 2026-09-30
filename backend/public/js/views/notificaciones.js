import {
  api, esc, fmt, intentar, toast, abrirModal, cerrarModal,
} from '../core.js';

/**
 * Vista de Notificaciones in-app.
 * Muestra las alertas del colaborador autenticado y permite marcarlas como leídas.
 */
export default async function notificaciones(el) {
  let filtro = 'pendientes'; // 'pendientes' | 'todas'

  el.innerHTML = `
    <div class="page-head">
      <div>
        <h1>🔔 Notificaciones</h1>
        <p>Alertas de producción, marketing y ediciones de pedidos dirigidas a ti.</p>
      </div>
      <div class="row">
        <div class="seg" role="tablist">
          <button type="button" class="on" data-filtro="pendientes">Sin leer</button>
          <button type="button" data-filtro="todas">Todas</button>
        </div>
        <button class="btn secondary" id="btnMarcarTodas">Marcar todas como leídas</button>
        <button class="btn secondary" id="btnRefrescar">Actualizar</button>
      </div>
    </div>
    <div id="notif-lista"></div>`;

  const $ = (s) => el.querySelector(s);

  async function cargar() {
    const qs = filtro === 'pendientes' ? '?solo_no_leidas=1' : '';
    let items;
    try {
      items = await api(`/notificaciones${qs}`);
    } catch (e) {
      $('#notif-lista').innerHTML = `<div class="card empty">Error al cargar: ${esc(e.message)}</div>`;
      return;
    }
    pintar(items);
  }

  function pintar(items) {
    const lista = $('#notif-lista');
    if (!items.length) {
      lista.innerHTML = `<div class="card empty" style="padding:40px;text-align:center">
        <div style="font-size:40px;margin-bottom:12px">🎉</div>
        <strong>${filtro === 'pendientes' ? 'No tienes notificaciones pendientes' : 'No hay notificaciones'}</strong>
        <p class="muted">Las alertas de producción, marketing y pedidos aparecerán aquí.</p>
      </div>`;
      return;
    }

    lista.innerHTML = items.map((n) => `
      <div class="notif-item ${n.leida ? 'leida' : 'nueva'}" data-id="${n.id_notificacion}">
        <div class="notif-icon tipo-${(n.tipo || 'INFO').toLowerCase()}">${iconoTipo(n.tipo)}</div>
        <div class="notif-body">
          <div class="notif-titulo">${esc(n.titulo)}</div>
          <div class="notif-mensaje">${esc(n.mensaje)}</div>
          <div class="notif-meta">
            <span class="badge st-${n.tipo === 'URGENTE' ? 'PENDIENTE' : n.tipo === 'ALERTA' ? 'EN-PROCESO' : 'NO-REQUIERE'}">${esc(n.tipo || 'INFO')}</span>
            <span class="muted small">${fmt.fechaHora(n.fecha_creacion)}</span>
            ${n.fecha_lectura ? `<span class="muted small">Leída ${fmt.fechaHora(n.fecha_lectura)}</span>` : ''}
          </div>
        </div>
        <div class="notif-actions">
          ${n.url ? `<a class="btn ghost sm" href="${esc(n.url)}" target="_self">Ver →</a>` : ''}
          ${!n.leida ? `<button class="btn secondary sm" data-leer="${n.id_notificacion}">Marcar leída</button>` : '<span class="muted small">✓ Leída</span>'}
        </div>
      </div>`).join('');

    // Eventos
    lista.querySelectorAll('[data-leer]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = btn.dataset.leer;
      await intentar(() => api(`/notificaciones/${id}/leer`, { method: 'PATCH' }));
      cargar();
      actualizarBadge();
    }));
  }

  function iconoTipo(tipo) {
    return { URGENTE: '🚨', ALERTA: '⚠️', INFO: 'ℹ️' }[tipo] || 'ℹ️';
  }

  el.querySelectorAll('[data-filtro]').forEach((btn) => btn.addEventListener('click', () => {
    el.querySelectorAll('[data-filtro]').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    filtro = btn.dataset.filtro;
    cargar();
  }));

  $('#btnMarcarTodas').onclick = async () => {
    await intentar(() => api('/notificaciones/leer-todas', { method: 'PATCH' }), 'Todas marcadas como leídas.');
    cargar();
    actualizarBadge();
  };

  $('#btnRefrescar').onclick = () => intentar(cargar);

  await cargar();
}

/** Actualiza el badge numérico del topbar con las notifs no leídas. */
export async function actualizarBadge() {
  try {
    const items = await api('/notificaciones?solo_no_leidas=1');
    const count = Array.isArray(items) ? items.length : 0;
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    badge.textContent = count > 99 ? '99+' : count || '';
    badge.style.display = count ? 'flex' : 'none';
  } catch { /* silencioso */ }
}
