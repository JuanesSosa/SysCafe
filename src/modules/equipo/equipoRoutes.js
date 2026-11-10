import * as ctrl from './equipoController.js';
import { validateBody, partial } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';

const equipoFields = {
  nombre: { type: 'string', required: true, min: 3, max: 60, example: 'Equipo Norte' },
  descripcion: { type: 'string', required: false, max: 200, example: 'Atiende a los clientes de la zona norte' },
};

function withValidation(schema, handler) {
  return (req, res, next) => {
    const { valid, errors } = validateBody(schema, req.body || {});
    if (!valid) throw badRequest(errors.join('; '));
    handler(req, res, next);
  };
}

export const routes = [
  { method: 'get', path: '/', summary: 'Listar los equipos que el usuario puede ver (admin: todos; los demás: el suyo)', handler: ctrl.listar, responses: { 200: 'Lista de equipos' } },
  { method: 'get', path: '/:id', summary: 'Obtener un equipo', handler: ctrl.obtener, params: { id: 'Identificador' }, responses: { 200: 'Equipo', 404: 'No existe o es de otro equipo' } },
  { method: 'post', path: '/', summary: 'Crear un equipo (solo admin)', handler: withValidation(equipoFields, ctrl.crear), body: equipoFields, responses: { 201: 'Creado', 403: 'No es admin', 409: 'Nombre repetido' } },
  { method: 'put', path: '/:id', summary: 'Editar un equipo (solo admin)', handler: withValidation(partial(equipoFields), ctrl.actualizar), body: partial(equipoFields), responses: { 200: 'Actualizado', 403: 'No es admin', 404: 'No encontrado' } },
  { method: 'delete', path: '/:id', summary: 'Eliminar un equipo sin usuarios ni tableros (solo admin)', handler: ctrl.eliminar, responses: { 204: 'Eliminado', 403: 'No es admin', 409: 'Aún tiene usuarios o tableros' } },
];
