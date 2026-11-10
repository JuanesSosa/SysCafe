const AREAS = [
  { id: 'callcenter', nombre: 'Call center', sub: 'Recibe la llamada' },
  { id: 'testeo', nombre: 'Testeo', sub: 'Reproduce y confirma' },
  { id: 'comite', nombre: 'Comité de cambios', sub: 'Primero los de mayor prioridad' },
  { id: 'desarrollo', nombre: 'Desarrollo', sub: 'Ejecuta la solución' },
  { id: 'soporte', nombre: 'Soporte', sub: 'Último centro: cierra con el cliente' },
];
const AREA_NOMBRE = Object.fromEntries(AREAS.map((a) => [a.id, a.nombre]));
const TIPO_NOMBRE = { incidente: 'Incidente', problema: 'Problema', solicitud: 'Solicitud' };
const ROL_NOMBRE = { admin: 'Administrador', cliente: 'Cliente', agenteCallcenter: 'Call center', agenteSoporte: 'Soporte', tester: 'Testeo', comite: 'Comité', desarrollador: 'Desarrollo' };

const state = { me: null, equipos: [], tableros: [], tableroId: null, usuarios: [], casos: [], puntajes: new Map(), orden: [], menu: [], vista: 'tablero' };

const $ = (s) => document.querySelector(s);
const guardar = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* sin almacenamiento: se pedirá iniciar sesión de nuevo */ } };
const leer = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

async function api(path, options = {}) {
  const token = leer('token');
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) {
      mostrarLogin('Tu sesión terminó. Ingresa de nuevo.');
    }
    const err = new Error(data.error || `Error ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('visible'), 3500);
}

const diasEspera = (c) => {
  const d = Math.floor((Date.now() - new Date(c.fechaCreacion).getTime()) / 86400000);
  return d <= 0 ? 'registrado hoy' : d === 1 ? 'espera 1 día' : `espera ${d} días`;
};
const fmtFecha = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const nombreUsuario = (id) => state.usuarios.find((u) => u.id === id)?.nombre || id;
const esAdmin = () => state.me?.rol === 'admin';
const puedeRegistrar = () => esAdmin() || state.me?.rol === 'agenteCallcenter';
const tableroActual = () => state.tableros.find((t) => t.id === state.tableroId) || null;
const nombreEquipo = (id) => state.equipos.find((e) => e.id === id)?.nombre || id;

/* ---------- diálogos ---------- */
document.addEventListener('click', (e) => {
  const id = e.target.dataset?.cerrar;
  if (id) $(`#${id}`).close();
  if (e.target.tagName === 'DIALOG') e.target.close();
});

/* ---------- inicio de sesión ---------- */
const CUENTAS_DEMO = [
  { grupo: 'Administración', cuentas: [['Administrador', 'admin@syscafe.local', 've todos los equipos']] },
  { grupo: 'Equipo Norte', cuentas: [['Sofía Herrera', 'sofia@syscafe.local', 'call center'], ['Laura Gómez', 'laura@syscafe.local', 'testeo'], ['Comité de Cambios', 'comite@syscafe.local', 'comité'], ['Andrés Peña', 'andres@syscafe.local', 'desarrollo'], ['Diego Martínez', 'diego@syscafe.local', 'soporte']] },
  { grupo: 'Equipo Sur', cuentas: [['Mateo Cruz', 'mateo@syscafe.local', 'call center'], ['Paula Nieto', 'paula@syscafe.local', 'testeo'], ['Comité Sur', 'comite.sur@syscafe.local', 'comité'], ['Julián Mora', 'julian@syscafe.local', 'desarrollo'], ['Natalia Vega', 'natalia@syscafe.local', 'soporte']] },
];

function mostrarLogin(mensaje = '') {
  guardar('token', null);
  state.me = null;
  $('#vista-app').hidden = true;
  $('#vista-login').hidden = false;
  $('#login-estado').textContent = mensaje;
  $('#login-estado').className = 'estado';
  $('#demo-cuentas').replaceChildren(
    ...CUENTAS_DEMO.map((g) =>
      el('div', { class: 'demo-grupo' }, el('h3', {}, g.grupo), el('div', {}, g.cuentas.map(([n, correo, rol]) =>
        el('button', { type: 'button', class: 'demo-btn', onclick: () => { $('#form-login [name=correo]').value = correo; $('#form-login [name=clave]').focus(); } }, n, el('small', {}, rol)))))
    )
  );
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const datos = Object.fromEntries(new FormData(e.target));
  const msg = $('#login-estado');
  if (!datos.correo.trim() || !datos.clave) { msg.textContent = 'Escribe tu correo y tu clave.'; msg.className = 'estado error'; return; }
  const boton = e.target.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const r = await api('/auth/login', { method: 'POST', body: { correo: datos.correo.trim(), clave: datos.clave } });
    guardar('token', r.token);
    e.target.reset();
    await entrar(r.usuario);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'estado error';
  } finally {
    boton.disabled = false;
  }
});

$('#btn-salir').addEventListener('click', async () => {
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* da igual: se borra de todos modos */ }
  mostrarLogin();
});

$('#btn-clave').addEventListener('click', () => { $('#form-clave').reset(); $('#clave-estado').textContent = ''; $('#clave').showModal(); });
$('#form-clave').addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(e.target));
  const msg = $('#clave-estado');
  try {
    await api('/auth/cambiar-clave', { method: 'POST', body: d });
    $('#clave').close();
    toast('Clave cambiada.');
  } catch (err) { msg.textContent = err.message; msg.className = 'estado error'; }
});

async function entrar(usuario) {
  state.me = usuario;
  $('#vista-login').hidden = true;
  $('#vista-app').hidden = false;
  $('#u-nombre').textContent = usuario.nombre;
  $('#u-detalle').textContent = esAdmin() ? 'Administrador · todos los equipos' : `${ROL_NOMBRE[usuario.rol]} · ${'cargando…'}`;
  $('#btn-admin').hidden = !esAdmin();
  $('#btn-nueva').hidden = !puedeRegistrar();
  $('#btn-ejemplos').hidden = !puedeRegistrar();
  cambiarVista('tablero');
  await cargarBase();
}

/* ---------- vistas ---------- */
function cambiarVista(v) {
  state.vista = v;
  $('#vista-tablero').hidden = v !== 'tablero';
  $('#vista-admin').hidden = v !== 'admin';
  document.querySelectorAll('.vista-btn').forEach((b) => (b.dataset.vista === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  if (v === 'admin') void pintarAdmin();
}
document.querySelectorAll('.vista-btn').forEach((b) => b.addEventListener('click', () => cambiarVista(b.dataset.vista)));

async function cargarBase() {
  const [equipos, tableros] = await Promise.all([api('/equipos'), api('/tableros')]);
  state.equipos = equipos;
  state.tableros = tableros;
  if (!esAdmin()) $('#u-detalle').textContent = `${ROL_NOMBRE[state.me.rol]} · ${nombreEquipo(state.me.equipoId)}`;
  const guardado = leer('tablero');
  state.tableroId = tableros.find((t) => t.id === guardado)?.id || tableros[0]?.id || null;
  if (!state.menu.length) { state.menu = await api('/casos/menu'); pintarMenu(); }
  await cargarTablero();
}

async function cargarTablero() {
  pintarTabs();
  const t = tableroActual();
  if (!t) {
    state.casos = []; state.usuarios = [];
    $('#aviso-tablero').hidden = false;
    $('#aviso-tablero').textContent = esAdmin() ? 'Aún no hay tableros. Crea uno desde Administración.' : 'Tu equipo todavía no tiene tableros. Pídele al administrador que cree uno.';
    pintarTablero();
    return;
  }
  $('#aviso-tablero').hidden = true;
  guardar('tablero', t.id);
  const q = `?tableroId=${encodeURIComponent(t.id)}`;
  const [usuarios, casos, cola] = await Promise.all([api('/usuarios'), api(`/casos${q}`), api(`/casos/comite/cola${q}`)]);
  state.usuarios = usuarios;
  state.casos = casos;
  state.puntajes = new Map(cola.map((c) => [c.id, c.puntaje]));
  state.orden = cola.map((c) => c.id);
  pintarTablero();
}

function pintarTabs() {
  const t = tableroActual();
  $('#equipo-actual').textContent = t ? nombreEquipo(t.equipoId) : esAdmin() ? 'Todos los equipos' : nombreEquipo(state.me.equipoId);
  $('#tabs-tableros').replaceChildren(
    ...state.tableros.map((x) =>
      el('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': x.id === state.tableroId ? 'true' : 'false',
        onclick: async () => { state.tableroId = x.id; await cargarTablero(); } },
        esAdmin() ? `${nombreEquipo(x.equipoId)} · ${x.nombre}` : x.nombre)
    )
  );
}

function tarjeta(caso) {
  const puntaje = state.puntajes.get(caso.id);
  return el('button', { type: 'button', class: `caso t-${caso.tipo}`, onclick: () => abrirDetalle(caso.id), 'aria-label': `Abrir ${caso.id}` },
    el('span', { class: 'fila' }, el('span', { class: 'id' }, caso.id), el('span', { class: `chip ${caso.tipo}` }, TIPO_NOMBRE[caso.tipo]), caso.viaRapida ? el('span', { class: 'chip rapida' }, 'Vía rápida') : null),
    el('span', { class: 'texto-corto' }, caso.textoOriginal.length > 110 ? `${caso.textoOriginal.slice(0, 107)}…` : caso.textoOriginal),
    el('span', { class: 'pie' }, diasEspera(caso), puntaje !== undefined ? [' · ', el('span', { class: 'prioridad' }, `prioridad ${puntaje.toFixed(1)}`)] : null));
}

function pintarTablero() {
  $('#tablero').replaceChildren(...AREAS.map((area) => {
    let casos = state.casos.filter((c) => c.areaActual === area.id && c.estado !== 'cerrado');
    if (area.id === 'comite') casos = state.orden.map((id) => casos.find((c) => c.id === id)).filter(Boolean);
    const mia = state.me?.area === area.id;
    return el('section', { class: `columna${mia ? ' mia' : ''}`, 'aria-label': area.nombre },
      el('div', { class: 'col-cab' }, el('h3', {}, area.nombre), el('span', { class: 'cuenta' }, casos.length)),
      el('p', { class: 'col-sub' }, mia ? `${area.sub} · tu centro` : area.sub),
      casos.length ? casos.map(tarjeta) : el('p', { class: 'vacio' }, area.id === 'callcenter' ? 'Sin casos. Se registran desde “Registrar llamada”.' : 'Sin casos. Llegan desde el centro anterior.'));
  }));
}

/* ---------- registrar llamada ---------- */
const formCaso = $('#form-caso');
const formEstado = $('#form-estado');
const mensajeForm = (t, tipo) => { formEstado.textContent = t; formEstado.className = `estado ${tipo || ''}`; };

function pintarMenu() {
  $('#menu-opciones').replaceChildren(...state.menu.map((m) =>
    el('label', { class: 'opcion' }, el('input', { type: 'radio', name: 'motivo', value: m.id }),
      el('span', { class: 'op-cuerpo' }, el('span', { class: 'op-tit' }, m.etiqueta), m.tipo ? el('span', { class: `chip ${m.tipo}` }, TIPO_NOMBRE[m.tipo]) : null))));
}

$('#btn-nueva').addEventListener('click', () => {
  const t = tableroActual();
  if (!t) return toast('Primero necesitas un tablero.');
  const clientes = state.usuarios.filter((u) => u.rol === 'cliente' && u.equipoId === t.equipoId);
  $('#nueva-meta').textContent = `${nombreEquipo(t.equipoId)} · ${t.nombre}`;
  const sel = formCaso.querySelector('[name=clienteId]');
  sel.replaceChildren(...clientes.map((u) => el('option', { value: u.id }, u.nombre)));
  mensajeForm(clientes.length ? '' : 'Este equipo no tiene clientes. Pídele al administrador que cree uno.', clientes.length ? '' : 'error');
  $('#nueva').showModal();
});

formCaso.addEventListener('change', (e) => {
  if (e.target.name !== 'motivo') return;
  const otro = e.target.value === 'otro';
  $('#campo-tipo').hidden = !otro;
  $('#detalle-ayuda').textContent = otro ? '(obligatorio, mínimo 10 caracteres)' : '(opcional)';
});

formCaso.addEventListener('submit', async (e) => {
  e.preventDefault();
  const d = Object.fromEntries(new FormData(formCaso));
  const detalle = (d.detalle || '').trim();
  if (!d.clienteId) return mensajeForm('Elige un cliente.', 'error');
  if (!d.motivo) return mensajeForm('Elige en el menú el motivo de la llamada.', 'error');
  if (d.motivo === 'otro' && detalle.length < 10) return mensajeForm('Para “Otro”, describe lo que dijo el cliente (mínimo 10 caracteres).', 'error');
  const boton = formCaso.querySelector('button[type=submit]');
  boton.disabled = true;
  try {
    const caso = await api('/casos', { method: 'POST', body: { tableroId: state.tableroId, clienteId: d.clienteId, canal: d.canal, motivo: d.motivo, detalle: detalle || undefined, tipo: d.motivo === 'otro' ? d.tipo : undefined } });
    formCaso.reset();
    $('#campo-tipo').hidden = true;
    $('#detalle-ayuda').textContent = '(opcional)';
    $('#nueva').close();
    toast(`${caso.id} registrado${caso.viaRapida ? ' como vía rápida' : ''}.`);
    await cargarTablero();
  } catch (err) { mensajeForm(err.message, 'error'); } finally { boton.disabled = false; }
});

$('#btn-ejemplos').addEventListener('click', async () => {
  const t = tableroActual();
  const cliente = state.usuarios.find((u) => u.rol === 'cliente' && u.equipoId === t?.equipoId);
  if (!cliente) return toast('Este equipo no tiene clientes para los ejemplos.');
  const ejemplos = [
    { canal: 'telefonico', motivo: 'contrasena' },
    { canal: 'telefonico', motivo: 'impresion', detalle: 'Sale en blanco desde ayer' },
    { canal: 'presencial', motivo: 'facturaElectronica', detalle: 'Falla al generar la nota crédito' },
    { canal: 'email', motivo: 'mejora', detalle: 'Agregar un campo nuevo en el formulario de reservas' },
  ];
  try {
    for (const e of ejemplos) await api('/casos', { method: 'POST', body: { tableroId: t.id, clienteId: cliente.id, ...e } });
    toast('4 casos de ejemplo en el call center. Ingresa como cada centro para moverlos.');
    await cargarTablero();
  } catch (err) { toast(err.message); }
});

/* ---------- detalle ---------- */
const dialogo = $('#detalle');
const candado = () => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  const rect = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: 5, y: 11, width: 14, height: 10, rx: 2 })) rect.setAttribute(k, v);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M8 11V8a4 4 0 0 1 8 0v3');
  svg.append(rect, path);
  return svg;
};

async function abrirDetalle(id) {
  try {
    const { caso, historial } = await api(`/movimientos/caso/${id}`);
    let resumen = null;
    try { resumen = await api(`/resumenes/${id}`); } catch (err) { if (err.status !== 404) throw err; }
    pintarDetalle(caso, historial, resumen);
    if (!dialogo.open) dialogo.showModal();
  } catch (err) { toast(err.message); }
}

function pintarDetalle(caso, historial, resumen) {
  $('#det-titulo').textContent = caso.id;
  $('#det-meta').textContent = `${TIPO_NOMBRE[caso.tipo]} · ${nombreUsuario(caso.clienteId)} · ${fmtFecha(caso.fechaCreacion)}`;
  const sig = caso.siguienteArea;
  const cerrado = caso.estado === 'cerrado';
  const esCierre = !cerrado && sig === null;
  const meToca = state.me.area === caso.areaActual;

  let bloque;
  if (cerrado) bloque = el('p', { class: 'vacio' }, 'Caso cerrado. El historial queda como registro.');
  else if (!meToca) {
    bloque = el('p', { class: 'bloqueo' }, `Este caso está en ${AREA_NOMBRE[caso.areaActual]}. Solo una persona de ese centro puede moverlo${esAdmin() ? '; el administrador consulta, no mueve casos' : ''}.`);
  } else {
    const saltaComite = caso.viaRapida && caso.areaActual === 'testeo';
    const form = el('form', { class: 'mover', novalidate: true },
      el('p', { class: 'meta', style: 'margin:0' }, esCierre ? 'Último centro: soporte cierra el caso con el cliente.' : `Siguiente centro: ${AREA_NOMBRE[sig]}${saltaComite ? ' (vía rápida: se salta el comité)' : ''}.`),
      el('label', {}, 'Nota del paso', el('input', { name: 'nota', type: 'text', placeholder: esCierre ? 'Ej: cliente notificado y conforme' : 'Qué se hizo antes de pasar al siguiente centro' })),
      el('div', { class: 'acciones' }, el('button', { class: 'btn primary', type: 'submit' }, esCierre ? 'Cerrar caso' : `Pasar a ${AREA_NOMBRE[sig]}`), el('p', { class: 'estado', role: 'alert' })));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nota = (new FormData(form).get('nota') || '').trim();
      const msg = form.querySelector('.estado');
      if (nota.length < 3) { msg.textContent = 'Escribe una nota de al menos 3 caracteres.'; msg.className = 'estado error'; return; }
      try {
        await api('/movimientos', { method: 'POST', body: { casoId: caso.id, nota } });
        toast(esCierre ? `${caso.id} cerrado.` : `${caso.id} pasó a ${AREA_NOMBRE[sig]}.`);
        await cargarTablero();
        await abrirDetalle(caso.id);
      } catch (err) { msg.textContent = err.message; msg.className = 'estado error'; }
    });
    bloque = form;
  }

  const acciones = [];
  if (esAdmin()) {
    acciones.push(el('button', { type: 'button', class: 'btn peligro', onclick: async () => {
      if (!confirm(`¿Eliminar ${caso.id}? Se pierde su historial y no se puede deshacer.`)) return;
      try { await api(`/casos/${caso.id}`, { method: 'DELETE' }); dialogo.close(); toast(`${caso.id} eliminado.`); await cargarTablero(); } catch (err) { toast(err.message); }
    } }, 'Eliminar caso'));
  }

  $('#det-cuerpo').replaceChildren(...[
    el('div', { class: 'sello' }, el('div', { class: 'etiqueta' }, candado(), 'Texto original del cliente, no se puede editar'), el('p', {}, caso.textoOriginal), el('div', { class: 'claves' }, caso.palabrasClave.map((p) => el('span', {}, p)))),
    el('div', {}, el('h3', {}, `Ahora en ${AREA_NOMBRE[caso.areaActual]}`), el('p', { class: 'meta' }, caso.viaRapida ? 'Se parece a casos que Soporte ya resolvió rápido: se salta el comité.' : 'Sigue el flujo completo entre centros.')),
    el('div', {}, el('h3', {}, 'Historial'), historial.length
      ? el('ul', { class: 'historia' }, historial.map((m) => el('li', {}, el('div', { class: 'ruta' }, m.areaOrigen === m.areaDestino ? `Cierre en ${AREA_NOMBRE[m.areaDestino]}` : `${AREA_NOMBRE[m.areaOrigen]} → ${AREA_NOMBRE[m.areaDestino]}`), el('div', {}, m.nota), el('div', { class: 'detalle' }, `${nombreUsuario(m.actorId)} · ${fmtFecha(m.fecha)}`))))
      : el('p', { class: 'vacio' }, 'Aún no se ha movido.')),
    el('div', {}, el('h3', {}, 'Resumen del caso'), resumenCaja(caso, resumen)),
    el('div', {}, el('h3', {}, cerrado ? 'Estado' : 'Siguiente paso'), bloque),
    acciones.length ? el('div', { class: 'acciones-caso' }, acciones) : null,
  ].filter(Boolean)); // replaceChildren convierte null en el texto "null"
}

function resumenCaja(caso, resumen) {
  const boton = el('button', { type: 'button', class: 'btn ghost', onclick: async () => {
    try { await api('/resumenes', { method: 'POST', body: { casoId: caso.id } }); await abrirDetalle(caso.id); } catch (err) { toast(err.message); }
  } }, resumen ? 'Actualizar resumen' : 'Generar resumen');
  return el('div', { class: 'resumen-caja' }, el('p', {}, resumen ? resumen.resumenActual : 'Todavía no hay resumen. Se arma con el texto original y los movimientos del caso.'), boton);
}

/* ---------- administración (solo admin) ---------- */
async function pintarAdmin() {
  const cont = $('#admin-contenido');
  try {
    const [equipos, tableros, usuarios] = await Promise.all([api('/equipos'), api('/tableros'), api('/usuarios')]);
    state.equipos = equipos; state.tableros = tableros;
    const opcionesEquipo = (sel) => equipos.map((e) => el('option', { value: e.id, selected: e.id === sel }, e.nombre));
    const ok = async (fn, msg) => { try { await fn(); toast(msg); await pintarAdmin(); await cargarBase(); } catch (err) { toast(err.message); } };

    const equiposPanel = el('section', { class: 'panel' }, el('h2', {}, 'Equipos y tableros'), el('p', {}, 'Cada equipo ve solo sus tableros. Un equipo puede tener varios.'),
      equipos.map((e) => {
        const ts = tableros.filter((t) => t.equipoId === e.id);
        const nUsers = usuarios.filter((u) => u.equipoId === e.id).length;
        const formT = el('form', { class: 'alta', style: 'margin-top:.5rem;padding-top:.6rem', novalidate: true }, el('label', {}, 'Nuevo tablero', el('input', { name: 'nombre', placeholder: 'Ej: Facturación', minlength: 3 })), el('button', { class: 'btn ghost chico', type: 'submit' }, 'Agregar tablero'));
        formT.addEventListener('submit', (ev) => { ev.preventDefault(); const nombre = new FormData(formT).get('nombre').trim(); void ok(() => api('/tableros', { method: 'POST', body: { equipoId: e.id, nombre } }), 'Tablero creado.'); });
        return el('article', { class: 'equipo-tarjeta' },
          el('header', {}, el('div', {}, el('h3', {}, e.nombre), el('p', { class: 'meta' }, `${nUsers} persona(s) · ${ts.length} tablero(s)${e.descripcion ? ' · ' + e.descripcion : ''}`)),
            el('button', { type: 'button', class: 'btn peligro chico', onclick: () => confirm(`¿Eliminar el equipo ${e.nombre}?`) && void ok(() => api(`/equipos/${e.id}`, { method: 'DELETE' }), 'Equipo eliminado.') }, 'Eliminar equipo')),
          el('div', { class: 'tableros' }, ts.length ? ts.map((t) => el('span', { class: 'pildora' }, t.nombre, el('button', { type: 'button', 'aria-label': `Eliminar tablero ${t.nombre}`, onclick: () => confirm(`¿Eliminar el tablero ${t.nombre}?`) && void ok(() => api(`/tableros/${t.id}`, { method: 'DELETE' }), 'Tablero eliminado.') }, '×'))) : el('span', { class: 'vacio' }, 'Sin tableros.')),
          formT);
      }));
    const formE = el('form', { class: 'alta', novalidate: true }, el('label', {}, 'Nuevo equipo', el('input', { name: 'nombre', placeholder: 'Ej: Equipo Oriente' })), el('label', {}, 'Descripción (opcional)', el('input', { name: 'descripcion' })), el('button', { class: 'btn primary', type: 'submit' }, 'Crear equipo'));
    formE.addEventListener('submit', (ev) => { ev.preventDefault(); const d = Object.fromEntries(new FormData(formE)); void ok(() => api('/equipos', { method: 'POST', body: { nombre: d.nombre.trim(), descripcion: d.descripcion.trim() || undefined } }), 'Equipo creado.'); });
    equiposPanel.append(formE);

    const filas = usuarios.map((u) => {
      const sel = el('select', { 'aria-label': `Equipo de ${u.nombre}`, disabled: u.rol === 'admin' }, u.rol === 'admin' ? el('option', {}, 'Todos') : opcionesEquipo(u.equipoId));
      sel.addEventListener('change', () => void ok(() => api(`/usuarios/${u.id}`, { method: 'PUT', body: { equipoId: sel.value } }), `${u.nombre} cambió de equipo.`));
      return el('tr', {}, el('td', {}, u.nombre), el('td', {}, u.correo), el('td', {}, el('span', { class: 'chip rol' }, ROL_NOMBRE[u.rol])), el('td', {}, sel),
        el('td', { class: 'fin' },
          el('button', { type: 'button', class: 'btn ghost chico', onclick: () => { const c = prompt(`Clave nueva para ${u.nombre} (mínimo 8 caracteres):`); if (c) void ok(() => api(`/usuarios/${u.id}`, { method: 'PUT', body: { clave: c } }), 'Clave restablecida.'); } }, 'Restablecer clave'), ' ',
          u.id === state.me.id ? null : el('button', { type: 'button', class: 'btn peligro chico', onclick: () => confirm(`¿Eliminar a ${u.nombre}?`) && void ok(() => api(`/usuarios/${u.id}`, { method: 'DELETE' }), 'Usuario eliminado.') }, 'Eliminar')));
    });
    const formU = el('form', { class: 'alta', novalidate: true },
      el('label', {}, 'Nombre', el('input', { name: 'nombre' })), el('label', {}, 'Correo', el('input', { name: 'correo', type: 'email' })),
      el('label', {}, 'Rol', el('select', { name: 'rol' }, Object.entries(ROL_NOMBRE).map(([v, n]) => el('option', { value: v }, n)))),
      el('label', {}, 'Equipo', el('select', { name: 'equipoId' }, opcionesEquipo())), el('label', {}, 'Clave inicial', el('input', { name: 'clave', type: 'password', autocomplete: 'new-password' })),
      el('button', { class: 'btn primary', type: 'submit' }, 'Crear usuario'));
    formU.addEventListener('submit', (ev) => { ev.preventDefault(); const d = Object.fromEntries(new FormData(formU)); void ok(() => api('/usuarios', { method: 'POST', body: { ...d, nombre: d.nombre.trim(), correo: d.correo.trim(), equipoId: d.rol === 'admin' ? undefined : d.equipoId } }), 'Usuario creado.'); });
    const usuariosPanel = el('section', { class: 'panel' }, el('h2', {}, 'Personas'), el('p', {}, 'Cambiar a alguien de equipo cambia al instante lo que puede ver.'),
      el('div', { class: 'tabla-scroll' }, el('table', { class: 'tabla' }, el('thead', {}, el('tr', {}, ['Nombre', 'Correo', 'Rol', 'Equipo', ''].map((h) => el('th', {}, h)))), el('tbody', {}, filas))), formU);

    cont.replaceChildren(equiposPanel, usuariosPanel);
  } catch (err) { cont.replaceChildren(el('p', { class: 'estado error' }, err.message)); }
}

/* ---------- arranque ---------- */
(async () => {
  if (!leer('token')) return mostrarLogin();
  try { await entrar(await api('/auth/yo')); } catch { mostrarLogin(); }
})();
