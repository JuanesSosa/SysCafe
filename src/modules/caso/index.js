import { buildRoutes } from './casoRoutes.js';
import { createCasoController } from './casoController.js';
import * as casoService from './casoService.js';

export default {
  name: 'caso',
  basePath: '/casos',
  description: 'El caso trazable del cliente. Entra por el call center (con un menú de motivos), avanza por los centros callcenter → testeo → comité → desarrollo → soporte y se cierra en soporte. texto_original es write-once: ninguna ruta ni servicio lo modifica una vez creado.',
  dependencies: ['usuario', 'tablero'], // usuario: validar clienteId; tablero: saber de qué equipo es cada caso
  optionalDependencies: [],

  setup({ getService }) {
    const usuarioService = getService('usuario');
    const tableroService = getService('tablero');
    casoService.usarTableros(tableroService);
    const ctrl = createCasoController({ usuarioService, tableroService });

    return {
      routes: buildRoutes(ctrl),
      services: {
        buscarVisible: casoService.buscarVisible, // caso solo si el usuario puede verlo (su equipo o admin)
        puedeVer: casoService.puedeVer,
        listarVisibles: casoService.listarVisibles,
        avanzar: casoService.avanzar, // lo usa movimiento, vía getService('caso'): el flujo decide el destino
      },
    };
  },
};
