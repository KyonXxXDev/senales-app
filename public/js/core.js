import { icono } from './icons.js';

export { icono };

// =====================================================================
//  Estado compartido
// =====================================================================
export const store = {
  config: { modo: 'local', erp: null }, // /api/auth/config
  me: null,          // usuario con sesión + permisos
  cat: null,         // catálogos
  embebido: false,   // dentro del iframe del ERP
};

const LS = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin storage */ } },
};
export { LS };

// =====================================================================
//  API (rutas relativas: funciona en /  y detrás de nginx en /senales/)
// =====================================================================
const API_BASE = new URL('api/', document.baseURI);
let refrescando = null;

export class ErrorSesion extends Error {}

function tokenActual() {
  return store.config.modo === 'erp' ? LS.get('hrms_token') : LS.get('senales_token');
}

/** Renueva el access_token del ERP (cookie httpOnly + copia en localStorage como hace el ERP) */
async function refrescarTokenErp() {
  if (store.config.modo !== 'erp' || !store.config.erp) return false;
  if (!refrescando) {
    refrescando = (async () => {
      try {
        const refresh = LS.get('hrms_refresh_token');
        const res = await fetch(`${store.config.erp.api}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(refresh ? { refreshToken: refresh } : {}),
        });
        if (!res.ok) return false;
        const data = await res.json().catch(() => ({}));
        if (data.token) LS.set('hrms_token', data.token);
        if (data.refreshToken) LS.set('hrms_refresh_token', data.refreshToken);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refrescando = null; }, 0);
      }
    })();
  }
  return refrescando;
}

export async function api(path, { method = 'GET', body, reintento = true } = {}) {
  const esForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  if (body && !esForm) headers['Content-Type'] = 'application/json';
  const token = tokenActual();
  if (token) headers.Authorization = `Bearer ${token.replace(/^"(.*)"$/, '$1')}`;

  const res = await fetch(new URL(path.replace(/^\//, ''), API_BASE), {
    method,
    headers,
    credentials: 'same-origin',
    body: body ? (esForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 401 && reintento && store.config.modo === 'erp') {
    if (await refrescarTokenErp()) return api(path, { method, body, reintento: false });
  }
  if (res.status === 204) return null;
  let data = null;
  try { data = await res.json(); } catch { /* sin cuerpo */ }
  if (res.status === 401) {
    const err = new ErrorSesion((data && data.error) || 'Sesión expirada.');
    document.dispatchEvent(new CustomEvent('sesion-expirada', { detail: err.message }));
    throw err;
  }
  if (!res.ok) throw new Error((data && (data.error || data.message)) || `Error ${res.status}`);
  return data;
}

export async function cargarCatalogos() {
  store.cat = await api('catalogos');
  return store.cat;
}

export function etapasDe(area) {
  return (store.cat?.etapas || []).filter((e) => e.area === area).sort((a, b) => a.orden - b.orden);
}

/** ¿El usuario con sesión puede hacer esta acción? (mismas reglas que el backend) */
export function puede(accion) {
  return Boolean(store.me?.es_admin || store.me?.permisos?.includes(accion));
}

// =====================================================================
//  DOM y formato
// =====================================================================
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function options(list, valueKey, labelKey, selected, { placeholder } = {}) {
  const ph = placeholder !== undefined ? `<option value="">${esc(placeholder)}</option>` : '';
  return ph + list.map((x) => {
    const v = x[valueKey];
    const label = typeof labelKey === 'function' ? labelKey(x) : x[labelKey];
    return `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

export function leerForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

const TZ = 'America/Lima';
const fFecha = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const fFechaHora = new Intl.DateTimeFormat('es-PE', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const fNum = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 });

export const fmt = {
  fecha: (v) => (v ? fFecha.format(new Date(String(v).length === 10 ? v + 'T12:00:00' : v)) : '—'),
  fechaHora: (v) => (v ? fFechaHora.format(new Date(v)) : '—'),
  num: (v) => (v === null || v === undefined || v === '' ? '—' : fNum.format(Number(v))),
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
  /** ISO -> valor para <input type="datetime-local"> en hora local */
  inputFechaHora: (v) => {
    if (!v) return '';
    const d = new Date(v);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  },
};

export const AREA_TXT = { OPERACIONES: 'Operaciones', MARKETING: 'Marketing', PRODUCCION: 'Producción' };
const ETAPA_TXT = {
  DISENO: 'Diseño', ENCUADRE: 'Encuadre', IMPRESION: 'Impresión',
  CORTE: 'Corte', ARMADO: 'Armado', 'CONTROL Y EMBALAJE': 'Control y embalaje',
};
export const etiquetaEtapa = (n) => ETAPA_TXT[n] || (n ? n.charAt(0) + n.slice(1).toLowerCase() : '');

// Clases completas (Tailwind solo genera las que ve escritas)
const BADGE_ESTADO = {
  PENDIENTE: 'badge-warning',
  'EN PROCESO': 'badge-info',
  TERMINADO: 'badge-success',
  FINALIZADO: 'badge-success',
  'LISTO PARA ENTREGA': 'badge-success',
  ENTREGADO: 'badge-neutral',
  'NO REQUIERE': 'badge-ghost',
  REGISTRADO: 'badge-success',
  ANULADO: 'badge-ghost',
};
export function badge(estado, extra = '') {
  if (!estado) return '';
  const txt = estado.charAt(0) + estado.slice(1).toLowerCase();
  return `<span class="badge badge-sm badge-soft ${BADGE_ESTADO[estado] || 'badge-ghost'} whitespace-nowrap ${extra}">${esc(txt)}</span>`;
}

const PRIORIDAD = {
  ALTA: ['badge-error', 'Alta'],
  MEDIA: ['badge-warning', 'Media'],
  BAJA: ['badge-success', 'Baja'],
};
export function prioridad(p) {
  const [cls, txt] = PRIORIDAD[p] || ['badge-ghost', p];
  return `<span class="badge badge-sm badge-outline ${cls} whitespace-nowrap">${esc(txt)}</span>`;
}

export function progreso(pct, clase = '') {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<progress class="progress ${v >= 100 ? 'progress-success' : 'progress-primary'} w-full ${clase}" value="${v}" max="100" aria-label="Avance ${Math.round(v)}%"></progress>`;
}

/** Miniatura sin manejadores inline (la CSP los bloquea) */
export function miniatura(url, clase = '') {
  if (url && (/^https?:\/\//i.test(url) || url.startsWith('/') || url.startsWith('api/') || url.startsWith('data:'))) {
    return `<img class="thumb ${clase}" src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-thumb>`;
  }
  return `<span class="thumb ${clase}" aria-hidden="true">${icono('image', 'size-5')}</span>`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img?.tagName === 'IMG' && img.hasAttribute('data-thumb')) {
    const span = document.createElement('span');
    span.className = img.className;
    span.innerHTML = icono('image', 'size-5');
    img.replaceWith(span);
  }
}, true);

export function vacio(texto, ico = 'info') {
  return `<div class="flex flex-col items-center gap-2 py-10 text-base-content/60 text-sm">${icono(ico, 'size-8 opacity-50')}<span>${esc(texto)}</span></div>`;
}

export const cargando = (txt = 'Cargando…') =>
  `<div class="flex items-center justify-center gap-3 py-16 text-base-content/60"><span class="loading loading-spinner"></span>${esc(txt)}</div>`;

// =====================================================================
//  Toasts
// =====================================================================
export function toast(msg, tipo = 'ok') {
  let cont = $('#toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toasts';
    cont.className = 'toast toast-end toast-bottom z-[1000]';
    document.body.append(cont);
  }
  const el = document.createElement('div');
  const cls = { ok: 'alert-success', error: 'alert-error', info: 'alert-info', aviso: 'alert-warning' }[tipo] || 'alert-info';
  const ico = { ok: 'circle-check', error: 'circle-alert', info: 'info', aviso: 'triangle-alert' }[tipo] || 'info';
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.className = `alert ${cls} alert-soft shadow-md max-w-sm text-sm`;
  el.innerHTML = `${icono(ico, 'size-5 shrink-0')}<span>${esc(msg)}</span>`;
  cont.append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 6500 : 3500);
}

export async function intentar(fn, okMsg) {
  try {
    const r = await fn();
    if (okMsg) toast(okMsg);
    return r;
  } catch (e) {
    if (!(e instanceof ErrorSesion)) toast(e.message, 'error');
    throw e;
  }
}

// =====================================================================
//  Modales (se apilan: una confirmación no pierde el modal de abajo)
// =====================================================================
export function abrirModal({ titulo, cuerpo, pie = '', tamano = 'md', onClose = null }) {
  const anchos = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-5xl', xl: 'max-w-7xl' };
  const dlg = document.createElement('dialog');
  dlg.className = 'modal modal-bottom sm:modal-middle';
  dlg.innerHTML = `
    <div class="modal-box w-full ${anchos[tamano] || anchos.md} p-0 flex flex-col max-h-[92vh]">
      <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-base-300">
        <h3 class="font-semibold text-lg">${esc(titulo)}</h3>
        <button type="button" class="btn btn-sm btn-circle btn-ghost" data-close aria-label="Cerrar">${icono('x')}</button>
      </div>
      <div class="px-5 py-4 overflow-y-auto" data-body>${cuerpo}</div>
      ${pie ? `<div class="modal-action m-0 px-5 py-3 border-t border-base-300 flex-wrap" data-foot>${pie}</div>` : ''}
    </div>
    <form method="dialog" class="modal-backdrop"><button aria-label="Cerrar">cerrar</button></form>`;
  document.body.append(dlg);
  const cerrar = () => dlg.close();
  dlg.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) cerrar(); });
  dlg.addEventListener('close', () => {
    dlg.remove();
    if (onClose) onClose();
  });
  dlg.showModal();
  return { dlg, body: dlg.querySelector('[data-body]'), foot: dlg.querySelector('[data-foot]'), cerrar };
}

export function confirmar(mensaje, { ok = 'Confirmar', peligro = false, titulo = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    let respuesta = false;
    const { foot, cerrar } = abrirModal({
      titulo,
      tamano: 'sm',
      cuerpo: `<p class="text-sm">${esc(mensaje)}</p>`,
      pie: `<button class="btn btn-ghost" data-close>Cancelar</button>
            <button class="btn ${peligro ? 'btn-error' : 'btn-primary'}" data-ok>${esc(ok)}</button>`,
      onClose: () => resolve(respuesta),
    });
    foot.querySelector('[data-ok]').onclick = () => { respuesta = true; cerrar(); };
  });
}

/** Botón con spinner mientras corre la acción */
export async function conSpinner(btn, fn) {
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="loading loading-spinner loading-xs"></span>${html}`;
  try { return await fn(); } finally {
    btn.disabled = false;
    btn.innerHTML = html;
  }
}

// =====================================================================
//  Tema (comparte la clave "theme" con el ERP)
// =====================================================================
export const TEMAS = ['light', 'dark', 'corporate', 'business', 'nord', 'dim', 'winter', 'emerald', 'night', 'lofi'];

export function aplicarTema(tema) {
  const t = tema || LS.get('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
  document.dispatchEvent(new CustomEvent('tema-cambiado', { detail: t }));
}
export function guardarTema(tema) {
  LS.set('theme', tema);
  aplicarTema(tema);
}
