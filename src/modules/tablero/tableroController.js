import * as svc from './tableroService.js';
import { notFound, badRequest } from '../../core/httpError.js';
import { exigirAdmin } from '../../core/permisos.js';

export function createTableroController({ equipoService }) {
  return {
    listar(req, res) {
      res.json(svc.listarVisibles(req.usuario, { equipoId: req.query.equipoId }));
    },
    obtener(req, res) {
      const t = svc.buscarVisible(req.usuario, req.params.id);
      if (!t) throw notFound('Tablero');
      res.json(t);
    },
    crear(req, res) {
      exigirAdmin(req.usuario, 'Crear tableros');
      if (!equipoService.find(req.body.equipoId)) throw badRequest(`"equipoId" no corresponde a un equipo existente: ${req.body.equipoId}`);
      res.status(201).json(svc.create(req.body));
    },
    actualizar(req, res) {
      exigirAdmin(req.usuario, 'Renombrar tableros');
      const t = svc.update(req.params.id, { nombre: req.body.nombre });
      if (!t) throw notFound('Tablero');
      res.json(t);
    },
    eliminar(req, res) {
      exigirAdmin(req.usuario, 'Eliminar tableros');
      if (!svc.remove(req.params.id)) throw notFound('Tablero');
      res.status(204).end();
    },
  };
}
