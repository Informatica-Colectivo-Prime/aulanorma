# Investigación (Fase 0): Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Fecha**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

Este documento confirma o corrige la hipótesis técnica inicial con fuentes oficiales y con
pruebas desechables realizadas fuera del repositorio (`/tmp`, fuera del alcance del proyecto).
La revisión correctiva del 2026-09-25 añadió pruebas desechables sobre el arranque en ambos
modos (R8), la ausencia de interfaz (R1), la detección local de secretos (R11) y las copias
temporales (R14), con Next.js 16.3.6, Node.js 24.13.0 (la versión instalada en el equipo del
mantenedor, de la misma línea 24 LTS) y Gitleaks 8.30.1 verificado por SHA-256. Las pruebas
realizadas con 24.13.0 son **evidencia exploratoria** de la misma línea LTS: justifican las
decisiones, pero no sustituyen la aceptación definitiva, que se hace con 24.21.0 (R2 y la
matriz de aceptación de [plan.md](./plan.md#matriz-de-aceptación)).
Cada decisión sigue el formato **Decisión / Justificación / Alternativas descartadas**. Los
riesgos y consecuencias se recogen al final y en los ADR
[`0001`](../../docs/adr/0001-architecture-runtime-and-modular-structure.md) y
[`0002`](../../docs/adr/0002-quality-ci-and-security-strategy.md).

## Resumen de la verificación de la hipótesis

| Elemento de la hipótesis | Resultado | Versión fijada |
|--------------------------|-----------|----------------|
| Node.js 24 LTS | Confirmado, con revisión planificada hacia Node 26 LTS | 24.21.0 (referencia, CI y aceptación); rango de desarrollo `>=24.21.0 <25` |
| TypeScript estricto | **Corregido**: TypeScript 7 no es compatible con `typescript-eslint` | 6.0.3 |
| Next.js 16 con App Router | Confirmado, con ajustes obligatorios de seguridad, privacidad y ausencia de interfaz | 16.3.6 |
| (Nuevo) Carga de ficheros `.env` en el preflight | Añadido `@next/env`, el cargador que usa Next.js, en la misma versión | 16.3.6 |
| npm con lockfile | Confirmado, con scripts de instalación desactivados | npm 11 (incluido con Node 24.21.0) |
| Zod | Confirmado | 4.6.5 |
| Pino | Confirmado | 10.3.1 |
| Vitest | Confirmado; requiere declarar Vite explícitamente | 5.0.2 (Vite 8.3.1) |
| ESLint plano con límites de importación | Confirmado **sin** `eslint-config-next` | 10.11.0 |
| Prettier | Confirmado | 3.9.9 |
| GitHub Actions | Confirmado | `actions/checkout` v7.0.1, `actions/setup-node` v7.0.0 |
| Gitleaks | **Corregido**: CLI fijada, no la acción oficial, con envoltorio que examina historial y árbol de trabajo | 8.30.1 |
| Auditoría de dependencias | Confirmado `npm audit` con envoltorio de excepciones | npm 11 |
| (Nuevo) Auditoría de seguridad de workflows | Añadido zizmor, en modo sin red | 1.30.1 |

Fuentes de versiones consultadas el 2026-09-25: índice oficial de Node.js
(`nodejs.org/dist/index.json`), calendario oficial (`nodejs/Release/schedule.json`), registro
de npm (`npm view`), páginas de versiones publicadas en GitHub y documentación oficial de Next.js,
Gitleaks, zizmor y GitHub Actions.

---

## R1. Arquitectura: Next.js como monolito modular

**Decisión**: una única aplicación Next.js 16.3.6 con App Router, desplegable como una sola
unidad. En esta funcionalidad solo existen un Route Handler (`GET /api/health`) y un Route
Handler comodín que responde 404 sin cuerpo a cualquier otra ruta, reforzado con reescrituras
en `next.config.ts` (ajuste 3). El dominio vive en módulos TypeScript independientes del
framework (`src/modules/*`), y Next.js se limita a ser la capa de entrega.

**Justificación**:

- Principio XII: una sola unidad desplegable que en el futuro servirá la interfaz docente y
  la API del servidor sin crear hoy comportamiento de producto.
- La prueba desechable confirmó que Next.js 16.3.6 compila y arranca **sin páginas ni layout**:
  solo aparecen `/api/health` y la 404 del framework.
- Los Route Handlers `GET` son dinámicos y no se cachean por defecto; se añade
  `Cache-Control: no-store` de forma explícita.
- Separar el dominio en `src/modules` evita acoplarlo a Next.js, de modo que las capas se
  pueden probar sin servidor.

**Ajustes obligatorios detectados**:

1. **Telemetría**: Next.js envía telemetría anónima por defecto (documentación oficial
   `nextjs.org/telemetry`). Es una llamada externa prohibida por FR-007. Se desactiva con
   `NEXT_TELEMETRY_DISABLED=1` en todos los scripts npm y en la integración continua.
2. **Cabecera `X-Powered-By: Next.js`**: revela la dependencia. Se desactiva con
   `poweredByHeader: false` (documentación oficial de `next.config.js`).
3. **Ninguna página HTML del framework** (FR-009). Next.js genera por defecto una página 404
   HTML. La solución se verificó en una prueba desechable y tiene dos piezas:
   - **Route Handler comodín** `src/app/[[...path]]/route.ts`. Exporta `GET`, `HEAD`, `POST`,
     `PUT`, `PATCH`, `DELETE` y `OPTIONS`, y todos responden
     `new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } })`. Convive
     con `/api/health`, porque la ruta estática tiene prioridad. La compilación lista
     `ƒ /[[...path]]`, `ƒ /api/health` y `○ /_not-found`. Cubre `/`, las rutas anidadas, `/api`,
     `/api/health/extra`, `/favicon.ico`, `/robots.txt`, los métodos distintos de `GET` y las
     rutas con `..` codificado.
   - **Refuerzo en `next.config.ts`**, necesario porque el comodín no basta en `next start`.
     Next.js sigue compilando su página `/_not-found` y la sirve como HTML (6760 bytes, con
     `Cache-Control: s-maxage=31536000`) en `/_not-found`, `/404` y `/_next/data/*`. Además,
     `/_next/image` responde 400 en texto después de hacer una petición interna. Por eso:
     - `images: { unoptimized: true }` desactiva el optimizador de imágenes, que no hace falta
       y es superficie de ataque;
     - `rewrites().beforeFiles` envía `/404`, `/500`, `/_not-found`, `/_error`, `/_app`,
       `/_document` y `/_next/:path*` a una ruta interna, `/__not-found`, que resuelve el
       comodín. Sin páginas ni JavaScript de cliente, no hay nada legítimo bajo `/_next/`.

   **Evidencia** (53 peticiones por modo, con métodos y rutas límite):
   - **`next start`**: ninguna respuesta con HTML.
     - Toda ruta no definida responde 404, sin cuerpo y con `Cache-Control: no-store`.
     - `GET` y `HEAD` de `/api/health` responden 200.
     - `POST /api/health` responde 405 y `OPTIONS /api/health` responde 204, ambas sin cuerpo.
     - Las URL no canónicas (barra final como `/foo/` o `/api/health/`, y barras repetidas como
       `//` o `/foo//bar`) responden 308 hacia la URL canónica. El cuerpo es la ruta de destino
       en texto plano, sin HTML, y la URL canónica responde según el contrato.
   - **`next dev`**: las rutas de la aplicación se comportan igual. La única diferencia es el
     espacio de herramientas del servidor de desarrollo, `/__nextjs_*`, que se atiende antes
     del enrutado y no se puede configurar: por ejemplo, `/__nextjs_font/x` devuelve el texto
     `Not Found` y un `POST` mal formado a `/__nextjs_original-stack-frames` devuelve un error
     500 en HTML. Solo existe en `next dev`, escuchando en `127.0.0.1`. No forma parte del
     artefacto de `next start` ni de las rutas de la aplicación, por lo que queda fuera del
     contrato (K11).

   **Alternativas descartadas para la 404**:
   - Aceptar la 404 HTML por defecto: contradice FR-009. Queda eliminada como opción.
   - `app/not-found.tsx` o `global-not-found`: son componentes React que necesitan un layout
     raíz y producen HTML.
   - `proxy.ts` (middleware): añade middleware, excluido en el ADR 0001, sin cubrir nada que no
     cubran ya el comodín y las reescrituras en la matriz verificada.
   - `skipTrailingSlashRedirect: true`: se verificó que `/foo/` pasa a dar 404 directamente,
     pero `/api/health/` se convierte en una segunda URL válida (200) y `//` sigue dando 308.
     Se prefiere una única URL canónica por recurso.

   **Revisión planificada**: la primera funcionalidad con interfaz tendrá recursos de cliente
   bajo `/_next/static`, así que deberá revisar la reescritura de `/_next/:path*` y el comodín
   en su propio ADR.
4. **Enlace de red**: `next start` y `next dev` escuchan por defecto en todas las interfaces
   (la prueba mostró la URL de red local). Se fija `--hostname 127.0.0.1` en los scripts
   locales (principio V).

**Residuo conocido**: las respuestas del App Router incluyen la cabecera `Vary: rsc,
next-router-state-tree, …`, que no puede eliminarse sin complejidad adicional. No expone
configuración, entorno, rutas, commit, hora de arranque ni versiones de dependencias; se
documenta en el contrato y en el ADR 0001. No es una página ni una interfaz visible.

**Alternativas descartadas**:

- **Frontend y backend separados** (por ejemplo, SPA con Vite y API con Fastify): dos unidades
  desplegables, dos pipelines y un contrato HTTP interno. Viola el principio XII sin necesidad
  medida.
- **Solo servidor HTTP ahora** (Fastify, Hono o `node:http`) e incorporar la interfaz después:
  más simple hoy, pero obligaría a reestructurar o a añadir una segunda unidad cuando llegue la
  interfaz docente, que es un requisito conocido del producto.
- **React Router 7 (modo framework), SvelteKit o Nuxt**: equivalentes en capacidad, pero con
  menos documentación oficial y ecosistema alrededor de Server Components y Route Handlers. No
  aportan ventajas concretas a este proyecto.
- **Servidor personalizado de Next.js** para validar la configuración antes de escuchar: el
  propio Next.js desaconseja esa opción porque pierde optimizaciones. El preflight previo a
  Next.js (R8) cubre la necesidad sin servidor propio.

**Coste aceptado**: `react` y `react-dom` son dependencias obligatorias de Next.js aunque todavía
no haya interfaz. Next.js tiene historial de avisos de seguridad graves (por ejemplo,
CVE-2025-29927 sobre middleware y CVE-2025-55182 sobre React Server Components). Se mitiga con
versiones fijadas y parcheadas, `npm audit` bloqueante, actualizaciones de Dependabot y ausencia
de middleware y autenticación en esta funcionalidad. La prueba desechable con 16.3.6 y 19.3.0
dio `found 0 vulnerabilities`.

## R2. Runtime: Node.js 24 LTS

**Decisión**: Node.js 24 LTS ("Krypton"), con dos niveles distintos:

- **Versión reproducible de referencia y de la integración continua**: **24.21.0**, publicada
  el 2026-09-07 y fijada en `.node-version`. La integración continua la lee de ese fichero, y
  las mediciones de aceptación se realizan obligatoriamente con ella.
- **Rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`, declarado en
  `devEngines.runtime` de `package.json` con `onFail: "error"`.

**Justificación**:

- Según el calendario oficial, Node 24 es LTS desde el 2025-10-28, pasa a mantenimiento el
  2026-10-20 y tiene soporte hasta el **2028-04-30**. Cubre de sobra la duración del TFM.
- Todas las dependencias lo admiten: Next.js `>=20.9.0`, Vitest `^24.0.0`, ESLint `>=24`,
  Vite `>=22.12.0`.
- Se usa `devEngines` en lugar de `engines` con `engine-strict`, porque este último también
  aplicaría las restricciones de `engines` de cada dependencia transitiva.

**Consecuencias**:

- `npm ci` rechaza, con un mensaje claro, las versiones **fuera del rango**, no cualquier
  versión distinta de 24.21.0. Por ejemplo, rechaza 24.13.0 (por debajo del mínimo) y 26.x, y
  admite una 24.x posterior a 24.21.0 para desarrollar.
- El equipo del mantenedor tiene hoy Node 24.13.0, fuera del rango. Para la aceptación debe
  instalar 24.21.0, la versión de `.node-version`, y registrarla en
  `docs/engineering/reference-environment.md`. Una versión posterior de la línea 24 es válida
  para desarrollar, pero no para las mediciones de aceptación.
- Las pruebas desechables de esta investigación, hechas con 24.13.0, son evidencia
  exploratoria de la misma línea LTS y no sustituyen la aceptación con 24.21.0.

**Alternativas descartadas**:

- **Node 26.10.0** (Current): pasará a LTS el 2026-10-28. No es LTS hoy y la constitución exige
  versiones estables y soportadas. **Revisión planificada**: tras el 2026-10-28, abrir un cambio
  con su propio ADR para migrar a Node 26 LTS si Next.js, Vitest y ESLint lo mantienen admitido.
- **Node 22 LTS**: en mantenimiento desde 2025-10-21 y con fin de soporte el 2027-04-30; menos
  margen que Node 24.

## R3. Gestor de paquetes: npm

**Decisión**: npm, en la versión incluida con Node 24.21.0 (serie 11), con `package-lock.json`
versionado e instalación con `npm ci`. El `.npmrc` del proyecto fija `ignore-scripts=true`,
`save-exact=true`, `fund=false` y `audit=true`. `devEngines.packageManager` declara npm con un
rango coherente con el de Node.js: como mínimo la versión de npm incluida con 24.21.0, que se
anota durante la implementación, y por debajo de la siguiente versión mayor. Una versión exacta
de npm rechazaría las versiones posteriores de Node.js 24 que el rango admite.

**Justificación**:

- Viene con Node, así que no añade requisitos previos (SC-001).
- `npm ci` instala de forma reproducible desde el lockfile.
- `npm audit` y `npm audit signatures` vienen integrados. La prueba desechable verificó 28
  firmas de registro y 19 atestaciones de procedencia.
- **`ignore-scripts=true`** bloquea los scripts de instalación de dependencias, una vía habitual
  de ataque a la cadena de suministro. La prueba desechable instaló con `--ignore-scripts` y
  Next.js compiló y arrancó sin problemas: los binarios nativos (`@next/swc-*`) llegan como
  dependencias opcionales precompiladas.
- `actions/setup-node` v7 activa la caché de npm automáticamente cuando `package.json` declara
  npm en `devEngines.packageManager` (documentación de `action.yml`).

**Alternativas descartadas**:

- **pnpm**: tiene mejores controles de cadena de suministro (dependencias estrictas, lista de
  paquetes con compilación permitida), pero es un requisito previo adicional, y Corepack ya no se
  distribuye con Node a partir de Node 25. No compensa en un monolito pequeño.
- **Yarn Berry**: modo Plug'n'Play con fricción conocida en Next.js y herramientas; es otro
  requisito previo.
- **Bun**: runtime y gestor distintos de Node, lo que añade una segunda plataforma que soportar.

## R4. Lenguaje y tipos: TypeScript 6.0.3 estricto

**Decisión**: TypeScript **6.0.3**, con `strict: true`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`,
`useUnknownInCatchVariables`, `verbatimModuleSyntax` y `erasableSyntaxOnly`. Esta última
garantiza que el TypeScript de `src/` solo usa sintaxis que Node.js puede eliminar de forma
nativa, lo que necesita el preflight (R8). Se verificó `tsc --noEmit` con TypeScript 6.0.3 y
esas opciones. El control de tipos es `next typegen && tsc --noEmit`.

**Justificación**:

- **Corrección de la hipótesis**: la última versión es TypeScript 7.0.2, la reescritura nativa,
  y Next.js 16 la admite mediante la CLI (documentación oficial "Using TypeScript 7"). Sin
  embargo, `typescript-eslint` 8.70.1 declara la dependencia par `typescript >=4.8.4 <6.1.0`,
  porque TypeScript 7 no ofrece la API de compilador en JavaScript que necesita el análisis
  estático con información de tipos. Se elige la última versión compatible con todo el conjunto.
- `next typegen` genera `next-env.d.ts` y los tipos de rutas sin compilar la aplicación
  (documentación oficial de TypeScript en Next.js). Así el control de tipos es independiente del
  de compilación. `next-env.d.ts` se añade a `.gitignore`, como indica esa documentación.

**Alternativas descartadas**:

- **TypeScript 7**: incompatible con `typescript-eslint`. Se revisará cuando `typescript-eslint`
  lo admita.
- **JavaScript con JSDoc**: tipado más débil, contrario al principio IV y a la calidad esperada.

## R5. Formato: Prettier 3.9.9

**Decisión**: Prettier 3.9.9 con configuración mínima explícita y `.prettierignore`
(`.next/`, `coverage/`, `.tools/`, `package-lock.json`, `next-env.d.ts`). El control es
`prettier --check .`.

**Justificación**: es el estándar de facto, no tiene dependencias propias y funciona igual en
macOS y Linux. La configuración de ESLint no incluye reglas de estilo, así que no hace falta
`eslint-config-prettier`: las configuraciones recomendadas de `@eslint/js` y `typescript-eslint`
no tienen reglas de formato.

**Alternativas descartadas**:

- **Biome** (formato y lint en una herramienta): menos dependencias, pero no tiene reglas con
  información de tipos equivalentes a `typescript-eslint` y habría que expresar los límites de
  importación de otra forma.
- **dprint**: menor adopción y requiere configuración de complementos.

## R6. Análisis estático y límites de importación: ESLint 10 + typescript-eslint

**Decisión**: ESLint 10.11.0 con configuración plana (`eslint.config.mjs`), `@eslint/js` 10.0.1
y `typescript-eslint` 8.70.1 con las configuraciones `strictTypeChecked` y
`stylisticTypeChecked` (esta última sin reglas de formato). Los controles adicionales usan solo
reglas del núcleo de ESLint, sin complementos extra:

- **Límites entre capas**: `no-restricted-imports` configurado por directorio (bloques `files`
  de la configuración plana) según la matriz de [`data-model.md`](./data-model.md#matriz-de-dependencias-entre-capas).
- **Sin llamadas externas en `src/`**: `no-restricted-globals` para `fetch`, `WebSocket` y
  `EventSource`, y `no-restricted-imports` para `node:http`, `node:https`, `node:net`,
  `node:tls`, `node:dgram` y `node:dns`.
- **Sin `console` en `src/`**: los registros pasan por el logger (FR-008).
- **Lectura de `process.env` limitada**: `no-restricted-properties` la prohíbe en `src/`,
  salvo en `src/platform/config` y en los dos ficheros `instrumentation` (R8).
- **Módulos portables**: `no-restricted-imports` prohíbe en `src/platform/config/index.ts` y
  `src/platform/logging/index.ts` las importaciones relativas y con alias `@/` (R8).
- El control es `eslint . --max-warnings=0`.

**Justificación**:

- `next lint` se eliminó en Next.js 16; la documentación oficial indica usar la CLI de ESLint.
- **No se incluye `eslint-config-next`**. Sus complementos `eslint-plugin-react` 7.37.5,
  `eslint-plugin-import` 2.32.0 y `eslint-plugin-jsx-a11y` 6.10.2 solo admiten ESLint hasta la
  versión 9. Además, sus reglas se centran en páginas y componentes React, que no existen en
  esta funcionalidad. Cuando llegue la interfaz se añadirán `@next/eslint-plugin-next` y
  `eslint-plugin-react-hooks` (que ya admite ESLint 10), y se evaluará `jsx-a11y` para el
  principio X.
- Los límites se validan con pruebas que llaman a la API de ESLint (R9), de modo que una
  regresión en la configuración también hace fallar las pruebas.

**Alternativas descartadas**:

- **`eslint-plugin-boundaries`**: más expresivo, pero es otra dependencia; las reglas del núcleo
  bastan con cuatro capas y una plataforma.
- **`eslint-plugin-import` (`no-restricted-paths`)**: no admite ESLint 10.
- **dependency-cruiser**: potente, pero es una herramienta adicional con su propia configuración.
- **ESLint 9 + `eslint-config-next`**: sería volver a una versión anterior solo por reglas de
  interfaz que todavía no aplican.

## R7. Pruebas: Vitest 5 en entorno Node

**Decisión**: Vitest 5.0.2 con `environment: "node"`, `pool: "forks"`, `restoreMocks: true`,
`sequence.shuffle: false` y el archivo de preparación `tests/setup/no-network.ts`. Se declara
Vite 8.3.1 como dependencia de desarrollo explícita, porque Vitest 5 lo trata como dependencia
par (`vite ^6.4.0 || ^7.0.0 || ^8.0.0`).

**Justificación**:

- Resuelve las mismas rutas y alias que TypeScript sin compilar antes.
- El archivo de preparación sustituye `globalThis.fetch` y parchea `net.Socket.prototype.connect`
  para rechazar cualquier destino que no sea de bucle local (`127.0.0.1`, `::1`). Así, un intento
  de acceso a la red hace fallar la prueba (FR-013 y el caso límite de servicios externos).
- Vitest no carga los ficheros `.env` en `process.env`. Las pruebas pasan objetos de entorno
  explícitos y sintéticos, lo que garantiza el determinismo (SC-005 y SC-006).

**Alternativas descartadas**:

- **`node:test` con eliminación nativa de tipos**: no tiene dependencias, pero exige extensiones
  `.ts` explícitas en los imports, lo que choca con la resolución `bundler` que usa Next.js.
- **Jest**: más pesado y con fricción conocida con ESM y TypeScript.

## R8. Validación de configuración: Zod 4 con preflight común y defensa en profundidad

**Decisión**: Zod 4.6.5, que no tiene dependencias, para un esquema de configuración de dos
variables obligatorias:

- `AULANORMA_LOG_LEVEL`: una de `fatal`, `error`, `warn`, `info`, `debug`, `trace` o `silent`.
- `AULANORMA_ENVIRONMENT`: una de `development`, `test` o `ci`.

**Mecanismo único para `npm run dev` y `npm start`**: un preflight, `scripts/preflight.mjs`, que
se ejecuta antes de Next.js en los dos scripts npm:

```text
dev:   node scripts/preflight.mjs dev && next dev --hostname 127.0.0.1
start: node scripts/preflight.mjs start && next start --hostname 127.0.0.1
```

El preflight sigue estos pasos:

1. **Carga los ficheros `.env*` con la misma semántica que Next.js**. Llama a
   `loadEnvConfig(directorioDelProyecto, modo === "dev")` de `@next/env` 16.3.6, que es la función
   y la versión que usa Next.js 16.3.6. Así carga los mismos ficheros, con la misma precedencia y
   la misma expansión de variables:
   - en `dev`: `.env.development.local`, `.env.local`, `.env.development` y `.env`;
   - en `start`: `.env.production.local`, `.env.local`, `.env.production` y `.env`;
   - una variable ya definida en el entorno del proceso siempre prevalece sobre los ficheros,
     incluso si está vacía.
2. **Valida** con `parseConfig` de `src/platform/config/index.ts`, el mismo módulo que usa el
   servidor. Node.js lo importa directamente eliminando los tipos de forma nativa, sin
   compilación previa.
3. **Si la configuración no es válida**, registra con `src/platform/logging/index.ts` un evento
   `fatal` `startup.config_invalid`, con el modo y la lista de `{ key, problem }`, y termina con
   código 1. `problem` es `missing` (ausente o vacía), `invalid_value` o `unknown_key`. El valor
   recibido nunca aparece en la salida. Como `&&` no continúa, Next.js no arranca y ningún
   proceso llega a escuchar en el puerto.
4. **Si es válida**, termina con código 0 y `&&` arranca Next.js, que vuelve a cargar los mismos
   ficheros con la misma función.

**Defensa en profundidad**, que no sustituye al preflight:

- **`instrumentation`**. `src/instrumentation.ts` importa dinámicamente
  `src/instrumentation-node.ts` solo cuando `NEXT_RUNTIME === "nodejs"`. Este vuelve a validar y,
  si falla, registra el mismo evento y llama a `process.exit(1)`. Cubre la invocación directa de
  `next start` o `next dev` sin pasar por los scripts npm.
- **Ruta de estado**. `/api/health` obtiene la instantánea validada de la configuración de
  `@/platform/config` antes de construir la respuesta. Si no es válida, lanza un error y
  Next.js responde 500 sin cuerpo. Cubre la recarga en caliente de `.env.development.local` en
  `next dev`.

**Requisitos derivados**:

- `src/platform/config/index.ts` y `src/platform/logging/index.ts` son **módulos portables**:
  - solo importan paquetes npm (`zod` y `pino`, respectivamente), sin importaciones relativas
    ni alias `@/`, porque Node.js no resuelve los alias ni los imports sin extensión;
  - usan solo sintaxis TypeScript borrable (`erasableSyntaxOnly`, R4).

  Una regla de ESLint lo fuerza, y la prueba de humo lo verifica, porque el caso válido falla si
  el preflight no puede cargarlos.
- `package.json` declara `"type": "module"`. Sin ello, Node.js avisa
  (`MODULE_TYPELESS_PACKAGE_JSON`) y vuelve a analizar el módulo. Se verificó que Next.js 16.3.6
  compila y arranca con esa declaración.
- `@next/env` se declara como dependencia de ejecución directa, con la **misma versión exacta**
  que `next`, porque `npm start` ejecuta el preflight. Una prueba de arquitectura comprueba que
  las dos versiones coinciden, y Dependabot actualiza ambos paquetes en el mismo grupo.
- En `src/`, solo `src/platform/config` y los dos ficheros `instrumentation` pueden leer
  `process.env` (`no-restricted-properties` de ESLint). El resto del código recibe la
  configuración validada.

**Evidencia de las pruebas desechables** (Next.js 16.3.6, en `next start` y `next dev`):

| Mecanismo | Caso | Código de salida | ¿Llegó a escuchar? | `/api/health` | ¿Valor en la salida? |
|-----------|------|------------------|--------------------|---------------|----------------------|
| Solo `instrumentation`, `next start` | Valor inválido | 1 | **Sí**: aceptó la conexión y la reinició | Sin respuesta (`ECONNRESET`) | No |
| Solo `instrumentation`, `next start` | Variable ausente | 1 | No en esa ejecución | Sin respuesta | No |
| Solo `instrumentation`, `next dev` | Valor inválido | 1 | **Sí** | Sin respuesta (socket cerrado) | No |
| Solo `instrumentation`, `next dev` | Variable ausente | 1 | **Sí** | Sin respuesta (socket cerrado) | No |
| `npm run dev` con preflight | Valor inválido en `.env.development.local` | 1 | No | — | No |
| `npm run dev` con preflight | Falta una clave en `.env.development.local` | 1 | No | — | No |
| `npm run dev` con preflight | Fichero válido y variable de proceso inválida | 1 | No | — | No |
| `npm run dev` con preflight | Fichero válido y variable de proceso vacía | 1 | No | — | No |
| `npm run dev` con preflight | Fichero válido | Sigue en marcha | Sí | 200 `{"status":"ok",…}` | — |
| `npm start` con preflight | Solo existe `.env.development.local`, que `start` no carga | 1 (`missing`) | No | — | No |
| `npm start` con preflight | Variable vacía | 1 | No | — | No |
| `npm start` con preflight | Valor inválido | 1 | No | — | No |
| `npm start` con preflight | Valores válidos en el entorno | Sigue en marcha | Sí | 200 `{"status":"ok",…}` | — |
| `next dev` con recarga en caliente | Ruta ya cargada; el fichero pasa a ser inválido | Sigue en marcha | Sí | **500 sin cuerpo** | No |
| `next dev` con recarga en caliente | Primera petición después de que el fichero pase a ser inválido | Sigue en marcha | Sí | **500 sin cuerpo** | No |

Otras comprobaciones:

- `register()` que lanza una excepción: el proceso no termina y responde 500. **No cumple
  FR-005**, así que se descarta.
- `process.exit` directamente en `instrumentation.ts`: la compilación avisa, porque la API no
  existe en el runtime Edge. Se evita con la importación dinámica limitada a `nodejs`.
- `next build` con configuración de ejecución inválida: la compilación no ejecuta `register()`
  ni el preflight, así que es independiente de la configuración de ejecución.
- En `next dev`, Next.js vuelve a cargar `.env.development.local` en caliente ("Reload env") y
  vuelve a evaluar las rutas. La ruta de estado valida de nuevo y responde 500 sin cuerpo,
  nunca "ok". Para aplicar la nueva configuración hay que reiniciar `npm run dev`, que vuelve a
  pasar el preflight.
- Un segundo `next dev` en el mismo directorio termina con "Another next dev server is already
  running". Por eso la prueba de humo del modo desarrollo usa una copia temporal (R14).
- Al terminar solo el proceso `npm` o `next`, el hijo `next-server` puede seguir vivo. La prueba
  de humo arranca cada servidor en su propio grupo de procesos y termina el grupo completo.

**Conclusión**: `instrumentation` por sí solo no cumple "no dejar un proceso escuchando" en
ninguno de los dos modos, porque Next.js abre el puerto antes de que termine `register()`. El
preflight sí lo cumple en ambos. Queda como mecanismo principal, con `instrumentation` y la ruta
de estado como defensas adicionales. **K10 queda resuelto.**

**Ficheros de configuración local**: la configuración de desarrollo se copia de `.env.example` a
**`.env.development.local`**, que solo cargan `npm run dev` y su preflight y que ya está excluido
por `.gitignore` (`.env.*`). En modo producción (`npm start`), la configuración llega desde el
entorno del proceso, como en un despliegue real. La prueba de humo del modo producción se
ejecuta en el repositorio y se niega a hacerlo si existen `.env`, `.env.local`, `.env.production`
o `.env.production.local`, que `start` cargaría, y lo explica con un mensaje claro. La del modo
desarrollo se ejecuta en una copia temporal sin ficheros ignorados, donde escribe su propio
`.env.development.local` para cada caso.

**Justificación de Zod**: el principio IV exigirá esquemas versionados para las salidas de la
IA en funcionalidades posteriores, y Zod servirá también para eso. Así se evita introducir hoy
un validador que luego habría que sustituir.

**Alternativas descartadas**:

- **Validación manual**: sin dependencias, pero habría que construir desde cero la
  infraestructura de esquemas que el principio IV necesitará.
- **`@t3-oss/env-nextjs`**: resuelve la separación entre variables de cliente y de servidor, que
  aquí no existe; además depende de Zod igualmente.
- **Valibot o ArkType**: menos adopción y ninguna ventaja determinante.
- **Validar en `next.config.ts`**: acoplaría la compilación a la configuración de ejecución.
- **Validar solo en `instrumentation`**: verificado que el puerto llega a aceptar conexiones en
  ambos modos antes de terminar el proceso, y que no cubre la invocación directa de Next.js
  como mecanismo principal. Se mantiene solo como defensa adicional.
- **Cargar los ficheros en el preflight con `node --env-file` o `process.loadEnvFile`**: no
  añade dependencias, pero habría que replicar la lista de ficheros por modo, la precedencia y
  la expansión de Next.js, con riesgo de que el preflight y el servidor vean valores distintos.
- **Duplicar el esquema en JavaScript dentro del preflight**: dos fuentes de verdad para la
  misma validación.
- **Lanzador que arranca Next.js como proceso hijo**: exige reenviar señales y códigos de
  salida; `&&` en el script npm logra lo mismo sin código propio.

## R9. Registros estructurados: Pino 10

**Decisión**: Pino 10.3.1, que por defecto escribe JSON en la salida estándar, sin transportes
ni hilos de trabajo. La función que crea el logger acepta un destino inyectable para las
pruebas. Configuración:

- campos base `service: "aulanorma"` y `environment`, con marcas de tiempo ISO;
- redacción integrada (`redact`) con censura `"[REDACTED]"` para rutas como `*.password`,
  `*.secret`, `*.token`, `*.apiKey`, `authorization` y `cookie`;
- eventos: `startup.completed`, `startup.config_invalid` y `health.checked`, este último con un
  `requestId` generado con `crypto.randomUUID()` como identificador de correlación (principio XI).

**Justificación**:

- La redacción integrada evita escribir un mecanismo propio.
- Pino aparece en la lista oficial de paquetes que Next.js excluye por defecto del empaquetado
  de servidor (`server-external-packages.jsonc`, verificado en 16.3.6), así que no hace falta
  configurarlo.
- Tiene rendimiento alto y un ecosistema maduro para la observabilidad futura.

**Alternativas descartadas**:

- **Envoltorio propio sobre `console` en JSON**: sin dependencias, pero la redacción y la
  serialización de errores habría que escribirlas y probarlas a mano.
- **Winston**: más pesado y menos orientado a JSON por defecto.

## R10. Integración continua: GitHub Actions

**Decisión**: dos workflows, `quality.yml` y `security.yml`, con jobs de nombre estable (ver
[plan.md](./plan.md#diseño-de-la-integración-continua)). Las acciones externas se fijan por SHA
completo:

- `actions/checkout` v7.0.1: `3d3c42e5aac5ba805825da76410c181273ba90b1`;
- `actions/setup-node` v7.0.0: `820762786026740c76f36085b0efc47a31fe5020`.

Los SHA se obtuvieron con `git ls-remote` sobre las etiquetas oficiales el 2026-09-25.

Runners explícitos para que los nombres no dependan de alias móviles: `ubuntu-24.04` (x64) y
`macos-26` (arm64, como el equipo de referencia). Según el README oficial de `runner-images`,
`macos-latest` ya apunta a macOS 26 y `macos-14` está obsoleto. El repositorio es **público**,
así que los runners estándar de macOS no consumen minutos de pago.

**Justificación**:

- El repositorio ya está en GitHub, así que no hace falta otro servicio.
- El evento `pull_request` con `permissions: {}` a nivel de workflow y `contents: read` por
  job no entrega ningún secreto del proyecto a las contribuciones, tampoco desde bifurcaciones.
  La única credencial presente es el token efímero `GITHUB_TOKEN` que la plataforma genera para
  cada job, de solo lectura del contenido. Lo usan `actions/checkout`, para obtener el código,
  y `actions/setup-node`, que lo recibe por el valor predeterminado de su entrada `token`
  (`action.yml` de v7.0.0) solo para descargar Node.js desde el manifiesto de versiones. Ningún
  workflow lo pasa explícitamente a scripts npm, a la configuración de la aplicación ni a
  comandos que ejecuten código del repositorio (FR-021 y plan.md).
- `persist-credentials: false` evita dejar el token en `.git/config`, al alcance de los pasos
  que ejecutan código del repositorio.
- La caché de npm de `setup-node` se indexa por el hash del lockfile; las cachés de un PR no
  pueden sobrescribir las de `main`.

**Alternativas descartadas**:

- **`pull_request_target`**: da acceso a secretos y permisos de escritura en el contexto de la
  rama base. Queda prohibido y zizmor lo detecta.
- **`ubuntu-latest` y `macos-latest`**: al cambiar de imagen cambiaría el entorno sin aviso. Los
  nombres de los jobs son estables de todos modos, pero se prefieren imágenes explícitas.
- **`step-security/harden-runner`**: añade monitorización de red en ejecución, pero es otra
  acción externa con acceso privilegiado. Se revisará si aparecen secretos en la integración
  continua.

## R11. Detección de secretos: Gitleaks 8.30.1 como CLI

**Decisión**: el binario oficial de Gitleaks 8.30.1, fijado por versión y **SHA-256 por
plataforma** (darwin-arm64, darwin-x64, linux-x64 y linux-arm64), se instala en `.tools/bin`
(excluido de Git) mediante `scripts/tools/install-tools.mjs`. Ese mismo script se usa en local y
en la integración continua.

El control `check:secrets` es un envoltorio, `scripts/check-secrets.mjs`, sin dependencias, que
ejecuta dos análisis y falla si cualquiera de ellos encuentra un hallazgo no exceptuado:

1. **Historial Git completo del commit evaluado**:
   `gitleaks git --log-opts="--full-history HEAD" --redact --no-banner --verbose .`. Recorre
   todos los commits alcanzables desde `HEAD`, incluido el contenido que se añadió y se borró
   después. En la integración continua se usa `fetch-depth: 0` (SC-007). No se usa el
   comportamiento por defecto (`--all`): se verificó que también examina las demás ramas
   locales y remotas, así que el resultado dependería de ramas ajenas al commit. Por ejemplo,
   `negative-test/secrets` haría fallar el control en todos los pull requests mientras
   existiera.
2. **Árbol de trabajo, sin ficheros ignorados**:
   - Obtiene la lista de ficheros con
     `git ls-files -z --cached --others --exclude-standard`, que devuelve los ficheros
     versionados, con su contenido actual (modificados o preparados), y los ficheros nuevos
     **no ignorados**. Excluye todo lo que ignora `.gitignore`, como `node_modules/`, `.env.*`,
     `.next/` y `.tools/`.
   - Copia a un directorio temporal (`fs.mkdtemp`) solo los ficheros regulares que existen,
     conservando su ruta relativa. Omite los borrados y los enlaces simbólicos, que no se
     siguen.
   - Ejecuta `gitleaks dir --redact --no-banner --verbose .` con la copia como directorio de
     trabajo, de modo que los hallazgos muestran rutas relativas.
   - Elimina la copia en un bloque `finally`. Al terminar, comprueba que `git status
     --porcelain` del repositorio real no ha cambiado; si ha cambiado, falla.

La integración continua ejecuta el mismo comando. Allí el árbol de trabajo coincide con el
commit, así que el segundo análisis es redundante pero inocuo, y se mantiene para que el comando
local y el remoto sean idénticos (FR-016).

**Evidencia de la prueba desechable**: repositorio sintético con tokens sintéticos generados en
tiempo de ejecución, uno en cada situación.

| Situación del token | `gitleaks git --pre-commit` | `--pre-commit --staged` | Envoltorio propuesto (árbol de trabajo) |
|---------------------|:---------------------------:|:-----------------------:|:---------------------------------------:|
| Fichero versionado modificado sin preparar | Detectado | — | Detectado |
| Fichero nuevo preparado | — | Detectado | Detectado |
| Fichero nuevo **sin seguimiento** y no ignorado | **No detectado** | **No detectado** | Detectado |
| `.env.development.local` (ignorado) | No examinado | No examinado | No examinado |
| `node_modules/…` (ignorado) | No examinado | No examinado | No examinado |

El fichero versionado borrado del árbol de trabajo se omitió sin error, y el repositorio real
quedó igual. Con `--log-opts="--full-history HEAD"`, el historial detectó el secreto añadido y
borrado en `main` y no examinó la rama ajena.

**Excepciones** (FR-020): se registran por **huella** (`Fingerprint`) en `.gitleaksignore`. Cada
huella debe tener su justificación, responsable y fecha de revisión en
`docs/engineering/security-exceptions.md`, y se revisa en el pull request. Las huellas dependen
del modo:

- en el historial tienen la forma `commit:fichero:regla:línea`;
- en el árbol de trabajo, `fichero:regla:línea`.

Se verificó que `.gitleaksignore` suprime un hallazgo del modo `dir` por su huella. Un falso
positivo en un fichero versionado necesita las dos huellas, y ambas figuran en el registro.

**Justificación**:

- **Corrección de la hipótesis**: la acción oficial `gitleaks/gitleaks-action` exige un
  `GITLEAKS_LICENSE` guardado como secreto para repositorios de **organizaciones**, y
  `Informatica-Colectivo-Prime` es una organización. Usar la acción incumpliría FR-019 (los
  controles obligatorios no requieren secretos). La CLI no necesita licencia.
- Fijar los binarios por SHA-256 da la misma versión y la misma garantía de integridad en local
  y en la integración continua, en macOS y en Linux.
- Complemento sin coste: al ser un repositorio **público**, GitHub ofrece gratis la detección de
  secretos y la protección de push. Se recomienda activarlas desde la configuración, sin
  sustituir al control local equivalente.

**Interacción con la prueba negativa de secretos**: el token sintético de la rama
`negative-test/secrets` tiene formato de token de GitHub, así que la protección de push, tanto
la personal de la cuenta como la del repositorio, puede bloquearlo antes de que llegue al
repositorio. Es el comportamiento esperado de una defensa adicional, no un fallo del control.
El procedimiento está en [plan.md](./plan.md#diseño-de-las-pruebas-negativas):

- nunca se usa un secreto real, y antes del push se revisa que el valor procede del generador
  sintético;
- si GitHub bloquea el push, se autoriza exclusivamente con el motivo "It's used in tests"
  ("usado en pruebas") y la autorización se registra como evidencia de aceptación, sin copiar
  el valor;
- se vuelve a enviar la rama, se comprueba que el control `secrets` falla, se cierra el pull
  request sin integrar y se elimina la rama.

La autorización no elude la protección de `main`: el pull request sigue en borrador, no se
integra y debe mostrar el control `secrets` fallido.

**Alternativas descartadas**:

- **TruffleHog**: verifica los secretos contactando con sus proveedores, lo que es una llamada
  externa que no queremos por defecto, y es más pesado.
- **Homebrew o Docker para instalar Gitleaks**: Homebrew no fija versiones exactas y solo sirve
  en macOS; Docker es un requisito previo pesado.

## R12. Seguridad de dependencias: `npm audit` con envoltorio de excepciones

**Decisión**: `scripts/check-dependencies.mjs`, un script de Node sin dependencias, que:

1. ejecuta `npm audit --json`;
2. **falla** si hay vulnerabilidades altas o críticas que no tengan una excepción vigente en
   `security/audit-exceptions.json`, con identificador de aviso (GHSA), justificación,
   responsable y fecha de revisión (FR-020);
3. **falla** si una excepción ha caducado;
4. **muestra sin fallar** las vulnerabilidades medias y bajas, en la salida y, en la integración
   continua, en `$GITHUB_STEP_SUMMARY` (FR-017);
5. ejecuta `npm audit signatures` para verificar las firmas del registro y las atestaciones de
   procedencia.

**Justificación**:

- `npm audit` no tiene un mecanismo propio de excepciones, así que el envoltorio es la forma más
  simple de cumplir FR-020 sin herramientas adicionales. El mismo script corre en local y en la
  integración continua.
- **Prueba negativa verificada**: en una copia desechable, `npm install --package-lock-only
  --ignore-scripts lodash@4.17.20` añadió al lockfile una dependencia benigna con avisos
  conocidos (entre ellos GHSA-35jh-r3h4-6jhm, de gravedad alta) sin instalarla ni ejecutarla, y
  `npm audit --audit-level=high` terminó con **código 1**. Es una dependencia controlada, no
  maliciosa.
- Dependabot (`.github/dependabot.yml`, ecosistemas `npm` y `github-actions`, semanal) mantiene
  al día las dependencias y los SHA fijados de las acciones. Sus pull requests pasan por los
  mismos controles, sin secretos.

**Limitación**: `npm audit` consulta el registro de npm, así que su resultado depende de la base
de avisos del momento. Es el comportamiento buscado para seguridad y no afecta al determinismo de
las pruebas, que no ejecutan la auditoría. Para detectar avisos nuevos en `main` sin cambios de
código, el workflow de seguridad se ejecuta también cada semana.

**Alternativas descartadas**:

- **`actions/dependency-review-action`**: duplicaría la auditoría con otra fuente y no tiene
  equivalente local.
- **OSV-Scanner**: otro binario; la base de avisos de GitHub que usa `npm audit` es suficiente.
- **`npm audit --audit-level=high` sin envoltorio**: no permite excepciones justificadas ni hace
  visibles las medias y bajas de forma separada.

## R13. Seguridad de los workflows: zizmor 1.30.1 sin red

**Decisión**: añadir zizmor 1.30.1, instalado con el mismo mecanismo fijado por SHA-256 que
Gitleaks, ejecutado como `zizmor --offline --min-severity low .github/workflows`.

**Justificación**: FR-021 exige permisos mínimos; en las contribuciones no confiables, ningún
secreto del proyecto ni credencial de larga duración o de escritura, y solo el token efímero de
lectura sin persistirlo; acciones fijadas de forma inmutable, y ninguna escritura sin
justificación. zizmor
detecta justamente acciones sin fijar, permisos excesivos, `pull_request_target`, inyección de
plantillas y credenciales persistidas. El modo `--offline` no necesita token ni red.

**Riesgo**: la documentación oficial califica los binarios de GitHub como "best-effort". Se
mitiga fijando SHA-256 y verificando en la integración continua de macOS y Linux. Si un binario
falla en una plataforma, se usa como alternativa documentada `uv tool install zizmor==1.30.1`.

**Alternativas descartadas**:

- **actionlint**: valida la corrección de los workflows, no su seguridad.
- **Solo revisión manual**: no es repetible y no deja evidencia automática.

## R14. Compatibilidad con macOS y Linux

**Decisión**: todos los comandos son scripts npm con sintaxis POSIX `sh`, como el prefijo de
variables (`NEXT_TELEMETRY_DISABLED=1 next build`). Toda lógica auxiliar es **JavaScript de Node
(`.mjs`) sin dependencias**, no bash.

**Justificación**:

- Durante la investigación, un script bash falló en macOS porque la utilidad GNU `timeout` no
  existe allí. Los scripts de Node evitan las diferencias entre las utilidades BSD y GNU.
- Todas las dependencias con binarios nativos (`@next/swc-*`, el empaquetador nativo de Vite,
  Gitleaks y zizmor) publican binarios para darwin-arm64, darwin-x64, linux-x64 y linux-arm64.
- La integración continua ejecuta el conjunto completo de calidad en `ubuntu-24.04` y
  `macos-26`. Windows solo se admite mediante WSL, sin verificación, conforme a la aclaración 3.

**Copias temporales con dependencias propias**. La prueba de humo del modo desarrollo (R8) y las
pruebas negativas locales trabajan en copias temporales del proyecto. La hipótesis inicial
enlazaba `node_modules` con un enlace simbólico, pero la prueba desechable demostró que
Turbopack lo rechaza: `next build` falla con "Symlink [project]/node_modules is invalid, it
points out of the filesystem root". Por eso cada copia instala sus propias dependencias con
`npm ci --ignore-scripts --prefer-offline --no-audit --no-fund`, que reutiliza la caché local de
npm que ha llenado el `npm ci` del repositorio. Con la caché llena, la instalación tardó unos
2 segundos para Next.js, React, Zod y Pino, y la compilación funcionó en la copia. La cifra con
todas las dependencias de desarrollo se registra en la aceptación. Las copias se crean con
`fs.mkdtemp` en el directorio temporal del sistema y se eliminan en un bloque `finally`.

## R15. Rendimiento frente a los límites de la especificación

La prueba desechable compiló Next.js 16.3.6 en unos 8 segundos, con TypeScript en menos de
1 segundo, y arrancó en unos 60 ms. Cada escenario de arranque de la prueba de humo tardó menos
de 1,5 segundos. Al conjunto hay que sumar la copia temporal del modo desarrollo, con su
`npm ci` desde la caché (R14). Con `npm ci` en caché y lint, tipos, pruebas, compilación y prueba
de humo en ambos modos, se estima menos de 4 minutos localmente (SC-002: menos de 10) y menos de
8 minutos por job en la integración continua (SC-004: menos de 15). Cada job fija
`timeout-minutes: 15` como tope. Estas estimaciones proceden de las pruebas exploratorias con
Node.js 24.13.0; las cifras reales se miden con 24.21.0 y se registran en la aceptación
([plan.md](./plan.md#matriz-de-aceptación), SC-002 y SC-004).

## Riesgos y consecuencias

| Id | Riesgo | Mitigación | Disparador de revisión |
|----|--------|------------|-------------------------|
| K1 | Node 24 pasa a mantenimiento el 2026-10-20 | Soporte hasta el 2028-04-30; migración planificada | Node 26 LTS (2026-10-28) |
| K2 | Avisos de seguridad graves en Next.js o React | Versiones fijadas y parcheadas, auditoría bloqueante, Dependabot, auditoría semanal | Cualquier aviso alto o crítico |
| K3 | `typescript-eslint` retrasa la adopción de TypeScript 7 | Fijar 6.0.3 | Cuando `typescript-eslint` admita TypeScript 7 |
| K4 | `eslint-config-next` no admite ESLint 10 | No se usa hasta que haya interfaz | Primera funcionalidad con interfaz |
| K5 | ~~La 404 comodín puede no ser compatible~~ **Resuelto** | Verificado: el comodín convive con `/api/health`; con `images.unoptimized` y las reescrituras de R1, ninguna ruta de `next start` devuelve HTML. La prueba de humo recorre la misma matriz de rutas | Cada actualización de Next.js (K9) |
| K6 | La cabecera `Vary` revela el framework | Documentado como residuo; no revela versiones ni configuración | Si se exige ocultar el framework |
| K7 | Los binarios de zizmor son "best-effort" | SHA-256, doble plataforma y alternativa con `uv` | Fallo en una plataforma |
| K8 | La base de avisos de `npm audit` cambia con el tiempo | Auditoría semanal y excepciones con caducidad | Nuevo aviso |
| K9 | Cabeceras de caché o de framework cambian entre versiones de Next.js | La prueba de humo verifica cabeceras y cuerpo | Cada actualización de Next.js |
| K10 | ~~Solo se verificó `process.exit(1)` con `next start`~~ **Resuelto** | Verificados ambos modos (R8). `instrumentation` no basta porque el puerto llega a abrirse; el preflight común impide arrancar Next.js en ambos modos; `instrumentation` y la ruta de estado quedan como defensa. La prueba de humo cubre `npm start`, `npm run dev` y la invocación directa de `next start` | Cada actualización de Next.js (K9) |
| K11 | En `next dev`, el espacio de herramientas `/__nextjs_*` del servidor de desarrollo tiene respuestas propias, que pueden ser HTML en errores | Solo existe en `next dev`, escuchando en `127.0.0.1`; no forma parte del artefacto de `next start` ni de las rutas de la aplicación; queda fuera del contrato (R1) | Si el modo desarrollo se expone fuera del bucle local |
| K12 | `@next/env` y `next` quedan con versiones distintas | Versión exacta idéntica, prueba de arquitectura que compara ambas y grupo común en Dependabot | Cada actualización de Next.js |
| K13 | La eliminación nativa de tipos de Node.js cambia dentro de la línea 24 | Solo se usa en dos módulos portables con sintaxis borrable (`erasableSyntaxOnly`); si falla la carga, el preflight termina con error (falla cerrado) y la prueba de humo lo detecta | Cada actualización de `.node-version` y cualquier fallo con una versión posterior de la línea 24 admitida por el rango de desarrollo |
