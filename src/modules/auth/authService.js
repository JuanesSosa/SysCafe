import { createStore } from '../../core/store.js';
import { nuevoToken, hashToken, verificarClave } from '../../core/claves.js';
import { tooManyRequests, unauthorized } from '../../core/httpError.js';

const sesiones = createStore('sesion');

const HORAS_SESION = Number(process.env.HORAS_SESION) || 12;
const MAX_FALLOS = 5;
const VENTANA_MS = 15 * 60 * 1000;
const fallos = new Map(); // correo -> { n, desde }  (en memoria: se reinicia con el servidor)

function revisarBloqueo(correo, ahora) {
  const f = fallos.get(correo);
  if (!f) return;
  if (ahora - f.desde > VENTANA_MS) return fallos.delete(correo);
  if (f.n >= MAX_FALLOS) throw tooManyRequests('Demasiados intentos fallidos: espera 15 minutos antes de intentar de nuevo');
}
function anotarFallo(correo, ahora) {
  const f = fallos.get(correo);
  if (!f || ahora - f.desde > VENTANA_MS) fallos.set(correo, { n: 1, desde: ahora });
  else f.n++;
}

export function iniciarSesion({ correo, clave }, { usuarioService }, ahora = Date.now()) {
  const llave = String(correo).trim().toLowerCase();
  revisarBloqueo(llave, ahora);
  const cuenta = usuarioService.buscarPorCorreo(llave);
  // Mismo mensaje y mismo trabajo (scrypt) exista o no el correo: no se revela qué correos están registrados.
  const ok = verificarClave(clave, cuenta?.claveHash ?? 'scrypt$00$00');
  if (!cuenta || !ok) {
    anotarFallo(llave, ahora);
    throw unauthorized('Correo o clave incorrectos');
  }
  fallos.delete(llave);

  const token = nuevoToken();
  const expira = new Date(ahora + HORAS_SESION * 3600 * 1000);
  sesiones.create({ id: hashToken(token), usuarioId: cuenta.id, creadaEn: new Date(ahora).toISOString(), expiraEn: expira.toISOString() });
  return { token, expiraEn: expira.toISOString(), usuario: usuarioService.find(cuenta.id) };
}

/** token → usuario, o null si no existe, expiró o el usuario ya no existe. */
export function resolverToken(token, { usuarioService }, ahora = Date.now()) {
  const id = hashToken(token);
  const s = sesiones.find(id);
  if (!s) return null;
  if (Date.parse(s.expiraEn) <= ahora) {
    sesiones.remove(id);
    return null;
  }
  return usuarioService.find(s.usuarioId);
}

export const cerrarSesion = (token) => sesiones.remove(hashToken(token));

/** Al cambiar la clave se cierran todas las demás sesiones de esa persona. */
export function cerrarOtrasSesiones(usuarioId, tokenActual) {
  const actual = hashToken(tokenActual);
  for (const s of sesiones.all()) if (s.usuarioId === usuarioId && s.id !== actual) sesiones.remove(s.id);
}
