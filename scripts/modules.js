#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadModules } from '../src/core/moduleLoader.js';

const [, , cmd, arg] = process.argv;

const MODULES_DIR = path.resolve('src/modules');
const TEMPLATE_DIR = path.join(MODULES_DIR, '_template');

async function list() {
  const { results } = await loadModules();
  for (const m of results) {
    if (m.status !== 'ok') {
      console.log(`✘ ${m.name}: ${m.error}`);
      continue;
    }
    console.log(`\n${m.name}  (${m.basePath})`);
    for (const r of m.routeTable) {
      console.log(`  ${r.method.toUpperCase().padEnd(6)} ${r.path.padEnd(28)} ${r.summary}`);
    }
  }
}

async function check() {
  const { results } = await loadModules();
  let failed = false;
  for (const m of results) {
    const mark = m.status === 'ok' ? '✔' : '✘';
    console.log(`${mark} ${m.name.padEnd(12)} ${m.status === 'ok' ? `${m.basePath} (${m.routes} rutas)` : m.error}`);
    if (m.status !== 'ok') failed = true;
  }
  const ok = results.filter((r) => r.status === 'ok').length;
  console.log(`\n${ok}/${results.length} módulos cargados`);
  process.exit(failed ? 1 : 0);
}

function pluralizar(nombre) {
  if (nombre.endsWith('s')) return nombre;
  return `${nombre}s`;
}

function create(nombre) {
  if (!nombre) {
    console.error('Uso: npm run modules:create -- <nombre>');
    process.exit(1);
  }
  if (!/^[a-z][a-zA-Z0-9]*$/.test(nombre)) {
    console.error('El nombre debe estar en camelCase, ej: hotel, bookReview');
    process.exit(1);
  }

  const destino = path.join(MODULES_DIR, nombre);
  if (fs.existsSync(destino)) {
    console.error(`Ya existe src/modules/${nombre}`);
    process.exit(1);
  }

  fs.mkdirSync(destino);
  const basePath = pluralizar(nombre);

  for (const file of fs.readdirSync(TEMPLATE_DIR)) {
    const contenido = fs
      .readFileSync(path.join(TEMPLATE_DIR, file), 'utf-8')
      .replaceAll('__NAME__', nombre)
      .replaceAll('__BASEPATH__', basePath);
    const nuevoNombre = file.replace('__NAME__', nombre);
    fs.writeFileSync(path.join(destino, nuevoNombre), contenido);
  }

  console.log(`Creado src/modules/${nombre}/  →  /api/${basePath}`);
  console.log('Con npm run dev el servidor lo recoge solo. Revisa:');
  console.log(`  1. ${nombre}Routes.js  (campos reales)`);
  console.log(`  2. ${nombre}Service.js (lógica y datos)`);
  console.log(`  3. description en index.js`);
}

switch (cmd) {
  case 'list':
    await list();
    break;
  case 'check':
    await check();
    break;
  case 'create':
    create(arg);
    break;
  default:
    console.log('Uso: node scripts/modules.js <list|check|create> [nombre]');
    process.exit(1);
}
