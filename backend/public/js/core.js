// ================= API =================
export async function api(path, { method = 'GET', body } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = (body && !isFormData) ? { 'Content-Type': 'application/json' } : {};
  try {
    const token = localStorage.getItem('senales_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
  } catch { /* sin localStorage */ }

  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? (isFormData ? body : JSON.stringify(body)) : undefined,
  });
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

// ================= Estado compartido =================
export const store = {
  cat: null, // catálogos
  usuario: null, // id_colaborador actual
};

export async function cargarCatalogos() {
  store.cat = await api('/catalogos');
  return store.cat;
}

export function etapasDe(area) {
  return store.cat.etapas.filter((e) => e.area === area).sort((a, b) => a.orden - b.orden);
}

// ================= Utilidades DOM =================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escapa texto para interpolar en HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function options(list, valueKey, labelKey, selected, { placeholder } = {}) {
  const ph = placeholder ? `<option value="">${esc(placeholder)}</option>` : '';
  return ph + list.map((x) => {
    const v = x[valueKey];
    const label = typeof labelKey === 'function' ? labelKey(x) : x[labelKey];
    return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

// ================= Formatos =================
const TZ = 'America/Lima';
const fFecha = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const fFechaHora = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fNum = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

export const fmt = {
  fecha: (v) => (v ? fFecha.format(new Date(v.length === 10 ? v + 'T12:00:00' : v)) : '—'),
  fechaHora: (v) => (v ? fFechaHora.format(new Date(v)) : '—'),
  num: (v) => (v === null || v === undefined ? '—' : fNum.format(v)),
  pct: (v) => (v === null || v === undefined ? '—' : fNum.format(v) + '%'),
  min: (v) => {
    if (v === null || v === undefined) return '—';
    const m = Math.round(v);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
  },
  medida: (a, b) => `${fNum.format(a)} × ${fNum.format(b)} cm`,
  cronometro: (desde) => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(desde).getTime()) / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    return [h, m, ss].map((x) => String(x).padStart(2, '0')).join(':');
  },
};

export const ETIQUETA_ETAPA = {
  DISENO: 'Diseño', ENCUADRE: 'Encuadre', IMPRESION: 'Impresión',
  CORTE: 'Corte', ARMADO: 'Armado', 'CONTROL Y EMBALAJE': 'Control y embalaje',
};
export const etiquetaEtapa = (n) => ETIQUETA_ETAPA[n] || n.charAt(0) + n.slice(1).toLowerCase();

export function badge(estado) {
  if (!estado) return '';
  const cls = 'st-' + estado.replace(/ /g, '-');
  const txt = estado.charAt(0) + estado.slice(1).toLowerCase();
  return `<span class="badge ${cls}">${esc(txt)}</span>`;
}
export function prioridad(p) {
  const txt = { ALTA: 'Alta', MEDIA: 'Media', BAJA: 'Baja' }[p] || p;
  return `<span class="pr pr-${esc(p)}">${esc(txt)}</span>`;
}
export function progreso(pct) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="progress ${v >= 100 ? 'ok' : ''}" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v}%"></span></div>`;
}
export function miniatura(url) {
  if (url && /^https?:\/\//i.test(url))
    return `<img class="thumb" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'thumb',textContent:'IMG'}))">`;
  return '<span class="thumb" aria-hidden="true">IMG</span>';
}

// ================= Toasts =================
export function toast(msg, tipo = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (tipo === 'error' ? 'error' : '');
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 6000 : 3000);
}

/** Ejecuta una acción async mostrando errores como toast. */
export async function intentar(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}

// ================= Modal =================
const modal = () => $('#modal');
let alCerrar = null;

export function abrirModal({ titulo, cuerpo, pie = '', estrecho = false, onClose = null }) {
  $('#modalTitle').textContent = titulo;
  $('#modalBody').innerHTML = cuerpo;
  $('#modalFoot').innerHTML = pie;
  modal().classList.toggle('narrow', estrecho);
  alCerrar = onClose;
  if (!modal().open) modal().showModal();
  return { body: $('#modalBody'), foot: $('#modalFoot') };
}
export function cerrarModal() {
  if (modal().open) modal().close();
}
document.addEventListener('DOMContentLoaded', () => {
  modal().addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === modal()) cerrarModal();
  });
  modal().addEventListener('close', () => {
    const f = alCerrar;
    alCerrar = null;
    if (f) f();
  });
});

/** Confirmación dentro del modal (sin window.confirm). */
export function confirmar(mensaje, { ok = 'Confirmar', peligro = false } = {}) {
  return new Promise((resolve) => {
    let respuesta = false;
    const { foot } = abrirModal({
      titulo: 'Confirmar',
      cuerpo: `<p>${esc(mensaje)}</p>`,
      pie: `<button class="btn secondary" data-close>Cancelar</button>
            <button class="btn ${peligro ? 'danger' : ''}" data-ok>${esc(ok)}</button>`,
      estrecho: true,
      onClose: () => resolve(respuesta),
    });
    foot.querySelector('[data-ok]').onclick = () => { respuesta = true; cerrarModal(); };
  });
}

/** Lee un <form> como objeto (strings). */
export function leerForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

// ================= Gestión de Sesión & Selector de Usuario =================
export function guardarSesion(token, colab) {
  try {
    localStorage.setItem('senales_token', token);
    localStorage.setItem('senales_colab', JSON.stringify(colab));
    localStorage.setItem('usuario', String(colab.id_colaborador));
  } catch { /* sin storage */ }
  store.usuario = colab.id_colaborador;
  store.colaborador = colab;
  actualizarUIUsuario();
}

export function cerrarSesion() {
  try {
    localStorage.removeItem('senales_token');
    localStorage.removeItem('senales_colab');
    localStorage.removeItem('usuario');
  } catch { /* sin storage */ }
  store.usuario = null;
  store.colaborador = null;
  actualizarUIUsuario();
  toast('Sesión cerrada.');
}

export function actualizarUIUsuario() {
  const nomEl = $('#usuarioNombre');
  const areaEl = $('#usuarioArea');
  const avEl = $('#usuarioAvatar');
  if (!nomEl || !areaEl) return;

  if (store.colaborador) {
    nomEl.textContent = store.colaborador.nombre;
    areaEl.textContent = store.colaborador.area;
    if (avEl) avEl.textContent = store.colaborador.nombre.charAt(0).toUpperCase();
  } else {
    nomEl.textContent = 'Sin identificar';
    areaEl.textContent = 'Toca para ingresar';
    if (avEl) avEl.textContent = '👤';
  }
}

export function pintarSelectorUsuario() {
  actualizarUIUsuario();
}

export function mostrarModalLogin(onSuccess) {
  const activos = (store.cat?.colaboradores || []).filter((c) => c.activo);
  const areas = ['OPERACIONES', 'MARKETING', 'PRODUCCION'];
  const titulos = { OPERACIONES: 'Operaciones', MARKETING: 'Marketing', PRODUCCION: 'Producción' };

  let htmlGrupos = '';
  for (const a of areas) {
    const colabsArea = activos.filter((c) => c.area === a);
    if (!colabsArea.length) continue;
    htmlGrupos += `
      <div class="login-area-group">
        <div class="login-area-title">${titulos[a]}</div>
        <div class="login-grid">
          ${colabsArea.map((c) => `
            <button type="button" class="colab-card" data-colab-login="${c.id_colaborador}">
              <div class="avatar">${c.nombre.charAt(0).toUpperCase()}</div>
              <strong>${esc(c.nombre)}</strong>
              <small>${titulos[c.area]}</small>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  const { body } = abrirModal({
    titulo: '¿Quién está trabajando?',
    cuerpo: `
      <p class="muted" style="margin-top:0;margin-bottom:16px">Selecciona tu nombre para registrar tus pedidos, avances y tiempos de trabajo:</p>
      ${htmlGrupos}
    `,
    estrecho: true,
  });

  body.querySelectorAll('[data-colab-login]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idColab = Number(btn.dataset.colabLogin);
      btn.disabled = true;
      try {
        const res = await api('/auth/login', {
          method: 'POST',
          body: { id_colaborador: idColab },
        });
        guardarSesion(res.token, res.colaborador);
        cerrarModal();
        toast(`¡Hola, ${res.colaborador.nombre}!`);
        if (typeof onSuccess === 'function') onSuccess(res.colaborador);
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    });
  });
}

