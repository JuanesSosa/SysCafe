import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrar, versionActual, listarMigraciones, CARPETA_MIGRACIONES } from '../src/core/migrations.js';

const nuevaBase = () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  return db;
};

const carpetaTemporal = (archivos) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syscafe-mig-'));
  for (const [nombre, sql] of Object.entries(archivos)) fs.writeFileSync(path.join(dir, nombre), sql);
  return dir;
};

const ultima = listarMigraciones().at(-1).version;

test('una base nueva queda en la última versión y registra cada migración', () => {
  const db = nuevaBase();
  const aplicadas = migrar(db);
  assert.equal(aplicadas.length, ultima);
  assert.equal(versionActual(db), ultima);
  const registradas = db.prepare('SELECT version FROM schema_migracion ORDER BY version').all().map((r) => r.version);
  assert.deepEqual(registradas, aplicadas);
});

test('volver a migrar no aplica nada otra vez', () => {
  const db = nuevaBase();
  migrar(db);
  assert.deepEqual(migrar(db), []);
  assert.equal(versionActual(db), ultima);
});

test('el trigger que protege texto_original queda creado por la migración inicial', () => {
  const db = nuevaBase();
  migrar(db);
  db.exec(`INSERT INTO usuario (id, nombre, rol, area) VALUES ('u1', 'Ana', 'cliente', NULL)`);
  db.exec(`INSERT INTO caso (id, cliente_id, canal, tipo, texto_original, area_actual, estado, fecha_creacion)
           VALUES ('c1', 'u1', 'email', 'solicitud', 'original', 'callcenter', 'abierto', '2026-01-01T00:00:00.000Z')`);
  assert.throws(() => db.exec(`UPDATE caso SET texto_original = 'cambiado' WHERE id = 'c1'`), /write-once/);
});

test('una base creada antes de las migraciones se actualiza y reconstruye las fechas desde el historial', () => {
  const db = nuevaBase();
  // Se simula la base de la v3: solo el esquema inicial, sin tabla schema_migracion ni columnas nuevas.
  db.exec(fs.readFileSync(path.join(CARPETA_MIGRACIONES, '001_inicial.sql'), 'utf8'));
  db.exec(`INSERT INTO usuario (id, nombre, rol, area) VALUES ('u1', 'Ana', 'cliente', NULL), ('u2', 'Luis', 'tester', 'testeo')`);
  db.exec(`INSERT INTO caso (id, cliente_id, canal, tipo, texto_original, area_actual, estado, fecha_creacion)
           VALUES ('c1', 'u1', 'email', 'problema', 'algo falla', 'comite', 'enProceso', '2026-01-01T00:00:00.000Z')`);
  db.exec(`INSERT INTO movimiento (id, caso_id, actor_id, area_origen, area_destino, nota, fecha)
           VALUES ('m1', 'c1', 'u2', 'testeo', 'comite', 'reproducido', '2026-01-05T10:00:00.000Z')`);

  migrar(db);

  const caso = db.prepare('SELECT * FROM caso WHERE id = ?').get('c1');
  assert.equal(caso.fecha_entrada_comite, '2026-01-05T10:00:00.000Z');
  assert.equal(caso.fecha_entrada_soporte, null);
  assert.equal(versionActual(db), ultima);
});

test('una migración que falla se deshace por completo y no queda registrada', () => {
  const dir = carpetaTemporal({
    '001_ok.sql': 'CREATE TABLE a (id INTEGER);',
    '002_rota.sql': 'CREATE TABLE b (id INTEGER); INSERT INTO tabla_que_no_existe VALUES (1);',
  });
  const db = nuevaBase();
  assert.throws(() => migrar(db, dir), /002_rota\.sql falló y se deshizo/);
  assert.equal(versionActual(db), 1);
  const existeB = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'b'`).get();
  assert.equal(existeB, undefined);
});

test('las migraciones deben ser consecutivas y tener el nombre NNN_nombre.sql', () => {
  const conHueco = carpetaTemporal({ '001_a.sql': 'SELECT 1;', '003_c.sql': 'SELECT 1;' });
  assert.throws(() => listarMigraciones(conHueco), /consecutivas/);
  const nombreMalo = carpetaTemporal({ 'agregar_algo.sql': 'SELECT 1;' });
  assert.throws(() => listarMigraciones(nombreMalo), /Nombre de migración inválido/);
});

test('migración 003: una base con datos de la versión anterior conserva todo y queda en un equipo y tablero generales', () => {
  // Se arma una base "vieja" (solo migraciones 001 y 002) con un usuario, un caso y un movimiento.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'syscafe-viejas-'));
  for (const f of ['001_inicial.sql', '002_fechas_de_flujo.sql']) fs.copyFileSync(path.join(CARPETA_MIGRACIONES, f), path.join(dir, f));
  const db = nuevaBase();
  migrar(db, dir);
  db.exec(`INSERT INTO usuario (id, nombre, rol, area) VALUES ('usuario-1','Camila','cliente',NULL), ('usuario-6','Sofía','agenteCallcenter','callcenter')`);
  db.exec(`INSERT INTO caso (id, cliente_id, canal, tipo, texto_original, palabras_clave, area_actual, estado, via_rapida, fecha_creacion)
           VALUES ('caso-1','usuario-1','email','incidente','No imprime nada','[]','callcenter','abierto',0,'2026-01-01T00:00:00.000Z')`);
  db.exec(`INSERT INTO movimiento (id, caso_id, actor_id, area_origen, area_destino, nota, fecha)
           VALUES ('movimiento-1','caso-1','usuario-6','callcenter','testeo','pasa','2026-01-02T00:00:00.000Z')`);

  assert.deepEqual(migrar(db), [3]); // solo la 003

  assert.equal(db.prepare('SELECT COUNT(*) n FROM usuario').get().n, 2);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM movimiento').get().n, 1, 'el historial sigue ahí');
  const caso = db.prepare('SELECT texto_original, tablero_id FROM caso WHERE id = ?').get('caso-1');
  assert.equal(caso.texto_original, 'No imprime nada');
  assert.equal(caso.tablero_id, 'tablero-1');
  const equipos = db.prepare("SELECT DISTINCT equipo_id FROM usuario").all().map((r) => r.equipo_id);
  assert.deepEqual(equipos, ['equipo-1']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM equipo').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], 'no quedó ninguna referencia rota');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1, 'las llaves foráneas vuelven a quedar activas');

  // El trigger de texto_original sigue vivo tras reconstruir tablas
  assert.throws(() => db.prepare("UPDATE caso SET texto_original = 'cambiado' WHERE id = 'caso-1'").run(), /write-once/);
  // y el rol admin ya es válido, mientras uno inventado no
  db.exec(`INSERT INTO usuario (id, nombre, rol) VALUES ('usuario-7','Admin','admin')`);
  assert.throws(() => db.exec(`INSERT INTO usuario (id, nombre, rol) VALUES ('usuario-8','X','rey')`));
});

test('migración 003 en una base vacía no inventa equipos ni tableros', () => {
  const db = nuevaBase();
  migrar(db);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM equipo').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM tablero').get().n, 0);
});
