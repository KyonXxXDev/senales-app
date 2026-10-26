import { api, esc, fmt, prioridad, etiquetaEtapa, icono, AREA_TXT, vacio } from '../core.js';

/** Resuelve un color CSS (variables de DaisyUI, color-mix) a un valor que entiende <canvas> */
function color(expr) {
  const probe = document.createElement('span');
  probe.style.color = expr.startsWith('--') ? `var(${expr})` : expr;
  probe.style.display = 'none';
  document.body.append(probe);
  const v = getComputedStyle(probe).color;
  probe.remove();
  return v;
}

export default async function dashboard(el) {
  const k = await api('kpis');
  const r = k.resumen;
  let charts = [];
  const cobertura = r.unidades ? Math.round((1000 * r.unidades_desde_stock) / r.unidades) / 10 : null;

  const stat = (titulo, valor, desc, ico, cls = '') => `<div class="stat">
    <div class="stat-figure ${cls}">${icono(ico, 'size-8')}</div>
    <div class="stat-title">${titulo}</div><div class="stat-value text-3xl ${cls}">${valor}</div><div class="stat-desc">${desc}</div></div>`;
  const tarjeta = (titulo, contenido, extra = '') => `<section class="card bg-base-100 border border-base-300 shadow-sm ${extra}">
    <div class="card-body p-4 gap-3"><h2 class="card-title text-base">${titulo}</h2>${contenido}</div></section>`;
  const tabla = (cab, filas, vacioTxt = 'Sin datos') => (filas.length
    ? `<div class="overflow-x-auto"><table class="table table-sm"><thead><tr>${cab}</tr></thead><tbody>${filas.join('')}</tbody></table></div>`
    : vacio(vacioTxt));

  el.innerHTML = `
    <div class="mb-4">
      <h1 class="text-xl font-bold flex items-center gap-2">${icono('layout-dashboard', 'size-5')}Dashboard</h1>
      <p class="text-sm text-base-content/70">Indicadores de pedidos, stock y tiempos de Marketing y Producción.</p>
    </div>
    <div class="grid gap-4 md:grid-cols-2 mb-4">
      <div class="stats stats-vertical sm:stats-horizontal bg-base-100 border border-base-300 shadow-sm">
        ${stat('Pedidos activos', r.pendientes + r.en_proceso, `${r.pendientes} pendientes · ${r.en_proceso} en proceso`, 'clipboard-list', 'text-primary')}
        ${stat('Listos para entregar', r.listos, `${r.entregados} ya entregados`, 'truck', 'text-success')}
        ${stat('Avance de líneas', fmt.pct(r.avance_pct), 'finalizadas / total', 'circle-check')}
      </div>
      <div class="stats stats-vertical sm:stats-horizontal bg-base-100 border border-base-300 shadow-sm">
        ${stat('Cubierto con stock', fmt.pct(cobertura), `${r.unidades_desde_stock} de ${r.unidades} unidades`, 'boxes')}
        ${stat('Entregas a tiempo', fmt.pct(r.cumplimiento_pct), r.cumplimiento_pct === null ? 'requiere fecha requerida' : `${r.a_tiempo} a tiempo · ${r.tarde} tarde`, 'calendar')}
        ${stat('Señales sin stock', r.senales_sin_stock, 'activas en 0', 'triangle-alert', r.senales_sin_stock ? 'text-warning' : '')}
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2 mb-4">
      ${tarjeta('Líneas por estado global', '<div class="chart-box"><canvas id="cEstados" role="img" aria-label="Líneas por estado global"></canvas></div>')}
      ${tarjeta('Minutos por unidad, por etapa', '<div class="chart-box"><canvas id="cEtapas" role="img" aria-label="Minutos por unidad por etapa"></canvas></div>')}
      ${tarjeta('Unidades pedidas por sustrato', '<div class="chart-box"><canvas id="cMaterial" role="img" aria-label="Unidades por sustrato"></canvas></div>')}
      ${tarjeta('Unidades pedidas por vinil', '<div class="chart-box"><canvas id="cVinil" role="img" aria-label="Unidades por vinil"></canvas></div>')}
    </div>

    ${tarjeta('Rendimiento por etapa', tabla(
      '<th>Área</th><th>Etapa</th><th class="num">Sesiones</th><th class="num">Líneas</th><th class="num">Tiempo total</th><th class="num">Prom. / sesión</th><th class="num">Unidades</th><th class="num">Min / unidad</th><th class="num">m²</th>',
      k.etapas.map((e) => `<tr><td>${AREA_TXT[e.area]}</td><td>${esc(etiquetaEtapa(e.etapa))}</td><td class="num">${e.sesiones}</td>
        <td class="num">${e.lineas_trabajadas}</td><td class="num">${fmt.min(e.minutos_totales)}</td><td class="num">${fmt.min(e.minutos_promedio_sesion)}</td>
        <td class="num">${fmt.num(e.unidades)}</td><td class="num font-semibold">${fmt.num(e.minutos_por_unidad)}</td><td class="num">${fmt.num(e.m2_procesados)}</td></tr>`),
    ), 'mb-4')}

    <div class="grid gap-4 lg:grid-cols-2">
      ${tarjeta('Tiempo de ciclo por prioridad (horas)', tabla(
        '<th>Prioridad</th><th class="num">Finalizadas</th><th class="num">Espera Mkt</th><th class="num">Marketing</th><th class="num">Espera Prod</th><th class="num">Producción</th><th class="num">Ciclo</th>',
        k.cicloPrioridad.map((c) => `<tr><td>${prioridad(c.prioridad)}</td><td class="num">${c.lineas_finalizadas}</td>
          <td class="num">${fmt.num(c.espera_marketing_h)}</td><td class="num">${fmt.num(c.marketing_h)}</td><td class="num">${fmt.num(c.espera_produccion_h)}</td>
          <td class="num">${fmt.num(c.produccion_h)}</td><td class="num font-semibold">${fmt.num(c.ciclo_total_h)}</td></tr>`),
      ) + '<p class="text-xs text-base-content/60">Espera = desde el pedido (o desde que terminó Marketing) hasta que el área empezó.</p>')}
      ${tarjeta('Productividad por colaborador', tabla(
        '<th>Mes</th><th>Área</th><th>Colaborador</th><th class="num">Sesiones</th><th class="num">Horas</th><th class="num">Unidades</th><th class="num">Unid./h</th>',
        k.colaboradores.map((c) => `<tr><td class="whitespace-nowrap">${esc(String(c.mes).slice(0, 7))}</td><td>${AREA_TXT[c.area]}</td>
          <td>${esc(c.colaborador || 'Sin asignar')}</td><td class="num">${c.sesiones}</td><td class="num">${fmt.num(c.horas)}</td>
          <td class="num">${c.unidades}</td><td class="num font-semibold">${fmt.num(c.unidades_por_hora)}</td></tr>`),
      ))}
      ${tarjeta('Señales más pedidas', tabla(
        '<th>Señal</th><th>Medida</th><th class="num">Pedidas</th><th class="num">Stock</th>',
        k.topSenales.map((s) => `<tr><td><div class="font-medium">${esc(s.nombre)}</div><div class="text-xs text-base-content/60">${esc(s.material)} · ${esc(s.vinil)}</div></td>
          <td class="whitespace-nowrap">${fmt.medida(s.ancho_cm, s.alto_cm)}</td><td class="num">${s.unidades_pedidas}</td><td class="num">${s.stock}</td></tr>`),
      ))}
      ${tarjeta('Cobertura con stock por mes', tabla(
        '<th>Mes</th><th class="num">Pedidas</th><th class="num">De stock</th><th class="num">Producidas</th><th class="num">Cobertura</th>',
        k.cobertura.map((c) => `<tr><td>${esc(String(c.mes).slice(0, 7))}</td><td class="num">${c.unidades_pedidas}</td><td class="num">${c.unidades_desde_stock}</td>
          <td class="num">${c.unidades_producidas}</td><td class="num font-semibold">${fmt.pct(c.cobertura_stock_pct)}</td></tr>`),
      ))}
    </div>`;

  function dibujar() {
    charts.forEach((c) => c.destroy());
    charts = [];
    if (!window.Chart) return;
    const tinta = color('--color-base-content');
    const rejilla = color('color-mix(in oklab, var(--color-base-content) 12%, transparent)');
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.color = tinta;
    const base = (extra = {}) => ({
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'nearest' } },
      scales: {
        x: { beginAtZero: true, grid: { color: rejilla }, border: { display: false }, ticks: { precision: 0 } },
        y: { grid: { display: false }, border: { color: rejilla } },
      },
      ...extra,
    });
    const barra = (bg) => ({ backgroundColor: bg, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 });

    const colEstado = { PENDIENTE: color('--color-warning'), 'EN PROCESO': color('--color-info'), FINALIZADO: color('--color-success') };
    const txtEstado = { PENDIENTE: 'Pendiente', 'EN PROCESO': 'En proceso', FINALIZADO: 'Finalizado' };
    charts.push(new Chart(el.querySelector('#cEstados'), {
      type: 'bar',
      data: { labels: k.estados.map((e) => txtEstado[e.etiqueta] || e.etiqueta),
        datasets: [{ label: 'Líneas', data: k.estados.map((e) => e.lineas), ...barra(k.estados.map((e) => colEstado[e.etiqueta])) }] },
      options: base(),
    }));

    const et = k.etapas.filter((e) => e.minutos_por_unidad !== null);
    charts.push(new Chart(el.querySelector('#cEtapas'), {
      type: 'bar',
      data: {
        labels: et.map((e) => etiquetaEtapa(e.etapa)),
        datasets: [
          { label: 'Marketing', data: et.map((e) => (e.area === 'MARKETING' ? e.minutos_por_unidad : null)), ...barra(color('--color-primary')), skipNull: true },
          { label: 'Producción', data: et.map((e) => (e.area === 'PRODUCCION' ? e.minutos_por_unidad : null)), ...barra(color('--color-secondary')), skipNull: true },
        ],
      },
      options: base({ plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.num(c.raw)} min/unidad` } } } }),
    }));

    for (const [id, datos] of [['#cMaterial', k.material], ['#cVinil', k.vinil]]) {
      charts.push(new Chart(el.querySelector(id), {
        type: 'bar',
        data: { labels: datos.map((d) => d.etiqueta), datasets: [{ label: 'Unidades', data: datos.map((d) => d.unidades), ...barra(color('--color-primary')) }] },
        options: base(),
      }));
    }
  }

  // Chart.js se carga con defer: esperar si aún no está
  if (!window.Chart && document.readyState !== 'complete') {
    await new Promise((res) => window.addEventListener('load', res, { once: true }));
  }
  dibujar();
  const alCambiarTema = () => dibujar();
  document.addEventListener('tema-cambiado', alCambiarTema);
  return () => {
    document.removeEventListener('tema-cambiado', alCambiarTema);
    charts.forEach((c) => c.destroy());
  };
}
