import { api, esc, fmt, prioridad, etiquetaEtapa } from '../core.js';

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

export default async function dashboard(el) {
  const k = await api('/kpis');
  const r = k.resumen;
  const charts = [];
  const cobertura = r.unidades ? (100 * r.unidades_desde_stock) / r.unidades : null;

  const tile = (label, value, sub) =>
    `<div class="card stat"><div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div></div>`;

  el.innerHTML = `
    <div class="page-head">
      <div><h1>Dashboard</h1><p>Indicadores de pedidos, stock y tiempos de Marketing y Producción.</p></div>
    </div>
    <div class="grid grid-3" style="margin-bottom:16px">
      ${tile('Pedidos activos', r.pendientes + r.en_proceso, `${r.pendientes} pendientes · ${r.en_proceso} en proceso`)}
      ${tile('Listos para entregar', r.listos, `${r.entregados} ya entregados`)}
      ${tile('Avance de líneas', fmt.pct(r.avance_pct), 'líneas finalizadas / total')}
      ${tile('Cubierto con stock', fmt.pct(cobertura === null ? null : Math.round(cobertura * 10) / 10), `${r.unidades_desde_stock} de ${r.unidades} unidades`)}
      ${tile('Entregas a tiempo', fmt.pct(r.cumplimiento_pct), r.cumplimiento_pct === null ? 'requiere fecha requerida' : `${r.a_tiempo} a tiempo · ${r.tarde} tarde`)}
      ${tile('Señales sin stock', r.senales_sin_stock, 'señales activas en 0')}
    </div>

    <div class="grid grid-2" style="margin-bottom:16px">
      <section class="card"><div class="card-head"><h2>Líneas por estado global</h2></div>
        <div class="card-body"><div class="chart-box"><canvas id="cEstados" aria-label="Líneas por estado"></canvas></div></div></section>
      <section class="card"><div class="card-head"><h2>Minutos por unidad, por etapa</h2></div>
        <div class="card-body"><div class="chart-box"><canvas id="cEtapas" aria-label="Minutos por unidad por etapa"></canvas></div></div></section>
      <section class="card"><div class="card-head"><h2>Unidades pedidas por material</h2></div>
        <div class="card-body"><div class="chart-box"><canvas id="cMaterial"></canvas></div></div></section>
      <section class="card"><div class="card-head"><h2>Unidades pedidas por vinil</h2></div>
        <div class="card-body"><div class="chart-box"><canvas id="cVinil"></canvas></div></div></section>
    </div>

    <section class="card" style="margin-bottom:16px"><div class="card-head"><h2>Rendimiento por etapa</h2></div>
      <div class="card-body flush table-wrap"><table>
        <thead><tr><th>Área</th><th>Etapa</th><th class="num">Sesiones</th><th class="num">Líneas</th><th class="num">Tiempo total</th>
          <th class="num">Prom. / sesión</th><th class="num">Unidades</th><th class="num">Min / unidad</th><th class="num">m² procesados</th></tr></thead>
        <tbody>${k.etapas.map((e) => `<tr><td>${e.area === 'MARKETING' ? 'Marketing' : 'Producción'}</td><td>${esc(etiquetaEtapa(e.etapa))}</td>
          <td class="num">${e.sesiones}</td><td class="num">${e.lineas_trabajadas}</td><td class="num">${fmt.min(e.minutos_totales)}</td>
          <td class="num">${fmt.min(e.minutos_promedio_sesion)}</td><td class="num">${fmt.num(e.unidades)}</td>
          <td class="num">${fmt.num(e.minutos_por_unidad)}</td><td class="num">${fmt.num(e.m2_procesados)}</td></tr>`).join('')}</tbody>
      </table></div></section>

    <div class="grid grid-2">
      <section class="card"><div class="card-head"><h2>Tiempo de ciclo por prioridad (horas)</h2></div>
        <div class="card-body flush table-wrap"><table>
          <thead><tr><th>Prioridad</th><th class="num">Finalizadas</th><th class="num">Espera Mkt</th><th class="num">Marketing</th>
            <th class="num">Espera Prod</th><th class="num">Producción</th><th class="num">Ciclo total</th></tr></thead>
          <tbody>${k.cicloPrioridad.map((c) => `<tr><td>${prioridad(c.prioridad)}</td><td class="num">${c.lineas_finalizadas}</td>
            <td class="num">${fmt.num(c.espera_marketing_h)}</td><td class="num">${fmt.num(c.marketing_h)}</td>
            <td class="num">${fmt.num(c.espera_produccion_h)}</td><td class="num">${fmt.num(c.produccion_h)}</td>
            <td class="num"><strong>${fmt.num(c.ciclo_total_h)}</strong></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin datos</td></tr>'}</tbody>
        </table></div>
        <p class="card-body muted small" style="margin:0">Espera = tiempo desde el pedido (o desde que terminó Marketing) hasta que el área empezó.</p></section>

      <section class="card"><div class="card-head"><h2>Productividad por colaborador</h2></div>
        <div class="card-body flush table-wrap"><table>
          <thead><tr><th>Mes</th><th>Área</th><th>Colaborador</th><th class="num">Sesiones</th><th class="num">Horas</th><th class="num">Unidades</th><th class="num">Unid./hora</th></tr></thead>
          <tbody>${k.colaboradores.map((c) => `<tr><td>${esc(c.mes.slice(0, 7))}</td><td>${c.area === 'MARKETING' ? 'Marketing' : 'Producción'}</td>
            <td>${esc(c.colaborador || 'Sin asignar')}</td><td class="num">${c.sesiones}</td><td class="num">${fmt.num(c.horas)}</td>
            <td class="num">${c.unidades}</td><td class="num">${fmt.num(c.unidades_por_hora)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sin datos</td></tr>'}</tbody>
        </table></div></section>

      <section class="card"><div class="card-head"><h2>Señales más pedidas</h2></div>
        <div class="card-body flush table-wrap"><table>
          <thead><tr><th>Señal</th><th>Medida</th><th class="num">Pedidas</th><th class="num">Stock</th></tr></thead>
          <tbody>${k.topSenales.map((s) => `<tr><td><strong>${esc(s.nombre)}</strong><div class="small muted">${esc(s.material)} · ${esc(s.vinil)}</div></td>
            <td class="nowrap">${fmt.medida(s.ancho_cm, s.alto_cm)}</td><td class="num">${s.unidades_pedidas}</td><td class="num">${s.stock}</td></tr>`).join('')
            || '<tr><td colspan="4" class="empty">Sin datos</td></tr>'}</tbody>
        </table></div></section>

      <section class="card"><div class="card-head"><h2>Cobertura con stock por mes</h2></div>
        <div class="card-body flush table-wrap"><table>
          <thead><tr><th>Mes</th><th class="num">Pedidas</th><th class="num">De stock</th><th class="num">Producidas</th><th class="num">Cobertura</th></tr></thead>
          <tbody>${k.cobertura.map((c) => `<tr><td>${esc(c.mes.slice(0, 7))}</td><td class="num">${c.unidades_pedidas}</td>
            <td class="num">${c.unidades_desde_stock}</td><td class="num">${c.unidades_producidas}</td><td class="num">${fmt.pct(c.cobertura_stock_pct)}</td></tr>`).join('')
            || '<tr><td colspan="5" class="empty">Sin datos</td></tr>'}</tbody>
        </table></div></section>
    </div>`;

  if (!window.Chart) return;
  const ink2 = css('--ink-2'), grid = css('--grid'), axis = css('--axis');
  Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  Chart.defaults.color = ink2;

  const base = (horizontal, extra = {}) => ({
    responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
    plugins: { legend: { display: false }, tooltip: { mode: 'nearest', intersect: false } },
    scales: {
      x: { grid: { color: horizontal ? grid : 'transparent' }, border: { color: axis }, beginAtZero: true, ticks: { precision: 0 } },
      y: { grid: { color: horizontal ? 'transparent' : grid }, border: { color: axis }, beginAtZero: true, ticks: { precision: 0 } },
    },
    ...extra,
  });
  const bar = (color) => ({ backgroundColor: color, borderRadius: 4, borderSkipped: 'start', maxBarThickness: 22 });

  // 1. Estados (colores de estado + etiqueta en el eje: nunca solo color)
  const colEstado = { PENDIENTE: css('--warning'), 'EN PROCESO': css('--series-1'), FINALIZADO: css('--good') };
  const txtEstado = { PENDIENTE: 'Pendiente', 'EN PROCESO': 'En proceso', FINALIZADO: 'Finalizado' };
  charts.push(new Chart(el.querySelector('#cEstados'), {
    type: 'bar',
    data: {
      labels: k.estados.map((e) => txtEstado[e.etiqueta] || e.etiqueta),
      datasets: [{ label: 'Líneas', data: k.estados.map((e) => e.lineas), ...bar(k.estados.map((e) => colEstado[e.etiqueta])) }],
    },
    options: base(true),
  }));

  // 2. Minutos por unidad por etapa, color = área (con leyenda)
  const et = k.etapas.filter((e) => e.minutos_por_unidad !== null);
  charts.push(new Chart(el.querySelector('#cEtapas'), {
    type: 'bar',
    data: {
      labels: et.map((e) => etiquetaEtapa(e.etapa)),
      datasets: [
        { label: 'Marketing', data: et.map((e) => (e.area === 'MARKETING' ? e.minutos_por_unidad : null)), ...bar(css('--series-1')), skipNull: true },
        { label: 'Producción', data: et.map((e) => (e.area === 'PRODUCCION' ? e.minutos_por_unidad : null)), ...bar(css('--series-2')), skipNull: true },
      ],
    },
    options: base(true, {
      plugins: { legend: { display: true, position: 'top', align: 'start', labels: { boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt.num(c.raw)} min/unidad` } } },
    }),
  }));

  // 3 y 4. Unidades por material / vinil (una sola serie)
  for (const [id, datos] of [['#cMaterial', k.material], ['#cVinil', k.vinil]]) {
    charts.push(new Chart(el.querySelector(id), {
      type: 'bar',
      data: { labels: datos.map((d) => d.etiqueta), datasets: [{ label: 'Unidades', data: datos.map((d) => d.unidades), ...bar(css('--series-1')) }] },
      options: base(true),
    }));
  }

  return () => charts.forEach((c) => c.destroy());
}
