/**
 * Errores HTTP con .status, para que errorHandler.js sepa qué código devolver.
 * Úsalos desde cualquier controller o service: throw notFound('Caso')
 */

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = 'HttpError';
  }
}

export function notFound(entity) {
  return new HttpError(404, `${entity} no encontrado`);
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function conflict(message) {
  return new HttpError(409, message);
}

export function unauthorized(message = 'Falta iniciar sesión') {
  return new HttpError(401, message);
}

export function forbidden(message = 'No tienes permiso para hacer esto') {
  return new HttpError(403, message);
}

export function tooManyRequests(message) {
  return new HttpError(429, message);
}
