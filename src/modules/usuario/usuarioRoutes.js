import { validateBody, partial } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';
import { ROLES_VALIDOS, AREAS_VALIDAS } from './usuarioService.js';
import { CLAVE_MINIMA } from '../../core/claves.js';

const usuarioFields = {
  nombre: { type: 'string', required: true, min: 3, example: 'Camila Rojas' },
  rol: { type: 'string', required: true, enum: ROLES_VALIDOS, example: 'cliente' },
  area: { type: 'string', required: false, enum: AREAS_VALIDAS, example: 'soporte' },
  equipoId: { type: 'string', required: false, example: 'equipo-1' },
  correo: { type: 'string', required: true, pattern: '^[^@\\s]+@[^@\\s]+$', example: 'camila@syscafe.local' },
  clave: { type: 'string', required: true, min: CLAVE_MINIMA, example: 'una-clave-larga' },
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
    { method: 'get', path: '/', summary: 'Listar usuarios (admin: todos; los demás: los de su equipo)', handler: ctrl.listar, query: { rol: { type: 'string', description: 'Filtrar por rol' } }, responses: { 200: 'Lista de usuarios' } },
    { method: 'get', path: '/:id', summary: 'Obtener un usuario', handler: ctrl.obtener, params: { id: 'Identificador' }, responses: { 200: 'Usuario', 404: 'No existe o es de otro equipo' } },
    { method: 'post', path: '/', summary: 'Crear un usuario y asignarlo a un equipo (solo admin)', handler: withValidation(usuarioFields, ctrl.crear), body: usuarioFields, responses: { 201: 'Creado', 400: 'Datos inválidos', 403: 'No es admin', 409: 'Correo repetido' } },
    { method: 'put', path: '/:id', summary: 'Actualizar un usuario o cambiarlo de equipo (solo admin)', handler: withValidation(partial(usuarioFields), ctrl.actualizar), body: partial(usuarioFields), responses: { 200: 'Actualizado', 403: 'No es admin', 404: 'No encontrado' } },
    { method: 'delete', path: '/:id', summary: 'Eliminar un usuario (solo admin)', handler: ctrl.eliminar, responses: { 204: 'Eliminado', 403: 'No es admin', 409: 'Tiene casos asociados o es tu propia cuenta' } },
  ];
}
