import path from 'node:path';
import { tx } from '../config/database.js';
import { HttpError } from '../utils/http-error.js';

export default class SenalService {
  constructor(senalRepository, sharepointService = null) {
    this.senalRepository = senalRepository;
    this.sharepointService = sharepointService;
  }

  /**
   * Sube un archivo de imagen a SharePoint (carpeta /Senales) mediante Microsoft Graph API
   * y retorna el webUrl público/compartido.
   */
  async subirArchivoSharePoint(file, nombreSugerido = 'senal') {
    if (!this.sharepointService) {
      throw new HttpError(500, 'El servicio de SharePoint no está disponible o configurado.');
    }

    try {
      const folder = await this.sharepointService.ensureFolderPath('/Marketing');
      const ext = path.extname(file.originalname || '') || '.jpg';
      const cleanName = (nombreSugerido || 'senal')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 40) || 'senal';
      const fileName = `${cleanName}_${Date.now()}${ext}`;

      const uploadResult = await this.sharepointService.uploadFile({
        folderId: folder.id,
        fileName,
        fileBuffer: file.buffer,
        mimeType: file.mimetype || 'image/jpeg',
      });

      return {
        id: uploadResult.id,
        name: uploadResult.name,
        webUrl: uploadResult.webUrl,
      };
    } catch (spError) {
      console.error('Error al subir imagen a SharePoint:', spError);
      throw new HttpError(500, `No se pudo subir la imagen a SharePoint: ${spError.message}`);
    }
  }

  async obtenerTodas({ soloActivos = false, q = '' } = {}) {
    return this.senalRepository.findAll({ soloActivos, q });
  }

  async obtenerPorId(id) {
    const senal = await this.senalRepository.findById(id);
    if (!senal) throw new HttpError(404, 'Señal no encontrada.');
    return senal;
  }

  async crear(data, stockInicial = 0, idColaborador = null, file = null) {
    // Normalizar imagen_referencial desde imagen_url si aplica (sin archivo)
    if (!file && data.imagen_url && !data.imagen_referencial) {
      data.imagen_referencial = data.imagen_url;
    }

    // 1️⃣ Primero guardar la señal en BD (sin imagen de SharePoint aún)
    let senal = await tx(async (client) => {
      const res = await this.senalRepository.create(data, client);
      const id = res.id_senal;

      if (stockInicial > 0) {
        await this.senalRepository.insertMovimientoStock(
          {
            id_senal: id,
            tipo: 'ENTRADA',
            cantidad: stockInicial,
            id_colaborador: idColaborador,
            observacion: 'Stock inicial',
          },
          client
        );
      }

      return this.senalRepository.findById(id, client);
    });

    // 2️⃣ Si hay archivo, subirlo a SharePoint y actualizar el registro
    if (file) {
      try {
        const uploadResult = await this.subirArchivoSharePoint(file, data.nombre || senal.nombre);
        senal = await this.senalRepository.update(senal.id_senal, {
          imagen_referencial: uploadResult.webUrl,
        });
      } catch (spError) {
        // La señal ya está guardada; se registra el error pero no se revierte
        console.error(`[SenalService] Señal id=${senal.id_senal} creada, pero falló la subida a SharePoint:`, spError.message);
        // Devolvemos la señal sin imagen (el usuario puede reintentar la imagen luego)
      }
    }

    return senal;
  }

  async actualizar(id, data, file = null) {
    // Si se subió un nuevo archivo físico desde la PC, guardarlo en SharePoint
    if (file) {
      const uploadResult = await this.subirArchivoSharePoint(file, data.nombre);
      data.imagen_referencial = uploadResult.webUrl;
    } else if (data.imagen_referencial === undefined && data.imagen_url === undefined) {
      // Si no se proporcionó ni archivo ni campo de imagen, conservar la imagen actual
      const actual = await this.senalRepository.findById(id);
      if (actual) {
        data.imagen_referencial = actual.imagen_referencial;
      }
    } else if (data.imagen_url && !data.imagen_referencial) {
      data.imagen_referencial = data.imagen_url;
    }

    const senal = await this.senalRepository.update(id, data);
    if (!senal) throw new HttpError(404, 'Señal no encontrada.');
    return senal;
  }

  async cambiarActivo(id, activo) {
    const senal = await this.senalRepository.patchActivo(id, activo);
    if (!senal) throw new HttpError(404, 'Señal no encontrada.');
    return senal;
  }

  async obtenerKardex(id) {
    return this.senalRepository.getKardex(id);
  }

  async registrarMovimientoManual({ id_senal, tipo, cantidad, id_colaborador, observacion }) {
    if (cantidad === 0) {
      throw new HttpError(400, 'La cantidad no puede ser 0.');
    }
    if (tipo === 'ENTRADA' && cantidad < 0) {
      throw new HttpError(400, 'Una ENTRADA debe ser positiva; usa AJUSTE para restar.');
    }

    return this.senalRepository.insertMovimientoStock({
      id_senal,
      tipo,
      cantidad,
      id_colaborador,
      observacion,
    });
  }
}

