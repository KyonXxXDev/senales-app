import { SP_DRIVE_ID, SP_LIST_ID, SP_SITE_ID } from '../config/env.config.js';
import { obtenerToken } from '../utils/microsft/sharepoint.auth.js';

export default class SharepointRepository {
  constructor() {
    if (!SP_DRIVE_ID) {
      console.warn('⚠️ [SharePoint] SHAREPOINT_DRIVE_ID no está configurado en las variables de entorno.');
    }

    if (!SP_SITE_ID) {
      console.warn('⚠️ [SharePoint] SHAREPOINT_SITE_ID no está configurado en las variables de entorno.');
    }
  }

  ensureConfigured() {
    if (!SP_DRIVE_ID) {
      throw new Error('SHAREPOINT_DRIVE_ID no está configurado');
    }
    if (!SP_SITE_ID) {
      throw new Error('SHAREPOINT_SITE_ID no está configurado');
    }
  }

  /**
     * Ejecuta una petición contra Microsoft Graph.
     */
  async request({
    url,
    method = 'GET',
    headers = {},
    body = null
  }) {
    const token = await obtenerToken();

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...headers
      },
      body
    });

    const contentType =
      response.headers.get('content-type') || '';

    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.arrayBuffer();

    if (!response.ok) {
      const message =
        data?.error?.message ||
        'Error en Microsoft Graph';

      throw new Error(
        `SharePoint: ${message}`
      );
    }

    return {
      data,
      headers: response.headers,
      status: response.status
    };
  }

  /**
     * Obtiene información del sitio.
     */
  async getSite() {
    const url =
      `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}`;

    const { data } = await this.request({
      url
    });

    return data;
  }

  /**
     * Obtiene información del Drive.
     */
  async getDrive() {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}`;

    const { data } = await this.request({
      url
    });

    return data;
  }

  /**
     * Obtiene una carpeta por ID.
     */
  async getFolder({ folderId }) {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${folderId}`;

    const { data } = await this.request({
      url
    });

    return data;
  }

  /**
     * Lista los elementos de una carpeta.
     */
  async getChildren({ folderId }) {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${folderId}/children`;

    const { data } = await this.request({
      url
    });

    return data.value;
  }

  /**
     * Busca un elemento dentro de una carpeta.
     */
  async findByName({
    folderId,
    name
  }) {
    const children = await this.getChildren({
      folderId
    });

    return children.find(
      item => item.name === name
    ) || null;
  }

  /**
     * Crea una carpeta.
     */
  async createFolder({
    parentFolderId,
    name
  }) {
    const sanitizedName = String(name)
      .replace(/[/\\:*?"<>|~%&#]/g, '_')
      .trim();

    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${parentFolderId}/children`;

    const { data } = await this.request({
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: sanitizedName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail'
      })
    });

    return data;
  }

  /**
     * Crea una carpeta si todavía no existe.
     */
  async createFolderIfNotExists({
    parentFolderId,
    name
  }) {
    const sanitizedName = String(name)
      .replace(/[/\\:*?"<>|~%&#]/g, '_')
      .trim();

    const existing = await this.findByName({
      folderId: parentFolderId,
      name: sanitizedName
    });

    if (existing) {
      return existing;
    }

    return this.createFolder({
      parentFolderId,
      name: sanitizedName
    });
  }

  /**
     * Sube un archivo.
     *
     * fileBuffer debe ser un Buffer.
     */
  async uploadFile({
    folderId,
    fileName,
    fileBuffer,
    mimeType = 'application/octet-stream'
  }) {
    const sanitizedFileName = String(fileName)
      .replace(/[/\\:*?"<>|~%&#]/g, '_')
      .trim();

    const encodedFileName =
      encodeURIComponent(sanitizedFileName);

    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${folderId}:/${encodedFileName}:/content?@microsoft.graph.conflictBehavior=rename`;

    const { data } = await this.request({
      url,
      method: 'PUT',
      headers: {
        'Content-Type': mimeType
      },
      body: fileBuffer
    });

    return data;
  }

  /**
     * Obtiene información de un archivo.
     */
  async getFile({ fileId }) {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${fileId}`;

    const { data } = await this.request({
      url
    });

    return data;
  }

  /**
   * Obtener el contenido de un archivo del sharepoint por ID.
   */
  async getFileContent({ fileId }) {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${fileId}/content`;

    const { data, headers } =
      await this.request({
        url
      });

    return {
      buffer: Buffer.from(data),
      contentType:
        headers.get('content-type') ||
        'application/octet-stream'
    };
  }

  /**
   * Obtener el contenido de un archivo de SharePoint directamente por ruta relativa al drive.
   */
  async getFileContentByPath({ path }) {
    const cleanPath = String(path).replace(/^\/+/, '');
    const encodedPath = cleanPath.split('/').map(encodeURIComponent).join('/');
    const url = `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}/root:/${encodedPath}:/content`;

    const { data, headers } = await this.request({
      url
    });

    return {
      buffer: Buffer.from(data),
      contentType:
        (headers?.get ? headers.get('content-type') : headers?.['content-type']) ||
        'image/jpeg'
    };
  }

  /**
   * Elimina un item por ID.
   */
  async deleteItem({ itemId }) {
    const url =
      `https://graph.microsoft.com/v1.0/drives/${SP_DRIVE_ID}` +
      `/items/${itemId}`;

    await this.request({
      url,
      method: 'DELETE'
    });

    return true;
  }

  /**
   * Crea un ítem en una lista de SharePoint.
   * @param {object} fields - Campos del ítem.
   */
  async createListItem({ fields }) {
    const token = await obtenerToken();
    const url = `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/items`;
    
    let currentFields = { ...fields };
    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      attempts++;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: currentFields })
      });
      const body = await response.text();

      if (response.ok) {
        try {
          const json = JSON.parse(body);
          return { ok: true, data: json, id: json.id };
        } catch {
          return { ok: true, data: { raw: body } };
        }
      }

      let detail = body;
      try { detail = JSON.parse(body).error?.message || body; } catch { }

      // Si SharePoint rechaza algún campo que aún no existe en la lista
      const match = detail.match(/Field '([^']+)' is not recognized/i) || 
                    detail.match(/Field '([^']+)' does not exist/i) ||
                    detail.match(/Column '([^']+)' does not exist/i);

      if (match && match[1] && currentFields[match[1]] !== undefined) {
        const unrecognizedField = match[1];
        console.warn(`[SharePoint] La columna '${unrecognizedField}' no está configurada aún en la lista de SharePoint. Omitiendo para guardar las demás columnas.`);
        delete currentFields[unrecognizedField];
        continue;
      }

      return { ok: false, reason: detail };
    }

    return { ok: false, reason: 'Exceeded maximum attempts' };
  }

  /**
   * Actualiza un ítem existente en una lista de SharePoint.
   * @param {string} itemId - ID del ítem a actualizar.
   * @param {object} fields - Campos a actualizar.
   */
  async updateListItem({ itemId, fields }) {
    const token = await obtenerToken();
    const url = `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}/lists/${SP_LIST_ID}/items/${itemId}`;

    let currentFields = { ...fields };
    // Omitir campos null o undefined
    Object.keys(currentFields).forEach(k => {
      if (currentFields[k] === undefined || currentFields[k] === null) {
        delete currentFields[k];
      }
    });

    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
      attempts++;
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ fields: currentFields })
      });
      const body = await response.text();

      if (response.ok) {
        try {
          const json = JSON.parse(body);
          return { ok: true, data: json, id: json.id };
        } catch {
          return { ok: true, data: { raw: body } };
        }
      }

      let detail = body;
      try { detail = JSON.parse(body).error?.message || body; } catch { }

      // Si SharePoint rechaza algún campo que aún no existe en la lista
      const match = detail.match(/Field '([^']+)' is not recognized/i) || 
                    detail.match(/Field '([^']+)' does not exist/i) ||
                    detail.match(/Column '([^']+)' does not exist/i);

      if (match && match[1] && currentFields[match[1]] !== undefined) {
        const unrecognizedField = match[1];
        console.warn(`[SharePoint] La columna '${unrecognizedField}' no está configurada aún en la lista de SharePoint. Omitiendo para actualizar las demás columnas.`);
        delete currentFields[unrecognizedField];
        continue;
      }

      return { ok: false, reason: detail };
    }

    return { ok: false, reason: 'Exceeded maximum attempts' };
  }

  async deleteListItem({ itemId }) {
    const token = await obtenerToken();

    const url =
      `https://graph.microsoft.com/v1.0/sites/${SP_SITE_ID}` +
      `/lists/${SP_LIST_ID}/items/${itemId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const body = await response.text();

      let detail = body;

      try {
        detail =
          JSON.parse(body).error?.message || body;
      } catch { }

      throw new Error(
        `SharePoint: ${detail}`
      );
    }

    return true;
  }

}