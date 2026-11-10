import { createStore } from '../../core/store.js';
import { esAdmin } from '../../core/permisos.js';

const store = createStore('equipo');

export function sembrar() {
  store.seed([
    { id: 'equipo-1', nombre: 'Equipo Norte', descripcion: 'Atiende a los clientes de la zona norte.' },
    { id: 'equipo-2', nombre: 'Equipo Sur', descripcion: 'Atiende a los clientes de la zona sur.' },
  ]);
}

export const find = (id) => store.find(id);
export const listarVisibles = (actor) => store.all().filter((e) => esAdmin(actor) || e.id === actor.equipoId);
export const buscarVisible = (actor, id) => {
  const e = store.find(id);
  return e && (esAdmin(actor) || e.id === actor.equipoId) ? e : null;
};
export const create = (d) => store.create({ nombre: d.nombre.trim(), descripcion: d.descripcion || '' });
export const update = (id, patch) => store.update(id, patch);
export const remove = (id) => store.remove(id);
