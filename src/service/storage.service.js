import path from 'node:path';
import SharepointService from './sharepoint.service.js';

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const DATA_URI_PATTERN = /^data:([\w.+-]+\/[\w.+-]+);base64,(.+)$/s;
const UNSAFE_PATH_SEGMENTS = new Set(['', '.', '..']);

/**
 * Extrae la ruta relativa dentro del Drive de SharePoint (ej. 'Marketing/archivo.webp')
 * a partir de una URL web de SharePoint o una ruta almacenada.
 */
export function toDrivePath(reference) {
  if (!reference) return null;
  let decoded = safeDecodeURIComponent(String(reference).replace(/\\/g, '/').split('?')[0].trim());

  // Detectar bibliotecas habituales en SharePoint
  const markers = [
    '/Documentos compartidos/',
    '/Documentos%20compartidos/',
    '/Shared Documents/',
    '/Shared%20Documents/',
  ];
  for (const m of markers) {
    const idx = decoded.indexOf(m);
    if (idx !== -1) {
      decoded = decoded.slice(idx + m.length);
      break;
    }
  }

  // Si aún contiene protocolo, intentar ubicar carpetas conocidas
  if (/^https?:\/\//i.test(decoded)) {
    const folderMarkers = ['/Marketing/', '/Senales/', '/senales/'];
    for (const fm of folderMarkers) {
      const idx = decoded.indexOf(fm);
      if (idx !== -1) {
        decoded = decoded.slice(idx + 1);
        break;
      }
    }
  }

  decoded = decoded.replace(/^\/+/, '');
  if (/^https?:\/\//i.test(decoded)) return null;

  const segments = decoded.split('/');
  if (segments.some((s) => UNSAFE_PATH_SEGMENTS.has(s))) return null;

  return decoded || null;
}

/**
 * Servicio de almacenamiento y reverse proxy para archivos de SharePoint en Señalética.
 * Mantiene un caché en memoria (LRU / TTL) para evitar llamadas repetidas a Microsoft Graph.
 */
export default class StorageService {
  constructor({ sharepointService = null, cacheTtlMs = 10 * 60_000 } = {}) {
    this.sharepointService = sharepointService || new SharepointService();
    this.cacheTtlMs = cacheTtlMs;
    this.cache = new Map(); // clave -> { file: { buffer, contentType }, expira }
  }

  /**
   * Obtiene el contenido de un archivo desde SharePoint o data URI.
   *
   * @param {object} params
   * @param {string} [params.itemId] ID del archivo en SharePoint
   * @param {string} [params.storedPath] URL web de SharePoint o ruta relativa
   * @returns {Promise<{ buffer: Buffer, contentType: string } | null>}
   */
  async getFileContent({ itemId, storedPath }) {
    // 1. Intentar por item ID si existe
    if (itemId) {
      const cacheKey = `id:${itemId}`;
      const hit = this.cache.get(cacheKey);
      if (hit && hit.expira > Date.now()) return hit.file;

      try {
        const file = await this.sharepointService.getFileContent({ fileId: itemId });
        if (file?.buffer?.length) {
          const resultado = {
            buffer: file.buffer,
            contentType: file.contentType || 'image/jpeg',
          };
          this.cache.set(cacheKey, { file: resultado, expira: Date.now() + this.cacheTtlMs });
          return resultado;
        }
      } catch (err) {
        console.warn(`[StorageService] No se pudo obtener el item ${itemId} de SharePoint:`, err.message);
      }
    }

    if (!storedPath) return null;
    const ref = String(storedPath).trim();

    // 2. Data URI base64
    const dataUriMatch = ref.match(DATA_URI_PATTERN);
    if (dataUriMatch) {
      return {
        contentType: dataUriMatch[1],
        buffer: Buffer.from(dataUriMatch[2], 'base64'),
      };
    }

    // 3. SharePoint por ruta relativa
    const drivePath = toDrivePath(ref);
    if (!drivePath) return null;

    const cacheKey = `path:${drivePath}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expira > Date.now()) return hit.file;

    try {
      const file = await this.sharepointService.getFileContentByPath({ path: drivePath });
      if (file?.buffer?.length) {
        let contentType = file.contentType;
        if (!contentType || contentType === 'application/octet-stream') {
          contentType = getMimeType(drivePath);
        }
        const resultado = {
          buffer: file.buffer,
          contentType,
        };
        this.cache.set(cacheKey, { file: resultado, expira: Date.now() + this.cacheTtlMs });
        return resultado;
      }
    } catch (err) {
      console.warn(`[StorageService] No se encontró ${drivePath} en SharePoint:`, err.message);
    }

    return null;
  }

  limpiarCache() {
    this.cache.clear();
  }
}
