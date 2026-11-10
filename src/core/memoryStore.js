/**
 * Almacén en memoria para los módulos de ejemplo.
 * Cada módulo pide el suyo con createStore('caso') y recibe ids tipo caso-1, caso-2...
 * Al reiniciar el servidor, todo vuelve a los datos de ejemplo (seed) que cada módulo cargue.
 */

export function createStore(prefix) {
  const items = new Map();
  let counter = 0;

  return {
    prefix,

    nextId() {
      counter += 1;
      return `${prefix}-${counter}`;
    },

    all() {
      return Array.from(items.values());
    },

    find(id) {
      return items.get(id) || null;
    },

    create(data) {
      const id = data.id || this.nextId();
      const record = { id, ...data };
      items.set(id, record);
      return record;
    },

    update(id, patch) {
      const existing = items.get(id);
      if (!existing) return null;
      const updated = { ...existing, ...patch, id: existing.id };
      items.set(id, updated);
      return updated;
    },

    remove(id) {
      return items.delete(id);
    },

    // Para sembrar datos de ejemplo respetando el contador de ids
    seed(records) {
      for (const r of records) {
        items.set(r.id, r);
        const n = Number(String(r.id).split('-').pop());
        if (Number.isFinite(n) && n > counter) counter = n;
      }
    },

    clear() {
      items.clear();
      counter = 0;
    },
  };
}
