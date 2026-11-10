import { buildRoutes } from './__NAME__Routes.js';
import { createController } from './__NAME__Controller.js';
import * as service from './__NAME__Service.js';

export default {
  name: '__NAME__',
  basePath: '/__BASEPATH__',
  description: 'Describe aquí qué representa este módulo.',
  dependencies: [],
  optionalDependencies: [],

  setup({ getService }) {
    const ctrl = createController({ getService });
    return {
      routes: buildRoutes(ctrl),
      services: {
        find: service.find,
        list: service.list,
      },
    };
  },
};
