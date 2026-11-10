import { createStore } from '../../core/store.js';
import { badRequest, conflict, notFound } from '../../core/httpError.js';
import { esAdmin } from '../../core/permisos.js';

const store = createStore('caso');

// El módulo "tablero" le dice a este servicio de qué equipo es cada tablero (lo configura index.js).
let tableros = null;
export function usarTableros(tableroService) {
  tableros = tableroService;
}
const equipoDeTablero = (tableroId) => (tableroId && tableros ? tableros.find(tableroId)?.equipoId ?? null : null);

/** Un caso es visible para su equipo (el del tablero donde vive) y para el admin. Casos sin tablero: solo admin. */
export function puedeVer(actor, caso) {
  if (!caso || !actor) return false;
  if (esAdmin(actor)) return true;
  const equipo = equipoDeTablero(caso.tableroId);
  return equipo !== null && equipo === actor.equipoId;
}

export function buscarVisible(actor, id) {
  const caso = store.find(id);
  return puedeVer(actor, caso) ? vista(caso) : null;
}

export const CANALES = ['telefonico', 'email', 'presencial'];
export const TIPOS = ['incidente', 'problema', 'solicitud'];
// Flujo por centros (no por personas), en el orden que describió SysCafé en la entrevista:
// el caso entra por el call center y el último centro es soporte, que cierra con el cliente.
export const FLUJO = ['callcenter', 'testeo', 'comite', 'desarrollo', 'soporte'];
export const AREAS = FLUJO;
export const ESTADOS = ['abierto', 'enProceso', 'resuelto', 'cerrado'];

/**
 * Menú del call center: el agente elige el motivo en vez de redactar. Cada opción fija el
 * tipo y aporta palabras clave ya normalizadas (sin tildes, minúsculas), la misma forma que
 * produce extraerPalabrasClave(), para que el algoritmo 1 compare una señal limpia.
 * Para ajustar el menú solo se edita este arreglo.
 */
export const MENU_CALLCENTER = [
  { id: 'contrasena', etiqueta: 'Olvidó la contraseña o no puede ingresar', tipo: 'solicitud', palabrasClave: ['contrasena', 'acceso', 'olvide', 'ingresar'] },
  { id: 'descargaFactura', etiqueta: 'Necesita descargar una factura (PDF)', tipo: 'solicitud', palabrasClave: ['factura', 'descarga', 'pdf', 'electronica'] },
  { id: 'impresion', etiqueta: 'No imprime o el documento sale dañado al imprimir', tipo: 'problema', palabrasClave: ['imprimir', 'impresion', 'documento', 'danado'] },
  { id: 'facturaElectronica', etiqueta: 'Factura electrónica rechazada o con error', tipo: 'problema', palabrasClave: ['factura', 'electronica', 'rechazada', 'error'] },
  { id: 'baseDatos', etiqueta: 'Base de datos dañada o no puede operar', tipo: 'problema', palabrasClave: ['base', 'datos', 'danada', 'operar'] },
  { id: 'falla', etiqueta: 'Falla puntual o error inesperado en pantalla', tipo: 'incidente', palabrasClave: ['falla', 'error', 'pantalla', 'inesperado'] },
  { id: 'impuestos', etiqueta: 'Duda o ajuste por impuestos (ej. impuesto saludable)', tipo: 'solicitud', palabrasClave: ['impuesto', 'saludable', 'ajuste', 'calculo'] },
  { id: 'mejora', etiqueta: 'Pide una mejora o función nueva', tipo: 'solicitud', palabrasClave: ['mejora', 'funcion', 'nueva', 'campo'] },
  { id: 'otro', etiqueta: 'Otro: el agente lo describe con sus palabras', tipo: null, palabrasClave: [] },
];
export const MOTIVOS = MENU_CALLCENTER.map((m) => m.id);

// Peso por tipo para el algoritmo 2 (cola de comité con aging).
const PESO_TIPO = { incidente: 5, problema: 3, solicitud: 1 };
const FACTOR_AGING_POR_DIA = 0.5;

// Umbral de similitud (índice de Jaccard) para el algoritmo 1 (vía rápida).
const UMBRAL_VIA_RAPIDA = 0.5;
const DIAS_MAX_HISTORICO_RAPIDO = 3;

const STOPWORDS = new Set(['de', 'la', 'el', 'en', 'un', 'una', 'que', 'y', 'a', 'mi', 'me', 'se', 'no', 'lo', 'con', 'por', 'para', 'del', 'al', 'logro', 'tener', 'puedo', 'quiero', 'tengo', 'estoy']);

/**
 * Conocimiento inicial de la vía rápida: los dos casos que SysCafé ya sabía resolver el primer día
 * (contraseña y factura PDF). Sirve para el arranque en frío, cuando todavía no hay casos cerrados.
 * Desde ahí el sistema aprende solo: ver historicoResueltoRapido(), que suma los casos reales.
 */
const HISTORICO_BASE = [
  // Palabras clave ya normalizadas (sin tildes, minúsculas) — deben quedar en el mismo
  // formato que produce extraerPalabrasClave(), o la comparación de Jaccard nunca coincide.
  { id: 'base-1', palabrasClave: ['contrasena', 'acceso', 'olvide', 'ingresar'], diasResolucion: 1 },
  { id: 'base-2', palabrasClave: ['factura', 'descarga', 'pdf', 'electronica'], diasResolucion: 2 },
];

const MS_DIA = 86400000;

/** Extrae palabras clave simples de un texto (minúsculas, sin stopwords, sin duplicados). */
export function extraerPalabrasClave(texto) {
  const palabras = texto
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 3 && !STOPWORDS.has(p));
  return Array.from(new Set(palabras));
}

/** Índice de Jaccard entre dos conjuntos de palabras clave. */
export function similitudJaccard(a, b) {
  const setA = new Set(a);
  const setB = new Set(b);
  const interseccion = [...setA].filter((p) => setB.has(p)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : interseccion / union;
}

/** Señal limpia de un caso para comparar: las palabras del menú si eligió motivo, o sus palabras clave. */
function senalDe(caso) {
  const m = caso.motivo && MENU_CALLCENTER.find((x) => x.id === caso.motivo);
  return m && m.palabrasClave.length ? m.palabrasClave : caso.palabrasClave;
}

/**
 * Casos contra los que se compara un caso nuevo: el conocimiento inicial más los casos REALES que
 * soporte ya cerró. Un caso real cuenta si es una solicitud cerrada, y entre que entró a soporte
 * y se cerró pasó menos de DIAS_MAX_HISTORICO_RAPIDO días. Así, cada solicitud que soporte resuelve
 * rápido enseña al sistema a saltarse el comité la próxima vez que llegue algo parecido.
 */
export function historicoResueltoRapido(casos = store.all()) {
  const reales = casos
    .filter((c) => c.tipo === 'solicitud' && c.estado === 'cerrado' && c.fechaCierre && c.fechaEntradaSoporte)
    .map((c) => ({
      id: c.id,
      palabrasClave: senalDe(c),
      diasResolucion: (Date.parse(c.fechaCierre) - Date.parse(c.fechaEntradaSoporte)) / MS_DIA,
    }))
    .filter((h) => h.palabrasClave.length > 0);
  return [...HISTORICO_BASE, ...reales];
}

/**
 * Algoritmo 1 · Clasificador de vía rápida.
 * true si el caso nuevo se parece lo suficiente a un caso histórico que
 * Soporte ya resolvió rápido, sin pasar por el comité quincenal.
 * `historico` se puede inyectar (pruebas); por defecto sale de los casos reales.
 */
export function calcularViaRapida(palabrasClave, historico = historicoResueltoRapido()) {
  return historico.some(
    (hist) => hist.diasResolucion < DIAS_MAX_HISTORICO_RAPIDO && similitudJaccard(palabrasClave, hist.palabrasClave) >= UMBRAL_VIA_RAPIDA
  );
}

/**
 * Algoritmo 2 · Cola de comité con aging.
 * Sube con el tipo del caso y con los días que lleva esperando EN EL COMITÉ (`desde` es la fecha
 * en que el caso entró al comité), para que una solicitud vieja no quede varada detrás de
 * incidentes nuevos y para que lo que el caso tardó antes en testeo no le dé ventaja.
 */
export function calcularPuntaje(tipo, desde, ahora = Date.now()) {
  const diasEnEspera = Math.max(0, Math.floor((ahora - new Date(desde).getTime()) / MS_DIA));
  return PESO_TIPO[tipo] + diasEnEspera * FACTOR_AGING_POR_DIA;
}

export function listarVisibles(actor, { areaActual, estado, tableroId } = {}) {
  let items = store.all().filter((c) => puedeVer(actor, c));
  if (tableroId) items = items.filter((c) => c.tableroId === tableroId);
  if (areaActual) items = items.filter((c) => c.areaActual === areaActual);
  if (estado) items = items.filter((c) => c.estado === estado);
  return items.map(vista);
}

/** Sin chequeo de permisos: solo para uso interno del módulo y de las pruebas. */
export function find(id) {
  return vista(store.find(id));
}

const unicos = (arr) => Array.from(new Set(arr));

/**
 * Arma lo que se guarda del caso según cómo lo registró el agente:
 *  - con motivo del menú: el tipo y las palabras clave salen del menú (señal estándar);
 *  - motivo "otro": texto libre obligatorio, y el tipo lo elige el agente;
 *  - sin menú: texto libre + tipo, como antes (compatible con curl y con el MCP).
 * La vía rápida se calcula con las palabras clave del menú, no con el detalle, para que
 * añadir contexto no baje la similitud.
 */
function armarEntrada(data) {
  const detalle = (data.detalle || '').trim();

  if (data.motivo && data.motivo !== 'otro') {
    const m = MENU_CALLCENTER.find((x) => x.id === data.motivo);
    return {
      motivo: m.id,
      tipo: m.tipo,
      textoOriginal: detalle ? `${m.etiqueta} — ${detalle}` : m.etiqueta,
      palabrasClave: unicos([...m.palabrasClave, ...extraerPalabrasClave(detalle)]),
      palabrasViaRapida: m.palabrasClave,
    };
  }

  if (data.motivo === 'otro') {
    if (detalle.length < 10) throw badRequest('"detalle" es obligatorio (mínimo 10 caracteres) cuando el motivo es "otro"');
    if (!data.tipo) throw badRequest('"tipo" es obligatorio cuando el motivo es "otro"');
    const claves = extraerPalabrasClave(detalle);
    return { motivo: 'otro', tipo: data.tipo, textoOriginal: detalle, palabrasClave: claves, palabrasViaRapida: claves };
  }

  if (!data.tipo) throw badRequest('"tipo" es obligatorio si no se elige un "motivo" del menú');
  if (!data.textoOriginal) throw badRequest('"textoOriginal" es obligatorio si no se elige un "motivo" del menú');
  const claves = extraerPalabrasClave(data.textoOriginal);
  return { motivo: null, tipo: data.tipo, textoOriginal: data.textoOriginal, palabrasClave: claves, palabrasViaRapida: claves };
}

export function create(data, { usuarioService, tablero }) {
  const cliente = usuarioService.find(data.clienteId);
  if (!cliente) throw badRequest(`"clienteId" no corresponde a un usuario existente: ${data.clienteId}`);
  if (tablero && cliente.equipoId !== tablero.equipoId) throw badRequest('El cliente no pertenece al equipo de ese tablero');

  const entrada = armarEntrada(data);
  const viaRapida = entrada.tipo === 'solicitud' && calcularViaRapida(entrada.palabrasViaRapida);

  const caso = store.create({
    tableroId: tablero ? tablero.id : null,
    clienteId: data.clienteId,
    canal: data.canal,
    tipo: entrada.tipo,
    motivo: entrada.motivo,
    textoOriginal: entrada.textoOriginal, // write-once: ningún método de este archivo lo vuelve a tocar
    palabrasClave: entrada.palabrasClave,
    areaActual: FLUJO[0], // todo caso entra por el call center
    estado: 'abierto',
    viaRapida,
    fechaCreacion: new Date().toISOString(),
  });
  return vista(caso);
}

/**
 * Siguiente centro del flujo. Una solicitud de vía rápida se salta el comité
 * (testeo → desarrollo). Devuelve null si el caso ya está en el último centro (soporte).
 */
export function siguienteArea(caso) {
  if (caso.viaRapida && caso.areaActual === 'testeo') return 'desarrollo';
  const i = FLUJO.indexOf(caso.areaActual);
  return FLUJO[i + 1] || null;
}

/** Lo que se devuelve por la API: el caso guardado + a dónde puede ir ahora (dato derivado, no se guarda). */
function vista(caso) {
  if (!caso) return null;
  return { ...caso, equipoId: equipoDeTablero(caso.tableroId), siguienteArea: caso.estado === 'cerrado' ? null : siguienteArea(caso) };
}

/**
 * Usada por movimientoController (vía getService('caso')) al registrar un avance.
 * El destino lo decide el flujo, no la persona: callcenter → testeo → comité → desarrollo → soporte.
 * En soporte (último centro) el paso siguiente cierra el caso. Nunca toca textoOriginal.
 * `areaDestino` es opcional: si viene, solo se acepta si coincide con el siguiente centro.
 */
export function avanzar(casoId, { areaDestino } = {}) {
  const caso = store.find(casoId);
  if (!caso) throw notFound('Caso');
  if (caso.estado === 'cerrado') throw conflict(`El caso ${casoId} ya está cerrado`);

  const siguiente = siguienteArea(caso);

  if (siguiente === null) {
    if (areaDestino && areaDestino !== caso.areaActual) {
      throw conflict(`${casoId} ya está en ${caso.areaActual}, el último centro del flujo: solo puede cerrarse`);
    }
    return vista(store.update(casoId, { estado: 'cerrado', fechaCierre: new Date().toISOString() }));
  }

  if (areaDestino && areaDestino !== siguiente) {
    throw conflict(`Desde ${caso.areaActual} el caso solo puede pasar a ${siguiente} (no a ${areaDestino})`);
  }
  const ahora = new Date().toISOString();
  const cambio = { areaActual: siguiente, estado: siguiente === 'soporte' ? 'resuelto' : 'enProceso' };
  if (siguiente === 'comite') cambio.fechaEntradaComite = ahora; // desde aquí cuenta el aging
  if (siguiente === 'soporte') cambio.fechaEntradaSoporte = ahora; // desde aquí se mide qué tan rápido cierra soporte
  return vista(store.update(casoId, cambio));
}

/** Casos esperando comité, ordenados por el algoritmo 2 (mayor puntaje primero). */
export function listarColaComite(actor, { tableroId } = {}, ahora = Date.now()) {
  return store
    .all()
    .filter((c) => puedeVer(actor, c) && (!tableroId || c.tableroId === tableroId))
    .filter((c) => c.areaActual === 'comite' && c.estado !== 'cerrado')
    // fechaEntradaComite puede faltar en casos muy antiguos: ahí se usa la fecha de creación.
    .map((c) => ({ ...c, puntaje: calcularPuntaje(c.tipo, c.fechaEntradaComite || c.fechaCreacion, ahora) }))
    .sort((a, b) => b.puntaje - a.puntaje);
}

/** Elimina el caso. Con SQLite se borran también sus movimientos y su resumen (ON DELETE CASCADE). */
export function remove(casoId) {
  return store.remove(casoId);
}
