import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

/**
 * Claves y tokens. Las claves nunca se guardan: se guarda un hash scrypt con sal propia.
 * Los tokens de sesión tampoco: se guarda su SHA-256 (si alguien lee la base, no puede usarlos).
 */
export const CLAVE_MINIMA = 8;
const LARGO = 64;

export function hashClave(clave) {
  const sal = randomBytes(16);
  const hash = scryptSync(clave, sal, LARGO);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function verificarClave(clave, guardada) {
  if (!guardada || typeof clave !== 'string') return false;
  const [esquema, salHex, hashHex] = guardada.split('$');
  if (esquema !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const calculado = scryptSync(clave, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(esperado, calculado);
}

export function nuevoToken() {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/** Clave que se asigna a las cuentas de demostración y a las que se actualizan sin clave. Cámbiala con CLAVE_INICIAL. */
export const CLAVE_INICIAL = process.env.CLAVE_INICIAL || 'syscafe123';
export const USA_CLAVE_DE_DEMOSTRACION = !process.env.CLAVE_INICIAL;
