import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { validateModuleShape, validateRoute } from './moduleContract.js';
import { errorHandler } from './errorHandler.js';

const MODULES_DIR = path.resolve('src/modules');
const IGNORED = new Set(['_template']);

function listModuleFolders() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs
    .readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !IGNORED.has(d.name))
    .map((d) => d.name)
    .sort();
}

async function importModule(folder) {
  const indexPath = path.join(MODULES_DIR, folder, 'index.js');
  if (!fs.existsSync(indexPath)) {
    return { ok: false, error: 'Falta el archivo index.js dentro de la carpeta del módulo' };
  }
  try {
    const imported = await import(pathToFileURL(indexPath).href);
    return { ok: true, mod: imported.default };
  } catch (err) {
    return { ok: false, error: `No se pudo importar index.js: ${err.message}` };
  }
}

/**
 * Descubre, valida, resuelve dependencias y monta los módulos de src/modules/.
 * Devuelve { router, results } — results es lo que consumen docsRouter.js,
 * server.js (log de arranque) y scripts/modules.js (list / check).
 */
export async function loadModules() {
  const folders = listModuleFolders();
  const candidates = new Map(); // name -> { mod, basePath, dependencies, optionalDependencies }
  const results = new Map(); // name -> { name, basePath, status, routes, error }

  // 1) importar + validar forma
  for (const folder of folders) {
    const imported = await importModule(folder);
    if (!imported.ok) {
      results.set(folder, { name: folder, basePath: null, status: 'error', routes: 0, error: imported.error });
      continue;
    }
    const shapeErrors = validateModuleShape(folder, imported.mod);
    if (shapeErrors.length > 0) {
      results.set(folder, { name: folder, basePath: imported.mod?.basePath || null, status: 'error', routes: 0, error: shapeErrors.join('; ') });
      continue;
    }
    candidates.set(folder, {
      mod: imported.mod,
      basePath: imported.mod.basePath,
      dependencies: imported.mod.dependencies || [],
      optionalDependencies: imported.mod.optionalDependencies || [],
    });
  }

  // 2) basePath único
  const seenBasePaths = new Map(); // basePath -> owner
  for (const [name, c] of candidates) {
    const owner = seenBasePaths.get(c.basePath);
    if (owner) {
      results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: `"basePath" ${c.basePath} ya lo usa el módulo "${owner}"` });
      candidates.delete(name);
    } else {
      seenBasePaths.set(c.basePath, name);
    }
  }

  // 3) dependencias obligatorias que no existen como carpeta
  for (const [name, c] of candidates) {
    for (const dep of c.dependencies) {
      if (!folders.includes(dep)) {
        results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: `Requiere el módulo "${dep}", que no está en src/modules/` });
        candidates.delete(name);
        break;
      }
    }
  }

  // 4) ciclos entre dependencias obligatorias (DFS con pila de recursión)
  function findCycle() {
    const color = new Map(); // 0=blanco,1=gris,2=negro
    const stack = [];
    let cycle = null;

    function visit(node) {
      if (cycle) return;
      color.set(node, 1);
      stack.push(node);
      const c = candidates.get(node);
      for (const dep of c ? c.dependencies : []) {
        if (!candidates.has(dep)) continue;
        const depColor = color.get(dep) || 0;
        if (depColor === 1) {
          const start = stack.indexOf(dep);
          cycle = stack.slice(start);
          return;
        }
        if (depColor === 0) visit(dep);
        if (cycle) return;
      }
      stack.pop();
      color.set(node, 2);
    }

    for (const node of candidates.keys()) {
      if (!color.has(node)) visit(node);
      if (cycle) return cycle;
    }
    return null;
  }

  let cycle = findCycle();
  while (cycle) {
    for (const name of cycle) {
      const c = candidates.get(name);
      results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: 'Dependencia circular entre módulos' });
      candidates.delete(name);
    }
    cycle = findCycle();
  }

  // 5) módulos que dependían (obligatorio) de uno que ya quedó descartado: se omiten en cascada
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, c] of candidates) {
      const missing = c.dependencies.find((dep) => !candidates.has(dep));
      if (missing) {
        results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: `Se omite: depende de "${missing}", que no cargó correctamente` });
        candidates.delete(name);
        changed = true;
      }
    }
  }

  // 6) orden de montaje: dependencias (obligatorias + opcionales, si existen) antes que el dependiente
  const order = [];
  const visited = new Set();
  function visitOrder(name) {
    if (visited.has(name) || !candidates.has(name)) return;
    visited.add(name);
    const c = candidates.get(name);
    for (const dep of [...c.dependencies, ...c.optionalDependencies]) {
      if (candidates.has(dep)) visitOrder(dep);
    }
    order.push(name);
  }
  for (const name of candidates.keys()) visitOrder(name);

  // 7) setup() de cada módulo, en orden, con getService() que respeta el contrato
  const services = new Map(); // name -> services expuestos
  const router = express.Router();

  for (const name of order) {
    const c = candidates.get(name);
    const declared = new Set([...c.dependencies, ...c.optionalDependencies]);

    const getService = (depName) => {
      if (!declared.has(depName)) {
        throw new Error(`El módulo "${name}" pidió el servicio "${depName}" sin declararlo en dependencies u optionalDependencies`);
      }
      return services.has(depName) ? services.get(depName) : null;
    };

    let setupResult;
    try {
      setupResult = c.mod.setup({ getService });
    } catch (err) {
      results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: `Error al ejecutar setup(): ${err.message}` });
      continue;
    }

    const routes = setupResult?.routes || [];
    const routeErrors = routes.flatMap((r, i) => validateRoute(r, i));
    if (routeErrors.length > 0) {
      results.set(name, { name, basePath: c.basePath, status: 'error', routes: 0, error: routeErrors.join('; ') });
      continue;
    }

    services.set(name, setupResult.services || {});

    const moduleRouter = express.Router();
    for (const r of routes) {
      moduleRouter[r.method.toLowerCase()](r.path, wrapAsync(r.handler));
    }
    router.use(c.basePath, moduleRouter);

    results.set(name, {
      name,
      basePath: c.basePath,
      status: 'ok',
      routes: routes.length,
      error: null,
      description: c.mod.description || '',
      routeTable: routes.map((r) => ({ method: r.method.toLowerCase(), path: `${c.basePath}${r.path}`, summary: r.summary, body: r.body, query: r.query, params: r.params, responses: r.responses })),
    });
  }

  // devolver los resultados en el orden en que se descubrieron las carpetas (más predecible para /docs y el log)
  const orderedResults = folders.map((f) => results.get(f)).filter(Boolean);

  return { router, results: orderedResults };
}

function wrapAsync(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export { errorHandler };
