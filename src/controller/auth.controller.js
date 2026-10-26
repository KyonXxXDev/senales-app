import { int } from '../utils/validators.js';

export default class AuthController {
  constructor(authService) {
    this.authService = authService;
  }

  config = async (req, res) => {
    res.json(this.authService.config());
  };

  getColaboradores = async (req, res) => {
    res.json(await this.authService.getActiveColaboradores());
  };

  login = async (req, res) => {
    const idColaborador = int(req.body.id_colaborador, 'id_colaborador');
    res.json(await this.authService.login({ id_colaborador: idColaborador }));
  };

  me = async (req, res) => {
    res.json(this.authService.me(req.user));
  };
}
