import { buildRoutes } from './tableroRoutes.js';
import { createTableroController } from './tableroController.js';
import * as tableroService from './tableroService.js';

export default {
  name: 'tablero',
  basePath: '/tableros',
  description: 'Tableros Kanban. Cada tablero pertenece a un equipo; solo los miembros de ese equipo (y el admin) lo ven.',
  dependencies: ['equipo'],
  optionalDependencies: [],

  setup({ getService }) {
    tableroService.sembrar();
    const ctrl = createTableroController({ equipoService: getService('equipo') });
    return { routes: buildRoutes(ctrl), services: { find: tableroService.find } };
  },
};
