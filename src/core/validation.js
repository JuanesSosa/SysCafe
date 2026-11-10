/**
 * Validación declarativa de los `body` de las rutas.
 * Cada módulo describe sus campos una sola vez (en su Routes.js) y este archivo
 * los valida Y los documenta (docsRouter.js reutiliza el mismo schema).
 *
 * Tipos soportados: string, number, boolean
 * Reglas: required, enum, min, max, pattern
 */

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function validateField(name, rule, value) {
  const errors = [];
  const present = value !== undefined && value !== null && value !== '';

  if (!present) {
    if (rule.required) errors.push(`"${name}" es obligatorio`);
    return errors; // si no vino y no es obligatorio, no hay más que validar
  }

  if (rule.type && typeOf(value) !== rule.type) {
    errors.push(`"${name}" debe ser de tipo ${rule.type}`);
    return errors; // tipo incorrecto invalida las reglas siguientes
  }

  if (rule.enum && !rule.enum.includes(value)) {
    errors.push(`"${name}" debe ser uno de: ${rule.enum.join(', ')}`);
  }

  if (rule.type === 'string') {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`"${name}" debe tener al menos ${rule.min} caracteres`);
    }
    if (rule.max !== undefined && value.length > rule.max) {
      errors.push(`"${name}" debe tener máximo ${rule.max} caracteres`);
    }
    if (rule.pattern && !new RegExp(rule.pattern).test(value)) {
      errors.push(`"${name}" no cumple el formato esperado`);
    }
  }

  if (rule.type === 'number') {
    if (rule.min !== undefined && value < rule.min) {
      errors.push(`"${name}" debe ser mayor o igual a ${rule.min}`);
    }
    if (rule.max !== undefined && value > rule.max) {
      errors.push(`"${name}" debe ser menor o igual a ${rule.max}`);
    }
  }

  return errors;
}

/**
 * Valida `data` contra un `schema` ({ campo: regla }).
 * Devuelve { valid, errors }. No lanza: quien llama decide qué hacer con el resultado.
 */
export function validateBody(schema = {}, data = {}) {
  const errors = [];
  for (const [name, rule] of Object.entries(schema)) {
    errors.push(...validateField(name, rule, data[name]));
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Vuelve opcionales todos los campos de un schema (para PUT/PATCH parciales).
 * No muta el original.
 */
export function partial(schema = {}) {
  const copy = {};
  for (const [name, rule] of Object.entries(schema)) {
    copy[name] = { ...rule, required: false };
  }
  return copy;
}
