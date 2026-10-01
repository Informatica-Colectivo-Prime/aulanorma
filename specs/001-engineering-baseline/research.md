# Investigación (Fase 0): Base de ingeniería de AulaNorma

**Funcionalidad**: `001-engineering-baseline` | **Fecha**: 2026-09-25 | **Plan**: [plan.md](./plan.md)

Este documento confirma o corrige la hipótesis técnica inicial con fuentes oficiales y con
pruebas desechables realizadas fuera del repositorio, en directorios temporales que no forman
parte del proyecto y que no se citan como evidencia permanente.
La revisión correctiva del 2026-09-25 añadió pruebas desechables sobre el arranque en ambos
modos (R8), la ausencia de interfaz (R1), la detección local de secretos (R11) y las copias
temporales (R14), con Next.js 16.3.6, Node.js 24.13.0 (la versión instalada en el equipo del
mantenedor, de la misma línea 24 LTS) y Gitleaks 8.30.1 verificado por SHA-256. Las pruebas
realizadas con 24.13.0 son **evidencia exploratoria** de la misma línea LTS: justifican las
decisiones, pero no sustituyen la aceptación definitiva, que se hace con 24.21.0 (R2 y la
matriz de aceptación de [plan.md](./plan.md#matriz-de-aceptación)). La convergencia del
2026-09-27 y el 2026-09-28 sobre la condición C6 añadió una prueba formal de viabilidad con
Node.js 24.21.0 (R1). Tampoco es aceptación: la implementación debe reproducirla.
Cada decisión sigue el formato **Decisión / Justificación / Alternativas descartadas**. Los
riesgos y consecuencias se recogen al final y en los ADR
[`0001`](../../docs/adr/0001-architecture-runtime-and-modular-structure.md) y
[`0002`](../../docs/adr/0002-quality-ci-and-security-strategy.md).

## Resumen de la verificación de la hipótesis

| Elemento de la hipótesis | Resultado | Versión fijada |
|--------------------------|-----------|----------------|
| Node.js 24 LTS | Confirmado, con revisión planificada hacia Node 26 LTS | 24.21.0 (referencia, CI y aceptación); rango de desarrollo `>=24.21.0 <25` |
| TypeScript estricto | **Corregido**: TypeScript 7 no es compatible con `typescript-eslint` | 6.0.3 |
| Next.js 16 con App Router | **Corregido**: Pages Router con una única API Route detrás de un servidor personalizado mínimo con frontera HTTP, porque el App Router revela el framework en `Vary` (FR-006 C6) | 16.3.6 |
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

## R1. Arquitectura: Next.js como monolito modular con frontera HTTP previa

**Decisión**: una única aplicación Next.js 16.3.6 con **Pages Router**, desplegable como una
sola unidad. En esta funcionalidad solo existe una API Route, `src/pages/api/health.ts`. Un
servidor personalizado mínimo, `server.mjs`, escucha en `127.0.0.1:3000` y aplica una
**frontera HTTP** antes de Next.js: solo el destino crudo exacto `/api/health` con `GET`,
`HEAD` u `OPTIONS` se delega en Next.js, mediante una única llamada a `handle(req, res)`;
cualquier otra petición recibe un rechazo cerrado sin cuerpo. La lógica de la frontera vive en
el módulo portable `src/platform/http-boundary/index.ts`. No hay App Router operativo, Route
Handler del App Router, comodín, reescrituras, middleware, `proxy.ts` ni `instrumentation.ts`.
El dominio vive en módulos TypeScript independientes del framework (`src/modules/*`), y
Next.js se limita a ser la capa de entrega.

**Justificación**:

- Principio XII: una sola unidad desplegable que en el futuro servirá la interfaz docente y
  la API del servidor sin crear hoy comportamiento de producto.
- FR-006 C6 y principio V: con el App Router, Next.js 16.3.6 añade
  `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch` a
  toda ruta del App Router, sin opción de configuración, y cualquier URL que Next.js atienda
  directamente puede producir HTML, `ETag`, redirecciones o cabeceras `x-nextjs-*` (ver
  "Alternativas descartadas"). La API Route del Pages Router no emite `Vary` del framework, y
  la frontera impide que Next.js atienda cualquier otra URL. La única `Vary` que queda es
  `Vary: Accept-Encoding`. La frontera no inspecciona `Accept-Encoding`; Next.js, como entorno
  HTTP subyacente, puede procesar ese metadato protocolario sin conservarlo, registrarlo,
  reflejarlo ni entregarlo a la operación, y en el comportamiento aprobado solo provoca esa
  `Vary`. La respuesta se entrega sin `Content-Encoding`, que está prohibido: la `Vary` refleja
  el comportamiento observado y cerrado de Next.js, no una promesa de compresión ni de variación
  efectiva del cuerpo (en la prueba formal, 0 respuestas con `Content-Encoding` en los casos con
  `Accept-Encoding`).
- La API Route fija `Cache-Control: no-store` de forma explícita.
- Separar el dominio en `src/modules` evita acoplarlo a Next.js, de modo que las capas se
  pueden probar sin servidor.

**Ajustes obligatorios**:

1. **Telemetría**: Next.js envía telemetría anónima por defecto (documentación oficial
   `nextjs.org/telemetry`). Es una llamada externa prohibida por FR-007. Se desactiva con
   `NEXT_TELEMETRY_DISABLED=1` en todos los scripts npm y en la integración continua.
2. **Cabecera `X-Powered-By: Next.js`**: revela la dependencia. Se desactiva con
   `poweredByHeader: false` (documentación oficial de `next.config.js`).
3. **Ninguna página HTML servida** (FR-009): la compilación del Pages Router genera sus
   páginas de error, pero la frontera nunca delega sus rutas, así que ninguna página HTML se
   sirve en la superficie HTTP. `images: { unoptimized: true }` desactiva además el
   optimizador de imágenes, que no hace falta y es superficie de ataque.
4. **Registros automáticos por petición** (FR-008):
   `logging.incomingRequests.ignore: [/^\/api\/health$/]` coincide exactamente con la única URL
   que la frontera delega. Con él, ninguno de los dos modos registra las consultas, y
   `server.mjs` no registra nada por petición.
5. **Enlace de red**: `server.mjs` escucha en `127.0.0.1:3000`, fijos, y no lee `HOSTNAME`,
   `PORT` ni claves nuevas. Muchos shells definen `HOSTNAME` con el nombre del equipo, lo que
   podría exponer el servidor en otra interfaz (principio V). Solo lee `NODE_ENV` para elegir
   el modo.

**Frontera HTTP**. `server.mjs` es un adaptador mínimo con `// @ts-check`. Crea el servidor con
`http.createServer({ requireHostHeader: false }, …)`, para que la validación de `Host` la haga
la frontera y su rechazo quede contabilizado en el estado de conexión. Conecta `request`,
`checkContinue`, `checkExpectation`, `connect`, `upgrade` y `clientError` con la frontera y no
usa propiedades privadas de Node.js. Precedencia: **versión → `Host` → destino → método →
cuerpo**.

| Estado | Causa |
|--------|-------|
| 400 | Versión, `Host` o framing malformados que el analizador HTTP de Node.js rechaza (`clientError`); `Host` inválido; cuerpo no permitido |
| 404 | Destino crudo distinto de `/api/health`; `CONNECT` o `Upgrade` hacia otro destino |
| 405 | Método distinto de `GET`, `HEAD` u `OPTIONS` en la ruta exacta; `CONNECT` o `Upgrade` hacia `/api/health` |
| 505 | Versión analizada pero distinta de HTTP/1.0 y HTTP/1.1 |
| 500 | Fallo cerrado de la API Route o rechazo de `handle` antes de enviar cabeceras |

- **Versiones**: HTTP/1.0 y HTTP/1.1.
- **`Host`**: en HTTP/1.1, exactamente uno, no vacío, sin coma ni caracteres de control; en
  HTTP/1.0, opcional y, si existe, con las mismas reglas. Los duplicados se detectan en
  `rawHeaders`. Las entradas que el analizador de Node.js rechace antes pueden producir el 400
  cerrado de `clientError`.
- **Cuerpo**: solo se admiten la ausencia de `Transfer-Encoding` y un `Content-Length`
  normalizado a 0 (o ausente). Cualquier `Transfer-Encoding` o una longitud distinta de cero se
  rechaza. El analizador de Node.js puede rechazar antes las entradas malformadas, y la
  frontera no promete distinguir bytes que Node.js normaliza antes de entregarlos.
- **Rechazos**: todos los emitibles tienen cuerpo vacío, `Cache-Control: no-store`,
  `Content-Length: 0` y `Connection: close`; `Allow: GET, HEAD, OPTIONS` solo en 405.
- **Estado de conexión** (transitorio, en memoria, por socket):
  - después de un rechazo no se delega ni se responde otra petición del socket;
  - `clientError` nunca genera una segunda respuesta;
  - los errores se difieren mientras haya respuestas legítimas pendientes;
  - después terminan en *flush* (400 cerrado al terminar la última pendiente) o en *dropped*
    (descartado si el socket se cierra antes); `ECONNRESET` descarta el diferido;
  - `checkContinue` y `checkExpectation` pasan por la misma frontera, sin 100 ni 417
    automáticos;
  - `CONNECT` y `Upgrade` se rechazan de forma cerrada.
- **Fallo 500**: el 500 cerrado (cuerpo vacío, `no-store`, `Content-Length: 0` y
  `Connection: close`) cubre exactamente tres casos:
  - la API Route captura los fallos que ocurren dentro de su manejador y, mientras no haya
    iniciado una respuesta, emite el 500 cerrado. El módulo no hace trabajo falible al
    evaluarse: configuración y versión se obtienen dentro del `try` del manejador;
  - `server.mjs` emite el mismo 500 cerrado si `handle` rechaza antes de enviar cabeceras;
  - si una respuesta ya empezó, `server.mjs` no intenta escribir un segundo estado y destruye
    la conexión.

  Nunca se delega en Next.js la construcción deliberada de un error de salud. Los errores
  internos de Next.js anteriores a la entrada en el manejador, como un fallo al cargar o
  compilar su módulo, no pueden transformarse retrospectivamente en ese 500 cerrado y no se
  presentan como cubiertos (K25). El preflight evita arrancar con una configuración inválida
  (R8), y un commit candidato solo es aceptable tras superar compilación, preflight y las
  pruebas negativas correspondientes.
- **`OPTIONS`**: respuesta técnica de transporte de la misma excepción (204, cuerpo vacío,
  `Allow: GET, HEAD, OPTIONS` y `no-store`). Es de solo lectura, no accede a datos de negocio
  ni personales, no usa persistencia ni servicios externos, no cambia el estado de negocio,
  tiene un contrato cerrado, no revela información interna y está declarado y probado: cumple
  por sí mismo C1 a C7, no es una operación de producto y no amplía FR-006.
- **Metadatos de transporte**: `Date`, `Connection` y `Keep-Alive: timeout=5`. Node.js solo
  emite este último en respuestas satisfactorias sobre conexiones persistentes; anuncia el
  tiempo de espera de la conexión inactiva y no mide nada del proceso (K24).

**Evidencia de viabilidad** (prueba formal desechable del 2026-09-27, fuera del repositorio):

- Node.js 24.21.0, npm 11.19.0 y Next.js 16.3.6 en macOS arm64, con una compilación limpia.
- **Humo**: 36 casos y 42 peticiones.
- **Matriz completa**: 1531 casos y 1574 peticiones, en unos 6 segundos. Cubre versiones,
  `Host`, destinos exactos, codificados y reservados del framework, métodos, cuerpos y framing,
  `Expect`, `CONNECT` y `Upgrade`, canalización y errores de análisis diferidos.
- **Desarrollo**: calentamiento y humo, con la ruta compilada bajo demanda.
- **Resultado**: 0 respuestas HTML servidas, 0 filtraciones, 0 cabeceras del framework, 0
  redirecciones y 0 errores 500 inesperados; equivalencia contractual entre desarrollo y
  producción; auditoría de registros sin registros por petición; y 0 diferencias inesperadas
  frente a la exploración previa con Node.js 24.13.0. La única diferencia observada, un cierre
  por reinicio de la conexión en lugar de un cierre ordenado en un caso, está dentro del
  contrato (K19).

Es **evidencia de viabilidad, no aceptación**. La prueba usó un conjunto reducido de
dependencias distinto del aprobado (sin Zod, Pino, `@next/env`, ESLint ni Vitest, sin preflight
y con otras versiones de TypeScript y de `@types/node`) y una instrumentación de diagnóstico
que no forma parte del producto. La implementación DEBE reproducirla con Node.js 24.21.0, las
dependencias aprobadas, el preflight, la configuración real y el mismo SHA candidato (T029 a
T031, `check:build` y `acceptance.md`). No se copian ni se referencian sus rutas, sus
identificadores de compilación ni sus valores de ejecución.

**Alternativas descartadas para la entrega HTTP** (todas con Next.js 16.3.6, en pruebas
desechables del 2026-09-27):

1. **App Router, o una API Route del Pages Router combinada con un comodín del App Router**:
   las rutas del App Router añaden
   `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`.
   Borrar o sustituir `Vary` en el Route Handler no la elimina, y declararla en `headers()`
   añade una segunda cabecera y conserva la primera: el servidor la fija para toda ruta del App
   Router sin opción de configuración. En la combinación con el comodín, la cabecera persiste
   en las respuestas que atiende el App Router y aparecen redirecciones propias con `Location`
   que incluye `?_rsc=`.
2. **Pages Router con `rewrites`** para enviar las rutas reservadas a una 404 propia: las URL
   con barra final o barras repetidas reciben redirecciones 308 con `Location` y `Refresh`; las
   rutas codificadas (por ejemplo, `/api%2fhealth` o `/%61pi/health`) reciben la página 404
   HTML del framework, con `ETag` y `Vary` del framework; y aparecen cabeceras
   `x-nextjs-rewritten-*`, como `x-nextjs-rewritten-path`.
3. **Pages Router con `proxy.ts`** (middleware): `TRACE` produce un 500 en HTML,
   `/api/health.rsc` una 404 HTML con `Vary` del framework y `CONNECT` queda sin respuesta;
   además, ciertas normalizaciones y redirecciones del framework ocurren antes de que el proxy
   intervenga, así que no puede cerrarlas.

Ninguna de las tres cumple FR-006 C6 ni FR-009. Sus términos describen alternativas
descartadas, no la arquitectura vigente.

**Otras alternativas descartadas**:

- Aceptar la 404 HTML por defecto, `pages/404` o `app/not-found.tsx`: producen HTML y
  contradicen FR-009.
- `skipTrailingSlashRedirect: true`: convierte `/api/health/` en una segunda URL válida.
- `next start` o `next dev` directos con cualquier configuración: Next.js atiende todas las
  URL y reaparecen las respuestas de las alternativas anteriores. Por eso no están admitidos
  (K17).

**Revisión planificada**: la primera funcionalidad con interfaz tendrá recursos de cliente bajo
`/_next/static` y, en desarrollo, recarga mediante `Upgrade`, que la frontera rechaza hoy.
Deberá rediseñar la frontera en su propio ADR (K23).

**Alternativas descartadas de arquitectura general**:

- **Frontend y backend separados** (por ejemplo, SPA con Vite y API con Fastify): dos unidades
  desplegables, dos pipelines y un contrato HTTP interno. Viola el principio XII sin necesidad
  medida.
- **Solo servidor HTTP ahora** (Fastify, Hono o `node:http`) e incorporar la interfaz después:
  más simple hoy, pero obligaría a reestructurar o a añadir una segunda unidad cuando llegue la
  interfaz docente, que es un requisito conocido del producto. El servidor personalizado
  elegido conserva Next.js para la aplicación y solo añade la frontera.
- **React Router 7 (modo framework), SvelteKit o Nuxt**: equivalentes en capacidad, pero con
  menos documentación oficial y ecosistema alrededor de Server Components y Route Handlers. No
  aportan ventajas concretas a este proyecto.

**Coste aceptado**:

- La documentación de Next.js advierte de que un servidor personalizado prescinde de
  optimizaciones como la optimización estática automática y la salida `standalone`. Esta
  funcionalidad no sirve páginas ni configura despliegue, así que hoy no pierde nada; la
  interfaz y el despliegue lo revisarán en su ADR.
- La aplicación asume la responsabilidad HTTP de la frontera y su coste de pruebas (plan.md,
  Complexity Tracking).
- `react` y `react-dom` son dependencias obligatorias de Next.js aunque todavía no haya
  interfaz. Next.js tiene historial de avisos de seguridad graves (por ejemplo, CVE-2025-29927
  sobre middleware y CVE-2025-55182 sobre React Server Components). Se mitiga con versiones
  fijadas y parcheadas, `npm audit` bloqueante, actualizaciones de Dependabot y ausencia de
  middleware, App Router y autenticación en esta funcionalidad. La prueba desechable con 16.3.6
  y 19.3.0 dio `found 0 vulnerabilities`.

## R2. Runtime: Node.js 24 LTS

**Decisión**: Node.js 24 LTS ("Krypton"), con dos niveles distintos:

- **Versión reproducible de referencia y de la integración continua**: **24.21.0**, publicada
  el 2026-09-07 y fijada en `.node-version`. La integración continua la lee de ese fichero, y
  las mediciones de aceptación se realizan obligatoriamente con ella.
- **Rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`, declarado en
  `devEngines.runtime` de `package.json` con `onFail: "error"` y, con el mismo rango, en
  `engines.node`, que `engine-strict=true` de `.npmrc` hace obligatorio.

**Justificación**:

- Según el calendario oficial, Node 24 es LTS desde el 2025-10-28, pasa a mantenimiento el
  2026-10-20 y tiene soporte hasta el **2028-04-30**. Cubre de sobra la duración del TFM.
- Todas las dependencias lo admiten: Next.js `>=20.9.0`, Vitest `^24.0.0`, ESLint `>=24`,
  Vite `>=22.12.0`.
- Se usan juntos `devEngines` y `engines` con `engine-strict`, con los mismos rangos.
  `devEngines` es el contrato que aplica npm 11, pero los clientes anteriores no lo aplican:
  con Node.js 20.20.0 y npm 10.8.2, `npm ci` instalaba el proyecto solo con avisos. `engines`
  con `engine-strict` cubre esos clientes. Como contrapartida, `engine-strict` también aplica
  las restricciones de `engines` de cada dependencia transitiva: una dependencia que dejara
  fuera la versión de referencia haría fallar la instalación en lugar de avisar. Con las
  dependencias actuales, `npm ci` con 24.21.0 no produce ningún aviso de ese tipo.

**Consecuencias**:

- `npm ci` rechaza antes de instalar, con un mensaje claro, las versiones **fuera del rango**,
  no cualquier versión distinta de 24.21.0: rechaza 24.13.0, por debajo del mínimo
  (`EBADDEVENGINES` con npm 11.6.2), y 20.20.0 (`EBADENGINE` con npm 10.8.2), y admite una 24.x
  posterior a 24.21.0 para desarrollar. Node.js 26 queda excluido por el rango, pero no se ha
  ejecutado en esta validación.
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
`save-exact=true`, `fund=false`, `audit=true` y `engine-strict=true`.
`devEngines.packageManager` y `engines.npm` declaran npm con el mismo rango, coherente con el
de Node.js: como mínimo la versión de npm incluida con 24.21.0 (11.19.0) y por debajo de la
siguiente versión mayor (`>=11.19.0 <12`). `devEngines` lo aplica npm 11; `engines` con
`engine-strict` lo aplica también a clientes como npm 10 (R2). Una versión exacta
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
nativa, sin `enum`, `namespace` ni otra sintaxis que requiera transformación, lo que
necesitan el preflight (R8) y `server.mjs` al cargar los módulos portables (R1). `tsconfig.json`
activa `allowJs` e incluye `server.mjs`, que se comprueba mediante `// @ts-check` (control por
fichero, sin `checkJs` global). Como `server.mjs` importa esos módulos por su ruta `.ts`,
`tsconfig.json` DEBE declarar `noEmit: true`, `allowJs: true`,
`allowImportingTsExtensions: true` y `erasableSyntaxOnly: true`. Se verificó `tsc --noEmit` con
TypeScript 6.0.3 y las opciones estrictas sobre la hipótesis inicial; la inclusión de
`server.mjs` y `allowImportingTsExtensions` **no están demostradas todavía**: T006 y T041 las
verifican con `node --check` y `tsc` durante la implementación. El control de tipos es
`next typegen && tsc --noEmit`.

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

**Decisión**: Prettier 3.9.9 con configuración mínima explícita. `.prettierignore` excluye
exactamente `.next/`, `coverage/`, `.tools/`, `package-lock.json`, `next-env.d.ts`,
`.specify/`, `.cursor/`, `.claude/`, `.agents/`, `.opencode/`, `specs/` y `docs/adr/`. El
control es `prettier --check .` y cubre el código, la configuración, los scripts, los
workflows y la documentación operativa mantenida por la aplicación. `specs/` y `docs/adr/`
se revisan mediante su flujo documental y `git diff --check`. La exclusión no autoriza a
ignorar errores de Markdown ni amplía `.gitignore`. Cualquier cambio en `.prettierignore` o
`.gitignore` es revisable; un cambio en `.gitignore` tiene impacto de seguridad.

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
  `EventSource`, y `no-restricted-imports` para `node:http`, `node:https`, `node:http2`,
  `node:net`, `node:tls`, `node:dgram` y `node:dns`, también sin el prefijo `node:` y con sus
  subrutas. En `src/**/*.ts` se usa la variante de
  `typescript-eslint` de esa regla con `allowTypeImports`, para que
  `src/platform/http-boundary` pueda usar `import type` de `node:http` sin importarlo en
  ejecución.
- **Sin `console` en `src/`**: los registros pasan por el logger (FR-008).
- **Lectura de `process.env` limitada**: `no-restricted-properties` la prohíbe en `src/`, salvo
  en `src/platform/config` (R8). En `server.mjs`, `no-restricted-syntax` solo admite
  `process.env.NODE_ENV`: no se leen `HOSTNAME`, `PORT` ni claves nuevas (R1). `server.mjs`
  obtiene la configuración mediante `loadConfig` y la API Route mediante `readRuntimeConfig`,
  ambas de `src/platform/config` (R8), sin reconstruir la lista de problemas ni leer otras
  claves. Fuera de `src/` y de `server.mjs`, solo los scripts de herramientas que lanzan
  procesos hijos (la prueba de humo y las pruebas negativas) manipulan el entorno de esos
  procesos, para construir cada caso desde cero; el preflight no lee `process.env`
  directamente.
- **Módulos portables**: `no-restricted-imports` prohíbe en `src/platform/config/index.ts`,
  `src/platform/logging/index.ts` y `src/platform/http-boundary/index.ts` las importaciones
  relativas y con alias `@/` (R1 y R8).
- **`server.mjs`**: lo cubre ESLint sin información de tipos, como el resto de `*.mjs`; sus
  tipos los comprueba `tsc` mediante `// @ts-check` (R4).
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

**Mecanismo único para `npm run dev` y `npm start`**, los únicos puntos de entrada: un
preflight, `scripts/preflight.mjs`, que se ejecuta antes de `server.mjs` en los dos scripts npm
(`next dev` y `next start` directos no están admitidos, R1):

```text
dev:   NODE_ENV=development node scripts/preflight.mjs dev && NODE_ENV=development node server.mjs
start: NODE_ENV=production node scripts/preflight.mjs start && NODE_ENV=production node server.mjs
```

Cada lado de `&&` recibe `NODE_ENV` por separado: una asignación delante de un comando solo
afecta a ese comando.

**Interfaz de configuración** (`src/platform/config/index.ts`):

tres operaciones que devuelven la misma unión discriminada: `{ ok: true, config }`, con una
configuración inmutable, u `{ ok: false, problems }`, con `readonly { key, problem }[]` sin
valores. Ninguna registra valores.

- **`validateConfig(source)`**: función pura sobre una fuente inyectada; no lee `process.env`.
- **`loadConfig(mode)`**: recibe explícitamente `development` o `production`, exige que
  `NODE_ENV` coincida, carga los ficheros `.env*` con `@next/env` en las condiciones descritas
  más abajo, lee `process.env` (la única lectura permitida, dentro de `src/platform/config`) y
  delega en `validateConfig`. La usan `scripts/preflight.mjs` y `server.mjs` antes de escuchar.
- **`readRuntimeConfig()`**: no vuelve a cargar ficheros `.env*`, no llama a `@next/env` ni usa
  `forceReload`; lee el `process.env` del proceso, ya preparado por `loadConfig` y por Next.js
  antes de escuchar, ignora las claves ajenas al esquema, incluido `__NEXT_PROCESSED_ENV`, y
  delega en `validateConfig`. La usa la API Route dentro del `try` de cada manejo, nunca al
  evaluar el módulo. No depende de compartir una instancia en memoria con `server.mjs` (Next.js
  compila su propia copia del módulo): solo de que `process.env` pertenece al proceso. Los
  cambios de `.env*` siguen exigiendo reinicio.

**Uso controlado de `@next/env`**. `@next/env` 16.3.6 tiene tres comportamientos que el diseño
no puede ignorar:

- **Modo explícito**. Con `NODE_ENV=test`, el cargador selecciona los ficheros `.env.test*`
  sea cual sea el modo pedido, y el ejecutor de pruebas fija ese valor. Por eso `loadConfig`
  recibe el modo, exige que `process.env.NODE_ENV` coincida y, si no coincide, devuelve
  `{ key: "NODE_ENV", problem: "mode_mismatch" }` antes de cargar nada y sin el valor recibido.
  Ni `dev` ni `start` pueden cargar `.env.test`.
- **Sin caché**. El cargador conserva el resultado de la primera carga del proceso y puede marcar
  `process.env.__NEXT_PROCESSED_ENV`. `loadConfig` no confía en un resultado previo: cada
  llamada contractual usa `forceReload = true`. El marcador es un detalle interno: no pertenece
  al esquema, no entra en la configuración validada, no se devuelve, no se registra y no se
  trata como clave de AulaNorma.
- **Logger controlado**. Si no puede leer o analizar un fichero, el cargador escribe por su
  logger el nombre del fichero o su ruta unida al directorio, junto con el objeto de error y su
  traza, datos que FR-005 prohíbe mostrar. `loadConfig` le pasa un adaptador privado de
  `src/platform/config`, creado en cada llamada, con los dos métodos que declara el cargador
  (`info` y `error`). No reenvía nada a `console`, a `pino` ni a la salida de error, no conserva
  argumentos, rutas, objetos de error, mensajes ni trazas, y `error` solo marca que hubo un error
  de carga. Si hay esa marca, o si el cargador lanza una excepción, `loadConfig` devuelve solo
  `{ key: "environment", problem: "env_load_failed" }`, sin ruta, nombre de fichero, valor,
  mensaje original, código interno ni traza. El preflight y `server.mjs` solo presentan esa lista
  saneada.

El preflight y `server.mjs` se ejecutan con el mismo `NODE_ENV`, fijado por cada script npm, y
`server.mjs` vuelve a llamar a `loadConfig` antes de escuchar. `readRuntimeConfig` no recarga
ficheros. El cargador de `@next/env` es sustituible en las pruebas para observar sus llamadas
(T020). El preflight sigue estos pasos:

1. **Carga los ficheros `.env*` con la misma semántica que Next.js** mediante `loadConfig`, que
   llama a `loadEnvConfig` de `@next/env` 16.3.6, la función y la versión que usa Next.js 16.3.6,
   con el directorio del proyecto, `dev` verdadero solo en `development`, el logger controlado
   y `forceReload = true`. Así carga los mismos ficheros, con la misma precedencia y
   la misma expansión de variables:
   - en `dev`: `.env.development.local`, `.env.local`, `.env.development` y `.env`;
   - en `start`: `.env.production.local`, `.env.local`, `.env.production` y `.env`;
   - una variable ya definida en el entorno del proceso siempre prevalece sobre los ficheros,
     incluso si está vacía.
2. **Valida** con `validateConfig`, a la que delega `loadConfig`, que también usa
   `server.mjs`. Node.js importa el módulo directamente eliminando los
   tipos de forma nativa, sin compilación previa.
3. **Si la configuración no es válida**, registra con `src/platform/logging/index.ts` un evento
   `fatal` `startup.config_invalid`, con el modo y la lista de `{ key, problem }`, y termina con
   código 1. `problem` es `missing` (ausente o vacía), `invalid_value`, `unknown_key`,
   `mode_mismatch` (solo con la clave `NODE_ENV`) o `env_load_failed` (solo con la clave
   `environment`). El valor
   recibido nunca aparece en la salida. Como `&&` no continúa, `server.mjs` no arranca y ningún
   proceso llega a escuchar en el puerto.
4. **Si es válida**, termina con código 0 sin registrar `startup.completed` y `&&` arranca
   `server.mjs`.

**`server.mjs` y la ruta de estado** (no sustituyen al preflight):

- **`server.mjs`** obtiene la configuración con `loadConfig` como primer paso, antes de crear la
  aplicación de Next.js y de abrir el puerto, porque la necesita para crear el logger. Pide
  `development` si `NODE_ENV` vale exactamente `development` y `production` en cualquier otro
  caso, así que un valor ausente o distinto falla cerrado con `mode_mismatch`. Si recibe un fallo, registra
  `startup.config_invalid` con la lista devuelta y termina con código 1 sin escuchar, igual que
  el preflight. Si recibe una configuración válida, registra `startup.completed` **exactamente
  una vez**, después de validar y de empezar a escuchar. No convierte `node server.mjs` sin
  preflight en un punto de entrada admitido: los únicos son `npm run dev` y `npm start`.
- **Ruta de estado**. `src/pages/api/health.ts` no hace trabajo falible al evaluar el módulo:
  dentro del `try` de cada manejo llama a `readRuntimeConfig()` y obtiene el estado, versión
  incluida, con `buildHealthStatus()` del módulo `health`, que llama a `getVersion()` del módulo
  `version`; no llama a `loadConfig` ni lee `process.env`. Si el resultado es un fallo, o ante cualquier otro fallo dentro del manejador antes de iniciar la respuesta,
  responde ella misma el 500 cerrado (cuerpo vacío, `no-store`, `Content-Length: 0` y
  `Connection: close`) y nunca "ok"; no lanza la excepción a Next.js.
- **Sin `instrumentation`**. Se elimina del diseño: no puede impedir que el puerto se abra
  (evidencia más abajo), y con los dos puntos de entrada anteriores no cubre ningún caso
  adicional admitido.
- **Sin recarga en caliente de la configuración**. Aplicar un cambio de `.env*` exige
  reiniciar `npm run dev` o `npm start`, que vuelven a pasar el preflight. El comportamiento del
  modo desarrollo ante un cambio del fichero con el servidor en marcha no forma parte del
  contrato; si la ruta llega a evaluarse con una configuración inválida, aplica el 500
  cerrado.

**Requisitos derivados**:

- `src/platform/config/index.ts`, `src/platform/logging/index.ts` y
  `src/platform/http-boundary/index.ts` son **módulos portables**:
  - solo importan paquetes npm (`zod` y `@next/env` la configuración, `pino` los registros y
    ninguno en ejecución la frontera), sin importaciones relativas ni alias `@/`, porque Node.js
    no resuelve los alias ni los imports sin extensión;
  - usan solo sintaxis TypeScript borrable (`erasableSyntaxOnly`, R4).

  Una regla de ESLint lo fuerza, y la prueba de humo lo verifica, porque el caso válido falla si
  el preflight o `server.mjs` no pueden cargarlos.
- `package.json` declara `"type": "module"`. Sin ello, Node.js avisa
  (`MODULE_TYPELESS_PACKAGE_JSON`) y vuelve a analizar el módulo. Se verificó que Next.js 16.3.6
  compila y arranca con esa declaración.
- `@next/env` se declara como dependencia de ejecución directa, con la **misma versión exacta**
  que `next`, porque `npm start` ejecuta el preflight. Una prueba de arquitectura comprueba que
  las dos versiones coinciden, y Dependabot actualiza ambos paquetes en el mismo grupo.
- En `src/`, solo `src/platform/config` puede leer `process.env` (`no-restricted-properties` de
  ESLint), y `server.mjs` solo `process.env.NODE_ENV`. El resto del código recibe la
  configuración validada.

**Evidencia de las pruebas desechables** (Next.js 16.3.6, con el preflight delante de
`next start` y `next dev`, antes de adoptar `server.mjs`; el preflight y su `&&` no cambian):

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

Otras comprobaciones:

- `register()` que lanza una excepción: el proceso no termina y responde 500. **No cumple
  FR-005**, así que se descarta.
- `next build` con configuración de ejecución inválida: la compilación no ejecuta el preflight
  ni `server.mjs`, así que es independiente de la configuración de ejecución.
- Un segundo servidor de desarrollo en el mismo directorio no puede arrancar. Por eso la prueba
  de humo del modo desarrollo usa una copia temporal (R14).
- Al terminar solo el proceso `npm`, un proceso hijo puede seguir vivo. La prueba de humo
  arranca cada servidor en su propio grupo de procesos y termina el grupo completo.

**Conclusión**: `instrumentation` por sí solo no cumple "no dejar un proceso escuchando" en
ninguno de los dos modos, porque Next.js abre el puerto antes de que termine `register()`, y se
elimina del diseño. El preflight sí lo cumple en ambos y queda como mecanismo principal;
`server.mjs` no escucha sin configuración válida, y la ruta de estado responde el 500 cerrado
ante sus fallos propios. **K10 queda resuelto.** La implementación verifica este comportamiento
con `server.mjs` en T041 y T042 y en la prueba de humo (T025 y T026).

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
- **Validar en `instrumentation`**, solo o como defensa adicional: verificado que el puerto
  llega a aceptar conexiones en ambos modos antes de terminar el proceso. Con `server.mjs`
  como único servidor y el preflight delante, no cubre ningún caso admitido, así que se elimina
  del diseño.
- **Cargar los ficheros en el preflight con `node --env-file` o `process.loadEnvFile`**: no
  añade dependencias, pero habría que replicar la lista de ficheros por modo, la precedencia y
  la expansión de Next.js, con riesgo de que el preflight y el servidor vean valores distintos.
- **Duplicar el esquema en JavaScript dentro del preflight**: dos fuentes de verdad para la
  misma validación.
- **Lanzador que arranca Next.js como proceso hijo**: exige reenviar señales y códigos de
  salida; `&&` en el script npm logra lo mismo sin código propio.

## R9. Registros estructurados: Pino 10

**Decisión**: Pino 10.3.1, que por defecto escribe JSON en la salida estándar, sin transportes
ni hilos de trabajo. `src/platform/logging` exporta en ejecución únicamente
`createLogger({ environment, level, destination? })`, que devuelve un manejador opaco de la
aplicación y no el logger de Pino, `logStartupCompleted(logger)` y
`logConfigInvalid(logger, mode, problems)` (plan.md, «Interfaz de registros»). El destino es
inyectable para las pruebas. Configuración:

- campos base `service: "aulanorma"` y `environment`, sin `pid` ni `hostname`, con `level`
  como etiqueta textual y marcas de tiempo ISO;
- redacción integrada (`redact`) con censura `"[REDACTED]"` para rutas como `*.password`,
  `*.secret`, `*.token`, `*.apiKey`, `authorization` y `cookie`, con la semántica de rutas de
  Pino: `*.password` cubre un único nivel de anidamiento;
- `startup.completed` se registra con nivel `info` y sin otros campos propios, y
  `startup.config_invalid` con nivel `fatal`, `environment` igual al modo explícito, `mode` y
  `problems` reconstruido copiando solo `key` y `problem`. Ningún nivel operativo, incluido
  `silent`, suprime estos eventos: en Pino 10.3.1 se verificó con los siete niveles que un hijo
  creado con nivel propio (`child({}, { level })`) escribe exactamente una línea aunque el
  padre esté en `silent`, mientras que un `fatal` del propio padre en `silent` no escribe
  nada;
- eventos: únicamente `startup.completed`, que registra `server.mjs` **exactamente una vez**
  por arranque satisfactorio, después de validar la configuración y de empezar a escuchar, y
  `startup.config_invalid`, que registran el preflight o `server.mjs`. El preflight nunca
  registra `startup.completed`, y ningún evento contiene valores de configuración ni datos de
  la petición. La consulta a
  `/api/health` no emite ningún registro ni genera `requestId`. El identificador de
  correlación del principio XI se aplicará cuando existan operaciones de producto.

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
ejecuta **tres análisis separados** y falla si cualquiera encuentra un hallazgo no exceptuado,
si falta la herramienta, si su SHA-256 no coincide o si el análisis no puede completarse:

1. **Historial alcanzable desde el commit evaluado**:
   `gitleaks git --log-opts="--full-history HEAD" --redact --no-banner --verbose .`. Recorre
   todos los commits alcanzables desde `HEAD`, incluido el contenido que se añadió y se borró
   después. En la integración continua se usa `fetch-depth: 0` (SC-007). No se usa el
   comportamiento por defecto (`--all`): se verificó que también examina las demás ramas
   locales y remotas, así que el resultado dependería de ramas ajenas al commit. Por ejemplo,
   `negative-test/secrets` haría fallar el control en todos los pull requests mientras
   existiera.
2. **Índice de Git**: examina el contenido preparado (`staged`) aunque difiera del árbol de
   trabajo.
3. **Árbol de trabajo, sin ficheros ignorados**:
   - Obtiene la lista de ficheros versionados modificados y de ficheros nuevos no ignorados.
   - Copia a un directorio temporal (`fs.mkdtemp`) solo los ficheros regulares que existen,
     conservando su ruta relativa. Omite los borrados y los enlaces simbólicos, que no se
     siguen y no incorporan al repositorio el contenido de su destino.
   - Ejecuta `gitleaks dir --redact --no-banner --verbose .` con la copia como directorio de
     trabajo, de modo que los hallazgos muestran rutas relativas.
   - Elimina la copia en un bloque `finally`. Al terminar, comprueba que `git status
     --porcelain` del repositorio real no ha cambiado; si ha cambiado, falla.

La integración continua ejecuta el mismo comando. Allí el índice y el árbol coinciden con el
commit, así que los análisis 2 y 3 son redundantes pero inocuos, y se mantienen para que el
comando local y el remoto sean idénticos (FR-016).

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

**Excepciones** (FR-020): se registran por **huella** (`Fingerprint`) en `.gitleaksignore` y,
con correspondencia uno a uno, en un registro estructurado y verificable automáticamente
(`docs/engineering/security-exceptions.md` o un fichero JSON equivalente versionado). Cada
entrada tiene identificador del hallazgo, responsable, justificación, fecha de aprobación y
`reviewBy` en UTC, como máximo 90 días posterior a la aprobación. Una huella huérfana en
cualquiera de los dos, o una excepción caducada, hace fallar el control. Solo se admite para
un falso positivo o un contenido demostrado como no secreto; un secreto real se revoca
inmediatamente. Las huellas dependen del modo:

- en el historial tienen la forma `commit:fichero:regla:línea`;
- en el índice y en el árbol de trabajo, `fichero:regla:línea`.

Se verificó que `.gitleaksignore` suprime un hallazgo del modo `dir` por su huella. Un falso
positivo en un fichero versionado necesita las huellas de cada análisis que lo cubra, y todas
figuran en el registro.

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

La autorización no elude la protección de `main` ni es una excepción a FR-020: es una
autorización puntual de un dato de prueba. El pull request sigue en borrador, no se integra y
debe mostrar el control `secrets` fallido. Si no puede autorizarse, SC-003 queda sin superar.
Cualquier alerta se cierra como dato sintético usado en una prueba; su permanencia en las
referencias del pull request cerrado es un riesgo aceptado.

**Alternativas descartadas**:

- **TruffleHog**: verifica los secretos contactando con sus proveedores, lo que es una llamada
  externa que no queremos por defecto, y es más pesado.
- **Homebrew o Docker para instalar Gitleaks**: Homebrew no fija versiones exactas y solo sirve
  en macOS; Docker es un requisito previo pesado.

## R12. Seguridad de dependencias: `npm audit` con envoltorio de excepciones

**Decisión**: `scripts/check-dependencies.mjs`, un script de Node sin dependencias, que:

1. ejecuta `npm audit --json` sobre las dependencias directas, de desarrollo y transitivas
   presentes en el lockfile;
2. **falla** si hay vulnerabilidades altas o críticas que no tengan una excepción vigente en
   `security/audit-exceptions.json`, con identificador de aviso (GHSA), paquete, justificación,
   responsable, fecha de aprobación y `reviewBy` en UTC (FR-020);
3. **falla** si una excepción ha caducado, está incompleta o su `reviewBy` incumple el máximo
   de 90 días;
4. **falla cerrado** si no puede consultar la base de avisos o el registro;
5. **muestra sin fallar** las vulnerabilidades medias y bajas, en la salida y, en la
   integración continua, en `$GITHUB_STEP_SUMMARY`, con paquete, aviso, gravedad y enlace,
   durante la retención de la ejecución (FR-017);
6. ejecuta `npm audit signatures`; un código distinto de cero hace fallar el control. Cambiar
   el umbral de gravedad exige actualizar la especificación y este ADR.

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

La frontera HTTP añade a `check:build` la matriz negativa por TCP crudo, la equivalencia entre
modos y la auditoría de registros. En la prueba formal de viabilidad con Node.js 24.21.0 (R1),
la matriz completa de 1531 casos tardó unos 6 segundos y el humo de 36 casos menos de 1
segundo, sin contar el calentamiento del modo desarrollo. El subconjunto permanente es menor
que la matriz completa, así que no cambia de forma apreciable las estimaciones anteriores; su
duración real se registra en la aceptación.

## Riesgos y consecuencias

| Id | Riesgo | Mitigación | Disparador de revisión |
|----|--------|------------|-------------------------|
| K1 | Node 24 pasa a mantenimiento el 2026-10-20 | Soporte hasta el 2028-04-30; migración planificada | Node 26 LTS (2026-10-28) |
| K2 | Avisos de seguridad graves en Next.js o React | Versiones fijadas y parcheadas, auditoría bloqueante, Dependabot, auditoría semanal | Cualquier aviso alto o crítico |
| K3 | `typescript-eslint` retrasa la adopción de TypeScript 7 | Fijar 6.0.3 | Cuando `typescript-eslint` admita TypeScript 7 |
| K4 | `eslint-config-next` no admite ESLint 10 | No se usa hasta que haya interfaz | Primera funcionalidad con interfaz |
| K5 | ~~La 404 comodín puede no ser compatible~~ **Resuelto** | Sustituido por la frontera HTTP: todo destino distinto de `/api/health` recibe 404 cerrado antes de Next.js, sin comodín ni reescrituras (R1). La prueba de humo recorre la matriz negativa | Cada actualización de Next.js o de Node.js (K9 y K18) |
| K6 | ~~La cabecera `Vary` revela el framework~~ **Resuelto en diseño; pendiente de implementación y aceptación** | Pages Router detrás de la frontera HTTP: sin `Vary` del framework; solo `Vary: Accept-Encoding`. Evidencia formal de viabilidad con Node.js 24.21.0 (R1), que la implementación debe reproducir (K14) | Cada actualización de Next.js o de Node.js; cualquier `Vary` distinta de `Accept-Encoding` en la prueba de humo |
| K7 | Los binarios de zizmor son "best-effort" | SHA-256, doble plataforma y alternativa con `uv` | Fallo en una plataforma |
| K8 | La base de avisos de `npm audit` cambia con el tiempo | Auditoría semanal y excepciones con caducidad | Nuevo aviso |
| K9 | Cabeceras de caché o de framework cambian entre versiones de Next.js | La prueba de humo verifica cabeceras y cuerpo | Cada actualización de Next.js |
| K10 | ~~Solo se verificó `process.exit(1)` con `next start`~~ **Resuelto** | Verificados ambos modos (R8). `instrumentation` no basta porque el puerto llega a abrirse y se elimina del diseño; el preflight común impide arrancar `server.mjs` en ambos modos, y `server.mjs` no escucha sin configuración válida. La prueba de humo cubre `npm start` y `npm run dev` | Cada actualización de Next.js (K9) |
| K11 | ~~En desarrollo, el espacio `/__nextjs_*` del servidor de desarrollo tiene respuestas propias~~ **Resuelto** | La frontera HTTP lo rechaza con 404 cerrado en ambos modos, y el `Upgrade` de recarga de desarrollo recibe un rechazo cerrado; ya no queda fuera del contrato (R1) | Primera funcionalidad con interfaz (K23) |
| K12 | `@next/env` y `next` quedan con versiones distintas | Versión exacta idéntica, prueba de arquitectura que compara ambas y grupo común en Dependabot | Cada actualización de Next.js |
| K13 | La eliminación nativa de tipos de Node.js cambia dentro de la línea 24 | Solo se usa en tres módulos portables con sintaxis borrable (`erasableSyntaxOnly`); si falla la carga, el preflight o `server.mjs` terminan con error (falla cerrado) y la prueba de humo lo detecta | Cada actualización de `.node-version` y cualquier fallo con una versión posterior de la línea 24 admitida por el rango de desarrollo |
| K14 | La prueba de viabilidad de C6 no es la implementación | Se declara evidencia de viabilidad, no aceptación. La implementación repite la matriz negativa, la equivalencia y la auditoría en `check:build` (T029 a T031) y las registra en `acceptance.md` sobre el SHA candidato | Cada SHA base de aceptación |
| K15 | Diferencias de dependencias entre la prueba y el plan | La prueba usó un conjunto reducido (sin Zod, Pino, `@next/env`, ESLint ni Vitest, sin preflight y con otras versiones de TypeScript y `@types/node`). Se mantienen las versiones aprobadas y la aceptación repite la evidencia con ellas y con Node.js 24.21.0 | Cualquier cambio de dependencias que afecte a la entrega HTTP |
| K16 | El 500 cerrado de la API Route, el 500 de `server.mjs` y el preflight con `server.mjs` están pendientes de implementar | Solo están diseñados; T023, T024, T025, T037, T041 y T042 los prueban e implementan. No se presentan como resueltos. Su alcance exacto excluye los fallos internos del framework (K25) | Implementación de US1 |
| K17 | `next dev` y `next start` directos eluden la frontera y reabren las respuestas del framework | No están admitidos: no aparecen en ningún script ni en la documentación como entrada; T032 falla si `package.json` los invoca, si aparece otro punto de entrada o si `next.config.ts` introduce `rewrites`, `headers`, `redirects`, middleware o `proxy` | Cualquier cambio en `package.json`, `next.config.ts` o en los puntos de entrada |
| K18 | La frontera depende del analizador HTTP de Node.js (llhttp), que decide qué entradas malformadas se rechazan con 400 antes de la frontera | Las expectativas admiten el 400 cerrado de error de análisis como alternativa contractual; la matriz negativa se repite en cada cambio de Node.js | Cada actualización de `.node-version` y la migración a Node 26 LTS (K1) |
| K19 | El cierre de la conexión tras un rechazo puede observarse como cierre ordenado o como reinicio según la temporización | Ambos están dentro del contrato: la prueba comprueba estado, cuerpo, cabeceras y ausencia de una segunda respuesta, no el tipo de cierre | Una diferencia de estado, cuerpo o cabeceras entre ejecuciones |
| K20 | Los tiempos de espera del servidor HTTP (`headersTimeout`, `requestTimeout` y `keepAliveTimeout`) no se probaron | Se conservan los valores por defecto de Node.js y no se modifican; ningún requisito depende de ellos | Una necesidad de exposición fuera del bucle local o un cambio de esos valores |
| K21 | `Host` con bytes de obs-text o con espacios internos se admite, porque la frontera valida estructura y no formato | Riesgo aceptado mientras la escucha sea `127.0.0.1:3000`; T028 fija el comportamiento para que cualquier cambio sea visible; el valor nunca se registra ni se refleja | Una exposición fuera del bucle local |
| K22 | Las dependencias opcionales que instala npm varían con su versión y con la plataforma (por ejemplo, alternativas WebAssembly de binarios nativos) | Afecta a las trazas de compilación, no al contrato HTTP; `npm ci` con el lockfile y la versión de npm incluida con Node.js 24.21.0 en la aceptación | Cambio de la versión de npm o del lockfile |
| K23 | La frontera rechaza `/_next/*` y el `Upgrade` de recarga de desarrollo, que una interfaz necesitará | La primera funcionalidad con interfaz rediseña la frontera en un ADR nuevo, sin ampliar la excepción pública | Primera funcionalidad con interfaz |
| K24 | `Keep-Alive: timeout=5` podría confundirse con un tiempo interno o cambiar de valor | Se admite como metadato de transporte cerrado a ese valor, solo en respuestas satisfactorias sobre conexiones persistentes; la matriz negativa comprueba el valor y su ausencia en los rechazos | Cualquier otro valor o su aparición en un rechazo |
| K25 | Un fallo interno del framework anterior a la entrada en el manejador de la API Route (por ejemplo, al cargar o compilar su módulo) produce una respuesta del propio framework que no puede convertirse retrospectivamente en el 500 cerrado de la aplicación | Compilación obligatoria (`check:build`); preflight; módulo sin inicialización falible; lectura de versión y configuración dentro del `try` del manejador; prueba negativa de construcción (T053); prueba forzada del error del manejador (T023). **Límite**: un fallo arbitrario del framework no se presenta como cubierto por la respuesta 500 de la aplicación; un commit candidato solo es aceptable tras superar compilación, preflight y las pruebas negativas correspondientes | Cualquier cambio de Next.js o de la API Route; cualquier respuesta 500 no cerrada en la prueba de humo |
