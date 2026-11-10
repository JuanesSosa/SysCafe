import { createStore } from '../../core/store.js';
import { esAdmin } from '../../core/permisos.js';

const store = createStore('tablero');

export function sembrar() {
  store.seed([
    { id: 'tablero-1', equipoId: 'equipo-1', nombre: 'Soporte general' },
    { id: 'tablero-2', equipoId: 'equipo-1', nombre: 'Facturación' },
    { id: 'tablero-3', equipoId: 'equipo-2', nombre: 'Soporte general' },
  ]);
}

export const find = (id) => store.find(id);
export const listarVisibles = (actor, { equipoId } = {}) =>
  store.all().filter((t) => (esAdmin(actor) || t.equipoId === actor.equipoId) && (!equipoId || t.equipoId === equipoId));
export const buscarVisible = (actor, id) => {
  const t = store.find(id);
  return t && (esAdmin(actor) || t.equipoId === actor.equipoId) ? t : null;
};
export const create = (d) => store.create({ equipoId: d.equipoId, nombre: d.nombre.trim() });
export const update = (id, patch) => store.update(id, patch);
export const remove = (id) => store.remove(id);
