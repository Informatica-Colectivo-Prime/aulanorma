# Arquitectura

AulaNorma es un monolito modular: una única aplicación Next.js 16.3.6 con Pages Router, que se
despliega como una sola unidad. En esta funcionalidad no tiene interfaz visible, persistencia ni
llamadas a servicios externos, y solo expone la comprobación de estado `/api/health`. Las
decisiones que describe este documento están en el
[ADR 0001](../adr/0001-architecture-runtime-and-modular-structure.md), en estado **Aceptado**.

## Estructura

```text
server.mjs                 # Adaptador de arranque: frontera HTTP y una única llamada a Next.js
scripts/preflight.mjs      # Validación de la configuración antes de arrancar server.mjs
src/
├── pages/api/health.ts    # Única API Route: la comprobación de estado
├── platform/              # Utilidades transversales; API pública: el index.ts de cada área
│   ├── config/
│   ├── logging/
│   ├── http-boundary/
│   ├── health/
│   └── version/
└── modules/               # Las cuatro capas de la constitución, vacías en esta funcionalidad
    ├── normative-source/
    ├── structured-interpretation/
    ├── didactic-content/
    └── content-export/
```

No existen `src/app`, `middleware.ts`, `proxy.ts` ni `instrumentation.ts`.

## Las cuatro capas

La constitución (principio II) separa cuatro capas, cada una con su modelo y un contrato
explícito con la anterior. Cada capa tiene un directorio en `src/modules/`, con un `index.ts`
público y un `README.md` que describe su responsabilidad.

| Capa                        | Ubicación                               | Responsabilidad                                     |
| --------------------------- | --------------------------------------- | --------------------------------------------------- |
| Fuente normativa            | `src/modules/normative-source`          | PDF original inmutable y texto extraído por página  |
| Interpretación estructurada | `src/modules/structured-interpretation` | Representación validada del certificado             |
| Contenido didáctico         | `src/modules/didactic-content`          | Materiales, actividades y evaluaciones generados    |
| Exportación                 | `src/modules/content-export`            | Paquete descargable a partir del contenido aprobado |

Además, según la constitución:

- la fuente normativa no se modifica: las correcciones de interpretación se registran como
  anotaciones trazables en la capa de interpretación estructurada;
- la exportación no genera ni altera contenido didáctico: solo transforma contenido aprobado al
  formato de exportación, que es SCORM 1.2.

Hasta la versión 1.1.0 de la constitución, la cuarta capa era la publicación automática en
Moodle. El
[ADR 0003](../adr/0003-scorm-export-instead-of-automatic-moodle-publication.md) la sustituye por
la exportación de un paquete que el usuario incorpora manualmente a Moodle. Con ese cambio, el
módulo pasó de llamarse `moodle-publication` a `src/modules/content-export`.

**Estado actual**: las cuatro capas están vacías. Cada `index.ts` solo contiene `export {};`, y
no hay lógica de producto ni nada específico de ningún certificado (FR-024).

## Matriz de dependencias

Cada celda indica si el módulo de la fila puede importar al de la columna, siempre a través de
su API pública (`index.ts`). Es la matriz de
[`data-model.md`](../../specs/001-engineering-baseline/data-model.md#matriz-de-dependencias-entre-capas).

| Importa →                                         | `platform`               | `normative-source` | `structured-interpretation` | `didactic-content` | `content-export` |
| ------------------------------------------------- | ------------------------ | ------------------ | --------------------------- | ------------------ | ---------------- |
| `platform`                                        | —                        | No                 | No                          | No                 | No               |
| `normative-source`                                | Sí                       | —                  | No                          | No                 | No               |
| `structured-interpretation`                       | Sí                       | Sí                 | —                           | No                 | No               |
| `didactic-content`                                | Sí                       | No                 | Sí                          | —                  | No               |
| `content-export`                                  | Sí                       | No                 | No                          | Sí                 | —                |
| Entrega: `server.mjs` y `src/pages/api/health.ts` | **Sí, solo API pública** | **No**             | **No**                      | **No**             | **No**           |

Reglas:

- **Solo API pública**: se importa `@/platform/<área>` o `@/modules/<capa>`. Importar rutas
  internas (`@/platform/<área>/<interno>` o `@/modules/<capa>/<interno>`) está prohibido, y una
  importación relativa no puede cruzar a otra capa, otra área o la raíz de `src/`.
- **Capas de dominio**: cada una solo depende de `platform` y de la capa inmediatamente anterior,
  en la dirección que fija el principio II.
- **`platform`** no depende de ninguna capa de dominio.
- **Entrega limitada a `platform`**: la entrega no importa ninguna capa de dominio, porque
  `/api/health` no las necesita. La primera porción vertical de producto definirá sus puntos de
  entrada y ampliará esta fila solo para las capas que justifique, con su propia prueba de
  arquitectura.

## Entrega HTTP

La capa de entrega son `server.mjs` y `src/pages/api/health.ts`:

- **`src/pages/api/health.ts`** puede importar `@/platform/config`, `@/platform/logging`,
  `@/platform/health` y `@/platform/version`. Hoy importa `config` (`readRuntimeConfig`) y
  `health` (`buildHealthStatus`).
- **`server.mjs`** es un adaptador mínimo con `// @ts-check`. De `src/` solo importa los módulos
  portables `config`, `logging` y `http-boundary`, por su `index.ts`. Como adaptador importa
  además `node:http` y `next`, y usa `@next/env` a través de `src/platform/config`. Esas
  importaciones no son de capas de dominio y no contradicen la matriz.

## Áreas de `src/platform`

| Área            | Responsabilidad                                                                                                     | Módulo portable |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- |
| `config`        | Esquema Zod de la configuración y sus tres operaciones: `validateConfig`, `loadConfig` y `readRuntimeConfig`        | Sí              |
| `logging`       | Registros JSON con Pino y redacción de campos sensibles: `createLogger`, `logStartupCompleted` y `logConfigInvalid` | Sí              |
| `http-boundary` | Decisión de la frontera HTTP y estado transitorio de cada conexión: `createHttpBoundary`                            | Sí              |
| `health`        | Composición del estado público `{ status, version }`: `buildHealthStatus`                                           | No              |
| `version`       | Lectura y validación de la versión SemVer básica de `package.json`: `getVersion`                                    | No              |

Cada área expone su API pública en su `index.ts`. `platform` no depende de ninguna capa de
dominio.

### Módulos portables

`src/platform/config/index.ts`, `src/platform/logging/index.ts` y
`src/platform/http-boundary/index.ts` los cargan directamente con Node.js `scripts/preflight.mjs`
y `server.mjs`, sin compilarlos. Por eso:

- solo importan paquetes npm, sin importaciones relativas ni alias `@/`;
- `http-boundary` no importa nada en ejecución: de `node:http` y `node:stream` solo toma tipos;
- usan solo sintaxis TypeScript borrable, sin `enum` ni `namespace` (`erasableSyntaxOnly`).

### Quién lee `process.env`

- En `src/`, solo `src/platform/config` lee `process.env`. El resto recibe la configuración
  validada.
- `server.mjs` solo lee `process.env.NODE_ENV`, para pedir el modo a `loadConfig`.
- La API Route no lee `process.env` ni llama a `loadConfig`: usa `readRuntimeConfig()` dentro de
  cada manejo.

## Frontera HTTP

`server.mjs` escucha exclusivamente en `127.0.0.1:3000`, dirección y puerto fijos que no se leen
del entorno. Cada petición pasa por la frontera de `src/platform/http-boundary` **antes** de
Next.js. La frontera evalúa en este orden, y la primera regla incumplida decide la respuesta:

**versión → `Host` → destino → método → cuerpo**

| Paso    | Regla                                                                                                                   | Si se incumple |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- |
| Versión | Solo HTTP/1.0 y HTTP/1.1                                                                                                | 505            |
| `Host`  | En HTTP/1.1, exactamente uno, no vacío, sin comas ni caracteres de control; en HTTP/1.0, opcional con las mismas reglas | 400            |
| Destino | El destino crudo es exactamente `/api/health`, byte a byte, sin normalizar ni decodificar                               | 404            |
| Método  | `GET`, `HEAD` u `OPTIONS`                                                                                               | 405            |
| Cuerpo  | Sin `Transfer-Encoding` y con `Content-Length` ausente o igual a 0                                                      | 400            |

Las entradas malformadas que el analizador HTTP de Node.js rechaza antes de la frontera reciben
el mismo 400 cerrado. `CONNECT` y las peticiones con `Upgrade` se rechazan de forma cerrada: 404
si el destino no es `/api/health` y 405 si lo es.

Solo `GET`, `HEAD` y `OPTIONS` sobre el destino exacto se delegan en Next.js, con una única
llamada a `handle(req, res)`. La API Route responde:

- `GET` y `HEAD`: 200 con `Content-Type: application/json`, `Cache-Control: no-store` y el cuerpo
  exacto `{ "status": "ok", "version": "<X.Y.Z>" }` (sin cuerpo en `HEAD`);
- `OPTIONS`: 204 sin cuerpo, con `Allow: GET, HEAD, OPTIONS` y `Cache-Control: no-store`, como
  respuesta técnica de transporte;
- cualquier otro método: 405 defensivo.

### Contrato cerrado de rechazo

Toda respuesta 400, 404, 405, 500 o 505:

- tiene cuerpo vacío, `Cache-Control: no-store`, `Content-Length: 0` y `Connection: close`;
- cierra la conexión después;
- solo lleva `Allow: GET, HEAD, OPTIONS` si es un 405.

El servicio no redirige, no sirve ninguna página HTML y no revela el framework: la única `Vary`
admitida es `Vary: Accept-Encoding`, en las respuestas 200.

El **500 cerrado** cubre exactamente estos casos, y nunca responde "ok":

- un fallo dentro del manejador de la API Route antes de iniciar la respuesta, incluida una
  configuración que ya no es válida;
- un rechazo de `handle` antes de enviar cabeceras, al que responde `server.mjs`.

Si una respuesta ya empezó, no se escribe un segundo estado: la conexión se destruye. Los errores
internos de Next.js anteriores a la entrada en el manejador, como un fallo al cargar su módulo,
no se convierten en ese 500.

### Estado de conexión

La frontera mantiene por conexión un estado transitorio, solo en memoria, que no se persiste ni
se registra:

- después de un rechazo no se delega ni se responde ninguna otra petición de esa conexión;
- un error de análisis nunca genera una segunda respuesta; si hay respuestas legítimas
  pendientes, se difiere y se emite como 400 cerrado cuando terminan, o se descarta si la
  conexión se cierra antes;
- las peticiones con `Expect` pasan por la misma frontera, sin `100 Continue` ni `417`
  automáticos.

## Puntos de entrada

`npm run dev` y `npm start` son los **únicos puntos de entrada admitidos**. Los dos ejecutan
`NODE_ENV=<entorno> node scripts/preflight.mjs <modo> && NODE_ENV=<entorno> node server.mjs`:

1. el preflight valida la configuración con `loadConfig` y, si no es válida, termina con código 1
   antes de que `server.mjs` arranque, así que el puerto nunca se abre;
2. `server.mjs` vuelve a validarla antes de escuchar y registra `startup.completed` una sola vez,
   después de empezar a escuchar.

`npm run dev` usa Webpack: `server.mjs` pasa `webpack: true` a `next()` solo en desarrollo, y el
script fija vacías `TURBOPACK`, `IS_TURBOPACK_TEST` y `NEXT_RSPACK` en el preflight y en el
servidor, para que ni el entorno heredado ni los ficheros `.env*` elijan otro compilador. Son
selectores de Next.js, no claves del esquema de configuración, y `server.mjs` sigue leyendo solo
`NODE_ENV`. `npm start` y `next build` no cambian: la compilación conserva su compilador por
defecto, distinto del de desarrollo, y la prueba de humo comprueba el mismo contrato en los dos
modos.

`next dev`, `next start` y `node server.mjs` directos no están admitidos: los dos primeros eluden
la frontera HTTP y el tercero, el preflight. Ningún registro se emite por petición, rechazo o
respuesta, en ninguno de los dos modos.

## Cómo se imponen los límites

| Mecanismo                                                                            | Qué impone                                                                                                                                                                         | Control                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ESLint (`eslint.config.mjs`), regla `no-restricted-imports`                          | Matriz de dependencias, solo API pública, importaciones relativas que cruzan límites, módulos portables sin alias ni relativas, lectura de `process.env` y límites de `server.mjs` | `npm run check:lint` (controles `lint` y `macos-quality`) |
| ESLint: `no-restricted-properties`, `no-restricted-globals` y `no-restricted-syntax` | `process.env` fuera de `src/platform/config`, `fetch` y otros accesos de red en `src/`, y en `server.mjs` cualquier lectura del entorno distinta de `NODE_ENV`                     | `npm run check:lint`                                      |
| `tests/architecture/import-boundaries.test.ts`                                       | Cada dependencia prohibida de la matriz da error y cada dependencia permitida no                                                                                                   | `npm run check:test` (controles `test` y `macos-quality`) |
| `tests/architecture/public-routes.test.ts`                                           | Una única ruta pública: ningún otro fichero en `src/pages` ni en `src/app`, ni otro destino o método en la frontera                                                                | `npm run check:test`                                      |
| `tests/architecture/entry-points.test.ts`                                            | Solo `npm run dev` y `npm start` como entradas; sin `rewrites`, `headers`, `redirects`, middleware, `proxy` ni `instrumentation.ts`                                                | `npm run check:test`                                      |
| `tests/architecture/no-domain-specifics.test.ts`                                     | Ningún código de certificado en `src/`, `tests/`, `scripts/` ni en los ficheros operativos de la raíz (FR-024)                                                                     | `npm run check:test`                                      |
| `tests/setup/no-network.ts`                                                          | Las pruebas no pueden abrir conexiones externas                                                                                                                                    | `npm run check:test`                                      |

La lista completa de controles y sus comandos está en
[`quality-controls.md`](quality-controls.md).
