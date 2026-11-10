# syscafe-requerimientos-api

API con **Node + Express** para la **Gestión de Requerimientos de Cliente** de SysCafé S.A.S.
Es la "primera versión de la solución": aplica el patrón modular de plantilla (módulos que se
ensamblan solos) al dominio real, con el campo `texto_original` **write-once** y dos algoritmos
de priorización propios.

Módulos incluidos:

| Módulo | Ruta base | Depende de |
|---|---|---|
| `usuario` | `/api/usuarios` | nada |
| `caso` | `/api/casos` | `usuario` (obligatorio) |
| `movimiento` | `/api/movimientos` | `caso` y `usuario` (obligatorios) |
| `resumen` | `/api/resumenes` | `caso` (obligatorio), `movimiento` (opcional) |

Los datos se guardan en **SQLite** (archivo `data/syscafe.db`, se crea solo al arrancar) y sobreviven
al reinicio. Requiere **Node 22.13 o superior** (SQLite viene incluido en Node, no se instala nada).
Para volver al almacén en memoria: `DB=memory` (en PowerShell: `$env:DB="memory"; npm run dev`).
Para empezar de cero, apaga el servidor y borra la carpeta `data/`.

## Cómo viaja un caso: por centros, no por personas

El caso entra por el **call center** y avanza centro a centro, en el orden que describió SysCafé
en la entrevista. El último centro es **soporte**, que cierra con el cliente:

```
callcenter → testeo → comité → desarrollo → soporte (cierra)
```

- **El destino lo decide el flujo, no la persona.** `POST /api/movimientos` no pide a dónde ir:
  avanza al siguiente centro. Si se envía `areaDestino`, solo se acepta cuando coincide con ese
  siguiente centro; cualquier otro responde `409`.
- **Cada centro mueve lo que tiene.** Quien avanza es la persona con la sesión iniciada (ya no se
  envía `actorId`) y debe ser del centro donde está el caso en ese momento (si no, `409`). Queda
  registrado en el historial.
- **Vía rápida de verdad:** una solicitud de vía rápida se salta el comité
  (`callcenter → testeo → desarrollo → soporte`) y por eso nunca aparece en la cola del comité.
- **Cierre:** al llegar a soporte el caso queda `resuelto`; el siguiente paso en soporte lo
  pasa a `cerrado` y ya no admite movimientos.
- **Sin dañar la información:** `textoOriginal` no se modifica en ningún paso; cada avance solo
  agrega un movimiento al historial.

---

## 1. Puesta en marcha

Requisitos: **Node.js 22.13 o superior** (usa el SQLite que ya trae Node).

```bash
npm install
npm run dev        # desarrollo: se reinicia solo al guardar cambios
# o bien
npm start          # ejecución normal
npm test           # pruebas automáticas
```

Con el servidor encendido, abre http://localhost:3000/ para usar el tablero (registrar llamadas con el menú del call center, avanzar los casos centro a centro, ver el historial y el resumen). Documentación de la API: http://localhost:3000/docs.
El 404 que aparece en la consola del navegador al abrir un caso es normal: significa que ese caso aún no tiene resumen.


Al arrancar verás el estado de cada módulo:

```
Módulos:
  ✔ caso       /casos  (4 rutas)
  ✔ movimiento /movimientos  (3 rutas)
  ✔ resumen    /resumenes  (2 rutas)
  ✔ usuario    /usuarios  (5 rutas)

4/4 módulos cargados
```

Abre **http://localhost:3000/docs** para ver la documentación de todos los módulos.

---

## 2. El caso de uso completo, probado con curl

Toda la API exige sesión (ver sección 3d). Primero se inicia sesión y se guarda el token; cada centro usa
su propio usuario:

```bash
login() { curl -s -X POST localhost:3000/api/auth/login -H "Content-Type: application/json" \
  -d "{\"correo\":\"$1\",\"clave\":\"syscafe123\"}" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token'; }
CC=$(login sofia@syscafe.local); TE=$(login laura@syscafe.local)   # call center y testeo del Equipo Norte
auth() { echo "Authorization: Bearer $1"; }
# Abajo, cada curl lleva -H "$(auth $CC)": el token de quien hace la acción (los avances de testeo usan $TE).
```

```bash
# 0) Menú del call center: los motivos de llamada que el agente elige con un clic
curl -H "$(auth $CC)" localhost:3000/api/casos/menu

# 1) Registrar una llamada eligiendo el motivo — dispara el algoritmo 1 (vía rápida)
#    El tipo sale del menú; "detalle" es opcional.
curl -X POST -H "$(auth $CC)" localhost:3000/api/casos -H "Content-Type: application/json" -d '{
  "tableroId": "tablero-1", "clienteId": "usuario-1",
  "canal": "telefonico",
  "motivo": "contrasena"
}'
# → "viaRapida": true, "areaActual": "callcenter", "siguienteArea": "testeo"

# 1b) Con detalle (lo que dijo el cliente con sus palabras)
curl -X POST -H "$(auth $CC)" localhost:3000/api/casos -H "Content-Type: application/json" -d '{
  "tableroId": "tablero-1", "clienteId": "usuario-1", "canal": "telefonico",
  "motivo": "impresion", "detalle": "Sale en blanco desde ayer"
}'

# 1c) Texto libre, sin menú (sigue funcionando; también sirve para el MCP)
curl -X POST -H "$(auth $CC)" localhost:3000/api/casos -H "Content-Type: application/json" -d '{
  "tableroId": "tablero-1", "clienteId": "usuario-1", "canal": "email", "tipo": "solicitud",
  "textoOriginal": "Necesito que agreguen un campo nuevo en reservas"
}'

# 2) Avanzar al siguiente centro — no se elige destino, lo decide el flujo.
#    Lo registra quien tiene la sesión, y debe ser del centro donde está el caso (aquí, el call center: $CC).
curl -X POST -H "$(auth $CC)" localhost:3000/api/movimientos -H "Content-Type: application/json" -d '{
  "casoId": "caso-1",
  "nota": "Registrado desde el menú"
}'
# Siguientes pasos, cada uno con el token de su centro: testeo → [comité, salvo vía rápida] → desarrollo
# → soporte → un último paso en soporte cierra el caso.

# 3) Ver el historial completo de un caso
curl -H "$(auth $CC)" localhost:3000/api/movimientos/caso/caso-1

# 4) Generar el resumen y las palabras clave (heurística local, ver sección 4)
curl -X DELETE -H "$(auth $CC)" localhost:3000/api/casos/caso-1   # borra también su historial y resumen (ON DELETE CASCADE)
curl -X POST -H "$(auth $CC)" localhost:3000/api/resumenes -H "Content-Type: application/json" -d '{"casoId":"caso-1"}'

# 5) Ver la cola del comité ordenada por el algoritmo 2 (aging)
curl -H "$(auth $CC)" localhost:3000/api/casos/comite/cola
```

Cuentas de demostración (clave `syscafe123`, o la que pongas en `CLAVE_INICIAL`):

| Equipo | Call center | Testeo | Comité | Desarrollo | Soporte | Cliente |
|---|---|---|---|---|---|---|
| Norte | sofia@ | laura@ | comite@ | andres@ | diego@ | camila@ (`usuario-1`) |
| Sur | mateo@ | paula@ | comite.sur@ | julian@ | natalia@ | valentina@ (`usuario-8`) |

Todas terminan en `@syscafe.local`. Además existe `admin@syscafe.local` (ve y gestiona todos los equipos).

### El menú del call center

`GET /api/casos/menu` devuelve los motivos; el agente elige uno en vez de redactar. Cada motivo
fija el **tipo** (solicitud, problema o incidente) y aporta palabras clave ya normalizadas, que el
algoritmo 1 usa como señal limpia: el `detalle` que se agregue **no baja** la similitud. La opción
`otro` pide `tipo` y un `detalle` de al menos 10 caracteres. Los motivos actuales salen de la
entrevista y de los casos de ejemplo; para ajustarlos solo se edita `MENU_CALLCENTER` en
`src/modules/caso/casoService.js`.

---

## 3. Los dos algoritmos (en `src/modules/caso/casoService.js`)

### Algoritmo 1 · Clasificador de vía rápida

Al crear un caso de tipo `solicitud`, se toman sus palabras clave (las del motivo del menú, o las
extraídas del texto si se escribió libre) y se comparan (índice de
Jaccard) contra el histórico de casos que Soporte ya resolvió rápido. Si la similitud es ≥ 0.5
con alguno resuelto en menos de 3 días, `viaRapida = true` y el caso se salta el comité.

El histórico tiene dos partes (`historicoResueltoRapido()`):

- **Conocimiento inicial:** dos casos que SysCafé ya sabía resolver el primer día (contraseña y
  factura PDF), para que el sistema funcione desde el arranque, cuando aún no hay casos cerrados.
- **Casos reales:** cada **solicitud cerrada** cuyo tiempo entre entrar a soporte y cerrarse fue
  menor de 3 días. Así el sistema aprende solo: la primera solicitud de "mejora" pasa por el comité;
  si soporte la cierra rápido, la siguiente parecida ya se salta el comité.

El umbral 0.5 es un punto de partida: se calibra con casos reales.

```js
similitud(A, B) = |palabrasClave(A) ∩ palabrasClave(B)| / |palabrasClave(A) ∪ palabrasClave(B)|
```

### Algoritmo 2 · Cola de comité con aging

`GET /api/casos/comite/cola` no devuelve los casos en orden de llegada (FIFO): calcula un
puntaje que sube con el tipo del caso y con los días que lleva esperando, para que una
solicitud vieja no quede varada indefinidamente detrás de incidentes nuevos. Los días se cuentan
**desde que el caso entró al comité** (`fechaEntradaComite`), así que lo que tardó antes en testeo no
le da ventaja. En casos muy antiguos que no tengan esa fecha se usa la de creación.

```js
puntaje(caso) = pesoTipo[caso.tipo] + diasEnEspera(caso) × 0.5
// pesoTipo = { incidente: 5, problema: 3, solicitud: 1 }
```

Ambos están escritos como funciones puras y exportadas (`calcularViaRapida`,
`similitudJaccard`, `calcularPuntaje`) para poder probarlas o ajustarlas sin tocar las rutas.

## 3b. Migraciones del esquema

El esquema de la base ya no es un solo archivo: son migraciones numeradas en `src/core/migrations/`
(`001_inicial.sql`, `002_fechas_de_flujo.sql`...). Al arrancar, `db.js` aplica solo las que faltan,
cada una dentro de una transacción (si falla, se deshace), y las anota en la tabla `schema_migracion`.

- **Cambiar el esquema** = agregar un archivo nuevo, por ejemplo `003_agregar_algo.sql`. Nunca se edita
  una migración que ya corrió.
- Los nombres deben ser `NNN_nombre.sql` y consecutivos desde 001; si no, el servidor no arranca y dice por qué.
- Una base creada con la versión anterior (sin migraciones) se actualiza sola al arrancar: la 001 es
  idempotente y la 002 reconstruye las fechas de entrada al comité y a soporte desde el historial.

## 3d. Equipos, tableros, sesiones y permisos

Pedido del empresario: organizar a las personas en equipos, dar a cada equipo sus tableros Kanban y que cada
usuario vea y gestione solo lo de su equipo.

- **Equipos y tableros** (módulos `equipo` y `tablero`): cada persona (salvo el admin) pertenece a un equipo;
  cada tablero pertenece a un equipo; cada caso vive en un tablero (`tableroId`, obligatorio al registrarlo).
- **Inicio de sesión** (módulo `auth`): `POST /api/auth/login` con correo y clave devuelve un token que se envía
  como `Authorization: Bearer <token>`. Es la única ruta pública. Las claves se guardan con scrypt y sal propia;
  de los tokens solo se guarda su SHA-256. Las sesiones duran 12 h (`HORAS_SESION`), tras 5 intentos fallidos el
  correo se bloquea 15 min, y al cambiar la clave se cierran las otras sesiones.
- **La puerta está en el motor** (`src/core/autenticacion.js`), no en cada módulo: si el módulo `auth` no carga,
  la API responde 503 en vez de quedar abierta. Los módulos reciben `req.usuario`.
- **Política de permisos** (`src/core/permisos.js`), una sola para toda la API:
  - Algo de **otro equipo → `404`** (no se revela que existe). Una acción que **tu rol no puede hacer → `403`**.
  - `admin`: ve todo; crea/edita/elimina equipos, tableros y usuarios; elimina casos. No mueve casos.
  - `agenteCallcenter`: registra casos (solo en tableros de su equipo y con clientes de su equipo).
  - Cada centro avanza los casos que están en su centro; cliente y admin no avanzan casos.
  - Listas (casos, cola del comité, movimientos, usuarios, tableros, equipos) devuelven solo lo del equipo.
- **Migración 003**: crea las tablas, reconstruye `usuario` (rol `admin`, equipo, correo, clave) y, si la base ya
  tenía datos, los deja en «Equipo General / Tablero general». Las cuentas antiguas reciben el correo
  `usuario-N@syscafe.local` y la clave inicial; si no hay admin, se crea `admin@syscafe.local`.
- **Cambia la clave de demostración** antes de mostrarlo fuera del equipo: `CLAVE_INICIAL=otra-clave npm start`
  (solo afecta cuentas nuevas) o desde «Mi clave» / el panel de administración.

## 3c. Pruebas automáticas

```bash
npm test
```

Usan `node:test` (incluido en Node, no se instala nada) y una base SQLite en memoria, así que no tocan
`data/syscafe.db`. Cubren el flujo por centros, la vía rápida (incluido lo que aprende), el puntaje y
el aging desde el comité, el texto original write-once, las migraciones (base nueva, base antigua,
migración que falla, base con datos que pasa a la 003) y el recorrido completo por la API HTTP. Un archivo
aparte (`equipos.test.js`) prueba el login, el bloqueo por intentos, y que un equipo no pueda ver, mover ni colar
casos en el otro.

---

## 4. Sobre el módulo `resumen`

`resumenService.js` tiene una función `generarResumenIA()` que hoy es una heurística local
(toma la primera oración del texto original + cuántos movimientos lleva el caso). Es un stand-in
deliberado: en la siguiente entrega (fases 1-7 ya expuestas con MCP), ese es el único punto que
cambiaría para llamar de verdad al modelo local (Qwen/Ollama) — el contrato del módulo
(`basePath`, rutas, `services` expuestos) no se movería.

---

## 5. Estructura

```
src/
  server.js              arranca el servidor
  app.js                 crea Express y monta los módulos
  core/                  el "motor": NO se toca al agregar módulos
    moduleLoader.js         descubre, valida y monta los módulos
    moduleContract.js       reglas que debe cumplir un módulo
    docsRouter.js           páginas /docs
    validation.js           validación de cuerpos JSON
    httpError.js            errores HTTP (404, 409...)
    errorHandler.js         respuestas de error
    store.js                elige el almacén: DB=sqlite (por defecto) o DB=memory
    sqliteStore.js          almacén SQLite (las mismas 7 operaciones que memoryStore)
    memoryStore.js          almacén en memoria
    db.js                   conexión; aplica las migraciones pendientes al abrir
    migrations.js           ejecuta las migraciones numeradas
    autenticacion.js        puerta de entrada: exige sesión en toda la API (salvo el login)
    permisos.js             política de permisos por rol y por equipo
    claves.js               hash scrypt de claves y tokens de sesión
    migrations/             001_inicial.sql (llaves foráneas, CHECK, trigger write-once), 002_..., 003_equipos_tableros_y_sesiones.sql
  modules/
    equipo/  tablero/  auth/  usuario/  caso/  movimiento/  resumen/   un módulo = una carpeta (el flujo y el menú viven en caso/)
    _template/                    plantilla para módulos nuevos (se ignora al cargar)
scripts/modules.js       comandos: check, list, create
test/                    pruebas automáticas (npm test)
```

Dentro de cada módulo:

```
caso/
  index.js            el "contrato": nombre, ruta base, dependencias, setup()
  casoRoutes.js       tabla de rutas (sirve para montar Y para documentar)
  casoController.js   traduce HTTP ↔ servicio
  casoService.js      la lógica, los datos y los dos algoritmos
```

Nombres siempre en **camelCase** (`caso`, `movimiento`).

---

## 6. Agregar un módulo nuevo

```bash
npm run modules:create -- hotel
```

Copia `src/modules/_template/` a `src/modules/hotel/` con los nombres ya cambiados. Queda
funcionando de inmediato (CRUD en memoria en `/api/hotels`). Después edita sus campos reales en
`hotelRoutes.js`, su lógica en `hotelService.js` y su `description` en `index.js`.

## 7. Quitar un módulo

Borra su carpeta de `src/modules/` y reinicia. Si otro módulo dependía de él de forma
**obligatoria**, se omite con un mensaje claro (ejemplo: quitar `usuario` omite `caso` y
`movimiento`). Si era **opcional** (como `movimiento` para `resumen`), el dependiente sigue
funcionando sin esa función.

---

## 8. Verificar que todo cargó bien

```bash
npm run modules:check     # no levanta el servidor; termina con código 1 si algo falla
npm run modules:list      # lista todos los endpoints montados
```

También:
- `GET /api/_modules` — estado de cada módulo (JSON)
- `GET /api/_routes` — lista plana de todos los endpoints (JSON)
- `GET /api/health` — health check

### Errores frecuentes

Un módulo con error **nunca tumba el servidor**: se informa y los demás siguen cargando.

| Mensaje | Causa |
|---|---|
| `Falta el archivo index.js dentro de la carpeta del módulo` | Copiaste la carpeta a medias |
| `"name" ("x") debe ser igual al nombre de la carpeta ("y")` | Renombraste la carpeta pero no `name` en `index.js` |
| `el nombre de la carpeta debe estar en camelCase` | Carpeta como `Caso` o `mi-modulo` |
| `"basePath" /x ya lo usa el módulo "y"` | Dos módulos con la misma ruta base |
| `Requiere el módulo "usuario", que no está en src/modules/` | Falta una dependencia obligatoria |
| `Dependencia circular entre módulos` | `a` requiere a `b` y `b` requiere a `a` |
| `pidió el servicio "x" sin declararlo...` | Llamaste `getService('x')` sin listarlo en `dependencies`/`optionalDependencies` |

## 9. Límites conscientes de este diseño

- **SQLite es de un solo archivo.** Sirve para el equipo y la exposición; en producción con varios
  servidores se pasaría a PostgreSQL, y ahí sí habría que volver los servicios asíncronos.
- **La vía rápida arranca con dos casos conocidos** (contraseña y factura PDF) y aprende de las
  solicitudes que soporte cierra en menos de 3 días. Todavía no olvida: un caso viejo seguirá
  contando, y no hay forma de marcar un caso cerrado como "no es un buen ejemplo".
- **Resumen heurístico, no un modelo real.** Ver sección 4.
- **Autenticación sencilla.** Sesiones con token en la base, sin recuperación de clave por correo ni doble
  factor, y el límite de intentos vive en memoria (se reinicia con el servidor). Sirve para el equipo y la
  exposición; en producción se usaría HTTPS y un proveedor de identidad.
- **Con `DB=memory` los permisos funcionan igual, pero** no hay llaves foráneas: eliminar un equipo con
  usuarios no se bloquea. Usa SQLite (el valor por defecto).
- **El flujo es lineal.** No hay devolución a un centro anterior (por ejemplo, de desarrollo de
  vuelta a testeo si falla la prueba); si el equipo la necesita, se agrega como una transición
  explícita en `siguienteArea()`.
