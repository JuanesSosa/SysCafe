import { HttpError } from './httpError.js';

/**
 * Puerta de entrada de la API: toda ruta exige una sesión, salvo las públicas (el inicio de sesión).
 * El motor no sabe cómo se guardan las sesiones: el módulo "auth" registra un resolver
 * (token → usuario) al arrancar. Si ningún módulo lo registró, la API se cierra (falla cerrada).
 */
let resolver = null;

export function registrarResolver(fn) {
  resolver = fn;
}

const PUBLICAS = [{ method: 'POST', path: '/auth/login' }];

export function exigirSesion(req, res, next) {
  if (PUBLICAS.some((p) => p.method === req.method && p.path === req.path)) return next();
  if (!resolver) return next(new HttpError(503, 'La autenticación no está disponible: el módulo "auth" no cargó'));

  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  if (esquema !== 'Bearer' || !token) return next(new HttpError(401, 'Falta iniciar sesión'));

  const usuario = resolver(token);
  if (!usuario) return next(new HttpError(401, 'La sesión no es válida o expiró: inicia sesión de nuevo'));

  req.usuario = usuario;
  req.token = token;
  next();
}
