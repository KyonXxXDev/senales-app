export default class CatalogoService {
  constructor(catalogoRepository) {
    this.catalogoRepository = catalogoRepository;
  }

  async obtenerCatalogos() {
    return this.catalogoRepository.getCatalogosCompletos();
  }
}

