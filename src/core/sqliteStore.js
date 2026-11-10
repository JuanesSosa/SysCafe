import { db } from './db.js';
import { badRequest, conflict } from './httpError.js';

/**
 * Almacén SQLite con las mismas siete operaciones que memoryStore
 * (all, find, create, update, remove, nextId, seed): los servicios no notan la diferencia.
 * La tabla se llama igual que el prefijo ('caso', 'usuario'...). Traduce camelCase <-> snake_case
 * a partir de las columnas reales de la tabla.
 */
const JSON_COLS = new Set(['palabrasClave']);
const BOOL_COLS = new Set(['viaRapida']);

const aSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const aCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function traducirError(err) {
  const msg = String(err.message || err);
  if (msg.includes('write-once')) throw conflict('texto_original es write-once: no se puede modificar');
  if (/UNIQUE constraint failed/i.test(msg)) throw conflict('Ya existe un registro con ese valor (nombre o correo repetido)');
  if (/FOREIGN KEY constraint failed/i.test(msg)) throw conflict('Tiene registros asociados (usuarios, tableros o casos): no se puede eliminar ni apuntar a algo que no existe');
  if (/constraint/i.test(msg)) throw badRequest(`La base de datos rechazó el dato: ${msg}`);
  throw err;
}

export function createStore(prefix) {
  const tabla = prefix;
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
  const camel = columnas.map(aCamel);

  const aFila = (obj) => {
    const fila = {};
    for (const k of Object.keys(obj)) {
      if (!camel.includes(k)) continue; // ignora campos que no existen en la tabla
      let v = obj[k];
      if (v === undefined) continue;
      if (JSON_COLS.has(k)) v = JSON.stringify(v ?? []);
      else if (BOOL_COLS.has(k)) v = v ? 1 : 0;
      fila[aSnake(k)] = v;
    }
    return fila;
  };

  const aObjeto = (fila) => {
    if (!fila) return null;
    const obj = {};
    for (const [col, v] of Object.entries(fila)) {
      const k = aCamel(col);
      obj[k] = JSON_COLS.has(k) ? JSON.parse(v) : BOOL_COLS.has(k) ? Boolean(v) : v;
    }
    return obj;
  };

  const stmt = {
    all: db.prepare(`SELECT * FROM ${tabla} ORDER BY rowid`),
    find: db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`),
    remove: db.prepare(`DELETE FROM ${tabla} WHERE id = ?`),
    maxId: db.prepare(`SELECT MAX(CAST(substr(id, length(?) + 2) AS INTEGER)) AS n FROM ${tabla} WHERE id LIKE ? || '-%'`),
    count: db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`),
  };

  const store = {
    prefix,

    nextId() {
      return `${prefix}-${(stmt.maxId.get(prefix, prefix).n || 0) + 1}`;
    },

    all: () => stmt.all.all().map(aObjeto),
    find: (id) => aObjeto(stmt.find.get(id)),

    create(data) {
      const fila = aFila({ ...data, id: data.id || store.nextId() });
      const cols = Object.keys(fila);
      try {
        db.prepare(`INSERT INTO ${tabla} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(fila));
      } catch (err) {
        traducirError(err);
      }
      return store.find(fila.id);
    },

    // Solo toca las columnas del cambio: así el trigger de texto_original no se dispara en los avances.
    update(id, patch) {
      if (!store.find(id)) return null;
      const fila = aFila(patch);
      delete fila.id;
      const cols = Object.keys(fila);
      if (cols.length) {
        try {
          db.prepare(`UPDATE ${tabla} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(fila), id);
        } catch (err) {
          traducirError(err);
        }
      }
      return store.find(id);
    },

    remove(id) {
      try {
        return stmt.remove.run(id).changes > 0;
      } catch (err) {
        return traducirError(err);
      }
    },

    // Siembra datos de ejemplo solo si la tabla está vacía (así no se duplican al reiniciar).
    seed(records) {
      if (stmt.count.get().n > 0) return;
      for (const r of records) store.create(r);
    },

    clear: () => db.exec(`DELETE FROM ${tabla}`),
  };
  return store;
}
