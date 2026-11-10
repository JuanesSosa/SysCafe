import { createStore } from '../../core/store.js';

const store = createStore('movimiento');

export function historialDeCaso(casoId) {
  return store
    .all()
    .filter((m) => m.casoId === casoId)
    .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
}

export function create(data) {
  return store.create({
    casoId: data.casoId,
    actorId: data.actorId,
    areaOrigen: data.areaOrigen,
    areaDestino: data.areaDestino,
    nota: data.nota,
    fecha: new Date().toISOString(),
  });
}

export function list() {
  return store.all();
}
