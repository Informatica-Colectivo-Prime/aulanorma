---
description: "Lista de tareas de 002-boe-scorm-export"
---

# Tasks: Del PDF oficial del BOE al paquete SCORM (piloto UF0517)

**Input**: Design documents from `/specs/002-boe-scorm-export/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: obligatorias por el principio VIII de la constitución. Cada tarea de pruebas es
proporcional al cambio que acompaña y se escribe antes o junto a él; ninguna usa la red.

**Organization**: por fases entregables. Cada fase es uno o varios PR revisables en una
sesión, con los nueve controles en verde, y termina con algo que se puede ver o probar.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede hacerse en paralelo (ficheros distintos, sin dependencias pendientes).
- **[Story]**: historia de usuario de spec.md (US1 a US5).
- **⛔ BLOQUEADA**: necesita un dato externo que todavía no existe. No se empieza ni se
  simula; el resto de la fase sigue.

## Condiciones previas, fuera de esta lista

- La enmienda 2.0.0 y el ADR 0003 (Propuesto) están integrados en `main`.
- La especificación, el plan, estas tareas y el ADR 0004 (Propuesto) se integran juntos, con
  la fila del ADR 0004 en el índice de `docs/adr/README.md`.
- Los tres puntos abiertos de `checklists/pilot-readiness.md` se resuelven antes de la fase
  que indica la tabla "Puntos abiertos de la lista de calidad".
- Ninguna tarea de esta lista toca `specs/001-engineering-baseline/`. La única aceptación de
  un ADR es la del 0003, en T005, con su nota en el ADR 0001; el ADR 0004 sigue Propuesto.

---

## Phase 1: Setup — migración a `content-export`

**Purpose**: renombrar la cuarta capa antes de escribir código en ella. Un único PR, sin
lógica nueva.

- [X] T001 Mover `src/modules/moodle-publication/` a `src/modules/content-export/` con `git mv`, conservando `index.ts` (`export {};`) y actualizando su `README.md` para retirar el carácter transitorio
- [X] T002 Actualizar las reglas `no-restricted-imports` de `eslint.config.mjs` para que nombren `content-export` en lugar de `moodle-publication`
- [X] T003 Actualizar `tests/architecture/import-boundaries.test.ts` y cualquier otra prueba de `tests/architecture/` que nombre el módulo
- [X] T004 Actualizar la alteración de `lint` de `scripts/negative-checks.mjs`, que importa `@/modules/moodle-publication`, y su descripción en `docs/engineering/quality-controls.md`
- [X] T005 [P] Actualizar `docs/engineering/architecture.md` y los `README.md` de `src/modules/normative-source/`, `structured-interpretation/` y `didactic-content/` que mencionan el nombre anterior; aceptar el ADR 0003 en `docs/adr/`, actualizar su índice y añadir al ADR 0001 la nota de sustitución parcial, sin cambiar el resto de su decisión
- [X] T006 Ejecutar `npm run check` y `npm run verify:negative`, y comprobar que `moodle-publication` solo aparece en `specs/001-engineering-baseline/`, en el historial de `docs/adr/` y en la descripción de esta migración en `specs/002-boe-scorm-export/` y en los documentos que cuentan el origen del módulo

**Checkpoint**: los nueve controles en verde, sin cambio de comportamiento.

---

## Phase 2: Viabilidad temprana

**Purpose**: resolver los puntos **[por verificar]** de research.md antes de construir sobre
ellos. Código desechable fuera de `src/`; lo que queda es el informe.

- [X] T007 Crear `scripts/fixtures/make-pdf-fixtures.mjs`, que genera los PDF sintéticos de research R4 (página solo imagen, página en blanco, cifrado, truncado, con JavaScript, con acción de apertura o de lanzamiento, con fichero incrustado, no PDF con extensión `.pdf`, por encima del tamaño y de las páginas máximas) en `tests/fixtures/pdf/synthetic/`, sin datos reales; y los casos añadidos tras la primera viabilidad: campo de firma pasivo, campo de firma con acción, firma con actualización que añade una acción, formulario con campo de texto, flujos de objetos permitidos y prohibidos, tipo de acción tras referencia indirecta, referencias indirectas permitidas, actualizaciones incrementales permitida, con acción añadida, con acción retirada y con acción liberada, y nombre escapado
- [X] T008 Comprobar con `pdfjs-dist` la extracción por página, la detección de cada tipo de contenido activo y el aislamiento en un proceso hijo con límites de tiempo, memoria y sistema de ficheros, sobre los PDF de T007 y otro PDF oficial del BOE con procedencia anotada; registrar el resultado de cada caso de la tabla de R4 en `specs/002-boe-scorm-export/feasibility.md`
- [X] T009 Repetir T008 con el PDF real, registrar su procedencia (organismo, referencia oficial, origen, fecha de obtención, SHA-256) en `specs/002-boe-scorm-export/pilot-source.md` y fijar en `feasibility.md` los límites de partida de tamaño y páginas; la procedencia no va en `tests/fixtures/pdf/`, porque `tests/architecture/no-domain-specifics.test.ts` rechaza los códigos del certificado en `tests/`
- [X] T010 [P] Comprobar `node:sqlite` en Node.js 24.21.0: modo WAL, transacciones con bloqueo de escritura, disparadores que rechazan `UPDATE` y `DELETE`, la operación `backup` y la ausencia de avisos al arrancar; anotar en `feasibility.md` su estado *release candidate* y lo observado
- [X] T011 [P] Comprobar `xmllint-wasm` validando un `imsmanifest.xml` contra los XSD oficiales de SCORM 1.2 sin acceso a la red, con sus importaciones resueltas en local; anotar en `feasibility.md` el resultado y las condiciones de redistribución de los XSD
- [X] T012 Cerrar `feasibility.md` con una decisión por punto (seguir, ajustar o cambiar de enfoque) y, si alguna decisión cambia, corregir `research.md` y el ADR 0004 mientras sigue Propuesto. Cerrada con las decisiones del mantenedor del 2026-10-07 y la inspección estructural con qpdf probada sobre 26 casos sintéticos y dos documentos oficiales; lo que queda pendiente está asignado a fases posteriores en la tabla de decisiones

**Checkpoint**: informe con resultado por caso. Ningún "aceptado" sin haberse ejecutado.

---

## Phase 3: Foundational — cimientos con interfaz

**Purpose**: persistencia, auditoría, frontera ampliada, entrada y una página de inicio
autenticada. Sin funciones de producto.

**⚠️ CRITICAL**: ninguna historia empieza antes de terminar esta fase.

### Persistencia y auditoría

- [X] T013 Añadir a `src/platform/config/` las claves nuevas del esquema Zod (directorio de datos, origen público y caducidad de sesión por inactividad y máxima) y actualizar `.env.example` sin valores reales, con pruebas en `tests/unit/platform/config.test.ts`. Los límites de tamaño de petición no son configuración: son parte de la lista cerrada de rutas de la frontera (T024). El máximo de coste por operación se añade con el presupuesto, en T049
- [X] T014 Crear `src/platform/persistence/` con la conexión `node:sqlite` en modo WAL, el ejecutor de migraciones numeradas y un `index.ts` público, con pruebas en `tests/unit/platform/persistence.test.ts`. Las migraciones son entradas numeradas del propio módulo, no ficheros aparte: el módulo es portable y no puede leer ficheros relativos cuando lo empaqueta Next.js
- [X] T015 [P] Añadir a `src/platform/persistence/` el almacén de ficheros por SHA-256 (publicación antes de referenciar: fichero temporal en el mismo directorio, sincronización a disco, renombrado a su huella y sincronización del directorio; sin sobrescritura ni borrado; verificación de huella al leer), con pruebas en `tests/unit/platform/persistence.test.ts`
- [X] T016 Crear `src/platform/audit/` con `AuditEvent` de solo inserción, impuesto por disparadores, y campos `at`, `actor_id`, `action`, `target_kind`, `target_id`, `result`, `correlation_id`, `details`; pruebas en `tests/unit/platform/audit.test.ts` que demuestren que `UPDATE` y `DELETE` fallan; y una prueba de contrato en `tests/contract/audit-immutability.contract.test.ts` que, tras ejercitar todas las operaciones de la superficie con todos los perfiles, compruebe que los eventos anteriores conservan su contenido, que ninguno desaparece y que una corrección es un evento nuevo (SC-043)
- [X] T017 [P] Añadir a `src/platform/logging/` el identificador de correlación por petición y los eventos de producto, sin secretos ni contenido, con pruebas en `tests/unit/platform/logging.test.ts`

### Identidad

- [X] T018 Crear en `src/platform/identity/index.ts` las contraseñas: derivación `scrypt` de `node:crypto` con sal de 16 bytes y parámetros guardados con la huella (partida N = 2^17, r = 8, p = 1), `timingSafeEqual`, derivación también para usuarios inexistentes, longitud mínima de 12; pruebas en `tests/unit/platform/identity.test.ts`. Toda la identidad está en un único `index.ts` porque la regla del proyecto para los módulos portables prohíbe en ellos las importaciones relativas y con alias (ESLint y prueba de arquitectura; `docs/engineering/architecture.md`, «Módulos portables»). Es una regla propia, no un límite de Node.js, que sí resuelve una importación relativa con su extensión
- [X] T019 Crear en `src/platform/identity/index.ts` las sesiones: identificador de 256 bits con `randomBytes`, guardado como SHA-256; caducidad tras 30 minutos de inactividad y 12 horas de duración máxima, configurables; revocación al cerrar sesión, al cambiar la contraseña, al desactivar la cuenta y al cambiar sus permisos; renovación del identificador al autenticar; pruebas en `tests/unit/platform/identity.test.ts`
- [X] T020 [P] Crear en `src/platform/identity/index.ts` el control de intentos con `SignInThrottle`: retraso creciente y bloqueo temporal por cuenta, hasta 15 minutos, más un límite global, con contadores en la base; pruebas en `tests/unit/platform/identity.test.ts`
- [X] T021 [P] Crear en `src/platform/identity/index.ts` la comprobación de `Origin` y `Sec-Fetch-Site` contra el origen público, y el testigo aleatorio por sesión, incluida la sesión previa anónima de la entrada; pruebas en `tests/unit/platform/identity.test.ts` y `tests/contract/session.contract.test.ts`
- [X] T022 Crear en `src/platform/identity/index.ts` la autorización: perfiles `admin` y `teacher` leídos de `User` en cada petición, denegación por defecto y auditoría de cada denegación; pruebas en `tests/unit/platform/identity.test.ts`
- [X] T023 [P] Crear `scripts/admin/users.mjs` para dar de alta cuentas, asignar perfiles, asignar contraseñas iniciales, desactivar y reactivar cuentas y revocar sesiones, sin imprimir contraseñas ni huellas; pruebas en `tests/unit/tools/admin-users.test.ts`

### Frontera HTTP y entrada

- [X] T024 Ampliar `src/platform/http-boundary/` para delegar una lista cerrada de rutas con sus métodos y su tamaño máximo de cuerpo, manteniendo sin cambios la precedencia, los rechazos cerrados y el trato de `/api/health`; ampliar `tests/unit/platform/http-boundary*.test.ts`
- [X] T025 Sustituir en `tests/architecture/public-routes.test.ts` la comprobación de ruta única por una que compare las rutas reales de `src/pages/` con la lista cerrada y con `ROUTES`, y falle ante una ruta no declarada o sin su guarda de acceso; ajustar `tests/architecture/entry-points.test.ts` y ampliar `import-boundaries.test.ts` con las áreas nuevas. La entrega sigue sin poder importar capas de dominio: se abrirá en T038, con la primera ruta que las necesite
- [X] T026 Añadir la alteración correspondiente en `scripts/negative-checks.mjs` (una ruta de producto sin declarar debe fallar) y describirla en `docs/engineering/quality-controls.md`
- [X] T027 Crear `src/pages/login.ts` y `src/pages/api/session/sign-in.ts` y `sign-out.ts`: formulario accesible, sesión previa con testigo, mensaje único de error, cookie `HttpOnly` y `SameSite=Strict`, con el prefijo `__Host-` y `Secure` cuando el origen público es HTTPS; la página no depende de recursos que exijan sesión
- [X] T028 Crear `src/pages/index.ts` (inicio autenticado, con el nombre de usuario, sus perfiles y cerrar sesión), `src/pages/account/password.ts` con su API Route, y el documento común en `src/platform/web/` (no en `src/pages/`, donde todo fichero es una ruta), con encabezados, foco visible y navegación por teclado
- [X] T029 Escribir `tests/contract/session.contract.test.ts`: entrada correcta e incorrecta, envío sin testigo o con otro origen, intentos repetidos, sesión caducada por inactividad y por duración máxima, sesión revocada por cada una de sus causas, cambio de identificador al autenticar, mensaje de error que no revela si la cuenta existe (SC-039), y que ninguna ruta sin sesión devuelve datos de producto
- [X] T030 Comprobar que `tests/contract/health.contract.test.ts` y `scripts/smoke-test.mjs` siguen pasando sin cambios en el contrato de `/api/health`, y ampliar la prueba de humo con la entrada

**Checkpoint**: entrar, ver la página de inicio y salir. Primera interfaz visible. Verificado
con pruebas automáticas y con un navegador real: ver
[foundations-check.md](./foundations-check.md).

---

## Phase 4: User Story 1 — Documento e interpretación (Priority: P1) 🎯 MVP

**Goal**: registrar el PDF, revisar y validar la interpretación de la unidad.

**Independent Test**: con un PDF de prueba, un docente obtiene la interpretación, abre la
página de origen de varios elementos, corrige uno y valida.

- [X] T031 [P] [US1] Crear la migración y el repositorio de `Document`, `DocumentPage` y `PageResolution` en `src/modules/normative-source/` (documento inmutable, `sha256` único, `replaces_document_id`, una fila por página aunque no tenga texto), con pruebas en `tests/unit/normative-source/repository.test.ts`. Hecho con dos precisiones: las migraciones están en la lista única y ordenada de `src/platform/persistence`, porque `server.mjs` las aplica antes de cargar Next.js y solo importa módulos portables; y el repositorio y el servicio de la capa están en su `index.ts`
- [X] T032 [US1] Incorporar `qpdf` como herramienta verificada (binario oficial con huella fijada en `scripts/tools/tools.lock.json`, instalado por `npm run tools:install`) e implementar en `src/modules/normative-source/pdf/` la validación del fichero: firma, tamaño y páginas; inspección estructural con la salida JSON versión 2 de qpdf y la política propia sobre esa estructura (rechazo de JavaScript, XFA, acciones automáticas, lanzamientos y ficheros incrustados; formulario admitido solo si todos sus campos son de firma y sin acciones; rechazo ante error, avisos, límite excedido o referencia no resoluble); y extracción por página con `pdfjs-dist`, todo en procesos hijos con entorno vacío y límites, con la salida validada por esquema y sin modificar el original; pruebas en `tests/unit/normative-source/pdf.test.ts`, un caso por cada fichero de `tests/fixtures/pdf/synthetic/` (SC-042). Hecho. El instalador y el fichero de huellas admiten ahora una herramienta de varios ficheros en un `.zip`, para las cuatro plataformas. El cifrado lo declara qpdf a partir de la estructura, con la clave dada en hexadecimal, sin depender de su proveedor criptográfico: el binario oficial de macOS no puede cargar los algoritmos antiguos y antes rechazaba el documento por ese fallo
- [X] T033 [US1] Exponer en `src/modules/normative-source/index.ts` registrar documento, registrar sustituto, leer página y resolver página sin texto, con auditoría. Hecho en `src/modules/normative-source/index.ts`
- [X] T034 [P] [US1] Crear la migración y el repositorio de `Interpretation`, `Requirement` (`kind`: `capability`, `criterion`, `content`, `subcontent`; `parent_id`; referencia normativa), `Correction` e `InterpretationValidation` en `src/modules/structured-interpretation/`, con pruebas en `tests/unit/structured-interpretation/repository.test.ts`. Hecho, con el rechazo en `interpretation_rejection` (la entidad `Rejection` del modelo, para la interpretación), la sección original de la unidad en `Interpretation` y la marca `withdrawn` en `Requirement`: nada se borra, un requisito erróneo se retira
- [X] T035 [P] [US1] Crear `src/platform/generation/` con la interfaz `GenerationProvider`, el adaptador determinista con respuestas grabadas en `tests/fixtures/generation/`, `GenerationRun` y `GenerationCall`, y el prompt versionado `prompts/interpretation/v1.md`; pruebas de contrato en `tests/contract/generation-provider.contract.test.ts` (salida inválida rechazada y registrada; texto con instrucciones incrustadas tratado como dato; ninguna identidad ni registro de usuarios en la entrada enviada, SC-015; cada llamada registra proveedor, modelo, versión del prompt, coste estimado y resultado de la validación, SC-044). Hecho. El presupuesto y sus reservas siguen en T049; el coste estimado de cada llamada ya se registra. Las grabaciones del adaptador se leen de `tests/fixtures/generation/` en las pruebas y, en ejecución, de `generation-recordings` dentro del directorio de datos
- [X] T036 [US1] Implementar en `src/modules/structured-interpretation/` la obtención de la interpretación con su esquema Zod versionado y las comprobaciones posteriores (la página existe, la cita aparece en el texto de su página); pruebas en `tests/unit/structured-interpretation/interpret.test.ts`. Hecho en `src/modules/structured-interpretation/index.ts`, con las pruebas en `tests/unit/structured-interpretation/interpretation.test.ts`
- [X] T037 [US1] Implementar correcciones con control de revisión, con el conflicto de FR-063 (versión más reciente mostrada junto al cambio enviado y reenvío explícito, SC-033), y la validación (exige todas las páginas sin texto resueltas y la confirmación de la revisión del inventario); el rechazo con motivo obligatorio (`Rejection`), que conserva el contenido y permite volver a revisión; la vigencia se deriva de `interpretation_revision`; pruebas en `tests/unit/structured-interpretation/validation.test.ts`. Hecho, con las pruebas en `tests/unit/structured-interpretation/interpretation.test.ts`
- [X] T038 [US1] Abrir la regla de la entrega para que las rutas de producto importen las capas `normative-source` y `structured-interpretation` (ESLint y `import-boundaries.test.ts`), y crear las páginas `src/pages/documents/` (subida con cuerpo `application/pdf`, registro con huella y procedencia, páginas sin texto y su resolución) y la ruta que sirve el PDF autorizado en su página con `nosniff` y política de contenido restrictiva. Hecho. La entrega se abre solo a esas dos capas; las vistas que comparten páginas y acciones están en `src/views`. Los datos de procedencia viajan en una cabecera de la subida, porque el cuerpo es el PDF, y la respuesta de la subida es un JSON mínimo con la página a la que ir
- [X] T039 [US1] Crear las páginas `src/pages/interpretation/` (inventario con jerarquía, duración como metadato, acceso a la página de origen junto al texto extraído, corrección, validación con confirmación expresa). Hecho
- [X] T040 [US1] Implementar el documento sustituto (FR-067): interpretación nueva sin validación ni aprobaciones, sin mezclar páginas ni reasignar referencias, sin iniciar generación; pruebas en `tests/integration/substitute-document.test.ts`. Hecho. La comprobación de referencias heredadas de índices y temas es T058
- [X] T041 [US1] Escribir `tests/integration/us1-document-interpretation.test.ts` con los escenarios de aceptación 1 a 10 de la historia 1 y las denegaciones por perfil. Hecho, con 77 casos
- [X] T042 [US1] Ejecutar el tratamiento completo sobre el PDF real del piloto, localizado por su ruta y verificado contra la huella de `specs/002-boe-scorm-export/pilot-source.md`, y registrar los resultados esperados y obtenidos de la unidad en `specs/002-boe-scorm-export/pilot/`; el PDF no se añade al repositorio y esta comprobación no forma parte de la integración continua. Hecho: ver [pilot/README.md](./pilot/README.md)

**Checkpoint**: subir un PDF y validar su interpretación desde el navegador. Verificado con
pruebas automáticas y con un navegador real: ver [us1-check.md](./us1-check.md).

---

## Phase 5: User Story 2 — Índice y cobertura (Priority: P1)

**Goal**: proponer, editar y aprobar el índice con cobertura completa.

**Independent Test**: desde una interpretación validada, el docente obtiene un índice, ve la
cobertura, comprueba el bloqueo al quitar una entrada y lo aprueba.

- [X] T043 [P] [US2] Crear la migración y el repositorio de `Outline` (`status`: `proposed`, `in_review`, `approved`, `rejected`), `OutlineEntry` (`unsupported` exige no tener vínculos), `EntryRequirement` y `OutlineApproval` en `src/modules/didactic-content/`, con pruebas en `tests/unit/didactic-content/outline-repository.test.ts`. Hecho: las migraciones `0007_outline` están en la lista única de `src/platform/persistence`; añade `removed` a `OutlineEntry`, `outline_change` para el historial y la tabla común `rejection`; un índice por interpretación
- [X] T044 [US2] Implementar el cálculo de cobertura del índice por vínculos explícitos, sin herencia entre padre e hijos en ningún sentido y sin contar entradas sin respaldo; pruebas en `tests/unit/didactic-content/coverage.test.ts`, incluido el caso de una propuesta que declara cobertura total y omite un requisito. Hecho en `src/modules/didactic-content/coverage.ts`
- [X] T045 [US2] Implementar la propuesta de índice con el prompt `prompts/outline/v1.md` y su esquema Zod; exige interpretación validada y vigente; rechaza referencias a requisitos inexistentes; pruebas en `tests/unit/didactic-content/outline-proposal.test.ts`. Hecho; añade `budget_exceeded` cuando no hay reserva posible, y `coverageComplete` en el esquema solo para dejar constancia de que se ignora
- [X] T046 [US2] Implementar la edición del índice con control de revisión (reordenar, renombrar, añadir, quitar, cambiar vínculos), la aprobación (exige cobertura completa) y el rechazo con motivo obligatorio, que conserva el contenido y permite volver a revisión; la vigencia se deriva de `outline_revision` y de la validación de la interpretación; pruebas en `tests/unit/didactic-content/outline-approval.test.ts`. Hecho; reordenar es subir o bajar una posición, quitar marca la entrada sin borrarla, y un índice de un documento con sustituto queda como histórico hasta T058
- [X] T047 [US2] Crear las páginas `src/pages/outline/` (entradas con sus requisitos, cobertura por requisito con su referencia normativa, límite declarado de la cobertura, pendientes al intentar aprobar, vista previa marcada como borrador no entregable). Hecho en `src/pages/outlines/` y `src/pages/api/outlines/`, en plural como las demás rutas, con las vistas en `src/views/outline.ts`; abre la entrega a la capa `didactic-content`
- [X] T048 [US2] Escribir `tests/integration/us2-outline-coverage.test.ts` con los escenarios 1 a 9 de la historia 2, la invalidación al corregir la interpretación (SC-029) y la ausencia de cualquier vía de «aprobar de todos modos» (SC-026). Hecho, con 28 casos; incluye el conflicto 409 (SC-033), el rechazo (SC-041) y las denegaciones por perfil (SC-007)

### Presupuesto de generación

Adelantadas desde la fase 6 por indicación del mantenedor: pedir el índice es una operación
de generación y FR-021 exige mostrar antes su estimación y lo disponible, y no enviarla sin
una reserva. Sus páginas (T057) siguen en la fase 6.

- [X] T049 [P] [US2] Añadir a `src/platform/generation/` `Budget`, `BudgetChange`, `BudgetReservation` (`state`: `reserved`, `sent`, `settled`, `released`, `uncertain`) y `Reconciliation`, con la reserva atómica contra el máximo por operación y el límite acumulado; pruebas en `tests/unit/platform/budget.test.ts`. Hecho en `src/platform/generation/budget.ts`, con la migración `0006_budget` y la clave `AULANORMA_GENERATION_MAX_OPERATION_COST`; 16 casos
- [X] T050 [US2] Implementar el ciclo de la reserva: anotar el envío antes de llamar, liquidar con el consumo real, liberar solo si no se envió, pasar a `uncertain` sin consumo confirmado, y al arrancar convertir en `uncertain` lo enviado sin liquidar; pruebas en `tests/unit/platform/budget-lifecycle.test.ts` (dos operaciones simultáneas, tiempo agotado, respuesta sin datos de uso, caída entre envío y liquidación, reducción del límite con operaciones en curso). Hecho; la reserva se integra en `Generation.call`, así que también cubre la petición de interpretación; 19 casos, con proveedores y consumos simulados

**Checkpoint**: aprobar un índice y ver el bloqueo por cobertura. Verificado con pruebas
automáticas y con un navegador real: ver [us2-check.md](./us2-check.md).

---

## Phase 6: User Story 3 — Temario, presupuesto y aprobaciones (Priority: P1)

**Goal**: desarrollar el temario dentro del presupuesto, revisarlo y aprobar una versión.

**Independent Test**: con un índice aprobado, el docente genera el temario, edita y aprueba
los temas, aprueba la versión y comprueba la invalidación al editar el índice.

- [X] T051 [P] [US3] Crear la migración y el repositorio de `Topic` (`status`: `pending`, `failed`, `draft`, `in_review`, `approved`, `rejected`), `TopicBlock` (`kind`: `requirement`, `development`), `BlockRequirement`, `TopicApproval`, `SyllabusVersion`, `SyllabusVersionTopic` y `ReferenceCheck` en `src/modules/didactic-content/`. Hecho: migración `0008_syllabus` en la lista única de `src/platform/persistence`; `Topic` guarda el motivo del fallo y su última llamada, `TopicBlock` lleva `removed`, y `topic_change` conserva el historial
- [X] T052 [US3] Definir el esquema Zod de los bloques estructurados y el renderizador que escapa todo el texto en `src/modules/didactic-content/render/`, con etiqueta de texto para distinguir norma y desarrollo; pruebas en `tests/unit/didactic-content/render.test.ts` con texto hostil (SC-046). Hecho en `src/modules/didactic-content/render/index.ts`, con el texto editable de un bloque (`# ` encabezado, `- ` lista); 18 casos
- [X] T053 [US3] Implementar la generación del temario tema a tema con `prompts/topic/v1.md`: estimación y presupuesto disponible mostrados antes de cada solicitud, incluida la reanudación; estimación separada del coste máximo reservado; ninguna operación enviada sin una reserva dentro de los límites; reserva por tema, temas terminados como borradores, pendientes o fallidos identificados, estado `incomplete`, y reanudación explícita que solo procesa pendientes o fallidos; pruebas en `tests/unit/didactic-content/syllabus-generation.test.ts`; un tema es `failed` si la operación termina con error o la propuesta no supera el esquema y las comprobaciones (FR-019): el resultado inválido no se guarda ni sustituye un borrador válido, no hay reintentos automáticos, cada nuevo intento explícito reserva de nuevo y una operación incierta no se reenvía (SC-005). Hecho en `src/modules/didactic-content/syllabus.ts`; la generación se ejecuta dentro de la petición, tema a tema; 21 casos
- [X] T054 [US3] Implementar la edición de temas con control de revisión y conflicto 409 que conserva lo enviado, y la aprobación de cada tema (exige índice aprobado y vigente) y su rechazo con motivo obligatorio, sin borrar ni regenerar; la vigencia de `TopicApproval` se deriva de `topic_revision` y de su `OutlineApproval`; pruebas en `tests/unit/didactic-content/topic-approval.test.ts`. Hecho; la edición es bloque a bloque (añadir, editar, reordenar y quitar, sin borrar); 31 casos
- [X] T055 [US3] Implementar la aprobación de la versión: exige índice aprobado y vigente, todos los temas desarrollados y aprobados, y cada requisito del inventario citado por un bloque `requirement` y desarrollado por al menos un bloque `development`; guarda una instantánea inmutable con `content_sha256`; pruebas en `tests/unit/didactic-content/syllabus-version.test.ts`. Hecho; la aprobación lleva una huella del estado mostrado y se rechaza con 409 si el temario cambió; 15 casos
- [X] T056 [US3] Crear las páginas `src/pages/syllabus/` (estimación y lanzamiento, progreso y estado incompleto, reanudar, tema junto a su fuente normativa, edición, conflicto con ambas versiones, aprobación de tema y de versión con pendientes). Hecho en `src/pages/syllabus/[id].ts` y `src/pages/topics/`, con las vistas en `src/views/syllabus.ts`
- [X] T057 [P] [US3] Crear las páginas `src/pages/budget/` (consulta para `teacher`; modificación del límite y conciliación de operaciones inciertas solo para `admin`, con registro de actor, fecha, valor anterior y nuevo). Hecho en `src/pages/budget/` y `src/pages/api/budget/`; la consulta admite el perfil de docente o el de administración
- [X] T058 [US3] Implementar la comprobación de referencias heredadas tras un documento sustituto (`ReferenceCheck`), hecha por un docente referencia a referencia, que bloquea la aprobación del índice (T046) y de los temas mientras quede alguna sin comprobar; pruebas en `tests/unit/didactic-content/reference-check.test.ts`. Hecho en `src/modules/didactic-content/references.ts`; sustituye el bloqueo total de la fase 5: el índice y los temas de un documento con sustituto se conservan sin poder editarse, y se aprueban de nuevo tras comprobar cada referencia; 9 casos
- [X] T059 [US3] Escribir `tests/integration/us3-syllabus-approval.test.ts` con los escenarios 1 a 10 de la historia 3, la invalidación por cada tipo de edición del índice (SC-028), el límite de coste y la reanudación (SC-032), el presupuesto por perfil (SC-037) y el rechazo de interpretación, índice y tema (SC-041). Hecho, con 19 casos; el consumo se simula con una reserva preparada, porque el adaptador determinista no cuesta nada

**Checkpoint**: aprobar una versión; ver límite, reanudación, conflicto e invalidación.
Verificado con pruebas automáticas y con un navegador real: ver [us3-check.md](./us3-check.md).

---

## Phase 7: User Story 4 — Exportación y descarga (Priority: P1)

**Goal**: previsualizar, exportar, validar y descargar el paquete con sus instrucciones.

**Independent Test**: con una versión aprobada, el docente descarga el paquete, comprueba su
huella y lo abre sin conexión.

- [X] T060 [P] [US4] Crear la migración y el repositorio de `Export` (`status`: `succeeded`, `failed`) y `Download` en `src/modules/content-export/`
- [X] T061 [P] [US4] Escribir el contenido del paquete en `src/modules/content-export/package/`: `index.html` con todos los temas mediante el renderizador de T052, `assets/style.css` y `assets/app.js` con la navegación y el envoltorio mínimo de la API de SCORM 1.2, sin URL externas
- [X] T062 [US4] Escribir `tests/contract/scorm-runtime.contract.test.ts` con `jsdom` y un doble de la API que aplica los límites del formato: inicio, `lesson_location`, `suspend_data` con mapa de bits, `exit=suspend`, `completed` solo tras «Finalizar», nunca `score` ni `passed`, ausencia de API con aviso, estado de otra versión descartado (SC-017)
- [X] T063 [US4] Implementar el generador en `src/modules/content-export/build.ts`: manifiesto desde plantilla con escapado e identificador de versión, ZIP con `fflate` de entradas ordenadas y fechas fijas, máximo de 200 temas, huella SHA-256 del fichero final, sin datos de usuarios
- [X] T064 [US4] Implementar la comprobación del paquete en `src/modules/content-export/conformance.ts` y `src/modules/content-export/xml.ts`, releyendo el ZIP: lectura del manifiesto con libxml2 (`libxml2-wasm`), un analizador estricto, mantenido y ajeno al generador, sin recuperación, DTD, XInclude ni recursos externos, en la que cualquier error o aviso es un rechazo y los recursos se liberan también ante fallos; reglas del perfil SCORM 1.2 que exporta AulaNorma, separadas del análisis sintáctico; pruebas de XML mal formado, espacios de nombres, referencias, rutas y recursos en `tests/unit/content-export/xml.test.ts` y `tests/contract/scorm-package.contract.test.ts`; y `specs/002-boe-scorm-export/package-validation.md` con lo que comprueba cada mecanismo y lo que queda fuera. No equivale a validar contra los XSD ni acredita conformidad completa con SCORM; la aceptación exige la prueba en Moodle (T079). **Entregable anterior, sustituido el 2026-10-08**: «validación del manifiesto contra los XSD oficiales con `xmllint-wasm` (XSD en `tests/fixtures/scorm/xsd/` y en el recurso de ejecución, con su procedencia) y las reglas que los esquemas no expresan»; no se realizó, por no poder acreditarse las condiciones de uso de los esquemas ([scorm-schemas.md](./scorm-schemas.md); research R8)
- [ ] T065 [US4] Escribir `tests/contract/scorm-package.contract.test.ts`: manifiestos y paquetes incorrectos hechos a mano que deben rechazarse, un paquete SCORM 1.2 de referencia no generado por AulaNorma que debe aceptarse, equivalencia entre dos exportaciones de la misma versión (SC-014), ausencia de URL externas, credenciales y datos de usuarios (SC-012, SC-015). **Parcial**: ya no depende de los XSD (research R8). La referencia ajena es el manifiesto SCORM 1.2 de `adapt-contrib-spoor`, sin modificar; un paquete completo publicado por un tercero sigue pendiente
- [X] T066 [US4] Implementar exportar y descargar: exigen versión vigente y cobertura completa en cada petición, registran cada intento, no dejan fichero tras un fallo y deniegan la descarga de paquetes de versiones invalidadas, también con enlaces antiguos; pruebas en `tests/unit/content-export/export-download.test.ts`
- [X] T067 [US4] Redactar las instrucciones de incorporación manual en `src/modules/content-export/instructions/`, en español claro, declarando que todavía no se ha comprobado ninguna versión de Moodle y que sustituir un paquete ya importado corresponde al usuario
- [X] T068 [US4] Crear las páginas `src/pages/export/` (vista previa con aviso de que no acredita el seguimiento, exportar, huella, descarga del paquete y de las instrucciones, historial de exportaciones y descargas)
- [X] T069 [US4] Escribir `tests/integration/us4-export-download.test.ts` con los escenarios 1 a 8 de la historia 4, la ausencia de cualquier operación de borrado (SC-031) y todas las vías de exportación con cobertura incompleta (SC-025)

**Checkpoint**: recorrido completo con el adaptador determinista, registrado como ensayo.

---

## Phase 8: Despliegue del piloto y copia de seguridad

**Purpose**: dejar el piloto accesible por HTTPS desde otros equipos, con datos persistentes
y copia restaurable. No se toca ningún servidor hasta T074.

T070 a T073 están hechas sin dominio, servidor ni credenciales: los scripts y sus pruebas se
han ejecutado en local y en la integración continua, y el procedimiento de
`docs/engineering/deployment.md` **no se ha ejecutado en ningún servidor**. La evidencia
está en [`deploy-check.md`](./deploy-check.md). El despliegue, el acceso por HTTPS y la
restauración probada en el destino siguen siendo T074.

- [X] T070 [P] Crear `scripts/ops/backup.mjs`: copia en línea de la base con `backup`, después copia del almacén de ficheros, verificación en la propia copia de que cada referencia de la instantánea tiene su fichero con la huella correcta (si no, la copia se marca como fallida), y registro con fecha, tamaño y huella
- [X] T071 [P] Crear `scripts/ops/verify-restore.mjs`: restaura en un directorio limpio, ejecuta la verificación de integridad de SQLite, comprueba que cada fichero referenciado existe y coincide con su huella, revoca todas las sesiones y confirma que las generaciones enviadas y sin liquidar figuran como inciertas
- [X] T072 Escribir `tests/integration/backup-restore.test.ts`, que hace una copia con escrituras, una exportación y una generación enviada en curso, la restaura y comprueba referencias, huellas, sesiones revocadas y operaciones inciertas (SC-040); incluye el caso de un fichero publicado sin referencia, que no debe hacer fallar la copia
- [X] T073 Escribir `docs/engineering/deployment.md`: cuenta de sistema sin privilegios, servicio propio, directorio de datos, fichero de entorno, proxy inverso con TLS y HSTS que reenvía a `127.0.0.1:3000`, origen público, límites de tamaño coherentes, copia y restauración, y los límites de SQLite y del estado *release candidate* de `node:sqlite`
- [ ] T074 ⛔ BLOQUEADA (dominio y servidor de destino) Desplegar el piloto siguiendo `docs/engineering/deployment.md`, sin modificar los servicios existentes, medir el coste de `scrypt` en el destino y registrar una copia con su restauración probada

**Checkpoint**: acceso por HTTPS desde otro equipo y una restauración comprobada.

---

## Phase 9: Proveedor real de generación

**Purpose**: sustituir las respuestas simuladas por generación real. Toda la fase depende de
una decisión que el mantenedor no ha tomado. No se instala ningún SDK ni se hace ninguna
llamada de pago antes.

- [ ] T075 ⛔ BLOQUEADA (proveedor, modelo, moneda, precios y presupuesto, con cuenta de API) Registrar la elección y su justificación en `specs/002-boe-scorm-export/research.md` (R6) y en el ADR 0004 mientras siga Propuesto, y justificar la dependencia nueva en `plan.md`
- [ ] T076 ⛔ BLOQUEADA (T075) Implementar el adaptador real en `src/platform/generation/adapters/`, con la clave leída de la configuración y nunca registrada, los precios por modelo en configuración, y las mismas pruebas de contrato de T035 ejecutadas a mano; resolver o validar con tiempos reales que la generación del índice y del temario se ejecute dentro de la petición (limitación registrada en `us3-check.md`)
- [ ] T077 ⛔ BLOQUEADA (T076) Fijar el límite del proyecto con el perfil `admin`, generar la interpretación, el índice y el temario de UF0517, y registrar el coste real y la calidad observada sin darla por aceptada

---

## Phase 10: User Story 5 — Moodle real y aceptación (Priority: P2)

**Goal**: comprobar el paquete en una instancia real y cerrar la aceptación.

**Independent Test**: el paquete del piloto, incorporado siguiendo solo las instrucciones, se
recorre, se abandona, se reanuda y se finaliza con un alumno de prueba.

- [X] T078 [US5] Crear `specs/002-boe-scorm-export/acceptance.md` con una fila por criterio (SC-001 a SC-041), todos en «Pendiente», y la plantilla de evidencia de la parte 3 de `quickstart.md`
- [ ] T079 [US5] ⛔ BLOQUEADA (Moodle de pruebas y su versión) Ejecutar la parte 3 de `quickstart.md` y registrar en `acceptance.md` la versión exacta de Moodle, la configuración de la actividad, la fecha, la huella del paquete y el resultado de cada paso (SC-018 a SC-023), incluidos los fallidos
- [ ] T080 [US5] ⛔ BLOQUEADA (T079) Actualizar las instrucciones de T067 para nombrar únicamente la versión y la configuración verificadas
- [ ] T081 ⛔ BLOQUEADA (T074, T077 y T079) Ejecutar el recorrido funcional de la parte 2 de `quickstart.md` por HTTPS y con el proveedor real, y registrar en `acceptance.md` quién lo ejecuta y con qué perfil (SC-024); un recorrido con respuestas simuladas se anota como ensayo, no como aceptación

---

## Phase 11: Polish y cierre

Estado a 2026-10-08. T083, T084, T085 y T087 están hechas. **T082 está empezada y no se
cierra**: [`accessibility.md`](./accessibility.md) registra lo comprobado por lectura del
marcado, pruebas automáticas y cálculo de contraste, con tres defectos corregidos; falta la
evaluación con teclado, lector de pantalla y ampliación en navegadores reales, en la
interfaz y en el paquete, con el recorrido de
[`accessibility-walkthrough.md`](./accessibility-walkthrough.md). La caducidad por
inactividad avisa y se puede ampliar, y al acercarse la duración máxima la autenticación se
renueva en la propia página (fase 12). WCAG 2.2.1 sigue sin declararse cumplido: faltan sus
evidencias manuales y quedan puntos abiertos ([`session-limits.md`](./session-limits.md)). **T086 no se
ha ejecutado**: es la última, y no se completa mientras T082 siga abierta y T065 pendiente.
T085 expone las métricas en una página de administración; su alcance y sus límites están en
la propia página y en `docs/engineering/architecture.md`.

- [ ] T082 [P] Ejecutar la lista de comprobación WCAG 2.2 AA sobre la interfaz y sobre el paquete, registrarla en `specs/002-boe-scorm-export/accessibility.md` y corregir lo que falle
- [X] T083 [P] Revisar todos los textos de interfaz, errores e instrucciones: español claro, sin jerga, sin afirmar compatibilidad, calificación, acreditación ni evaluación pedagógica
- [X] T084 [P] Actualizar `README.md`, `docs/engineering/architecture.md` y `docs/engineering/quality-controls.md` con la estructura y los controles nuevos
- [X] T085 Ampliar `tests/architecture/no-domain-specifics.test.ts` para las áreas y módulos nuevos (SC-045), y añadir las métricas mínimas del principio XI (errores, latencia, coste de generación y estado de exportaciones) a partir de los registros existentes
- [ ] T086 Ejecutar `npm run check` y `npm run verify:negative`, y completar en `acceptance.md` los criterios automáticos con su evidencia, dejando en «Pendiente» los que dependan de tareas bloqueadas; esta tarea no cierra la aceptación mientras quede alguna
- [X] T087 Crear `src/pages/history/` con el historial consultable de cada elemento (correcciones, validaciones, aprobaciones, rechazos con su motivo, generaciones, exportaciones y descargas) para `teacher` y `admin`, con pruebas en `tests/integration/history.test.ts`

---

## Phase 12: Límites de tiempo de la sesión

**Purpose**: que ningún límite de tiempo de la sesión haga perder trabajo sin aviso ni
salida (FR-071 a FR-073; WCAG 2.2.1), sin debilitar la revocación. Decisiones del mantenedor
del 2026-10-08. No depende de datos externos.

- [X] T088 Aviso accesible antes de la caducidad por inactividad y ampliación expresa en `src/platform/identity`, `src/platform/web` y `src/pages/api/session/extend.ts`, con pruebas en `tests/unit/platform/identity.test.ts`, `tests/contract/session.contract.test.ts` y `tests/contract/session-warning.contract.test.ts` (FR-071, SC-047)
- [X] T089 Renovación de la autenticación en `src/platform/identity` y `src/pages/api/session/renew.ts`: sesión nueva y revocación de la anterior en una transacción, control de intentos de la entrada, comprobación repetida tras verificar la contraseña y registro sin secretos; migración `0010_session_renewal` (FR-072, SC-048)
- [X] T090 Interfaz y pestañas en `src/platform/web`: formulario de renovación, testigo nuevo en los formularios sin recargar, coordinación entre pestañas sin secretos en el almacenamiento local, peticiones con la sesión o el testigo anteriores devueltas para repetirlas, acciones rechazadas que no cuentan como actividad y formulario de entrada que pide un testigo vigente al enviarse (FR-071, FR-073, SC-047, SC-048)
- [ ] T091 Recorrer a mano el aviso, la ampliación y la renovación con teclado, lector de pantalla y ampliación, siguiendo la parte B de `accessibility-walkthrough.md`, y registrar el resultado en `accessibility.md`; forma parte de T082 y decide si WCAG 2.2.1 puede declararse cumplido

**Checkpoint**: con el reloj reducido en un ensayo, la sesión se amplía y se renueva sin
perder lo escrito en dos pestañas. La evidencia automática y la del ensayo están en
`session-limits.md`; la manual, pendiente.

---

## Dependencies & Execution Order

Correspondencia con el plan: las fases 1 a 10 son los pasos 2 a 11 de plan.md.

**Antes de cualquier tarea**: esta especificación integrada, con su plan y el ADR 0004, y la
lista `checklists/pilot-readiness.md` revisada.

### Puntos abiertos de la lista de calidad

Ninguno. Eran huecos de la especificación, no tareas de código, y cada uno se cerró con una
corrección documental antes de la fase que lo necesitaba: CHK007 (conflicto de edición: FR-063
y SC-033) y CHK047 (criterios SC-044, SC-045 y SC-046, y SC-015 para FR-029), antes de la
fase 4; y CHK032 (tema fallido, sin reintentos automáticos y nuevo intento explícito: FR-019,
FR-066, SC-005 y SC-032), antes de la fase 6. Ver las revisiones de
`checklists/pilot-readiness.md`. Cerrar un punto acredita su redacción, no una prueba.

- **Fase 1** no depende de ninguna otra tarea. **Fase 2** puede hacerse a la vez.
- **Fase 3**, completada, dependía de las fases 1 y 2.
- **Fase 4**, completada, dependía de la fase 3.
- **Fase 5**, completada, dependía de la fase 4; incluye T049 y T050, adelantadas de la fase 6.
- **Fase 6**, completada, dependía de la fase 5.
- **Fases 4 → 5 → 6 → 7** van en ese orden: cada historia usa lo aprobado en la anterior.
- **T058** se apoya en T040 y condiciona la aprobación de T046 y T054 tras un sustituto.
- **Fase 8**: T070 a T073, completadas, dependían de T014 a T016; T072, además, de T050 y T066. T074 sigue bloqueada.
- **Fase 9** depende de la fase 6 y de su dato.
- **Fase 10**: T078 está hecha; el resto depende de la fase 7 y de sus datos.
- **Fase 11**: T082 a T085 y T087 dependen de la fase 7; T086 es la última.
- **Fase 12**: T088 a T090, completadas, dependían de los cimientos de identidad (T020 a
  T028). T091 forma parte de T082.

### Qué puede ejecutarse y qué no

Que una tarea no necesite un dato externo no basta: tampoco puede empezar si depende de otra
bloqueada.

| Estado                                        | Tareas                                                                 |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Completadas                                   | T001–T064, T066–T073, T078, T083–T085, T087–T090                       |
| Empezada, sin cerrar                          | T082 (falta la evaluación con tecnología de apoyo), con T091           |
| Ejecutable cuando T082 y T065 se cierren      | T086                                                                   |
| Abierta por la referencia ajena               | T065 (falta un paquete completo de un tercero)                         |
| Bloqueada por el dominio y el servidor        | T074                                                                   |
| Bloqueadas por el proveedor de generación     | T075; y por depender de ella, T076 y T077                              |
| Bloqueadas por el Moodle de pruebas           | T079; y por depender de ella, T080                                     |
| Bloqueada por las tres anteriores             | T081, que depende de T074, T077 y T079                                 |

De las 91 tareas, 80 están completadas, 2 son la evaluación manual de accesibilidad, empezada y sin cerrar (T082 y T091), 1 espera a que se cierren T082 y T065 (T086), 1 está abierta a falta de un
paquete de referencia completo de un tercero (T065) y 7 están bloqueadas. T086 no cierra la aceptación mientras quede alguna bloqueada. Ninguna evidencia
de las tareas bloqueadas se simula: el recorrido con respuestas deterministas se registra
como ensayo.

### Decisiones tomadas y pendientes tras la viabilidad

Salen de [feasibility.md](./feasibility.md). No son tareas de código.

| Asunto                                                                     | Estado                                   |
| -------------------------------------------------------------------------- | ---------------------------------------- |
| Campo de firma digital pasivo                                              | Admitido por su estructura               |
| Método de detección de contenido activo                                    | qpdf JSON versión 2 y política propia    |
| Ubicación de los datos del piloto                                          | `specs/002-boe-scorm-export/`            |
| Instalación de qpdf en la integración continua, en Linux y en macOS        | Hecha en T032, como herramienta verificada |
| Instalación de qpdf en el servidor de destino                              | Pendiente; se resuelve en T074           |
| Origen de referencia y redistribución de los esquemas de SCORM 1.2         | Sin objeto: XSD sustituidos (R8)         |
| Límite de memoria total y corte de red de los procesos de análisis         | Pendiente; fase 8                        |

### Parallel Opportunities

- Fase 2: T010 y T011 a la vez que T007 y T008.
- Fase 3: T015 y T017 junto a T014 y T016; T020, T021 y T023 junto a T018 y T019.
- Fase 4: T031, T034 y T035 a la vez.
- Fase 6: T051 primero; T057 junto a T056.
- Fase 7: T060 y T061 a la vez.
- Fase 8: T070 y T071 a la vez.

## Implementation Strategy

### Primeras entregas

1. **Migración** (fase 1): un PR mecánico.
2. **Viabilidad** (fase 2): un informe; decide si se sigue con lo planificado.
3. **Cimientos con interfaz** (fase 3): dos o tres PR; al terminar se puede entrar, ver una
   página y salir.
4. **Historia 1** (fase 4): primer recorrido visible con un PDF.
5. **Historia 2** (fase 5): índice, cobertura y aprobación, con el presupuesto de generación.
6. **Historia 3** (fase 6): temario, aprobaciones, páginas de presupuesto y referencias heredadas.

### Entrega incremental

Cada historia añade un tramo del recorrido y se puede probar desde el navegador con el
adaptador determinista. Al terminar la fase 7 existe un recorrido completo de ensayo. La
aceptación real exige además el despliegue, el proveedor real y Moodle.

### Reglas

- Un PR por grupo de tareas relacionadas, revisable en una sesión.
- Ninguna tarea bloqueada se sustituye por una simulación que se dé por buena.
- Una prueba que falla se arregla en el código o se corrige con justificación; no se repite
  hasta que pase.
- La evidencia de `specs/001-engineering-baseline/` no se modifica.
