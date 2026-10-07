# Data Model: Del PDF oficial del BOE al paquete SCORM (piloto UF0517)

**Fecha**: 2026-10-07 | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

Modelo lógico. Los nombres están en inglés, como el código. Cada tabla pertenece a un único
módulo; ningún módulo lee las tablas de otro, solo su API pública (principio II). Nada es
específico de UF0517: el código de la unidad es un dato.

## Reglas comunes

- **Identificadores**: opacos, generados por el sistema.
- **Revisión**: todo elemento editable tiene `revision`, un entero que aumenta en cada
  cambio. Guardar exige la revisión abierta; si no es la actual, se rechaza con conflicto
  (FR-063).
- **Vigencia derivada**: una validación o aprobación guarda las revisiones de lo que aprueba y
  de aquello en lo que se apoya. Está vigente solo mientras todas coinciden con las actuales.
  Nunca se actualiza ni se borra (research R5).
- **Sin borrado**: ninguna entidad tiene operación de borrado en el piloto (FR-052).
- **Ficheros**: un fichero se publica en el almacén, con su huella como nombre, antes de
  confirmar la transacción que lo referencia; después no cambia ni se borra (FR-069).
- **Referencia normativa**: `document_id`, `section`, `page_from`, `page_to` y `quote`
  opcional. Siempre apunta a un único documento (FR-067).

## Fuente normativa (`normative-source`)

| Entidad          | Campos principales                                                                                                                                  | Reglas                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `Document`       | `id`, `title`, `issuer`, `official_reference`, `source`, `obtained_on`, `version`, `sha256`, `page_count`, `replaces_document_id`, `registered_by` | Inmutable. `sha256` único. `replaces_document_id` crea la relación de sustitución (FR-003).     |
| `DocumentPage`   | `document_id`, `page_number`, `text`, `has_extractable_text`                                                                                        | Inmutable. Una fila por página, también si no tiene texto (FR-064).                             |
| `PageResolution` | `id`, `document_id`, `page_number`, `resolved_by`, `resolved_at`, `statement`                                                                       | Solo inserción. Confirma que la página está en blanco o es ajena a la unidad (FR-064).          |

El fichero PDF se guarda en el almacén de ficheros con su huella como nombre.

**Implementación (fase 4)**. `Document` guarda además `size_bytes`, `has_signature_field` y
`registered_at`, y `DocumentPage`, `has_images` (FR-064). Las tres tablas son de solo
inserción, impuesta por disparadores: no admiten modificar, borrar ni sustituir una fila.

## Interpretación estructurada (`structured-interpretation`)

| Entidad                    | Campos principales                                                                                                   | Reglas                                                                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Interpretation`           | `id`, `document_id`, `unit_code`, `unit_title`, `duration_hours`, `duration_reference`, `status`, `revision`         | Una por documento y unidad. La duración es un metadato, no un requisito (FR-061).                                                       |
| `Requirement`              | `id`, `interpretation_id`, `kind`, `parent_id`, `position`, `code`, `text`, referencia normativa, `origin`           | `kind`: `capability`, `criterion`, `content` o `subcontent`. `parent_id` conserva la jerarquía. Todos forman el inventario (FR-006).   |
| `Correction`               | `id`, `interpretation_id`, `requirement_id`, `author`, `at`, `before`, `after`                                       | Solo inserción. Cada corrección aumenta `Interpretation.revision` (FR-007).                                                             |
| `InterpretationValidation` | `id`, `interpretation_id`, `interpretation_revision`, `validated_by`, `validated_at`, `inventory_reviewed_statement` | Solo inserción. Exige todas las páginas sin texto resueltas y la confirmación de la revisión del inventario (FR-057, FR-064).           |

**Vigencia**: una validación está vigente si `interpretation_revision` es la revisión actual.
`Interpretation.status`: `in_review`, `validated` o `rejected`.

**Implementación (fase 4)**. `Interpretation` guarda la referencia de la duración como
`duration_section`, `duration_page` y `duration_quote`, la sección original de la unidad
(`section_page_from` y `section_page_to`, FR-057), la ejecución de generación de la que
procede, y quién y cuándo la pidió. `Requirement` lleva `withdrawn`: un requisito erróneo se
retira del inventario y no se borra (FR-052). `Correction` lleva `kind` (`edit`, `add`,
`withdraw` o `unit`) y la revisión a la que da lugar. El rechazo de una interpretación se
guarda en `interpretation_rejection`, con los campos de `Rejection`. Correcciones,
validaciones y rechazos son de solo inserción, impuesta por disparadores. Una interpretación
cuyo documento tiene un sustituto es histórico: se consulta, pero no se corrige ni se valida.

## Contenido didáctico (`didactic-content`)

| Entidad             | Campos principales                                                                                              | Reglas                                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `Outline`           | `id`, `interpretation_id`, `status`, `revision`                                                                 | El índice. `status`: `proposed`, `in_review`, `approved` o `rejected`. Cualquier cambio aumenta `revision` (FR-059).    |
| `OutlineEntry`      | `id`, `outline_id`, `position`, `title`, `unsupported`                                                          | `unsupported` marca «sin respaldo normativo» y exige no tener vínculos (FR-010, FR-012).                               |
| `EntryRequirement`  | `outline_entry_id`, `requirement_id`                                                                            | Vínculo explícito entre entrada y requisito. Varios por entrada (FR-058).                                              |
| `Topic`             | `id`, `outline_entry_id`, `status`, `revision`                                                                  | Uno por entrada. `status`: `pending`, `failed`, `draft`, `in_review`, `approved` o `rejected`.                         |
| `TopicBlock`        | `id`, `topic_id`, `position`, `kind`, `body`                                                                    | `kind`: `requirement` o `development`. `body` es contenido estructurado validado por esquema (research R7).            |
| `BlockRequirement`  | `topic_block_id`, `requirement_id`                                                                              | Un bloque `requirement` cita uno; un bloque `development` desarrolla uno o varios, o ninguno si no tiene respaldo.      |
| `OutlineApproval`   | `id`, `outline_id`, `outline_revision`, `interpretation_validation_id`, `approved_by`, `approved_at`            | Solo inserción. Exige cobertura completa del índice (FR-013).                                                           |
| `TopicApproval`     | `id`, `topic_id`, `topic_revision`, `outline_approval_id`, `approved_by`, `approved_at`                         | Solo inserción (FR-022).                                                                                                |
| `SyllabusVersion`   | `id`, `outline_approval_id`, `label`, `content_sha256`, `snapshot`, `approved_by`, `approved_at`                | Solo inserción. Instantánea inmutable del índice y de los temas aprobados; es lo que se exporta (FR-023, FR-053).      |
| `SyllabusVersionTopic` | `syllabus_version_id`, `topic_approval_id`                                                                   | Las aprobaciones de tema en las que se apoya la versión.                                                                |
| `Rejection`         | `id`, `target_kind`, `target_id`, `target_revision`, `rejected_by`, `rejected_at`, `reason`                     | Solo inserción. `target_kind`: `interpretation`, `outline` o `topic`. `reason` obligatorio (FR-070).                    |
| `ReferenceCheck`    | `id`, `target_kind`, `target_id`, `requirement_id`, `checked_by`, `checked_at`                                  | Solo inserción. Comprobación de una referencia heredada contra el documento sustituto (FR-067).                        |

**Implementación (fase 5)**. Hay un índice por interpretación. `Outline` guarda la ejecución
de generación de la que procede, y quién y cuándo lo pidió. `OutlineEntry` lleva `removed`:
una entrada quitada queda marcada, con su título y sus vínculos, y deja de contar (FR-052).
`unsupported` se deriva de no tener vínculos, y la base de datos impide que una entrada
marcada los tenga. Los vínculos de `EntryRequirement` se sustituyen al editar la entrada;
cada cambio queda en `outline_change` (`kind`: `add`, `edit`, `move` o `remove`), con el antes,
el después, su autor y la revisión a la que da lugar. Cambios, aprobaciones y rechazos son de
solo inserción, impuesta por disparadores. Un vínculo con un requisito retirado se conserva y
no cuenta. Un índice cuya interpretación pertenece a un documento con sustituto es histórico:
se consulta, pero no se cambia ni se aprueba, hasta que exista la comprobación de referencias
heredadas (T058). `Topic` y las entidades que dependen de él todavía no existen.

**Vigencia**:

- `OutlineApproval`: su `outline_revision` es la actual y su validación de la interpretación
  está vigente.
- `TopicApproval`: su `topic_revision` es la actual y su `OutlineApproval` está vigente. Por
  eso cualquier edición del índice deja sin vigencia todas las aprobaciones de temas.
- `SyllabusVersion`: su `OutlineApproval` y todas sus `TopicApproval` están vigentes.

**Cobertura** (calculada, nunca almacenada ni declarada por la generación):

- En el índice, un requisito está cubierto si tiene al menos un `EntryRequirement`. No hay
  herencia entre padre e hijos en ningún sentido (FR-058).
- En el temario, un requisito está desarrollado si lo cita un bloque `requirement` y lo
  desarrolla al menos un bloque `development` (FR-060).
- Una versión solo se crea si cada entrada tiene un tema aprobado y vigente y todo el
  inventario está cubierto y desarrollado.

**Rechazo**: deja el elemento en `rejected` con su contenido intacto. Editarlo o presentarlo
de nuevo lo devuelve a `in_review`. No borra nada ni inicia ninguna generación. Para la
interpretación, `Rejection` pertenece a `structured-interpretation`.

**Transiciones del índice**: `proposed → in_review → approved | rejected`; `rejected →
in_review`; cualquier edición de uno aprobado lo devuelve a `in_review`. Los temas y sus textos no cambian: quedan como
borradores hasta volver a aprobarse.

## Exportación (`content-export`)

| Entidad    | Campos principales                                                                                                   | Reglas                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Export`   | `id`, `syllabus_version_id`, `format`, `status`, `package_sha256`, `size_bytes`, `validation_result`, `by`, `at`     | Solo inserción. `status`: `succeeded` o `failed`. Un fallo no deja fichero (FR-037).                      |
| `Download` | `id`, `export_id`, `by`, `at`, `result`                                                                              | Solo inserción. Registra también las denegadas. Se concede solo si la versión está vigente (FR-062).      |

El paquete se guarda en el almacén de ficheros con su huella como nombre y se conserva aunque
deje de ofrecerse (FR-053). No contiene identidades de usuarios (FR-033).

## Plataforma (`src/platform`)

| Área         | Entidad             | Campos principales                                                                                                   | Reglas                                                                                    |
| ------------ | ------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `identity`   | `User`              | `id`, `username`, `password_hash`, `password_params`, `roles`, `disabled`, `must_change_password`                    | `roles` ⊆ {`admin`, `teacher`}; puede estar vacío. Sin correo ni nombre real.             |
| `identity`   | `Session`           | `id_hash`, `user_id`, `csrf_token`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`                         | Se guarda la huella del identificador. `user_id` vacío en la sesión previa de entrada.    |
| `identity`   | `SignInThrottle`    | `subject`, `failed_count`, `window_started_at`, `locked_until`                                                       | Contadores por cuenta y global para los intentos repetidos.                               |
| `audit`      | `AuditEvent`        | `id`, `at`, `actor_id`, `action`, `target_kind`, `target_id`, `result`, `correlation_id`, `details`                  | Solo inserción, impuesta por disparadores (FR-028). Sin secretos ni contenido.            |
| `generation` | `Budget`            | `project_limit`, `currency`, `revision`                                                                              | Fila única. Solo `admin` la modifica (FR-027).                                            |
| `generation` | `BudgetChange`      | `id`, `actor_id`, `at`, `previous_limit`, `new_limit`                                                                | Solo inserción (FR-028).                                                                  |
| `generation` | `GenerationRun`     | `id`, `kind`, `target_id`, `requested_by`, `status`, `estimated_cost`                                                | `kind`: `interpretation`, `outline` o `syllabus`. `status` incluye `incomplete` (FR-021). |
| `generation` | `GenerationCall`    | `id`, `run_id`, `provider`, `model`, `prompt_version`, `tokens_in`, `tokens_out`, `latency_ms`, `validation_result`  | Solo inserción. Lo que exige el principio IX.                                             |
| `generation` | `BudgetReservation` | `id`, `call_id`, `reserved_cost`, `settled_cost`, `state`, `sent_at`                                                 | `state`: `reserved`, `sent`, `settled`, `released` o `uncertain`.                         |
| `generation` | `Reconciliation`    | `id`, `reservation_id`, `actor_id`, `at`, `confirmed_cost`, `note`                                                   | Solo inserción. Cierra una reserva `uncertain`; solo `admin` (FR-021).                    |

**Implementación (fase 5)**. `BudgetReservation` se crea antes que la llamada, así que guarda
`run_id` y `task`, y recibe `call_id` al cerrarse; lleva además `created_at` y `closed_at`.
`Budget` nace con límite cero y moneda `XXX` (sin fijar). Los disparadores impiden borrar una
reserva, cambiar su importe y cualquier transición distinta de las de abajo. `BudgetChange` y
`Reconciliation` son de solo inserción.

**Presupuesto disponible** = `project_limit` − liquidado − reservado − incierto. El límite es
acumulado durante todo el piloto, sin reinicios; hay además un máximo por operación, en la
configuración. Una operación solo se envía si su reserva cabe; una reducción del límite no
altera las reservas existentes.

**Transiciones de una reserva**: `reserved → sent → settled`; `reserved → released` solo si
la operación no llegó a enviarse; `sent → uncertain` si no hay consumo confirmado o si el
proceso cae; `uncertain → settled` solo mediante una `Reconciliation`. Una reserva `sent` o
`uncertain` nunca se libera.

**Sesiones**: caducan por inactividad y por duración máxima; se revocan al cerrar sesión y al
cambiar la contraseña, los perfiles o el estado de la cuenta. Los perfiles se leen de `User`
en cada petición.

## Correspondencia con las entidades de la especificación

| Especificación                        | Modelo                                                              |
| ------------------------------------- | ------------------------------------------------------------------- |
| Documento oficial                     | `Document`, `DocumentPage`                                          |
| Página sin texto extraíble            | `DocumentPage.has_extractable_text`, `PageResolution`               |
| Requisito normativo, inventario       | `Requirement`                                                       |
| Interpretación                        | `Interpretation`, `Correction`, `InterpretationValidation`          |
| Índice                                | `Outline`, `OutlineEntry`, `EntryRequirement`                       |
| Cobertura                             | Calculada a partir de `EntryRequirement` y `BlockRequirement`       |
| Tema                                  | `Topic`, `TopicBlock`                                               |
| Versión del temario                   | `SyllabusVersion`                                                   |
| Aprobación                            | `OutlineApproval`, `TopicApproval`, `SyllabusVersion`               |
| Generación, presupuesto               | `GenerationRun`, `GenerationCall`, `Budget`, `BudgetReservation`    |
| Exportación                           | `Export`, `Download`                                                |
| Estado de seguimiento                 | No se almacena en AulaNorma: vive en el paquete y en Moodle         |
| Verificación de importación           | Evidencia documental en `specs/002-boe-scorm-export/`, no una tabla |
