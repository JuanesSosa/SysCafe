import test from 'node:test';
import assert from 'node:assert/strict';

// Cada archivo de prueba corre en su propio proceso: aquí la base vive solo en memoria.
process.env.DB_FILE = ':memory:';
delete process.env.DB;

const { db } = await import('../src/core/db.js');
const casoService = await import('../src/modules/caso/casoService.js');
const usuarioService = await import('../src/modules/usuario/usuarioService.js');
const equipoService = await import('../src/modules/equipo/equipoService.js');

// Sin el motor de módulos nadie siembra los datos de ejemplo: aquí se hace a mano (equipos antes que usuarios).
equipoService.sembrar();
usuarioService.sembrar();

const {
  extraerPalabrasClave, similitudJaccard, calcularPuntaje, calcularViaRapida,
  historicoResueltoRapido, siguienteArea, listarColaComite, create, avanzar, find,
} = casoService;

// Estas pruebas usan el servicio directo (sin API ni sesión): se consulta como administrador.
const ADMIN = { id: 'admin', rol: 'admin', equipoId: null };
const DIA = 86400000;
const hace = (dias) => new Date(Date.now() - dias * DIA).toISOString();

const nuevoCaso = (motivo, detalle = '') =>
  create({ clienteId: 'usuario-1', canal: 'telefonico', motivo, detalle }, { usuarioService });

const cerrarCaso = (id) => {
  let caso = find(id);
  while (caso.estado !== 'cerrado') caso = avanzar(id);
  return caso;
};

const esConflicto = (e) => e.status === 409;

// ---------- Reglas puras ----------

test('extraerPalabrasClave quita tildes, signos, palabras de relleno y duplicados', () => {
  assert.deepEqual(
    extraerPalabrasClave('Olvidé mi contraseña, la contraseña del sistema!'),
    ['olvide', 'contrasena', 'sistema']
  );
});

test('similitudJaccard: palabras compartidas entre palabras distintas', () => {
  const nuevo = extraerPalabrasClave('Olvidé mi contraseña y no logro tener acceso al sistema');
  const historico = ['contrasena', 'acceso', 'olvide', 'ingresar'];
  assert.equal(similitudJaccard(nuevo, historico), 3 / 5); // 0,6, el ejemplo de la presentación
  assert.equal(similitudJaccard([], []), 0);
});

test('calcularPuntaje: peso del tipo más 0,5 por cada día de espera', () => {
  const ahora = Date.parse('2026-06-30T12:00:00.000Z');
  const desde = (dias) => new Date(ahora - dias * DIA).toISOString();
  assert.equal(calcularPuntaje('solicitud', desde(12), ahora), 7); // C-098 de la presentación
  assert.equal(calcularPuntaje('incidente', desde(0), ahora), 5); // C-104
  assert.equal(calcularPuntaje('solicitud', desde(1), ahora), 1.5); // C-101
  assert.equal(calcularPuntaje('problema', desde(2), ahora), 4);
});

test('calcularViaRapida exige similitud de 0,5 o más con un caso resuelto en menos de 3 días', () => {
  const claves = ['alfa', 'beta', 'gamma', 'delta'];
  assert.equal(calcularViaRapida(claves, [{ palabrasClave: claves, diasResolucion: 1 }]), true);
  assert.equal(calcularViaRapida(claves, [{ palabrasClave: claves, diasResolucion: 3 }]), false, 'tardó 3 días: ya no es rápido');
  assert.equal(calcularViaRapida(claves, [{ palabrasClave: ['alfa', 'otra', 'cosa', 'mas'], diasResolucion: 1 }]), false, 'similitud 1/7');
  assert.equal(calcularViaRapida(claves, []), false);
});

test('siguienteArea: vía rápida salta el comité; soporte es el último centro', () => {
  assert.equal(siguienteArea({ viaRapida: true, areaActual: 'testeo' }), 'desarrollo');
  assert.equal(siguienteArea({ viaRapida: false, areaActual: 'testeo' }), 'comite');
  assert.equal(siguienteArea({ viaRapida: true, areaActual: 'callcenter' }), 'testeo');
  assert.equal(siguienteArea({ viaRapida: false, areaActual: 'soporte' }), null);
});

// ---------- Flujo completo sobre SQLite ----------

test('una solicitud de contraseña es vía rápida y se salta el comité', () => {
  const caso = nuevoCaso('contrasena');
  assert.equal(caso.viaRapida, true);
  assert.equal(avanzar(caso.id).areaActual, 'testeo');
  const enDesarrollo = avanzar(caso.id);
  assert.equal(enDesarrollo.areaActual, 'desarrollo');
  assert.equal(enDesarrollo.fechaEntradaComite, null, 'nunca entró al comité');
});

test('un caso normal pasa por los cinco centros, se cierra y ya no se mueve', () => {
  const caso = nuevoCaso('impuestos');
  assert.equal(caso.viaRapida, false);
  assert.equal(caso.areaActual, 'callcenter');

  const recorrido = [];
  let actual = caso;
  while (actual.siguienteArea) {
    actual = avanzar(caso.id);
    recorrido.push(actual.areaActual);
    if (actual.areaActual === 'comite') assert.ok(actual.fechaEntradaComite, 'guarda cuándo entró al comité');
    if (actual.areaActual === 'soporte') {
      assert.equal(actual.estado, 'resuelto');
      assert.ok(actual.fechaEntradaSoporte, 'guarda cuándo entró a soporte');
    }
  }
  assert.deepEqual(recorrido, ['testeo', 'comite', 'desarrollo', 'soporte']);

  const cerrado = avanzar(caso.id); // en soporte, avanzar cierra
  assert.equal(cerrado.estado, 'cerrado');
  assert.ok(cerrado.fechaCierre);
  assert.throws(() => avanzar(caso.id), esConflicto);
});

test('la vía rápida aprende: una solicitud que soporte cerró rápido enseña a la siguiente parecida', () => {
  const primera = nuevoCaso('mejora');
  assert.equal(primera.viaRapida, false, 'al inicio nadie ha resuelto una mejora');
  cerrarCaso(primera.id);

  assert.ok(historicoResueltoRapido().some((h) => h.id === primera.id), 'el caso cerrado entra al histórico real');
  const segunda = nuevoCaso('mejora');
  assert.equal(segunda.viaRapida, true, 'la segunda ya se salta el comité');
});

test('un problema cerrado no enseña a la vía rápida (solo cuentan las solicitudes)', () => {
  const problema = nuevoCaso('impresion');
  cerrarCaso(problema.id);
  assert.ok(!historicoResueltoRapido().some((h) => h.id === problema.id));
});

test('un caso que soporte tardó 3 días o más en cerrar no cuenta como rápido', () => {
  const lento = {
    id: 'lento', tipo: 'solicitud', estado: 'cerrado', motivo: null, palabrasClave: ['reporte', 'mensual', 'ventas'],
    fechaEntradaSoporte: hace(5), fechaCierre: hace(0),
  };
  const [, , real] = historicoResueltoRapido([lento]);
  assert.ok(real.diasResolucion >= 3);
  assert.equal(calcularViaRapida(['reporte', 'mensual', 'ventas'], historicoResueltoRapido([lento])), false);
});

// ---------- Aging ----------

test('el aging cuenta desde que el caso entró al comité, no desde que se creó', () => {
  const caso = nuevoCaso('baseDatos'); // problema: peso 3
  avanzar(caso.id); // testeo
  avanzar(caso.id); // comité

  // El caso se creó hace 30 días pero acaba de entrar al comité.
  db.prepare('UPDATE caso SET fecha_creacion = ? WHERE id = ?').run(hace(30), caso.id);
  const puntaje = () => listarColaComite(ADMIN).find((c) => c.id === caso.id).puntaje;
  assert.equal(puntaje(), 3, 'sin ventaja por el tiempo que tardó antes de llegar');

  // Ahora lleva 10 días esperando en el comité.
  db.prepare('UPDATE caso SET fecha_entrada_comite = ? WHERE id = ?').run(hace(10), caso.id);
  assert.equal(puntaje(), 3 + 10 * 0.5);
});

test('la cola ordena por puntaje: una solicitud vieja pasa antes que un incidente nuevo', () => {
  const vieja = nuevoCaso('impuestos');
  const incidente = nuevoCaso('falla');
  for (const c of [vieja, incidente]) { avanzar(c.id); avanzar(c.id); }
  db.prepare('UPDATE caso SET fecha_entrada_comite = ? WHERE id = ?').run(hace(12), vieja.id);

  const ids = listarColaComite(ADMIN).map((c) => c.id);
  assert.ok(ids.indexOf(vieja.id) < ids.indexOf(incidente.id), 'solicitud con 12 días (7,0) antes que incidente nuevo (5,0)');
});

// ---------- Texto sellado ----------

test('texto_original no cambia ni con avances ni con un UPDATE directo en la base', () => {
  const caso = nuevoCaso('descargaFactura', 'No me deja bajar la de octubre');
  const original = caso.textoOriginal;
  avanzar(caso.id);
  assert.equal(find(caso.id).textoOriginal, original);
  assert.throws(() => db.prepare('UPDATE caso SET texto_original = ? WHERE id = ?').run('cambiado', caso.id), /write-once/);
  assert.equal(find(caso.id).textoOriginal, original);
});
