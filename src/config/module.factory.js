import { pool } from './database.js';
import { erpClient } from '../integrations/erp.client.js';

// Repositories
import AuthRepository from '../repository/auth.repository.js';
import ClienteRepository from '../repository/cliente.repository.js';
import ColaboradorRepository from '../repository/colaborador.repository.js';
import EtapaRepository from '../repository/etapa.repository.js';
import MaterialRepository from '../repository/material.repository.js';
import VinilRepository from '../repository/vinil.repository.js';
import CatalogoRepository from '../repository/catalogo.repository.js';
import SenalRepository from '../repository/senal.repository.js';
import PedidoRepository from '../repository/pedido.repository.js';
import TrabajoRepository from '../repository/trabajo.repository.js';
import KpiRepository from '../repository/kpi.repository.js';
import SharepointRepository from '../repository/sharepoint.repository.js';
import InsumoRepository from '../repository/insumo.repository.js';

// Services
import AuthService from '../service/auth.service.js';
import ClienteService from '../service/cliente.service.js';
import ColaboradorService from '../service/colaborador.service.js';
import EtapaService from '../service/etapa.service.js';
import MaterialService from '../service/material.service.js';
import VinilService from '../service/vinil.service.js';
import CatalogoService from '../service/catalogo.service.js';
import SenalService from '../service/senal.service.js';
import PedidoService from '../service/pedido.service.js';
import TrabajoService from '../service/trabajo.service.js';
import KpiService from '../service/kpi.service.js';
import SharepointService from '../service/sharepoint.service.js';
import StorageService from '../service/storage.service.js';
import NotificacionService from '../service/notificacion.service.js';
import IdentidadService from '../service/identidad.service.js';
import InsumoService from '../service/insumo.service.js';

// Controllers
import AuthController from '../controller/auth.controller.js';
import ClientController from '../controller/client.controller.js';
import ColaboradorController from '../controller/colaborador.controller.js';
import EtapaController from '../controller/etapa.controller.js';
import MaterialController from '../controller/material.controller.js';
import VinilController from '../controller/vinil.controller.js';
import CatalogoController from '../controller/catalogo.controller.js';
import SenalController from '../controller/senal.controller.js';
import PedidoController from '../controller/pedido.controller.js';
import TrabajoController from '../controller/trabajo.controller.js';
import KpiController from '../controller/kpi.controller.js';
import IntegracionController from '../controller/integracion.controller.js';

export function createModules(db = pool) {
  // 1. Repositorios
  const authRepository = new AuthRepository(db);
  const clienteRepository = new ClienteRepository(db);
  const colaboradorRepository = new ColaboradorRepository(db);
  const etapaRepository = new EtapaRepository(db);
  const materialRepository = new MaterialRepository(db);
  const vinilRepository = new VinilRepository(db);
  const catalogoRepository = new CatalogoRepository(db);
  const senalRepository = new SenalRepository(db);
  const pedidoRepository = new PedidoRepository(db);
  const trabajoRepository = new TrabajoRepository(db);
  const kpiRepository = new KpiRepository(db);
  const sharepointRepository = new SharepointRepository();
  const insumoRepository = new InsumoRepository(db);

  // 2. Servicios
  const authService = new AuthService(authRepository);
  const clienteService = new ClienteService(clienteRepository);
  const colaboradorService = new ColaboradorService(colaboradorRepository);
  const etapaService = new EtapaService(etapaRepository);
  const materialService = new MaterialService(materialRepository);
  const vinilService = new VinilService(vinilRepository);
  const catalogoService = new CatalogoService(catalogoRepository);
  const sharepointService = new SharepointService({ repository: sharepointRepository });
  const storageService = new StorageService({ sharepointService });
  const senalService = new SenalService(senalRepository, sharepointService, storageService);
  const notificacionService = new NotificacionService(db);
  const pedidoService = new PedidoService(pedidoRepository, senalRepository, notificacionService);
  const trabajoService = new TrabajoService(trabajoRepository, notificacionService);
  const kpiService = new KpiService(kpiRepository);
  const identidadService = new IdentidadService(db, erpClient);
  const insumoService = new InsumoService(insumoRepository, erpClient);

  // 3. Controladores
  const authController = new AuthController(authService);
  const clientController = new ClientController(clienteService);
  const colaboradorController = new ColaboradorController(colaboradorService);
  const etapaController = new EtapaController(etapaService);
  const materialController = new MaterialController(materialService);
  const vinilController = new VinilController(vinilService);
  const catalogoController = new CatalogoController(catalogoService);
  const senalController = new SenalController(senalService);
  const pedidoController = new PedidoController(pedidoService);
  const trabajoController = new TrabajoController(trabajoService);
  const kpiController = new KpiController(kpiService);
  const integracionController = new IntegracionController({ insumoService, identidadService, erpClient });

  return {
    repositories: {
      auth: authRepository,
      cliente: clienteRepository,
      colaborador: colaboradorRepository,
      etapa: etapaRepository,
      material: materialRepository,
      vinil: vinilRepository,
      catalogo: catalogoRepository,
      senal: senalRepository,
      pedido: pedidoRepository,
      trabajo: trabajoRepository,
      kpi: kpiRepository,
      sharepoint: sharepointRepository,
      insumo: insumoRepository,
    },
    services: {
      auth: authService,
      cliente: clienteService,
      colaborador: colaboradorService,
      etapa: etapaService,
      material: materialService,
      vinil: vinilService,
      catalogo: catalogoService,
      senal: senalService,
      pedido: pedidoService,
      trabajo: trabajoService,
      kpi: kpiService,
      sharepoint: sharepointService,
      storage: storageService,
      notificacion: notificacionService,
      identidad: identidadService,
      insumo: insumoService,
    },
    controllers: {
      auth: authController,
      client: clientController,
      colaborador: colaboradorController,
      etapa: etapaController,
      material: materialController,
      vinil: vinilController,
      catalogo: catalogoController,
      senal: senalController,
      pedido: pedidoController,
      trabajo: trabajoController,
      kpi: kpiController,
      integracion: integracionController,
    },
  };
}

export const defaultModules = createModules(pool);

export const { controllers, services, repositories } = defaultModules;

export default defaultModules;

