import { int, str } from '../utils/validators.js';

export default class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  getColaboradores = async (req, res) => {
    const list = await this.authService.getActiveColaboradores();
    res.json(list);
  };

  login = async (req, res) => {
    const idColaborador = int(req.body.id_colaborador, 'id_colaborador');
    const pin = str(req.body.pin, 'pin', { required: false });
    const result = await this.authService.login({ id_colaborador: idColaborador, pin });
    res.json(result);
  };

  me = async (req, res) => {
    const user = await this.authService.getMe(req.user?.id_colaborador);
    res.json(user);
  };
}

