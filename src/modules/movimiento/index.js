import { buildRoutes } from './movimientoRoutes.js';
import { createMovimientoController } from './movimientoController.js';
import * as movimientoService from './movimientoService.js';

export default {
  name: 'movimiento',
  basePath: '/movimientos',
  description: 'Traza cada paso de un caso entre áreas. Agrega comentarios, nunca reescribe el texto original.',
  dependencies: ['caso'],
  optionalDependencies: [],

  setup({ getService }) {
    const casoService = getService('caso');
    const ctrl = createMovimientoController({ casoService });

    return {
      routes: buildRoutes(ctrl),
      services: {
        historialDeCaso: movimientoService.historialDeCaso, // lo usa resumen, vía optionalDependencies
      },
    };
  },
};
