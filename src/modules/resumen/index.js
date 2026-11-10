import { buildRoutes } from './resumenRoutes.js';
import { createResumenController } from './resumenController.js';

export default {
  name: 'resumen',
  basePath: '/resumenes',
  description: 'Resumen persistente y palabras clave por caso. Hoy con una heurística local; en producción llamaría al modelo (Qwen/Ollama) sin cambiar este contrato.',
  dependencies: ['caso'],
  optionalDependencies: ['movimiento'],

  setup({ getService }) {
    const casoService = getService('caso');
    const movimientoService = getService('movimiento'); // null si movimiento no está cargado, y el resumen sigue funcionando

    const ctrl = createResumenController({ casoService, movimientoService });

    return {
      routes: buildRoutes(ctrl),
      services: {},
    };
  },
};
