# Arquitectura

AulaNorma es un monolito modular: una única aplicación Next.js 16.3.6 con Pages Router, que se
despliega como una sola unidad. Expone la comprobación de estado `/api/health` y, desde los
cimientos del producto, una lista cerrada de rutas con entrada, sesión y permisos, sobre una
base de datos SQLite. No hace llamadas a servicios externos. Las decisiones que describe este
documento están en el
[ADR 0001](../adr/0001-architecture-runtime-and-modular-structure.md) y en el
[ADR 0004](../adr/0004-product-surface-persistence-identity-and-generation.md), que lo
sustituye en parte; los dos están en estado **Aceptado**.

## Estructura

```text
server.mjs                 # Adaptador de arranque: migraciones, frontera HTTP y Next.js
scripts/preflight.mjs      # Validación de la configuración antes de arrancar server.mjs
scripts/admin/users.mjs    # Altas, perfiles, contraseñas iniciales y cierre de sesiones
src/
├── pages/                 # Entrega: lista cerrada de rutas
│   ├── api/health.ts              # Comprobación de estado, sin sesión (excepción cerrada)
│   ├── login.ts                   # Formulario de entrada
│   ├── index.ts                   # Inicio
│   ├── account/password.ts        # Cambio de contraseña
│   └── api/                       # Acciones: session/sign-in, session/sign-out, account/password
├── platform/              # Utilidades transversales; API pública: el índice de cada área
│   ├── config/  logging/  http-boundary/  health/  version/
│   ├── persistence/       # SQLite, migraciones y almacén de ficheros por huella
│   ├── audit/             # Registro de solo inserción
│   ├── identity/          # Cuentas, contraseñas, sesiones, intentos y permisos
│   └── web/               # Guardas de acceso, cookies y documento HTML de las rutas
└── modules/               # Las cuatro capas de la constitución, todavía vacías
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

| Importa →                              | `platform`               | `normative-source` | `structured-interpretation` | `didactic-content` | `content-export` |
| -------------------------------------- | ------------------------ | ------------------ | --------------------------- | ------------------ | ---------------- |
| `platform`                             | —                        | No                 | No                          | No                 | No               |
| `normative-source`                     | Sí                       | —                  | No                          | No                 | No               |
| `structured-interpretation`            | Sí                       | Sí                 | —                           | No                 | No               |
| `didactic-content`                     | Sí                       | No                 | Sí                          | —                  | No               |
| `content-export`                       | Sí                       | No                 | No                          | Sí                 | —                |
| Entrega: `server.mjs` y `src/pages/**` | **Sí, solo API pública** | **No**             | **No**                      | **No**             | **No**           |

Reglas:

- **Solo API pública**: se importa `@/platform/<área>` o `@/modules/<capa>`. Importar rutas
  internas (`@/platform/<área>/<interno>` o `@/modules/<capa>/<interno>`) está prohibido, y una
  importación relativa no puede cruzar a otra capa, otra área o la raíz de `src/`.
- **Capas de dominio**: cada una solo depende de `platform` y de la capa inmediatamente anterior,
  en la dirección que fija el principio II.
- **`platform`** no depende de ninguna capa de dominio.
- **Entrega limitada a `platform`**: la entrega no importa todavía ninguna capa de dominio,
  porque las rutas actuales no las necesitan. El ADR 0004 prevé abrir esta fila a las cuatro
  capas; se hará con la primera historia que lo necesite, con su propia prueba de arquitectura.
- **Rutas de producto solo a través de `web`**: las páginas y las acciones importan
  `@/platform/web`, donde están las guardas de acceso, y no importan directamente `identity`,
  `persistence` ni `audit`.

## Entrega HTTP

La capa de entrega son `server.mjs` y los ficheros de `src/pages`:

- **`src/pages/api/health.ts`** puede importar `@/platform/config`, `@/platform/logging`,
  `@/platform/health` y `@/platform/version`. Importa `config` (`readRuntimeConfig`) y `health`
  (`buildHealthStatus`). No usa `web` ni ninguna guarda: es la excepción cerrada del principio V.
- **Las rutas de producto** (`login.ts`, `index.ts`, `account/password.ts` y las tres acciones
  de `api/`) importan `@/platform/web` y se declaran con una de sus cuatro guardas:
  - `entryPage` y `entryAction`, para el formulario de entrada y su envío, que son lo único
    accesible sin sesión y no conceden acceso a nada más;
  - `protectedPage` y `protectedAction`, que exigen sesión y, si se indica, un perfil,
    comprobados en el servidor con denegación por defecto.

  Las páginas escriben la respuesta completa desde `getServerSideProps`, con una plantilla
  propia que escapa todo valor interpolado. El HTML no carga recursos externos ni scripts del
  framework, lleva una política de contenido por huellas y es idéntico en desarrollo y en
  producción. Las acciones exigen además el origen público configurado y el testigo de su
  sesión, y responden siempre con una redirección.

- **`server.mjs`** es un adaptador mínimo con `// @ts-check`. De `src/` solo importa los módulos
  portables `config`, `logging`, `http-boundary` y `persistence`, por su `index.ts`. Aplica las
  migraciones pendientes antes de cargar Next.js y de escuchar. Como adaptador importa además
  `node:http` y `next`, y usa `@next/env` a través de `src/platform/config`.

## Áreas de `src/platform`

| Área            | Responsabilidad                                                                                                      | Módulo portable |
| --------------- | -------------------------------------------------------------------------------------------------------------------- | --------------- |
| `config`        | Esquema Zod de la configuración y sus tres operaciones: `validateConfig`, `loadConfig` y `readRuntimeConfig`         | Sí              |
| `logging`       | Registros JSON con Pino y redacción de campos sensibles: `createLogger`, `logStartupCompleted` y `logConfigInvalid`  | Sí              |
| `http-boundary` | Decisión de la frontera HTTP y estado transitorio de cada conexión: `createHttpBoundary`                             | Sí              |
| `health`        | Composición del estado público `{ status, version }`: `buildHealthStatus`                                            | No              |
| `version`       | Lectura y validación de la versión SemVer básica de `package.json`: `getVersion`                                     | No              |
| `persistence`   | Base de datos SQLite (`node:sqlite`), migraciones numeradas y almacén de ficheros por huella SHA-256                 | Sí              |
| `audit`         | Registro de auditoría de solo inserción: `createAudit`, con `record` y `list`                                        | Sí              |
| `identity`      | Cuentas, contraseñas con `scrypt`, sesiones, intentos repetidos, comprobación de origen y permisos: `createIdentity` | Sí              |
| `web`           | Servicios del proceso, cookies, documento HTML y guardas de acceso de las rutas de producto                          | No              |

Cada área expone su API pública en su `index.ts`. `platform` no depende de ninguna capa de
dominio.

### Módulos portables

Los índices de `config`, `logging`, `http-boundary`, `persistence`, `audit` e `identity` los
cargan directamente con Node.js `scripts/preflight.mjs`, `server.mjs` o
`scripts/admin/users.mjs`, sin compilarlos. Por eso:

- solo importan paquetes npm o módulos incluidos en Node.js, sin importaciones relativas ni
  alias `@/`; lo que necesitan de otra área lo reciben como argumento;
- `http-boundary` no importa nada en ejecución: de `node:http` y `node:stream` solo toma tipos;
- usan solo sintaxis TypeScript borrable, sin `enum` ni `namespace` (`erasableSyntaxOnly`).

### Quién lee `process.env`

- En `src/`, solo `src/platform/config` lee `process.env`. El resto recibe la configuración
  validada.
- `server.mjs` solo lee `process.env.NODE_ENV`, para pedir el modo a `loadConfig`.
- Las rutas no leen `process.env` ni llaman a `loadConfig`: la de estado usa
  `readRuntimeConfig()` dentro de cada manejo y las de producto, a través de `web`.

## Frontera HTTP

`server.mjs` escucha exclusivamente en `127.0.0.1:3000`, dirección y puerto fijos que no se leen
del entorno. Cada petición pasa por la frontera de `src/platform/http-boundary` **antes** de
Next.js. La frontera evalúa en este orden, y la primera regla incumplida decide la respuesta:

**versión → `Host` → destino → método → cuerpo**

| Paso    | Regla                                                                                                                                                                     | Si se incumple |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Versión | Solo HTTP/1.0 y HTTP/1.1                                                                                                                                                  | 505            |
| `Host`  | En HTTP/1.1, exactamente uno, no vacío, sin comas ni caracteres de control; en HTTP/1.0, opcional con las mismas reglas                                                   | 400            |
| Destino | El destino crudo es exactamente uno de la lista cerrada `ROUTES`, byte a byte, sin normalizar ni decodificar                                                              | 404            |
| Método  | Uno de los métodos de esa ruta                                                                                                                                            | 405            |
| Cuerpo  | Sin `Transfer-Encoding`. Si la ruta no admite cuerpo, `Content-Length` ausente o igual a 0; si lo admite, exactamente un `Content-Length` decimal que no supere su máximo | 400            |

Las entradas malformadas que el analizador HTTP de Node.js rechaza antes de la frontera reciben
el mismo 400 cerrado. `CONNECT` y las peticiones con `Upgrade` se rechazan de forma cerrada: 404
si el destino no está en la lista y 405 si lo está.

La lista cerrada es:

| Destino                 | Métodos                  | Cuerpo máximo | Acceso                                          |
| ----------------------- | ------------------------ | ------------- | ----------------------------------------------- |
| `/api/health`           | `GET`, `HEAD`, `OPTIONS` | 0             | Sin sesión (excepción cerrada)                  |
| `/login`                | `GET`                    | 0             | Sin sesión; no concede nada más                 |
| `/api/session/sign-in`  | `POST`                   | 4096 bytes    | Sin sesión; exige la sesión previa y su testigo |
| `/`                     | `GET`                    | 0             | Sesión                                          |
| `/account/password`     | `GET`                    | 0             | Sesión                                          |
| `/api/session/sign-out` | `POST`                   | 4096 bytes    | Sesión y su testigo                             |
| `/api/account/password` | `POST`                   | 4096 bytes    | Sesión y su testigo                             |

La frontera no comprueba la sesión ni los permisos: decide solo sobre la forma de la petición.
El acceso lo comprueba cada ruta de producto con su guarda. Lo delegado llega a Next.js con una
única llamada a `handle(req, res)`. La API Route de estado responde:

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
la frontera HTTP y el tercero, el preflight. La frontera y la comprobación de estado no registran
nada. Las rutas de producto registran una lista cerrada de eventos, cada uno solo con su nombre y
el identificador de correlación de la petición, y auditan en la base de datos las entradas, las
salidas, los cambios de cuenta y las denegaciones.

## Cómo se imponen los límites

| Mecanismo                                                                            | Qué impone                                                                                                                                                                                           | Control                                                   |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| ESLint (`eslint.config.mjs`), regla `no-restricted-imports`                          | Matriz de dependencias, solo API pública, importaciones relativas que cruzan límites, módulos portables sin alias ni relativas, lectura de `process.env` y límites de `server.mjs`                   | `npm run check:lint` (controles `lint` y `macos-quality`) |
| ESLint: `no-restricted-properties`, `no-restricted-globals` y `no-restricted-syntax` | `process.env` fuera de `src/platform/config`, `fetch` y otros accesos de red en `src/`, y en `server.mjs` cualquier lectura del entorno distinta de `NODE_ENV`                                       | `npm run check:lint`                                      |
| `tests/architecture/import-boundaries.test.ts`                                       | Cada dependencia prohibida de la matriz da error y cada dependencia permitida no                                                                                                                     | `npm run check:test` (controles `test` y `macos-quality`) |
| `tests/architecture/public-routes.test.ts`                                           | Lista cerrada de rutas: `src/pages`, `ROUTES` de la frontera y la lista de la prueba coinciden; cada ruta de producto se declara con su guarda; solo la entrada y su envío son accesibles sin sesión | `npm run check:test`                                      |
| `tests/contract/session.contract.test.ts` y `audit-immutability.contract.test.ts`    | Entrada, sesión, CSRF, permisos en el servidor, caducidad y revocación; y que ninguna operación del producto modifica ni borra un evento de auditoría                                                | `npm run check:test`                                      |
| `tests/architecture/entry-points.test.ts`                                            | Solo `npm run dev` y `npm start` como entradas; sin `rewrites`, `headers`, `redirects`, middleware, `proxy` ni `instrumentation.ts`                                                                  | `npm run check:test`                                      |
| `tests/architecture/no-domain-specifics.test.ts`                                     | Ningún código de certificado en `src/`, `tests/`, `scripts/` ni en los ficheros operativos de la raíz (FR-024)                                                                                       | `npm run check:test`                                      |
| `tests/setup/no-network.ts`                                                          | Las pruebas no pueden abrir conexiones externas                                                                                                                                                      | `npm run check:test`                                      |

La lista completa de controles y sus comandos está en
[`quality-controls.md`](quality-controls.md).
