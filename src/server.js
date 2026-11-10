import { createApp } from './app.js';
import { USA_CLAVE_DE_DEMOSTRACION, CLAVE_INICIAL } from './core/claves.js';

const PORT = process.env.PORT || 3000;

const { app, results } = await createApp();

console.log('Módulos:');
for (const m of results) {
  const mark = m.status === 'ok' ? '✔' : '✘';
  const detail = m.status === 'ok' ? `${m.basePath}  (${m.routes} rutas)` : m.error;
  console.log(`  ${mark} ${m.name.padEnd(10)} ${detail}`);
}
const okCount = results.filter((r) => r.status === 'ok').length;
console.log(`\n${okCount}/${results.length} módulos cargados\n`);

if (USA_CLAVE_DE_DEMOSTRACION) {
  console.log(`⚠ Las cuentas usan la clave de demostración "${CLAVE_INICIAL}". Para otra clave inicial: CLAVE_INICIAL=<clave> (solo afecta cuentas nuevas) o cámbiala desde la app.`);
  console.log('  Administrador de demostración: admin@syscafe.local\n');
}

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log(`Documentación en   http://localhost:${PORT}/docs`);
});
