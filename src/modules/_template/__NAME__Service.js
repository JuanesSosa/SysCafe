import { createStore } from '../../core/store.js';

const store = createStore('__NAME__');

store.seed([
  { id: '__NAME__-1', title: 'Ejemplo uno' },
  { id: '__NAME__-2', title: 'Ejemplo dos' },
]);

export function list() {
  return store.all();
}

export function find(id) {
  return store.find(id);
}

export function create(data) {
  return store.create({ title: data.title });
}

export function update(id, patch) {
  return store.update(id, patch);
}

export function remove(id) {
  return store.remove(id);
}
