import * as usuarioService from './usuarioService.js';
import { notFound, badRequest, conflict } from '../../core/httpError.js';
import { exigirAdmin } from '../../core/permisos.js';

export function createUsuarioController({ equipoService }) {
  const validarEquipo = (rol, equipoId) => {
    if (rol === 'admin') return;
    if (!equipoId) throw badRequest('"equipoId" es obligatorio para cualquier rol que no sea admin');
    if (!equipoService.find(equipoId)) throw badRequest(`"equipoId" no corresponde a un equipo existente: ${equipoId}`);
  };

  return {
    listar(req, res) {
      res.json(usuarioService.listarVisibles(req.usuario, { rol: req.query.rol }));
    },
    obtener(req, res) {
      const u = usuarioService.buscarVisible(req.usuario, req.params.id);
      if (!u) throw notFound('Usuario');
      res.json(u);
    },
    crear(req, res) {
      exigirAdmin(req.usuario, 'Crear usuarios');
      validarEquipo(req.body.rol, req.body.equipoId);
      res.status(201).json(usuarioService.create(req.body));
    },
    actualizar(req, res) {
      exigirAdmin(req.usuario, 'Editar usuarios');
      const actual = usuarioService.buscarVisible(req.usuario, req.params.id);
      if (!actual) throw notFound('Usuario');
      const rol = req.body.rol ?? actual.rol;
      const equipoId = req.body.equipoId !== undefined ? req.body.equipoId : actual.equipoId;
      if (actual.id === req.usuario.id && rol !== 'admin') throw conflict('No puedes quitarte el rol de administrador a ti mismo');
      validarEquipo(rol, equipoId);
      res.json(usuarioService.update(req.params.id, req.body));
    },
    eliminar(req, res) {
      exigirAdmin(req.usuario, 'Eliminar usuarios');
      if (req.params.id === req.usuario.id) throw conflict('No puedes eliminar tu propia cuenta');
      if (!usuarioService.remove(req.params.id)) throw notFound('Usuario');
      res.status(204).end();
    },
  };
}
