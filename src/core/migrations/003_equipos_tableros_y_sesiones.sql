-- Migración 003: equipos, tableros, inicio de sesión y permisos por equipo.
--  * equipo: grupo de trabajo. tablero: un Kanban que pertenece a un equipo.
--  * usuario: pasa a tener equipo, correo y clave (guardada como hash), y el rol "admin".
--  * caso: ahora vive en un tablero (y por lo tanto en un equipo).
--  * sesion: sesiones de inicio de sesión (se guarda el hash del token, nunca el token).
-- El runner apaga las llaves foráneas mientras corre una migración y comprueba la integridad antes de confirmar.

CREATE TABLE equipo (
  id          TEXT PRIMARY KEY,
  nombre      TEXT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL DEFAULT ''
);

CREATE TABLE tablero (
  id        TEXT PRIMARY KEY,
  equipo_id TEXT NOT NULL REFERENCES equipo(id),
  nombre    TEXT NOT NULL,
  UNIQUE (equipo_id, nombre)
);

-- SQLite no permite cambiar un CHECK: se reconstruye la tabla usuario para aceptar el rol "admin".
CREATE TABLE usuario_nuevo (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  rol        TEXT NOT NULL CHECK (rol IN ('admin','cliente','agenteCallcenter','agenteSoporte','tester','comite','desarrollador')),
  area       TEXT CHECK (area IS NULL OR area IN ('callcenter','testeo','comite','desarrollo','soporte')),
  equipo_id  TEXT REFERENCES equipo(id),
  correo     TEXT,
  clave_hash TEXT
);
INSERT INTO usuario_nuevo (id, nombre, rol, area) SELECT id, nombre, rol, area FROM usuario;
DROP TABLE usuario;
ALTER TABLE usuario_nuevo RENAME TO usuario;
CREATE UNIQUE INDEX usuario_correo_unico ON usuario (correo) WHERE correo IS NOT NULL;

ALTER TABLE caso ADD COLUMN tablero_id TEXT REFERENCES tablero(id);

CREATE TABLE sesion (
  id         TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

-- Base que ya tenía datos (creada con una versión anterior): todo lo existente queda en un equipo y un tablero generales.
INSERT INTO equipo (id, nombre, descripcion)
  SELECT 'equipo-1', 'Equipo General', 'Se creó al actualizar: agrupa a los usuarios y casos que ya existían.'
  WHERE EXISTS (SELECT 1 FROM usuario);
INSERT INTO tablero (id, equipo_id, nombre)
  SELECT 'tablero-1', 'equipo-1', 'Tablero general'
  WHERE EXISTS (SELECT 1 FROM usuario);
UPDATE usuario SET equipo_id = 'equipo-1' WHERE EXISTS (SELECT 1 FROM equipo WHERE id = 'equipo-1');
UPDATE caso SET tablero_id = 'tablero-1' WHERE EXISTS (SELECT 1 FROM tablero WHERE id = 'tablero-1');
