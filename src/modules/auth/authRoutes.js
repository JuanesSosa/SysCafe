import { validateBody } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';
import { CLAVE_MINIMA } from '../../core/claves.js';

const loginFields = {
  correo: { type: 'string', required: true, example: 'sofia@syscafe.local' },
  clave: { type: 'string', required: true, example: 'syscafe123' },
};
const claveFields = {
  claveActual: { type: 'string', required: true },
  claveNueva: { type: 'string', required: true, min: CLAVE_MINIMA },
};

function withValidation(schema, handler) {
  return (req, res, next) => {
    const { valid, errors } = validateBody(schema, req.body || {});
    if (!valid) throw badRequest(errors.join('; '));
    handler(req, res, next);
  };
}

export function buildRoutes(ctrl) {
  return [
    { method: 'post', path: '/login', summary: 'Iniciar sesión: devuelve un token para enviar como "Authorization: Bearer <token>" (única ruta pública)', handler: withValidation(loginFields, ctrl.login), body: loginFields, responses: { 200: 'Token y usuario', 401: 'Correo o clave incorrectos', 429: 'Demasiados intentos fallidos' } },
    { method: 'post', path: '/logout', summary: 'Cerrar la sesión actual', handler: ctrl.logout, responses: { 204: 'Sesión cerrada' } },
    { method: 'get', path: '/yo', summary: 'Quién soy: el usuario de la sesión actual', handler: ctrl.yo, responses: { 200: 'Usuario' } },
    { method: 'post', path: '/cambiar-clave', summary: 'Cambiar mi clave (cierra mis otras sesiones)', handler: withValidation(claveFields, ctrl.cambiarClave), body: claveFields, responses: { 204: 'Clave cambiada', 401: 'La clave actual no es correcta' } },
  ];
}
