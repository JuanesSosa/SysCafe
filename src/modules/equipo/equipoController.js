import * as svc from './equipoService.js';
import { notFound } from '../../core/httpError.js';
import { exigirAdmin } from '../../core/permisos.js';

export function listar(req, res) {
  res.json(svc.listarVisibles(req.usuario));
}
export function obtener(req, res) {
  const e = svc.buscarVisible(req.usuario, req.params.id);
  if (!e) throw notFound('Equipo');
  res.json(e);
}
export function crear(req, res) {
  exigirAdmin(req.usuario, 'Crear equipos');
  res.status(201).json(svc.create(req.body));
}
export function actualizar(req, res) {
  exigirAdmin(req.usuario, 'Editar equipos');
  const e = svc.update(req.params.id, req.body);
  if (!e) throw notFound('Equipo');
  res.json(e);
}
export function eliminar(req, res) {
  exigirAdmin(req.usuario, 'Eliminar equipos');
  if (!svc.remove(req.params.id)) throw notFound('Equipo');
  res.status(204).end();
}
