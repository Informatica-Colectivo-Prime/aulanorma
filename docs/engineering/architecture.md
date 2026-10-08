# Arquitectura

AulaNorma es un monolito modular: una única aplicación Next.js 16.3.6 con Pages Router, que se
despliega como una sola unidad. Expone la comprobación de estado `/api/health` y, desde los
cimientos del producto, una lista cerrada de rutas con entrada, sesión y permisos, sobre una
base de datos SQLite. Su primera historia registra el PDF oficial y permite revisar y validar
su interpretación. No hace llamadas a servicios externos. Las decisiones que describe este
documento están en el
[ADR 0001](../adr/0001-architecture-runtime-and-modular-structure.md) y en el
[ADR 0004](../adr/0004-product-surface-persistence-identity-and-generation.md), que lo
sustituye en parte; los dos están en estado **Aceptado**.

## Estructura

```text
server.mjs                 # Adaptador de arranque: migraciones, frontera HTTP y Next.js
scripts/preflight.mjs      # Validación de la configuración antes de arrancar server.mjs
scripts/admin/users.mjs    # Altas, perfiles, contraseñas iniciales y cierre de sesiones
scripts/ops/backup.mjs     # Copia de seguridad en línea, verificada
scripts/ops/verify-restore.mjs  # Restauración comprobada en un directorio limpio
src/
├── pages/                 # Entrega: lista cerrada de rutas
│   ├── api/health.ts              # Comprobación de estado, sin sesión (excepción cerrada)
│   ├── login.ts                   # Formulario de entrada
│   ├── index.ts                   # Inicio
│   ├── account/password.ts        # Cambio de contraseña
│   ├── documents/                 # Documentos: lista, subida, registro, página y PDF original
│   ├── interpretations/           # Interpretación: inventario y formularios de corrección
│   ├── outlines/  syllabus/  topics/  # Índice, temario y temas
│   ├── export/                    # Exportación, vista previa y descargas
│   ├── budget/                    # Presupuesto de generación
│   ├── history/                   # Historial de cada elemento, de solo lectura
│   ├── metrics/                   # Métricas mínimas, para administración
│   └── api/                       # Acciones: una por operación que cambia estado
├── views/                 # Vistas HTML que comparten páginas y acciones
├── platform/              # Utilidades transversales; API pública: el índice de cada área
│   ├── config/  logging/  http-boundary/  health/  version/
│   ├── persistence/       # SQLite, migraciones y almacén de ficheros por huella
│   ├── audit/             # Registro de solo inserción
│   ├── identity/          # Cuentas, contraseñas, sesiones, intentos y permisos
│   ├── generation/        # Interfaz de generación, adaptador determinista y registro de uso
│   └── web/               # Guardas de acceso, cookies y documento HTML de las rutas
└── modules/               # Las cuatro capas de la constitución
    ├── normative-source/          # Documentos, páginas y tratamiento del PDF (pdf/)
    ├── structured-interpretation/ # Inventario, correcciones, validación y rechazo
    ├── didactic-content/          # Índice, cobertura, temario y aprobaciones
    └── content-export/            # Paquete SCORM 1.2, comprobación y descargas
prompts/                   # Prompts versionados de la generación
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

**Estado actual**: `normative-source` y `structured-interpretation` están implementadas;
`didactic-content` contiene el índice del temario, su cobertura y su aprobación, y el temario,
con sus temas, sus aprobaciones y sus versiones; `content-export` genera el paquete SCORM 1.2 de una versión aprobada, lo comprueba al releerlo y registra exportaciones y descargas. Nada es
específico de ningún certificado (FR-024): el código de la unidad es un dato.

### Índice, cobertura y aprobación

`src/modules/didactic-content` guarda el índice de una interpretación y las entradas en las
que se organiza. Cada entrada se apoya en uno o varios requisitos del inventario, por vínculos
explícitos, o queda marcada «sin respaldo normativo».

- **La cobertura se calcula, nunca se almacena ni se declara** (`coverage.ts`): un requisito
  está cubierto solo si una entrada vigente lo vincula directamente. No hay herencia entre un
  elemento y los que dependen de él, en ningún sentido, y lo que afirme una propuesta sobre la
  cobertura se ignora.
- **Aprobar exige cobertura completa** y una interpretación validada y vigente. No existe
  ningún parámetro, perfil ni ruta que lo evite.
- **La vigencia de una aprobación se deriva**: vale mientras su revisión del índice es la
  actual y la validación de la interpretación en la que se apoyó sigue vigente. Cualquier
  cambio del índice, o de su interpretación, la deja sin vigencia sin borrar nada.
- **Nada se borra**: una entrada quitada queda marcada, y cada cambio, aprobación y rechazo
  queda en tablas de solo inserción.

### Temario, aprobaciones y versiones

Cada entrada del índice tiene un tema, formado por bloques de dos tipos que no se mezclan: de
**requisito**, que citan la norma y se muestran con su texto, su página y su cita; y de
**desarrollo**, con texto plano estructurado y los requisitos que desarrollan.

- **El contenido no es HTML**: es una lista de encabezados, párrafos y listas validada por
  esquema. El HTML lo produce un único renderizador (`render/`), que escapa todo el texto y
  etiqueta cada bloque como norma o como desarrollo. Es el mismo que usará el paquete.
- **Generación tema a tema**, solo con el índice aprobado y vigente, y con una reserva de
  presupuesto por tema. Un tema cuya operación falla, o cuya propuesta no supera el esquema o
  las comprobaciones, queda fallido y su resultado no se guarda. No hay reintentos
  automáticos; una operación incierta no se reenvía hasta conciliarla.
- **Desarrollo de cada requisito**: exige su cita y, además, un bloque de desarrollo
  vinculado. La cita sola no basta, y no hay herencia.
- **Vigencia derivada en cadena**: la aprobación de un tema guarda su revisión y la
  aprobación del índice en la que se apoyó; la versión, las aprobaciones de sus temas. Editar
  un tema invalida la suya y la de la versión; editar el índice o corregir la interpretación,
  todas. La versión guarda una instantánea inmutable con su huella.
- **Referencias heredadas**: tras un documento sustituto, el índice y los temas se conservan
  sin poder editarse, y solo se aprueban de nuevo tras comprobar cada referencia, una a una.

### Presupuesto de generación

`src/platform/markup` es el único sitio que convierte texto en HTML: su plantilla escapa cada
valor interpolado y no existe ninguna función que acepte una cadena como HTML ya escapado. La
usan la entrega web y el renderizador de contenido de `didactic-content`, de modo que la
revisión, la vista previa y el paquete exportado comparten la misma garantía.

`src/platform/generation` no envía ninguna operación sin una reserva de su coste máximo, hecha
en una transacción que comprueba el máximo por operación (configuración) y el límite acumulado
del proyecto. El envío se anota antes de llamar al proveedor; con el consumo confirmado la
reserva se liquida; sin él (sin datos de consumo, tiempo agotado, fallo o caída del proceso)
queda incierta y sigue contando hasta que un administrador la concilia. Solo se libera lo que
consta que no se envió, y los disparadores de la base de datos imponen esas transiciones.

El único adaptador es el determinista, que no cuesta nada: sus importes no son precios de
ningún proveedor, y la moneda del presupuesto no está fijada (`XXX`).

### Tratamiento de un PDF

`src/modules/normative-source/pdf/` separa tres pasos, y superar uno no acredita los otros:

1. **Validación del fichero**: tamaño máximo configurado y firma `%PDF-`.
2. **Inspección estructural**: qpdf, instalado como herramienta verificada, entrega la
   estructura interpretada y la política propia (`policy.ts`) decide sobre ella. Rechaza
   JavaScript, XFA, acciones automáticas, lanzamientos y ficheros incrustados, y solo admite
   un formulario si todos sus campos son de firma y sin acciones. qpdf no es un antivirus.
3. **Extracción**: `pdfjs-dist` obtiene el texto de cada página.

Los tres se ejecutan en procesos hijos con el entorno vacío, límite de tiempo y de salida, y
la salida validada por esquema. Los de Node.js llevan además límite de montón y el modelo de
permisos. Cualquier error, aviso o resultado no comprobable acaba en rechazo, y el fichero
nunca se modifica. Es contención, no un aislamiento de seguridad. La revisión de lo extraído
es siempre humana.

### Límites de tiempo de la sesión

Una sesión caduca por inactividad y, aparte, termina al alcanzar su duración máxima. Las dos
cosas las decide el servidor; el script del documento no hace ninguna consulta por su cuenta.

- **Inactividad**: antes de caducar, cada página avisa y ofrece ampliar la sesión con
  `POST /api/session/extend`. Cuenta como actividad una petición con sesión vigente que no se
  rechaza por su origen ni por su testigo.
- **Duración máxima**: al acercarse, la página pide la contraseña y renueva la autenticación
  con `POST /api/session/renew`. La identidad crea una sesión nueva y revoca la anterior en
  la misma transacción; no prolonga ninguna. El testigo nuevo llega a los formularios de la
  página sin recargarla, y las demás pestañas leen el suyo de una página propia.
- **Peticiones con la sesión o el testigo anteriores**: no se ejecutan ni borran la cookie
  nueva; las guardas devuelven lo enviado para repetirlo.

El detalle, las pruebas, lo que depende de JavaScript y lo que queda sin resolver están en
[`session-limits.md`](../../specs/002-boe-scorm-export/session-limits.md).

### Historial y métricas

Las páginas de `src/pages/history/` reúnen, por orden de fecha, lo que cada capa ya tiene
registrado de un elemento: correcciones, validaciones, aprobaciones, rechazos con su motivo,
generaciones con su proveedor, modelo y versión de las instrucciones, exportaciones y
descargas. Son de solo lectura, para docente y administración, y no añaden ningún registro:
cada dato sale de la API pública de su capa. Los inicios de sesión y los intentos denegados
quedan en la auditoría, que no se consulta desde ahí.

`src/pages/metrics/` muestra a administración las métricas mínimas del principio XI:
errores, latencia, coste de generación y estado de las exportaciones. Son recuentos de lo ya
registrado, calculados al abrir la página. Solo se mide la latencia de las llamadas de
generación; la de las peticiones web no se registra. No hay series temporales ni alertas.

## Matriz de dependencias

Cada celda indica si el módulo de la fila puede importar al de la columna, siempre a través de
su API pública (`index.ts`). Es la matriz de
[`data-model.md`](../../specs/001-engineering-baseline/data-model.md#matriz-de-dependencias-entre-capas).

| Importa →                                | `platform`               | `normative-source` | `structured-interpretation` | `didactic-content` | `content-export` |
| ---------------------------------------- | ------------------------ | ------------------ | --------------------------- | ------------------ | ---------------- |
| `platform`                               | —                        | No                 | No                          | No                 | No               |
| `normative-source`                       | Sí                       | —                  | No                          | No                 | No               |
| `structured-interpretation`              | Sí                       | Sí                 | —                           | No                 | No               |
| `didactic-content`                       | Sí                       | No                 | Sí                          | —                  | No               |
| `content-export`                         | Sí                       | No                 | No                          | Sí                 | —                |
| Entrega: rutas de producto y `src/views` | **Sí, solo API pública** | **Sí**             | **Sí**                      | **Sí**             | **Sí**           |
| Entrega: `server.mjs` y `/api/health`    | **Sí, solo API pública** | **No**             | **No**                      | **No**             | **No**           |

Reglas:

- **Solo API pública**: se importa `@/platform/<área>` o `@/modules/<capa>`. Importar rutas
  internas (`@/platform/<área>/<interno>` o `@/modules/<capa>/<interno>`) está prohibido, y una
  importación relativa no puede cruzar a otra capa, otra área o la raíz de `src/`.
- **Capas de dominio**: cada una solo depende de `platform` y de la capa inmediatamente anterior,
  en la dirección que fija el principio II.
- **`platform`** no depende de ninguna capa de dominio.
- **Entrega abierta capa a capa**: las rutas de producto importan `normative-source`,
  `structured-interpretation`, desde la historia del índice `didactic-content` y, desde la de
  exportación, `content-export`, por su API pública.
  `server.mjs` y la comprobación de estado no importan ninguna.
- **Vistas**: `src/views` reúne el HTML que comparten una página y la acción que, ante un
  conflicto o un bloqueo, responde con ese mismo formulario. Solo importa `@/platform/web` y
  esas tres capas; no alcanza la persistencia, la identidad, la auditoría ni la generación.
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
| `generation`    | Interfaz propia con cualquier proveedor de IA, adaptador determinista y registro de cada llamada: `createGeneration` | No              |
| `web`           | Servicios del proceso, cookies, documento HTML y guardas de acceso de las rutas de producto                          | No              |

Cada área expone su API pública en su `index.ts`. `platform` no depende de ninguna capa de
dominio.

### Módulos portables

Los índices de `config`, `logging`, `http-boundary`, `persistence`, `audit` e `identity` los
cargan directamente con Node.js `scripts/preflight.mjs`, `server.mjs`,
`scripts/admin/users.mjs` o los scripts de `scripts/ops/`, sin compilarlos. También
`src/platform/generation/recovery.ts`, que contiene solo la regla de recuperación de las
reservas y que usan el presupuesto y la comprobación de una restauración. Por eso:

- solo importan paquetes npm o módulos incluidos en Node.js, sin importaciones relativas ni
  alias `@/`; lo que necesitan de otra área lo reciben como argumento;
- `http-boundary` no importa nada en ejecución: de `node:http` y `node:stream` solo toma tipos;
- usan solo sintaxis TypeScript borrable, sin `enum` ni `namespace` (`erasableSyntaxOnly`).

La ausencia de importaciones relativas es una **regla del proyecto**, no un límite de Node.js.
Node.js no resuelve el alias `@/` ni los especificadores sin extensión, que son la forma
habitual de importar en el resto de `src/`; sí resuelve una importación relativa con su
extensión (`./parte.ts`), y `tsconfig.json` la admite. La base de ingeniería eligió la regla más
simple de comprobar: cada módulo portable es un único `index.ts` autocontenido, y ESLint y la
prueba de arquitectura rechazan en él cualquier importación relativa o con alias. Por eso
`identity`, el mayor de ellos, es un solo fichero. Dividirlo exigiría cambiar antes esa regla y
sus dos controles para admitir solo importaciones relativas con extensión dentro de la misma
área; no se ha hecho porque nada lo necesita todavía.

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
| Destino | El destino crudo es exactamente uno de la lista cerrada `ROUTES`, byte a byte, sin normalizar ni decodificar, salvo sus segmentos variables de forma cerrada              | 404            |
| Método  | Uno de los métodos de esa ruta                                                                                                                                            | 405            |
| Cuerpo  | Sin `Transfer-Encoding`. Si la ruta no admite cuerpo, `Content-Length` ausente o igual a 0; si lo admite, exactamente un `Content-Length` decimal que no supere su máximo | 400            |

Las entradas malformadas que el analizador HTTP de Node.js rechaza antes de la frontera reciben
el mismo 400 cerrado. `CONNECT` y las peticiones con `Upgrade` se rechazan de forma cerrada: 404
si el destino no está en la lista y 405 si lo está.

La lista cerrada es:

| Destino                                                                                   | Métodos                  | Cuerpo máximo | Acceso                                          |
| ----------------------------------------------------------------------------------------- | ------------------------ | ------------- | ----------------------------------------------- |
| `/api/health`                                                                             | `GET`, `HEAD`, `OPTIONS` | 0             | Sin sesión (excepción cerrada)                  |
| `/login`                                                                                  | `GET`                    | 0             | Sin sesión; no concede nada más                 |
| `/api/session/sign-in`                                                                    | `POST`                   | 4096 bytes    | Sin sesión; exige la sesión previa y su testigo |
| `/`                                                                                       | `GET`                    | 0             | Sesión                                          |
| `/account/password`                                                                       | `GET`                    | 0             | Sesión                                          |
| `/api/session/sign-out`                                                                   | `POST`                   | 4096 bytes    | Sesión y su testigo                             |
| `/api/account/password`                                                                   | `POST`                   | 4096 bytes    | Sesión y su testigo                             |
| `/documents`, `/documents/new`                                                            | `GET`                    | 0             | Sesión y perfil de docente                      |
| `/documents/:id`, `/documents/:id/file`, `/documents/:id/pages/:n`                        | `GET`                    | 0             | Sesión y perfil de docente                      |
| `/interpretations/:id`, `…/unit`, `…/requirements/new`, `…/requirements/:id`              | `GET`                    | 0             | Sesión y perfil de docente                      |
| `/api/documents/upload`                                                                   | `POST`                   | 64 MiB        | Sesión, su testigo y perfil de docente          |
| `/api/documents/resolve-page`, `/api/interpretations/request`, `…/validate`, `…/resubmit` | `POST`                   | 4096 bytes    | Sesión, su testigo y perfil de docente          |
| `/api/interpretations/correct`, `/api/interpretations/reject`                             | `POST`                   | 65 536 bytes  | Sesión, su testigo y perfil de docente          |

Un segmento variable solo tiene dos formas: `:id`, 32 cifras hexadecimales en minúscula, y
`:n`, un número de página de 1 a 99999 sin ceros iniciales. No hay comodines ni parámetros de
consulta: cualquier otra forma recibe el 404 cerrado. Sobre el máximo de 64 MiB de la subida,
la ruta aplica el tamaño máximo configurado.

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
