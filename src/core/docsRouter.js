import express from 'express';

const STYLE = `
  :root{--navy:#1E2761;--red:#E63946;--paper:#F7F8FC;--line:#E3E6F0;--muted:#5B6180}
  *{box-sizing:border-box}
  body{font-family:Calibri,"Segoe UI",system-ui,sans-serif;margin:0;background:var(--paper);color:#222842;line-height:1.45}
  header{background:var(--navy);color:#fff;padding:1.3rem clamp(1rem,4vw,3rem);display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center}
  header a{color:#C9D2F5}
  main{max-width:960px;margin:0 auto;padding:1.5rem clamp(1rem,4vw,2rem) 3rem}
  h1,h2{font-family:Cambria,Georgia,serif;color:var(--navy);margin:0 0 .5rem}
  header h1{color:#fff;font-size:1.6rem;margin:0}
  a{color:var(--navy)}
  table{width:100%;border-collapse:collapse;margin:.5rem 0 1.5rem;background:#fff;border:1px solid var(--line);border-radius:10px;overflow:hidden}
  th,td{text-align:left;padding:.55rem .7rem;border-bottom:1px solid var(--line);font-size:.95rem;vertical-align:top}
  th{background:#EEF1FB;color:var(--navy)}
  .ok{color:#1a7f4b;font-weight:bold} .err{color:#b3202c;font-weight:bold}
  code{background:#EEF1FB;padding:.1rem .35rem;border-radius:4px}
  .badge{display:inline-block;padding:.1rem .55rem;border-radius:999px;font-size:.78rem;font-weight:bold;border:1.5px solid currentColor}
  .get{color:#1E2761;background:#E6EAFB} .post{color:#1a7f4b;background:#E6F5EC}
  .put,.patch{color:#8a5200;background:#FFF3DC} .delete{color:#b3202c;background:#FDECEE}
  :focus-visible{outline:3px solid var(--red);outline-offset:2px}
  @media (max-width:700px){table{display:block;overflow-x:auto}}
`;

function layout(title, body) {
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="icon" href="data:,"><title>${title}</title><style>${STYLE}</style></head><body>
  <header><h1>Documentación de la API</h1><a href="/">Volver al tablero</a></header><main>${body}</main></body></html>`;
}

export function createDocsRouter(getResults) {
  const router = express.Router();

  router.get('/docs', (req, res) => {
    const results = getResults();
    const rows = results
      .map((m) => {
        const status = m.status === 'ok' ? '<span class="ok">✔</span>' : '<span class="err">✘</span>';
        const link = `<a href="/docs/${m.name}">${m.name}</a>`;
        return `<tr><td>${status}</td><td>${link}</td><td><code>${m.basePath || '—'}</code></td><td>${m.status === 'ok' ? m.routes + ' rutas' : `<span class="err">${m.error}</span>`}</td></tr>`;
      })
      .join('');
    const okCount = results.filter((r) => r.status === 'ok').length;
    res.send(
      layout(
        'Documentación de módulos',
        `<h2>Módulos</h2><p>${okCount} de ${results.length} módulos cargados.</p>
         <table><thead><tr><th></th><th>Módulo</th><th>Ruta base</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table>
         <p><a href="/api/_modules">/api/_modules</a> · <a href="/api/_routes">/api/_routes</a> · <a href="/api/health">/api/health</a></p>`
      )
    );
  });

  router.get('/docs/:module', (req, res) => {
    const m = getResults().find((r) => r.name === req.params.module);
    if (!m) return res.status(404).send(layout('No encontrado', '<p>Ese módulo no existe.</p>'));

    if (m.status !== 'ok') {
      return res.send(layout(m.name, `<h2>${m.name}</h2><p class="err">${m.error}</p><p><a href="/docs">&larr; Volver a los módulos</a></p>`));
    }

    const rows = m.routeTable
      .map((r) => {
        const fields = (schema) =>
          schema
            ? Object.entries(schema)
                .map(([k, v]) => `<code>${k}${v.required ? '*' : ''}</code>`)
                .join(' ')
            : '';
        return `<tr>
          <td><span class="badge ${r.method}">${r.method.toUpperCase()}</span></td>
          <td><code>${r.path}</code></td>
          <td>${r.summary}</td>
          <td>${fields(r.body)}</td>
          <td>${fields(r.query)}</td>
        </tr>`;
      })
      .join('');

    res.send(
      layout(
        m.name,
        `<h2>${m.name}</h2><p>${m.description || ''}</p><p><code>${m.basePath}</code></p>
         <table><thead><tr><th>Método</th><th>Ruta</th><th>Resumen</th><th>Body</th><th>Query</th></tr></thead><tbody>${rows}</tbody></table>
         <p><a href="/docs">&larr; volver</a></p>`
      )
    );
  });

  router.get('/api/_modules', (req, res) => {
    res.json(
      getResults().map((m) => ({ name: m.name, basePath: m.basePath, status: m.status, routes: m.routes, error: m.error }))
    );
  });

  router.get('/api/_routes', (req, res) => {
    const flat = getResults()
      .filter((m) => m.status === 'ok')
      .flatMap((m) => m.routeTable.map((r) => ({ module: m.name, method: r.method, path: r.path, summary: r.summary })));
    res.json(flat);
  });

  router.get('/api/health', (req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  return router;
}
