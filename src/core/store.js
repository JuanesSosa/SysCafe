/**
 * Punto único para pedir un almacén. DB=sqlite (por defecto) guarda en data/syscafe.db;
 * DB=memory vuelve al almacén en memoria (los datos se pierden al reiniciar).
 */
const modo = (process.env.DB || 'sqlite').toLowerCase();
if (!['sqlite', 'memory'].includes(modo)) throw new Error(`DB="${modo}" no es válido: usa "sqlite" o "memory"`);

let impl;
try {
  impl = modo === 'memory' ? await import('./memoryStore.js') : await import('./sqliteStore.js');
} catch (err) {
  if (modo === 'sqlite') {
    throw new Error(`No se pudo abrir SQLite (${err.message}). Requiere Node 22.13 o superior. Para seguir sin base de datos: DB=memory`);
  }
  throw err;
}

export const createStore = impl.createStore;
export const modoAlmacen = modo;
