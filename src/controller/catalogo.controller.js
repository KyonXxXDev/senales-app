export default class CatalogoController {
  constructor(catalogoService) {
    this.catalogoService = catalogoService;
  }

  getCatalogos = async (req, res) => {
    const data = await this.catalogoService.obtenerCatalogos();
    res.json(data);
  };
}

