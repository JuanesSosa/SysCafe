-- Migración 001: esquema inicial de SysCafé (mismo modelo entidad-relación de la presentación).
-- Usa IF NOT EXISTS para que una base creada antes de existir las migraciones quede registrada sin errores.
CREATE TABLE IF NOT EXISTS usuario (
  id     TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  rol    TEXT NOT NULL CHECK (rol IN ('cliente','agenteCallcenter','agenteSoporte','tester','comite','desarrollador')),
  area   TEXT CHECK (area IS NULL OR area IN ('callcenter','testeo','comite','desarrollo','soporte'))
);

CREATE TABLE IF NOT EXISTS caso (
  id             TEXT PRIMARY KEY,
  cliente_id     TEXT NOT NULL REFERENCES usuario(id),
  canal          TEXT NOT NULL CHECK (canal IN ('telefonico','email','presencial')),
  tipo           TEXT NOT NULL CHECK (tipo IN ('incidente','problema','solicitud')),
  motivo         TEXT,
  texto_original TEXT NOT NULL,
  palabras_clave TEXT NOT NULL DEFAULT '[]',
  area_actual    TEXT NOT NULL CHECK (area_actual IN ('callcenter','testeo','comite','desarrollo','soporte')),
  estado         TEXT NOT NULL CHECK (estado IN ('abierto','enProceso','resuelto','cerrado')),
  via_rapida     INTEGER NOT NULL DEFAULT 0,
  fecha_creacion TEXT NOT NULL,
  fecha_cierre   TEXT
);

-- texto_original es write-once también en la base de datos: cualquier UPDATE que lo mencione falla.
CREATE TRIGGER IF NOT EXISTS caso_texto_original_write_once
BEFORE UPDATE OF texto_original ON caso
BEGIN
  SELECT RAISE(ABORT, 'texto_original es write-once');
END;

CREATE TABLE IF NOT EXISTS movimiento (
  id           TEXT PRIMARY KEY,
  caso_id      TEXT NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
  actor_id     TEXT NOT NULL REFERENCES usuario(id),
  area_origen  TEXT NOT NULL CHECK (area_origen  IN ('callcenter','testeo','comite','desarrollo','soporte')),
  area_destino TEXT NOT NULL CHECK (area_destino IN ('callcenter','testeo','comite','desarrollo','soporte')),
  nota         TEXT NOT NULL,
  fecha        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumen (
  id             TEXT PRIMARY KEY,
  caso_id        TEXT NOT NULL REFERENCES caso(id) ON DELETE CASCADE,
  resumen_actual TEXT NOT NULL,
  palabras_clave TEXT NOT NULL DEFAULT '[]',
  actualizado_en TEXT NOT NULL
);
