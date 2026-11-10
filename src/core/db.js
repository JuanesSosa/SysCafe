import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrar, versionActual } from './migrations.js';

/**
 * Conexión única a SQLite (módulo node:sqlite, incluido en Node 22.13 o superior; no se instala nada).
 * El archivo es data/syscafe.db, o el que indique DB_FILE. DB_FILE=:memory: sirve para pruebas.
 * Al abrir, aplica las migraciones pendientes de src/core/migrations/.
 */
const archivo = process.env.DB_FILE || path.resolve('data', 'syscafe.db');
if (archivo !== ':memory:') fs.mkdirSync(path.dirname(archivo), { recursive: true });

export const db = new DatabaseSync(archivo);
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA journal_mode = WAL');
export const migracionesAplicadas = migrar(db);
export const versionEsquema = versionActual(db);
export const archivoDb = archivo;
