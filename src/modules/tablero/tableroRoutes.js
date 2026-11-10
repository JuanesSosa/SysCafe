import { validateBody } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';

const tableroFields = {
  equipoId: { type: 'string', required: true, example: 'equipo-1' },
  nombre: { type: 'string', required: true, min: 3, max: 60, example: 'Facturación' },
};
const renombrarFields = { nombre: tableroFields.nombre };

function withValidation(schema, handler) {
  return (req, res, next) => {
    const { valid, errors } = validateBody(schema, req.body || {});
    if (!valid) throw badRequest(errors.join('; '));
    handler(req, res, next);
  };
}

export function buildRoutes(ctrl) {
  return [
    { method: 'get', path: '/', summary: 'Listar los tableros del equipo del usuario (admin: todos)', handler: ctrl.listar, query: { equipoId: { type: 'string', description: 'Filtrar por equipo' } }, responses: { 200: 'Lista de tableros' } },
    { method: 'get', path: '/:id', summary: 'Obtener un tablero', handler: ctrl.obtener, params: { id: 'Identificador' }, responses: { 200: 'Tablero', 404: 'No existe o es de otro equipo' } },
    { method: 'post', path: '/', summary: 'Crear un tablero para un equipo (solo admin)', handler: withValidation(tableroFields, ctrl.crear), body: tableroFields, responses: { 201: 'Creado', 400: 'Equipo inexistente', 403: 'No es admin', 409: 'Nombre repetido en ese equipo' } },
    { method: 'put', path: '/:id', summary: 'Renombrar un tablero (solo admin)', handler: withValidation(renombrarFields, ctrl.actualizar), body: renombrarFields, responses: { 200: 'Actualizado', 403: 'No es admin', 404: 'No encontrado' } },
    { method: 'delete', path: '/:id', summary: 'Eliminar un tablero sin casos (solo admin)', handler: ctrl.eliminar, responses: { 204: 'Eliminado', 403: 'No es admin', 409: 'Aún tiene casos' } },
  ];
}
