import { buildRoutes } from './usuarioRoutes.js';
import { createUsuarioController } from './usuarioController.js';
import * as usuarioService from './usuarioService.js';

export default {
  name: 'usuario',
  basePath: '/usuarios',
  description: 'Personas del sistema: cliente, agentes, tester, comité, desarrollador y administrador. Cada una pertenece a un equipo y tiene correo y clave (guardada solo como hash).',
  dependencies: ['equipo'],
  optionalDependencies: [],

  setup({ getService }) {
    usuarioService.sembrar();
    usuarioService.asegurarCuentas();
    const ctrl = createUsuarioController({ equipoService: getService('equipo') });
    return {
      routes: buildRoutes(ctrl),
      services: {
        find: usuarioService.find, // siempre sin el hash de la clave
        buscarPorCorreo: usuarioService.buscarPorCorreo,
        credenciales: usuarioService.credenciales,
        fijarClave: usuarioService.fijarClave,
      },
    };
  },
};
