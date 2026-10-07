# ADR 0001: Arquitectura, runtime y estructura modular

**Estado**: Aceptado. Estuvo Propuesto desde el 2026-09-25 y durante todo el PR de implementación; se acepta en el primer PR posterior a la integración de `001-engineering-baseline` y a la activación de los nueve controles requeridos, ambas del 2026-10-06. La aceptación no cambia el sentido de la decisión.

**Sustitución parcial**: el [ADR 0003](./0003-scorm-export-instead-of-automatic-moodle-publication.md),
Aceptado, sustituye dos elementos de la decisión 5: la responsabilidad de la cuarta capa, que
pasa de la publicación en Moodle a la exportación, y la ubicación de su módulo, que pasa de
`src/modules/moodle-publication` a `src/modules/content-export`. El resto de esta decisión
sigue vigente y su texto no se modifica (nota de revisión; no cambia la decisión).

**Segunda sustitución parcial**: el [ADR 0004](./0004-product-surface-persistence-identity-and-generation.md),
Aceptado, sustituye lo que enumera su apartado "Relación con los ADR aceptados": de la decisión
8, la ausencia de HTML, la delegación de un único destino, el cuerpo vacío, la prueba de la
ruta única y el registro de peticiones de Next.js; de la decisión 1, la existencia de una sola
API Route; de la decisión 5, las importaciones de la capa de entrega y de `server.mjs`; y de la
decisión 7, los eventos de registro. El resto de esta decisión sigue vigente y su texto no se
modifica (nota de revisión; no cambia la decisión).

**Fecha**: 2026-09-25

**Contexto de origen**: [`specs/001-engineering-baseline/plan.md`](../../specs/001-engineering-baseline/plan.md)
y [`research.md`](../../specs/001-engineering-baseline/research.md) (R1 a R4, R7 a R9 y R14).
Incluye la revisión correctiva del 2026-09-25 (arranque en ambos modos, ausencia de HTML y
dependencias de la capa de entrega) y la corrección documental posterior (versión de referencia
y rango soportado de Node.js), ambas anteriores a su aceptación, además de la alineación con la
constitución 1.1.0 y la excepción cerrada de su principio V. La convergencia de la condición C6
(2026-09-28), también anterior a su aceptación, sustituye el App Router por el Pages Router
detrás de una frontera HTTP propia, porque la decisión anterior no era viable (FR-027).

## Contexto

AulaNorma necesita una base ejecutable antes de su primera funcionalidad de producto. La
constitución exige:

- un monolito modular como opción inicial (principio XII);
- cuatro capas separadas, cada una consumiendo solo a la anterior mediante su contrato público
  (principio II);
- versiones estables y soportadas.

El producto tendrá una interfaz docente y una API de servidor, pero esta funcionalidad no
incluye interfaz, persistencia, operaciones de producto ni llamadas externas. La ausencia de
autenticación en `/api/health` no es una dispensa general: se apoya exclusivamente en la
excepción pública cerrada del principio V de la constitución 1.1.0. La ruta es de solo lectura,
no accede a datos de negocio ni personales, no usa persistencia ni servicios externos, no cambia
estado, devuelve un contrato mínimo, explícito y cerrado, y no revela configuración, entorno,
rutas, commits, tiempos internos, dependencias, infraestructura ni información sensible. La
especificación declara la excepción y las pruebas de contrato y de humo comprueban sus
condiciones. Cualquier operación futura que no cumpla todas ellas deberá aplicar autenticación y
autorización con denegación por defecto. La base debe funcionar igual en macOS y Linux.

La condición C6 exige que ninguna respuesta revele dependencias. Con Next.js 16.3.6, el App
Router añade a sus respuestas una cabecera `Vary` con identificadores propios del framework, y
cualquier URL que Next.js atienda directamente puede devolver HTML, `ETag`, redirecciones o
cabeceras `x-nextjs-*`. Las pruebas desechables descartaron las tres alternativas estándar
(ver "Alternativas consideradas"). La única opción demostrada es decidir cada petición **antes**
de Next.js con un servidor personalizado mínimo. Por esa necesidad constitucional, esta
decisión lo adopta pese a la complejidad que añade (plan.md, Complexity Tracking).

## Decisión

1. **Aplicación**: una única aplicación **Next.js 16.3.6** con **Pages Router**, desplegable
   como una sola unidad. En esta funcionalidad solo existe la API Route
   `src/pages/api/health.ts`, detrás de un servidor personalizado mínimo, `server.mjs`, que
   aplica la frontera HTTP (decisión 8). No hay App Router operativo. Next.js es solo la capa de
   entrega HTTP; el dominio es TypeScript independiente del framework.
2. **Runtime**: **Node.js 24 LTS**, con dos niveles:
   - **versión reproducible de referencia y de la integración continua**: **24.21.0**, fijada
     en `.node-version`. Las mediciones de aceptación se realizan obligatoriamente con ella;
   - **rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`, aplicado por
     `devEngines.runtime` con `onFail: "error"`, que aplica npm 11, y con el mismo rango por
     `engines.node` con `engine-strict=true`, que cubre clientes como npm 10, que no aplican
     `devEngines`. `npm ci` rechaza antes de instalar las versiones fuera del rango, no
     cualquier versión distinta de 24.21.0. Node.js 26 queda excluido por el rango, pero no se
     ha ejecutado en la validación.

   Las pruebas desechables de la investigación se hicieron con 24.13.0, de la misma línea LTS.
   Son evidencia exploratoria y no sustituyen la aceptación con 24.21.0.
3. **Lenguaje**: **TypeScript 6.0.3** en modo estricto, con opciones adicionales
   (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y otras).
4. **Gestor de paquetes**: **npm** 11 (incluido con Node) con `package-lock.json`, `npm ci`,
   versiones exactas, `ignore-scripts=true` y `engine-strict=true`.
   `devEngines.packageManager` y `engines.npm` declaran npm con el mismo rango, coherente con el
   de Node.js, cuyo mínimo es la versión incluida con 24.21.0 (`>=11.19.0 <12`).
   `package.json` declara `"type": "module"`.
5. **Estructura modular**:
   - `src/modules/normative-source`, `structured-interpretation`, `didactic-content` y
     `moodle-publication`, cada uno con un `index.ts` público y un `README.md`, vacíos en esta
     funcionalidad;
   - `src/platform` para lo transversal, con un `index.ts` público por área: `config`,
     `logging`, `http-boundary`, `health` y `version`;
   - cada capa de dominio solo puede depender de la capa anterior y de `platform`, a través de
     su `index.ts`;
   - `src/platform/http-boundary` contiene la lógica portable de la frontera HTTP;
   - **la capa de entrega** (`server.mjs` y `src/pages/api/health.ts`) **solo puede importar
     las API públicas de `src/platform`** y ninguna capa de dominio. La primera porción vertical
     de producto definirá sus puntos de entrada y ampliará esta regla solo para las capas que
     justifique;
   - todo ello se fuerza con `no-restricted-imports` de ESLint y se verifica con pruebas de
     arquitectura.
6. **Configuración**: un único esquema **Zod 4.6.5** en `src/platform/config`, expuesto mediante
   tres operaciones que devuelven la misma unión discriminada, `{ ok: true, config }`
   (configuración inmutable) u `{ ok: false, problems }` (`readonly { key, problem }[]`, sin
   valores). Ninguna registra valores:
   - **`validateConfig(source)`**: función pura sobre una fuente inyectada, sin leer
     `process.env`.
   - **`loadConfig(mode)`**: función común del preflight y de `server.mjs`. Recibe
     explícitamente `development` o `production` y exige que `NODE_ENV` coincida; si no
     coincide, devuelve `mode_mismatch` antes de cargar nada. Carga los ficheros `.env*` con
     `@next/env` 16.3.6, el cargador de Next.js en su misma versión, con `forceReload = true`,
     para no reutilizar su caché, y con un logger controlado que descarta todo; cualquier error
     de carga se convierte en `env_load_failed`, sin rutas, nombres de ficheros `.env`, mensajes
     ni trazas. Después lee `process.env` y delega en `validateConfig`.
     `npm run dev` y `npm start`, los únicos puntos de entrada, ejecutan
     `NODE_ENV=<entorno> node scripts/preflight.mjs <modo> && NODE_ENV=<entorno> node server.mjs`,
     con `NODE_ENV` fijado por separado en los dos procesos. `npm run dev` fija además vacías,
     en los dos procesos, `TURBOPACK`, `IS_TURBOPACK_TEST` y `NEXT_RSPACK`: son selectores del
     compilador de Next.js, no claves del esquema de configuración. Si el preflight
     recibe un fallo, registra la clave y el código del problema (nunca el valor) y termina con
     código 1: `server.mjs` no llega a arrancar y el puerto nunca se abre. `server.mjs` vuelve a
     llamar a `loadConfig` antes de escuchar para crear el logger; si recibe un fallo, termina
     con código 1 sin abrir el puerto. Solo `server.mjs` emite `startup.completed`, exactamente
     una vez, después de validar y de empezar a escuchar; el preflight nunca lo emite.
   - **`readRuntimeConfig()`**: acceso de la API Route al `process.env` ya preparado del
     proceso, sin volver a cargar `.env*` ni llamar a `@next/env`, sin compartir instancia en
     memoria con `server.mjs` e ignorando el marcador interno `__NEXT_PROCESSED_ENV`. `src/pages/api/health.ts` lo invoca dentro del `try` de cada
     manejo, nunca al evaluar el módulo. Si el resultado es un fallo, o hay cualquier otro fallo
     dentro del manejador antes de iniciar la respuesta, la ruta responde el 500 cerrado
     (cuerpo vacío, `no-store`, `Content-Length: 0` y `Connection: close`), nunca "ok".

   **Límite del 500 cerrado**: solo cubre los fallos dentro del manejador, el rechazo de
   `handle` antes de las cabeceras y la destrucción de la conexión si la respuesta ya empezó.
   Los errores internos de Next.js anteriores a la entrada en el manejador (por ejemplo, al
   cargar o compilar su módulo) no se convierten en ese 500 y se tratan como riesgo residual
   (research.md, K25).

   Solo `src/platform/config` lee claves de `process.env`; `server.mjs` solo lee
   `process.env.NODE_ENV`. No existe `instrumentation.ts`. Aplicar un cambio de `.env*` exige
   reiniciar; no se promete la recarga en caliente de la configuración.
   `src/platform/config/index.ts`, `src/platform/logging/index.ts` y
   `src/platform/http-boundary/index.ts` son módulos portables: el preflight y `server.mjs` los
   cargan directamente con Node.js, que elimina los tipos de forma nativa. Solo importan
   paquetes npm y usan sintaxis TypeScript borrable (`erasableSyntaxOnly`), sin `enum` ni
   `namespace`. Esta decisión describe el diseño propuesto; la implementación de esta
   funcionalidad ya lo aplica.
7. **Registros**: **Pino 10.3.1** en JSON por la salida estándar, con redacción de campos
   sensibles. Eventos: únicamente `startup.completed` y `startup.config_invalid`. La
   consulta a `/api/health` no emite ningún registro ni genera `requestId`. El
   identificador de correlación del principio XI se aplicará cuando existan operaciones de
   producto.
8. **Frontera HTTP, endurecimiento y ausencia de interfaz**:
   - `server.mjs` es un adaptador mínimo con `// @ts-check` que escucha en `127.0.0.1:3000`,
     fijos, sin leer `HOSTNAME`, `PORT` ni claves nuevas. Crea el servidor con
     `http.createServer({ requireHostHeader: false }, …)`, decide cada petición antes de
     Next.js con `src/platform/http-boundary` y hace una única llamada a `handle(req, res)`.
     No usa propiedades privadas de Node.js ni registra nada por petición;
   - **compilador de desarrollo**: `npm run dev` usa Webpack. `server.mjs` pasa `webpack: true`
     a `next()` solo en desarrollo y sigue leyendo únicamente `process.env.NODE_ENV`; los tres
     selectores vacíos del script impiden que el entorno heredado o los ficheros `.env*`
     elijan otro compilador. La garantía corresponde a `npm run dev`: `node server.mjs` directo
     sigue sin estar admitido. `npm start` y `next build` no cambian, así que desarrollo y
     compilación usan compiladores distintos; la equivalencia contractual entre los dos modos
     la comprueba la prueba de humo (research.md, R8);
   - precedencia **versión → `Host` → destino → método → cuerpo**. Solo el destino crudo exacto
     `/api/health` con `GET`, `HEAD` u `OPTIONS` se delega. Versiones admitidas: HTTP/1.0 y
     HTTP/1.1 (505 para otra versión analizada). `Host`: en HTTP/1.1, exactamente uno, no vacío,
     sin coma ni caracteres de control, detectado sobre `rawHeaders`; opcional en HTTP/1.0.
     Cuerpo: solo sin `Transfer-Encoding` y con `Content-Length` normalizado a 0;
   - todos los rechazos (400, 404, 405, 500 y 505) tienen cuerpo vacío, `Cache-Control:
     no-store`, `Content-Length: 0` y `Connection: close`; `Allow` solo en 405. El servicio no
     redirige;
   - **estado de conexión** transitorio por socket: después de un rechazo no se delega ni se
     responde otra petición; `clientError` nunca genera una segunda respuesta; los errores se
     difieren mientras haya respuestas legítimas pendientes y terminan en *flush* o *dropped*;
     `checkContinue` y `checkExpectation` pasan por la misma frontera sin 100 ni 417
     automáticos; `CONNECT` y `Upgrade` se rechazan de forma cerrada;
   - si `handle` rechaza antes de enviar cabeceras, `server.mjs` responde el 500 cerrado; si ya
     se inició la respuesta, destruye la conexión sin una segunda;
   - `next.config.ts`: `poweredByHeader: false`, `images.unoptimized: true` y
     `logging.incomingRequests.ignore: [/^\/api\/health$/]`; sin `rewrites`, `headers`,
     `redirects`, middleware ni `proxy`;
   - `NEXT_TELEMETRY_DISABLED=1` en todos los scripts y en la integración continua;
   - **ninguna página HTML se sirve en la superficie HTTP**, aunque la compilación genere las
     páginas de error del framework. La única `Vary` admitida es `Vary: Accept-Encoding`;
   - `next dev` y `next start` directos no están admitidos, porque eluden la frontera. Una
     prueba de arquitectura falla si `package.json` los invoca, si aparece otro punto de
     entrada, si `next.config.ts` introduce `rewrites`, `headers`, middleware o `proxy`, o si se
     crea una segunda ruta pública;
   - `/api/health` es la única operación sin autenticación, en aplicación estricta de la
     excepción cerrada del principio V de la constitución 1.1.0. Su alcance son
     exclusivamente `GET` y `HEAD`. La versión es información pública del contrato, SemVer
     básico `X.Y.Z` leído de `package.json`; las versiones de dependencias no lo son. `OPTIONS`
     es una respuesta técnica de transporte de esa misma ruta. Las respuestas 400, 404, 405,
     500 y 505 son de rechazo: no ejecutan una operación de producto, no constituyen
     autorización y no amplían la excepción. Si el preflight o `server.mjs` no pueden cargar
     los módulos portables, terminan con código distinto de cero sin escuchar (fallo cerrado).
     La decisión no autoriza ninguna otra ruta pública por analogía.
9. **Scripts auxiliares**: JavaScript de Node (`.mjs`) sin dependencias propias, en lugar de
   bash, por la portabilidad entre macOS y Linux. Las excepciones son el preflight, que usa
   `@next/env` para no duplicar la semántica de carga de Next.js, y `server.mjs`, que usa
   `next` y `@next/env` como adaptador de la entrega.

## Alternativas consideradas

- **Frontend y backend separados**: dos unidades y dos pipelines, contrario al principio XII.
- **Solo servidor HTTP (Fastify, Hono o `node:http`)**: más simple hoy, pero obligaría a
  reestructurar al añadir la interfaz docente.
- **React Router 7, SvelteKit o Nuxt**: sin ventajas determinantes para este proyecto.
- **Node 26**: no será LTS hasta el 2026-10-28. **Node 22**: menos margen de soporte.
- **TypeScript 7**: `typescript-eslint` 8.70.1 solo admite TypeScript por debajo de la 6.1.
- **pnpm, Yarn o Bun**: añaden un requisito previo sin beneficio proporcional.
- **Lanzar una excepción en `register()`**: verificado que el servidor sigue en marcha y responde
  500, así que no cumple FR-005.
- **Validar solo en `instrumentation` con `process.exit(1)`**: verificado en `next start` y en
  `next dev` que el puerto llega a aceptar conexiones antes de que el proceso termine. No cumple
  "no dejar un proceso escuchando" y se mantiene solo como defensa.
- **Cargar los `.env` en el preflight con `node --env-file` o `process.loadEnvFile`**: habría que
  replicar la lista de ficheros, la precedencia y la expansión de Next.js.
- **Validar en `next.config.ts`**: acoplaría la compilación a la configuración de ejecución.
- **`instrumentation` como defensa adicional**: no impide que el puerto se abra y, con
  `server.mjs` como único servidor detrás del preflight, no cubre ningún caso admitido.
- **App Router, o una API Route del Pages Router combinada con un comodín del App Router**
  (prueba desechable del 2026-09-27): las rutas del App Router añaden
  `Vary: rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch`, sin
  opción de configuración; borrarla en el manejador no la elimina y declararla en `headers()`
  añade una segunda. Además aparecen redirecciones propias con `Location` que incluye
  `?_rsc=`. Contradice FR-006 C6.
- **Pages Router con `rewrites`** hacia una 404 propia: las URL con barra final o barras
  repetidas reciben 308 con `Location` y `Refresh`; las rutas codificadas reciben la página 404
  HTML del framework, con `ETag` y `Vary` del framework; y aparecen cabeceras
  `x-nextjs-rewritten-*`. Contradice FR-006 C6 y FR-009.
- **Pages Router con `proxy.ts`** (middleware): `TRACE` y `.rsc` producen HTML o cabeceras
  del framework, y ciertas normalizaciones y redirecciones ocurren antes del proxy, que no
  puede cerrarlas. Contradice FR-006 C6 y FR-009.
- **Aceptar la 404 HTML por defecto de Next.js, `pages/404`, `app/not-found.tsx` o
  `global-not-found`**: producen HTML y contradicen FR-009.
- **`skipTrailingSlashRedirect`**: convierte `/api/health/` en una segunda URL válida.
- **`next start` o `next dev` directos**: Next.js atiende todas las URL y reaparecen las
  respuestas de las alternativas anteriores.
- **Permitir desde ahora que la entrega importe las cuatro capas**: autorización anticipada
  sin necesidad; `/api/health` solo usa `platform`.

## Consecuencias

**Positivas**:

- Una unidad desplegable preparada para añadir la interfaz docente sin crear hoy comportamiento
  de producto.
- Las capas son visibles y sus límites se verifican automáticamente. La entrega no depende de
  ninguna capa de dominio.
- La configuración inválida impide arrancar `server.mjs` en `npm run dev` y en `npm start`, con
  un mensaje claro, sin filtrar valores y sin abrir el puerto.
- Ninguna página HTML se sirve: todo destino distinto de `/api/health` recibe un 404 cerrado,
  sin cuerpo y sin redirección, antes de llegar a Next.js.
- FR-006 C6 se cumple en diseño: sin `Vary` del framework, `ETag`, `x-nextjs-*`, `Location` ni
  `Refresh`; la única `Vary` es `Accept-Encoding`. Una prueba formal desechable con Node.js
  24.21.0, npm 11.19.0 y Next.js 16.3.6 en macOS arm64 superó la compilación limpia, el humo
  (36 casos y 42 peticiones), la matriz completa (1531 casos y 1574 peticiones) y el
  calentamiento y humo de desarrollo, con 0 respuestas HTML, 0 filtraciones, 0 cabeceras del
  framework, 0 redirecciones, 0 errores 500 inesperados, equivalencia contractual entre
  desarrollo y producción y 0 diferencias inesperadas frente a la exploración con Node.js
  24.13.0. Es **evidencia de viabilidad, no aceptación**: la implementación DEBE reproducirla
  con Node.js 24.21.0, las dependencias aprobadas, el preflight, la configuración real y el
  mismo SHA candidato. Esa prueba es anterior a la selección de Webpack en `npm run dev` y no
  registró qué compilador usó en desarrollo.
- El desarrollo usa Webpack y la compilación conserva su compilador por defecto. El motivo es
  un aviso de sistema de archivos lento de Turbopack, identificado por sus firmas en el
  [PR #5](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/5), que la prueba de humo
  rechaza en el arranque de desarrollo; las firmas no demuestran la causa de la lentitud, y
  los fallos anteriores sin firma no se atribuyen a ese mensaje. La corrección se validó como
  candidata en local y en el
  [PR #6](https://github.com/Informatica-Colectivo-Prime/aulanorma/pull/6), con los nueve controles
  superados en una ejecución. La aceptación de la base que la
  incorpore sigue pendiente (research.md, R8).
- Next.js se conserva para el código de la aplicación y la futura interfaz, y la excepción
  pública no se amplía.
- Se evitan llamadas externas por telemetría y por el optimizador de imágenes, y la exposición
  del framework por `X-Powered-By`.

**Negativas y riesgos aceptados**:

- `react` y `react-dom` son dependencias obligatorias de Next.js aunque no haya interfaz.
- `@next/env` se declara como dependencia directa y debe mantener la misma versión que `next`;
  lo comprueba una prueba de arquitectura y Dependabot los actualiza en el mismo grupo.
- El preflight y `server.mjs` dependen de la eliminación nativa de tipos de Node.js en tres
  módulos portables. Si la carga falla, terminan con error (falla cerrado) y la prueba de humo
  lo detecta.
- Se pierde el arranque estándar directo de Next.js (`next dev` y `next start`), que queda no
  admitido, y las optimizaciones que Next.js reserva a su servidor propio, como la salida
  `standalone`. Esta funcionalidad no sirve páginas ni configura despliegue.
- La aplicación asume una responsabilidad HTTP adicional: validación de versión, `Host`,
  destino, método y framing, y el estado de conexión. Exige pruebas unitarias de la frontera y
  de sus sockets, una matriz negativa por TCP crudo, la equivalencia entre modos y la auditoría
  de registros en `check:build`.
- La frontera depende del analizador HTTP de Node.js (llhttp), que rechaza algunas entradas
  malformadas con 400 antes de la frontera; cada actualización de Node.js repite la matriz.
- Next.js tiene historial de avisos de seguridad graves; se mitiga con la estrategia del ADR 0002.
- Las URL no canónicas (barra final, barras repetidas o codificación) reciben 404, no una
  redirección: no existe una segunda URL válida.
- La primera funcionalidad con interfaz necesitará recursos bajo `/_next/*` y, en desarrollo,
  la recarga mediante `Upgrade`, que la frontera rechaza hoy. Deberá rediseñar la frontera en
  un ADR nuevo.
- Mientras este ADR estuvo Propuesto, si la implementación demostraba que la decisión no era
  viable, se corregía el ADR antes de aceptarlo; así se hizo en las revisiones citadas en el
  contexto de origen. Una vez Aceptado, un cambio de sentido exige un ADR nuevo que lo
  sustituya (nota de revisión de la aceptación; no cambia la decisión).
- Node 24 pasa a mantenimiento el 2026-10-20, con soporte hasta el 2028-04-30.
- El rango de desarrollo admite versiones de la línea 24 posteriores a 24.21.0 que la
  integración continua no verifica. La referencia reproducible sigue siendo `.node-version`, y
  un fallo con una versión posterior se trata como disparador para actualizarla.

**Revisiones planificadas**:

- Tras el 2026-10-28, evaluar la migración a **Node 26 LTS** en un ADR nuevo.
- Evaluar **TypeScript 7** cuando `typescript-eslint` lo admita.
- En la primera funcionalidad con interfaz, incorporar las reglas de Next.js y React y la
  accesibilidad en el lint (ver ADR 0002), y rediseñar en un ADR nuevo la frontera HTTP, porque
  la interfaz necesitará recursos en `/_next/static` y la recarga de desarrollo. Esa revisión
  versa sobre servir activos de cliente, no sobre ampliar la excepción pública: cualquier
  operación nueva sin autenticación exige su propia declaración y las siete condiciones; no
  hereda FR-006.
- En cada actualización de `.node-version` y en la migración a Node 26 LTS, repetir la matriz
  negativa y la equivalencia entre modos, porque el analizador HTTP de Node.js puede cambiar.
- En la primera porción vertical de producto, definir sus puntos de entrada y ampliar las
  dependencias permitidas de la entrega solo para las capas que justifique.
