import { HttpError } from './httpError.js';

/**
 * Middleware de error de Express (4 parámetros = Express lo reconoce como tal).
 * Cualquier throw dentro de un handler (sync o async, gracias a wrapAsync en
 * moduleLoader.js) termina aquí. Un módulo con error nunca tumba el servidor.
 */
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }

  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: 'Datos inválidos', details: err.details });
  }

  console.error('[error 500]', err);
  return res.status(500).json({ error: 'Error interno del servidor' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: `No existe ${req.method} ${req.path}` });
}
