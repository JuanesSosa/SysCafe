import { validateBody } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';

// Duplicadas a propósito: un módulo no importa el archivo de otro (convención #1),
// así que valida sus propios enums aunque coincidan conceptualmente con los de caso.
const AREAS = ['callcenter', 'testeo', 'comite', 'desarrollo', 'soporte'];

const movimientoFields = {
  casoId: { type: 'string', required: true, example: 'caso-1' },
  // Opcional: el destino lo decide el flujo (callcenter → testeo → comité → desarrollo → soporte).
  // Si se envía, solo se acepta cuando coincide con el siguiente centro.
  areaDestino: { type: 'string', required: false, enum: AREAS, example: 'testeo' },
  nota: { type: 'string', required: true, min: 3, example: 'Se reproduce el problema, pasa a testeo' },
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
    { method: 'get', path: '/', summary: 'Listar los movimientos de los casos que el usuario puede ver', handler: ctrl.listar, responses: { 200: 'Lista de movimientos' } },
    { method: 'get', path: '/caso/:casoId', summary: 'Historial completo de un caso', handler: ctrl.historial, params: { casoId: 'Identificador del caso' }, responses: { 200: 'Caso + historial', 404: 'Caso inexistente o de otro equipo' } },
    {
      method: 'post',
      path: '/',
      summary: 'Avanzar el caso al siguiente centro del flujo (o cerrarlo en soporte), a nombre de quien tiene la sesión. Agrega, nunca reescribe texto_original',
      handler: withValidation(movimientoFields, ctrl.crear),
      body: movimientoFields,
      responses: { 201: 'Creado', 400: 'Datos inválidos', 403: 'Tu rol no es de un centro del flujo', 404: 'Caso inexistente o de otro equipo', 409: 'El actor no es del centro actual, destino fuera del flujo o caso cerrado' },
    },
  ];
}
