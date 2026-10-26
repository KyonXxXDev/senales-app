import {
  $, store, api, cargarCatalogos, esc, toast, icono, LS, ErrorSesion, aplicarTema, guardarTema, TEMAS,
  AREA_TXT, puede, cargando,
} from './core.js';
import operaciones from './views/operaciones.js';
import trabajo from './views/trabajo.js';
import senales from './views/senales.js';
import insumos from './views/insumos.js';
import dashboard from './views/dashboard.js';
import catalogos from './views/catalogos.js';
import notificaciones, { actualizarBadge } from './views/notificaciones.js';
import { verPedido } from './views/pedido-modal.js';

const VISTAS = {
  operaciones: { txt: 'Operaciones', ico: 'clipboard-list', fn: (el) => operaciones(el) },
  marketing: { txt: 'Marketing', ico: 'printer', fn: (el) => trabajo(el, 'MARKETING') },
  produccion: { txt: 'Producción', ico: 'factory', fn: (el) => trabajo(el, 'PRODUCCION') },
  senales: { txt: 'Señales y stock', ico: 'boxes', fn: (el) => senales(el) },
  insumos: { txt: 'Insumos', ico: 'warehouse', fn: (el) => insumos(el) },
  dashboard: { txt: 'Dashboard', ico: 'layout-dashboard', fn: (el) => dashboard(el) },
  catalogos: { txt: 'Catálogos', ico: 'settings', fn: (el) => catalogos(el), visible: () => puede('catalogo.admin') },
  notificaciones: { txt: 'Notificaciones', ico: 'bell', fn: (el) => notificaciones(el), oculta: true },
};
const ALIAS = { stock: 'senales' };

let limpiarVista = null;

function vistaInicial() {
  return { OPERACIONES: 'operaciones', MARKETING: 'marketing', PRODUCCION: 'produccion' }[store.me?.area] || 'dashboard';
}

function pintarTabs(activa) {
  $('#tabs').innerHTML = Object.entries(VISTAS)
    .filter(([, v]) => !v.oculta && (!v.visible || v.visible()))
    .map(([k, v]) => `<a role="tab" href="#/${k}" class="tab gap-1.5 whitespace-nowrap shrink-0 flex-nowrap ${k === activa ? 'tab-active font-semibold' : ''}"
        ${k === activa ? 'aria-selected="true"' : ''}>${icono(v.ico)}<span class="hidden md:inline">${v.txt}</span></a>`)
    .join('');
}

async function navegar() {
  const partes = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  let nombre = ALIAS[partes[0]] || partes[0];
  let abrirPedido = null;
  if (nombre === 'pedido' && partes[1]) {
    abrirPedido = Number(partes[1]);
    nombre = 'operaciones';
  }
  if (!VISTAS[nombre] || (VISTAS[nombre].visible && !VISTAS[nombre].visible())) nombre = vistaInicial();
  pintarTabs(nombre);
  document.title = `${VISTAS[nombre].txt} · Señalética`;

  if (typeof limpiarVista === 'function') limpiarVista();
  limpiarVista = null;
  const app = $('#app');
  app.innerHTML = cargando();
  try {
    const cont = document.createElement('div');
    cont.className = 'vista-entra';
    app.replaceChildren(cont);
    limpiarVista = await VISTAS[nombre].fn(cont);
    if (abrirPedido) verPedido(abrirPedido);
    if (nombre !== 'notificaciones') actualizarBadge();
  } catch (e) {
    if (e instanceof ErrorSesion) return;
    app.innerHTML = `<div role="alert" class="alert alert-error alert-soft">${icono('circle-alert', 'size-5')}
      <div><h3 class="font-semibold">No se pudo cargar la vista</h3><p class="text-sm">${esc(e.message)}</p></div></div>`;
  }
}

// ── Barra superior ──────────────────────────────────────────────────────
function pintarUsuario() {
  const me = store.me;
  const inicial = esc((me?.nombre || '?').trim().charAt(0).toUpperCase());
  const area = me?.area ? AREA_TXT[me.area] : (me?.es_admin ? 'Administrador' : me?.es_logistica ? 'Logística' : 'Solo consulta');
  const esErp = store.config.modo === 'erp';
  $('#usuarioBox').innerHTML = `
    <div tabindex="0" role="button" class="btn btn-ghost btn-sm gap-2 px-2" aria-label="Mi sesión">
      <div class="avatar avatar-placeholder"><div class="bg-primary text-primary-content w-7 rounded-full"><span class="text-xs">${inicial}</span></div></div>
      <span class="hidden lg:flex flex-col items-start leading-tight">
        <span class="text-xs font-semibold max-w-36 truncate">${esc(me?.nombre || '')}</span>
        <span class="text-[11px] text-base-content/60">${esc(area)}</span>
      </span>
    </div>
    <div tabindex="0" class="dropdown-content z-40 mt-2 w-72 rounded-box bg-base-100 shadow-lg border border-base-300 p-4 text-sm">
      <div class="flex items-center gap-3 mb-3">
        <div class="avatar avatar-placeholder"><div class="bg-primary text-primary-content w-10 rounded-full"><span>${inicial}</span></div></div>
        <div class="min-w-0"><p class="font-semibold truncate">${esc(me?.nombre || '')}</p>
          <p class="text-base-content/60 text-xs truncate">${esc(me?.email || '')}</p></div>
      </div>
      <div class="flex flex-wrap gap-1 mb-3">
        <span class="badge badge-sm ${me?.area ? 'badge-primary' : 'badge-ghost'}">${esc(area)}</span>
        ${me?.es_admin ? '<span class="badge badge-sm badge-secondary">Administrador</span>' : ''}
        ${me?.es_logistica ? '<span class="badge badge-sm badge-accent">Logística</span>' : ''}
        ${esErp ? `<span class="badge badge-sm badge-outline">ERP${me?.rol_erp ? ' · ' + esc(me.rol_erp) : ''}</span>` : ''}
      </div>
      ${esErp && me?.erp_area ? `<p class="text-xs text-base-content/60 mb-3">Área en RRHH: ${esc(me.erp_area)}</p>` : ''}
      ${!me?.area && !me?.es_admin && !me?.es_logistica ? `<p class="text-xs text-warning mb-3">Tu área del ERP no tiene equivalente aquí. Un administrador puede asignarte un área en Catálogos.</p>` : ''}
      <div class="flex flex-col gap-1">
        ${esErp
          ? `<a class="btn btn-sm btn-ghost justify-start solo-independiente" href="/" target="_top">${icono('house')}Volver al ERP</a>`
          : `<button class="btn btn-sm btn-ghost justify-start" data-cambiar>${icono('users')}Cambiar colaborador</button>
             <button class="btn btn-sm btn-ghost justify-start text-error" data-salir>${icono('log-out')}Cerrar sesión</button>`}
      </div>
    </div>`;
  $('#usuarioBox [data-cambiar]')?.addEventListener('click', () => { LS.set('senales_token', null); location.reload(); });
  $('#usuarioBox [data-salir]')?.addEventListener('click', () => { LS.set('senales_token', null); location.reload(); });
}

function pintarTemas() {
  const actual = document.documentElement.getAttribute('data-theme');
  $('#temaBox').innerHTML = `
    <div tabindex="0" role="button" class="btn btn-ghost btn-circle btn-sm" title="Tema" aria-label="Cambiar tema">${icono('palette')}</div>
    <ul tabindex="0" class="dropdown-content menu z-40 mt-2 w-44 rounded-box bg-base-100 shadow-lg border border-base-300 p-2">
      ${TEMAS.map((t) => `<li><button data-tema="${t}" class="${t === actual ? 'menu-active' : ''}">
        <span class="flex gap-0.5" data-theme="${t}"><span class="size-2.5 rounded-full bg-primary"></span><span class="size-2.5 rounded-full bg-secondary"></span><span class="size-2.5 rounded-full bg-accent"></span></span>
        ${t}</button></li>`).join('')}
    </ul>`;
  $('#temaBox').querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', () => {
    guardarTema(b.dataset.tema);
    pintarTemas();
  }));
}

// ── Pantallas sin sesión ────────────────────────────────────────────────
function pantallaSesionErp(mensaje) {
  document.querySelector('header')?.classList.add('hidden');
  const login = store.config.erp?.login || '/login';
  $('#app').innerHTML = `
    <div class="min-h-[70vh] grid place-items-center">
      <div class="card bg-base-100 shadow-sm border border-base-300 max-w-md w-full">
        <div class="card-body items-center text-center gap-3">
          <span class="grid place-items-center size-14 rounded-full bg-warning/15 text-warning">${icono('log-in', 'size-7')}</span>
          <h1 class="card-title">Inicia sesión en el ERP</h1>
          <p class="text-sm text-base-content/70">${esc(mensaje || 'Tu sesión del ERP no está activa o venció.')}</p>
          <p class="text-xs text-base-content/60">Señalética usa la misma cuenta del sistema de RRHH. Al ingresar allí vuelves aquí sin otra contraseña.</p>
          <div class="card-actions mt-2">
            <a class="btn btn-primary" href="${esc(login)}" target="_top">${icono('log-in')}Ir al inicio de sesión</a>
            <button class="btn btn-ghost" data-reintentar>${icono('refresh-cw')}Reintentar</button>
          </div>
        </div>
      </div>
    </div>`;
  $('#app [data-reintentar]').onclick = () => location.reload();
}

async function pantallaLoginLocal() {
  document.querySelector('header')?.classList.add('hidden');
  const app = $('#app');
  app.innerHTML = cargando();
  let colabs = [];
  try { colabs = await api('auth/colaboradores', { reintento: false }); } catch (e) {
    app.innerHTML = `<div role="alert" class="alert alert-error">${esc(e.message)}</div>`;
    return;
  }
  const grupos = ['OPERACIONES', 'MARKETING', 'PRODUCCION'].map((a) => {
    const lista = colabs.filter((c) => c.area === a);
    if (!lista.length) return '';
    return `<div><h2 class="text-xs font-semibold uppercase tracking-wide text-base-content/60 mb-2">${AREA_TXT[a]}</h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">${lista.map((c) => `
        <button class="btn h-auto py-3 flex-col gap-1 btn-outline" data-login="${c.id_colaborador}">
          <span class="avatar avatar-placeholder"><span class="bg-primary text-primary-content w-9 rounded-full grid place-items-center">${esc(c.nombre.charAt(0).toUpperCase())}</span></span>
          <span class="text-sm normal-case">${esc(c.nombre)}</span></button>`).join('')}</div></div>`;
  }).join('');
  app.innerHTML = `
    <div class="min-h-[75vh] grid place-items-center">
      <div class="card bg-base-100 shadow-sm border border-base-300 max-w-2xl w-full">
        <div class="card-body gap-5">
          <div><h1 class="card-title text-xl">¿Quién está trabajando?</h1>
            <p class="text-sm text-base-content/70">Modo local (sin ERP). Elige tu nombre para registrar pedidos, avances y tiempos.</p></div>
          ${grupos || '<p class="text-sm">No hay colaboradores activos. Carga datos con <code>npm run db:demo</code>.</p>'}
        </div>
      </div>
    </div>`;
  app.querySelectorAll('[data-login]').forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    try {
      const r = await api('auth/login', { method: 'POST', body: { id_colaborador: Number(b.dataset.login) }, reintento: false });
      LS.set('senales_token', r.token);
      location.hash = '#/';
      location.reload();
    } catch (e) {
      toast(e.message, 'error');
      b.disabled = false;
    }
  }));
}

// ── Arranque ────────────────────────────────────────────────────────────
async function iniciar() {
  store.embebido = document.documentElement.hasAttribute('data-embebido');
  aplicarTema();
  // Si el ERP cambia el tema en otra pestaña o en la ventana que contiene el iframe
  window.addEventListener('storage', (e) => { if (e.key === 'theme') { aplicarTema(e.newValue); pintarTemas(); } });
  // El ERP (página que contiene el iframe) avisa cuando el usuario cambia de tema
  window.addEventListener('message', (e) => {
    if (e.origin === location.origin && e.data?.tipo === 'senales:tema' && e.data.tema) aplicarTema(e.data.tema);
  });
  $('#notifIco').innerHTML = icono('bell', 'size-5');

  try {
    store.config = await api('auth/config', { reintento: false });
  } catch (e) {
    $('#app').innerHTML = `<div role="alert" class="alert alert-error">${icono('circle-alert', 'size-5')}
      <div><h3 class="font-semibold">Sin conexión con el servidor</h3><p class="text-sm">${esc(e.message)}</p></div></div>`;
    return;
  }

  document.addEventListener('sesion-expirada', (ev) => {
    if (store.config.modo === 'erp') pantallaSesionErp(ev.detail);
    else { LS.set('senales_token', null); pantallaLoginLocal(); }
  });

  try {
    store.me = await api('auth/me');
  } catch (e) {
    if (e instanceof ErrorSesion) return; // el evento ya mostró la pantalla
    $('#app').innerHTML = `<div role="alert" class="alert alert-error">${esc(e.message)}</div>`;
    return;
  }

  await cargarCatalogos();
  pintarUsuario();
  pintarTemas();
  window.addEventListener('hashchange', navegar);
  navegar();
  setInterval(() => actualizarBadge(), 60_000);
}

document.addEventListener('DOMContentLoaded', iniciar);
