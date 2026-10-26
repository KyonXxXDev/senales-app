/**
 * Compila el frontend estático:
 *   1. public/js/icons.js  -> íconos Lucide (ISC) usados por la app, como SVG en texto
 *   2. public/css/app.css  -> Tailwind CSS 4 + DaisyUI 5 (mismo stack que el ERP)
 * Uso: npm run build   (se ejecuta también dentro del Dockerfile)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONOS = [
  'plus', 'pencil', 'trash', 'x', 'check', 'check-check', 'search', 'refresh-cw', 'bell', 'user', 'users',
  'log-out', 'log-in', 'sun', 'moon', 'palette', 'play', 'square', 'clock', 'timer', 'package', 'boxes',
  'clipboard-list', 'megaphone', 'factory', 'layout-dashboard', 'settings', 'link', 'unlink', 'external-link',
  'triangle-alert', 'info', 'circle-check', 'rotate-ccw-clock', 'image', 'upload', 'truck', 'warehouse', 'layers',
  'chevron-down', 'chevron-right', 'arrow-right', 'list-filter', 'eye', 'file-pen', 'circle-x', 'shield-check',
  'ruler', 'hash', 'calendar', 'building', 'arrow-left-right', 'cloud-upload', 'printer', 'scissors',
  'circle-alert', 'badge-check', 'menu', 'house',
];

const camel = (n) => n.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
const attrs = (o) => Object.entries(o).map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`).join(' ');

async function iconos() {
  const salida = {};
  for (const nombre of ICONOS) {
    const archivo = path.join(raiz, 'node_modules', 'lucide', 'dist', 'esm', 'icons', `${nombre}.mjs`);
    if (!fs.existsSync(archivo)) throw new Error(`Ícono Lucide no encontrado: ${nombre}`);
    const nodos = (await import(pathToFileURL(archivo).href)).default;
    salida[nombre] = nodos.map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join('');
  }
  const js = `/* Íconos de Lucide (https://lucide.dev) — ISC License. Archivo generado por scripts/build-front.mjs */
const P = ${JSON.stringify(salida, null, 0)};
/** icono('plus', 'size-4') -> <svg> */
export function icono(nombre, clase = 'size-4') {
  const d = P[nombre];
  if (!d) return '';
  return \`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="\${clase}" aria-hidden="true">\${d}</svg>\`;
}
export const ICONOS = Object.keys(P);
`;
  fs.writeFileSync(path.join(raiz, 'public', 'js', 'icons.js'), js);
  console.log(`✔ ${ICONOS.length} íconos → public/js/icons.js`);
  return camel;
}

function css() {
  const cli = path.join(raiz, 'node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs');
  execFileSync(process.execPath, [cli, '-i', 'frontend/styles.css', '-o', 'public/css/app.css', '--minify'], {
    cwd: raiz, stdio: 'inherit',
  });
  console.log('✔ Tailwind + DaisyUI → public/css/app.css');
}

await iconos();
css();
