/**
 * Reglas de forma que debe cumplir el `index.js` de un módulo y cada una
 * de sus rutas. moduleLoader.js llama estas funciones antes de montar nada.
 * Los mensajes de error son literales: se muestran tal cual en /docs y en
 * `npm run modules:check`.
 */

const CAMEL_CASE = /^[a-z][a-zA-Z0-9]*$/;
const BASE_PATH = /^\/[a-zA-Z0-9-]+$/;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'];

export function isCamelCase(name) {
  return CAMEL_CASE.test(name);
}

/**
 * Valida la forma general del módulo (sin tocar sus rutas todavía).
 * Devuelve un array de mensajes de error; vacío si todo está bien.
 */
export function validateModuleShape(folderName, mod) {
  const errors = [];

  if (!mod || typeof mod !== 'object') {
    errors.push('El index.js debe exportar por defecto un objeto');
    return errors;
  }

  if (!isCamelCase(folderName)) {
    errors.push('el nombre de la carpeta debe estar en camelCase');
  }

  if (!mod.name || typeof mod.name !== 'string') {
    errors.push('"name" es obligatorio y debe ser un texto');
  } else if (mod.name !== folderName) {
    errors.push(`"name" ("${mod.name}") debe ser igual al nombre de la carpeta ("${folderName}")`);
  }

  if (!mod.basePath || typeof mod.basePath !== 'string' || !BASE_PATH.test(mod.basePath)) {
    errors.push('"basePath" debe ser un texto como "/rooms"');
  }

  if (mod.dependencies !== undefined && !Array.isArray(mod.dependencies)) {
    errors.push('"dependencies" debe ser un arreglo de nombres de módulo');
  }

  if (mod.optionalDependencies !== undefined && !Array.isArray(mod.optionalDependencies)) {
    errors.push('"optionalDependencies" debe ser un arreglo de nombres de módulo');
  }

  if (typeof mod.setup !== 'function') {
    errors.push('"setup" es obligatorio y debe ser una función');
  }

  return errors;
}

/**
 * Valida una ruta de la tabla que devuelve setup(). `index` es 0-based,
 * se muestra como #N con N = index+1 para que coincida con lo que lee un humano.
 */
export function validateRoute(route, index) {
  const errors = [];
  const label = `ruta #${index + 1}`;

  if (!route || typeof route !== 'object') {
    return [`${label}: la ruta debe ser un objeto`];
  }

  if (!route.method || !HTTP_METHODS.includes(String(route.method).toLowerCase())) {
    errors.push(`${label} (${route.path || '?'}): "method" debe ser uno de ${HTTP_METHODS.join('|')}`);
  }
  if (typeof route.path !== 'string') {
    errors.push(`${label}: "path" es obligatorio`);
  }
  if (!route.summary || typeof route.summary !== 'string') {
    errors.push(`${label} (${route.path || '?'}): "summary" es obligatorio`);
  }
  if (typeof route.handler !== 'function') {
    errors.push(`${label} (${route.path || '?'}): "handler" es obligatorio`);
  }

  return errors;
}
