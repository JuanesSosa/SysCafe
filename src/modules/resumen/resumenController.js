import * as resumenService from './resumenService.js';
import { notFound } from '../../core/httpError.js';

export function createResumenController({ casoService, movimientoService }) {
  return {
    obtener(req, res) {
      if (!casoService.buscarVisible(req.usuario, req.params.casoId)) throw notFound('Resumen');
      const resumen = resumenService.find(req.params.casoId);
      if (!resumen) throw notFound('Resumen');
      res.json(resumen);
    },

    generar(req, res) {
      const { casoId } = req.body;
      if (!casoService.buscarVisible(req.usuario, casoId)) throw notFound('Caso');

      const resumen = resumenService.generar(casoId, { casoService, movimientoService, actor: req.usuario });
      res.status(201).json(resumen);
    },
  };
}
