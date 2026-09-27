export default class KpiController {
  constructor(kpiService) {
    this.kpiService = kpiService;
  }

  getKpis = async (req, res) => {
    const data = await this.kpiService.obtenerKpis();
    res.json(data);
  };
}

