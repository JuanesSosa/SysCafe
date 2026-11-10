import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Migraciones numeradas del esquema. Cada archivo de src/core/migrations/ se llama NNN_nombre.sql
 * y se aplica una sola vez, en orden, dentro de una transacción. La tabla schema_migracion guarda
 * cuáles ya corrieron. Para cambiar el esquema NUNCA se edita una migración vieja: se agrega otra.
 */
export const CARPETA_MIGRACIONES = fileURLToPath(new URL('./migrations/', import.meta.url));

const PATRON = /^(\d{3})_([a-z0-9_]+)\.sql$/;

export function listarMigraciones(carpeta = CARPETA_MIGRACIONES) {
  const migraciones = fs
    .readdirSync(carpeta)
    .filter((f) => f.endsWith('.sql'))
    .map((archivo) => {
      const m = PATRON.exec(archivo);
      if (!m) throw new Error(`Nombre de migración inválido: "${archivo}" (debe ser NNN_nombre.sql, por ejemplo 003_agregar_algo.sql)`);
      return { version: Number(m[1]), nombre: m[2], archivo, ruta: path.join(carpeta, archivo) };
    })
    .sort((a, b) => a.version - b.version);

  migraciones.forEach((m, i) => {
    if (m.version !== i + 1) throw new Error(`Las migraciones deben ser consecutivas desde 001: falta la ${String(i + 1).padStart(3, '0')} (se encontró ${m.archivo})`);
  });
  return migraciones;
}

/** Aplica las migraciones pendientes. Devuelve las versiones que se aplicaron en esta llamada. */
export function migrar(db, carpeta = CARPETA_MIGRACIONES) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migracion (
    version     INTEGER PRIMARY KEY,
    nombre      TEXT NOT NULL,
    aplicada_en TEXT NOT NULL
  )`);

  const hechas = new Set(db.prepare('SELECT version FROM schema_migracion').all().map((r) => r.version));
  const aplicadas = [];

  for (const mig of listarMigraciones(carpeta)) {
    if (hechas.has(mig.version)) continue;
    const sql = fs.readFileSync(mig.ruta, 'utf8');
    // Procedimiento recomendado por SQLite para cambiar tablas: llaves foráneas apagadas durante la
    // migración (PRAGMA no funciona dentro de una transacción) y revisión de integridad antes de confirmar.
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      const rotas = db.prepare('PRAGMA foreign_key_check').all();
      if (rotas.length > 0) throw new Error(`quedarían ${rotas.length} referencia(s) rotas (tabla ${rotas[0].table})`);
      db.prepare('INSERT INTO schema_migracion (version, nombre, aplicada_en) VALUES (?, ?, ?)').run(mig.version, mig.nombre, new Date().toISOString());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`La migración ${mig.archivo} falló y se deshizo: ${err.message}`);
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
    aplicadas.push(mig.version);
  }
  return aplicadas;
}

export function versionActual(db) {
  const fila = db.prepare('SELECT MAX(version) AS v FROM schema_migracion').get();
  return fila?.v ?? 0;
}
