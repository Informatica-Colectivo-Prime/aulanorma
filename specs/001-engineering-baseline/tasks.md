---

description: "Lista de tareas de implementación de 001-engineering-baseline"
---

# Tasks: Base de ingeniería de AulaNorma

**Input**: Design documents from `/specs/001-engineering-baseline/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/health.openapi.yaml,
quickstart.md, ADR 0001 y ADR 0002. La constitución 1.1.0 prevalece sobre este documento.

**Tests**: obligatorios. La constitución (principio VIII) y la especificación (FR-006, FR-011 a
FR-013) exigen pruebas. En cada historia, las pruebas se escriben primero y deben fallar antes de
la implementación que validan.

**Organization**: tareas agrupadas por fase y por historia de usuario. Hay tres tipos de tarea,
separados por fases:

- **Implementación** (fases 1 a 7): crean o modifican ficheros del repositorio.
- **Aceptación manual** (fase 8): procedimientos de la
  [matriz de aceptación](./plan.md#matriz-de-aceptación) que se ejecutan una vez sobre el SHA
  base de aceptación y guardan su evidencia en `specs/001-engineering-baseline/acceptance.md`.
  **No son controles**. SC-001 y SC-008 DEBEN estar Superado antes de integrar.
- **Posteriores a la primera ejecución satisfactoria en `main`** (fase 9): la integración no
  inicia la congelación; la congelación comienza al terminar el primer par de workflows
  satisfactorios sobre el mismo SHA de `main` y termina al activar los nueve controles. El
  primer pull request posterior acepta los ADR.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (fichero distinto y sin dependencias de tareas
  incompletas).
- **[Story]**: historia de usuario a la que pertenece la tarea (US1 a US4).
- Cada descripción indica la ruta exacta del fichero afectado. Las tareas que actúan sobre
  GitHub y no sobre un fichero lo indican expresamente y nombran el fichero donde queda su
  evidencia.

## Path Conventions

Un único proyecto Next.js en la raíz del repositorio (plan.md, "Project Structure"): `server.mjs`,
`src/`, `tests/`, `scripts/`, `security/`, `docs/engineering/` y `.github/`. Nombres de código en inglés;
documentación en español.

## Referencias fijas

- **Ocho categorías de control**: `format`, `lint`, `types`, `test`, `build`, `secrets`,
  `dependencies` y `workflows`.
- **Nueve controles requeridos** (nombres exactos de job): `format`, `lint`, `types`, `test`,
  `build`, `macos-quality`, `secrets`, `dependencies` y `workflows`. `macos-quality` verifica la
  plataforma y no es una categoría.
- **Dos modos de arranque**, únicos puntos de entrada: `npm run dev` y `npm start`, ambos con
  `NODE_ENV=<entorno> node scripts/preflight.mjs <modo> && NODE_ENV=<entorno> node server.mjs`. `next dev` y
  `next start` directos no están admitidos. Sin `instrumentation.ts`. Escucha fija en
  `127.0.0.1:3000`.
- **Entrega HTTP**: Next.js 16.3.6 con Pages Router, una única API Route
  (`src/pages/api/health.ts`) y la frontera HTTP de `server.mjs` y
  `src/platform/http-boundary/index.ts`, con precedencia versión → `Host` → destino → método →
  cuerpo. Sin App Router operativo, comodín, reescrituras, middleware ni `proxy.ts`.
- **Node.js**: 24.21.0 en `.node-version` (referencia, integración continua y aceptación); el
  rango de desarrollo `>=24.21.0 <25` se declara de forma idéntica en `devEngines` y `engines`,
  con `engine-strict=true` para los clientes que no aplican `devEngines`.
- **Perfiles verificados**: macOS arm64 del mantenedor y Linux x64 de CI y aceptación.
- **SHA base de aceptación** frente a **HEAD de evidencia**: este último solo puede añadir
  `acceptance.md`.
- Los ADR 0001 y 0002 permanecen Propuesto durante este pull request.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: inicializar el proyecto Node.js y la configuración compartida de herramientas.

- [X] T001 Crear `.node-version` con el contenido `24.21.0`. Antes de continuar, instalar Node.js 24.21.0 en el equipo de referencia (hoy tiene 24.13.0, fuera del rango) y comprobar que `node --version` muestra `v24.21.0` y anotar `npm --version` para T004
- [X] T002 [P] Modificar `.gitignore` para añadir `next-env.d.ts`, `.tools/` y `*.tsbuildinfo`, conservando las reglas existentes (`.env`, `.env.*`, `!.env.example`, `node_modules/`, `.next/`, `coverage/`). Cualquier cambio posterior en `.gitignore` se revisa como cambio con impacto de seguridad (FR-003)
- [X] T003 [P] Crear `.npmrc` con `ignore-scripts=true`, `save-exact=true`, `fund=false`, `audit=true` y `engine-strict=true`; esta última hace obligatorio `engines` (T004) en los clientes npm que no aplican `devEngines`, como npm 10 (research.md, R2 y R3)
- [X] T004 Crear `package.json` con `name: "aulanorma"`, `version: "0.1.0"` (SemVer básico `X.Y.Z`, sin versión preliminar ni metadatos), `private: true` y `"type": "module"`. Declarar `devEngines.runtime` `{ "name": "node", "version": ">=24.21.0 <25", "onFail": "error" }` y `devEngines.packageManager` para npm con el rango que va desde la versión de npm incluida con 24.21.0 (anotada en T001) hasta por debajo de la siguiente versión mayor, con `onFail: "error"`. Declarar además `engines` con exactamente los mismos rangos (`node` `>=24.21.0 <25` y `npm` `>=11.19.0 <12`): `devEngines` lo aplica npm 11 y `engines`, con `engine-strict=true` (T003), cubre clientes como npm 10. Definir todos los scripts de plan.md ("Comandos npm"), con `NEXT_TELEMETRY_DISABLED=1` delante de cada invocación de `next` o de `server.mjs`: `dev` (`NODE_ENV=development node scripts/preflight.mjs dev && … NODE_ENV=development node server.mjs`), `build`, `start` (`NODE_ENV=production node scripts/preflight.mjs start && … NODE_ENV=production node server.mjs`), `format`, `check:format`, `check:lint` (`eslint . --max-warnings=0`), `check:types` (`next typegen && tsc --noEmit`), `check:test` (`vitest run`), `check:build` (`next build && node scripts/smoke-test.mjs`), `check:secrets`, `check:deps`, `check:workflows` (el binario `.tools/bin/zizmor` con `--offline --min-severity low .github/workflows`), `check:quality` (format → lint → types → test → build, en secuencia; se detiene en el primer fallo), `check:security` (secrets → deps → workflows), `check` (`check:quality` y después `check:security`), `tools:install` y `verify:negative`. Cada lado de `&&` fija `NODE_ENV` por separado y con el mismo valor, porque una asignación delante de un comando no alcanza al siguiente. Ningún script invoca `next dev` ni `next start` directamente: `dev` y `start` son los únicos puntos de entrada (depende de T001 y T003)
- [X] T005 Instalar las dependencias con versión exacta en `package.json` y generar `package-lock.json`. Ejecución: `next` 16.3.6, `react` 19.3.0, `react-dom` 19.3.0, `zod` 4.6.5, `pino` 10.3.1 y `@next/env` 16.3.6. Desarrollo: `typescript` 6.0.3, `eslint` 10.11.0, `@eslint/js` 10.0.1, `typescript-eslint` 8.70.1, `prettier` 3.9.9, `vitest` 5.0.2, `vite` 8.3.1, `@types/node` (última 24.x, fijada exacta) y `@types/react` 19.3.0. Comprobar después que `npm ci` termina sin errores con Node.js 24.21.0, que falla antes de instalar y sin modificar `package-lock.json` con una versión fuera del rango (24.13.0 con npm 11.6.2, `EBADDEVENGINES`; 20.20.0 con npm 10.8.2, `EBADENGINE`), y que `npm audit --audit-level=high` no informa de vulnerabilidades (depende de T004)
- [X] T006 [P] Crear `tsconfig.json` con `strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `useUnknownInCatchVariables`, `verbatimModuleSyntax`, `erasableSyntaxOnly: true`, `noEmit: true`, `allowJs: true`, `allowImportingTsExtensions: true`, resolución `bundler`, alias `@/*` → `src/*`, la inclusión de `next-env.d.ts` y de los tipos generados en `.next/types`, y la inclusión de `server.mjs`, que se comprueba mediante `// @ts-check` en el propio fichero, sin `checkJs` global. Los módulos TypeScript que Node.js ejecuta directamente se limitan a sintaxis borrable. Esta configuración no está demostrada todavía: `tsc --noEmit` debe verificarla aquí y, junto con `node --check server.mjs`, en T041 (research.md, R4; depende de T005)
- [X] T007 [P] Crear `prettier.config.mjs` con configuración mínima explícita (research.md, R5; depende de T005)
- [X] T008 [P] Crear `.prettierignore` excluyendo exactamente `.next/`, `coverage/`, `.tools/`, `package-lock.json`, `next-env.d.ts`, `.specify/`, `.cursor/`, `.claude/`, `.agents/`, `.opencode/`, `specs/` y `docs/adr/`. Esa exclusión:
  - hace que `prettier --check .` cubra el código, la configuración, los scripts, los workflows y la documentación operativa mantenida por la aplicación;
  - no autoriza a ignorar errores de Markdown ni amplía `.gitignore`;
  - no exime a `specs/` ni a `docs/adr/` de revisión: se revisan mediante su flujo documental y `git diff --check`;
  - es un cambio revisable; un cambio en `.gitignore` tiene además impacto de seguridad (FR-003).

  Depende de T005
- [X] T009 [P] Crear `vitest.config.ts` con `environment: "node"`, `pool: "forks"`, `restoreMocks: true`, `sequence.shuffle: false`, `setupFiles: ["tests/setup/no-network.ts"]` y el alias `@` → `src` (research.md, R7; depende de T005)

**Checkpoint**: `npm ci` debe ejecutarse correctamente con Node.js 24.21.0 y npm 11.19.0, y debe rechazar antes de instalar y sin modificar el lockfile cualquier versión fuera de los rangos admitidos: mediante `devEngines` cuando el cliente lo aplica o mediante `engines` con `engine-strict` en clientes que no lo aplican.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: bloqueo de red en las pruebas, esqueleto de las cuatro capas y reglas de análisis
estático y límites que todo el código posterior debe cumplir.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta completar esta fase.

- [X] T010 [P] Crear `tests/setup/no-network.ts`: sustituir `globalThis.fetch` por una función que lanza un error y parchear `net.Socket.prototype.connect` para rechazar cualquier destino que no sea de bucle local (`127.0.0.1` o `::1`). Incluir una autoprueba que demuestre que un intento de conexión externa falla (FR-007, FR-013; research.md, R7)
- [X] T011 [P] Crear `src/modules/normative-source/index.ts` con `export {};` y sin lógica (FR-023, FR-024)
- [X] T012 [P] Crear `src/modules/structured-interpretation/index.ts` con `export {};` y sin lógica (FR-023, FR-024)
- [X] T013 [P] Crear `src/modules/didactic-content/index.ts` con `export {};` y sin lógica (FR-023, FR-024)
- [X] T014 [P] Crear `src/modules/moodle-publication/index.ts` con `export {};` y sin lógica (FR-023, FR-024)
- [X] T015 [P] Escribir primero `tests/architecture/import-boundaries.test.ts`, que debe fallar hasta T019. Con la API de ESLint (`lintText` y una ruta sintética en cada ubicación) verificar la matriz de data-model.md: cada dependencia prohibida da error y cada permitida no. Casos obligatorios: `src/pages/api/health.ts` o `server.mjs` que importan `@/modules/<capa>` dan error; `src/pages/api/health.ts` que importa `@/platform/<área>` no da error; importar `@/platform/<área>/<interno>` o `@/modules/<capa>/<interno>` desde fuera da error; `normative-source` → `moodle-publication` da error; `structured-interpretation` → `normative-source` no da error; `process.env` fuera de `src/platform/config` da error, y en `server.mjs` solo `process.env.NODE_ENV` no da error; una importación relativa o con `@/` en `src/platform/config/index.ts`, `src/platform/logging/index.ts` o `src/platform/http-boundary/index.ts` da error; `fetch` y los módulos `node:http`, `node:https`, `node:http2`, `node:net`, `node:tls`, `node:dgram` y `node:dns`, también sin el prefijo `node:`, en `src/` dan error, salvo `import type` de `node:http` en `src/platform/http-boundary/index.ts`. La instancia de ESLint carga la configuración real del repositorio con `overrideConfig: tseslint.configs.disableTypeChecked`: las rutas sintéticas pueden no existir en disco y no pueden analizarse con información de tipos, así que solo se desactivan las reglas que la requieren y se mantienen todas las restricciones de capas, importaciones, red y `process.env`. Ningún caso puede producir un mensaje fatal. La configuración tipada completa se comprueba con `npm run check:lint` sobre los ficheros reales
- [X] T016 [P] Escribir `tests/architecture/no-domain-specifics.test.ts`: buscar los códigos de certificado en los ficheros versionados y en los ficheros nuevos no versionados que Git no ignora, dentro de `src/`, `tests/` y `scripts/`, más los ficheros operativos de la raíz, excluyendo Markdown y cualquier fichero ignorado. La lista se obtiene con `git ls-files -z --cached --others --exclude-standard`, sin duplicados, en orden determinista y conservando correctamente los nombres con espacios. El patrón se construye a partir de fragmentos para que el propio fichero no contenga los códigos (FR-024)
- [X] T017 [P] Escribir `tests/architecture/dependency-versions.test.ts`: `package.json` declara `next` y `@next/env` con la misma versión exacta, sin rango (research.md, K12)
- [X] T018 [P] Escribir `tests/architecture/public-routes.test.ts`: falla si aparece una segunda ruta pública o una ampliación de la excepción por analogía: cualquier fichero de `src/pages` distinto de `src/pages/api/health.ts`, cualquier fichero en `src/app`, un destino distinto de `/api/health` en la frontera de `src/platform/http-boundary/index.ts` o un método delegado distinto de `GET`, `HEAD` y `OPTIONS`. Como las demás pruebas escritas antes de la implementación, debe fallar hasta que se completen T037 y T038 (FR-006 C7)
- [X] T019 Crear `eslint.config.mjs` (configuración plana) con `@eslint/js` y `typescript-eslint` `strictTypeChecked` y `stylisticTypeChecked` para `**/*.ts`, y sin información de tipos para `*.mjs`, incluido `server.mjs`. Reglas según research.md (R6) y data-model.md: `no-restricted-imports` por directorio con la matriz de capas y la regla de entrega limitada a `@/platform/<área>`; prohibición de rutas internas; módulos portables (`config`, `logging` y `http-boundary`) sin importaciones relativas ni `@/`; `no-restricted-globals` (`fetch`, `WebSocket`, `EventSource`) y módulos de red prohibidos en `src/`, con la variante de `typescript-eslint` y `allowTypeImports` para admitir solo `import type` de `node:http` en la frontera; `no-console` en `src/`; `no-restricted-properties` para `process.env` salvo en `src/platform/config`, y `no-restricted-syntax` para que `server.mjs` solo lea `process.env.NODE_ENV`. Ignorar `.next/`, `.tools/`, `coverage/`, `next-env.d.ts` y los directorios de herramientas de terceros. Sin `eslint-config-next` ni complementos adicionales. Las prohibiciones de red y persistencia en `src/` aplican FR-007 (depende de T006 y de T010 a T015; hace pasar T015)

**Checkpoint**: T010–T018 existen y se han ejecutado. La autoprueba de red (`tests/setup/no-network.test.ts`), `no-domain-specifics.test.ts` y `dependency-versions.test.ts` pasan, y `npm exec tsc -- --noEmit` y `npm run check:format` terminan con éxito. Los únicos rojos admitidos son los previstos por las pruebas escritas antes de la implementación:
- `import-boundaries.test.ts` falla exclusivamente porque `eslint.config.mjs` llega en T019, y `npm run check:lint` queda pendiente de T019;
- `public-routes.test.ts` falla exclusivamente porque la API Route y la frontera llegan en T037 y T038;
- `npm run check:types` solo puede fallar porque `next typegen` todavía no encuentra `src/pages`, que llega en T037.

No se admite ningún fallo inesperado. Estos rojos previstos no impiden comenzar T019.

---

## Phase 3: User Story 1 - Preparar y ejecutar el proyecto desde cero (Priority: P1) 🎯 MVP

**Goal**: desde un clon limpio, con la plantilla sin secretos, la aplicación mínima arranca en
los dos modos, responde en `/api/health` según el contrato, rechaza de forma cerrada cualquier
otra petición en la frontera HTTP y rechaza una configuración inválida sin abrir el puerto y sin
revelar valores.

**Independent Test**: `npm run check:test` y `npm run check:build` terminan con éxito. La prueba
de humo cubre `npm start` y `npm run dev` en copia temporal, con la matriz negativa por TCP
crudo, la equivalencia entre modos y la auditoría de registros. Además, los pasos 1 a 4 del
[quickstart](./quickstart.md) se reproducen siguiendo solo `README.md`.

### Tests for User Story 1 ⚠️

> **NOTE: escribir estas pruebas primero y comprobar que fallan antes de la implementación.**

- [X] T020 [P] [US1] Escribir `tests/unit/platform/config.test.ts`. Variables obligatorias: `AULANORMA_LOG_LEVEL`, con valores válidos `fatal`, `error`, `warn`, `info`, `debug`, `trace` y `silent`; y `AULANORMA_ENVIRONMENT`, con `development`, `test` y `ci`. Casos: configuración válida aceptada. Variable ausente o vacía rechazada con `{ key, problem: "missing" }`, valor fuera de la lista con `invalid_value` y clave desconocida con prefijo `AULANORMA_` con `unknown_key`. Un valor centinela sintético nunca aparece en el mensaje de error. Ningún mensaje muestra rutas absolutas, nombres de ficheros `.env` ni trazas. La prueba cubre el contrato de las tres operaciones de `src/platform/config` (T033), con el cargador de `@next/env` inyectado o sustituido para observar sus llamadas sin depender del entorno real:
  - **`validateConfig`**: entradas válidas e inválidas; la unión discriminada `{ ok: true, config }` / `{ ok: false, problems }`; la configuración devuelta es inmutable; `problems` nunca contiene valores;
  - **`loadConfig`**: ficheros `.env*` sintéticos en un directorio desechable; llamada al cargador de `@next/env`; misma unión discriminada; no filtra valores. Además:
    - **Modo**: cada caso fija explícitamente `NODE_ENV` y lo restaura, junto con el resto de `process.env`, al terminar. Con `NODE_ENV=development` y el modo `development` se aplica la precedencia de desarrollo, y con `NODE_ENV=production` y el modo `production`, la de producción; el cargador recibe `dev` verdadero solo en `development`. `NODE_ENV=test`, un `NODE_ENV` ausente o cualquier discrepancia devuelven exactamente `{ key: "NODE_ENV", problem: "mode_mismatch" }`, sin el valor recibido y sin llamar al cargador, así que un `.env.test` sintético nunca se carga.
    - **Caché**: el cargador recibe `forceReload = true` en cada llamada, y dos casos consecutivos con ficheros distintos no reutilizan el resultado anterior. Los casos con el cargador real que necesiten aislar `process.env`, la caché del módulo o `__NEXT_PROCESSED_ENV` se ejecutan en procesos separados.
    - **Logger y errores**: un cargador sustituido entrega al logger recibido una ruta absoluta sintética, un nombre de fichero `.env`, un objeto `Error` y una traza, y otro lanza una excepción con esos mismos datos; es el equivalente determinista de un `.env` ilegible o no analizable, sin depender de `chmod`. En ambos casos el resultado es exactamente `{ ok: false, problems: [{ key: "environment", problem: "env_load_failed" }] }`, y ninguno de esos datos aparece en el resultado, en la salida estándar, en la salida de error, en los registros capturados ni en el adaptador tras las llamadas.
    - **Marcador interno**: con `__NEXT_PROCESSED_ENV` presente, el marcador no aparece en `config` ni en `problems`, no se registra y no altera la selección explícita del modo.
  - **`readRuntimeConfig`**: usa el `process.env` ya preparado; no llama al cargador de `@next/env` ni vuelve a leer ficheros; ignora `__NEXT_PROCESSED_ENV` y cualquier otra clave ajena al esquema; misma unión discriminada; no filtra valores.

  Al terminar, el árbol de trabajo del repositorio queda intacto (FR-005)
- [X] T021 [P] [US1] Escribir `tests/unit/platform/logging.test.ts` con destino en memoria, que cubre la interfaz de `src/platform/logging` (T034; plan.md, «Interfaz de registros»):
  - **Interfaz**: en ejecución, el módulo exporta únicamente `createLogger`, `logStartupCompleted` y `logConfigInvalid`; `createLogger({ environment, level, destination? })` devuelve un manejador opaco, sin `info`, `fatal`, `child` ni otros métodos de Pino; el destino es inyectable y, sin él, la salida es la estándar. Importar el módulo o crear el manejador no escribe nada.
  - **Formato**: cada evento escribe exactamente una línea con un único objeto JSON con `level` como etiqueta textual, `time` (ISO), `service: "aulanorma"`, `environment` y `msg` con el nombre exacto del evento, sin `pid`, `hostname`, `requestId` ni datos de la petición.
  - **Eventos**: `logStartupCompleted` escribe `info` `startup.completed` sin otros campos propios; `logConfigInvalid` escribe `fatal` `startup.config_invalid` con `environment` igual al modo explícito, `mode` y `problems`. Ninguno queda suprimido por los siete niveles admitidos, incluido `silent`. `problems` se reconstruye solo con `key` y `problem`: el evento no contiene el valor recibido, campos adicionales, objetos `Error`, rutas absolutas, nombres de ficheros `.env` ni trazas.
  - **Censura**: los campos `*.password`, `*.secret`, `*.token`, `*.apiKey`, `authorization` y `cookie` con valores sintéticos quedan como `"[REDACTED]"`, con la semántica de rutas de Pino (lista mínima y ampliable), y el valor original no aparece en la línea.
  - **Salud**: no existe evento ni función de consulta a `/api/health` ni `requestId` (FR-008), y las pruebas no escriben nada accidentalmente en la salida estándar ni en la de error.
- [X] T022 [P] [US1] Escribir `tests/unit/platform/health.test.ts`, que cubre la interfaz de `src/platform/version` (T035) y `src/platform/health` (T036) (plan.md, «Interfaz de estado y versión»):
  - **Interfaz**: `version` exporta únicamente `getVersion()` y `health` únicamente `buildHealthStatus()`, ambas síncronas; `buildHealthStatus()` no recibe argumentos.
  - **Importación**: importar ambos módulos con el `package.json` válido no lanza, no escribe en la salida estándar ni en la de error, no accede a `process.env`, configuración, red ni persistencia, no usa `node:fs` y no invoca `getVersion` ni crea el estado. Se admite que el sistema de módulos resuelva y conserve la importación JSON estática de `package.json`; la validación y la composición ocurren solo al invocar las funciones, dentro del `try` del manejador (T037).
  - **`getVersion`**: devuelve la versión de `package.json` y acepta los límites del patrón `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$`; con un manifiesto sustituido, lanza al invocarse ante ausencia, tipo distinto de texto, ceros iniciales, fragmentos incompletos, versión preliminar, metadatos `+…`, espacios u otros formatos, con un error genérico que no contiene el valor, rutas, nombres de fichero ni datos del manifiesto, y sin modificar el manifiesto. Importar el módulo con un manifiesto no válido no lanza.
  - **`buildHealthStatus`**: llama a `getVersion` exactamente una vez por invocación y devuelve exactamente `{ status: "ok", version }`, sin ningún otro campo; cada llamada devuelve un objeto nuevo e independiente; si `getVersion` lanza, la excepción se propaga y nunca devuelve `"ok"`; ignora cualquier argumento, así que no usa IP, cabeceras, `User-Agent`, cookies ni otros datos de la petición; no genera `requestId` ni emite registros.
- [X] T023 [P] [US1] Escribir `tests/contract/health.contract.test.ts`, que llama directamente al manejador por defecto de `src/pages/api/health.ts` con dobles de petición y respuesta y variables sintéticas definidas en la prueba. `GET`: código 200, `Content-Type` `application/json`, `Cache-Control: no-store` y cuerpo exactamente `{ status: "ok", version: <package.json> }`, con `Object.keys(body)` exactamente `["status", "version"]`. `HEAD`: 200 con las mismas cabeceras y sin cuerpo. `OPTIONS`: 204, cuerpo vacío, `Allow: GET, HEAD, OPTIONS` y `Cache-Control: no-store`. Cualquier otro método: 405 defensivo cerrado con `Allow`. El manejador no fija `x-powered-by`, `server`, `etag`, `vary` ni `requestId`. Importar el módulo no ejecuta ningún trabajo falible. Con una configuración inválida o con un fallo forzado dentro del manejador, antes de iniciar la respuesta, responde 500 con cuerpo vacío, `Cache-Control: no-store`, `Content-Length: 0` y `Connection: close`, no lanza la excepción y nunca devuelve `"ok"`. Las respuestas HTTP reales, con la frontera y el servidor, se verifican en T025 y T029 (FR-006, FR-009; contracts/health.openapi.yaml)
- [X] T024 [P] [US1] Escribir `tests/unit/platform/http-boundary.test.ts` sobre `request(req, res)` del objeto que devuelve `createHttpBoundary(handle)` (plan.md, «Frontera HTTP»), con un `handle` inyectado y peticiones y respuestas simuladas:
  - **interfaz**: en ejecución, el módulo exporta únicamente `createHttpBoundary`, y el objeto devuelto tiene un `request` invocable; T024 no exige ni excluye los otros cinco métodos, que llegan en T040;
  - **destino**: crudo exacto `/api/health`, byte a byte, sin normalizar ni decodificar: barra final, barras repetidas, codificación, consulta, sufijos como `.rsc`, forma absoluta, asterisco y rutas reservadas del framework reciben 404, nunca una redirección;
  - **método**: `GET`, `HEAD` y `OPTIONS` se delegan con exactamente una llamada a `handle`, que recibe los mismos objetos `req` y `res`; cualquier otro método recibe 405 con `Allow: GET, HEAD, OPTIONS`;
  - **rechazo cerrado**: todo 404, 405 o 500 tiene cuerpo vacío, `Cache-Control: no-store`, `Content-Length: 0` y `Connection: close`, `Allow` solo en 405, una sola respuesta, ningún error, mensaje, traza, ruta ni dato reflejado, y no llama a `handle` (salvo el 500, que sigue a su llamada);
  - **fallo de `handle`**: si falla, de forma síncrona o asíncrona, antes de enviar cabeceras, 500 cerrado; si ya se inició la respuesta, ninguna escritura, estado ni finalización posterior y exactamente una destrucción de la conexión, con `res.destroy()` o `req.socket.destroy()`; en ambos casos `request` se resuelve sin relanzar el fallo;
  - **precedencia** versión → `Host` → destino → método → cuerpo, con un caso representativo por cada par consecutivo (el detalle de cada regla queda para T028);
  - **cabeceras de framework**: unas pocas representativas (enrutado de Next.js y `x-forwarded-*`) no convierten un 404 o un 405 en delegación ni cambian lo que se entrega a `handle` (la matriz completa queda para T029);
  - **datos**: la frontera solo lee `httpVersion`, `method`, `url`, `rawHeaders` y el estado imprescindible de la respuesta; no consume el cuerpo, no lee la dirección del cliente ni otros datos de la petición y ningún manejo escribe registros.

  Esas respuestas son de rechazo o de transporte: no ejecutan una operación de producto, no constituyen autorización y no amplían la excepción. Debe fallar hasta T038 (FR-009)
- [X] T025 [P] [US1] Escribir en `scripts/smoke-test.mjs` (Node sin dependencias) la parte común y el **modo producción**:
  - **Higiene**: construir el entorno de cada caso desde cero, eliminando toda `AULANORMA_*` heredada; usar el puerto fijo `127.0.0.1:3000` de los puntos de entrada, comprobando antes de cada arranque que está libre y fallando con un mensaje claro si no lo está; cada servidor en su propio grupo de procesos, terminado completo al acabar el caso; espera de señales observables, sin pausas fijas; negarse a ejecutar, con mensaje claro, si existen `.env`, `.env.local`, `.env.production` o `.env.production.local`.
  - **Cliente TCP crudo** sin dependencias, que registra estado, cuerpo, cabeceras en su orden, cierre de la conexión y ausencia de respuesta.
  - **`npm start` inválido**: con variable ausente, vacía, valor inválido (centinela) y clave desconocida, el proceso termina con código distinto de 0 en menos de 20 s, el puerto no acepta ninguna conexión en toda la vida del proceso, y la salida nombra la clave y el problema sin el centinela, sin rutas absolutas, sin nombres de ficheros `.env` y sin trazas.
  - **Modo explícito en producción**: `npm start` con un `NODE_ENV` heredado `development` o `test` arranca igualmente en producción y responde como el caso válido, porque el script fija `NODE_ENV` en los dos procesos. `NODE_ENV=test` y `NODE_ENV=development` delante de `node scripts/preflight.mjs start` terminan con código 1 y la salida nombra `NODE_ENV` y `mode_mismatch` sin el valor. La defensa interna de `server.mjs`, ejecutado solo para esta comprobación con `NODE_ENV=test`, termina con código distinto de 0 sin abrir el puerto.
  - **`npm start` válido**: 200 con el cuerpo del contrato y el conjunto cerrado de cabeceras (`Vary` solo `Accept-Encoding`), sin campos adicionales ni cabeceras `x-powered-by` o `server`. No se emite ningún registro por la consulta.
  - **Métodos sobre `/api/health`** en el servidor real: `GET` y `HEAD` responden 200; `POST`, `PUT`, `PATCH`, `DELETE` y `TRACE` responden 405 cerrado con `Allow: GET, HEAD, OPTIONS`; `OPTIONS` responde 204 sin cuerpo, con `Allow` y `Cache-Control: no-store`. Ninguno responde 404 ni HTML.
  - **Destinos no exactos**: `/`, `/foo`, `/api`, `/api/health/`, `/api/health/extra`, `/favicon.ico`, `/404`, `/500`, `/_error`, `/_not-found`, `/_next/data/…`, `/_next/image…`, `/_next/static/…`, `/__nextjs_…` y `/api/health.rsc` responden 404 cerrado, sin redirección y sin HTML.

  Todos los casos se ejecutan sin ningún secreto real (FR-004). No arranca `next start` ni `next dev` directos: no están admitidos (T032)
- [X] T026 [US1] Ampliar `scripts/smoke-test.mjs` con el **modo desarrollo**:
  - **Copia temporal**: se crea con `fs.mkdtemp` a partir de `git ls-files -z --cached --others --exclude-standard`, con dependencias instaladas mediante `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` (sin enlace a `node_modules`) y eliminada en `finally`. Se ejecuta después del modo producción, nunca a la vez, porque ambos usan `127.0.0.1:3000`.
  - **Configuración por caso**: la prueba escribe su propio `.env.development.local` en cada caso.
  - **Casos inválidos**: valor inválido en el fichero, clave ausente en el fichero y variable de proceso vacía que prevalece sobre un fichero válido. En los tres, código distinto de 0, puerto nunca abierto y sin centinela.
  - **Caso válido**: con un fichero válido, un calentamiento con una primera consulta, que compila la ruta, y después 200 con el cuerpo del contrato. No se prueba ni se promete la recarga en caliente de la configuración: aplicar un cambio exige reiniciar.
  - **Modo explícito en desarrollo**: la copia temporal contiene además un `.env.test` sintético con una clave `AULANORMA_*` desconocida; `npm run dev` con un `NODE_ENV` heredado `test` o `production` arranca en desarrollo con el fichero válido y responde 200, lo que demuestra que no carga `.env.test`; `NODE_ENV=test node scripts/preflight.mjs dev` termina con código 1 y nombra `NODE_ENV` y `mode_mismatch` sin el valor.
  - **Muestra de destinos no exactos**, incluido `/__nextjs_…`, y un `Upgrade` de recarga de desarrollo: 404 o 405 cerrados, sin HTML.

  Depende de T025 (mismo fichero)
- [X] T027 [P] [US1] Escribir `tests/unit/platform/http-boundary-connection.test.ts`, con un `handle` inyectado y sockets simulados, sobre el estado de conexión (FR-006 C4, FR-009):
  - contador de respuestas pendientes que aumenta al aceptar una petición y disminuye una sola vez cuando su respuesta termina o se cierra;
  - después de un rechazo no se delega ni se responde ninguna otra petición del socket;
  - `clientError` sin respuestas pendientes produce el 400 cerrado inmediato; con respuestas pendientes se difiere; al terminar la última se emite (*flush*); si el socket se cierra antes, se descarta sin escribir (*dropped*); con un rechazo previo se suprime sin escribir; `ECONNRESET` descarta el diferido y destruye el socket; nunca hay una segunda respuesta;
  - `checkContinue` y `checkExpectation` pasan por la misma frontera, sin 100 ni 417 automáticos;
  - `CONNECT` y `Upgrade` reciben 404 (otro destino) o 405 (`/api/health`) cerrados, sin llamar a `handle`.

  Debe fallar hasta T040
- [X] T028 [P] [US1] Escribir `tests/unit/platform/http-boundary-request.test.ts` sobre versión, `Host`, `rawHeaders`, cuerpo y framing, con valores sintéticos:
  - versiones: HTTP/1.0 y HTTP/1.1 se admiten; una versión analizada distinta (por ejemplo, HTTP/2.0 o HTTP/0.9) recibe 505;
  - `Host` en HTTP/1.1: ausente, duplicado (con cualquier combinación de mayúsculas, detectado en `rawHeaders`), vacío o solo con espacios, con coma o con caracteres de control (`\x00` a `\x1f` y `\x7f`) recibe 400; en HTTP/1.0, la ausencia se admite y un `Host` presente cumple las mismas reglas;
  - `Host` con obs-text o con espacios internos: se fija el comportamiento vigente, que lo admite, para que cualquier cambio sea visible (research.md, K21);
  - cuerpo: sin `Transfer-Encoding` y con `Content-Length` ausente o 0 se admite; cualquier `Transfer-Encoding` o una longitud distinta de cero recibe 400;
  - la frontera no lee ninguna cabecera fuera de su lista cerrada, y ningún valor inspeccionado aparece en la respuesta, en los registros ni en lo que se entrega a `handle` (FR-006 C2).

  Debe fallar hasta T038
- [X] T029 [US1] Ampliar `scripts/smoke-test.mjs` con la **matriz negativa por TCP crudo** contra `npm start`, un subconjunto permanente del oráculo de viabilidad (research.md, R1):
  - versiones (HTTP/1.0, HTTP/1.1, HTTP/2.0 y HTTP/0.9 en texto plano, y líneas de petición malformadas), `Host` (ausente, duplicado, vacío, con coma y con control), cuerpos y framing (`Content-Length` distinto de cero, `Transfer-Encoding` y combinaciones conflictivas), `Expect`, `CONNECT`, `Upgrade`, destinos codificados y métodos;
  - **Cabeceras de control del framework** sobre el destino canónico: un grupo permanente explícito de 21 casos, que reproduce la cobertura de la prueba de viabilidad. Cada valor es un marcador sintético único para poder detectar su reflejo:

    | # | Método | Cabeceras de petición |
    |---|--------|-----------------------|
    | 1 | `GET` | `RSC` |
    | 2 | `HEAD` | `RSC` |
    | 3 | `GET` | `Next-Router-State-Tree` |
    | 4 | `HEAD` | `Next-Router-State-Tree` |
    | 5 | `GET` | `Next-Router-Prefetch` |
    | 6 | `HEAD` | `Next-Router-Prefetch` |
    | 7 | `GET` | `Next-Router-Segment-Prefetch` |
    | 8 | `HEAD` | `Next-Router-Segment-Prefetch` |
    | 9 | `GET` | `RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch` y `Next-Url` |
    | 10 | `HEAD` | Las mismas que el caso 9 |
    | 11 | `GET` | `Next-Url` |
    | 12 | `GET` | `x-invoke-path` |
    | 13 | `GET` | `x-invoke-status` |
    | 14 | `GET` | `x-invoke-error` |
    | 15 | `GET` | `x-middleware-subrequest` |
    | 16 | `GET` | `x-nextjs-data` |
    | 17 | `GET` | `Purpose: prefetch` |
    | 18 | `GET` | `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto` y `x-forwarded-port` |
    | 19 | `HEAD` | Las mismas que el caso 18 |
    | 20 | `GET` | `Next-Router-Prefetch` y `x-nextjs-data` |
    | 21 | `GET` | Caso agregado con las quince familias a la vez |

    Para los 21 casos: `GET` responde 200 con el cuerpo exacto y `HEAD` responde 200 sin cuerpo; el contrato no cambia; ninguna `Vary` distinta de `Accept-Encoding`; ninguna cabecera `x-nextjs-*` ni `x-middleware-*` en la respuesta; sin `ETag`, `Server`, `X-Powered-By`, `Location` ni `Refresh`; ninguna redirección; ningún valor recibido reflejado; y ningún registro de esos valores (T031). La presencia de estas cabeceras no autoriza ninguna ruta, método ni comportamiento adicional. Pueden añadirse otras cabeceras internas ejercitadas en la viabilidad sin reducir este grupo;
  - canalización: respuestas en orden, como máximo una por petición y ninguna delegación tras un rechazo; un error de análisis diferido que termina en *flush* y otro que termina en *dropped*;
  - auditoría de cada respuesta: 0 respuestas HTML; ninguna cabecera `x-nextjs-*` ni `x-middleware-*`; ninguna `Vary` distinta de `Accept-Encoding`; sin `ETag`, `Server`, `X-Powered-By`, `Location` ni `Refresh`; `Keep-Alive` solo `timeout=5` y solo en respuestas satisfactorias sobre conexiones persistentes; 0 filtraciones de rutas, identificadores de compilación o valores de la petición en cuerpos y cabeceras; 0 errores 500 inesperados;
  - el cierre ordenado y el reinicio de la conexión tras un rechazo se admiten como variantes del contrato (research.md, K19).

  Depende de T026 (mismo fichero)
- [X] T030 [US1] Ampliar `scripts/smoke-test.mjs` con la **equivalencia contractual entre desarrollo y producción**: en la copia temporal de T026, tras el calentamiento, ejecutar en `npm run dev` el mismo subconjunto de T029 y comprobar, caso a caso, los mismos estados, cuerpos, conjunto de cabeceras (salvo el valor de `Date`) y cierres que en `npm start`. Cualquier diferencia hace fallar la prueba (FR-009). Depende de T029 (mismo fichero)
- [X] T031 [US1] Ampliar `scripts/smoke-test.mjs` con la **auditoría de registros en ambos modos**: capturar la salida estándar y de error de `npm start` y de `npm run dev` durante T025 a T030 y comprobar que, fuera del arranque, no aparece ninguna línea: ningún registro automático del framework por petición (método, estado, ruta, tiempos o compilación), ninguna línea de `server.mjs` por petición o rechazo, ni avisos, errores o trazas; que el arranque solo contiene el evento estructurado `startup.completed` y las líneas de arranque del entorno de ejecución; que hay **exactamente un** `startup.completed` por arranque satisfactorio, emitido por `server.mjs` después de validar la configuración y de empezar a escuchar; que el preflight no emite ninguno y ninguna consulta de salud emite otro; y que ni ese evento ni ninguna otra línea contienen valores de configuración, datos de la petición, valores de `Host`, rutas locales ni credenciales (FR-006 C4, FR-008). Depende de T030 (mismo fichero)
- [X] T032 [P] [US1] Escribir `tests/architecture/entry-points.test.ts`, que debe fallar hasta T041. Falla si:
  - un script de `package.json` invoca `next dev` o `next start` directamente, o `dev` y `start` no son exactamente el preflight seguido de `server.mjs`;
  - `dev` no fija `NODE_ENV=development`, o `start` no fija `NODE_ENV=production`, de forma independiente en los dos lados de `&&` (preflight y `server.mjs`), o el argumento del preflight no corresponde al script;
  - aparece otro punto de entrada que atienda peticiones distinto de `server.mjs`;
  - `next.config.ts` introduce `rewrites`, `headers`, `redirects`, middleware o `proxy`, o `logging.incomingRequests.ignore` deja de ser exactamente `/^\/api\/health$/`;
  - existen `middleware.ts`, `proxy.ts`, `instrumentation.ts` o `src/app`;
  - se crea una segunda ruta pública;
  - `server.mjs` usa propiedades privadas de Node.js, lee variables de entorno distintas de `NODE_ENV`, llama más de una vez a `handle` o contiene instrumentación de diagnóstico.

  (FR-006 C7; research.md, K17)

### Implementation for User Story 1

- [X] T033 [P] [US1] Crear `src/platform/config/index.ts` como módulo portable: solo importa `zod` y `@next/env`, sin importaciones relativas ni `@/`, y con sintaxis TypeScript borrable. Contiene el esquema de `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT` y tres funciones (research.md, R8; data-model.md):
  - **`validateConfig(source)`**: función pura sobre una fuente inyectada; no lee `process.env`; devuelve `{ ok: true, config }`, con una configuración inmutable, u `{ ok: false, problems }`, con `readonly { key, problem }[]` y `problem` igual a `missing`, `invalid_value` o `unknown_key`, sin incluir nunca el valor;
  - **`loadConfig(mode)`**: recibe explícitamente `development` o `production` y no deduce el modo del `NODE_ENV` heredado. Si `process.env.NODE_ENV` no coincide con el modo, devuelve `{ ok: false, problems: [{ key: "NODE_ENV", problem: "mode_mismatch" }] }` antes de cargar ningún fichero y sin el valor recibido. Si coincide, llama a `loadEnvConfig` de `@next/env` con el directorio del proyecto, `dev` verdadero solo en `development`, el logger controlado y `forceReload = true`, así que nunca selecciona `.env.test` ni reutiliza un resultado en caché. Si el logger marca un error de carga o el cargador lanza una excepción, devuelve solo `{ key: "environment", problem: "env_load_failed" }`. En otro caso lee `process.env` (lectura permitida solo en `src/platform/config`), delega en `validateConfig` y devuelve la misma unión. No devuelve ni registra lo que devuelve el cargador. La usan el preflight (T042) y `server.mjs` antes de escuchar (T041);
  - **Logger controlado**: adaptador privado del módulo, no exportado y creado en cada llamada a `loadConfig`, con los métodos `info` y `error` que declara `@next/env`. No reenvía nada a `console`, a `pino` ni a la salida de error y no conserva argumentos, rutas, objetos de error, mensajes ni trazas; `error` solo marca que ocurrió un error de carga;
  - **Marcador interno**: `__NEXT_PROCESSED_ENV`, que `@next/env` puede fijar en `process.env`, no pertenece al esquema, no entra en la configuración, no se devuelve y no se registra;
  - **`readRuntimeConfig()`**: no vuelve a cargar ficheros `.env*`, no llama a `@next/env` ni usa `forceReload`; lee el `process.env` ya preparado del proceso, ignora las claves ajenas al esquema, delega en `validateConfig` y devuelve la misma unión. La usa la API Route dentro del `try` de cada manejo (T037). No depende de compartir una instancia en memoria con `server.mjs`.

  Ninguna registra valores. El cargador de `@next/env` es sustituible en las pruebas para observar sus llamadas. Los cambios de `.env*` siguen exigiendo reinicio (hace pasar T020)
- [X] T034 [P] [US1] Crear `src/platform/logging/index.ts` como módulo portable: solo importa `pino`. En ejecución exporta únicamente `createLogger({ environment, level, destination? })`, `logStartupCompleted(logger)` y `logConfigInvalid(logger, mode, problems)`; `createLogger` devuelve un manejador opaco de la aplicación, no el logger de Pino, y no expone `info`, `fatal`, `child` ni otros métodos. El logger escribe JSON por la salida estándar, con destino inyectable, `level` como etiqueta textual, marcas de tiempo ISO, campos base `service: "aulanorma"` y `environment`, sin `pid` ni `hostname`, y `redact` con censura `"[REDACTED]"` para `*.password`, `*.secret`, `*.token`, `*.apiKey`, `authorization` y `cookie` (lista mínima y ampliable). Eventos: únicamente `startup.completed` (`info`, sin otros campos propios) y `startup.config_invalid` (`fatal`, con `environment` igual al modo explícito, `mode` y `problems` reconstruido copiando solo `key` y `problem`). Cada llamada escribe exactamente una línea y ningún nivel operativo, incluido `silent`, suprime los eventos. Importar el módulo o crear el manejador no escribe nada. NO emite `health.checked` ni genera `requestId` (plan.md, «Interfaz de registros»; research.md, R9; hace pasar T021)
- [X] T035 [P] [US1] Crear `src/platform/version/index.ts`, que exporta únicamente `getVersion()`, síncrona. Importa estáticamente el `package.json` raíz como módulo JSON (`with { type: "json" }`), sin `node:fs` ni `process.cwd()`, y no lee configuración ni `process.env`. Al importarse no valida ni transforma la versión. Al invocarse, valida que el campo `version` sea texto conforme a `^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$` (SemVer básico `X.Y.Z`) y devuelve exactamente ese texto; ante ausencia, tipo distinto, versión preliminar, metadatos `+…` o cualquier otro formato, lanza un error genérico que no contiene el valor, rutas, nombres de fichero ni datos del manifiesto. Así, cualquier fallo ocurre al invocarla, dentro del `try` del manejador (T037) (hace pasar T022 con T036)
- [X] T036 [US1] Crear `src/platform/health/index.ts`, que exporta únicamente `buildHealthStatus()`, síncrona y sin argumentos. Importa `getVersion` de `@/platform/version` y, al invocarse, la llama exactamente una vez y devuelve un objeto nuevo exactamente igual a `{ status: "ok", version }`, sin ningún otro campo; si `getVersion` lanza, la excepción se propaga. El módulo no hace trabajo al importarse y no lee configuración, `process.env`, `package.json` ni datos de la petición; no registra, no genera `requestId` y no usa red, persistencia ni servicios externos (depende de T035; hace pasar T022)
- [X] T037 [US1] Crear `src/pages/api/health.ts`, la única API Route. El módulo no ejecuta ningún trabajo falible al importarse. Dentro del `try` de cada manejo llama a `readRuntimeConfig()` de `@/platform/config`: si el resultado es un fallo, responde el 500 cerrado; si es correcto, obtiene de la configuración validada lo que necesite y obtiene el estado, versión incluida, con `buildHealthStatus()` de `@/platform/health` (T036), también dentro del `try`; no llama además a `getVersion()`, para que la versión tenga una sola lectura y una sola fuente. No llama a `loadConfig`, no lee `process.env`, no registra problemas ni valores y no conserva datos de la petición. `GET` y `HEAD` responden 200 con ese resultado de `buildHealthStatus()` como JSON, `Content-Type: application/json` y `Cache-Control: no-store` (sin cuerpo en `HEAD`). `OPTIONS` responde 204 con cuerpo vacío, `Allow: GET, HEAD, OPTIONS` y `Cache-Control: no-store`. Cualquier otro método recibe un 405 defensivo cerrado. Captura cualquier fallo que ocurra dentro del manejador, incluida una configuración inválida, y, mientras no haya iniciado la respuesta, responde 500 con cuerpo vacío, `Cache-Control: no-store`, `Content-Length: 0` y `Connection: close`; nunca lanza la excepción al framework ni responde `"ok"`. Los errores internos del framework anteriores a la entrada en el manejador no se presentan como cubiertos (research.md, K25); T023 prueba el 500 cerrado con un fallo forzado. NO emite ningún registro ni genera `requestId`. NO usa IP, cabeceras, `User-Agent`, cookies, consulta ni cuerpo. Solo importa `@/platform/<área>` (depende de T033 y T036; hace pasar T023)
- [X] T038 [P] [US1] Crear `src/platform/http-boundary/index.ts` como módulo portable: TypeScript borrable de forma nativa por Node.js 24, sin `enum`, `namespace` ni sintaxis que requiera transformación, sin importaciones relativas ni `@/`, y sin importar `node:http` en ejecución (solo `import type` de `IncomingMessage`, `ServerResponse` y `Duplex`). En ejecución exporta únicamente `createHttpBoundary(handle)`, con `handle: (req, res) => Promise<void>`, que devuelve un objeto `HttpBoundary`; en esta tarea implementa su método `request(req, res): Promise<void>` (plan.md, «Frontera HTTP»), sin métodos provisionales para lo que añade T040. Implementa la decisión de la frontera con la precedencia versión → `Host` → destino → método → cuerpo, las reglas de versión, `Host` (sobre `rawHeaders`), destino crudo exacto, método y cuerpo, y el contrato cerrado de rechazo de FR-009, con una única llamada a `handle` por petición delegada. No registra nada (hace pasar T024 y T028)
- [X] T039 [P] [US1] Crear `next.config.ts` con:
  - `poweredByHeader: false`;
  - `images: { unoptimized: true }`;
  - `logging: { incomingRequests: { ignore: [/^\/api\/health$/] } }`, que coincide exactamente con la única URL que delega la frontera.

  Sin `rewrites`, `headers`, `redirects`, middleware ni `proxy` (research.md, R1)
- [X] T040 [US1] Ampliar `src/platform/http-boundary/index.ts` con los otros cinco métodos de `HttpBoundary` (`checkContinue`, `checkExpectation`, `connect`, `upgrade` y `clientError`) y el estado de conexión por socket: rechazo terminal, contador de respuestas pendientes con liquidación única al terminar o cerrarse la respuesta, error de análisis diferido con *flush* y *dropped*, supresión tras un rechazo, `ECONNRESET`, `checkContinue` y `checkExpectation` por la misma frontera, y rechazo cerrado de `CONNECT` y `Upgrade`. Sin propiedades privadas de Node.js y sin registros (depende de T038; hace pasar T027)
- [X] T041 [US1] Crear `server.mjs` en la raíz como adaptador mínimo con `// @ts-check`:
  - determina el modo solo con `process.env.NODE_ENV`: pide `development` si vale exactamente `development` y `production` en cualquier otro caso, y `loadConfig` comprueba la concordancia, así que un valor ausente o distinto falla cerrado con `mode_mismatch` antes de escuchar; no lee `HOSTNAME`, `PORT` ni claves nuevas;
  - como primer paso, antes de crear la aplicación de Next.js y de escuchar, obtiene la configuración con `loadConfig` de `src/platform/config/index.ts` (T033), sin leer otras claves ni reconstruir la lista de problemas; no usa `readRuntimeConfig`; si recibe un fallo, registra `fatal` `startup.config_invalid` con esa lista mediante `src/platform/logging/index.ts` y termina con código 1 sin abrir el puerto;
  - crea el servidor con `http.createServer({ requireHostHeader: false }, …)` y conecta `request`, `checkContinue`, `checkExpectation`, `connect`, `upgrade` y `clientError` con los métodos del mismo nombre del objeto que devuelve `createHttpBoundary(handle)` de `src/platform/http-boundary/index.ts`;
  - hace una única llamada a `handle(req, res)` de Next.js; si `handle` rechaza antes de enviar cabeceras, responde el 500 cerrado, y si ya se inició la respuesta, no intenta escribir un segundo estado y destruye la conexión. No intenta convertir en ese 500 los errores internos del framework anteriores al manejador (research.md, K25);
  - escucha en `127.0.0.1:3000` y registra `startup.completed` **exactamente una vez**, después de validar la configuración y de empezar a escuchar, sin valores de configuración;
  - de `src/platform` solo importa módulos portables; además importa legítimamente `node:http` y `next`;
  - `node --check server.mjs` y `tsc --noEmit`, con la configuración de T006, deben pasar;
  - no registra nada por petición, no usa propiedades privadas de Node.js y no contiene instrumentación de diagnóstico.

  Depende de T033, T034, T037, T039 y T040. Con el preflight de T042, hace pasar T025, T026 y T029 a T032
- [X] T042 [US1] Crear `scripts/preflight.mjs` con modos `dev` y `start`:
  - lo invocan los scripts de T004: `npm run dev` fija `NODE_ENV=development` y `npm start` fija `NODE_ENV=production`, por separado para el preflight y para `server.mjs`, de modo que un `NODE_ENV` heredado distinto no cambia el modo;
  - llama a `loadConfig` de `src/platform/config/index.ts` (T033), importada directamente con eliminación nativa de tipos, con el modo explícito `development` para `dev` y `production` para `start`; no deduce el modo de `NODE_ENV`, no usa `readRuntimeConfig` ni lee `process.env` directamente; un argumento ausente o distinto de `dev` y `start` termina con código 1;
  - si `NODE_ENV` no coincide con el modo, recibe `{ key: "NODE_ENV", problem: "mode_mismatch" }`, sin el valor, y termina con código 1 antes de que `server.mjs` arranque; nunca se carga `.env.test` durante `dev` ni `start`;
  - si no puede cargar el código de validación, termina con código 1 y un mensaje que no muestra valores, rutas absolutas, nombres de ficheros `.env` ni trazas (fallo cerrado, FR-005);
  - si no es válida, registra con `src/platform/logging/index.ts` el evento `fatal` `startup.config_invalid` con el modo y la lista saneada de `{ key, problem }` que devuelve `loadConfig`, incluido `{ key: "environment", problem: "env_load_failed" }` ante un error de carga, sin valores, rutas, nombres de ficheros `.env`, mensajes originales ni trazas, y termina con código 1;
  - si es válida, termina con código 0 sin registrar `startup.completed`, que solo emite `server.mjs` (research.md, R8 y R9).

  Lo verifican T020 (contrato de `loadConfig`), T025 y T026 (arranque real con `NODE_ENV` heredado distinto, discordancia y `.env.test`), T031 (un único `startup.completed`, solo de `server.mjs`) y T032 (`NODE_ENV` en los dos lados de `&&`). Depende de T033 y T034
- [X] T043 [P] [US1] Crear `.env.example` con `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`, cada una documentada (propósito, obligatoria y valores válidos), con valores ficticios válidos y sin ningún secreto (FR-002, FR-004)
- [X] T044 [US1] Crear `README.md` con:
  - visión general;
  - requisitos previos: Git 2.40 o superior, curl y Node.js en el rango `>=24.21.0 <25`, con 24.21.0 como versión de referencia y obligatoria en la aceptación;
  - perfiles verificados: macOS arm64 y Linux x64; Windows solo mediante WSL, sin verificación;
  - los pasos 1 a 4 del quickstart: `npm ci`, `cp .env.example .env.development.local`, `npm run dev`, `curl -i http://127.0.0.1:3000/api/health`, los rechazos cerrados de la frontera (404 sin redirección, 405, 400 de cuerpo y 505) y el rechazo de configuración inválida en los dos modos;
  - que `npm run dev` y `npm start` son los únicos puntos de entrada, que no se usan `next dev`, `npx next dev`, `next start` ni `npx next start`, que `node server.mjs` directo tampoco es una entrada admitida (la validación defensiva interna no lo convierte en punto de entrada soportado), que la escucha es fija en `127.0.0.1:3000` y que los cambios de `.env*` exigen reiniciar;
  - la tabla de resolución de problemas.

  Un desarrollador debe poder completar el arranque sin leer `specs/` (FR-001, FR-025, SC-001). Depende de T042 y T043
- [X] T045 [P] [US1] Crear `docs/engineering/reference-environment.md` con el macOS arm64 de referencia del mantenedor: versión del sistema, arquitectura, procesador, memoria y versiones de Git, Node.js (24.21.0), npm y curl. Indicar que SC-001 y SC-002 se miden en él y que Linux x64 es el otro perfil verificado (FR-001a)

**Checkpoint**: `npm run check:test` y `npm run check:build` terminan con éxito. La prueba de humo pasa en los dos modos, con la matriz negativa, la equivalencia entre modos y la auditoría de registros, y T032 confirma que no hay entradas directas.

---

## Phase 4: User Story 2 - Verificar la calidad localmente con un conjunto único de comandos (Priority: P1)

**Goal**: los comandos locales de las ocho categorías y los agregados funcionan igual que en la
integración continua, y existe un procedimiento automatizado que demuestra que cada categoría
detecta su fallo sin modificar el repositorio real.

**Independent Test**: `npm run check:quality`, `npm run check:secrets`, `npm run check:deps` y
`npm run check:workflows` terminan con éxito cuando existen los workflows, y
`npm run verify:negative` informa del fallo esperado en cada categoría. El repositorio real
queda igual.

### Implementation for User Story 2

- [X] T046 [P] [US2] Crear `scripts/tools/tools.lock.json` con Gitleaks 8.30.1 y zizmor 1.30.1. Para cada una de las plataformas darwin-arm64, darwin-x64, linux-x64 y linux-arm64, registrar URL de descarga oficial, SHA-256 del archivo, ruta exacta del binario dentro del archivo y SHA-256 del binario. El SHA-256 del archivo procede, en Gitleaks, del fichero de sumas de comprobación publicado en su release y, en zizmor, que no publica ese fichero, del `digest` SHA-256 que GitHub publica para el asset de la release oficial, corroborado por el sujeto de las dos atestaciones publicadas de la release, cuyas firmas Sigstore no se verifican criptográficamente. El SHA-256 del binario se calcula tras extraerlo del archivo ya verificado. El instalador comprueba la integridad contra estos valores, no firmas ni procedencia de la compilación (research.md, R11 y R13)
- [X] T047 [US2] Crear `scripts/tools/install-tools.mjs` (Node sin dependencias): detecta la plataforma y descarga sin autenticación, sin usar ningún token. Verifica el SHA-256 contra `tools.lock.json` y falla cerrado ante cualquier discrepancia o si falta la herramienta. Instala en `.tools/bin` y es idempotente (depende de T046)
- [X] T048 [P] [US2] Crear `.gitleaksignore` vacío de huellas, con un comentario que remite a `docs/engineering/security-exceptions.md`
- [X] T049 [P] [US2] Crear `docs/engineering/security-exceptions.md` como registro estructurado y verificable automáticamente, inicialmente vacío. Por excepción: identificador del hallazgo (huella), responsable, justificación, fecha de aprobación y `reviewBy` en UTC, como máximo 90 días posterior. Correspondencia uno a uno con `.gitleaksignore` (FR-020)
- [X] T050 [P] [US2] Crear `security/audit-exceptions.json` vacío, con la estructura de campos `advisory` (GHSA), `package`, `justification`, `owner`, fecha de aprobación y `reviewBy` (ISO 8601, UTC, máximo 90 días) (data-model.md)
- [X] T051 [US2] Crear `scripts/check-secrets.mjs` (Node sin dependencias), que ejecuta tres análisis separados y falla si cualquiera encuentra un hallazgo no exceptuado, si falta la herramienta, si su SHA-256 no coincide o si el análisis no puede completarse:
  - **(1) historial alcanzable**: `.tools/bin/gitleaks git --log-opts="--full-history HEAD" --redact --no-banner --verbose .`, nunca con `--all`;
  - **(2) índice de Git**: el contenido preparado, aunque difiera del árbol de trabajo;
  - **(3) árbol de trabajo**: copia a un directorio de `fs.mkdtemp` los ficheros regulares existentes versionados modificados y los nuevos no ignorados, conservando su ruta relativa y sin seguir enlaces simbólicos ni incluir ficheros borrados. Ejecuta `gitleaks dir --redact --no-banner --verbose .` en la copia y la elimina en `finally`;
  - verifica la correspondencia uno a uno entre `.gitleaksignore` y el registro, y que ninguna excepción esté caducada en UTC;
  - **comprobación final**: `git status --porcelain` del repositorio real no ha cambiado (research.md, R11).

  Depende de T047, T048 y T049
- [X] T052 [P] [US2] Crear `scripts/check-dependencies.mjs` (Node sin dependencias):
  - ejecuta `npm audit --json` sobre las dependencias directas, de desarrollo y transitivas del lockfile;
  - falla con vulnerabilidades altas o críticas sin excepción vigente, con excepciones caducadas o incompletas (`reviewBy` en UTC, máximo 90 días) y si no puede consultar la base de avisos o el registro;
  - muestra sin fallar las medias y bajas, en la salida y en `$GITHUB_STEP_SUMMARY` cuando existe, con paquete, aviso, gravedad y enlace;
  - ejecuta `npm audit signatures`; un código distinto de cero hace fallar el control (FR-017, FR-020; research.md, R12).

  Depende de T050
- [X] T053 [US2] Crear `scripts/negative-checks.mjs` (`npm run verify:negative [categoría…]`) según plan.md ("Diseño de las pruebas negativas"):
  - **Estado inicial**: registrar `git status --porcelain` y `HEAD` del repositorio real.
  - **Copia por categoría**: una copia de `fs.mkdtemp` sin ficheros ignorados, con `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund` y un repositorio Git con commit base.
  - **Alteración y comando**: una alteración sintética por categoría y solo el comando de esa categoría, comprobando que falla **por la causa esperada y en la ubicación esperada**. Un código distinto de cero sin esa causa hace fallar el procedimiento. Las ocho alteraciones: formato (`const  sample={a:1}` en `src/platform`), lint (`src/modules/normative-source/violation.ts` que importa `@/modules/moodle-publication`), tipos (`export const sample: number = "text";`), pruebas (`tests/unit/negative.test.ts` con `expect(1).toBe(2)`), construcción (página temporal del Pages Router con un `getStaticProps` que lanza; ver el punto siguiente), secretos, dependencias (`npm install --package-lock-only --ignore-scripts lodash@4.17.20`) y workflows (`${{ github.event.pull_request.title }}` dentro de `run:`).
  - **Construcción**: antes de fijar la alteración, comprobar en una copia desechable que una página temporal del Pages Router con un `getStaticProps` que lanza provoca el fallo esperado de `check:build`, añadiendo JSX y la configuración suficiente si la copia lo necesita. No se asume de antemano el mensaje exacto. Solo después se fijan la causa, la ruta lógica del fichero temporal dentro de la copia, la salida esperada, el criterio de restauración y la prueba de que el árbol original queda intacto.
  - **Secretos**: tokens con formato de token de GitHub generados en tiempo de ejecución, sin ningún literal en el script, en tres subcasos con copia propia: (a) en un commit, debe fallar; (b) en un fichero nuevo sin seguimiento no ignorado, debe fallar; (c) solo en `.env.development.local`, ignorado, debe terminar con éxito. (c) es una prueba de exclusión positiva, no una novena prueba negativa.
  - **Limpieza**: eliminar cada copia en `finally` y fallar si el estado del repositorio real ha cambiado.
  - **Alcance**: no es un control y ningún workflow lo ejecuta.

  Aplica FR-011 (causa y ubicación de cada fallo) y FR-012 (alteraciones controladas reproducibles). Depende de T019, T031, T051 y T052
- [X] T054 [US2] Crear `docs/engineering/quality-controls.md` con:
  - las ocho categorías con su comando local y su job de Linux, incluida `check:workflows`;
  - los nueve controles requeridos con su nombre exacto, explicando que `macos-quality` ejecuta `check:quality` y no es una categoría;
  - los agregados `check:quality`, `check:security` y `check`, y `tools:install`;
  - la tabla de alteraciones negativas, con causa y ubicación esperadas; para la de construcción, los datos que fija T053: causa, ruta lógica del fichero temporal, salida esperada, criterio de restauración y prueba de que el árbol original queda intacto;
  - que `verify:negative` es un procedimiento de aceptación local y no un control;
  - qué comandos necesitan red: `check:deps`, `tools:install` y la categoría de dependencias de `verify:negative` (FR-010 a FR-014, FR-025). Depende de T053
- [X] T055 [P] [US2] Crear `SECURITY.md` con:
  - cómo notificar una vulnerabilidad;
  - el procedimiento ante un secreto expuesto: revocarlo inmediatamente; una excepción solo sirve para un falso positivo o un contenido demostrado como no secreto; no se reescribe el historial de `main` ni se fuerza un push;
  - la prohibición de secretos reales, credenciales y datos personales en el repositorio (FR-028)

**Checkpoint**: `npm run check:quality`, `npm run check:secrets` y `npm run check:deps` terminan con éxito, y `npm run verify:negative format lint types test build secrets dependencies workflows` informa de las ocho categorías sin cambiar el repositorio real.

---

## Phase 5: User Story 3 - Ejecutar automáticamente los mismos controles en cada pull request (Priority: P1)

**Goal**: dos workflows ejecutan en cada pull request hacia `main`, también en borrador, y en
cada actualización de `main` los mismos comandos que en local, con nueve jobs de nombre
estable, permisos mínimos y sin secretos del proyecto.

**Independent Test**: `npm run check:workflows` y `npm run check` terminan con éxito en local. En
el pull request de la funcionalidad aparecen los nueve controles con su nombre exacto y en verde.

### Implementation for User Story 3

- [X] T056 [US3] Crear `.github/workflows/quality.yml`:
  - **Disparadores y permisos**: `pull_request` y `push` con `branches: [main]`, sin filtros de rutas, también en borrador; `permissions: {}` a nivel de workflow y `permissions: { contents: read }` por job.
  - **Concurrencia y tiempos**: `concurrency` que cancela automáticamente ejecuciones anteriores solo en pull requests; una ejecución cancelada no cuenta para SC-004; `timeout-minutes: 15` por job.
  - **Entorno de job**: `NEXT_TELEMETRY_DISABLED=1`, `AULANORMA_LOG_LEVEL=info` y `AULANORMA_ENVIRONMENT=ci`.
  - **Acciones fijadas por SHA**: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1` con `persist-credentials: false`, y `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020  # v7.0.0` con `node-version-file: .node-version` y caché de npm.
  - **Jobs**: `format`, `lint`, `types`, `test` y `build` en `ubuntu-24.04`, cada uno con `npm ci` y su `npm run check:*`; `macos-quality` en `macos-26`, con `npm ci` y `npm run check:quality`.
  - **Prohibido**: `secrets.*`, pasar `github.token`, `GITHUB_TOKEN` o `GH_TOKEN` a cualquier paso, `pull_request_target`, `workflow_run` y ejecutar `verify:negative` (FR-015, FR-016, FR-018, FR-019, FR-021, FR-022)
- [X] T057 [P] [US3] Crear `.github/workflows/security.yml` con la misma seguridad común que T056 y además `schedule` semanal (lunes 06:00 UTC). Esa ejecución programada no cuenta como actualización de `main`, primera ejecución satisfactoria ni intento de SC-004. Jobs en `ubuntu-24.04`:
  - `secrets`: checkout con `fetch-depth: 0` y `persist-credentials: false`, `npm run tools:install` y `npm run check:secrets`;
  - `dependencies`: `npm ci` y `npm run check:deps`, con resumen de medias y bajas (paquete, aviso, gravedad y enlace);
  - `workflows`: `npm run tools:install` y `npm run check:workflows`.

  Sin `secrets.*` ni token explícito (FR-017, FR-019, FR-021)

  **Paso previo Z (FR-014)**, antes de crear los workflows: `check:workflows` pasa a ser `node scripts/check-workflows.mjs`. Verifica el SHA-256 de zizmor contra `scripts/tools/tools.lock.json` con la verificación compartida `scripts/tools/verified-tool.mjs`, que también usa `check:secrets`, y ejecuta la copia verificada con `--offline --min-severity low --no-config --no-ignores` sobre los YAML de `.github/workflows`. Rechaza las configuraciones de zizmor y las directivas `zizmor: ignore`, porque no hay excepciones de workflows, y falla cerrado si la herramienta falta o no coincide, si no hay workflows o si el análisis no se completa
- [X] T058 [P] [US3] Crear `.github/dependabot.yml` con los ecosistemas `npm` y `github-actions`, frecuencia semanal, agrupación de actualizaciones menores, y `next` y `@next/env` en el mismo grupo. No configurar integración automática (research.md, R12 y K12)
- [X] T059 [US3] Publicar la rama `001-engineering-baseline` y abrir el pull request de la funcionalidad hacia `main`. Actúa sobre GitHub, sin modificar ficheros. La descripción del pull request registra las comprobaciones manuales reproducibles realizadas hasta ahora y, cuando existan los workflows, debe superarlos. Comprobar que aparecen los nueve controles con sus nombres exactos, también en borrador, que Dependabot no queda como control y que los workflows no ejecutan `verify:negative` (depende de T056 a T058)

**Checkpoint**: `npm run check` y `npm run verify:negative workflows` terminan con éxito en local, y el pull request muestra los nueve controles en verde.

---

## Phase 6: User Story 4 - Comprender la estructura y activar la protección de `main` (Priority: P2)

**Goal**: la documentación permite ubicar las cuatro capas con su responsabilidad, enumerar los
nueve controles requeridos con su nombre exacto y activar la protección de `main` en el orden
correcto.

**Independent Test**: leyendo solo `README.md` y `docs/engineering/`, se localizan las cuatro
capas y se enumeran los nueve controles con el nombre con el que aparecen en los pull requests.
Es la base de SC-008.

### Implementation for User Story 4

- [X] T060 [P] [US4] Crear `src/modules/normative-source/README.md` con la responsabilidad de la capa (PDF original inmutable y texto extraído por página), dependencias permitidas (`platform`) y nota de que está vacía en esta funcionalidad (FR-023)
- [X] T061 [P] [US4] Crear `src/modules/structured-interpretation/README.md` con la responsabilidad (representación validada del certificado), dependencias permitidas (`platform` y `normative-source`) y nota de capa vacía (FR-023)
- [X] T062 [P] [US4] Crear `src/modules/didactic-content/README.md` con la responsabilidad (materiales, actividades y evaluaciones generados), dependencias permitidas (`platform` y `structured-interpretation`) y nota de capa vacía (FR-023)
- [X] T063 [P] [US4] Crear `src/modules/moodle-publication/README.md` con la responsabilidad (correspondencia entre el contenido aprobado y Moodle, sin generar ni alterar contenido), dependencias permitidas (`platform` y `didactic-content`) y nota de capa vacía (FR-023)
- [X] T064 [P] [US4] Crear `docs/engineering/architecture.md` con:
  - las cuatro capas, su ubicación y su responsabilidad;
  - la matriz de dependencias de data-model.md;
  - la regla de entrega limitada a las API públicas de `src/platform`;
  - la frontera HTTP (`server.mjs` y `src/platform/http-boundary`), su precedencia y su contrato cerrado de rechazo, y que `npm run dev` y `npm start` son los únicos puntos de entrada;
  - las áreas de `src/platform`;
  - los módulos portables y quién puede leer `process.env`;
  - cómo se fuerzan los límites: ESLint y `tests/architecture/import-boundaries.test.ts` (FR-023, FR-025)
- [X] T065 [P] [US4] Crear `docs/engineering/branch-protection.md` con:
  - la lista exacta de los nueve controles requeridos y su fuente esperada (aplicación GitHub Actions de este repositorio);
  - la secuencia de plan.md ("Protección de `main`"): mantener la protección básica; integrar solo si SC-001 a SC-008 previos a `main` están Superado; la integración no inicia la congelación; admitir PR correctivos hasta el primer par satisfactorio sobre el mismo SHA; congelación desde ese momento hasta la activación; añadir los nueve inmediatamente (misma sesión administrativa, sin commits intermedios, ambas marcas temporales); si la activación falla, la congelación continúa;
  - los pasos para una regla clásica y para un ruleset;
  - la verificación con `gh api`;
  - las reglas: sin pushes directos ni forzados, sin actores con elusión (tampoco administradores), sin aprobación de otra persona mientras haya un único mantenedor y sin desactivación de emergencia;
  - una sección "Registro de activación" vacía, que se completa en T086 (FR-026)
- [X] T066 [P] [US4] Crear `CONTRIBUTING.md` con:
  - ramas propias y llegada a `main` solo mediante pull request;
  - el flujo Spec Kit completo para funcionalidades críticas (`specify` → `clarify` → `plan` → `checklist` → `tasks` → `analyze` → `implement` → `converge`);
  - la revisión documentada con la lista de comprobación constitucional en la descripción del pull request cuando hay un único autor;
  - la Definition of Done de la constitución;
  - `npm run check` antes de abrir un pull request;
  - la convención de los pull requests negativos (`[NEGATIVE TEST] <identificador> — do not merge`, en borrador y nunca integrados) (FR-025)
- [X] T067 [US4] Ampliar `README.md` con una sección de documentación que enlace `docs/engineering/architecture.md`, `quality-controls.md`, `branch-protection.md`, `reference-environment.md`, `CONTRIBUTING.md`, `SECURITY.md` y los ADR en estado Propuesto (depende de T044, T045, T054, T055 y T064 a T066)

**Checkpoint**: la documentación de estructura, controles y protección está completa en el pull request.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: verificar que la implementación respeta los ADR Propuesto, cerrar la coherencia
documental, preparar la evidencia de aceptación y fijar el SHA base. Los ADR NO se aceptan en
esta fase.

Orden estricto: T068 → T069 → T070 → T071.

- [X] T068 Verificar que la implementación terminada respeta cada decisión de `docs/adr/0001-architecture-runtime-and-modular-structure.md` y `docs/adr/0002-quality-ci-and-security-strategy.md`, que permanecen Propuesto. Si una decisión propuesta no es viable, se corrige el ADR, no se obliga a cambiar la implementación para conservarla. No se cambia el estado a Aceptado (FR-027)
- [X] T069 Revisar `README.md` contra los pasos 1 a 8 de `quickstart.md`: cada instrucción necesaria para SC-001 está en `README.md` o en documentos enlazados de `docs/engineering/`, sin depender de `specs/`. Los enlaces a los ADR reflejan el estado Propuesto. Corregir cualquier diferencia en `README.md` (FR-001, FR-025; depende de T068)
- [X] T070 Crear `specs/001-engineering-baseline/acceptance.md` con:
  - **Cabecera**: campo del SHA base de aceptación (se completa en T071), Node.js 24.21.0 y enlace a `docs/engineering/reference-environment.md`. Distinción entre SHA base y HEAD de evidencia.
  - **Reglas comunes de la matriz**: estados Superado, No superado y Pendiente. SC-001 y SC-008 DEBEN estar Superado antes de integrar; no existe cierre posterior. Nunca secretos, valores de tokens (tampoco sintéticos), nombres de personas, rutas locales ni salidas sin redactar. Personas externas identificadas con seudónimo no reidentificable.
  - **Una sección por criterio**, de SC-001 a SC-009, con estado inicial **Pendiente** y los campos de evidencia de la matriz de aceptación de plan.md.
  - **Una sección de evidencia de FR-006 C6 y FR-009**, con estado inicial **Pendiente**, para la matriz negativa, la equivalencia entre modos y la auditoría de registros sobre la implementación real (plan.md, "Matriz de aceptación"). No es un criterio SC adicional.

  Depende de T069
- [ ] T071 Fijar el SHA base de aceptación. Hacer commit de los cambios de T068 a T070 en la rama `001-engineering-baseline` y publicarlos. Comprobar que los nueve controles terminan en verde sobre ese commit, que es el último del pull request de implementación salvo un HEAD de evidencia que solo añada `acceptance.md`. Anotar su SHA en la cabecera de `specs/001-engineering-baseline/acceptance.md`. Los ADR permanecen Propuesto. Desde aquí, cualquier cambio fuera de `acceptance.md` produce un nuevo SHA base y obliga a repetir las verificaciones afectadas (depende de T070)

**Checkpoint**: ADR 0001 y 0002 siguen Propuesto y SHA base fijado con los nueve controles en verde.

---

## Phase 8: Aceptación manual antes de integrar (no son controles)

**Purpose**: ejecutar una vez sobre el SHA base fijado en T071 los procedimientos de la matriz
de aceptación y guardar su evidencia en `specs/001-engineering-baseline/acceptance.md`. Todas
las mediciones locales se hacen con Node.js 24.21.0 en un clon completo, limpio y propio
fijado a ese SHA. Si un commit posterior cambia código, scripts, dependencias, workflows o
documentación de procedimiento, se crea una nueva base y se repiten las verificaciones
afectadas.

**⚠️** Estas tareas escriben en el mismo fichero y no se marcan `[P]`. SC-001 y SC-008
necesitan una persona externa: si no está disponible, quedan **Pendiente**, el pull request
permanece abierto y **no se integra**. No las sustituye el mantenedor. No existe tarea de
cierre posterior.

- [ ] T072 Aceptación manual SC-006 en `specs/001-engineering-baseline/acceptance.md`, en un clon limpio y completo propio del SHA base:
  - `diff .env.example .env.development.local` no muestra diferencias;
  - `.env.example` solo contiene `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`, con valores ficticios;
  - `grep -rnE 'secrets\.|github\.token|GITHUB_TOKEN|GH_TOKEN' .github/workflows` no devuelve coincidencias;
  - revisión visual de que no se pasa el token por `toJSON(github)` ni por accesos indexados al contexto.

  Registrar las salidas redactadas
- [ ] T073 Aceptación manual SC-002 en `specs/001-engineering-baseline/acceptance.md`: en un clon limpio y completo propio del SHA base, en el macOS arm64 de referencia, con `npm ci` y `npm run tools:install` ejecutados, lanzar cada uno de los ocho comandos de categoría (`check:format`, `check:lint`, `check:types`, `check:test`, `check:build`, `check:secrets`, `check:deps` y `check:workflows`) y después `time npm run check`. Registrar SHA, `node --version`, códigos de salida y tiempo real. Superado si todos terminan con 0 y el agregado tarda menos de 10 minutos. Registrar además en la sección de evidencia de FR-006 C6 y FR-009 el resultado de la matriz negativa, la equivalencia entre modos y la auditoría de registros que ejecuta `check:build` con Node.js 24.21.0 (casos y peticiones; 0 respuestas HTML, 0 cabeceras del framework, 0 redirecciones y 0 errores 500 inesperados)
- [ ] T074 Aceptación manual SC-005 en `specs/001-engineering-baseline/acceptance.md`: en un clon limpio y completo propio del SHA base, en la misma máquina, cinco ejecuciones de `npm run check:test` con red y cinco con la conectividad externa realmente desactivada y comprobada. Antes de las ejecuciones sin red, comprobar que `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` falla. Registrar código de salida y recuentos de Vitest de cada una (quickstart, paso 7)
- [ ] T075 Aceptación manual SC-003 (parte local) en `specs/001-engineering-baseline/acceptance.md`: en un clon limpio y completo propio del SHA base, anotar `git status --porcelain` y `git rev-parse HEAD`, ejecutar `npm run verify:negative` y comparar ambos valores después. Cada categoría debe fallar por la causa esperada y en la ubicación esperada. Registrar el resultado de las ocho categorías, incluidos los subcasos (b) y (c) de secretos; (c) es exclusión positiva. Repetir en un clon propio de Linux x64 con Node.js 24.21.0 (quickstart, paso 8)
- [ ] T076 Aceptación manual SC-007 (parte local) en `specs/001-engineering-baseline/acceptance.md`: en un clon limpio y completo propio del SHA base, comprobar que `git rev-parse --is-shallow-repository` devuelve `false` y ejecutar `npm run check:secrets` con los tres análisis. Registrar SHA, `git rev-list --count HEAD`, commits examinados por Gitleaks y resultado sin hallazgos no justificados. La confirmación en `main` se obtiene en T083 y se registra en T087
- [ ] T077 Aceptación manual SC-003 (integración continua) en `specs/001-engineering-baseline/acceptance.md`:
  - **Ramas y pull requests**: por cada categoría (`format`, `lint`, `types`, `test`, `build`, `secrets`, `dependencies` y `workflows`), crear desde el SHA base la rama `negative-test/<identificador>` con su alteración (subcaso (a) en secretos) y abrir un pull request **en borrador** titulado `[NEGATIVE TEST] <identificador> — do not merge`.
  - **Evidencia por categoría**: esperar a que el control objetivo falle por la causa y en la ubicación esperadas (y `macos-quality` en las categorías 1 a 5); registrar fallos colaterales; los controles no afectados DEBEN pasar. Cerrar el pull request sin integrar y eliminar la rama.
  - **Secretos**: nunca usar un secreto real y revisar que el token procede del generador sintético. Si la protección de push bloquea, autorizar solo con "It's used in tests" (autorización puntual, no excepción a FR-020) y registrar la autorización sin el valor del token. Cerrar cualquier alerta como dato sintético usado en una prueba. Si no puede autorizarse, SC-003 queda sin superar.
  - **Cierre**: `git ls-remote --heads origin 'negative-test/*'` no devuelve nada y ningún commit de esas ramas es alcanzable desde `main`. Si cambia el SHA base, solo se repiten los pull requests negativos afectados.
- [ ] T078 Aceptación manual SC-001 en `specs/001-engineering-baseline/acceptance.md`: una persona que, al comenzar el primer recorrido, carece de conocimiento previo, sin ayuda externa y siguiendo solo `README.md` y la documentación enlazada, cronometra el recorrido en el macOS arm64 de referencia desde un clon limpio fijado al SHA base hasta que `/api/health` devuelve 200, y lo repite en Linux x64 sin límite de 30 minutos. El mantenedor puede preparar los requisitos previos, observar y registrar; cualquier explicación o corrección invalida el intento. Registrar los campos de la matriz con seudónimo no reidentificable. Superado solo si macOS tarda menos de 30 minutos, Linux x64 termina con éxito, sin desviaciones y con evidencia registrada. Si no hay persona disponible: **Pendiente**; el pull request permanece abierto y no se integra
- [ ] T079 Aceptación manual SC-004 (pull request) en `specs/001-engineering-baseline/acceptance.md`: sobre el SHA base del pull request de la funcionalidad, usar la ejecución inicial de `quality` y de `security` (mismo SHA) y dos reejecuciones completas (`gh run rerun <id>` sin `--failed`). Esperar a que termine cada intento y no añadir commits entre intentos. Cada uno de los nueve jobs debe concluir con éxito y durar menos de 15 minutos. Un timeout o un fallo no excluido reinicia la serie de tres. Una ejecución cancelada por `concurrency` no cuenta. Una indisponibilidad excluida requiere enlace a la incidencia pública del proveedor. Registrar por workflow el identificador, el número de intento y el SHA, y por cada uno de los nueve jobs `started_at`, `completed_at`, duración y conclusión. Incorporar los enlaces a estas ejecuciones en `acceptance.md`, en la evidencia de SC-004 y en la de SC-006, que así completa la evidencia registrada en T072, y, cuando corresponda, en la descripción del pull request
- [ ] T080 Aceptación manual SC-008 en `specs/001-engineering-baseline/acceptance.md`: una persona que no ha participado en la implementación, y que si también ejecutó SC-001 lo hace después, lee solo `README.md` y `docs/engineering/`, sin explicaciones del mantenedor. Identifica trece resultados: cuatro elementos compuestos de capa (ubicación y responsabilidad correctas) y los nueve nombres exactos de los controles. Registrar un seudónimo no reidentificable, el SHA leído, las respuestas literales y el resultado de los trece elementos. Superado solo con los trece correctos y sin ayuda. Si no hay persona disponible: **Pendiente**; el pull request permanece abierto y no se integra
- [ ] T081 Preparar la integración en `specs/001-engineering-baseline/acceptance.md` y en la descripción del pull request de la funcionalidad:
  - hacer commit de la evidencia recogida (HEAD de evidencia: solo `acceptance.md`);
  - comprobar que los nueve controles están en verde en el último commit;
  - completar en la descripción la lista de comprobación constitucional, las comprobaciones manuales realizadas y el estado de SC-001 a SC-009, con SC-004 y SC-007 de `main` y SC-009 como posteriores a la integración.

  **No integrar** si SC-001 o SC-008 están Pendiente. El pull request permanece abierto. No existe tarea de cierre posterior. No comienza la primera funcionalidad de producto

**Checkpoint**: evidencia previa a la integración registrada, SC-001 y SC-008 Superado, y nueve controles en verde.

---

## Phase 9: Integración, congelación, activación y primer PR posterior

**Purpose**: cumplir la secuencia de FR-026 y SC-009. La integración no inicia la congelación.
La congelación comienza al terminar la primera ejecución satisfactoria del par de workflows
sobre el mismo SHA de `main` y termina al configurar los nueve controles como requeridos. El
primer pull request posterior acepta los ADR y registra la activación.

- [ ] T082 Integrar el pull request de la funcionalidad en `main` solo si SC-001, SC-002, SC-003, la parte de pull request de SC-004, SC-005, SC-006, la parte local de SC-007 y SC-008 están Superado y los nueve controles están en verde, sin eludir la protección básica. Actúa sobre GitHub, sin modificar ficheros. Esta integración **no** inicia la congelación
- [ ] T083 Confirmar el par de workflows disparados por la actualización de `main` sobre el **mismo SHA**: los nueve jobs terminan con éxito. Actúa sobre GitHub, sin modificar ficheros. Si alguno falla, no se activa nada ni se elude: la corrección llega por un pull request normal y esta tarea se repite. Cuando los nueve pasan por primera vez en el mismo SHA, **comienza la congelación**. La ejecución semanal de seguridad no cuenta
- [ ] T084 Activar en la misma sesión administrativa, sin commits intermedios, los nueve nombres como controles requeridos en la regla existente de `main`, con ramas al día, sin actores con elusión, con los administradores sujetos y sin pushes directos ni forzados. Registrar la hora de fin de la primera ejecución satisfactoria y la hora de activación. Si la activación falla, la congelación continúa. Verificarlo con `gh api repos/Informatica-Colectivo-Prime/aulanorma/branches/main/protection` o `gh api repos/Informatica-Colectivo-Prime/aulanorma/rules/branches/main` y con `git log --first-parent --format='%H %cI %s' origin/main`. Durante la congelación no se integra nada, tampoco Dependabot
- [ ] T085 Crear desde `main` actualizado una rama para el primer pull request posterior a la activación, ya sujeto a los controles requeridos (depende de T084)
- [ ] T086 [P] Completar la sección "Registro de activación" de `docs/engineering/branch-protection.md` con la fecha de activación, el enlace a la ejecución de `main` de T083 y la lista de los nueve controles activados (depende de T085)
- [ ] T087 [P] Completar en `specs/001-engineering-baseline/acceptance.md` la evidencia de `main`. SC-004: identificador, intento y `started_at`, `completed_at`, duración y conclusión de los nueve jobs de T083. SC-007: enlace al job `secrets` de T083. SC-009: salidas de T084 con los nueve nombres, sin elusión y sin integraciones entre la primera ejecución satisfactoria y la activación (depende de T085)
- [ ] T088 [P] Cambiar en `docs/adr/0001-architecture-runtime-and-modular-structure.md`, `docs/adr/0002-quality-ci-and-security-strategy.md` y `docs/adr/README.md` el estado de Propuesto a Aceptado, sin alterar el sentido de las decisiones, conforme al ciclo de vida de FR-027 (depende de T085)
- [ ] T089 Abrir el primer pull request posterior a la activación. Actúa sobre GitHub y contiene T086, T087 y T088: registro de activación, evidencia posterior y aceptación de los ADR. Comprobar que los nueve controles aparecen como requeridos y que la integración queda bloqueada mientras no estén en verde, e integrarlo con los nueve en verde. Tras integrarlo termina la secuencia de esta funcionalidad y puede comenzar la primera funcionalidad de producto (depende de T086, T087 y T088)

**Checkpoint**: nueve controles requeridos en `main`, ADR aceptados en el primer PR posterior y
primera funcionalidad de producto aún no iniciada hasta integrar ese PR (SC-009).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (fase 1)**: sin dependencias. T001 (Node.js 24.21.0 instalado) es previo a T004 y T005.
- **Foundational (fase 2)**: depende de la fase 1 y bloquea todas las historias.
- **US1 (fase 3)**: depende de la fase 2. Es el MVP.
- **US2 (fase 4)**: depende de la fase 2. `scripts/negative-checks.mjs` (T053) depende además de la prueba de humo completa de US1 (T031), porque la categoría de construcción ejecuta `check:build`.
- **US3 (fase 5)**: depende de US1 y US2, porque los workflows ejecutan sus comandos.
- **US4 (fase 6)**: los documentos pueden empezar tras la fase 2. T067 depende de T044, T045, T054, T055 y T064 a T066.
- **Polish (fase 7)**: depende de US1 a US4. Orden estricto T068 → T069 → T070 → T071. Los ADR permanecen Propuesto.
- **Aceptación manual (fase 8)**: depende del SHA base fijado en T071, con los workflows ya activos en el pull request (T059). T081 no permite integrar si SC-001 o SC-008 están Pendiente.
- **Integración y posteriores (fase 9)**: orden estricto T082 → T083 → T084 → T085 → (T086, T087 y T088) → T089. No hay tarea de cierre posterior de SC-001 ni SC-008.

### User Story Dependencies

- **US1 (P1)**: independiente tras la fase 2.
- **US2 (P1)**: independiente tras la fase 2, salvo T053, que necesita T031.
- **US3 (P1)**: necesita los comandos de US1 y US2.
- **US4 (P2)**: su documentación es independiente. Su activación de la protección ocurre en la fase 9.

### Within Each User Story

- Las pruebas se escriben primero y fallan antes de la implementación.
- En US1: plataforma (config, logging, version y health) → frontera HTTP (decisión y estado de conexión) → API Route y `next.config.ts` → `server.mjs` → preflight → documentación.
- En US2: herramientas binarias → envoltorios de seguridad → pruebas negativas → documentación.

### Camino crítico

T001 → T004 → T005 → T006 → T019 → T033 → T037, T038 y T040 → T041 y T042 → T025, T026 y T029 a T032 en verde → T047 → T051 → T053
→ T056 → T059 → T067 → T068 → T071 (SHA base; ADR Propuesto) → T078 y T080 Superado → T081 →
T082 → T083 (inicio de congelación) → T084 → T085 → T086, T087 y T088 → T089.

---

## Parallel Opportunities

- **Fase 1**: T002 y T003 en paralelo; tras T005, T006, T007, T008 y T009 en paralelo.
- **Fase 2**: T010 a T018 en paralelo; T019 cierra la fase.
- **US1**: T020 a T025, T027, T028 y T032 en paralelo; T026 y T029 a T031 amplían después, en secuencia, el mismo fichero que T025. En la implementación, T033, T034, T035, T038, T039 y T043 en paralelo; T040 tras T038 (mismo fichero); T041 tras T040; y T045 en cualquier momento de la fase.
- **US2**: T046, T048, T049 y T050 en paralelo; T052 en paralelo con T051; T054 tras T053, porque registra los datos que esta fija; T055 en paralelo con cualquiera de ellas.
- **US3**: T057 y T058 en paralelo con T056.
- **US4**: T060 a T066 en paralelo.
- **Fase 7**: secuencia estricta; sin aceptación de ADR.
- **Fase 9**: T086, T087 y T088 en paralelo tras T085.

## Parallel Example: User Story 1

```bash
# Pruebas de US1, todas a la vez (deben fallar):
Task: "Escribir tests/unit/platform/config.test.ts"
Task: "Escribir tests/unit/platform/logging.test.ts"
Task: "Escribir tests/unit/platform/health.test.ts"
Task: "Escribir tests/contract/health.contract.test.ts"
Task: "Escribir tests/unit/platform/http-boundary.test.ts"
Task: "Escribir tests/unit/platform/http-boundary-connection.test.ts"
Task: "Escribir tests/unit/platform/http-boundary-request.test.ts"
Task: "Escribir tests/architecture/entry-points.test.ts"
Task: "Escribir la parte de producción de scripts/smoke-test.mjs"

# Implementación de plataforma, frontera y configuración independientes:
Task: "Crear src/platform/config/index.ts"
Task: "Crear src/platform/logging/index.ts"
Task: "Crear src/platform/version/index.ts"
Task: "Crear src/platform/http-boundary/index.ts (decisión de la frontera)"
Task: "Crear next.config.ts"
Task: "Crear .env.example"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar la fase 1 (Setup).
2. Completar la fase 2 (Foundational).
3. Completar la fase 3 (US1).
4. **Parar y validar**: `npm run check:test` y `npm run check:build` en verde, y los pasos 1 a 4 del quickstart reproducidos con `README.md`.

### Incremental Delivery

1. Setup y Foundational: base lista.
2. US1: arranque en los dos modos y comprobación de estado (MVP).
3. US2: comandos locales de las ocho categorías y pruebas negativas locales.
4. US3: nueve controles en la integración continua y pull request de la funcionalidad.
5. US4: documentación de estructura, controles y protección.
6. Verificación contra los ADR Propuesto, revisión documental, esqueleto de `acceptance.md` y SHA base (fase 7).
7. Aceptación manual sobre el SHA base; SC-001 y SC-008 Superado obligatorios (fase 8).
8. Integración, primera ejecución satisfactoria (inicio de congelación), activación y primer PR posterior que acepta los ADR (fase 9).

---

## Notes

- `[P]` indica fichero distinto y sin dependencias de tareas incompletas.
- `verify:negative` y las mediciones de SC-001 a SC-009 no se ejecutan en ningún workflow ni se añaden a los controles requeridos.
- Solo datos sintéticos. Nunca secretos reales, dependencias maliciosas no controladas ni datos personales reales en el repositorio ni en `acceptance.md`.
- Fuera de alcance: persistencia, interfaz visible, usuarios, autenticación, PDF, normativa, IA, Moodle y despliegue en producción.
- Flujo Spec Kit (constitución 1.1.0, funcionalidad crítica): después de este documento, `/speckit-analyze`, `/speckit-implement` y `/speckit-converge`.
