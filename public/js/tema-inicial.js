/* Aplica el tema antes de pintar (evita parpadeo). Comparte la clave "theme" con el ERP. */
(function () {
  var t = 'light';
  try { t = localStorage.getItem('theme') || 'light'; } catch (e) { /* sin storage */ }
  document.documentElement.setAttribute('data-theme', t);
  var embebido = false;
  try { embebido = window.self !== window.top; } catch (e) { embebido = true; }
  if (embebido || /[?&]embed=1/.test(location.search)) document.documentElement.setAttribute('data-embebido', '');
})();
