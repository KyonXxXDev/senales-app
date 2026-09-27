import SharepointRepository from '../repository/sharepoint.repository.js';

export default class SharepointService {
  constructor(options = {}) {
    this.repository = options.repository || new SharepointRepository();
  }

  async request({ url, method = 'GET', headers = {}, body = null }) {
    return this.repository.request({ url, method, headers, body });
  }

  async getSite() {
    return this.repository.getSite();
  }

  async getDrive() {
    return this.repository.getDrive();
  }

  async getFolder({ folderId }) {
    return this.repository.getFolder({ folderId });
  }

  async getChildren({ folderId }) {
    return this.repository.getChildren({ folderId });
  }

  async findByName({ folderId, name }) {
    return this.repository.findByName({ folderId, name });
  }

  async createFolder({ parentFolderId, name }) {
    return this.repository.createFolder({ parentFolderId, name });
  }

  async createFolderIfNotExists({ parentFolderId, name }) {
    return this.repository.createFolderIfNotExists({ parentFolderId, name });
  }

  async uploadFile({ folderId, fileName, fileBuffer, mimeType = 'application/octet-stream' }) {
    return this.repository.uploadFile({ folderId, fileName, fileBuffer, mimeType });
  }

  async getFile({ fileId }) {
    return this.repository.getFile({ fileId });
  }

  async getFileContent({ fileId }) {
    return this.repository.getFileContent({ fileId });
  }

  async getFileContentByPath({ path }) {
    return this.repository.getFileContentByPath({ path });
  }

  async deleteItem({ itemId }) {
    return this.repository.deleteItem({ itemId });
  }

  async ensureFolderPath(folderPath) {
    const segments = String(folderPath)
      .split('/')
      .map(segment => segment.trim())
      .filter(Boolean);

    let parentFolderId = 'root';
    let currentFolder = null;

    for (const segment of segments) {
      currentFolder = await this.repository.findByName({ folderId: parentFolderId, name: segment });
      if (!currentFolder) {
        currentFolder = await this.repository.createFolder({ parentFolderId, name: segment });
      }
      parentFolderId = currentFolder.id;
    }

    return currentFolder;
  }

  /**
   * Registra un item en una lista de SharePoint.
   */
  async createListItem({ fields }) {
    if (!fields || typeof fields !== 'object') {
      throw new Error(
        'Los campos del item son requeridos'
      );
    }

    return this.repository.createListItem({
      fields
    });
  }

  async updateListItem({ itemId, fields }) {
    if (!itemId) {
      throw new Error(
        'El itemId del item es requerido'
      );
    }

    if (!fields || typeof fields !== 'object') {
      throw new Error(
        'Los campos del item son requeridos'
      );
    }

    return this.repository.updateListItem({
      itemId,
      fields
    });
  }

  async deleteListItem({ itemId }) {
    return this.repository.deleteListItem({
      itemId
    });
  }
}

