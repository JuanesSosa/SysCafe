import { forbidden } from './httpError.js';

/**
 * Reglas de permisos compartidas. Una sola política para toda la API:
 *  - "admin" ve y gestiona todo (equipos, tableros, usuarios).
 *  - Cualquier otro rol solo ve lo de SU equipo.
 *  - Recurso de otro equipo → 404 (no se revela que existe). Acción que el rol no puede hacer → 403.
 */
export const esAdmin = (usuario) => usuario?.rol === 'admin';

export function exigirAdmin(usuario, accion = 'Esta acción') {
  if (!esAdmin(usuario)) throw forbidden(`${accion} es solo para administradores`);
}

export function exigirRol(usuario, roles, accion = 'Esta acción') {
  if (!esAdmin(usuario) && !roles.includes(usuario?.rol)) {
    throw forbidden(`${accion} no corresponde a tu rol (${usuario?.rol})`);
  }
}

/** ¿Puede este usuario ver algo que pertenece a ese equipo? */
export const puedeVerEquipo = (usuario, equipoId) => esAdmin(usuario) || (Boolean(equipoId) && equipoId === usuario?.equipoId);
