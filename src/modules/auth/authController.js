import * as auth from './authService.js';
import { verificarClave } from '../../core/claves.js';
import { badRequest } from '../../core/httpError.js';
import { unauthorized } from '../../core/httpError.js';

export function createAuthController({ usuarioService }) {
  return {
    login(req, res) {
      res.json(auth.iniciarSesion(req.body, { usuarioService }));
    },
    logout(req, res) {
      auth.cerrarSesion(req.token);
      res.status(204).end();
    },
    yo(req, res) {
      res.json(req.usuario);
    },
    cambiarClave(req, res) {
      const { claveActual, claveNueva } = req.body;
      const cuenta = usuarioService.credenciales(req.usuario.id);
      if (!verificarClave(claveActual, cuenta?.claveHash)) throw unauthorized('La clave actual no es correcta');
      if (claveActual === claveNueva) throw badRequest('La clave nueva debe ser distinta de la actual');
      usuarioService.fijarClave(req.usuario.id, claveNueva);
      auth.cerrarOtrasSesiones(req.usuario.id, req.token);
      res.status(204).end();
    },
  };
}
