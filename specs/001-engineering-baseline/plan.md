# Implementation Plan: Base de ingeniería de AulaNorma

**Branch**: `001-engineering-baseline` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-engineering-baseline/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Crear la base de ingeniería de AulaNorma antes de la primera funcionalidad de producto. La base
tiene cuatro piezas:

- una aplicación mínima con un único endpoint de estado consultable por máquina y ninguna otra
  ruta, página ni interfaz;
- una organización del código en las cuatro capas de la constitución, con límites forzados
  automáticamente;
- un conjunto único de comandos npm de calidad y seguridad para **ocho categorías de control**;
- una integración continua en GitHub Actions que ejecuta esos mismos comandos en macOS y Linux,
  con permisos mínimos y sin secretos del proyecto, mediante **nueve controles requeridos**: uno
  por categoría y `macos-quality`, que verifica la plataforma sin ser una categoría más.

**Enfoque técnico**, confirmado o corregido en [research.md](./research.md):

- Next.js 16.3.6 con **Pages Router** como monolito modular: una única API Route,
  `src/pages/api/health.ts`, detrás de un servidor personalizado mínimo, `server.mjs`, que
  aplica la frontera HTTP antes de delegar en Next.js (research.md, R1). Sin App Router
  operativo. Con npm, sobre Node.js 24 LTS: 24.21.0 es la versión reproducible de referencia y
  de la integración continua (`.node-version`), y el rango soportado para desarrollo es
  `>=24.21.0 <25` (`devEngines`, y `engines` con `engine-strict`).
- TypeScript **6.0.3** estricto, en lugar de 7: `typescript-eslint` no admite TypeScript 7.
- Zod para la configuración, Pino para los registros JSON y Vitest para las pruebas.
- ESLint 10 plano, **sin** `eslint-config-next`, y Prettier.
- **Gitleaks como CLI fijada por SHA-256**: la acción oficial exige una licencia guardada como
  secreto en organizaciones. Un envoltorio examina el historial del commit y el árbol de
  trabajo sin ficheros ignorados.
- `npm audit` con un envoltorio de excepciones y zizmor para la seguridad de los workflows.

**Arranque** (research.md, R8): `npm run dev` y `npm start` son los **únicos puntos de
entrada**. Ambos ejecutan
`NODE_ENV=<entorno> node scripts/preflight.mjs <modo> && NODE_ENV=<entorno> node server.mjs`:
los dos procesos reciben `NODE_ENV` por separado, porque una asignación delante de un comando no
alcanza al que sigue a `&&`. El **preflight común** llama a `loadConfig` de
`src/platform/config` con el modo explícito (`development` en `dev`, `production` en `start`).
`loadConfig` no deduce el modo del `NODE_ENV` heredado: exige que coincida con el solicitado y, si
no coincide, falla cerrado antes de cargar ningún fichero y sin mostrar el valor recibido, así que
un modo discordante nunca llega a escuchar. Después carga los ficheros `.env*` con `@next/env`, el
mismo cargador y la misma versión que Next.js, siempre con recarga forzada, para no reutilizar un
resultado en caché, y con un logger controlado que descarta todo lo que el cargador intente
escribir: ninguna ruta, nombre de fichero `.env`, mensaje original ni traza puede salir, y
cualquier error de carga se convierte en un único problema genérico. Por último valida con el
esquema Zod; si falla, termina con código 1 antes de que `server.mjs` arranque, así que el puerto
nunca se abre. El preflight nunca registra `startup.completed`. `server.mjs` vuelve a validar con
la misma función, `loadConfig`, antes de escuchar, porque la necesita para crear el logger; si no obtiene una configuración válida, termina con el
mismo fallo cerrado antes de escuchar, y si la obtiene registra `startup.completed` **exactamente
una vez**, después de validar y de empezar a escuchar. Esa defensa interna no convierte
`node server.mjs` directo en un punto de entrada admitido. `next dev` y
`next start` directos **no están admitidos**, porque eludirían la frontera HTTP. No existe
`instrumentation.ts`. Aplicar un cambio de `.env*` exige reiniciar; no se promete la recarga en
caliente de la configuración.

**Frontera HTTP y ausencia de interfaz** (research.md, R1): `server.mjs` escucha en
`127.0.0.1:3000`, fijos, y decide cada petición antes de Next.js con la lógica portable de
`src/platform/http-boundary/index.ts`. Precedencia: **versión → `Host` → destino → método →
cuerpo**. Solo el destino crudo exacto `/api/health` con `GET`, `HEAD` u `OPTIONS` se delega,
mediante una única llamada a `handle(req, res)`. Todo lo demás recibe un rechazo cerrado sin
cuerpo. Ninguna página HTML se sirve en la superficie HTTP, aunque la compilación genere las
páginas de error del framework: la frontera nunca delega sus rutas. No hay comodín, reescrituras,
middleware ni `proxy.ts`.

"Frontera HTTP" y "frontera de transporte" designan el mismo componente: la especificación usa
el término neutral "frontera de transporte" y los artefactos técnicos usan "frontera HTTP".

**Evidencia de viabilidad** (research.md, R1): una prueba formal desechable fuera del
repositorio, con Node.js 24.21.0, npm 11.19.0 y Next.js 16.3.6 en macOS arm64, compiló limpio
y superó el humo (36 casos y 42 peticiones), la matriz completa (1531 casos y 1574
peticiones) y el calentamiento y humo de desarrollo. El resultado: 0 respuestas HTML, 0
filtraciones, 0 cabeceras del framework, 0 redirecciones, 0 errores 500 inesperados,
equivalencia contractual entre desarrollo y producción y 0 diferencias inesperadas frente a la
exploración con Node.js 24.13.0. Es **evidencia de viabilidad, no aceptación**: la
implementación DEBE reproducirla con Node.js 24.21.0, las dependencias aprobadas, el preflight,
la configuración real y el mismo SHA candidato (`check:build` y `acceptance.md`).

## Technical Context

**Language/Version**: TypeScript 6.0.3 (estricto) sobre Node.js 24 LTS (research.md, R2):

- **Versión reproducible de referencia y de la integración continua**: Node.js **24.21.0**,
  fijada en `.node-version`. `actions/setup-node` la lee con `node-version-file`, y las
  mediciones de aceptación se realizan obligatoriamente con ella.
- **Rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`. Lo aplican dos mecanismos
  con los mismos rangos, Node.js `>=24.21.0 <25` y npm `>=11.19.0 <12`:
  - `devEngines.runtime` y `devEngines.packageManager`, con `onFail: "error"`, que aplica
    npm 11;
  - `engines` en `package.json` con `engine-strict=true` en `.npmrc`, que cubre los clientes que
    no aplican `devEngines`, como npm 10.

  `npm ci` rechaza las versiones fuera del rango antes de instalar, no cualquier versión
  distinta de 24.21.0. Se verificó el rechazo de 24.13.0 con npm 11.6.2 (`EBADDEVENGINES`) y de
  20.20.0 con npm 10.8.2 (`EBADENGINE`). Node.js 26 queda excluido por el rango, pero no se ha
  ejecutado en esta validación.
- El rango de npm es coherente con el de Node.js: como mínimo la versión de npm incluida con
  24.21.0 (11.19.0) y por debajo de la siguiente versión mayor.
- **TypeScript ejecutado por Node.js** (research.md, R4): `tsconfig.json` DEBE declarar
  `noEmit: true`, `allowJs: true`, `allowImportingTsExtensions: true` y
  `erasableSyntaxOnly: true`, e incluir `server.mjs` en la comprobación; `server.mjs` lleva
  `// @ts-check`. Los módulos TypeScript que Node.js ejecuta directamente (`config`, `logging` y
  `http-boundary`) se limitan a sintaxis borrable. Es una obligación de diseño aún no
  demostrada: T006 y T041 la verifican con `node --check` y `tsc` durante la implementación.

**Primary Dependencies**:

- Ejecución: `next` 16.3.6, `react` 19.3.0 y `react-dom` 19.3.0 (dependencias pares de Next.js),
  `zod` 4.6.5, `pino` 10.3.1 y `@next/env` 16.3.6. `@next/env` es el cargador de ficheros `.env`
  de Next.js, que el preflight usa para cargarlos con la misma semántica. Su versión es siempre
  idéntica a la de `next` (research.md, R8).
- Desarrollo: `typescript` 6.0.3, `eslint` 10.11.0, `@eslint/js` 10.0.1,
  `typescript-eslint` 8.70.1, `prettier` 3.9.9, `vitest` 5.0.2, `vite` 8.3.1,
  `@types/node` (última 24.x) y `@types/react` 19.3.0.
- Binarios fijados por SHA-256: `gitleaks` 8.30.1 y `zizmor` 1.30.1.

Todas las versiones npm se fijan de forma exacta (`save-exact=true`).

**Storage**: N/A. Sin persistencia (FR-007).

**Testing**: Vitest 5 en entorno Node, con bloqueo de red. La frontera HTTP se prueba en
unitarias con un `handle` inyectado. Además, una prueba de humo con un script de Node sin
dependencias arranca el servidor real con `npm start` y con `npm run dev` (en una copia
temporal) y lo recorre con un cliente TCP crudo: matriz negativa, equivalencia entre modos y
auditoría de registros. No arranca `next start` ni `next dev` directos, que no están admitidos.

**Target Platform**: servidor Node.js. Los **perfiles verificados** son exactamente dos: macOS
arm64 del mantenedor y Linux x64 de la integración continua y de la aceptación. Otras
arquitecturas pueden funcionar, pero no se declaran verificadas. Windows solo mediante WSL,
sin verificación.

**Project Type**: aplicación web, como monolito modular de una sola unidad desplegable. En esta
funcionalidad no tiene interfaz visible.

**Performance Goals**: comando agregado local en menos de 10 minutos en el entorno de referencia
(SC-002); cada job de integración continua en menos de 15 minutos (SC-004). La estimación es de
menos de 4 y menos de 8 minutos, respectivamente (research.md, R15).

**Constraints**: sin llamadas externas en ejecución ni en pruebas, sin secretos, sin
autenticación, sin interfaz y sin persistencia. Escucha fija en `127.0.0.1:3000`: no se leen
`HOSTNAME`, `PORT` ni claves nuevas de entorno. Las pruebas solo pueden usar otro puerto dentro
de su propio arnés. Una futura exposición o despliegue exige una decisión nueva.

**Scale/Scope**: un endpoint, una frontera HTTP, cuatro módulos de capa vacíos, un módulo de
plataforma, ocho categorías de control, nueve controles requeridos en la integración continua y
dos sistemas operativos verificados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Evaluación inicial (antes de la Fase 0)

| # | Puerta constitucional | Estado | Evidencia |
|---|-----------------------|--------|-----------|
| 1 | Procedencia normativa (I) | **N/A** | No se procesa normativa (FR-007). FR-028 prohíbe incluir documentos normativos sin procedencia. |
| 2 | Cuatro capas y contratos (II) | **Cumple** | FR-023 exige cuatro ubicaciones con reglas de dependencia. |
| 3 | Publicación solo con aprobación (III) | **N/A** | No hay contenido publicable ni integración con Moodle (FR-007). |
| 4 | Salidas validadas por esquema (IV) | **Cumple (aplicación parcial)** | No hay salidas de IA. La configuración y la respuesta de estado tienen esquema y validación (FR-005 y FR-006). |
| 5 | Mínimo privilegio, secretos, archivos, acceso y auditoría (V) | **Cumple en diseño; pendiente de implementación y aceptación** | C1 a C7 se declaran en FR-006 y FR-009 con pruebas objetivas. C6 se resuelve en diseño con Pages Router y una frontera HTTP previa a Next.js, que no emite `Vary` del framework y solo admite `Vary: Accept-Encoding`. La evidencia externa demuestra viabilidad, no aceptación de código inexistente: la implementación DEBE repetirla con el SHA candidato. El resto del principio V sí está cubierto. |
| 6 | Publicación idempotente (VI) | **N/A** | No hay publicación en Moodle. |
| 7 | Porción vertical pequeña; nada de UF0517 ni ADGG0408 (VII) | **Cumple** | FR-024; alcance limitado por la aclaración 1. |
| 8 | Pruebas obligatorias (VIII) | **Cumple** | FR-011 a FR-013 y SC-003 a SC-005. Las áreas de lógica normativa, publicación y aprobación son N/A. |
| 9 | IA mediante adaptadores y con control de costes (IX) | **N/A** | No hay IA (FR-007). |
| 10 | Accesibilidad y lenguaje claro (X) | **N/A (interfaz)** | Sin interfaz visible (FR-009). La documentación se redacta en español claro (FR-025). |
| 11 | Registro de generaciones, revisiones, publicaciones y decisiones (XI) | **Cumple** | Esta funcionalidad no contiene generación mediante IA, no crea elementos formativos y no publica cursos ni contenidos; por ello todavía no existen métricas de calidad pedagógica, trazabilidad de generación ni correlación de publicaciones que aplicar. La consulta técnica de estado no genera identificador de correlación ni registro por petición, por el contrato cerrado de la excepción (FR-006 C4 y FR-008). `startup.completed` solo proporciona observación del arranque. Cualquier futura operación de negocio, IA o publicación deberá introducir las métricas, la correlación y la trazabilidad que exige el principio XI. FR-027 registra las decisiones mediante ADR. |
| 12 | Complejidad justificada (XII) | **Cumple** | Sin decisiones de infraestructura en la especificación; las herramientas se justifican en la Fase 0 y los ADR. La frontera HTTP propia es complejidad añadida y se justifica en Complexity Tracking. |

**Resultado**: todas las puertas se superan. La puerta 5 **cumple en diseño y queda pendiente
de implementación y aceptación**: la prueba desechable de C6 demuestra que el diseño es
viable, pero no acepta código que aún no existe. La implementación y `acceptance.md` DEBEN
reproducir esa evidencia con Node.js 24.21.0 sobre el SHA candidato.

### Reevaluación tras el diseño (Fase 1)

| # | Puerta | Estado | Evidencia en el diseño |
|---|--------|--------|------------------------|
| 1 | Procedencia normativa (I) | **N/A** | El repositorio no contiene normativa. La detección de secretos y la revisión del pull request verifican que no se añada. |
| 2 | Cuatro capas (II) | **Cumple** | `src/modules/{normative-source, structured-interpretation, didactic-content, moodle-publication}` con `index.ts` público y `README.md`. Matriz de dependencias en [data-model.md](./data-model.md#matriz-de-dependencias-entre-capas), forzada con `no-restricted-imports` y verificada en `tests/architecture/import-boundaries.test.ts`. La entrega (`server.mjs` y `src/pages/api/health.ts`) solo puede importar las API públicas de `src/platform`; no importa ninguna capa de dominio. |
| 3 | Aprobación docente (III) | **N/A** | No hay rutas de publicación. |
| 4 | Esquemas (IV) | **Cumple** | Un único esquema Zod de configuración, usado por el preflight, por `server.mjs` y por la ruta de estado. Contrato [health.openapi.yaml](./contracts/health.openapi.yaml) con `additionalProperties: false`, verificado en una prueba de contrato y en la prueba de humo. Los errores nunca se corrigen en silencio: el preflight termina con código 1 antes de arrancar `server.mjs`. |
| 5 | Seguridad (V) | **Cumple en diseño; pendiente de implementación y aceptación** | C1 a C7 tienen trazabilidad en la tabla de FR-006 y en el contrato. C6: la frontera HTTP de `server.mjs` impide que Next.js atienda cualquier destino distinto de `/api/health`, y la API Route del Pages Router no emite `Vary` del framework; solo se admite `Vary: Accept-Encoding` (research.md, R1). La evidencia formal desechable con Node.js 24.21.0 demuestra viabilidad, no aceptación: T029 a T031 y `acceptance.md` la repiten sobre el SHA candidato. El resto del principio V (secretos, plantilla, permisos, `persist-credentials: false`) sí está cubierto. |
| 6 | Idempotencia (VI) | **N/A** | — |
| 7 | Porción vertical (VII) | **Cumple** | Un solo endpoint. `tests/architecture/no-domain-specifics.test.ts` busca los códigos de certificado en `src/`, `tests/`, `scripts/` y la configuración, construyendo el patrón a partir de fragmentos para que el propio test no los contenga. |
| 8 | Pruebas (VIII) | **Cumple** | Estrategia de pruebas más abajo: configuración, arranque en ambos modos, contrato, frontera HTTP y estado de conexión, matriz negativa por TCP crudo, equivalencia entre modos, auditoría de registros, entradas no admitidas, campos adicionales, límites y determinismo. Una prueba negativa local y un pull request negativo por cada una de las ocho categorías. |
| 9 | IA (IX) | **N/A (preparado)** | Las reglas de lint prohíben `fetch` y los módulos de red en `src/`. Cualquier llamada externa futura tendrá que pasar por un adaptador explícito. |
| 10 | Accesibilidad (X) | **N/A (interfaz)** | La frontera HTTP responde 404 cerrado, sin cuerpo, a todo destino distinto de `/api/health`, así que ninguna página HTML se sirve en la superficie HTTP, tampoco las páginas de error del framework. La documentación está en español claro. |
| 11 | Observabilidad (XI) | **Cumple** | Esta funcionalidad no contiene generación mediante IA, no crea elementos formativos y no publica cursos ni contenidos; por ello todavía no existen métricas de calidad pedagógica, trazabilidad de generación ni correlación de publicaciones que aplicar. La consulta técnica de estado no genera identificador de correlación ni registro por petición, por el contrato cerrado de la excepción (FR-006 C4 y FR-008). `startup.completed` solo proporciona observación del arranque. Cualquier futura operación de negocio, IA o publicación deberá introducir las métricas, la correlación y la trazabilidad que exige el principio XI. FR-027 registra las decisiones mediante ADR. Diseño: Pino en JSON con `service` y `environment`; solo eventos de arranque; sin `requestId` ni registro por consulta, rechazo o respuesta de transporte en ningún modo (`logging.incomingRequests.ignore` y `server.mjs` sin registros por petición); redacción de campos sensibles; ADR 0001 y 0002. |
| 12 | Simplicidad (XII) | **Cumple con complejidad justificada** | Una unidad desplegable; sin base de datos, contenedores ni servicios adicionales. Cada herramienta está justificada en research.md (R1 a R15), y las decisiones de consecuencias operativas, en los ADR 0001 y 0002. Dos binarios externos (Gitleaks y zizmor) justificados en R11 y R13. `@next/env` ya forma parte de Next.js; se declara directamente para usarlo en el preflight (R8). El servidor personalizado mínimo es la única complejidad nueva y se justifica en Complexity Tracking. |

**Resultado**: todas las puertas se superan. La puerta 5 **cumple en diseño y queda pendiente
de implementación y aceptación**: la evidencia externa demuestra la viabilidad de la
arquitectura, no la aceptación de un código que aún no existe. La obligación de repetir esa
prueba con la implementación real y el commit candidato se mantiene (T029 a T031, `check:build`
y `acceptance.md`). Complexity Tracking justifica el servidor personalizado.

## Project Structure

### Documentation (this feature)

```text
specs/001-engineering-baseline/
├── spec.md                  # Especificación aclarada
├── plan.md                  # Este documento
├── research.md              # Fase 0: decisiones y evidencia
├── data-model.md            # Fase 1: sin entidades persistentes
├── quickstart.md            # Fase 1: recorrido reproducible
├── contracts/
│   └── health.openapi.yaml  # Fase 1: contrato de la comprobación de estado
├── checklists/
│   ├── requirements.md          # Calidad de la especificación
│   ├── security-governance.md   # Lista de seguridad y gobernanza
│   └── ci-acceptance.md         # Lista de integración continua y aceptación
├── acceptance.md            # (implementación) evidencia de SC-001 a SC-009 (matriz de aceptación)
└── tasks.md                 # Fase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
.github/
├── workflows/
│   ├── quality.yml               # Jobs: format, lint, types, test, build, macos-quality
│   └── security.yml              # Jobs: secrets, dependencies, workflows
└── dependabot.yml                # npm y github-actions, semanal

docs/
├── adr/
│   ├── README.md                 # Índice y formato de los ADR
│   ├── 0001-architecture-runtime-and-modular-structure.md
│   └── 0002-quality-ci-and-security-strategy.md
└── engineering/
    ├── architecture.md           # Capas, responsabilidades y matriz de dependencias
    ├── quality-controls.md       # Ocho categorías, nueve controles, comandos y pruebas negativas
    ├── branch-protection.md      # Controles requeridos y procedimiento de activación
    ├── reference-environment.md  # Entorno de referencia (FR-001a)
    └── security-exceptions.md    # Registro de excepciones de secretos (huellas de ambos modos)

scripts/
├── preflight.mjs                 # Carga .env* con @next/env y valida antes de server.mjs
├── smoke-test.mjs                # Arranque real en ambos modos; matriz TCP cruda, equivalencia y registros
├── check-secrets.mjs             # Gitleaks: historial alcanzable, índice de Git y árbol no ignorado
├── check-dependencies.mjs        # npm audit con umbral, excepciones y firmas
├── negative-checks.mjs           # Pruebas negativas automatizadas en una copia temporal
└── tools/
    ├── install-tools.mjs         # Instala gitleaks y zizmor verificando SHA-256
    └── tools.lock.json           # Versiones y SHA-256 por plataforma

security/
└── audit-exceptions.json         # Excepciones de dependencias (vacío)

src/
├── pages/
│   └── api/health.ts             # API Route: GET y HEAD 200, OPTIONS 204, 405 defensivo y 500 cerrado
├── platform/                     # API pública: el index.ts de cada área
│   ├── config/index.ts           # Módulo portable: esquema Zod, validateConfig, loadConfig y readRuntimeConfig
│   ├── logging/index.ts          # Módulo portable: logger Pino con redacción y destino inyectable
│   ├── http-boundary/index.ts    # Módulo portable: decisión de la frontera y estado de conexión
│   ├── health/index.ts           # Construcción del estado { status, version }
│   └── version/index.ts          # Versión desde package.json
└── modules/
    ├── normative-source/         # index.ts (vacío) + README.md
    ├── structured-interpretation/
    ├── didactic-content/
    └── moodle-publication/

tests/
├── setup/no-network.ts           # Bloqueo de red en todas las pruebas
├── unit/platform/                # Configuración, registros, estado y frontera HTTP
│   ├── http-boundary.test.ts             # Precedencia, destino, método y rechazo cerrado
│   ├── http-boundary-connection.test.ts  # Estado de conexión, diferidos, CONNECT y Upgrade
│   └── http-boundary-request.test.ts     # Versión, Host, rawHeaders, cuerpo y framing
├── contract/
│   └── health.contract.test.ts
└── architecture/
    ├── import-boundaries.test.ts
    ├── no-domain-specifics.test.ts
    ├── public-routes.test.ts        # Una única ruta pública
    ├── entry-points.test.ts         # Sin entradas directas, rewrites, middleware ni proxy
    └── dependency-versions.test.ts  # @next/env y next con la misma versión exacta

.env.example                      # Plantilla documentada, valores ficticios válidos
.gitleaksignore                   # Huellas de excepciones (vacío)
.node-version                     # 24.21.0: referencia, CI y aceptación
.npmrc                            # ignore-scripts, save-exact, fund=false
.prettierignore
eslint.config.mjs
next.config.ts                    # poweredByHeader: false, images.unoptimized, logging.incomingRequests.ignore
package.json / package-lock.json  # "type": "module"
prettier.config.mjs
server.mjs                        # // @ts-check; adaptador mínimo: frontera HTTP y una llamada a handle
tsconfig.json                     # allowJs; comprueba server.mjs mediante // @ts-check
vitest.config.ts
README.md                         # Visión general y enlace al recorrido
CONTRIBUTING.md                   # Ramas, pull requests, flujo Spec Kit y Definition of Done
SECURITY.md                       # Notificación y procedimiento ante un secreto expuesto
```

Cambios en `.gitignore`: añadir `next-env.d.ts`, `.tools/` y `*.tsbuildinfo`.

**Structure Decision**: un único proyecto Next.js en la raíz del repositorio. La capa de
entrega HTTP son `server.mjs` y `src/pages/api/health.ts` y, en esta funcionalidad, **solo
importan las API públicas de `src/platform`**. No existen `src/app`, `middleware.ts`,
`proxy.ts` ni `instrumentation.ts`. `src/platform` contiene lo transversal.
`src/modules/<capa>` hace visibles las cuatro capas del principio II, con nombres en inglés,
vacías y sujetas solo a la dirección
de dependencias de la constitución. La primera porción vertical de producto definirá sus
puntos de entrada y ampliará las dependencias de la entrega solo si lo justifica. No hay
directorios `frontend/` ni `backend/` separados (principio XII y ADR 0001).

**Configuración de Next.js** (`next.config.ts`, research.md R1):

- `poweredByHeader: false`;
- `images.unoptimized: true`, que desactiva el optimizador de imágenes de `/_next/image`;
- `logging.incomingRequests.ignore: [/^\/api\/health$/]`, que desactiva el registro automático
  de la única URL que la frontera delega, en ambos modos (FR-008);
- ninguna otra opción: sin `rewrites`, `headers`, `redirects`, middleware ni `proxy`.

**Frontera HTTP** (`server.mjs` y `src/platform/http-boundary/index.ts`, research.md R1):

- `src/platform/http-boundary/index.ts` es un **módulo portable**: TypeScript borrable de forma
  nativa por Node.js 24, sin `enum`, `namespace` ni sintaxis que requiera transformación; sin
  importaciones relativas ni `@/`; no importa `node:http` en ejecución (solo `import type`).
  Contiene la decisión de la frontera y el estado de conexión, y se prueba con un `handle`
  inyectado.
- `server.mjs` queda en la raíz como **adaptador mínimo** con `// @ts-check`:
  - crea el servidor con `http.createServer({ requireHostHeader: false }, …)`, para que la
    validación de `Host` la haga la frontera y su rechazo quede contabilizado en el estado de
    conexión;
  - escucha en `127.0.0.1:3000`, fijos; solo lee `process.env.NODE_ENV` para elegir el modo, y
    no lee `HOSTNAME`, `PORT` ni claves nuevas;
  - conecta `request`, `checkContinue`, `checkExpectation`, `connect`, `upgrade` y
    `clientError` con la frontera;
  - hace **una única llamada** a `handle(req, res)`;
  - si `handle` rechaza antes de enviar cabeceras, responde el mismo 500 cerrado; si ya se
    inició una respuesta, no intenta escribir un segundo estado y destruye la conexión;
  - usa `loadConfig` de `src/platform/config` como primer paso, antes de crear la aplicación
    de Next.js, y solo lee directamente `process.env.NODE_ENV`: pide `development` si vale
    exactamente `development` y `production` en cualquier otro caso, y `loadConfig` comprueba la
    concordancia, así que un valor ausente o distinto falla cerrado antes de escuchar; no
    reconstruye la lista de problemas ni lee otras claves;
  - importa legítimamente `node:http`, `next` y la capa de configuración que encapsula
    `@next/env`; de `src/platform` solo importa módulos portables y sin efectos secundarios de
    infraestructura;
  - no usa propiedades privadas de Node.js, no registra nada por petición y no contiene
    instrumentación de diagnóstico.
- **Precedencia**: versión → `Host` → destino → método → cuerpo (FR-009):

  | Estado | Causa |
  |--------|-------|
  | 400 | Versión, `Host` o framing malformados que el analizador HTTP de Node.js rechaza (`clientError`); `Host` inválido; cuerpo no permitido |
  | 404 | Destino crudo distinto de `/api/health`; `CONNECT` o `Upgrade` hacia otro destino |
  | 405 | Método distinto de `GET`, `HEAD` u `OPTIONS` en la ruta exacta; `CONNECT` o `Upgrade` hacia `/api/health` |
  | 505 | Versión analizada pero distinta de HTTP/1.0 y HTTP/1.1 |
  | 500 | Fallo capturado dentro del manejador de la API Route antes de iniciar la respuesta, o rechazo de `handle` antes de enviar cabeceras. Si la respuesta ya empezó, se destruye la conexión sin segundo estado. Los errores internos de Next.js anteriores a la entrada en el manejador no están cubiertos (research.md, K25) |

  Todos los rechazos emitibles tienen cuerpo vacío, `Cache-Control: no-store`,
  `Content-Length: 0` y `Connection: close`; `Allow: GET, HEAD, OPTIONS` solo en 405.
- **`Accept-Encoding` y `Vary`**: la frontera no inspecciona `Accept-Encoding`. Next.js, como
  entorno HTTP subyacente, puede procesar ese metadato protocolario de la petición delegada sin
  conservarlo, registrarlo, reflejarlo ni entregarlo a la operación. En el comportamiento
  aprobado solo provoca `Vary: Accept-Encoding` en los 200; la respuesta se entrega sin
  `Content-Encoding`, que está prohibido. Esa `Vary` refleja el comportamiento observado y
  cerrado de Next.js, no una promesa de compresión ni de variación efectiva del cuerpo.
- **Estado de conexión** (transitorio, en memoria, por socket):
  - después de un rechazo no se delega ni se responde otra petición del socket;
  - `clientError` nunca genera una segunda respuesta;
  - los errores se difieren mientras haya respuestas legítimas pendientes;
  - después terminan en *flush* (400 cerrado al terminar la última pendiente) o en *dropped*
    (descartado si el socket se cierra antes); `ECONNRESET` descarta el diferido;
  - `checkContinue` y `checkExpectation` pasan por la misma frontera, sin 100 ni 417
    automáticos;
  - `CONNECT` y `Upgrade` se rechazan de forma cerrada.
- **API Route** (`src/pages/api/health.ts`): `GET` y `HEAD` responden 200 con el cuerpo del
  contrato, `Content-Type: application/json` y `Cache-Control: no-store`; `OPTIONS` responde 204
  con cuerpo vacío, `Allow: GET, HEAD, OPTIONS` y `no-store`; cualquier otro método recibe un
  405 defensivo. El módulo no hace ningún trabajo falible al evaluarse: dentro del `try` de cada
  manejo llama a `readRuntimeConfig()` y, si el resultado es correcto, obtiene la versión con el
  módulo `version`. Si el resultado es un fallo, responde el 500 cerrado. No llama a
  `loadConfig`, no lee `process.env`, no registra problemas ni valores y no conserva datos de la
  petición. Si ocurre un fallo dentro del manejador
  y todavía no se ha iniciado la respuesta, responde 500 con cuerpo vacío, `no-store`,
  `Content-Length: 0` y `Connection: close`; nunca delega en Next.js la construcción de un
  error de salud. Los errores internos de Next.js anteriores a la entrada en el manejador (por
  ejemplo, un fallo al cargar o compilar el módulo) no pueden convertirse retrospectivamente en
  ese 500 cerrado: los mitigan la compilación obligatoria, el preflight, el módulo sin
  inicialización falible y las pruebas negativas (research.md, K25). Un commit candidato solo es
  aceptable tras superar compilación, preflight y esas pruebas.
- **`OPTIONS` y C1–C7**: el 204 de `OPTIONS` es de solo lectura, no accede a datos de negocio
  ni personales, no usa persistencia ni servicios externos, no cambia el estado de negocio,
  tiene un contrato cerrado, no revela información interna y está declarado y probado. Cumple
  por sí mismo C1 a C7 como transporte de la misma excepción, no crea una operación de producto
  y no figura en `paths` del contrato.
- **Interfaz de configuración** (`src/platform/config/index.ts`, research.md R6 y R8). Tres
  operaciones que devuelven la misma unión discriminada,
  `{ ok: true, config }` (configuración inmutable) u `{ ok: false, problems }`
  (`readonly { key, problem }[]`, nunca con valores). Ninguna registra valores:
  - `validateConfig(source)`: función pura sobre una fuente inyectada; no lee `process.env`;
  - `loadConfig(mode)`: recibe explícitamente `development` o `production` y nunca deduce el
    modo del `NODE_ENV` heredado. Si `process.env.NODE_ENV` no coincide con el modo, devuelve
    `{ key: "NODE_ENV", problem: "mode_mismatch" }` antes de cargar ningún fichero y sin el valor
    recibido. Si coincide, llama a `loadEnvConfig` de `@next/env` con `dev` verdadero solo en
    `development`, `forceReload = true` y el logger controlado privado de `src/platform/config`,
    de modo que nunca selecciona `.env.test` ni reutiliza la caché del cargador; si el logger
    marca un error de carga o el cargador lanza una excepción, devuelve solo
    `{ key: "environment", problem: "env_load_failed" }`. Después lee `process.env` y delega en
    `validateConfig`. No devuelve ni registra lo que devuelve el cargador. La usan
    `scripts/preflight.mjs` y `server.mjs` antes de escuchar;
  - `readRuntimeConfig()`: no vuelve a cargar ficheros `.env*`, no llama a `@next/env` ni usa
    `forceReload`; lee el `process.env` del proceso, ya preparado antes de escuchar, ignora las
    claves ajenas al esquema, incluido el marcador interno `__NEXT_PROCESSED_ENV`, y delega en
    `validateConfig`. La
    usa la API Route dentro del `try` de cada manejo, nunca al evaluar el módulo. No depende de
    compartir ninguna instancia en memoria con `server.mjs`: solo de que `process.env`
    pertenece al proceso. Los cambios de `.env*` siguen exigiendo reinicio.

  Solo `src/platform/config` lee claves de `process.env`; `server.mjs` solo lee
  `process.env.NODE_ENV`.

## Comandos npm

Todos los comandos se ejecutan igual en local y en la integración continua (FR-016). Los que
llaman a Next.js, directamente o mediante `server.mjs`, incluyen `NEXT_TELEMETRY_DISABLED=1`.
`dev` y `start` son los únicos puntos de entrada admitidos; `next dev` y `next start` no se
invocan en ningún script y no deben usarse directamente.

| Script | Acción | Categoría |
|--------|--------|-----------|
| `dev` | `NODE_ENV=development node scripts/preflight.mjs dev && NODE_ENV=development node server.mjs` (carga `.env.development.local`; `NODE_ENV` fijado en los dos procesos) | Ejecución |
| `build` | `next build` | Construcción |
| `start` | `NODE_ENV=production node scripts/preflight.mjs start && NODE_ENV=production node server.mjs` (configuración desde el entorno; `NODE_ENV` fijado en los dos procesos) | Ejecución |
| `format` | `prettier --write .` | Utilidad (no es un control) |
| `check:format` | `prettier --check .` | Formato |
| `check:lint` | `eslint . --max-warnings=0` | Análisis estático y límites |
| `check:types` | `next typegen && tsc --noEmit` | Tipos |
| `check:test` | `vitest run` | Pruebas |
| `check:build` | `next build && node scripts/smoke-test.mjs` | Construcción (incluye el arranque real en ambos modos) |
| `check:secrets` | `node scripts/check-secrets.mjs`: historial alcanzable, índice de Git y árbol de trabajo no ignorado, como análisis separados | Secretos |
| `check:deps` | `node scripts/check-dependencies.mjs` | Dependencias |
| `check:workflows` | `zizmor --offline --min-severity low .github/workflows` | Seguridad de workflows |
| `check:quality` | format → lint → types → test → build, en secuencia | Agregado de calidad |
| `check:security` | secrets → deps → workflows, en secuencia | Agregado de seguridad |
| `check` | `check:quality` y después `check:security` | **Agregado total** (FR-010) |
| `tools:install` | `node scripts/tools/install-tools.mjs` | Requisito de `check:secrets` y `check:workflows` |
| `verify:negative` | `node scripts/negative-checks.mjs [categoría…]` | Pruebas negativas locales de aceptación (no es un control) |

`check:deps`, `tools:install` y `verify:negative` (en la categoría de dependencias) necesitan
acceso de red al registro de npm y a GitHub, y la documentación lo indica. La prueba de humo y
`verify:negative` instalan dependencias en copias temporales desde la caché local de npm
(`--prefer-offline`). Ninguna prueba (`check:test`) usa la red.

### Categorías y controles

Hay **ocho categorías de control**. Cada una tiene un comando local, un job de Linux con nombre
estable, una prueba negativa local y un pull request negativo de aceptación:

| # | Categoría | Identificador | Comando local | Job de Linux |
|---|-----------|---------------|---------------|--------------|
| 1 | Formato | `format` | `check:format` | `format` |
| 2 | Análisis estático y límites | `lint` | `check:lint` | `lint` |
| 3 | Tipos | `types` | `check:types` | `types` |
| 4 | Pruebas | `test` | `check:test` | `test` |
| 5 | Construcción | `build` | `check:build` | `build` |
| 6 | Secretos | `secrets` | `check:secrets` | `secrets` |
| 7 | Dependencias | `dependencies` | `check:deps` | `dependencies` |
| 8 | Seguridad de workflows | `workflows` | `check:workflows` | `workflows` |

El noveno control requerido, `macos-quality`, **no es una categoría**: verifica la plataforma
macOS ejecutando `check:quality`, que agrupa las categorías 1 a 5. Por eso la integración
continua tiene **nueve controles requeridos** y las pruebas negativas son **ocho**.
`verify:negative` no es un control ni se ejecuta en los pull requests: es un procedimiento local
de aceptación.

## Diseño de la integración continua

**Disparadores**: `pull_request` con `branches: [main]` y `push` con `branches: [main]` en ambos
workflows. `security.yml` además se ejecuta con `schedule` semanal (lunes 06:00 UTC). No se usan
filtros de rutas, para que los controles requeridos se ejecuten siempre.

**Seguridad común** (FR-021):

- `permissions: {}` a nivel de workflow y `permissions: { contents: read }` en cada job. Ningún
  job pide permisos de escritura; escribir en `$GITHUB_STEP_SUMMARY` no los necesita.
- Solo eventos `pull_request` y `push`. **Prohibidos** `pull_request_target` y `workflow_run`.
- **Credenciales** (FR-021). La regla es la misma en todos los jobs, también en los pull
  requests desde bifurcaciones:
  - ningún secreto del proyecto: no aparece `secrets.*` en ningún workflow, tampoco
    `secrets.GITHUB_TOKEN`;
  - ninguna credencial de larga duración (tokens personales, claves de despliegue ni tokens de
    aplicaciones);
  - ningún token con permisos de escritura;
  - solo se admite el token efímero que GitHub Actions genera para cada job (`GITHUB_TOKEN`),
    con el permiso mínimo `contents: read`. Lo usa `actions/checkout` para obtener el código.
    `actions/setup-node` también lo recibe implícitamente por el valor predeterminado de su
    entrada `token`, solo para descargar Node.js desde el manifiesto de versiones de GitHub;
    es una acción oficial fijada por SHA, no código del repositorio;
  - `persist-credentials: false` en `actions/checkout`, para que el token no quede en
    `.git/config` al alcance de los pasos siguientes;
  - el token **no se pasa explícitamente** (`github.token`, `GITHUB_TOKEN` o
    `env: GH_TOKEN`) a los scripts npm, a las variables de la aplicación (`AULANORMA_*`) ni a
    ningún comando que ejecute código del repositorio, incluidos `npm run tools:install`, que
    descarga los binarios sin autenticación, y `zizmor --offline`.
- `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1  # v7.0.1` con
  `persist-credentials: false`.
- `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020  # v7.0.0` con
  `node-version-file: .node-version`, es decir, Node.js 24.21.0, y caché de npm indexada por
  `package-lock.json`.
- Instalación con `npm ci` (con `ignore-scripts` desde `.npmrc`).
- `timeout-minutes: 15` en cada job. `concurrency` cancela ejecuciones anteriores **solo** en
  pull requests.
- Variables de entorno de job con valores sintéticos: `NEXT_TELEMETRY_DISABLED=1`,
  `AULANORMA_LOG_LEVEL=info` y `AULANORMA_ENVIRONMENT=ci`.

**Jobs y nombres estables** (FR-022). El nombre del job es el nombre del control requerido.

| Workflow | Job | Runner | Pasos principales |
|----------|-----|--------|-------------------|
| `quality` | `format` | `ubuntu-24.04` | `npm ci`, `npm run check:format` |
| `quality` | `lint` | `ubuntu-24.04` | `npm ci`, `npm run check:lint` |
| `quality` | `types` | `ubuntu-24.04` | `npm ci`, `npm run check:types` |
| `quality` | `test` | `ubuntu-24.04` | `npm ci`, `npm run check:test` |
| `quality` | `build` | `ubuntu-24.04` | `npm ci`, `npm run check:build` (incluye la prueba de humo) |
| `quality` | `macos-quality` | `macos-26` | `npm ci`, `npm run check:quality` |
| `security` | `secrets` | `ubuntu-24.04` | checkout con `fetch-depth: 0`, `npm run tools:install`, `npm run check:secrets` |
| `security` | `dependencies` | `ubuntu-24.04` | `npm ci`, `npm run check:deps`; resumen de vulnerabilidades medias y bajas |
| `security` | `workflows` | `ubuntu-24.04` | `npm run tools:install`, `npm run check:workflows` |

Linux ejecuta cada categoría en un job propio, de modo que el pull request muestra directamente
qué control ha fallado (FR-018). macOS ejecuta el agregado de calidad en un solo job para
verificar la plataforma (FR-001) sin multiplicar los jobs. En la integración continua,
`check:secrets` es el mismo comando que en local. El análisis del historial alcanzable es el
que aporta: el índice y el árbol coinciden con el commit, así que esos dos análisis son
redundantes e inocuos.

`verify:negative` no se ejecuta en ningún workflow. Las pruebas negativas en la integración
continua se hacen una sola vez, en la aceptación, con los pull requests en borrador descritos más
abajo.

**Dependabot**: `.github/dependabot.yml` con ecosistemas `npm` y `github-actions`, frecuencia
semanal y agrupación de actualizaciones menores. `next` y `@next/env` pertenecen al mismo grupo
para que se actualicen juntos (research.md, K12). Es un servicio de GitHub, no un workflow del
repositorio, y sus pull requests pasan por los mismos controles sin secretos.

## Diseño de las pruebas negativas

### Procedimiento local automatizado (`npm run verify:negative`)

`scripts/negative-checks.mjs` sigue estos pasos:

1. Registra `git status --porcelain` y el hash de `HEAD` del repositorio real.
2. Por cada categoría, crea una copia temporal con `fs.mkdtemp` en el directorio temporal del
   sistema, con los ficheros de `git ls-files -z --cached --others --exclude-standard`, es decir,
   sin ficheros ignorados. Instala las dependencias en la copia con
   `npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`. No usa un enlace simbólico a
   `node_modules`, porque Turbopack lo rechaza (research.md, R14). En esa copia inicializa un
   repositorio Git con un commit base.
3. Aplica **una** alteración sintética y ejecuta **solo** el comando de esa categoría.
4. Comprueba que el comando falla **por la causa esperada y en la ubicación esperada**. Un
   código distinto de cero sin esa causa hace fallar el procedimiento. Los fallos colaterales
   se registran; en la integración continua, los controles no afectados deben pasar.
5. Elimina la copia temporal, incluso si hay errores (`try/finally`).
6. Al terminar, comprueba que `git status --porcelain` y `HEAD` del repositorio real **no han
   cambiado**. Si han cambiado, el propio procedimiento falla.

Hay una alteración por cada una de las **ocho categorías**:

| # | Categoría | Alteración sintética | Resultado esperado |
|---|-----------|----------------------|--------------------|
| 1 | Formato (`format`) | Añade `const  sample={a:1}` sin formato a un módulo de `src/platform` | `check:format` falla y nombra el fichero |
| 2 | Análisis estático y límites (`lint`) | Crea `src/modules/normative-source/violation.ts` que importa `@/modules/moodle-publication` | `check:lint` falla con `no-restricted-imports` |
| 3 | Tipos (`types`) | Añade `export const sample: number = "text";` | `check:types` falla con TS2322 |
| 4 | Pruebas (`test`) | Añade `tests/unit/negative.test.ts` con `expect(1).toBe(2)` | `check:test` falla |
| 5 | Construcción (`build`) | Añade en la copia una página temporal del Pages Router con un componente mínimo y un `getStaticProps` que lanza una excepción; los tipos son correctos. Antes de fijarla, T053 comprueba en una copia desechable que provoca el fallo esperado, añade JSX y la configuración suficiente si la copia lo necesita, y solo entonces fija la causa, la ruta lógica del fichero temporal, la salida esperada, el criterio de restauración y la prueba de que el árbol original queda intacto; no se asume de antemano el mensaje exacto | `check:build` falla al generar esa página estática por la causa fijada en T053 y nombra la página |
| 6 | Secretos (`secrets`) | Genera **en tiempo de ejecución** tokens sintéticos con formato de token de GitHub (prefijo y 36 caracteres aleatorios); el script no contiene ningún literal. Tres subcasos, cada uno en su propia copia: **(a)** el token en un commit de la copia; **(b)** el token en un fichero **nuevo sin seguimiento y no ignorado**, sin commit; **(c)** exclusión positiva: el token solo en `.env.development.local`, que la copia ignora. (c) no es una novena prueba negativa | (a) y (b): `check:secrets` falla por la regla `github-pat` y nombra el fichero. (c): `check:secrets` **termina con éxito** |
| 7 | Dependencias (`dependencies`) | `npm install --package-lock-only --ignore-scripts lodash@4.17.20`: benigna, con avisos conocidos, no se instala ni se ejecuta | `check:deps` falla por gravedad alta |
| 8 | Seguridad de workflows (`workflows`) | Añade un workflow con `${{ github.event.pull_request.title }}` dentro de `run:` | `check:workflows` falla (`template-injection`) |

Solo se usan datos sintéticos. Nunca secretos reales ni dependencias maliciosas no controladas
(aclaración 5 y FR-012).

### Aceptación en la integración continua (una vez, antes de integrar)

1. Por cada una de las **ocho categorías**, crear desde la rama de la funcionalidad una rama
   `negative-test/<identificador>` (`format`, `lint`, `types`, `test`, `build`, `secrets`,
   `dependencies` o `workflows`) con la misma alteración. En secretos se usa el subcaso (a),
   porque en la integración continua todo contenido está en un commit.
2. Abrir un pull request **en borrador** hacia `main` con el título
   `[NEGATIVE TEST] <identificador> — do not merge`.
3. Esperar a que el control de esa categoría falle y registrar el enlace a la ejecución en
   `specs/001-engineering-baseline/acceptance.md`.
4. Cerrar el pull request **sin integrarlo** y eliminar la rama.

**Protección de push en el caso de secretos**. El token sintético de
`negative-test/secrets` puede ser bloqueado antes de llegar al repositorio por la protección de
push de GitHub, tanto la personal de la cuenta como la del repositorio (research.md, R11). El
procedimiento es:

1. Nunca se usa un secreto real. El token se genera en el momento, con bytes aleatorios y el
   mismo formato que usa `verify:negative` (prefijo de token de GitHub y 36 caracteres), y no
   se copia de ninguna cuenta ni servicio.
2. Antes del push se revisa que el valor procede de ese generador y que no se ha pegado desde
   otro sitio.
3. Si GitHub bloquea el push, se autoriza **exclusivamente** con el motivo "It's used in
   tests" ("usado en pruebas"). Nunca se eligen "It's a false positive" ni "I'll fix it
   later".
4. Se registra la autorización como evidencia en `acceptance.md`: fecha, tipo de protección
   que bloqueó (personal o del repositorio), motivo elegido y, si GitHub genera una alerta de
   detección de secretos, su enlace. **Nunca se copia el valor del token** en `acceptance.md`
   ni en ningún otro fichero que llegue a `main`, porque `check:secrets` examinaría ese
   historial.
5. Se vuelve a enviar la rama, se abre el pull request en borrador, se espera a que el control
   `secrets` falle, se registra el enlace, se cierra el pull request sin integrar y se elimina
   la rama.

Esta autorización es puntual de un dato de prueba: no es una excepción a FR-020 ni una
excepción constitucional, y **no elude la protección de `main`**. El pull request sigue en
borrador, no se integra y debe mostrar el control `secrets` fallido. Si no puede autorizarse,
SC-003 queda sin superar. Cualquier alerta se cierra como dato sintético usado en una prueba;
su permanencia en las referencias del pull request cerrado es un riesgo aceptado.

Si cambia el SHA base de aceptación, solo se repiten los pull requests negativos cuyas
alteraciones o controles resulten afectados. Tras eliminar las ramas se verifica que ninguno
de sus commits es alcanzable desde `main`.

Son **ocho** pull requests, uno por categoría. `macos-quality` no tiene uno propio porque no es
una categoría: en los pull requests de las categorías 1 a 5 también falla, porque ejecuta
`check:quality`, y eso queda registrado en la misma evidencia.

Estas ramas nunca se integran (SC-003). Mientras los controles no sean requeridos, la protección
básica de `main` y el cierre sin integrar lo garantizan. El token sintético del caso de secretos
solo queda en la referencia del pull request cerrado, nunca en el historial de `main`, y
tampoco en `acceptance.md`. Como el análisis de historial de `check:secrets` solo recorre los
commits alcanzables desde el commit evaluado (research.md, R11), la rama
`negative-test/secrets` no afecta a los demás pull requests mientras existe.

## Estrategia de pruebas

| Área | Prueba | Tipo | Verifica |
|------|--------|------|----------|
| Validación de configuración | `tests/unit/platform/config.test.ts` | Unitaria | Configuración válida aceptada; variable ausente, vacía, inválida o desconocida rechazada con `{ key, problem }`; un **valor centinela sintético** nunca aparece en el mensaje; `loadConfig` con modo explícito, `NODE_ENV` concordante, `forceReload = true` y logger controlado, con `mode_mismatch` y `env_load_failed` genéricos y sin rutas, nombres de `.env`, errores ni trazas (FR-005) |
| Arranque en producción (`npm start`) | `scripts/smoke-test.mjs`, en el repositorio con la compilación recién hecha | Integración (bucle local) | Casos ausente, vacía, valor inválido (centinela) y clave desconocida: el proceso termina con código distinto de 0 en menos de 20 s; el puerto **no acepta ninguna conexión** en toda la vida del proceso; la salida nombra la clave y el tipo de problema y no contiene el centinela. Caso válido: 200 con el cuerpo del contrato |
| Arranque en desarrollo (`npm run dev`) | `scripts/smoke-test.mjs`, en una copia temporal sin ficheros ignorados y con `npm ci` desde la caché (research.md, R14) | Integración (bucle local) | La prueba escribe su propio `.env.development.local` en cada caso. Valor inválido en el fichero, clave ausente en el fichero y variable de proceso vacía que prevalece sobre un fichero válido: código distinto de 0, puerto nunca abierto y sin centinela. Fichero válido: 200 tras el calentamiento. No se prueba ni se promete la recarga en caliente de la configuración: aplicar un cambio exige reiniciar |
| Contrato del endpoint | `tests/contract/health.contract.test.ts` | Contrato | Se llama directamente al manejador de `src/pages/api/health.ts` con dobles de petición y respuesta: `GET` y `HEAD` 200 con `application/json`, `Cache-Control: no-store` y cuerpo **exactamente** igual a `{ status: "ok", version: <package.json> }` (sin cuerpo en `HEAD`); `OPTIONS` 204 cerrado con `Allow`; otros métodos 405 defensivo. Importar el módulo no ejecuta trabajo falible. Con una configuración inválida o un fallo forzado dentro del manejador, antes de iniciar la respuesta, responde el 500 cerrado, no lanza y nunca devuelve "ok" |
| Frontera HTTP: decisión | `tests/unit/platform/http-boundary.test.ts` | Unitaria | Con un `handle` inyectado: precedencia versión → `Host` → destino → método → cuerpo; destino crudo exacto; `GET`, `HEAD` y `OPTIONS` se delegan con **una** llamada; el resto recibe el rechazo cerrado sin llamar a `handle`; 500 cerrado si `handle` rechaza antes de las cabeceras y destrucción de la conexión si ya empezaron |
| Frontera HTTP: estado de conexión | `tests/unit/platform/http-boundary-connection.test.ts` | Unitaria | Rechazo terminal por socket, diferido, *flush*, *dropped*, supresión, `ECONNRESET`, `CONNECT`, `Upgrade`, `checkContinue` y `checkExpectation`; nunca una segunda respuesta |
| Frontera HTTP: petición | `tests/unit/platform/http-boundary-request.test.ts` | Unitaria | Versiones, `Host` sobre `rawHeaders` (ausente, duplicado, vacío, coma, control y obs-text), `Content-Length`, `Transfer-Encoding` y framing; los valores nunca aparecen en la salida |
| Matriz negativa por TCP crudo | `scripts/smoke-test.mjs` con `npm start` | Integración (bucle local) | Subconjunto permanente del oráculo de viabilidad (research.md, R1): versiones, `Host`, cuerpos, `Expect`, `CONNECT` y `Upgrade`, destinos no exactos y reservados del framework, métodos, canalización y errores diferidos. Incluye un grupo permanente de 21 casos `GET` y `HEAD` canónicos con cabeceras de control del framework (`RSC`, `Next-Router-State-Tree`, `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`, `Next-Url`, `x-middleware-subrequest`, `x-invoke-path`, `x-invoke-status`, `x-invoke-error`, `x-nextjs-data`, `x-forwarded-for`, `x-forwarded-host`, `x-forwarded-proto`, `x-forwarded-port` y `Purpose: prefetch`), individuales, combinados y un caso agregado (T029): `GET` 200 con el cuerpo exacto, `HEAD` 200 sin cuerpo, contrato sin cambios, ningún valor reflejado ni registrado, y la presencia de esas cabeceras no autoriza ninguna ruta, método ni comportamiento adicional. **Ninguna respuesta HTML**, ninguna cabecera del framework, ninguna `Vary` distinta de `Accept-Encoding`, sin `Location`, `Refresh`, `ETag`, `Server` ni `X-Powered-By`, `Keep-Alive` solo `timeout=5` en respuestas satisfactorias persistentes y 0 errores 500 inesperados |
| Equivalencia entre modos | `scripts/smoke-test.mjs` con `npm run dev` | Integración (bucle local) | Tras el calentamiento, el mismo subconjunto produce en desarrollo los mismos estados, cuerpos, conjunto de cabeceras (salvo el valor de `Date`) y cierres que en producción |
| Auditoría de registros | `scripts/smoke-test.mjs` en ambos modos | Integración (bucle local) | Fuera del arranque no aparece ninguna línea: ningún registro automático del framework por petición (método, estado, ruta, tiempos o compilación), ni avisos, errores o trazas; sin valores de `Host`, rutas locales ni credenciales |
| Sin campos adicionales | Misma prueba y `smoke-test.mjs` | Contrato | `Object.keys(body)` es exactamente `["status", "version"]`; sin cabeceras `x-powered-by` ni `server` |
| Ausencia de interfaz | `tests/unit/platform/http-boundary.test.ts` y `smoke-test.mjs` | Unitaria e integración | Todo destino distinto de `/api/health` (`/`, `/foo`, `/api`, `/api/health/`, `/api/health/extra`, `/favicon.ico`, `/404`, `/500`, `/_error`, `/_not-found`, `/_next/…`, `/__nextjs_…`, `/api/health.rsc` y variantes codificadas) recibe 404 cerrado sin cuerpo y sin HTML, en ambos modos |
| Registros sin datos sensibles | `tests/unit/platform/logging.test.ts` | Unitaria | Destino en memoria; cada línea es JSON con `level`, `time`, `service`, `environment` y `msg`; los campos sensibles sintéticos quedan como `[REDACTED]`; el error de configuración no contiene el valor |
| Límites de importación | `tests/architecture/import-boundaries.test.ts` | Arquitectura | Con la API de ESLint (`lintText` y una ruta sintética en cada ubicación), cada dependencia prohibida de la matriz da error y cada dependencia permitida no. Incluye: `src/pages` o `server.mjs` que importa `@/modules/<capa>` da error; `src/pages` que importa `@/platform/<área>` no; `@/platform/<área>/<interno>` desde fuera da error; `process.env` fuera de `src/platform/config` da error, y en `server.mjs` solo se admite `process.env.NODE_ENV`; una importación relativa o con `@/` en un módulo portable da error; `node:http` en ejecución dentro de `src/` da error y `import type` desde `node:http` en `src/platform/http-boundary` no |
| Versiones enlazadas | `tests/architecture/dependency-versions.test.ts` | Arquitectura | `package.json` declara `next` y `@next/env` con la misma versión exacta (K12) |
| Sin lógica de dominio | `tests/architecture/no-domain-specifics.test.ts` | Arquitectura | Sin coincidencias de los códigos de certificado en los ficheros versionados de código y configuración (FR-024) |
| Determinismo sin red | `tests/setup/no-network.ts`, autoprueba del bloqueo y procedimiento de SC-005 | Transversal | Un intento de conexión externa falla. SC-005: diez `check:test` en la misma máquina, cinco con red y cinco con conectividad externa desactivada y comprobada; equivalencia de código de salida y recuentos de Vitest |
| Segunda ruta pública | `tests/architecture/public-routes.test.ts` | Arquitectura | Falla si aparece una segunda ruta pública o una ampliación de la excepción por analogía: otro fichero en `src/pages`, cualquier fichero en `src/app`, otro destino o método en la frontera |
| Entradas no admitidas | `tests/architecture/entry-points.test.ts` | Arquitectura | Falla si `package.json` invoca `next dev` o `next start` directamente, si aparece otro punto de entrada que no sea `server.mjs`, si `next.config.ts` introduce `rewrites`, `headers`, `redirects`, middleware o `proxy`, si existen `middleware.ts`, `proxy.ts` o `instrumentation.ts`, si se crea una segunda ruta pública, o si `dev` y `start` no fijan `NODE_ENV` en los dos lados de `&&` |

**Trazabilidad de las siete condiciones de FR-006** (cada prueba debe fallar si la condición
deja de cumplirse):

| Condición | Prueba objetiva | Qué la hace fallar |
|-----------|-----------------|--------------------|
| C1 solo lectura | `tests/contract/health.contract.test.ts` y `scripts/smoke-test.mjs` | Un método distinto de `GET` y `HEAD` que ejecute la operación, o una mutación. `OPTIONS` solo devuelve la respuesta de transporte 204, que cumple por sí misma C1 a C7 |
| C2 sin datos de negocio, personales ni de petición en la operación; transporte limitado | `tests/unit/platform/health.test.ts`, `tests/unit/platform/logging.test.ts` y `tests/unit/platform/http-boundary-request.test.ts` | La operación usa IP, cabeceras, `User-Agent`, cookies, consulta o cuerpo; la frontera inspecciona un campo fuera de su lista cerrada; la frontera o el entorno HTTP conservan, registran, reflejan o entregan a la operación algún valor de la petición, incluido `Accept-Encoding` |
| C3 sin persistencia ni servicios externos | `tests/architecture/import-boundaries.test.ts` y `tests/setup/no-network.ts` | Importar persistencia o red, salvo `import type` de `node:http` en la frontera |
| C4 sin cambio de estado; estado de conexión transitorio | `tests/unit/platform/health.test.ts`, `tests/unit/platform/logging.test.ts`, `tests/unit/platform/http-boundary-connection.test.ts` y la auditoría de registros de `scripts/smoke-test.mjs` | Un registro o `requestId` emitidos por la consulta o por un rechazo, en cualquier modo; estado de conexión que sobrevive a la conexión o se persiste |
| C5 contrato cerrado | `tests/contract/health.contract.test.ts` y `scripts/smoke-test.mjs` | Un campo o cabecera añadidos; una `Vary` distinta de `Accept-Encoding`; una respuesta con `Content-Encoding`; un rechazo con cuerpo, sin `no-store`, `Content-Length: 0` o `Connection: close`, o con `Allow` fuera de 405; `Keep-Alive` con un valor distinto de `timeout=5` |
| C6 sin información sensible | `tests/contract/health.contract.test.ts` y `scripts/smoke-test.mjs` (matriz negativa y equivalencia entre modos) | Revelar dependencias, tiempos internos u otra información prohibida: HTML servido, `Vary` con `rsc` o `next-router-*`, `x-nextjs-*`, `x-middleware-*`, `ETag`, `Server`, `X-Powered-By`, `Location`, `Refresh`, filtraciones en cuerpos o un 500 inesperado |
| C7 declarada y comprobada | `tests/architecture/public-routes.test.ts` y `tests/architecture/entry-points.test.ts` | Una segunda ruta pública, una ampliación por analogía o un punto de entrada que eluda la frontera |

Todas las pruebas usan datos sintéticos, no tienen dependencias de hora (sin comprobar marcas de
tiempo absolutas) y se ejecutan sin ficheros `.env` del repositorio. La prueba de humo:

- construye el entorno de cada caso desde cero: elimina toda variable `AULANORMA_*` heredada,
  por ejemplo las que la integración continua define a nivel de job o las exportadas en la
  terminal, que prevalecerían sobre `.env.development.local`, y define solo las del caso;
- usa el puerto fijo `127.0.0.1:3000` de los puntos de entrada: antes de cada arranque
  comprueba que está libre y, si no lo está, falla con un mensaje claro; los modos se ejecutan
  en secuencia, nunca a la vez. Solo las pruebas que montan su propio servidor en el arnés
  pueden usar otro puerto;
- se comunica con el servidor mediante un cliente TCP crudo sin dependencias, que registra
  estado, cuerpo, cabeceras, orden, cierre y ausencia de respuesta;
- arranca cada servidor en su propio grupo de procesos y lo termina completo al acabar cada
  caso;
- espera señales observables (código de salida, puerto, línea de registro) en lugar de pausas
  fijas.

## Protección de `main`

Se documenta en `docs/engineering/branch-protection.md` (FR-026):

1. **Antes de integrar**: la protección básica de `main`, ya activa, **se mantiene**. El pull
   request de esta funcionalidad registra en su descripción las comprobaciones manuales
   reproducibles realizadas (constitución: pull requests documentales durante la preparación de
   la línea base) y además debe superar los controles nuevos en cuanto aparezcan en el propio
   pull request.
2. **Integración inicial**: el pull request solo se integra si SC-001 a SC-008 previos a
   `main` están Superado, incluidos SC-001 y SC-008, y los nueve controles están en verde. La
   integración **no** inicia la congelación.
3. **Ejecuciones en `main` hasta el primer éxito**: se comprueba el par de workflows disparados
   por la actualización de `main` sobre el **mismo SHA**. Si algún control falla, la corrección
   se prepara y se integra mediante un pull request normal. Pueden existir tantas integraciones
   correctivas como sean necesarias. Este tramo todavía no está sujeto a la congelación.
4. **Primera ejecución satisfactoria y congelación**: cuando los nueve jobs pasan por primera
   vez en el mismo SHA de `main`, comienza la congelación. Desde ese momento y hasta completar
   la activación del paso 5 no se integra ningún cambio, tampoco Dependabot. "Inmediatamente"
   significa la misma sesión administrativa y sin commits intermedios, con ambas marcas
   temporales registradas. Si la activación falla, la congelación continúa.
5. **Activación inmediata**: el mantenedor añade esos nueve nombres como **controles de estado
   requeridos** en la regla existente de `main`. Si es una
   regla clásica de protección de rama, en "Require status checks to pass" con "Require branches
   to be up to date". Si es un ruleset, en "Require status checks to pass". El mecanismo concreto
   se comprueba en la implementación con
   `gh api repos/Informatica-Colectivo-Prime/aulanorma/rulesets` y
   `…/branches/main/protection`.
6. Se mantiene: sin pushes directos ni forzados, **sin actores con permiso para eludirla**
   (tampoco administradores) y sin aprobación de otra persona mientras haya un único mantenedor.
   La revisión se documenta con la lista de comprobación constitucional.
7. **Sin desactivación de emergencia**: ante una incidencia se espera a resolverla o se modifica
   formalmente la gobernanza (aclaración 4).
8. **Registro y ADR**: el primer pull request posterior, ya sujeto a los controles requeridos,
   añade a `docs/engineering/branch-protection.md` la fecha de activación, el enlace a la
   ejecución de `main` y la lista de controles activada; completa en `acceptance.md` la
   evidencia de `main` de SC-004, SC-007 y SC-009; y cambia los ADR 0001 y 0002, junto con
   `docs/adr/README.md`, de Propuesto a Aceptado. La fuente esperada de los controles
   requeridos es la aplicación GitHub Actions de este repositorio.

## Matriz de aceptación

Cada criterio de éxito se verifica con un procedimiento manual reproducible o con una ejecución
registrada, y su evidencia se guarda en `specs/001-engineering-baseline/acceptance.md`, que se
crea durante la implementación. Estas verificaciones **no son controles**: ningún workflow las
ejecuta, no se añaden a los controles requeridos y no se repiten en cada pull request. La
garantía continua la dan los nueve controles requeridos (FR-015).

**Reglas comunes**:

- **SHA base de aceptación**: código, dependencias, workflows y documentación de procedimiento
  evaluados. Cada procedimiento local usa su propio clon completo, limpio y fijado a ese SHA;
  no se clona una rama mutable.
- **HEAD de evidencia**: puede añadir solamente `acceptance.md`. Ese commit no obliga a
  repetir mediciones, pero vuelve a ejecutar los controles automáticos. Cualquier otro cambio
  crea una nueva base y obliga a repetir lo afectado.
- **Versión de Node.js**: todas las mediciones locales se hacen con Node.js **24.21.0**.
- **Entorno de referencia**: el macOS arm64 del mantenedor (FR-001a). Linux de aceptación:
  x64.
- **Estado**: **Superado**, **No superado** o **Pendiente**. SC-001 y SC-008 DEBEN estar
  Superado antes de integrar. Si alguno queda Pendiente, el pull request permanece abierto
  y no se integra. No existe cierre posterior.
- **Evidencia**: fechas, commits, enlaces y cifras. Los enlaces a GitHub son admisibles. No se
  copian nombres de personas, rutas locales ni salidas sin redactar. Las personas externas se
  identifican con un seudónimo no reidentificable.
- **Misma persona para SC-001 y SC-008**: solo en este orden, primero SC-001 y después
  SC-008.

| Criterio | Procedimiento exacto | Entorno | Evidencia en `acceptance.md` | Momento |
|----------|----------------------|---------|------------------------------|---------|
| **SC-001** Arranque desde un clon limpio | Con los requisitos previos ya instalados, que no cuentan en el tiempo, y `node --version` igual a `v24.21.0`, se pone en marcha el cronómetro. Se crea un clon completo, limpio y propio fijado al SHA base de aceptación (`git clone` del repositorio y `git checkout <SHA>`), no una rama mutable. Se siguen solo `README.md` y la documentación enlazada, que reproducen los pasos 1 a 3 del [quickstart](./quickstart.md), hasta que `curl -i http://127.0.0.1:3000/api/health` devuelve 200 con el cuerpo del contrato. Ahí se para el cronómetro. `npm ci` cuenta en el tiempo. Lo ejecuta una persona que, al comenzar el primer recorrido, carece de conocimiento previo, sin ayuda externa. El mantenedor puede preparar los requisitos previos, observar y registrar; cualquier explicación o corrección invalida el intento. Después se repite el mismo procedimiento en un clon propio de Linux x64, sin límite de 30 minutos | macOS arm64 de referencia y Linux x64, ambas con Node.js 24.21.0 | Por cada sistema: fecha, SHA fijado, sistema operativo y arquitectura, `node --version` y `npm --version`, seudónimo no reidentificable del ejecutor, confirmación de que al comenzar el primer recorrido no tenía conocimiento previo ni recibió ayuda, hora de inicio, hora de fin, duración, salida de `curl` redactada y desviaciones respecto a la documentación. Superado solo cuando esa persona completa el recorrido en macOS en menos de 30 minutos, Linux x64 termina con éxito, ambos sin desviaciones, y la evidencia queda registrada | Antes de integrar, sobre el SHA base de aceptación. Si falta la persona externa, SC-001 queda **Pendiente**, el pull request permanece abierto y no se integra |
| **SC-002** Comandos de calidad locales | En un clon limpio y completo propio del SHA base en macOS, independiente de SC-001, se ejecutan `npm ci` y `npm run tools:install`, cada comando de categoría por separado (`check:format`, `check:lint`, `check:types`, `check:test`, `check:build`, `check:secrets`, `check:deps` y `check:workflows`) y después `time npm run check` | macOS arm64 de referencia con Node.js 24.21.0 | SHA, confirmación de clon completo, `node --version`, código de salida de la preparación, de los ocho comandos y del agregado, tiempo real (`real`) de `time npm run check` y resumen de su salida. Superado si todos terminan con código 0 y el agregado tarda menos de 10 minutos | Antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente |
| **SC-003** Pruebas negativas | **Local en macOS**: en un clon limpio y completo propio fijado al SHA base se anotan `git status --porcelain` y `git rev-parse HEAD`, se ejecuta `npm run verify:negative` y se comparan ambos valores después. Cada categoría debe fallar por la causa esperada y en la ubicación esperada. El subcaso de secretos en un fichero ignorado es una prueba de exclusión positiva, no una novena prueba negativa. **Local en Linux x64**: en otro clon limpio y completo propio se documentan y ejecutan los pasos locales aplicables del quickstart: instalación, configuración sin secretos, arranque, consulta de estado, controles positivos y `npm run verify:negative`; se registra evidencia explícita de cada paso, sin atribuirla a SC-001. **Integración continua**: los ocho pull requests negativos en borrador; el control objetivo falla por la causa y en la ubicación esperadas; los fallos colaterales se registran y los controles no afectados deben pasar. Al terminar, `git ls-remote --heads origin 'negative-test/*'` no devuelve nada y ningún commit de esas ramas es alcanzable desde `main`. Si cambia el SHA base, solo se repiten los pull requests negativos cuyas alteraciones o controles resulten afectados | Local: macOS arm64 de referencia y Linux x64, ambos con Node.js 24.21.0. Integración continua: los runners de los workflows | En Linux x64: SHA, instalación, configuración aplicada, arranque, respuesta de estado y resultado de los controles aplicables. En macOS y Linux: salida de `verify:negative` con las ocho categorías, causa y ubicación de cada fallo, y el subcaso de exclusión positiva; código de salida 0 y estado de Git idéntico antes y después. Por categoría: enlace al pull request cerrado sin integrar, enlace a la ejecución, causa y ubicación, controles colaterales y controles no afectados en verde, y también `macos-quality` en las categorías 1 a 5. En secretos, la autorización de la protección de push si la hubo, sin el valor del token, y el cierre de cualquier alerta como dato sintético. Salida vacía de `git ls-remote` y comprobación de que esos commits no son alcanzables desde `main` | Antes de integrar, cuando los workflows ya se ejecutan en el pull request de la funcionalidad; las ramas negativas parten del SHA base |
| **SC-004** Activación y duración de los controles | **Pull request**: sobre el pull request de la funcionalidad, en el SHA base, se usan la ejecución inicial de cada workflow (`quality` y `security`) y dos reejecuciones completas ("Re-run all jobs" o `gh run rerun <id>` sin `--failed`). Los dos workflows de una misma medición DEBEN corresponder al mismo SHA. Se espera a que termine cada intento antes de lanzar el siguiente y no se añaden commits entre intentos. Cada uno de los nueve jobs debe concluir con éxito y durar menos de 15 minutos desde que el ejecutor inicia el job. Un timeout o un fallo no excluido reinicia la serie de tres intentos. Una ejecución cancelada por `concurrency` no cuenta, ni como éxito ni como intento. **`main`**: se usa la primera ejecución satisfactoria del par de workflows sobre el mismo SHA. Si una ejecución anterior falla, cada corrección se integra mediante un pull request normal. La ejecución semanal de seguridad no es intento. Los datos se obtienen con `gh run view <id> --attempt <n> --json jobs` | Runners `ubuntu-24.04` (Linux x64) y `macos-26` (arm64), con Node.js 24.21.0 desde `.node-version` | Para cada uno de los tres intentos del pull request y para la primera ejecución satisfactoria de `main`, por workflow: identificador de la ejecución, número de intento y SHA. Por cada uno de los nueve jobs: inicio (`started_at`), final (`completed_at`), duración y conclusión satisfactoria. Se registran también las ejecuciones fallidas previas, las canceladas por `concurrency` y sus pull requests correctivos. Superado si en los cuatro casos computables los nueve jobs concluyen con éxito y cada uno dura menos de 15 minutos. Una indisponibilidad general del proveedor solo se excluye con enlace a su incidencia pública | Pull request: antes de integrar. `main`: tras las integraciones correctivas que resulten necesarias y antes de activar los controles requeridos |
| **SC-005** Determinismo con y sin red | En un clon limpio y completo propio fijado al SHA base, en una misma máquina, diez ejecuciones de `npm run check:test`: cinco con red y cinco con la conectividad externa realmente desactivada (Wi-Fi apagado o cable desconectado) y comprobada. Antes de las ejecuciones sin red se comprueba que `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` falla. El resultado equivalente comprende el código de salida y los recuentos de Vitest. No se exige equivalencia entre macOS y Linux ni se mide `check:build` | macOS arm64 de referencia con Node.js 24.21.0, tras `npm ci` | SHA y, por ejecución: modo (con o sin red), código de salida y recuentos de ficheros y de pruebas superadas y fallidas del resumen de Vitest. Resultado de la comprobación de red. Superado si las diez terminan con el mismo código de salida y los mismos recuentos | Antes de integrar, sobre el SHA base |
| **SC-006** Cero secretos reales | En un clon limpio y completo propio del SHA base, independiente de SC-001, se copia `.env.example` a `.env.development.local`; `diff .env.example .env.development.local` no muestra diferencias y la configuración solo contiene `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`, con valores ficticios que no son secretos. En el SHA base, `grep -rnE 'secrets\.\|github\.token\|GITHUB_TOKEN\|GH_TOKEN' .github/workflows` no devuelve coincidencias y la revisión visual de los workflows comprueba además que no se pasa el token por `toJSON(github)` ni por accesos indexados al contexto. Los jobs solo definen las tres variables sintéticas del plan | macOS arm64 de referencia y workflows del SHA base | SHA, confirmación de clon completo, salida de `diff` y de `grep`, nota de la revisión visual, contenido de las claves de `.env.example` y enlaces a las ejecuciones de SC-004. Superado si ninguna comprobación muestra un secreto real ni una credencial pasada a código del repositorio | Antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente |
| **SC-007** Historial sin secretos | En un clon limpio y completo propio del SHA base, independiente de SC-001, `git rev-parse --is-shallow-repository` devuelve `false` y `npm run check:secrets` ejecuta los tres análisis separados: historial alcanzable desde `HEAD`, índice de Git y ficheros versionados modificados o nuevos no ignorados del árbol de trabajo. Se confirma con el job `secrets` (`fetch-depth: 0`) del pull request y de la primera ejecución satisfactoria de `main` | macOS arm64 de referencia con Node.js 24.21.0 y job `secrets` en `ubuntu-24.04` | SHA, confirmación de clon completo, `git rev-list --count HEAD`, número de commits que Gitleaks informa haber examinado, resultado sin hallazgos o lista de hallazgos exceptuados con su entrada en el registro estructurado, y enlaces a los jobs `secrets` del pull request y de la primera ejecución satisfactoria de `main`. Superado si hay cero hallazgos no justificados | Antes de integrar, sobre el SHA base, aunque SC-001 esté Pendiente, y confirmación con la primera ejecución satisfactoria de `main` |
| **SC-008** Comprensión de la documentación | Una persona que no ha participado en la implementación, y que si también ejecuta SC-001 lo hace después de ese criterio, recibe solo el enlace al repositorio y, sin explicaciones del mantenedor, lee `README.md` y `docs/engineering/` (`architecture.md`, `quality-controls.md` y `branch-protection.md`). Identifica trece resultados: cuatro elementos compuestos de capa —cada uno exige ubicación y responsabilidad correctas, comparadas con `architecture.md`— y los nueve nombres exactos de los controles requeridos, comparados con `quality-controls.md` y `branch-protection.md`. El mantenedor no corrige ni sugiere respuestas | Cualquier equipo; no hace falta ejecutar nada | Seudónimo no reidentificable, declaración de que no participó en la implementación, fecha, SHA de la documentación leída, respuestas literales y resultado de cada uno de los trece elementos. Superado solo con los trece correctos y sin ayuda | Cuando la documentación del SHA base está completa y, si la misma persona ejecuta ambos, después de SC-001. Si falta la persona, SC-008 queda **Pendiente**, el pull request permanece abierto y no se integra |
| **SC-009** Controles requeridos en `main` | En cuanto concluye la primera ejecución satisfactoria de los nueve controles en `main`, comienza la congelación absoluta. El mantenedor añade los nueve nombres como controles requeridos (paso 5 de "Protección de `main`") sin integrar ningún cambio durante ese intervalo. Después consulta `gh api repos/Informatica-Colectivo-Prime/aulanorma/branches/main/protection` o `gh api repos/Informatica-Colectivo-Prime/aulanorma/rules/branches/main`, según el mecanismo, y `git log --first-parent --format='%H %cI %s' origin/main` | Configuración del repositorio en GitHub, con un mantenedor con permisos | SHA, fecha y hora final de la primera ejecución satisfactoria; fecha y hora de activación (y `updated_at` si es un ruleset); enlace a esa ejecución; extracto de la respuesta que muestra los nueve nombres exactos como requeridos, sin actores con permiso de elusión y con los administradores sujetos a la regla; y lista de commits de `main` que demuestra exactamente que no hubo integraciones desde esa primera ejecución satisfactoria hasta la activación. Las integraciones correctivas anteriores, si las hubo, se registran como antecedentes y no como excepciones a la congelación | Inmediatamente después de la primera ejecución satisfactoria de `main`. La congelación termina al quedar activados los nueve controles; la evidencia se registra en el primer pull request posterior |

**Evidencia de FR-006 C6 y FR-009 sobre la implementación real**. No es un criterio SC
adicional, pero forma parte de la aceptación de la puerta 5: en el clon de SC-002, con Node.js
24.21.0, las dependencias aprobadas, el preflight y la configuración real, `npm run check:build`
ejecuta la matriz negativa por TCP crudo, la equivalencia entre desarrollo y producción y la
auditoría de registros sobre el SHA base. `acceptance.md` registra el SHA, `node --version`,
el número de casos y peticiones, las respuestas HTML servidas, las cabeceras del framework, las
redirecciones y los errores 500 inesperados (todos deben ser 0), el resultado de la
equivalencia y el de la auditoría. La evidencia desechable de research.md (R1) demuestra
viabilidad y no sustituye este registro.

## Fuera de alcance

Base de datos, interfaz visible, usuarios o autenticación, PDF y normativa, IA, Moodle y
despliegue en producción. La unidad desplegable existe, pero no se configura ningún destino de
despliegue.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Complejidad añadida | Por qué es necesaria | Alternativa más simple descartada y motivo |
|---------------------|----------------------|--------------------------------------------|
| Servidor personalizado mínimo (`server.mjs`) con frontera HTTP propia (`src/platform/http-boundary`) | **Necesidad constitucional**: FR-006 C6 y el principio V prohíben revelar dependencias. Con el App Router, Next.js 16.3.6 añade `Vary: rsc, next-router-*` sin opción de configuración, y cualquier URL que Next.js atienda puede devolver HTML, `ETag`, redirecciones o cabeceras `x-nextjs-*`. Solo una frontera que decida **antes** de Next.js garantiza el contrato cerrado de FR-006 y FR-009 | **App Router o su comodín** (`Vary` del framework y redirecciones propias); **Pages Router con `rewrites`** (HTML en rutas codificadas, `ETag` y `x-nextjs-rewritten-*`); **Pages Router con `proxy.ts`** (`TRACE` y `.rsc` producen HTML o cabeceras del framework, y ciertas normalizaciones y redirecciones ocurren antes del proxy). Detalle en research.md, R1, y ADR 0001 |
| **Responsabilidad HTTP adicional** | La aplicación asume la validación de versión, `Host`, destino, método y framing, y el estado de conexión (diferidos, *flush*, *dropped* y supresión). El analizador HTTP sigue siendo el de Node.js; no se usan propiedades privadas | Delegar esa responsabilidad en Next.js es exactamente lo que falla en las alternativas anteriores |
| **Coste de pruebas** | Tres pruebas unitarias de la frontera, una prueba de arquitectura de entradas y, en `check:build`, una matriz negativa por TCP crudo, la equivalencia entre modos y la auditoría de registros (T024, T027 a T032) | Sin ellas, C6 y FR-009 dependerían de la revisión humana, contrario a FR-006 C7 |
| **Revisión obligatoria al actualizar Node.js** | El comportamiento del analizador HTTP de Node.js (llhttp) decide qué entradas malformadas se rechazan con 400 antes de la frontera. Cada cambio de `.node-version` y la migración a Node 26 LTS DEBEN repetir la matriz negativa y la equivalencia (research.md, K18) | Fijar el analizador por separado no es posible sin salir de Node.js |
| **Futura interfaz** | La frontera rechaza `/_next/*` y el HMR de desarrollo. La primera funcionalidad con interfaz DEBE rediseñar la frontera en un ADR nuevo | Abrir hoy esas rutas ampliaría la superficie sin necesidad |

Las demás herramientas añadidas a la hipótesis no son desviaciones del principio XII:

- zizmor, el envoltorio de auditoría, el envoltorio de secretos y el instalador de binarios
  fijados son la forma más simple de cumplir FR-020, FR-021 y FR-014 sin secretos
  (research.md, R11 a R13, y ADR 0002);
- el preflight y `@next/env` son la forma más simple de cumplir FR-005 en los dos modos de
  arranque, y `@next/env` ya forma parte de Next.js (research.md, R8, y ADR 0001).
