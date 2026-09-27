import {
  $, $$, store, cargarCatalogos, esc, toast, api,
  actualizarUIUsuario, mostrarModalLogin, cerrarSesion, abrirModal, cerrarModal
} from './core.js';
import operaciones from './views/operaciones.js';
import trabajo from './views/trabajo.js';
import stock from './views/stock.js';
import dashboard from './views/dashboard.js';
import catalogos from './views/catalogos.js';

const VISTAS = {
  operaciones: (el) => operaciones(el),
  marketing: (el) => trabajo(el, 'MARKETING'),
  produccion: (el) => trabajo(el, 'PRODUCCION'),
  stock: (el) => stock(el),
  dashboard: (el) => dashboard(el),
  catalogos: (el) => catalogos(el),
};

let limpiarVista = null;

async function navegar() {
  const nombre = (location.hash.replace(/^#\/?/, '') || 'operaciones').split('?')[0];
  const vista = VISTAS[nombre] ? nombre : 'operaciones';
  $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === vista));
  if (typeof limpiarVista === 'function') limpiarVista();
  limpiarVista = null;
  const app = $('#app');
  app.innerHTML = '<p class="muted">Cargando…</p>';
  try {
    limpiarVista = await VISTAS[vista](app);
  } catch (e) {
    app.innerHTML = `<div class="card card-body"><strong>No se pudo cargar la vista.</strong><p class="muted">${esc(e.message)}</p></div>`;
  }
}

async function iniciar() {
  try {
    await cargarCatalogos();
  } catch (e) {
    $('#app').innerHTML = `<div class="card card-body"><strong>No hay conexión con el servidor o la base de datos.</strong>
      <p class="muted">${esc(e.message)}</p></div>`;
    return;
  }

  // Verificar sesión existente con token
  const token = localStorage.getItem('senales_token');
  if (token) {
    try {
      const me = await api('/auth/me');
      store.usuario = me.id_colaborador;
      store.colaborador = me;
    } catch {
      localStorage.removeItem('senales_token');
      localStorage.removeItem('senales_colab');
      store.usuario = null;
      store.colaborador = null;
    }
  }

  actualizarUIUsuario();

  // Si no hay colaborador identificado, mostrar el modal rápido de login
  if (!store.colaborador) {
    mostrarModalLogin(() => {
      navegar();
    });
  }

  // Botón en la barra superior para ver perfil o cambiar colaborador
  const btnPerfil = $('#btnPerfilUsuario');
  if (btnPerfil) {
    btnPerfil.addEventListener('click', () => {
      if (!store.colaborador) {
        mostrarModalLogin(() => navegar());
        return;
      }

      abrirModal({
        titulo: 'Sesión activa',
        cuerpo: `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
            <div class="user-avatar" style="width:48px;height:48px;font-size:20px">${store.colaborador.nombre.charAt(0).toUpperCase()}</div>
            <div>
              <h3 style="margin:0">${esc(store.colaborador.nombre)}</h3>
              <p class="muted" style="margin:2px 0 0">Área: <strong>${esc(store.colaborador.area)}</strong></p>
            </div>
          </div>
          <p class="muted small">Tus acciones de avance, tiempos y movimientos se registrarán a tu nombre.</p>
        `,
        pie: `
          <button type="button" class="btn secondary" id="btnModalCerrarSesion">Cerrar sesión</button>
          <button type="button" class="btn primary" id="btnModalCambiarUsuario">Cambiar colaborador</button>
        `,
        estrecho: true,
      });

      $('#btnModalCambiarUsuario').onclick = () => {
        cerrarModal();
        mostrarModalLogin(() => navegar());
      };

      $('#btnModalCerrarSesion').onclick = () => {
        cerrarSesion();
        cerrarModal();
        navegar();
      };
    });
  }

  window.addEventListener('hashchange', navegar);
  navegar();
}

document.addEventListener('DOMContentLoaded', iniciar);

