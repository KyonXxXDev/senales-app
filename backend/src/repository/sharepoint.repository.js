import { SP_DRIVE_ID, SP_SITE_ID } from '../config/env.config.js';
import { obtenerToken } from '../utils/sharepoint.auth.js';


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

}