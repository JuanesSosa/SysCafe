import * as service from './__NAME__Service.js';
import { notFound } from '../../core/httpError.js';

export function createController() {
  return {
    listar(req, res) {
      res.json(service.list());
    },
    obtener(req, res) {
      const item = service.find(req.params.id);
      if (!item) throw notFound('__NAME__');
      res.json(item);
    },
    crear(req, res) {
      res.status(201).json(service.create(req.body));
    },
    actualizar(req, res) {
      const item = service.update(req.params.id, req.body);
      if (!item) throw notFound('__NAME__');
      res.json(item);
    },
    eliminar(req, res) {
      const ok = service.remove(req.params.id);
      if (!ok) throw notFound('__NAME__');
      res.status(204).end();
    },
  };
}
