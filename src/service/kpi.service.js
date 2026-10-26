export default class KpiService {
  constructor(kpiRepository) {
    this.kpiRepository = kpiRepository;
  }

  async obtenerKpis() {
    return this.kpiRepository.getKpisCompletos();
  }
}

