import { buildRoutes } from './authRoutes.js';
import { createAuthController } from './authController.js';
import * as authService from './authService.js';
import { registrarResolver } from '../../core/autenticacion.js';

export default {
  name: 'auth',
  basePath: '/auth',
  description: 'Inicio de sesión con correo y clave. Registra en el motor cómo reconocer a quien llama (token → usuario); sin este módulo la API queda cerrada.',
  dependencies: ['usuario'],
  optionalDependencies: [],

  setup({ getService }) {
    const usuarioService = getService('usuario');
    registrarResolver((token) => authService.resolverToken(token, { usuarioService }));
    return { routes: buildRoutes(createAuthController({ usuarioService })), services: {} };
  },
};
