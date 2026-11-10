import { routes } from './equipoRoutes.js';
import * as equipoService from './equipoService.js';

export default {
  name: 'equipo',
  basePath: '/equipos',
  description: 'Grupos de trabajo. Cada usuario (salvo el admin) pertenece a un equipo, y cada equipo tiene sus propios tableros Kanban.',
  dependencies: [],
  optionalDependencies: [],

  setup() {
    equipoService.sembrar();
    return { routes, services: { find: equipoService.find } };
  },
};
