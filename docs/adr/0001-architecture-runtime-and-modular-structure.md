# ADR 0001: Arquitectura, runtime y estructura modular

**Estado**: Propuesto (se acepta al integrar `001-engineering-baseline`)

**Fecha**: 2026-09-25

**Contexto de origen**: [`specs/001-engineering-baseline/plan.md`](../../specs/001-engineering-baseline/plan.md)
y [`research.md`](../../specs/001-engineering-baseline/research.md) (R1 a R4, R7 a R9 y R14).
Incluye la revisión correctiva del 2026-09-25 (arranque en ambos modos, ausencia de HTML y
dependencias de la capa de entrega) y la corrección documental posterior (versión de referencia
y rango soportado de Node.js), ambas anteriores a su aceptación.

## Contexto

AulaNorma necesita una base ejecutable antes de su primera funcionalidad de producto. La
constitución exige:

- un monolito modular como opción inicial (principio XII);
- cuatro capas separadas, cada una consumiendo solo a la anterior mediante su contrato público
  (principio II);
- versiones estables y soportadas.

El producto tendrá una interfaz docente y una API de servidor, pero esta funcionalidad no puede
incluir interfaz, persistencia, autenticación ni llamadas externas. La base debe funcionar igual
en macOS y Linux.

## Decisión

1. **Aplicación**: una única aplicación **Next.js 16.3.6** con App Router, desplegable como una
   sola unidad. Next.js es solo la capa de entrega HTTP (`src/app`); el dominio es TypeScript
   independiente del framework.
2. **Runtime**: **Node.js 24 LTS**, con dos niveles:
   - **versión reproducible de referencia y de la integración continua**: **24.21.0**, fijada
     en `.node-version`. Las mediciones de aceptación se realizan obligatoriamente con ella;
   - **rango oficialmente soportado para desarrollo**: `>=24.21.0 <25`, aplicado por
     `devEngines.runtime` con `onFail: "error"`. `npm ci` rechaza las versiones fuera del
     rango, no cualquier versión distinta de 24.21.0.

   Las pruebas desechables de la investigación se hicieron con 24.13.0, de la misma línea LTS.
   Son evidencia exploratoria y no sustituyen la aceptación con 24.21.0.
3. **Lenguaje**: **TypeScript 6.0.3** en modo estricto, con opciones adicionales
   (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` y otras).
4. **Gestor de paquetes**: **npm** 11 (incluido con Node) con `package-lock.json`, `npm ci`,
   versiones exactas e `ignore-scripts=true`. `devEngines.packageManager` declara npm con un
   rango coherente con el de Node.js, cuyo mínimo es la versión incluida con 24.21.0.
   `package.json` declara `"type": "module"`.
5. **Estructura modular**:
   - `src/modules/normative-source`, `structured-interpretation`, `didactic-content` y
     `moodle-publication`, cada uno con un `index.ts` público y un `README.md`, vacíos en esta
     funcionalidad;
   - `src/platform` para lo transversal, con un `index.ts` público por área: `config`,
     `logging`, `health` y `version`;
   - cada capa de dominio solo puede depender de la capa anterior y de `platform`, a través de
     su `index.ts`;
   - **la capa de entrega** (`src/app` y los ficheros `instrumentation`) **solo puede importar
     las API públicas de `src/platform`** y ninguna capa de dominio. La primera porción vertical
     de producto definirá sus puntos de entrada y ampliará esta regla solo para las capas que
     justifique;
   - todo ello se fuerza con `no-restricted-imports` de ESLint y se verifica con pruebas de
     arquitectura.
6. **Configuración**: un único esquema **Zod 4.6.5** en `src/platform/config`, aplicado en tres
   puntos:
   - **Preflight común** (mecanismo principal): `scripts/preflight.mjs` se ejecuta antes de
     Next.js en `npm run dev` y en `npm start`. Carga los ficheros `.env*` con `@next/env`
     16.3.6, el cargador de Next.js en su misma versión, así que ve los mismos ficheros con la
     misma precedencia. Si la configuración no es válida, registra la clave y el código del
     problema (nunca el valor) y termina con código 1. Next.js no llega a arrancar y el puerto
     nunca se abre.
   - **`instrumentation`** (defensa): `src/instrumentation-node.ts`, cargado solo en el runtime
     de Node, revalida y llama a `process.exit(1)`. Cubre la invocación directa de `next`.
   - **Ruta de estado** (defensa): `/api/health` valida su instantánea de configuración y
     responde 500 sin cuerpo si no es válida. Cubre la recarga en caliente de `next dev`.

   `src/platform/config/index.ts` y `src/platform/logging/index.ts` son módulos portables: el
   preflight los carga directamente con Node.js, que elimina los tipos de forma nativa. Solo
   importan paquetes npm y usan sintaxis TypeScript borrable (`erasableSyntaxOnly`).
7. **Registros**: **Pino 10.3.1** en JSON por la salida estándar, con redacción de campos
   sensibles y `requestId` como identificador de correlación.
8. **Endurecimiento de Next.js y ausencia de interfaz**:
   - `poweredByHeader: false`;
   - `NEXT_TELEMETRY_DISABLED=1` en todos los scripts y en la integración continua;
   - escucha en `127.0.0.1` en local;
   - un Route Handler comodín, `src/app/[[...path]]/route.ts`, que responde 404 sin cuerpo a toda
     ruta y método distintos de `/api/health`;
   - `images.unoptimized: true` y reescrituras (`rewrites().beforeFiles`) de `/404`, `/500`,
     `/_not-found`, `/_error`, `/_app`, `/_document` y `/_next/:path*` hacia el comodín, porque
     sin ellas `next start` sirve la página 404 HTML del framework. **No se acepta ninguna página
     HTML del framework**;
   - sin middleware (`proxy`) ni autenticación.
9. **Scripts auxiliares**: JavaScript de Node (`.mjs`) sin dependencias propias, en lugar de
   bash, por la portabilidad entre macOS y Linux. La única excepción es el preflight, que usa
   `@next/env` para no duplicar la semántica de carga de Next.js.

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
- **Servidor personalizado de Next.js**: pierde optimizaciones y añade código propio.
- **Validar en `next.config.ts`**: acoplaría la compilación a la configuración de ejecución.
- **Aceptar la 404 HTML por defecto de Next.js**: contradice FR-009.
- **`app/not-found.tsx` o `global-not-found`**: son componentes React que producen HTML.
- **`proxy.ts` (middleware) para responder 404**: añade middleware sin cubrir nada que no cubran
  el comodín y las reescrituras.
- **`skipTrailingSlashRedirect`**: convierte `/api/health/` en una segunda URL válida.
- **Permitir desde ahora que la entrega importe las cuatro capas**: autorización anticipada
  sin necesidad; `/api/health` solo usa `platform`.

## Consecuencias

**Positivas**:

- Una unidad desplegable preparada para añadir la interfaz docente sin crear hoy comportamiento
  de producto.
- Las capas son visibles y sus límites se verifican automáticamente. La entrega no depende de
  ninguna capa de dominio.
- La configuración inválida impide arrancar Next.js en `npm run dev` y en `npm start`, con un
  mensaje claro, sin filtrar valores y sin abrir el puerto.
- Ninguna ruta devuelve una página HTML: toda ruta no definida responde 404 sin cuerpo.
- Se evitan llamadas externas por telemetría y por el optimizador de imágenes, y la exposición
  del framework por `X-Powered-By`.

**Negativas y riesgos aceptados**:

- `react` y `react-dom` son dependencias obligatorias de Next.js aunque no haya interfaz.
- `@next/env` se declara como dependencia directa y debe mantener la misma versión que `next`;
  lo comprueba una prueba de arquitectura y Dependabot los actualiza en el mismo grupo.
- El preflight depende de la eliminación nativa de tipos de Node.js en dos módulos portables. Si
  la carga falla, el preflight termina con error (falla cerrado) y la prueba de humo lo detecta.
- Next.js tiene historial de avisos de seguridad graves; se mitiga con la estrategia del ADR 0002.
- La cabecera `Vary` del App Router revela el framework; no revela versiones ni configuración.
- Las URL no canónicas (barra final o barras repetidas) responden 308 hacia la URL canónica, sin
  HTML.
- En `next dev`, el espacio de herramientas del servidor de desarrollo (`/__nextjs_*`) conserva
  sus propias respuestas. Solo existe en desarrollo, escuchando en `127.0.0.1`, y no forma parte
  del artefacto de `next start`.
- Node 24 pasa a mantenimiento el 2026-10-20, con soporte hasta el 2028-04-30.
- El rango de desarrollo admite versiones de la línea 24 posteriores a 24.21.0 que la
  integración continua no verifica. La referencia reproducible sigue siendo `.node-version`, y
  un fallo con una versión posterior se trata como disparador para actualizarla.

**Revisiones planificadas**:

- Tras el 2026-10-28, evaluar la migración a **Node 26 LTS** en un ADR nuevo.
- Evaluar **TypeScript 7** cuando `typescript-eslint` lo admita.
- En la primera funcionalidad con interfaz, incorporar las reglas de Next.js y React y la
  accesibilidad en el lint (ver ADR 0002), y revisar en un ADR nuevo el comodín 404 y la
  reescritura de `/_next/:path*`, porque la interfaz necesitará recursos en `/_next/static`.
- En la primera porción vertical de producto, definir sus puntos de entrada y ampliar las
  dependencias permitidas de la entrega solo para las capas que justifique.
