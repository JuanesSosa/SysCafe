import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.DB_FILE = ':memory:';
delete process.env.DB;
const { createApp } = await import('../src/app.js');

let server;
let base;
before(async () => {
  const { app } = await createApp();
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const CLAVE = 'syscafe123';
const tokens = new Map();
const llamar = async (token, metodo, ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const t = await res.text();
  return { status: res.status, body: t ? JSON.parse(t) : null };
};
const login = (correo, clave = CLAVE) => llamar(null, 'POST', '/api/auth/login', { correo, clave });
const como = async (correo, metodo, ruta, cuerpo) => {
  if (!tokens.has(correo)) tokens.set(correo, (await login(correo)).body.token);
  return llamar(tokens.get(correo), metodo, ruta, cuerpo);
};

const NORTE = { callcenter: 'sofia@syscafe.local', tester: 'laura@syscafe.local', cliente: 'camila@syscafe.local' };
const SUR = { callcenter: 'mateo@syscafe.local', tester: 'paula@syscafe.local', comite: 'comite.sur@syscafe.local' };
const ADMIN = 'admin@syscafe.local';

const casoEnNorte = async () =>
  (await como(NORTE.callcenter, 'POST', '/api/casos', { tableroId: 'tablero-1', clienteId: 'usuario-1', canal: 'telefonico', motivo: 'falla' })).body;

// ---------- inicio de sesión ----------

test('sin sesión no se entra a ninguna ruta de la API, salvo el login', async () => {
  for (const ruta of ['/api/casos', '/api/usuarios', '/api/equipos', '/api/tableros', '/api/casos/menu']) {
    assert.equal((await llamar(null, 'GET', ruta)).status, 401, ruta);
  }
  assert.equal((await llamar('token-inventado', 'GET', '/api/casos')).status, 401);
});

test('login: acepta la clave correcta, rechaza la incorrecta con el mismo mensaje exista o no el correo', async () => {
  const bueno = await login(NORTE.callcenter);
  assert.equal(bueno.status, 200);
  assert.ok(bueno.body.token);
  assert.equal(bueno.body.usuario.claveHash, undefined, 'el hash nunca sale por la API');

  const malaClave = await login(NORTE.callcenter, 'incorrecta');
  const noExiste = await login('nadie@syscafe.local', 'incorrecta');
  assert.equal(malaClave.status, 401);
  assert.equal(noExiste.status, 401);
  assert.equal(malaClave.body.error ?? malaClave.body.message, noExiste.body.error ?? noExiste.body.message);
});

test('tras 5 intentos fallidos el correo se bloquea, incluso con la clave correcta', async () => {
  const correo = SUR.comite;
  for (let i = 0; i < 5; i++) assert.equal((await login(correo, 'mala-clave-' + i)).status, 401);
  assert.equal((await login(correo)).status, 429);
});

test('cerrar sesión invalida el token y cambiar la clave cierra las otras sesiones', async () => {
  const a = (await login('natalia@syscafe.local')).body.token;
  const b = (await login('natalia@syscafe.local')).body.token;
  assert.equal((await llamar(a, 'GET', '/api/auth/yo')).status, 200);

  assert.equal((await llamar(a, 'POST', '/api/auth/cambiar-clave', { claveActual: CLAVE, claveNueva: 'otra-clave-nueva' })).status, 204);
  assert.equal((await llamar(b, 'GET', '/api/auth/yo')).status, 401, 'la otra sesión se cerró');
  assert.equal((await llamar(a, 'GET', '/api/auth/yo')).status, 200, 'la sesión que cambió la clave sigue');
  assert.equal((await login('natalia@syscafe.local')).status, 401, 'la clave vieja ya no sirve');
  assert.equal((await login('natalia@syscafe.local', 'otra-clave-nueva')).status, 200);

  assert.equal((await llamar(a, 'POST', '/api/auth/logout')).status, 204);
  assert.equal((await llamar(a, 'GET', '/api/auth/yo')).status, 401);
});

// ---------- aislamiento entre equipos ----------

test('un equipo no ve los casos, tableros ni personas del otro', async () => {
  const caso = await casoEnNorte();
  assert.equal(caso.tableroId, 'tablero-1');
  assert.equal(caso.equipoId, 'equipo-1');

  // Norte lo ve; Sur no, ni en la lista ni por id (404, no 403: no se revela que existe).
  assert.ok((await como(NORTE.tester, 'GET', '/api/casos')).body.some((c) => c.id === caso.id));
  assert.ok(!(await como(SUR.tester, 'GET', '/api/casos')).body.some((c) => c.id === caso.id));
  assert.equal((await como(SUR.tester, 'GET', `/api/casos/${caso.id}`)).status, 404);
  assert.equal((await como(SUR.tester, 'GET', `/api/movimientos/caso/${caso.id}`)).status, 404);
  assert.equal((await como(SUR.tester, 'POST', '/api/resumenes', { casoId: caso.id })).status, 404);
  assert.equal((await como(SUR.tester, 'GET', `/api/resumenes/${caso.id}`)).status, 404);

  // Tableros, equipos y usuarios, igual.
  const tablerosSur = (await como(SUR.tester, 'GET', '/api/tableros')).body;
  assert.deepEqual(tablerosSur.map((t) => t.id), ['tablero-3']);
  assert.equal((await como(SUR.tester, 'GET', '/api/tableros/tablero-1')).status, 404);
  assert.deepEqual((await como(SUR.tester, 'GET', '/api/equipos')).body.map((e) => e.id), ['equipo-2']);
  assert.equal((await como(SUR.tester, 'GET', '/api/equipos/equipo-1')).status, 404);
  assert.equal((await como(SUR.tester, 'GET', '/api/usuarios/usuario-1')).status, 404);
  const personasSur = (await como(SUR.tester, 'GET', '/api/usuarios')).body;
  assert.ok(personasSur.length > 0 && personasSur.every((u) => u.equipoId === 'equipo-2'));
});

test('no se puede mover, resumir ni colar un caso en el tablero de otro equipo', async () => {
  const caso = await casoEnNorte();
  // Sur intenta avanzar el caso de Norte
  assert.equal((await como(SUR.callcenter, 'POST', '/api/movimientos', { casoId: caso.id, nota: 'intento ajeno' })).status, 404);
  // Sur intenta registrar un caso en el tablero de Norte
  const colado = await como(SUR.callcenter, 'POST', '/api/casos', { tableroId: 'tablero-1', clienteId: 'usuario-8', canal: 'email', motivo: 'falla' });
  assert.equal(colado.status, 404);
  // y con un cliente de otro equipo en su propio tablero
  const clienteAjeno = await como(SUR.callcenter, 'POST', '/api/casos', { tableroId: 'tablero-3', clienteId: 'usuario-1', canal: 'email', motivo: 'falla' });
  assert.equal(clienteAjeno.status, 400);
  // El caso de Norte sigue intacto
  const intacto = (await como(NORTE.callcenter, 'GET', `/api/casos/${caso.id}`)).body;
  assert.equal(intacto.areaActual, 'callcenter');
});

test('la cola del comité y los movimientos solo muestran lo del propio equipo', async () => {
  const caso = await casoEnNorte();
  await como(NORTE.callcenter, 'POST', '/api/movimientos', { casoId: caso.id, nota: 'a testeo' });
  await como(NORTE.tester, 'POST', '/api/movimientos', { casoId: caso.id, nota: 'al comité' });

  assert.ok((await como('comite@syscafe.local', 'GET', '/api/casos/comite/cola')).body.some((c) => c.id === caso.id));
  assert.ok(!(await como('mateo@syscafe.local', 'GET', '/api/casos/comite/cola')).body.some((c) => c.id === caso.id));
  assert.ok(!(await como(SUR.tester, 'GET', '/api/movimientos')).body.some((m) => m.casoId === caso.id));
});

// ---------- permisos por rol ----------

test('solo el call center registra casos y solo el admin los elimina', async () => {
  const datos = { tableroId: 'tablero-1', clienteId: 'usuario-1', canal: 'email', motivo: 'falla' };
  assert.equal((await como(NORTE.tester, 'POST', '/api/casos', datos)).status, 403);
  assert.equal((await como(NORTE.cliente, 'POST', '/api/casos', datos)).status, 403);

  const caso = await casoEnNorte();
  assert.equal((await como(NORTE.callcenter, 'DELETE', `/api/casos/${caso.id}`)).status, 403);
  assert.equal((await como(ADMIN, 'DELETE', `/api/casos/${caso.id}`)).status, 204);
});

test('un cliente o el admin no avanzan casos (no son un centro del flujo)', async () => {
  const caso = await casoEnNorte();
  assert.equal((await como(NORTE.cliente, 'POST', '/api/movimientos', { casoId: caso.id, nota: 'yo lo muevo' })).status, 403);
  assert.equal((await como(ADMIN, 'POST', '/api/movimientos', { casoId: caso.id, nota: 'yo lo muevo' })).status, 403);
});

test('quien avanza es la persona con sesión: un actorId en el cuerpo se ignora', async () => {
  const caso = await casoEnNorte();
  const r = await como(NORTE.tester, 'POST', '/api/movimientos', { casoId: caso.id, actorId: 'usuario-6', nota: 'me hago pasar por el call center' });
  assert.equal(r.status, 409, 'el tester no es del centro donde está el caso');
});

test('el admin ve todo y gestiona equipos, tableros y usuarios; los demás no', async () => {
  assert.equal((await como(ADMIN, 'GET', '/api/equipos')).body.length, 2);
  assert.equal((await como(ADMIN, 'GET', '/api/tableros')).body.length, 3);

  // Los demás no gestionan
  assert.equal((await como(NORTE.callcenter, 'POST', '/api/equipos', { nombre: 'Equipo Pirata' })).status, 403);
  assert.equal((await como(NORTE.callcenter, 'POST', '/api/tableros', { equipoId: 'equipo-1', nombre: 'Mío' })).status, 403);
  assert.equal((await como(NORTE.callcenter, 'PUT', '/api/usuarios/usuario-6', { equipoId: 'equipo-2' })).status, 403);
  assert.equal((await como(NORTE.callcenter, 'DELETE', '/api/usuarios/usuario-1')).status, 403);

  // El admin sí: crea equipo, tablero y usuario, y el usuario nuevo solo ve su tablero
  const equipo = (await como(ADMIN, 'POST', '/api/equipos', { nombre: 'Equipo Oriente' })).body;
  const tablero = (await como(ADMIN, 'POST', '/api/tableros', { equipoId: equipo.id, nombre: 'Soporte oriente' })).body;
  const nuevo = await como(ADMIN, 'POST', '/api/usuarios', { nombre: 'Rosa Pardo', rol: 'tester', equipoId: equipo.id, correo: 'rosa@syscafe.local', clave: 'clave-de-rosa-1' });
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.body.area, 'testeo', 'el área sale del rol');
  assert.equal(nuevo.body.claveHash, undefined);

  const token = (await login('rosa@syscafe.local', 'clave-de-rosa-1')).body.token;
  assert.deepEqual((await llamar(token, 'GET', '/api/tableros')).body.map((t) => t.id), [tablero.id]);

  // Mover a una persona de equipo cambia lo que ve, sin tocar su clave
  assert.equal((await como(ADMIN, 'PUT', `/api/usuarios/${nuevo.body.id}`, { equipoId: 'equipo-2' })).status, 200);
  assert.deepEqual((await llamar(token, 'GET', '/api/tableros')).body.map((t) => t.id), ['tablero-3']);
});

test('validaciones del admin: correo repetido, equipo inexistente, clave corta, sin autoeliminarse', async () => {
  const base = { nombre: 'Persona Prueba', rol: 'tester', equipoId: 'equipo-1', correo: 'prueba@syscafe.local', clave: 'clave-larga-ok' };
  assert.equal((await como(ADMIN, 'POST', '/api/usuarios', { ...base, correo: 'laura@syscafe.local' })).status, 409);
  assert.equal((await como(ADMIN, 'POST', '/api/usuarios', { ...base, equipoId: 'equipo-99' })).status, 400);
  assert.equal((await como(ADMIN, 'POST', '/api/usuarios', { ...base, clave: 'corta' })).status, 400);
  assert.equal((await como(ADMIN, 'POST', '/api/usuarios', { ...base, equipoId: undefined })).status, 400);
  assert.equal((await como(ADMIN, 'DELETE', '/api/usuarios/usuario-7')).status, 409);
  assert.equal((await como(ADMIN, 'DELETE', '/api/equipos/equipo-1')).status, 409, 'el equipo aún tiene usuarios y tableros');
});
