import { validateBody } from '../../core/validation.js';
import { badRequest } from '../../core/httpError.js';
import { CANALES, TIPOS, MOTIVOS } from './casoService.js';

// Dos formas de registrar (la combinación se valida en casoService.create):
//  - con menú del call center: clienteId + canal + motivo (+ detalle opcional); el tipo sale del menú.
//  - texto libre: clienteId + canal + tipo + textoOriginal.
const casoFields = {
  tableroId: { type: 'string', required: true, example: 'tablero-1' },
  clienteId: { type: 'string', required: true, example: 'usuario-1' },
  canal: { type: 'string', required: true, enum: CANALES, example: 'telefonico' },
  motivo: { type: 'string', required: false, enum: MOTIVOS, example: 'impresion' },
  detalle: { type: 'string', required: false, max: 500, example: 'Dice que sale en blanco desde ayer' },
  tipo: { type: 'string', required: false, enum: TIPOS, example: 'solicitud' },
  textoOriginal: { type: 'string', required: false, min: 10, example: 'Olvidé mi contraseña y no puedo ingresar al sistema' },
};

function withValidation(schema, handler) {
  return (req, res, next) => {
    const { valid, errors } = validateBody(schema, req.body || {});
    if (!valid) throw badRequest(errors.join('; '));
    handler(req, res, next);
  };
}

/** Recibe el controller ya armado (con sus dependencias) desde index.js. */
export function buildRoutes(ctrl) {
  return [
    { method: 'get', path: '/', summary: 'Listar casos', handler: ctrl.listar, query: { areaActual: { type: 'string' }, estado: { type: 'string' }, tableroId: { type: 'string', description: 'Solo los casos de este tablero' } }, responses: { 200: 'Casos de los tableros del equipo del usuario (admin: todos)' } },
    { method: 'get', path: '/menu', summary: 'Menú del call center: motivos de llamada con su tipo', handler: ctrl.menu, responses: { 200: 'Lista de motivos' } },
    { method: 'get', path: '/comite/cola', summary: 'Cola del comité ordenada por prioridad (algoritmo de aging)', handler: ctrl.colaComite, query: { tableroId: { type: 'string' } }, responses: { 200: 'Casos ordenados por puntaje' } },
    { method: 'get', path: '/:id', summary: 'Obtener un caso', handler: ctrl.obtener, params: { id: 'Identificador' }, responses: { 200: 'Caso', 404: 'No existe o es de otro equipo' } },
    {
      method: 'post',
      path: '/',
      summary: 'Registrar un caso desde el menú del call center o con texto libre (texto_original queda write-once)',
      handler: withValidation(casoFields, ctrl.crear),
      body: casoFields,
      responses: { 201: 'Creado', 400: 'Datos inválidos o clienteId inexistente o de otro equipo', 403: 'Solo el call center registra casos', 404: 'Tablero inexistente o de otro equipo' },
    },
    { method: 'delete', path: '/:id', summary: 'Eliminar un caso con su historial y resumen (solo admin)', handler: ctrl.eliminar, params: { id: 'Identificador' }, responses: { 204: 'Eliminado', 404: 'No encontrado' } },
  ];
}
