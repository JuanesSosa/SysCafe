import path from 'node:path';
import express from 'express';
import { loadModules } from './core/moduleLoader.js';
import { createDocsRouter } from './core/docsRouter.js';
import { errorHandler, notFoundHandler } from './core/errorHandler.js';
import { exigirSesion } from './core/autenticacion.js';

export async function createApp() {
  const app = express();
  app.use(express.json());

  const { router: modulesRouter, results } = await loadModules();

  // Interfaz web (tablero de casos): archivos estáticos de public/
  app.use(express.static(path.resolve('public')));

  app.use('/', createDocsRouter(() => results));
  app.use('/api', exigirSesion, modulesRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return { app, results };
}
