# Modelo de datos (Fase 1): Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Fecha**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

## Declaración de alcance

**Esta funcionalidad no tiene entidades persistentes.** No hay base de datos, tablas, ficheros de
datos de ejecución ni almacenamiento de ningún tipo (FR-007 y aclaración 1). No se define ningún
esquema de almacenamiento.

Las entidades clave de la especificación son **artefactos versionados en el repositorio** o
**valores en memoria** durante la ejecución. Se describen para fijar sus campos y reglas de
validación, no para persistirlas.

## Entidades

### Configuración de la aplicación (en memoria)

Resultado de validar `process.env` al arrancar (`src/platform/config`). La plantilla versionada
que describe cada parámetro es `.env.example` (FR-002). El mismo esquema se aplica en el
preflight, antes de arrancar `server.mjs`, en `server.mjs`, antes de escuchar, y en la ruta de
estado
([research.md](./research.md#r8-validación-de-configuración-zod-4-con-preflight-común-y-defensa-en-profundidad)).

| Campo | Variable de entorno | Obligatorio | Valores válidos | Uso |
|-------|---------------------|-------------|-----------------|-----|
| `logLevel` | `AULANORMA_LOG_LEVEL` | Sí | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent` | Nivel del logger |
| `environment` | `AULANORMA_ENVIRONMENT` | Sí | `development`, `test`, `ci` | Campo `environment` de los registros |

**Interfaz** (`src/platform/config/index.ts`):

Las tres operaciones devuelven la misma unión discriminada: `{ ok: true, config }`, con una
configuración inmutable, u `{ ok: false, problems }`, con `readonly { key, problem }[]`. Nunca
devuelven ni registran valores de configuración.

| Operación | Entrada | Lee | Usuarios | Reglas |
|-----------|---------|-----|----------|--------|
| `validateConfig(source)` | Una fuente de variables inyectada | Nada del entorno | `loadConfig`, `readRuntimeConfig` y las pruebas | Función pura |
| `loadConfig(mode)` | `development` o `production`, explícito | Ficheros `.env*` mediante `@next/env`, con `forceReload = true` y un logger controlado que descarta todo, y `process.env` | `scripts/preflight.mjs` y `server.mjs`, antes de escuchar | Exige que `NODE_ENV` coincida con el modo (si no, `mode_mismatch` sin cargar nada); convierte cualquier error de carga en `env_load_failed`; delega en `validateConfig` |
| `readRuntimeConfig()` | Ninguna | Solo el `process.env` ya preparado del proceso; no recarga `.env*`, no llama a `@next/env` ni usa `forceReload` | La API Route, dentro del `try` de cada manejo | Delega en `validateConfig`; ignora las claves ajenas al esquema, incluido `__NEXT_PROCESSED_ENV`; no comparte instancia en memoria con `server.mjs` |

Solo `src/platform/config` lee claves de `process.env`. `server.mjs` solo lee directamente
`process.env.NODE_ENV`, no reconstruye la lista de problemas y no lee otras claves. La API Route
no llama a `loadConfig` ni lee `process.env`.

**Origen de los valores**: `loadConfig`, en el preflight y en `server.mjs`, y Next.js cargan los
ficheros con la misma función de `@next/env`; `readRuntimeConfig` lee el resultado ya presente
en `process.env`. En `npm run dev`, desde el entorno del proceso y, para las variables que no estén
definidas allí, desde `.env.development.local` (y, si existieran, `.env.local`,
`.env.development` y `.env`). En `npm start`, desde el entorno del proceso; los ficheros de
producción (`.env.production.local`, `.env.local`, `.env.production` y `.env`) no se usan en
esta funcionalidad, y la prueba de humo se niega a ejecutarse si existen. Una variable
definida en el entorno del proceso prevalece siempre, aunque esté vacía.

**Reglas**:

- Una variable ausente, vacía o fuera de la lista, un `NODE_ENV` que no coincide con el modo o
  un error al cargar los ficheros hacen que el preflight termine con código 1, antes de que
  `server.mjs` arranque y abra el puerto (FR-005).
- El error se registra como una lista de `{ key, problem }`, donde `problem` es uno de los
  códigos propios `missing`, `invalid_value` o `unknown_key`, o uno de los dos que solo produce
  `loadConfig`: `mode_mismatch` (clave `NODE_ENV`) y `env_load_failed` (clave `environment`).
  El valor recibido **nunca** aparece en la salida, ni tampoco rutas, nombres de ficheros
  `.env`, mensajes originales del cargador ni trazas.
- `__NEXT_PROCESSED_ENV`, que `@next/env` puede fijar en `process.env`, es un marcador interno:
  no pertenece al esquema, no entra en la configuración validada, no se devuelve y no se
  registra.
- `TURBOPACK`, `IS_TURBOPACK_TEST` y `NEXT_RSPACK`, que el script `dev` fija vacías en el
  preflight y en el servidor, son selectores del compilador de Next.js (research.md, R8): no
  pertenecen al esquema, no entran en la configuración validada y `loadConfig` no las lee.
- Las variables desconocidas con el prefijo `AULANORMA_` se rechazan como `unknown_key` para
  detectar erratas.
- Ninguna variable es un secreto. `.env.example` solo contiene valores de ejemplo válidos y
  ficticios.
- La configuración validada es una instantánea inmutable. El único procedimiento soportado para
  cambiar valores es reiniciar `npm run dev` o `npm start`, que vuelven a pasar el preflight.
  No se promete la recarga en caliente de la configuración. Si la ruta de estado llega a
  evaluarse con una configuración inválida, responde el 500 cerrado (cuerpo vacío, `no-store`,
  `Content-Length: 0` y `Connection: close`) y nunca "ok".

### Estado de la aplicación (en memoria, expuesto)

Respuesta pública de la comprobación de estado. El contrato normativo está en
[`contracts/health.openapi.yaml`](./contracts/health.openapi.yaml).

| Campo | Tipo | Regla |
|-------|------|-------|
| `status` | cadena | Siempre `"ok"` cuando el servicio responde |
| `version` | cadena | SemVer básico `X.Y.Z` leído exclusivamente de `package.json`, sin versión preliminar ni metadatos `+…` (por ejemplo, `0.1.0`) |

No admite ningún otro campo (`additionalProperties: false`). No incluye configuración, entorno,
rutas, commit, hora de arranque ni dependencias (aclaración 2). La frontera HTTP rechaza de
forma cerrada, sin cuerpo, cualquier otra petición (400, 404, 405 o 505), y un fallo propio de
la ruta produce el 500 cerrado; el contrato completo está en
[`contracts/health.openapi.yaml`](./contracts/health.openapi.yaml).

### Estado de conexión (en memoria, transitorio)

Información que la frontera HTTP (`src/platform/http-boundary`) mantiene por socket mientras
dura la conexión (FR-006 C4 y FR-009). No se persiste, no se registra, no es estado de negocio
y desaparece al cerrarse el socket.

| Campo | Tipo | Regla |
|-------|------|-------|
| Rechazado | booleano | Se marca antes de escribir un rechazo; después no se delega ni se responde ninguna otra petición del socket |
| Respuestas pendientes | contador | Aumenta al aceptar una petición y disminuye una sola vez cuando su respuesta termina o se cierra |
| Error diferido | booleano | Un error de análisis (`clientError`) llegado con respuestas pendientes; al llegar a 0 se emite el 400 cerrado (*flush*), y si el socket se cierra antes se descarta (*dropped*); `ECONNRESET` lo descarta |

Reglas: `clientError` nunca genera una segunda respuesta; con un rechazo previo se suprime sin
escribir; `checkContinue` y `checkExpectation` pasan por la misma frontera sin 100 ni 417
automáticos; `CONNECT` y `Upgrade` se rechazan de forma cerrada. Los valores de la petición que
inspecciona la frontera (versión, destino crudo, método, `Host`, `Content-Length`,
`Transfer-Encoding`, `Expect` y `Accept-Encoding`) no forman parte de este estado ni se
conservan.

### Capa (estructura versionada)

Directorio de `src/modules/` con un punto de entrada público `index.ts` y un `README.md` que
describe su responsabilidad (FR-023).

| Capa | Directorio | Responsabilidad (principio II) |
|------|------------|--------------------------------|
| Fuente normativa | `src/modules/normative-source` | PDF original inmutable y texto extraído por página |
| Interpretación estructurada | `src/modules/structured-interpretation` | Representación validada del certificado |
| Contenido didáctico | `src/modules/didactic-content` | Materiales, actividades y evaluaciones generados |
| Publicación en Moodle | `src/modules/moodle-publication` | Correspondencia entre el contenido aprobado y Moodle |

En esta funcionalidad, cada `index.ts` está vacío (`export {};`). No hay lógica de producto ni
nada específico de ningún certificado (FR-024).

#### Matriz de dependencias entre capas

Se fuerza con `no-restricted-imports` en ESLint y se verifica con pruebas de arquitectura. Cada
celda indica si el módulo de la fila puede importar al de la columna, y siempre solo a través de
su API pública (`index.ts`).

| Importa → | `platform` | `normative-source` | `structured-interpretation` | `didactic-content` | `moodle-publication` |
|-----------|:----------:|:------------------:|:---------------------------:|:------------------:|:--------------------:|
| `platform` | — | No | No | No | No |
| `normative-source` | Sí | — | No | No | No |
| `structured-interpretation` | Sí | Sí | — | No | No |
| `didactic-content` | Sí | No | Sí | — | No |
| `moodle-publication` | Sí | No | No | Sí | — |
| Entrega: `server.mjs` y `src/pages/api/health.ts` | **Sí, solo API pública** | **No** | **No** | **No** | **No** |

Reglas adicionales:

- **Entrega limitada a `platform`**: en esta funcionalidad, la API Route solo puede importar
  `@/platform/<área>`, es decir, el `index.ts` de `config`, `logging`, `health` o `version`.
  De `src/platform`, `server.mjs` solo importa módulos portables y sin efectos secundarios de
  infraestructura (`config`, `logging` y `http-boundary`, por su `index.ts`). Como adaptador,
  importa además legítimamente `node:http` y `next`, y usa `@next/env` a través de la capa de
  configuración que lo encapsula; esas importaciones no son de capas de dominio y no contradicen la
  matriz. La entrega no importa ninguna capa de dominio, porque `/api/health` no las necesita. La
  primera porción vertical de producto definirá explícitamente sus puntos de entrada y ampliará
  esta fila solo para las capas que justifique, con su propia prueba de arquitectura.
- Las cuatro capas de dominio están vacías y solo pueden depender de `platform` y de la capa
  inmediatamente anterior, en la dirección que fija la constitución (principio II).
- Queda prohibido importar rutas internas de otra capa (`@/modules/<capa>/<interno>`) o de
  `platform` (`@/platform/<área>/<interno>`); solo se permite la API pública.
- `src/platform` agrupa las utilidades transversales (configuración, registros, estado y
  versión) y no depende de ninguna capa.
- `src/platform/config/index.ts`, `src/platform/logging/index.ts` y
  `src/platform/http-boundary/index.ts` son módulos portables: solo importan paquetes npm (la
  frontera, ninguno en ejecución, y `node:http` solo con `import type`), porque el preflight y
  `server.mjs` los cargan directamente con Node.js.
- En `src/`, solo `src/platform/config` puede leer `process.env`; `server.mjs` solo lee
  `process.env.NODE_ENV`.

### Control de calidad (catálogo versionado)

Catálogo en `docs/engineering/quality-controls.md`. Cada control tiene un nombre estable, que es
el nombre del job en la integración continua (FR-022).

Hay **ocho categorías** y **nueve controles requeridos**:

| Control (job) | Categoría | Comando local | Prueba negativa |
|---------------|-----------|---------------|-----------------|
| `format` | 1. Formato | `check:format` | Sí |
| `lint` | 2. Análisis estático y límites | `check:lint` | Sí |
| `types` | 3. Tipos | `check:types` | Sí |
| `test` | 4. Pruebas | `check:test` | Sí |
| `build` | 5. Construcción | `check:build` | Sí |
| `secrets` | 6. Secretos | `check:secrets` | Sí (subcasos de historial, fichero sin seguimiento y exclusión de ignorados) |
| `dependencies` | 7. Dependencias | `check:deps` | Sí |
| `workflows` | 8. Seguridad de workflows | `check:workflows` | Sí |
| `macos-quality` | Ninguna: verificación de plataforma | `check:quality` (categorías 1 a 5) | No propia; falla con las de las categorías 1 a 5 |

| Campo | Descripción |
|-------|-------------|
| `name` | Nombre estable del job: `format`, `lint`, `types`, `test`, `build`, `macos-quality`, `secrets`, `dependencies` o `workflows` |
| `category` | Formato, análisis estático y límites, tipos, pruebas, construcción, secretos, dependencias o seguridad de workflows; vacía en `macos-quality`, que es una verificación de plataforma |
| `localCommand` | Script npm equivalente (ver [plan.md](./plan.md#comandos-npm)) |
| `required` | Siempre `true` en esta funcionalidad |
| `negativeCase` | Alteración sintética que lo hace fallar (ver [plan.md](./plan.md#diseño-de-las-pruebas-negativas)); solo en los ocho controles de categoría |

### Ejecución de controles (externa)

Es cada ejecución de un workflow en GitHub Actions: la guarda GitHub y no el repositorio. La
evidencia de aceptación (enlaces a las ejecuciones) se registra en
`specs/001-engineering-baseline/acceptance.md` durante la implementación, según la
[matriz de aceptación](./plan.md#matriz-de-aceptación).

### Excepción de seguridad (ficheros versionados)

| Tipo | Fichero | Campos obligatorios |
|------|---------|---------------------|
| Secretos | `.gitleaksignore` (huella) y `docs/engineering/security-exceptions.md` (registro estructurado verificable automáticamente) | Identificador del hallazgo (huella), responsable, justificación, fecha de aprobación y `reviewBy` en UTC. Huellas: historial `commit:fichero:regla:línea`; índice y árbol `fichero:regla:línea`. Correspondencia uno a uno con `.gitleaksignore` |
| Dependencias | `security/audit-exceptions.json` | `advisory` (GHSA), `package`, `justification`, `owner`, fecha de aprobación y `reviewBy` (ISO 8601, UTC) |

**Reglas**: `reviewBy` es como máximo 90 días posterior a la fecha de aprobación. Las fechas se
interpretan en UTC: una excepción caduca cuando la fecha UTC de la ejecución es posterior a su
`reviewBy`. Una excepción caducada, incompleta o con una fecha que incumpla estas reglas hace
fallar el control. Cada huella de `.gitleaksignore` DEBE tener exactamente una entrada en el
registro, y viceversa; una huella huérfana hace fallar el control. Ninguna excepción puede
desactivar un control completo (FR-020). Ambos ficheros empiezan vacíos. Una excepción de
secretos solo se admite para un falso positivo o un contenido demostrado como no secreto.

## Transiciones de estado

No hay entidades persistentes con ciclo de vida. El arranque del servicio es igual en
`npm run dev` y en `npm start`, los únicos puntos de entrada; `next dev` y `next start`
directos no están admitidos:

```text
preflight → configuración válida → server.mjs → escucha en 127.0.0.1:3000 → atendiendo (status "ok")
preflight → configuración inválida → termina con código 1 (server.mjs no arranca; el puerto nunca se abre)
server.mjs sin configuración válida → termina con código 1 antes de escuchar
atendiendo → fallo propio de la ruta de estado → 500 cerrado (nunca "ok")
atendiendo → cambio de .env* → sin efecto garantizado; aplicar el cambio exige reiniciar
```

El estado de conexión tiene su propio ciclo por socket:

```text
abierta → petición admitida → respuestas pendientes > 0 → respuesta terminada → pendientes − 1
abierta → rechazo → rechazada (no se delega ni se responde nada más) → cerrada
pendientes > 0 → error de análisis → diferido → pendientes = 0 → 400 cerrado (flush) → cerrada
diferido → socket cerrado antes → descartado (dropped)
```
