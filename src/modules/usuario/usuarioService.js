import { createStore } from '../../core/store.js';
import { hashClave, CLAVE_INICIAL } from '../../core/claves.js';
import { esAdmin } from '../../core/permisos.js';

const store = createStore('usuario');

const ROLES = ['admin', 'cliente', 'agenteCallcenter', 'agenteSoporte', 'tester', 'comite', 'desarrollador'];
export const ROLES_VALIDOS = ROLES;
export const AREAS_VALIDAS = ['callcenter', 'testeo', 'comite', 'desarrollo', 'soporte'];
// Área (centro del flujo) que le corresponde a cada rol. Cliente y admin no pertenecen a ningún centro.
export const AREA_POR_ROL = { agenteCallcenter: 'callcenter', tester: 'testeo', comite: 'comite', desarrollador: 'desarrollo', agenteSoporte: 'soporte' };

/** Nunca sale de este módulo con el hash de la clave. */
function publico(u) {
  if (!u) return null;
  const { claveHash, ...resto } = u;
  return resto;
}

/** Cuentas de demostración: dos equipos completos (uno por cada centro del flujo) y un administrador. */
export function sembrar() {
  store.seed([
    { id: 'usuario-1', nombre: 'Camila Rojas', rol: 'cliente', area: null, equipoId: 'equipo-1', correo: 'camila@syscafe.local' },
    { id: 'usuario-2', nombre: 'Diego Martínez', rol: 'agenteSoporte', area: 'soporte', equipoId: 'equipo-1', correo: 'diego@syscafe.local' },
    { id: 'usuario-3', nombre: 'Laura Gómez', rol: 'tester', area: 'testeo', equipoId: 'equipo-1', correo: 'laura@syscafe.local' },
    { id: 'usuario-4', nombre: 'Comité de Cambios', rol: 'comite', area: 'comite', equipoId: 'equipo-1', correo: 'comite@syscafe.local' },
    { id: 'usuario-5', nombre: 'Andrés Peña', rol: 'desarrollador', area: 'desarrollo', equipoId: 'equipo-1', correo: 'andres@syscafe.local' },
    { id: 'usuario-6', nombre: 'Sofía Herrera', rol: 'agenteCallcenter', area: 'callcenter', equipoId: 'equipo-1', correo: 'sofia@syscafe.local' },
    { id: 'usuario-7', nombre: 'Administrador SysCafé', rol: 'admin', area: null, equipoId: null, correo: 'admin@syscafe.local' },
    { id: 'usuario-8', nombre: 'Valentina Ruiz', rol: 'cliente', area: null, equipoId: 'equipo-2', correo: 'valentina@syscafe.local' },
    { id: 'usuario-9', nombre: 'Natalia Vega', rol: 'agenteSoporte', area: 'soporte', equipoId: 'equipo-2', correo: 'natalia@syscafe.local' },
    { id: 'usuario-10', nombre: 'Paula Nieto', rol: 'tester', area: 'testeo', equipoId: 'equipo-2', correo: 'paula@syscafe.local' },
    { id: 'usuario-11', nombre: 'Comité Sur', rol: 'comite', area: 'comite', equipoId: 'equipo-2', correo: 'comite.sur@syscafe.local' },
    { id: 'usuario-12', nombre: 'Julián Mora', rol: 'desarrollador', area: 'desarrollo', equipoId: 'equipo-2', correo: 'julian@syscafe.local' },
    { id: 'usuario-13', nombre: 'Mateo Cruz', rol: 'agenteCallcenter', area: 'callcenter', equipoId: 'equipo-2', correo: 'mateo@syscafe.local' },
  ]);
}

/**
 * Deja la base lista para iniciar sesión: a las cuentas que vienen de una versión anterior (sin correo
 * ni clave) les pone un correo usuario-N@syscafe.local y la clave inicial, y si no hay ningún admin crea uno.
 * Devuelve cuántas cuentas tocó, para avisar en el arranque.
 */
export function asegurarCuentas() {
  let tocadas = 0;
  for (const u of store.all()) {
    const cambio = {};
    if (!u.correo) cambio.correo = `${u.id}@syscafe.local`;
    if (!u.claveHash) cambio.claveHash = hashClave(CLAVE_INICIAL);
    if (Object.keys(cambio).length) {
      store.update(u.id, cambio);
      tocadas++;
    }
  }
  if (!store.all().some((u) => u.rol === 'admin')) {
    store.create({ nombre: 'Administrador SysCafé', rol: 'admin', area: null, equipoId: null, correo: 'admin@syscafe.local', claveHash: hashClave(CLAVE_INICIAL) });
    tocadas++;
  }
  return tocadas;
}

export const find = (id) => publico(store.find(id));

/** Solo para el inicio de sesión: incluye el hash. */
export const buscarPorCorreo = (correo) => store.all().find((u) => u.correo && u.correo.toLowerCase() === String(correo).toLowerCase()) || null;
export const credenciales = (id) => store.find(id);
export const fijarClave = (id, clave) => publico(store.update(id, { claveHash: hashClave(clave) }));

export function listarVisibles(actor, { rol } = {}) {
  return store
    .all()
    .filter((u) => esAdmin(actor) || (u.equipoId && u.equipoId === actor.equipoId))
    .filter((u) => !rol || u.rol === rol)
    .map(publico);
}

export function buscarVisible(actor, id) {
  const u = store.find(id);
  if (!u) return null;
  return esAdmin(actor) || (u.equipoId && u.equipoId === actor.equipoId) ? publico(u) : null;
}

export function create(d) {
  const area = d.rol in AREA_POR_ROL ? d.area || AREA_POR_ROL[d.rol] : null;
  return publico(
    store.create({
      nombre: d.nombre.trim(),
      rol: d.rol,
      area,
      equipoId: d.rol === 'admin' ? null : d.equipoId,
      correo: d.correo.trim().toLowerCase(),
      claveHash: hashClave(d.clave),
    })
  );
}

export function update(id, patch) {
  const cambio = {};
  for (const k of ['nombre', 'rol', 'area', 'equipoId']) if (patch[k] !== undefined) cambio[k] = patch[k];
  if (patch.correo !== undefined) cambio.correo = patch.correo.trim().toLowerCase();
  if (patch.clave !== undefined) cambio.claveHash = hashClave(patch.clave);
  return publico(store.update(id, cambio));
}

export const remove = (id) => store.remove(id);
