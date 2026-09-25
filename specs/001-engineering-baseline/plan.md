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

- Next.js 16.3.6 (App Router) como monolito modular, con npm, sobre Node.js 24 LTS: 24.21.0 es
  la versión reproducible de referencia y de la integración continua (`.node-version`), y el
  rango soportado para desarrollo es `>=24.21.0 <25` (`devEngines`).
- TypeScript **6.0.3** estricto, en lugar de 7: `typescript-eslint` no admite TypeScript 7.
- Zod para la configuración, Pino para los registros JSON y Vitest para las pruebas.
- ESLint 10 plano, **sin** `eslint-config-next`, y Prettier.
- **Gitleaks como CLI fijada por SHA-256**: la acción oficial exige una licencia guardada como
  secreto en organizaciones. Un envoltorio examina el historial del commit y el árbol de
  trabajo sin ficheros ignorados.
- `npm audit` con un envoltorio de excepciones y zizmor para la seguridad de los workflows.

**Arranque** (research.md, R8): un **preflight común**, `scripts/preflight.mjs`, se ejecuta
antes de Next.js en `npm run dev` y en `npm start`. Carga los ficheros `.env*` con `@next/env`,
el mismo cargador y la misma versión que Next.js, valida con el esquema Zod de
`src/platform/config` y, si falla, termina con código 1 antes de que Next.js abra el puerto.
`instrumentation` y la ruta de estado vuelven a validar como defensa en profundidad. Se verificó
en ambos modos con Next.js 16.3.6 que `instrumentation` por sí solo deja el puerto abierto un
instante.

**Ausencia de interfaz** (research.md, R1): un Route Handler comodín responde 404 sin cuerpo a
toda ruta distinta de `/api/health`. `next.config.ts` añade `images.unoptimized` y reescrituras
de las rutas reservadas del framework, porque sin ellas `next start` sirve su página 404 HTML en
`/_not-found`, `/404` y `/_next/*`. Se verificó que ninguna de 53 peticiones de prueba recibe
HTML en `next start`.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (estricto) sobre Node.js 24 LTS (research.md, R2):

- **Versión reproducible de referencia y de la integración continua**: Node.js **24.21.0**,
  fijada en `.node-version`. `actions/setup-node` la lee con `node-version-file`, y las
  mediciones de aceptación se realizan obligatoriamente con ella.
- **Rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`, aplicado por
  `devEngines.runtime` con `onFail: "error"`. `npm ci` rechaza las versiones fuera del rango,
  no cualquier versión distinta de 24.21.0.
- `devEngines.packageManager` declara npm con un rango coherente con el de Node.js: como mínimo
  la versión de npm incluida con 24.21.0 y por debajo de la siguiente versión mayor.

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

**Testing**: Vitest 5 en entorno Node, con bloqueo de red. Además, una prueba de humo con un
script de Node sin dependencias, que arranca el servidor real con `npm start`, con `npm run dev`
(en una copia temporal) y con `next start` directo.

**Target Platform**: servidor Node.js en macOS (arm64 y x64) y Linux (x64 y arm64). Windows solo
mediante WSL, sin verificación.

**Project Type**: aplicación web, como monolito modular de una sola unidad desplegable. En esta
funcionalidad no tiene interfaz visible.

**Performance Goals**: comando agregado local en menos de 10 minutos en el entorno de referencia
(SC-002); cada job de integración continua en menos de 15 minutos (SC-004). La estimación es de
menos de 4 y menos de 8 minutos, respectivamente (research.md, R15).

**Constraints**: sin llamadas externas en ejecución ni en pruebas, sin secretos, sin
autenticación, sin interfaz y sin persistencia. Escucha solo en `127.0.0.1` en local.

**Scale/Scope**: un endpoint, cuatro módulos de capa vacíos, un módulo de plataforma, ocho
categorías de control, nueve controles requeridos en la integración continua y dos sistemas
operativos verificados.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Evaluación inicial (antes de la Fase 0)

| # | Puerta constitucional | Estado | Evidencia |
|---|-----------------------|--------|-----------|
| 1 | Procedencia normativa (I) | **N/A** | No se procesa normativa (FR-007). FR-028 prohíbe incluir documentos normativos sin procedencia. |
| 2 | Cuatro capas y contratos (II) | **Cumple** | FR-023 exige cuatro ubicaciones con reglas de dependencia. |
| 3 | Publicación solo con aprobación (III) | **N/A** | No hay contenido publicable ni integración con Moodle (FR-007). |
| 4 | Salidas validadas por esquema (IV) | **Cumple (aplicación parcial)** | No hay salidas de IA. La configuración y la respuesta de estado tienen esquema y validación (FR-005 y FR-006). |
| 5 | Mínimo privilegio, secretos, archivos, acceso y auditoría (V) | **Cumple** | FR-002 a FR-004, FR-014, FR-017 a FR-021 y FR-028. No hay subida de archivos, usuarios ni eventos sensibles que auditar: esas partes son N/A. |
| 6 | Publicación idempotente (VI) | **N/A** | No hay publicación en Moodle. |
| 7 | Porción vertical pequeña; nada de UF0517 ni ADGG0408 (VII) | **Cumple** | FR-024; alcance limitado por la aclaración 1. |
| 8 | Pruebas obligatorias (VIII) | **Cumple** | FR-011 a FR-013 y SC-003 a SC-005. Las áreas de lógica normativa, publicación y aprobación son N/A. |
| 9 | IA mediante adaptadores y con control de costes (IX) | **N/A** | No hay IA (FR-007). |
| 10 | Accesibilidad y lenguaje claro (X) | **N/A (interfaz)** | Sin interfaz visible (FR-009). La documentación se redacta en español claro (FR-025). |
| 11 | Registro de generaciones, revisiones, publicaciones y decisiones (XI) | **Cumple** | FR-008 (registros estructurados) y FR-027 (ADR). No hay generaciones, revisiones ni publicaciones. |
| 12 | Complejidad justificada (XII) | **Cumple** | Sin decisiones de infraestructura en la especificación; las herramientas se justifican en la Fase 0 y los ADR. |

**Resultado**: supera todas las puertas y no hay violaciones que justificar. Se puede pasar a la
Fase 0.

### Reevaluación tras el diseño (Fase 1)

| # | Puerta | Estado | Evidencia en el diseño |
|---|--------|--------|------------------------|
| 1 | Procedencia normativa (I) | **N/A** | El repositorio no contiene normativa. La detección de secretos y la revisión del pull request verifican que no se añada. |
| 2 | Cuatro capas (II) | **Cumple** | `src/modules/{normative-source, structured-interpretation, didactic-content, moodle-publication}` con `index.ts` público y `README.md`. Matriz de dependencias en [data-model.md](./data-model.md#matriz-de-dependencias-entre-capas), forzada con `no-restricted-imports` y verificada en `tests/architecture/import-boundaries.test.ts`. La entrega (`src/app` y `instrumentation`) solo puede importar las API públicas de `src/platform`; no importa ninguna capa de dominio. |
| 3 | Aprobación docente (III) | **N/A** | No hay rutas de publicación. |
| 4 | Esquemas (IV) | **Cumple** | Un único esquema Zod de configuración, usado por el preflight, por `instrumentation` y por la ruta de estado. Contrato [health.openapi.yaml](./contracts/health.openapi.yaml) con `additionalProperties: false`, verificado en una prueba de contrato y en la prueba de humo. Los errores nunca se corrigen en silencio: el preflight termina con código 1 antes de arrancar Next.js. |
| 5 | Seguridad (V) | **Cumple** | `.env.example` sin secretos y `.env.*` excluido de Git; escucha solo en `127.0.0.1`; `poweredByHeader: false`; optimizador de imágenes desactivado; telemetría desactivada; `ignore-scripts=true`; Gitleaks sobre todo el historial del commit y sobre el árbol de trabajo sin ficheros ignorados; `npm audit` bloqueante en gravedad alta o crítica; `permissions: {}` y `contents: read`; solo el token efímero de la plataforma, sin secretos del proyecto ni credenciales de larga duración o de escritura, y sin pasarlo a código del repositorio; `persist-credentials: false`; acciones fijadas por SHA; zizmor. La comprobación de estado es pública sin autenticación, conforme a la aclaración 2. |
| 6 | Idempotencia (VI) | **N/A** | — |
| 7 | Porción vertical (VII) | **Cumple** | Un solo endpoint. `tests/architecture/no-domain-specifics.test.ts` busca los códigos de certificado en `src/`, `tests/`, `scripts/` y la configuración, construyendo el patrón a partir de fragmentos para que el propio test no los contenga. |
| 8 | Pruebas (VIII) | **Cumple** | Estrategia de pruebas más abajo: configuración, arranque en ambos modos, contrato, ausencia de interfaz, campos adicionales, registros, límites y determinismo. Una prueba negativa local y un pull request negativo por cada una de las ocho categorías. |
| 9 | IA (IX) | **N/A (preparado)** | Las reglas de lint prohíben `fetch` y los módulos de red en `src/`. Cualquier llamada externa futura tendrá que pasar por un adaptador explícito. |
| 10 | Accesibilidad (X) | **N/A (interfaz)** | La ruta comodín y las reescrituras hacen que toda ruta distinta de `/api/health` responda 404 sin cuerpo, así que no hay página visible, tampoco la 404 del framework. La documentación está en español claro. |
| 11 | Observabilidad (XI) | **Cumple** | Pino en JSON con `service`, `environment` y `requestId`; redacción de campos sensibles; ADR 0001 y 0002. |
| 12 | Simplicidad (XII) | **Cumple** | Una unidad desplegable; sin base de datos, contenedores ni servicios adicionales. Cada herramienta está justificada en research.md (R1 a R14), y las decisiones de consecuencias operativas, en los ADR 0001 y 0002. Dos binarios externos (Gitleaks y zizmor) justificados en R11 y R13. `@next/env` ya forma parte de Next.js; se declara directamente para usarlo en el preflight (R8). |

**Resultado**: supera todas las puertas y no hay violaciones. La sección Complexity Tracking queda
vacía.

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
│   └── requirements.md      # Calidad de la especificación
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
├── preflight.mjs                 # Carga .env* con @next/env y valida antes de next dev/start
├── smoke-test.mjs                # Arranque real en ambos modos y matriz de rutas sin HTML
├── check-secrets.mjs             # Gitleaks: historial de HEAD + árbol de trabajo sin ignorados
├── check-dependencies.mjs        # npm audit con umbral, excepciones y firmas
├── negative-checks.mjs           # Pruebas negativas automatizadas en una copia temporal
└── tools/
    ├── install-tools.mjs         # Instala gitleaks y zizmor verificando SHA-256
    └── tools.lock.json           # Versiones y SHA-256 por plataforma

security/
└── audit-exceptions.json         # Excepciones de dependencias (vacío)

src/
├── app/
│   ├── api/health/route.ts       # GET /api/health; valida la instantánea de configuración
│   └── [[...path]]/route.ts      # 404 sin cuerpo para cualquier otra ruta y método
├── instrumentation.ts            # register(): delega en Node (defensa en profundidad)
├── instrumentation-node.ts       # Revalida la configuración; exit(1) si falla
├── platform/                     # API pública: el index.ts de cada área
│   ├── config/index.ts           # Módulo portable: esquema Zod, parseConfig e instantánea
│   ├── logging/index.ts          # Módulo portable: logger Pino con redacción y destino inyectable
│   ├── health/index.ts           # Construcción del estado { status, version }
│   └── version/index.ts          # Versión desde package.json
└── modules/
    ├── normative-source/         # index.ts (vacío) + README.md
    ├── structured-interpretation/
    ├── didactic-content/
    └── moodle-publication/

tests/
├── setup/no-network.ts           # Bloqueo de red en todas las pruebas
├── unit/platform/                # Configuración, registros y estado
├── contract/
│   ├── health.contract.test.ts
│   └── not-found.contract.test.ts
└── architecture/
    ├── import-boundaries.test.ts
    ├── no-domain-specifics.test.ts
    └── dependency-versions.test.ts  # @next/env y next con la misma versión exacta

.env.example                      # Plantilla documentada, valores ficticios válidos
.gitleaksignore                   # Huellas de excepciones (vacío)
.node-version                     # 24.21.0: referencia, CI y aceptación
.npmrc                            # ignore-scripts, save-exact, fund=false
.prettierignore
eslint.config.mjs
next.config.ts                    # poweredByHeader: false, images.unoptimized, rewrites a 404
package.json / package-lock.json  # "type": "module"
prettier.config.mjs
tsconfig.json
vitest.config.ts
README.md                         # Visión general y enlace al recorrido
CONTRIBUTING.md                   # Ramas, pull requests, flujo Spec Kit y Definition of Done
SECURITY.md                       # Notificación y procedimiento ante un secreto expuesto
```

Cambios en `.gitignore`: añadir `next-env.d.ts`, `.tools/` y `*.tsbuildinfo`.

**Structure Decision**: un único proyecto Next.js en la raíz del repositorio. `src/app` es solo
la capa de entrega HTTP y, en esta funcionalidad, **solo importa las API públicas de
`src/platform`**. `src/platform` contiene lo transversal. `src/modules/<capa>` hace visibles
las cuatro capas del principio II, con nombres en inglés, vacías y sujetas solo a la dirección
de dependencias de la constitución. La primera porción vertical de producto definirá sus
puntos de entrada y ampliará las dependencias de la entrega solo si lo justifica. No hay
directorios `frontend/` ni `backend/` separados (principio XII y ADR 0001).

**Configuración de Next.js** (`next.config.ts`, research.md R1):

- `poweredByHeader: false`;
- `images.unoptimized: true`, que desactiva el optimizador de imágenes de `/_next/image`;
- `rewrites().beforeFiles` que envía `/404`, `/500`, `/_not-found`, `/_error`, `/_app`,
  `/_document` y `/_next/:path*` a la ruta interna `/__not-found`. Esa ruta no existe como tal:
  la resuelve el comodín `src/app/[[...path]]/route.ts`, que responde 404 sin cuerpo;
- ninguna otra opción: sin `proxy` (middleware) ni `skipTrailingSlashRedirect`.

## Comandos npm

Todos los comandos se ejecutan igual en local y en la integración continua (FR-016). Los que
llaman a Next.js incluyen `NEXT_TELEMETRY_DISABLED=1`.

| Script | Acción | Categoría |
|--------|--------|-----------|
| `dev` | `node scripts/preflight.mjs dev && next dev --hostname 127.0.0.1` (carga `.env.development.local`) | Ejecución |
| `build` | `next build` | Construcción |
| `start` | `node scripts/preflight.mjs start && next start --hostname 127.0.0.1` (configuración desde el entorno) | Ejecución |
| `format` | `prettier --write .` | Utilidad (no es un control) |
| `check:format` | `prettier --check .` | Formato |
| `check:lint` | `eslint . --max-warnings=0` | Análisis estático y límites |
| `check:types` | `next typegen && tsc --noEmit` | Tipos |
| `check:test` | `vitest run` | Pruebas |
| `check:build` | `next build && node scripts/smoke-test.mjs` | Construcción (incluye el arranque real en ambos modos) |
| `check:secrets` | `node scripts/check-secrets.mjs`: historial de `HEAD` y árbol de trabajo sin ficheros ignorados | Secretos |
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
`check:secrets` es el mismo comando que en local. El análisis del historial de `HEAD` es el que
aporta: el árbol de trabajo coincide con el commit, así que su análisis es redundante e inocuo.

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
4. Comprueba que el comando termina con código distinto de 0 y que su salida identifica la
   categoría.
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
| 5 | Construcción (`build`) | Añade un Route Handler con `dynamic = "force-static"` que lanza una excepción al evaluarse; los tipos son correctos | `check:build` falla al recoger datos de la ruta |
| 6 | Secretos (`secrets`) | Genera **en tiempo de ejecución** tokens sintéticos con formato de token de GitHub (prefijo y 36 caracteres aleatorios); el script no contiene ningún literal. Tres subcasos, cada uno en su propia copia: **(a)** el token en un commit de la copia; **(b)** el token en un fichero **nuevo sin seguimiento y no ignorado**, sin commit; **(c)** control de exclusión: el token solo en `.env.development.local`, que la copia ignora | (a) y (b): `check:secrets` falla (regla `github-pat`) y nombra el fichero. (c): `check:secrets` **termina con éxito**, lo que demuestra que los ficheros ignorados no se examinan |
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

Esta autorización **no elude la protección de `main`**: solo permite que el valor sintético
llegue a una rama de prueba. El pull request sigue en borrador, no se integra y debe mostrar el
control `secrets` fallido, que es precisamente lo que se verifica.

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
| Validación de configuración | `tests/unit/platform/config.test.ts` | Unitaria | Configuración válida aceptada; variable ausente, vacía, inválida o desconocida rechazada con `{ key, problem }`; un **valor centinela sintético** nunca aparece en el mensaje (FR-005) |
| Arranque en producción (`npm start`) | `scripts/smoke-test.mjs`, en el repositorio con la compilación recién hecha | Integración (bucle local) | Casos ausente, vacía, valor inválido (centinela) y clave desconocida: el proceso termina con código distinto de 0 en menos de 20 s; el puerto **no acepta ninguna conexión** en toda la vida del proceso; la salida nombra la clave y el tipo de problema y no contiene el centinela. Caso válido: 200 con el cuerpo del contrato |
| Arranque en desarrollo (`npm run dev`) | `scripts/smoke-test.mjs`, en una copia temporal sin ficheros ignorados y con `npm ci` desde la caché (research.md, R14) | Integración (bucle local) | La prueba escribe su propio `.env.development.local` en cada caso. Valor inválido en el fichero, clave ausente en el fichero y variable de proceso vacía que prevalece sobre un fichero válido: código distinto de 0, puerto nunca abierto y sin centinela. Fichero válido: 200. Recarga en caliente: tras reescribir el fichero con un valor inválido y esperar a la línea "Reload env", `/api/health` responde 500 sin cuerpo y nunca "ok" |
| Defensa de `instrumentation` | `scripts/smoke-test.mjs` | Integración (bucle local) | `next start` invocado **directamente**, sin preflight, con un valor inválido: código 1 y nunca una respuesta 200 |
| Contrato del endpoint | `tests/contract/health.contract.test.ts` | Contrato | Se llama directamente a `GET` del Route Handler: código 200, `application/json`, `Cache-Control: no-store` y cuerpo **exactamente** igual a `{ status: "ok", version: <package.json> }`. Con una configuración inválida, `GET` lanza un error y nunca devuelve "ok" |
| Sin campos adicionales | Misma prueba y `smoke-test.mjs` | Contrato | `Object.keys(body)` es exactamente `["status", "version"]`; sin cabeceras `x-powered-by` ni `server` |
| Ausencia de interfaz | `tests/contract/not-found.contract.test.ts` y `smoke-test.mjs` | Contrato | Cada método exportado por el comodín responde 404 con cuerpo `null` y `Cache-Control: no-store`. En el servidor real, la matriz de rutas de research.md (R1) cumple que **ninguna respuesta contiene HTML**, que toda ruta no definida (`/`, `/foo`, `/api`, `/api/health/extra`, `/favicon.ico`, `/404`, `/_not-found`, `/_next/data/…`, `/_next/image…`, `/_next/static/…`) responde 404 sin cuerpo y que las URL no canónicas responden 308 sin HTML. Se ejecuta completa en `npm start` y con una muestra en `npm run dev`; excluye `/__nextjs_*` (K11) |
| Registros sin datos sensibles | `tests/unit/platform/logging.test.ts` | Unitaria | Destino en memoria; cada línea es JSON con `level`, `time`, `service`, `environment` y `msg`; los campos sensibles sintéticos quedan como `[REDACTED]`; el error de configuración no contiene el valor |
| Límites de importación | `tests/architecture/import-boundaries.test.ts` | Arquitectura | Con la API de ESLint (`lintText` y una ruta sintética en cada ubicación), cada dependencia prohibida de la matriz da error y cada dependencia permitida no. Incluye: `src/app` o `instrumentation` que importa `@/modules/<capa>` da error; `src/app` que importa `@/platform/<área>` no; `@/platform/<área>/<interno>` desde fuera da error; `process.env` fuera de las ubicaciones permitidas da error; una importación relativa o con `@/` en un módulo portable da error |
| Versiones enlazadas | `tests/architecture/dependency-versions.test.ts` | Arquitectura | `package.json` declara `next` y `@next/env` con la misma versión exacta (K12) |
| Sin lógica de dominio | `tests/architecture/no-domain-specifics.test.ts` | Arquitectura | Sin coincidencias de los códigos de certificado en los ficheros versionados de código y configuración (FR-024) |
| Determinismo sin red | `tests/setup/no-network.ts` más un procedimiento de aceptación | Transversal | Cualquier `fetch` o conexión a un destino que no sea de bucle local hace fallar la prueba. Aceptación: diez ejecuciones de `npm run check:test`, cinco con la red activa y cinco con la red desactivada, con el mismo resultado (SC-005) |

Todas las pruebas usan datos sintéticos, no tienen dependencias de hora (sin comprobar marcas de
tiempo absolutas) y se ejecutan sin ficheros `.env` del repositorio. La prueba de humo:

- construye el entorno de cada caso desde cero: elimina toda variable `AULANORMA_*` heredada,
  por ejemplo las que la integración continua define a nivel de job o las exportadas en la
  terminal, que prevalecerían sobre `.env.development.local`, y define solo las del caso;
- usa un puerto libre asignado por el sistema;
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
2. **Integración**: el pull request se integra con los nueve controles en verde: los ocho de
   categoría y `macos-quality`.
3. **Primera ejecución en `main`**: se confirma que los nueve jobs (`format`, `lint`, `types`,
   `test`, `build`, `macos-quality`, `secrets`, `dependencies` y `workflows`) pasan en el `push` a
   `main`.
4. **Inmediatamente después**, y antes de cualquier otro cambio, el mantenedor añade esos nueve
   nombres como **controles de estado requeridos** en la regla existente de `main`. Si es una
   regla clásica de protección de rama, en "Require status checks to pass" con "Require branches
   to be up to date". Si es un ruleset, en "Require status checks to pass". El mecanismo concreto
   se comprueba en la implementación con
   `gh api repos/Informatica-Colectivo-Prime/aulanorma/rulesets` y
   `…/branches/main/protection`.
5. Se mantiene: sin pushes directos ni forzados, **sin actores con permiso para eludirla**
   (tampoco administradores) y sin aprobación de otra persona mientras haya un único mantenedor.
   La revisión se documenta con la lista de comprobación constitucional.
6. **Sin desactivación de emergencia**: ante una incidencia se espera a resolverla o se modifica
   formalmente la gobernanza (aclaración 4).
7. **Registro**: el primer pull request posterior, ya sujeto a los controles requeridos, añade a
   `docs/engineering/branch-protection.md` la fecha de activación, el enlace a la ejecución de
   `main` y la lista de controles activada, y completa en `acceptance.md` la evidencia de `main`
   de SC-004 y SC-007 y la de SC-009 (ver "Matriz de aceptación").

## Matriz de aceptación

Cada criterio de éxito se verifica con un procedimiento manual reproducible o con una ejecución
registrada, y su evidencia se guarda en `specs/001-engineering-baseline/acceptance.md`, que se
crea durante la implementación. Estas verificaciones **no son controles**: ningún workflow las
ejecuta, no se añaden a los controles requeridos y no se repiten en cada pull request. La
garantía continua la dan los nueve controles requeridos (FR-015).

**Reglas comunes**:

- **Commit candidato**: el último commit del pull request de la funcionalidad. Si después
  cambian el código, los scripts, las dependencias, los workflows o la documentación que usa un
  procedimiento, se repiten las verificaciones afectadas sobre el nuevo commit candidato.
- **Versión de Node.js**: todas las mediciones locales se hacen con Node.js **24.21.0**
  (`node --version` muestra `v24.21.0`), aunque el rango de desarrollo admita otras versiones
  de la línea 24. La integración continua usa la misma versión desde `.node-version`.
- **Entorno de referencia**: el macOS del mantenedor, descrito en
  `docs/engineering/reference-environment.md` (FR-001a).
- **Estado de cada criterio** en `acceptance.md`: **Superado**, **No superado** o
  **Pendiente**. Solo se marca Superado con toda la evidencia de la fila.
- **Contenido de `acceptance.md`**: fechas, commits, enlaces, salidas y cifras. Nunca secretos,
  valores de tokens (tampoco los sintéticos), datos personales reales ni salidas de Gitleaks sin
  `--redact`.

| Criterio | Procedimiento exacto | Entorno | Evidencia en `acceptance.md` | Momento |
|----------|----------------------|---------|------------------------------|---------|
| **SC-001** Arranque desde un clon limpio | Con los requisitos previos ya instalados, que no cuentan en el tiempo, y `node --version` igual a `v24.21.0`, se pone en marcha el cronómetro. Se clona la rama de la funcionalidad en un directorio vacío (`git clone --branch 001-engineering-baseline …`) y se siguen solo `README.md` y la documentación enlazada, que reproducen los pasos 1 a 3 del [quickstart](./quickstart.md), hasta que `curl -i http://127.0.0.1:3000/api/health` devuelve 200 con el cuerpo del contrato. Ahí se para el cronómetro. Lo ejecuta una persona sin conocimiento previo del proyecto, como exige SC-001, sin ayuda externa. El mantenedor puede preparar el entorno (requisitos previos instalados) y observar o registrar la prueba, pero no sustituir a esa persona. Después se repite el mismo procedimiento en Linux | macOS de referencia y una máquina o máquina virtual Linux (x64 o arm64), ambas con Node.js 24.21.0 | Por cada sistema: fecha, commit, sistema operativo y arquitectura, `node --version` y `npm --version`, rol del ejecutor (sin datos personales), confirmación de que no tenía conocimiento previo ni recibió ayuda, hora de inicio, hora de fin, duración, salida de `curl` y desviaciones respecto a la documentación. Superado solo cuando esa persona completa el recorrido desde el clon limpio en macOS en menos de 30 minutos, Linux termina con éxito, ambos sin desviaciones, y la evidencia queda registrada | Antes de integrar, sobre el commit candidato. Si todavía no hay una persona sin conocimiento previo disponible, SC-001 queda **Pendiente** en `acceptance.md` y en la descripción del pull request; nunca se marca como superado ni se sustituye por una ejecución del mantenedor. La regla es análoga a la de SC-008, pero cada criterio conserva su procedimiento propio |
| **SC-002** Comandos de calidad locales | En el clon de SC-001 en macOS, con `npm ci` y `npm run tools:install` ya ejecutados, se ejecuta cada comando de categoría por separado (`check:format`, `check:lint`, `check:types`, `check:test`, `check:build`, `check:secrets`, `check:deps` y `check:workflows`) y después `time npm run check` | macOS de referencia con Node.js 24.21.0 | Commit, `node --version`, código de salida de los ocho comandos y del agregado, tiempo real (`real`) de `time npm run check` y resumen de su salida. Superado si todos terminan con código 0 y el agregado tarda menos de 10 minutos | Antes de integrar, sobre el commit candidato |
| **SC-003** Pruebas negativas | **Local**: se anotan `git status --porcelain` y `git rev-parse HEAD`, se ejecuta `npm run verify:negative` y se comparan ambos valores después. **Integración continua**: los ocho pull requests negativos en borrador de "Aceptación en la integración continua", incluido el procedimiento de protección de push del caso de secretos. Al terminar, `git ls-remote --heads origin 'negative-test/*'` no devuelve nada | Local: macOS de referencia con Node.js 24.21.0, y repetición en Linux (paso 8 del quickstart). Integración continua: los runners de los workflows | Salida de `verify:negative` con el resultado de las ocho categorías, incluidos los subcasos de fichero sin seguimiento y de fichero ignorado de secretos; código de salida 0; estado de Git idéntico antes y después. Por categoría: enlace al pull request cerrado sin integrar, enlace a la ejecución y nombre del control fallido, y también `macos-quality` en las categorías 1 a 5. En secretos, la autorización de la protección de push si la hubo, sin el valor del token. Salida vacía de `git ls-remote` | Antes de integrar, cuando los workflows ya se ejecutan en el pull request de la funcionalidad; las ramas negativas parten del commit candidato |
| **SC-004** Activación y duración de los controles | **Pull request**: sobre el pull request de la funcionalidad, en el commit candidato, se usan la ejecución inicial de cada workflow (`quality` y `security`) y dos reejecuciones completas ("Re-run all jobs" o `gh run rerun <id>` sin `--failed`). Se espera a que termine cada intento antes de lanzar el siguiente y no se añaden commits entre intentos. **`main`**: la ejecución del `push` que produce la integración. Los datos se obtienen con `gh run view <id> --attempt <n> --json jobs` o con la API de intentos de ejecución | Runners `ubuntu-24.04` y `macos-26`, con Node.js 24.21.0 desde `.node-version` | Para cada uno de los tres intentos del pull request y para la ejecución de `main`, por workflow: identificador de la ejecución, número de intento y SHA del commit. Por cada uno de los nueve jobs: inicio (`started_at`, cuando el ejecutor empieza el job), final (`completed_at`), duración y conclusión. Superado si en los cuatro casos aparecen los nueve controles completados y cada uno dura menos de 15 minutos. Un intento afectado por una indisponibilidad general del proveedor o por una cancelación manual se registra con su motivo, queda excluido y se sustituye por otro intento completo | Pull request: antes de integrar. `main`: inmediatamente después de integrar y antes de activar los controles requeridos |
| **SC-005** Determinismo con y sin red | Sobre el mismo commit, cinco ejecuciones de `npm run check:test` con la red activa y cinco con la red desactivada (Wi-Fi apagado o cable desconectado), guardando la salida de cada una. Antes de las ejecuciones sin red se comprueba que `curl -sS --max-time 5 https://registry.npmjs.org/ -o /dev/null` falla | macOS de referencia con Node.js 24.21.0, tras `npm ci` | Commit y, por ejecución: modo (con o sin red), código de salida y número de ficheros y de pruebas superadas y fallidas del resumen de Vitest. Resultado de la comprobación de red. Superado si las diez terminan con código 0 y con los mismos recuentos | Antes de integrar, sobre el commit candidato |
| **SC-006** Cero secretos reales | En el clon de SC-001: `diff .env.example .env.development.local` no muestra diferencias, porque la configuración local se creó solo copiando la plantilla; `.env.example` solo contiene `AULANORMA_LOG_LEVEL` y `AULANORMA_ENVIRONMENT`, con valores ficticios que no son secretos. En el commit candidato: `grep -rnE 'secrets\.\|github\.token\|GITHUB_TOKEN\|GH_TOKEN' .github/workflows` no devuelve coincidencias y los jobs solo definen las tres variables sintéticas del plan | macOS de referencia (clon de SC-001) y los workflows del commit candidato | Salida de `diff` y de `grep`, contenido de las claves de `.env.example` y enlaces a las ejecuciones de SC-004, que demuestran que arranque, pruebas y prueba de humo pasan sin secretos. Superado si ninguna comprobación muestra un secreto real ni una credencial pasada a código del repositorio | Antes de integrar, junto con SC-001 y SC-002 |
| **SC-007** Historial sin secretos | En el clon de SC-001: `git rev-parse --is-shallow-repository` devuelve `false` y `npm run check:secrets` recorre todo el historial alcanzable desde `HEAD` (`--log-opts="--full-history HEAD"`) y el árbol de trabajo. Se confirma con el job `secrets` (`fetch-depth: 0`) del pull request y de `main` | macOS de referencia con Node.js 24.21.0 y job `secrets` en `ubuntu-24.04` | Commit, `git rev-list --count HEAD`, número de commits que Gitleaks informa haber examinado, resultado sin hallazgos o lista de hallazgos exceptuados con su entrada en `docs/engineering/security-exceptions.md`, y enlaces a los jobs `secrets` del pull request y de `main`. Superado si hay cero hallazgos no justificados | Antes de integrar, sobre el commit candidato, y confirmación con la ejecución de `main` |
| **SC-008** Comprensión de la documentación | Una persona que no ha participado en la implementación recibe solo el enlace al repositorio y, sin explicaciones del mantenedor, lee `README.md` y `docs/engineering/` (`architecture.md`, `quality-controls.md` y `branch-protection.md`). Responde por escrito dónde está cada una de las cuatro capas y cuál es su responsabilidad, y enumera los nueve controles requeridos con su nombre exacto. El mantenedor compara las respuestas con la documentación | Cualquier equipo; no hace falta ejecutar nada | Identificador no personal del revisor (rol o seudónimo, sin datos personales), declaración de que no participó en la implementación, fecha, commit de la documentación leída, respuestas literales y resultado de cada uno de los trece elementos (cuatro capas y nueve controles). Superado solo con los trece correctos y sin ayuda | Cuando la documentación del commit candidato está completa. Si todavía no hay una persona disponible, SC-008 queda **Pendiente** en `acceptance.md` y en la descripción del pull request; no se marca como superado ni se sustituye por una revisión del mantenedor |
| **SC-009** Controles requeridos en `main` | Tras la ejecución de `main` de SC-004, el mantenedor añade los nueve nombres como controles requeridos (paso 4 de "Protección de `main`"). Después consulta `gh api repos/Informatica-Colectivo-Prime/aulanorma/branches/main/protection` o `gh api repos/Informatica-Colectivo-Prime/aulanorma/rules/branches/main`, según el mecanismo, y `git log --first-parent --format='%H %cI %s' origin/main` | Configuración del repositorio en GitHub, con un mantenedor con permisos | Fecha y hora de activación (y `updated_at` si es un ruleset), enlace a la ejecución de `main` usada, extracto de la respuesta que muestra los nueve nombres exactos como requeridos, sin actores con permiso de elusión y con los administradores sujetos a la regla, y lista de commits de `main` que muestra que no se integró nada entre la funcionalidad y la activación. Superado si están los nueve | Inmediatamente después de la ejecución de `main` y antes de cualquier otro cambio. Se registra en el primer pull request posterior |

## Fuera de alcance

Base de datos, interfaz visible, usuarios o autenticación, PDF y normativa, IA, Moodle y
despliegue en producción. La unidad desplegable existe, pero no se configura ningún destino de
despliegue.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No hay violaciones. Las herramientas añadidas a la hipótesis no son desviaciones del principio
XII:

- zizmor, el envoltorio de auditoría, el envoltorio de secretos y el instalador de binarios
  fijados son la forma más simple de cumplir FR-020, FR-021 y FR-014 sin secretos
  (research.md, R11 a R13, y ADR 0002);
- el preflight y `@next/env` son la forma más simple de cumplir FR-005 en los dos modos de
  arranque sin servidor propio, y `@next/env` ya forma parte de Next.js (research.md, R8, y
  ADR 0001);
- las reescrituras y el comodín solo usan configuración estándar de Next.js para cumplir FR-009
  (research.md, R1).
