import { createStore } from '../../core/store.js';

const store = createStore('resumen');

/**
 * Heurística local que hace las veces de "modelo" para la demo: no llama a
 * ningún servicio externo. En producción, este es el único punto que cambia
 * para llamar de verdad a Qwen/Ollama (vía MCP o HTTP) — el contrato del
 * módulo (basePath, rutas, services expuestos) no se movería ni un carácter.
 */
function generarResumenIA(caso, historial) {
  const primeraOracion = caso.textoOriginal.split(/[.!?]/)[0].trim();
  const pasos = historial.length === 0
    ? 'aún sin movimientos registrados'
    : `${historial.length} movimiento(s), actualmente en ${caso.areaActual}`;
  const etiqueta = caso.viaRapida ? ' · vía rápida' : '';
  return `${primeraOracion}. (${pasos}${etiqueta})`;
}

export function find(casoId) {
  return store.find(casoId);
}

/**
 * Genera o regenera el resumen de un caso. Recibe los servicios de los que
 * depende (caso, obligatorio) y opcionalmente movimiento, si está cargado.
 */
export function generar(casoId, { casoService, movimientoService, actor }) {
  const caso = casoService.buscarVisible(actor, casoId);
  if (!caso) return null;

  const historial = movimientoService ? movimientoService.historialDeCaso(casoId) : [];
  const resumenActual = generarResumenIA(caso, historial);

  const existente = store.find(casoId);
  const registro = {
    id: casoId,
    casoId,
    resumenActual,
    palabrasClave: caso.palabrasClave || [],
    actualizadoEn: new Date().toISOString(),
  };

  return existente ? store.update(casoId, registro) : store.create(registro);
}
