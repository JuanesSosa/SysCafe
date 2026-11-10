import * as movimientoService from './movimientoService.js';
import { notFound, forbidden, conflict } from '../../core/httpError.js';

/**
 * Factory: recibe caso (obligatorio) y usuario (obligatorio) ya resueltos
 * por index.js. Aquí es donde de verdad se agrega el avance sin tocar
 * texto_original: solo se llama caso.avanzar(), y el destino lo decide el flujo.
 */
export function createMovimientoController({ casoService }) {
  return {
    listar(req, res) {
      res.json(movimientoService.list().filter((m) => casoService.buscarVisible(req.usuario, m.casoId)));
    },

    historial(req, res) {
      const caso = casoService.buscarVisible(req.usuario, req.params.casoId);
      if (!caso) throw notFound('Caso');
      res.json({ caso, historial: movimientoService.historialDeCaso(req.params.casoId) });
    },

    crear(req, res) {
      const { casoId, areaDestino, nota } = req.body;

      // Quien avanza es quien tiene la sesión iniciada (ya no se acepta un actorId en el cuerpo).
      const actor = req.usuario;
      const caso = casoService.buscarVisible(actor, casoId);
      if (!caso) throw notFound('Caso');
      if (!actor.area) throw forbidden(`Tu rol (${actor.rol}) no avanza casos: solo los centros del flujo`);

      // Se pasa por centros, no por personas: cada centro avanza los casos que tiene.
      if (actor.area !== caso.areaActual) {
        throw conflict(`${casoId} está en ${caso.areaActual}: solo alguien de ese centro puede avanzarlo`);
      }

      // Primero se valida y aplica el flujo (lanza 409 si no corresponde); solo si pasa se deja el registro.
      const areaOrigen = caso.areaActual;
      const casoActualizado = casoService.avanzar(casoId, { areaDestino });
      const movimiento = movimientoService.create({
        casoId,
        actorId: actor.id,
        areaOrigen,
        areaDestino: casoActualizado.areaActual,
        nota,
      });

      res.status(201).json({ movimiento, caso: casoActualizado });
    },
  };
}
