import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.DB_FILE = ':memory:';
delete process.env.DB;

// Las pruebas se ejecutan desde la raíz del proyecto (npm test): el cargador busca src/modules desde ahí.
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

/** Inicia sesión una sola vez por correo y guarda el token. */
const entrar = async (correo) => {
  if (!tokens.has(correo)) {
    const r = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ correo, clave: CLAVE }) });
    assert.equal(r.status, 200, `login de ${correo}`);
    tokens.set(correo, (await r.json()).token);
  }
  return tokens.get(correo);
};

const pedirComo = async (correo, metodo, ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${await entrar(correo)}` },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
};

const pedirSinSesion = async (metodo, ruta, cuerpo) => {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'content-type': 'application/json' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  return { status: res.status, body: texto ? JSON.parse(texto) : null };
};

// Equipo Norte (tablero-1): uno por centro, más su cliente.
const CALLCENTER = 'sofia@syscafe.local';
const TESTER = 'laura@syscafe.local';
const DESARROLLADOR = 'andres@syscafe.local';
const SOPORTE = 'diego@syscafe.local';
const CLIENTE = 'usuario-1';
const TABLERO = 'tablero-1';

const pedir = (metodo, ruta, cuerpo) => pedirComo(CALLCENTER, metodo, ruta, cuerpo);

test('el menú del call center trae los 9 motivos', async () => {
  const { status, body } = await pedir('GET', '/api/casos/menu');
  assert.equal(status, 200);
  assert.equal(body.length, 9);
});

test('registrar un caso con datos inválidos responde 400', async () => {
  const { status } = await pedir('POST', '/api/casos', { tableroId: TABLERO, clienteId: CLIENTE });
  assert.equal(status, 400);
});

test('un caso de vía rápida recorre los centros y se cierra por la API', async () => {
  const creado = await pedir('POST', '/api/casos', { tableroId: TABLERO, clienteId: CLIENTE, canal: 'telefonico', motivo: 'contrasena' });
  assert.equal(creado.status, 201);
  assert.equal(creado.body.viaRapida, true);
  const id = creado.body.id;

  const avanzar = (quien) => pedirComo(quien, 'POST', '/api/movimientos', { casoId: id, nota: 'avance de prueba' });

  assert.equal((await avanzar(TESTER)).status, 409, 'un tester no puede mover un caso que está en el call center');

  let r = await avanzar(CALLCENTER);
  assert.equal(r.status, 201);
  assert.equal(r.body.caso.areaActual, 'testeo');

  r = await avanzar(TESTER);
  assert.equal(r.body.caso.areaActual, 'desarrollo', 'la vía rápida se salta el comité');

  r = await avanzar(DESARROLLADOR);
  assert.equal(r.body.caso.areaActual, 'soporte');
  assert.equal(r.body.caso.estado, 'resuelto');

  r = await avanzar(SOPORTE);
  assert.equal(r.body.caso.estado, 'cerrado');

  assert.equal((await avanzar(SOPORTE)).status, 409, 'un caso cerrado ya no se mueve');

  const historial = await pedir('GET', `/api/movimientos/caso/${id}`);
  assert.equal(historial.body.historial.length, 4);
});

test('la cola del comité responde con los casos esperando', async () => {
  const creado = await pedir('POST', '/api/casos', { tableroId: TABLERO, clienteId: CLIENTE, canal: 'email', motivo: 'falla' });
  const id = creado.body.id;
  await pedirComo(CALLCENTER, 'POST', '/api/movimientos', { casoId: id, nota: 'a testeo' });
  await pedirComo(TESTER, 'POST', '/api/movimientos', { casoId: id, nota: 'al comité' });

  const { status, body } = await pedir('GET', '/api/casos/comite/cola');
  assert.equal(status, 200);
  const caso = body.find((c) => c.id === id);
  assert.ok(caso, 'el incidente aparece en la cola');
  assert.equal(caso.puntaje, 5);
});

test('una ruta que no existe responde 404', async () => {
  assert.equal((await pedir('GET', '/api/nada')).status, 404);
});
