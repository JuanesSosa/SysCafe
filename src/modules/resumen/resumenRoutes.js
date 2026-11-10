import { validateBody } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';

const resumenFields = {
  casoId: { type: 'string', required: true, example: 'caso-1' },
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
    { method: 'get', path: '/:casoId', summary: 'Obtener el resumen de un caso', handler: ctrl.obtener, params: { casoId: 'Identificador del caso' }, responses: { 200: 'Resumen', 404: 'No generado aún' } },
    {
      method: 'post',
      path: '/',
      summary: 'Generar o regenerar el resumen y las palabras clave de un caso',
      handler: withValidation(resumenFields, ctrl.generar),
      body: resumenFields,
      responses: { 201: 'Resumen generado', 400: 'casoId inexistente' },
    },
  ];
}
