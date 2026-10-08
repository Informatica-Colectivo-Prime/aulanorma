# Contrato: superficie HTTP y autorización

**Plan**: [../plan.md](../plan.md) | **Research**: [../research.md](../research.md) (R2, R3, R5)

Lista cerrada de operaciones del piloto. La frontera HTTP rechaza cualquier otro destino con
el 404 cerrado que ya existe. Los nombres de ruta son orientativos; lo vinculante es la
operación, quién puede ejecutarla y sus condiciones.

## Reglas comunes

- **Sesión**: toda operación la exige, salvo `/api/health` (excepción del principio V, sin
  cambios) y el formulario de entrada con su envío (inicio de sesión del principio V), que no
  conceden acceso a nada más.
- **Perfiles**: `admin` y `teacher`. Una cuenta sin perfiles solo puede iniciar y cerrar
  sesión. No hay perfil de solo lectura.
- **Autorización**: se comprueba en el servidor en cada operación, con denegación por defecto.
  Una denegación responde 403, no revela si el recurso existe y se audita.
- **Mutaciones**: solo `POST`, con comprobación de origen contra el origen público
  configurado y testigo de sesión. El envío del formulario de entrada lo exige también, con
  el testigo de su sesión previa.
- **Sesiones**: cookie `HttpOnly`, `SameSite=Strict` y `Path=/`, sin `Domain`, con el prefijo
  `__Host-` y `Secure`. La única excepción es el modo desarrollo (`npm run dev`) con el origen
  local por HTTP, donde se emite sin el prefijo ni `Secure`: fuera de ese modo la
  configuración rechaza cualquier origen que no sea HTTPS y el servidor no arranca. Nombre y
  atributos dependen solo del origen público configurado; ninguna cabecera de la petición
  (`Host`, `Forwarded`, `X-Forwarded-*`) los cambia, ni cambia el origen exigido a un envío.
  El identificador de sesión viaja solo en `Set-Cookie` y el testigo, solo en los formularios
  de su propia sesión; ninguno aparece en registros, auditoría, errores ni en otras
  respuestas. Caducidad por
  inactividad (30 minutos) y por duración máxima (12 horas), configurables; se revocan al
  cerrar sesión, cambiar la contraseña, desactivar la cuenta o cambiar sus permisos (FR-068).
- **Generación de pago**: toda solicitud muestra antes la estimación y el presupuesto
  disponible; sin una reserva dentro de los límites no se envía (FR-021).
- **Revisión**: guardar un elemento editable, y validarlo, aprobarlo o rechazarlo, exige la
  revisión abierta. Si no es la actual, la respuesta es 409, sin guardar nada: dice que hay
  una versión más reciente, la muestra junto al contenido enviado, que sigue en el
  formulario, y permite reenviarlo de forma explícita contra esa versión o descartarlo. Nada
  se fusiona ni se reenvía solo (FR-063).
- **Bloqueos de negocio** (cobertura incompleta, aprobación no vigente, páginas sin resolver,
  presupuesto insuficiente): 422 con el motivo y la lista de pendientes, cada uno con su
  referencia normativa cuando aplica.
- **Cuerpos**: tamaño máximo por operación, aplicado en la frontera.
- **Sin borrado**: no existe ninguna operación `DELETE`.

## Rutas implementadas (cimientos e historias 1 a 3)

| Destino                 | Métodos                  | Operación                                 |
| ----------------------- | ------------------------ | ----------------------------------------- |
| `/api/health`           | `GET`, `HEAD`, `OPTIONS` | Comprobar estado                          |
| `/login`                | `GET`                    | Ver el formulario de entrada              |
| `/api/session/sign-in`  | `POST`                   | Iniciar sesión                            |
| `/`                     | `GET`                    | Inicio                                    |
| `/account/password`     | `GET`                    | Ver el formulario de cambio de contraseña |
| `/api/session/sign-out` | `POST`                   | Cerrar sesión                             |
| `/api/account/password` | `POST`                   | Cambiar la contraseña                     |
| `/documents`            | `GET`                    | Ver los documentos registrados            |
| `/documents/new`        | `GET`                    | Ver el formulario de subida               |
| `/api/documents/upload` | `POST`                   | Registrar documento, también un sustituto |
| `/documents/:id`        | `GET`                    | Ver el registro de un documento           |
| `/documents/:id/file`   | `GET`                    | Abrir el PDF original                     |
| `/documents/:id/pages/:n` | `GET`                  | Ver una página y su texto extraído        |
| `/api/documents/resolve-page` | `POST`             | Resolver página sin texto                 |
| `/api/interpretations/request` | `POST`            | Pedir interpretación                      |
| `/interpretations/:id`  | `GET`                    | Ver la interpretación y su registro       |
| `/interpretations/:id/unit` | `GET`                | Ver el formulario de la unidad            |
| `/interpretations/:id/requirements/new` | `GET`    | Ver el formulario de un requisito nuevo   |
| `/interpretations/:id/requirements/:id` | `GET`    | Ver el formulario de un requisito         |
| `/api/interpretations/correct` | `POST`            | Corregir interpretación                   |
| `/api/interpretations/validate` | `POST`           | Validar interpretación                    |
| `/api/interpretations/reject` | `POST`             | Rechazar interpretación                   |
| `/api/interpretations/resubmit` | `POST`           | Devolver a revisión una rechazada         |
| `/api/outlines/request` | `POST`                   | Pedir índice                              |
| `/outlines/:id`         | `GET`                    | Ver el índice, su cobertura y su registro |
| `/outlines/:id/preview` | `GET`                    | Previsualizar el índice, sin fichero      |
| `/outlines/:id/entries/new` | `GET`                | Ver el formulario de una entrada nueva    |
| `/outlines/:id/entries/:id` | `GET`                | Ver el formulario de una entrada          |
| `/api/outlines/edit`    | `POST`                   | Editar índice y sus vínculos              |
| `/api/outlines/approve` | `POST`                   | Aprobar índice                            |
| `/api/outlines/reject`  | `POST`                   | Rechazar índice                           |
| `/api/outlines/resubmit` | `POST`                  | Devolver a revisión uno rechazado         |
| `/syllabus/:id`         | `GET`                    | Ver el temario de un índice               |
| `/api/syllabus/generate` | `POST`                  | Lanzar o reanudar la generación           |
| `/api/syllabus/approve` | `POST`                   | Aprobar versión del temario               |
| `/topics/:id`           | `GET`                    | Ver un tema junto a su fuente normativa   |
| `/topics/:id/blocks/new` | `GET`                   | Ver el formulario de un bloque nuevo      |
| `/topics/:id/blocks/:id` | `GET`                   | Ver el formulario de un bloque            |
| `/api/topics/edit`      | `POST`                   | Editar tema                               |
| `/api/topics/approve`   | `POST`                   | Aprobar tema                              |
| `/api/topics/reject`    | `POST`                   | Rechazar tema                             |
| `/api/topics/resubmit`  | `POST`                   | Devolver a revisión uno rechazado         |
| `/api/references/check` | `POST`                   | Comprobar referencia heredada             |
| `/budget`               | `GET`                    | Consultar presupuesto                     |
| `/api/budget/limit`     | `POST`                   | Modificar límite de coste                 |
| `/api/budget/reconcile` | `POST`                   | Conciliar una operación incierta          |
| `/history`              | `GET`                    | Consultar historial: índice de elementos  |
| `/history/documents/:id` | `GET`                   | Historial de un documento                 |
| `/history/interpretations/:id` | `GET`             | Historial de una interpretación           |
| `/history/outlines/:id` | `GET`                    | Historial de un índice, su temario y sus exportaciones |
| `/history/topics/:id`   | `GET`                    | Historial de un tema                      |
| `/metrics`              | `GET`                    | Consultar las métricas mínimas (solo `admin`) |

Las demás operaciones de la tabla siguiente todavía no existen. Los destinos son exactos: no
admiten parámetros de consulta ni barra final. `:id` es un identificador opaco de 32 cifras
hexadecimales en minúscula y `:n`, un número de página de 1 a 99999 sin ceros iniciales;
cualquier otra forma recibe el 404 cerrado de la frontera.

Las páginas responden con HTML completo o con una redirección. Las acciones responden con una
redirección o con un rechazo sin cuerpo, con tres excepciones:

- **Conflicto de revisión (409) y bloqueo de negocio o dato inválido (422)**: la acción
  responde con una página que lo explica y conserva lo enviado, sin guardar nada.
- **Subida**: el cuerpo es el PDF (`application/pdf`), así que el testigo de la sesión y los
  datos de procedencia viajan en cabeceras. La respuesta es un JSON mínimo, `{"location"}`,
  con 201 si el documento se registró y 422 si se rechazó; el motivo se muestra en la página
  indicada. Sin sesión responde 401 sin cuerpo.
- **PDF original**: se sirve con `Content-Type: application/pdf`, `nosniff`, sin caché y con
  una política de contenido que no le permite cargar nada.

**Índice (fase 5)**. Las rutas usan `/outlines`, en plural, como las demás. Aprobar con la
cobertura incompleta responde 422 con los requisitos pendientes, cada uno con su documento,
su sección y su página, y no existe ningún campo, perfil ni destino que lo evite. Un cambio o
una decisión sobre una revisión que ya no es la actual responde 409 con la versión más
reciente: el formulario de una entrada conserva lo enviado, y aprobar, rechazar, reordenar o
quitar muestran el índice actual para repetir la decisión. La vista previa no genera ningún
fichero; sin aprobación vigente o con cobertura incompleta se identifica como borrador no
entregable.

**Estimación previa (FR-021)**. Pedir una interpretación tiene dos pasos sobre el mismo
destino: el envío con la unidad y las páginas no manda nada y responde 200 con la estimación,
el máximo que se reserva y lo disponible; el envío de confirmación lleva las cifras mostradas
y, si ya no son las actuales, responde 409 con las nuevas, sin enviar nada. La página de la
interpretación muestra esas cifras para el índice, y su solicitud las lleva con la misma
regla. Estimación, reserva máxima y consumo confirmado se muestran por separado; con el
adaptador determinista son cero y figuran como coste simulado.

**Temario (fase 6)**. `/syllabus/:id` usa el identificador del índice. Lanzar la generación,
reanudarla y pedir otro intento de un tema fallido son la misma acción, que lleva las cifras
mostradas. La generación se ejecuta dentro de la petición (limitación pendiente de resolver o validar
con el proveedor real, T076) y responde con una redirección y el
recuento de temas terminados, fallidos y no enviados. Aprobar la versión lleva una huella del
estado mostrado: si el temario cambió, 409; si falta algo, 422 con los temas y los requisitos
pendientes, cada uno con su referencia normativa. Consultar el presupuesto admite el perfil
`teacher` o el `admin`; modificar el límite y conciliar, solo `admin`. Las cantidades se
escriben en unidades de la moneda, con seis decimales como máximo.

**Exportación (fase 7)**. `/export/:id` y `/export/:id/preview` usan el identificador del
índice; `/export/packages/:id` y `/export/packages/:id/instructions`, el de la exportación.
Exportar (`/api/export/create`) lleva el identificador de la versión: si no está vigente o
falta cobertura, 422 con lo pendiente; si no se pudo guardar, 500 sin fichero. Las dos
descargas son peticiones GET que comprueban la vigencia cada vez y dejan registro, también
cuando se deniegan (422) o no hay fichero (404). El paquete se sirve como `application/zip` y
las instrucciones como texto, ambos como adjunto y sin caché. No hay ninguna ruta de borrado.

Cada acción admite un cuerpo máximo: 4 KiB los formularios simples, 64 KiB los que llevan el
texto de un requisito o un motivo, y 64 MiB la subida, sobre la que la ruta aplica además el
tamaño máximo configurado.

## Operaciones

| Operación                                    | Perfil            | Condiciones                                                        | Requisitos                 |
| -------------------------------------------- | ----------------- | ------------------------------------------------------------------ | -------------------------- |
| Comprobar estado (`GET /api/health`)         | ninguno           | Contrato de 001, sin cambios                                       | —                          |
| Ver el formulario de entrada e iniciar sesión | ninguno          | Testigo de la sesión previa; retraso y bloqueo por intentos; auditado | FR-026, FR-054          |
| Cerrar sesión y cambiar la contraseña        | sesión            | Cambiar la contraseña revoca las demás sesiones                    | FR-026                     |
| Registrar documento (cuerpo `application/pdf`) | `teacher`       | Validación del fichero; opcionalmente, documento al que sustituye | FR-001 a FR-003, FR-067    |
| Ver documento, página y texto extraído       | `teacher`         | —                                                                  | FR-008                     |
| Resolver página sin texto                    | `teacher`         | Confirmación expresa                                               | FR-064                     |
| Pedir interpretación                         | `teacher`         | Presupuesto disponible                                             | FR-005, FR-006             |
| Corregir interpretación                      | `teacher`         | Revisión abierta                                                   | FR-007, FR-065             |
| Validar interpretación                       | `teacher`         | Páginas resueltas; confirmación de la revisión del inventario      | FR-057                     |
| Rechazar interpretación                      | `teacher`         | Motivo obligatorio; conserva el contenido                          | FR-070                     |
| Pedir índice                                 | `teacher`         | Interpretación validada y vigente; presupuesto disponible          | FR-009                     |
| Editar índice y sus vínculos                 | `teacher`         | Revisión abierta                                                   | FR-014, FR-059             |
| Ver cobertura                                | `teacher`         | Declara el límite de la cobertura                                  | FR-011, FR-058             |
| Aprobar o rechazar índice                    | `teacher`         | Aprobar exige cobertura completa; rechazar, un motivo              | FR-013, FR-015, FR-070     |
| Estimar y lanzar generación del temario      | `teacher`         | Índice aprobado y vigente; estimación y disponible mostrados antes | FR-016, FR-021             |
| Reanudar generación                          | `teacher`         | Acción explícita; presupuesto disponible; solo pendientes          | FR-066                     |
| Editar tema                                  | `teacher`         | Revisión abierta                                                   | FR-022, FR-024             |
| Aprobar o rechazar tema                      | `teacher`         | Aprobar exige índice aprobado y vigente; rechazar, un motivo       | FR-022, FR-070             |
| Aprobar versión del temario                  | `teacher`         | Temario completo, cubierto y desarrollado                          | FR-023, FR-060             |
| Comprobar referencia heredada                | `teacher`         | Solo tras un documento sustituto                                   | FR-067                     |
| Previsualizar                                | `teacher`         | Borrador marcado como no entregable; sin fichero                   | FR-038                     |
| Exportar                                     | `teacher`         | Versión vigente; cobertura completa en ese momento                 | FR-030, FR-031, FR-037     |
| Descargar paquete e instrucciones            | `teacher`         | Versión vigente en el momento de cada descarga                     | FR-035, FR-040, FR-062     |
| Consultar historial y registros              | `teacher`, `admin` | —                                                                 | FR-028, FR-039             |
| Consultar presupuesto                        | `teacher`, `admin` | —                                                                 | FR-027                     |
| Consultar las métricas mínimas               | `admin`           | Recuentos de lo ya registrado; sin series ni alertas               | Constitución, principio XI |
| Modificar límite de coste                    | `admin`           | Registra valor anterior y nuevo; no inicia nada                    | FR-027, FR-028, FR-066     |
| Conciliar una operación incierta             | `admin`           | Registra actor, fecha e importe confirmado                         | FR-021, FR-028             |

`admin` no incluye `teacher`: una persona puede tener ambos perfiles.

## Pruebas de contrato previstas

- Cada operación, sin sesión, con una cuenta sin perfiles y con el perfil equivocado:
  denegada y auditada (SC-007).
- Entrada: envío sin testigo o con otro origen, rechazado; intentos repetidos, retrasados y
  bloqueados; sesión caducada o revocada, rechazada; el identificador cambia al autenticar.
- Ninguna ruta sin sesión devuelve datos de producto.
- Cada bloqueo de negocio de la tabla: 422 con sus pendientes (SC-006, SC-025, SC-035).
- Guardado con revisión antigua: 409 sin pérdida (SC-033).
- Descarga con un enlace anterior a la invalidación: denegada (SC-031).
- Ninguna ruta acepta `DELETE` (SC-031).
- `/api/health`: su contrato de 001 sigue pasando sin cambios.
