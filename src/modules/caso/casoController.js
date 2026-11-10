import * as casoService from './casoService.js';
import { notFound, badRequest } from '../../core/httpError.js';
import { exigirRol, exigirAdmin } from '../../core/permisos.js';

/**
 * Factory: recibe los servicios de los que caso depende y devuelve los handlers ya cerrados sobre ellos.
 * Todos los handlers trabajan con req.usuario (puesto por la puerta de autenticación del motor).
 */
export function createCasoController({ usuarioService, tableroService }) {
  return {
    listar(req, res) {
      const { areaActual, estado, tableroId } = req.query;
      res.json(casoService.listarVisibles(req.usuario, { areaActual, estado, tableroId }));
    },

    obtener(req, res) {
      const caso = casoService.buscarVisible(req.usuario, req.params.id);
      if (!caso) throw notFound('Caso'); // también si es de otro equipo: no se revela que existe
      res.json(caso);
    },

    crear(req, res) {
      exigirRol(req.usuario, ['agenteCallcenter'], 'Registrar casos');
      const tablero = tableroService.find(req.body.tableroId);
      // Tablero de otro equipo o inexistente: misma respuesta, para no revelar cuáles existen.
      if (!tablero || (req.usuario.rol !== 'admin' && tablero.equipoId !== req.usuario.equipoId)) {
        throw notFound('Tablero');
      }
      const caso = casoService.create(req.body, { usuarioService, tablero });
      res.status(201).json(caso);
    },

    eliminar(req, res) {
      exigirAdmin(req.usuario, 'Eliminar casos');
      if (!casoService.remove(req.params.id)) throw notFound('Caso');
      res.status(204).end();
    },

    menu(req, res) {
      res.json(casoService.MENU_CALLCENTER.map(({ id, etiqueta, tipo }) => ({ id, etiqueta, tipo })));
    },

    colaComite(req, res) {
      res.json(casoService.listarColaComite(req.usuario, { tableroId: req.query.tableroId }));
    },
  };
}
