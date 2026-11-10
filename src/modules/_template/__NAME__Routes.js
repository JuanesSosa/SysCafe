import { validateBody, partial } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';

const fields = {
  title: { type: 'string', required: true, min: 3, example: 'Ejemplo' },
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
    { method: 'get', path: '/', summary: 'Listar', handler: ctrl.listar, responses: { 200: 'Lista' } },
    { method: 'get', path: '/:id', summary: 'Obtener uno', handler: ctrl.obtener, responses: { 200: 'Item', 404: 'No encontrado' } },
    { method: 'post', path: '/', summary: 'Crear', handler: withValidation(fields, ctrl.crear), body: fields, responses: { 201: 'Creado', 400: 'Datos inválidos' } },
    { method: 'put', path: '/:id', summary: 'Actualizar', handler: withValidation(partial(fields), ctrl.actualizar), body: partial(fields), responses: { 200: 'Actualizado', 404: 'No encontrado' } },
    { method: 'delete', path: '/:id', summary: 'Eliminar', handler: ctrl.eliminar, responses: { 204: 'Eliminado', 404: 'No encontrado' } },
  ];
}
