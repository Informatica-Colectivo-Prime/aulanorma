// Persistencia (specs/002-boe-scorm-export: research.md, R1 y R11;
// data-model.md, «Reglas comunes»; ADR 0004). Módulo portable: `server.mjs` y
// los scripts de administración lo cargan directamente con Node.js, así que
// solo importa módulos incluidos en Node.js y usa sintaxis TypeScript
// borrable.
//
// Una base de datos SQLite en un único fichero, en modo WAL, y un almacén de
// ficheros direccionado por su huella SHA-256, ambos dentro del directorio de
// datos. Límites aceptados para el piloto: un único servidor, una única
// instancia y un único escritor; `node:sqlite` es *release candidate* en
// Node.js 24.
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { backup, DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

export interface Migration {
  readonly id: string;
  readonly sql: string;
}

const DATABASE_FILE = "aulanorma.db";
const BLOB_DIRECTORY = "blobs";
// Directorio, dentro del de datos, de los paquetes exportados: cada uno es
// `<identificador de la exportación>.zip`.
export const PACKAGE_DIRECTORY = "exports";
const PRIVATE_DIRECTORY = 0o700;
const PRIVATE_FILE = 0o600;
// Directorio de trabajo de una restauración, dentro de su destino.
const RESTORE_PREFIX = ".restore-";

function configure(db: Database): Database {
  db.exec(
    "PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; " +
      "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;",
  );
  return db;
}

// Abre la base de datos del directorio de datos, que crea si no existe, solo
// accesible para la cuenta del proceso.
export function openDatabase(dataDir: string): Database {
  mkdirSync(dataDir, { recursive: true, mode: PRIVATE_DIRECTORY });
  chmodSync(dataDir, PRIVATE_DIRECTORY);
  // Una restauración interrumpida deja su directorio de trabajo: sobre él no
  // se abre nada, ni se crea una base de datos vacía a su lado.
  if (readdirSync(dataDir).some((name) => name.startsWith(RESTORE_PREFIX))) {
    throw new Error(
      "El directorio de datos contiene una restauración sin terminar.",
    );
  }
  return configure(new DatabaseSync(`${dataDir}/${DATABASE_FILE}`));
}

// Base de datos en memoria, para las pruebas.
export function openMemoryDatabase(): Database {
  return configure(new DatabaseSync(":memory:"));
}

// Ejecuta el trabajo en una transacción de escritura. `BEGIN IMMEDIATE` toma
// el bloqueo de escritura al empezar: dos transacciones no pueden leer el
// mismo estado y escribir las dos.
export function transaction<Result>(db: Database, work: () => Result): Result {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function checksum(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

// Aplica en orden las migraciones pendientes, todas o ninguna, y devuelve los
// identificadores aplicados en esta llamada. Las ya aplicadas deben coincidir,
// en orden, identificador y contenido, con el principio de la lista: una
// migración aplicada no se edita ni se reordena.
export function migrate(
  db: Database,
  migrations: readonly Migration[],
): readonly string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migration (" +
      "position INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, " +
      "checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT",
  );
  return transaction(db, () => {
    const applied = db
      .prepare("SELECT id, checksum FROM schema_migration ORDER BY position")
      .all();
    if (applied.length > migrations.length) {
      throw new Error("La base de datos tiene migraciones desconocidas.");
    }
    applied.forEach((row, index) => {
      const expected = migrations[index];
      if (
        expected === undefined ||
        row.id !== expected.id ||
        row.checksum !== checksum(expected.sql)
      ) {
        throw new Error("Una migración ya aplicada no coincide con la lista.");
      }
    });
    const insert = db.prepare(
      "INSERT INTO schema_migration (position, id, checksum, applied_at) " +
        "VALUES (?, ?, ?, ?)",
    );
    const pending = migrations.slice(applied.length);
    pending.forEach((migration, offset) => {
      db.exec(migration.sql);
      insert.run(
        applied.length + offset + 1,
        migration.id,
        checksum(migration.sql),
        new Date().toISOString(),
      );
    });
    return pending.map((migration) => migration.id);
  });
}

// --- Migraciones de la plataforma ---
//
// Todas las migraciones están aquí, en una única lista ordenada, porque
// `server.mjs` las aplica antes de cargar Next.js y solo puede importar
// módulos portables. Cada tabla pertenece a un único módulo, que es el único
// que la consulta: `audit_event`, a `audit`; las de `0002`, a `identity`; las
// de `0003`, a la capa `normative-source`; las de `0004`, a
// `structured-interpretation`; las de `0005` y `0006`, a `generation`; y las
// de `0007` y `0008`, a la capa `didactic-content`.

const AUDIT_EVENT = `
CREATE TABLE audit_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  target_kind TEXT,
  target_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('ok', 'denied', 'failed')),
  correlation_id TEXT NOT NULL,
  details TEXT NOT NULL
) STRICT;
CREATE TRIGGER audit_event_no_update BEFORE UPDATE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;
CREATE TRIGGER audit_event_no_delete BEFORE DELETE ON audit_event
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;
CREATE TRIGGER audit_event_no_replace BEFORE INSERT ON audit_event
WHEN EXISTS (SELECT 1 FROM audit_event WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_event is append-only');
END;
`;

const IDENTITY = `
CREATE TABLE user_account (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_params TEXT NOT NULL,
  roles TEXT NOT NULL,
  disabled INTEGER NOT NULL CHECK (disabled IN (0, 1)),
  must_change_password INTEGER NOT NULL CHECK (must_change_password IN (0, 1)),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE session (
  id_hash TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user_account (id),
  csrf_token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX session_user ON session (user_id);
CREATE TABLE sign_in_throttle (
  subject TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL,
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL
) STRICT;
`;

// Disparadores que hacen una tabla de solo inserción: ni `UPDATE` ni
// `DELETE`. Un `INSERT OR REPLACE` borra la fila anterior sin activar el
// disparador de borrado: lo impide un tercer disparador, que rechaza la
// inserción si ya existe la fila que identifica la expresión `existing`.
function appendOnly(table: string, existing?: string): string {
  const abort = `BEGIN SELECT RAISE(ABORT, '${table} is append-only'); END;`;
  return (
    `CREATE TRIGGER ${table}_no_update BEFORE UPDATE ON ${table} ${abort}\n` +
    `CREATE TRIGGER ${table}_no_delete BEFORE DELETE ON ${table} ${abort}\n` +
    (existing === undefined
      ? ""
      : `CREATE TRIGGER ${table}_no_replace BEFORE INSERT ON ${table} ` +
        `WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${existing}) ${abort}\n`)
  );
}

// Fuente normativa (data-model.md). El documento y sus páginas son
// inmutables; una resolución de página solo se inserta.
const NORMATIVE_SOURCE = `
CREATE TABLE document (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL,
  official_reference TEXT NOT NULL,
  source TEXT NOT NULL,
  obtained_on TEXT NOT NULL,
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  page_count INTEGER NOT NULL,
  has_signature_field INTEGER NOT NULL CHECK (has_signature_field IN (0, 1)),
  replaces_document_id TEXT REFERENCES document (id),
  registered_by TEXT NOT NULL,
  registered_at INTEGER NOT NULL
) STRICT;
CREATE TABLE document_page (
  document_id TEXT NOT NULL REFERENCES document (id),
  page_number INTEGER NOT NULL CHECK (page_number >= 1),
  text TEXT NOT NULL,
  has_extractable_text INTEGER NOT NULL CHECK (has_extractable_text IN (0, 1)),
  has_images INTEGER NOT NULL CHECK (has_images IN (0, 1)),
  PRIMARY KEY (document_id, page_number)
) STRICT;
CREATE TABLE page_resolution (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  resolved_by TEXT NOT NULL,
  resolved_at INTEGER NOT NULL,
  statement TEXT NOT NULL,
  UNIQUE (document_id, page_number),
  FOREIGN KEY (document_id, page_number)
    REFERENCES document_page (document_id, page_number)
) STRICT;
${appendOnly("document", "id = NEW.id OR sha256 = NEW.sha256")}
${appendOnly("document_page", "document_id = NEW.document_id AND page_number = NEW.page_number")}
${appendOnly("page_resolution", "id = NEW.id OR (document_id = NEW.document_id AND page_number = NEW.page_number)")}
`;

// Interpretación estructurada (data-model.md). La interpretación y sus
// requisitos se editan con control de revisión; correcciones, validaciones y
// rechazos solo se insertan. Nada se borra: un requisito erróneo se retira.
const STRUCTURED_INTERPRETATION = `
CREATE TABLE interpretation (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  unit_code TEXT NOT NULL,
  unit_title TEXT NOT NULL,
  duration_hours INTEGER CHECK (duration_hours IS NULL OR duration_hours >= 1),
  duration_section TEXT NOT NULL,
  duration_page INTEGER,
  duration_quote TEXT,
  section_page_from INTEGER NOT NULL,
  section_page_to INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('in_review', 'validated', 'rejected')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  generation_run_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (document_id, unit_code),
  CHECK (section_page_from >= 1 AND section_page_to >= section_page_from)
) STRICT;
CREATE TRIGGER interpretation_no_delete BEFORE DELETE ON interpretation
BEGIN SELECT RAISE(ABORT, 'interpretation cannot be deleted'); END;
CREATE TABLE requirement (
  id TEXT PRIMARY KEY,
  interpretation_id TEXT NOT NULL REFERENCES interpretation (id),
  kind TEXT NOT NULL
    CHECK (kind IN ('capability', 'criterion', 'content', 'subcontent')),
  parent_id TEXT REFERENCES requirement (id),
  position INTEGER NOT NULL,
  code TEXT NOT NULL,
  text TEXT NOT NULL,
  section TEXT NOT NULL,
  page_from INTEGER NOT NULL CHECK (page_from >= 1),
  page_to INTEGER NOT NULL,
  quote TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('generated', 'correction')),
  withdrawn INTEGER NOT NULL CHECK (withdrawn IN (0, 1)),
  CHECK (page_to >= page_from)
) STRICT;
CREATE INDEX requirement_interpretation ON requirement (interpretation_id);
CREATE TRIGGER requirement_no_delete BEFORE DELETE ON requirement
BEGIN SELECT RAISE(ABORT, 'requirement cannot be deleted'); END;
CREATE TABLE correction (
  id TEXT PRIMARY KEY,
  interpretation_id TEXT NOT NULL REFERENCES interpretation (id),
  requirement_id TEXT REFERENCES requirement (id),
  kind TEXT NOT NULL CHECK (kind IN ('edit', 'add', 'withdraw', 'unit')),
  author TEXT NOT NULL,
  at INTEGER NOT NULL,
  before TEXT NOT NULL,
  after TEXT NOT NULL,
  resulting_revision INTEGER NOT NULL
) STRICT;
CREATE TABLE interpretation_validation (
  id TEXT PRIMARY KEY,
  interpretation_id TEXT NOT NULL REFERENCES interpretation (id),
  interpretation_revision INTEGER NOT NULL,
  validated_by TEXT NOT NULL,
  validated_at INTEGER NOT NULL,
  inventory_reviewed_statement TEXT NOT NULL
) STRICT;
CREATE TABLE interpretation_rejection (
  id TEXT PRIMARY KEY,
  interpretation_id TEXT NOT NULL REFERENCES interpretation (id),
  interpretation_revision INTEGER NOT NULL,
  rejected_by TEXT NOT NULL,
  rejected_at INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0)
) STRICT;
${appendOnly("correction", "id = NEW.id")}
${appendOnly("interpretation_validation", "id = NEW.id")}
${appendOnly("interpretation_rejection", "id = NEW.id")}
`;

// Generación (data-model.md). Una ejecución cambia de estado; cada llamada
// solo se inserta. Los importes son enteros, en millonésimas de la moneda.
const GENERATION = `
CREATE TABLE generation_run (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('interpretation', 'outline', 'syllabus')),
  target_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  status TEXT NOT NULL
    CHECK (status IN ('running', 'succeeded', 'failed', 'incomplete')),
  estimated_cost INTEGER NOT NULL CHECK (estimated_cost >= 0),
  finished_at INTEGER
) STRICT;
CREATE TRIGGER generation_run_no_delete BEFORE DELETE ON generation_run
BEGIN SELECT RAISE(ABORT, 'generation_run cannot be deleted'); END;
CREATE TABLE generation_call (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES generation_run (id),
  at INTEGER NOT NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  estimated_cost INTEGER NOT NULL CHECK (estimated_cost >= 0),
  validation_result TEXT NOT NULL CHECK (
    validation_result IN
      ('valid', 'invalid_output', 'provider_error', 'rejected_by_domain')
  )
) STRICT;
${appendOnly("generation_call", "id = NEW.id")}
`;

// Presupuesto de generación (data-model.md; contracts/generation-provider.md).
// Una única fila de presupuesto, con el límite acumulado del proyecto. Cada
// operación reserva su coste máximo antes de enviarse. Los disparadores
// imponen el ciclo de una reserva: una liquidada o liberada no cambia más, una
// enviada o incierta nunca se libera, y su importe reservado no se modifica.
// La moneda `XXX` (ISO 4217, «sin moneda») indica que aún no está fijada: no
// hay proveedor seleccionado.
const BUDGET = `
CREATE TABLE budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  project_limit INTEGER NOT NULL CHECK (project_limit >= 0),
  currency TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1)
) STRICT;
INSERT INTO budget (id, project_limit, currency, revision)
VALUES (1, 0, 'XXX', 1);
CREATE TRIGGER budget_no_delete BEFORE DELETE ON budget
BEGIN SELECT RAISE(ABORT, 'budget cannot be deleted'); END;
CREATE TABLE budget_change (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  previous_limit INTEGER NOT NULL,
  new_limit INTEGER NOT NULL CHECK (new_limit >= 0)
) STRICT;
CREATE TABLE budget_reservation (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES generation_run (id),
  call_id TEXT,
  task TEXT NOT NULL,
  reserved_cost INTEGER NOT NULL CHECK (reserved_cost >= 0),
  settled_cost INTEGER CHECK (settled_cost IS NULL OR settled_cost >= 0),
  state TEXT NOT NULL
    CHECK (state IN ('reserved', 'sent', 'settled', 'released', 'uncertain')),
  created_at INTEGER NOT NULL,
  sent_at INTEGER,
  closed_at INTEGER,
  CHECK ((state = 'settled') = (settled_cost IS NOT NULL))
) STRICT;
CREATE INDEX budget_reservation_state ON budget_reservation (state);
CREATE TRIGGER budget_reservation_no_delete BEFORE DELETE ON budget_reservation
BEGIN SELECT RAISE(ABORT, 'budget_reservation cannot be deleted'); END;
CREATE TRIGGER budget_reservation_transition BEFORE UPDATE ON budget_reservation
WHEN OLD.state IN ('settled', 'released')
  OR NEW.reserved_cost <> OLD.reserved_cost
  OR NEW.id <> OLD.id
  OR NEW.run_id <> OLD.run_id
  OR (OLD.state = 'reserved' AND NEW.state NOT IN ('sent', 'released'))
  OR (OLD.state = 'sent' AND NEW.state NOT IN ('settled', 'uncertain'))
  OR (OLD.state = 'uncertain' AND NEW.state <> 'settled')
BEGIN SELECT RAISE(ABORT, 'budget_reservation transition not allowed'); END;
CREATE TABLE reconciliation (
  id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL UNIQUE REFERENCES budget_reservation (id),
  actor_id TEXT NOT NULL,
  at INTEGER NOT NULL,
  confirmed_cost INTEGER NOT NULL CHECK (confirmed_cost >= 0),
  note TEXT NOT NULL
) STRICT;
${appendOnly("budget_change", "id = NEW.id")}
${appendOnly("reconciliation", "id = NEW.id OR reservation_id = NEW.reservation_id")}
`;

// Índice del temario (data-model.md, «Contenido didáctico»). El índice y sus
// entradas se editan con control de revisión; los cambios, las aprobaciones y
// los rechazos solo se insertan. Nada se borra: una entrada quitada queda
// marcada. Los vínculos entre una entrada y sus requisitos sí se sustituyen al
// editarla, y cada cambio conserva el antes y el después. Sin claves ajenas
// hacia tablas de otra capa.
const OUTLINE = `
CREATE TABLE outline (
  id TEXT PRIMARY KEY,
  interpretation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL
    CHECK (status IN ('proposed', 'in_review', 'approved', 'rejected')),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  generation_run_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE TRIGGER outline_no_delete BEFORE DELETE ON outline
BEGIN SELECT RAISE(ABORT, 'outline cannot be deleted'); END;
CREATE TABLE outline_entry (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL REFERENCES outline (id),
  position INTEGER NOT NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  unsupported INTEGER NOT NULL CHECK (unsupported IN (0, 1)),
  removed INTEGER NOT NULL CHECK (removed IN (0, 1))
) STRICT;
CREATE INDEX outline_entry_outline ON outline_entry (outline_id);
CREATE TRIGGER outline_entry_no_delete BEFORE DELETE ON outline_entry
BEGIN SELECT RAISE(ABORT, 'outline_entry cannot be deleted'); END;
CREATE TABLE entry_requirement (
  outline_entry_id TEXT NOT NULL REFERENCES outline_entry (id),
  requirement_id TEXT NOT NULL,
  PRIMARY KEY (outline_entry_id, requirement_id)
) STRICT;
CREATE TRIGGER entry_requirement_supported BEFORE INSERT ON entry_requirement
WHEN EXISTS (
  SELECT 1 FROM outline_entry
  WHERE id = NEW.outline_entry_id AND unsupported = 1
)
BEGIN SELECT RAISE(ABORT, 'an unsupported entry has no requirements'); END;
CREATE TRIGGER outline_entry_unsupported BEFORE UPDATE ON outline_entry
WHEN NEW.unsupported = 1 AND EXISTS (
  SELECT 1 FROM entry_requirement WHERE outline_entry_id = NEW.id
)
BEGIN SELECT RAISE(ABORT, 'an unsupported entry has no requirements'); END;
CREATE TABLE outline_change (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL REFERENCES outline (id),
  entry_id TEXT NOT NULL REFERENCES outline_entry (id),
  kind TEXT NOT NULL CHECK (kind IN ('add', 'edit', 'move', 'remove')),
  author TEXT NOT NULL,
  at INTEGER NOT NULL,
  before TEXT NOT NULL,
  after TEXT NOT NULL,
  resulting_revision INTEGER NOT NULL
) STRICT;
CREATE TABLE outline_approval (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL REFERENCES outline (id),
  outline_revision INTEGER NOT NULL,
  interpretation_validation_id TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL
) STRICT;
CREATE TABLE rejection (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('outline', 'topic')),
  target_id TEXT NOT NULL,
  target_revision INTEGER NOT NULL,
  rejected_by TEXT NOT NULL,
  rejected_at INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0)
) STRICT;
${appendOnly("outline_change", "id = NEW.id")}
${appendOnly("outline_approval", "id = NEW.id")}
${appendOnly("rejection", "id = NEW.id")}
`;

// Temario (data-model.md, «Contenido didáctico»). Un tema por entrada del
// índice, con bloques de requisito y de desarrollo. Los temas y sus bloques se
// editan con control de revisión y no se borran: un bloque quitado queda
// marcado. Cambios, aprobaciones, versiones y comprobaciones de referencias
// solo se insertan. Un bloque de requisito cita exactamente un requisito, y
// la versión guarda una instantánea inmutable con su huella.
const SYLLABUS = `
CREATE TABLE topic (
  id TEXT PRIMARY KEY,
  outline_entry_id TEXT NOT NULL UNIQUE REFERENCES outline_entry (id),
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'failed', 'draft', 'in_review', 'approved', 'rejected')
  ),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  failure TEXT CHECK (
    failure IS NULL OR failure IN
      ('provider_error', 'invalid_output', 'rejected_by_domain', 'uncertain')
  ),
  last_call_id TEXT,
  created_at INTEGER NOT NULL,
  CHECK ((status = 'failed') = (failure IS NOT NULL))
) STRICT;
CREATE TRIGGER topic_no_delete BEFORE DELETE ON topic
BEGIN SELECT RAISE(ABORT, 'topic cannot be deleted'); END;
CREATE TABLE topic_block (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic (id),
  position INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('requirement', 'development')),
  body TEXT NOT NULL,
  removed INTEGER NOT NULL CHECK (removed IN (0, 1))
) STRICT;
CREATE INDEX topic_block_topic ON topic_block (topic_id);
CREATE TRIGGER topic_block_no_delete BEFORE DELETE ON topic_block
BEGIN SELECT RAISE(ABORT, 'topic_block cannot be deleted'); END;
CREATE TRIGGER topic_block_kind BEFORE UPDATE ON topic_block
WHEN NEW.kind <> OLD.kind OR NEW.topic_id <> OLD.topic_id
BEGIN SELECT RAISE(ABORT, 'topic_block kind cannot change'); END;
CREATE TABLE block_requirement (
  topic_block_id TEXT NOT NULL REFERENCES topic_block (id),
  requirement_id TEXT NOT NULL,
  PRIMARY KEY (topic_block_id, requirement_id)
) STRICT;
CREATE TRIGGER block_requirement_single BEFORE INSERT ON block_requirement
WHEN EXISTS (
  SELECT 1 FROM topic_block WHERE id = NEW.topic_block_id AND kind = 'requirement'
) AND EXISTS (
  SELECT 1 FROM block_requirement WHERE topic_block_id = NEW.topic_block_id
)
BEGIN SELECT RAISE(ABORT, 'a requirement block cites exactly one requirement'); END;
CREATE TABLE topic_change (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic (id),
  block_id TEXT REFERENCES topic_block (id),
  kind TEXT NOT NULL CHECK (kind IN ('generate', 'add', 'edit', 'move', 'remove')),
  author TEXT NOT NULL,
  at INTEGER NOT NULL,
  before TEXT NOT NULL,
  after TEXT NOT NULL,
  resulting_revision INTEGER NOT NULL
) STRICT;
CREATE TABLE topic_approval (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL REFERENCES topic (id),
  topic_revision INTEGER NOT NULL,
  outline_approval_id TEXT NOT NULL REFERENCES outline_approval (id),
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL
) STRICT;
CREATE TABLE syllabus_version (
  id TEXT PRIMARY KEY,
  outline_id TEXT NOT NULL REFERENCES outline (id),
  outline_approval_id TEXT NOT NULL REFERENCES outline_approval (id),
  label TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  snapshot TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at INTEGER NOT NULL,
  UNIQUE (outline_id, label)
) STRICT;
CREATE TABLE syllabus_version_topic (
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_version (id),
  topic_approval_id TEXT NOT NULL REFERENCES topic_approval (id),
  PRIMARY KEY (syllabus_version_id, topic_approval_id)
) STRICT;
CREATE TABLE reference_check (
  id TEXT PRIMARY KEY,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('outline', 'topic')),
  target_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  checked_by TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  UNIQUE (target_kind, target_id, requirement_id)
) STRICT;
${appendOnly("topic_change", "id = NEW.id")}
${appendOnly("topic_approval", "id = NEW.id")}
${appendOnly("syllabus_version", "id = NEW.id OR (outline_id = NEW.outline_id AND label = NEW.label)")}
${appendOnly("syllabus_version_topic", "syllabus_version_id = NEW.syllabus_version_id AND topic_approval_id = NEW.topic_approval_id")}
${appendOnly("reference_check", "id = NEW.id OR (target_kind = NEW.target_kind AND target_id = NEW.target_id AND requirement_id = NEW.requirement_id)")}
`;

// Exportación (data-model.md). Cada intento de exportar y cada intento de
// descarga se registran, también los fallidos y los denegados; nada se
// modifica ni se borra. Un intento fallido no tiene huella ni tamaño, porque
// no deja ningún fichero (FR-037 y FR-039).
const CONTENT_EXPORT = `
CREATE TABLE package_export (
  id TEXT PRIMARY KEY,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_version (id),
  format TEXT NOT NULL CHECK (format = 'scorm-1.2'),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  package_sha256 TEXT CHECK (
    package_sha256 IS NULL OR length(package_sha256) = 64
  ),
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes > 0),
  validation_result TEXT NOT NULL,
  exported_by TEXT NOT NULL,
  exported_at INTEGER NOT NULL,
  CHECK ((status = 'succeeded') = (package_sha256 IS NOT NULL)),
  CHECK ((status = 'succeeded') = (size_bytes IS NOT NULL))
) STRICT;
CREATE TABLE package_download (
  id TEXT PRIMARY KEY,
  export_id TEXT NOT NULL REFERENCES package_export (id),
  item TEXT NOT NULL CHECK (item IN ('package', 'instructions')),
  result TEXT NOT NULL CHECK (
    result IN ('granted', 'not_current', 'incomplete', 'unavailable')
  ),
  downloaded_by TEXT NOT NULL,
  downloaded_at INTEGER NOT NULL
) STRICT;
${appendOnly("package_export", "id = NEW.id")}
${appendOnly("package_download", "id = NEW.id")}
`;

export const PLATFORM_MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({ id: "0001_audit_event", sql: AUDIT_EVENT }),
  Object.freeze({ id: "0002_identity", sql: IDENTITY }),
  Object.freeze({ id: "0003_normative_source", sql: NORMATIVE_SOURCE }),
  Object.freeze({
    id: "0004_structured_interpretation",
    sql: STRUCTURED_INTERPRETATION,
  }),
  Object.freeze({ id: "0005_generation", sql: GENERATION }),
  Object.freeze({ id: "0006_budget", sql: BUDGET }),
  Object.freeze({ id: "0007_outline", sql: OUTLINE }),
  Object.freeze({ id: "0008_syllabus", sql: SYLLABUS }),
  Object.freeze({ id: "0009_content_export", sql: CONTENT_EXPORT }),
]);

// --- Almacén de ficheros direccionado por huella ---

const SHA256 = /^[0-9a-f]{64}$/;

function blobPath(dataDir: string, sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new Error("La huella no es un SHA-256 en hexadecimal.");
  }
  return `${dataDir}/${BLOB_DIRECTORY}/${sha256.slice(0, 2)}/${sha256}`;
}

// Sincroniza a disco un fichero ya escrito, o un directorio tras crear o
// renombrar una entrada en él.
export function syncToDisk(directory: string): void {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

// Crea, bajo `root`, los niveles que falten de una ruta relativa, y
// sincroniza a disco el directorio en el que aparece cada uno: sin eso, un
// directorio recién creado puede no sobrevivir a una caída, y con él lo que
// contenga.
export function ensureDirectory(root: string, relative: string): string {
  let current = root;
  for (const segment of relative.split("/")) {
    const next = `${current}/${segment}`;
    if (!existsSync(next)) {
      mkdirSync(next, { mode: PRIVATE_DIRECTORY });
      syncToDisk(current);
    }
    current = next;
  }
  return current;
}

// Publica el contenido y devuelve su huella. El fichero se escribe en un
// temporal del mismo directorio, se sincroniza a disco, se renombra a su
// huella y se sincroniza el directorio: quien después confirme una transacción
// que lo referencia sabe que ya está publicado. Un fichero publicado no se
// reescribe ni se borra. Si ya existía, pudo quedar a medio publicar por un
// proceso interrumpido entre renombrarlo y sincronizar: se sincroniza de
// nuevo antes de darlo por publicado.
export function putBlob(dataDir: string, content: Uint8Array): string {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const target = blobPath(dataDir, sha256);
  const directory = ensureDirectory(
    dataDir,
    `${BLOB_DIRECTORY}/${sha256.slice(0, 2)}`,
  );
  if (existsSync(target)) {
    syncToDisk(target);
    syncToDisk(directory);
    return sha256;
  }
  const temporary = `${directory}/.tmp-${randomBytes(8).toString("hex")}`;
  const descriptor = openSync(temporary, "wx", PRIVATE_FILE);
  try {
    let written = 0;
    while (written < content.length) {
      written += writeSync(descriptor, content, written);
    }
    fsyncSync(descriptor);
  } catch (error) {
    closeSync(descriptor);
    rmSync(temporary, { force: true });
    throw error;
  }
  closeSync(descriptor);
  renameSync(temporary, target);
  syncToDisk(directory);
  return sha256;
}

export function hasBlob(dataDir: string, sha256: string): boolean {
  return existsSync(blobPath(dataDir, sha256));
}

// Lee un fichero publicado y comprueba que su contenido coincide con su
// huella.
export function readBlob(dataDir: string, sha256: string): Buffer {
  const content = readFileSync(blobPath(dataDir, sha256));
  if (createHash("sha256").update(content).digest("hex") !== sha256) {
    throw new Error("El contenido del fichero no coincide con su huella.");
  }
  return content;
}

// --- Copia de seguridad y restauración (research.md, R11; FR-069) ---
//
// La copia es un directorio con una instantánea de la base de datos, los
// ficheros publicados y un registro, `backup.json`. Primero se copia la base
// con la operación `backup` de SQLite, sin detener el servicio, y después
// los ficheros: como un fichero se publica antes de referenciarse y no cambia,
// todo lo que la instantánea referencia ya estaba publicado. Lo publicado
// después sobra, pero no falta nada. La copia solo se da por buena si cada
// referencia de la instantánea tiene en la propia copia su fichero con la
// huella correcta.

const BACKUP_FORMAT = "aulanorma-backup-v1";
export const BACKUP_RECORD = "backup.json";

// Fichero que una fila de la base de datos da por publicado.
export interface FileReference {
  readonly kind: "document" | "package";
  readonly id: string;
  // Ruta relativa al directorio de datos.
  readonly path: string;
  readonly sha256: string;
}

export interface ReferenceProblem {
  readonly kind: FileReference["kind"];
  readonly id: string;
  readonly path: string;
  readonly problem: "missing" | "mismatch";
}

export interface InventoryEntry {
  readonly path: string;
  readonly sizeBytes: number;
  readonly sha256: string;
}

export interface BackupRecord {
  readonly format: typeof BACKUP_FORMAT;
  readonly name: string;
  readonly createdAt: string;
  // `failed`: la copia no sirve para restaurar.
  readonly status: "ok" | "failed";
  // Tamaño y huella del conjunto: la huella es el SHA-256 del inventario.
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly migrations: readonly string[];
  readonly integrity: "ok" | "failed";
  readonly references: number;
  // Ficheros publicados que la instantánea no referencia. Son inocuos.
  readonly unreferenced: number;
  readonly problems: readonly ReferenceProblem[];
  readonly inventory: readonly InventoryEntry[];
}

export interface BackupOptions {
  readonly dataDir: string;
  // Directorio en el que se crea el de la copia.
  readonly destination: string;
  readonly now: () => number;
  // Páginas por paso de la copia de la base. Entre un paso y otro el servicio
  // sigue escribiendo.
  readonly pagesPerStep?: number;
  readonly onStep?: () => void;
}

export interface BackupResult {
  readonly directory: string;
  readonly record: BackupRecord;
}

export type BackupVerification =
  | { readonly ok: true; readonly record: BackupRecord }
  | { readonly ok: false; readonly problems: readonly string[] };

export interface RestoreResult {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly record: BackupRecord | undefined;
  readonly integrity: "ok" | "failed" | "not_run";
  readonly foreignKeys: "ok" | "failed" | "not_run";
  readonly references: number;
  readonly referenceProblems: readonly ReferenceProblem[];
}

const BLOB_FILE = /^blobs\/([0-9a-f]{2})\/([0-9a-f]{64})$/;
const PACKAGE_FILE = /^exports\/[0-9a-f]{32}\.zip$/;
const STORE_DIRECTORIES: readonly string[] = [
  BLOB_DIRECTORY,
  PACKAGE_DIRECTORY,
];

function storedFile(relative: string): boolean {
  const blob = BLOB_FILE.exec(relative);
  return blob === null
    ? PACKAGE_FILE.test(relative)
    : blob[2]?.startsWith(blob[1] ?? " ") === true;
}

function sha256Of(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function hasTable(db: Database, table: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(table) !== undefined
  );
}

// Ficheros que la base de datos referencia: el PDF de cada documento
// registrado y el paquete de cada exportación terminada.
export function fileReferences(db: Database): readonly FileReference[] {
  const references: FileReference[] = [];
  if (hasTable(db, "document")) {
    for (const row of db
      .prepare("SELECT id, sha256 FROM document ORDER BY id")
      .all()) {
      const sha256 = String(row.sha256);
      references.push({
        kind: "document",
        id: String(row.id),
        path: `${BLOB_DIRECTORY}/${sha256.slice(0, 2)}/${sha256}`,
        sha256,
      });
    }
  }
  if (hasTable(db, "package_export")) {
    for (const row of db
      .prepare(
        "SELECT id, package_sha256 FROM package_export " +
          "WHERE status = 'succeeded' ORDER BY id",
      )
      .all()) {
      const id = String(row.id);
      references.push({
        kind: "package",
        id,
        path: `${PACKAGE_DIRECTORY}/${id}.zip`,
        sha256: String(row.package_sha256),
      });
    }
  }
  return references;
}

function regularFile(file: string): boolean {
  try {
    return lstatSync(file).isFile();
  } catch {
    return false;
  }
}

// Comprueba que cada referencia tiene bajo `root` su fichero y que su huella
// coincide.
export function checkFileReferences(
  db: Database,
  root: string,
): {
  readonly checked: number;
  readonly problems: readonly ReferenceProblem[];
} {
  const references = fileReferences(db);
  const problems: ReferenceProblem[] = [];
  for (const { kind, id, path, sha256 } of references) {
    const file = `${root}/${path}`;
    if (!storedFile(path) || !regularFile(file)) {
      problems.push({ kind, id, path, problem: "missing" });
    } else if (sha256Of(file) !== sha256) {
      problems.push({ kind, id, path, problem: "mismatch" });
    }
  }
  return { checked: references.length, problems };
}

// Ficheros publicados bajo `root`, por su ruta relativa. Los temporales de una
// publicación a medias y cualquier otra cosa que no sea un fichero publicado
// se dejan fuera.
function listStoredFiles(root: string): string[] {
  const found: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(`${root}/${relative}`, {
      withFileTypes: true,
    })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile() && storedFile(child)) {
        found.push(child);
      }
    }
  };
  for (const directory of STORE_DIRECTORIES) {
    if (existsSync(`${root}/${directory}`)) {
      walk(directory);
    }
  }
  return found.sort();
}

function copyPrivate(source: string, target: string): void {
  mkdirSync(target.slice(0, target.lastIndexOf("/")), {
    recursive: true,
    mode: PRIVATE_DIRECTORY,
  });
  copyFileSync(source, target);
  chmodSync(target, PRIVATE_FILE);
  syncToDisk(target);
}

function inventoryOf(root: string): InventoryEntry[] {
  return [DATABASE_FILE, ...listStoredFiles(root)].map((path) => {
    const content = readFileSync(`${root}/${path}`);
    return {
      path,
      sizeBytes: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  });
}

function inventoryDigest(inventory: readonly InventoryEntry[]): string {
  const hash = createHash("sha256");
  for (const { path, sizeBytes, sha256 } of inventory) {
    hash.update(`${sha256}  ${String(sizeBytes)}  ${path}\n`);
  }
  return hash.digest("hex");
}

// Abre una instantánea solo para leerla y no deja a su lado los ficheros
// auxiliares del modo WAL.
function inspectSnapshot<Result>(
  root: string,
  work: (db: Database) => Result,
): Result {
  const file = `${root}/${DATABASE_FILE}`;
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    return work(db);
  } finally {
    db.close();
    rmSync(`${file}-wal`, { force: true });
    rmSync(`${file}-shm`, { force: true });
  }
}

function integrityOf(db: Database): "ok" | "failed" {
  const rows = db.prepare("PRAGMA integrity_check").all();
  return rows.length === 1 && rows[0]?.integrity_check === "ok"
    ? "ok"
    : "failed";
}

function backupName(at: number): string {
  return `aulanorma-${new Date(at).toISOString().replace(/[-:.]/g, "")}`;
}

// Hace una copia de seguridad del directorio de datos, con el servicio en
// marcha, y la verifica. Devuelve siempre el registro que deja escrito: una
// copia con `status: "failed"` no sirve para restaurar.
export async function createBackup({
  dataDir,
  destination,
  now,
  pagesPerStep = 256,
  onStep,
}: BackupOptions): Promise<BackupResult> {
  const sourceFile = `${dataDir}/${DATABASE_FILE}`;
  if (!regularFile(sourceFile)) {
    throw new Error("El directorio de datos no contiene la base de datos.");
  }
  const at = now();
  const name = backupName(at);
  const directory = `${destination}/${name}`;
  mkdirSync(destination, { recursive: true, mode: PRIVATE_DIRECTORY });
  // Falla si ya existe: una copia nunca se escribe sobre otra.
  mkdirSync(directory, { mode: PRIVATE_DIRECTORY });

  // 1. Instantánea de la base de datos.
  const snapshot = `${directory}/${DATABASE_FILE}`;
  const source = new DatabaseSync(sourceFile, { readOnly: true });
  try {
    await backup(source, snapshot, {
      rate: pagesPerStep,
      ...(onStep === undefined ? {} : { progress: onStep }),
    });
  } finally {
    source.close();
  }
  chmodSync(snapshot, PRIVATE_FILE);
  syncToDisk(snapshot);

  // 2. Después, los ficheros publicados.
  for (const relative of listStoredFiles(dataDir)) {
    copyPrivate(`${dataDir}/${relative}`, `${directory}/${relative}`);
  }

  // 3. Verificación de la propia copia.
  const checked = inspectSnapshot(directory, (db) => ({
    integrity: integrityOf(db),
    references: checkFileReferences(db, directory),
    referenced: new Set(fileReferences(db).map(({ path }) => path)),
    migrations: hasTable(db, "schema_migration")
      ? db
          .prepare("SELECT id FROM schema_migration ORDER BY id")
          .all()
          .map((row) => String(row.id))
      : [],
  }));
  const inventory = inventoryOf(directory);

  // 4. Registro.
  const record: BackupRecord = {
    format: BACKUP_FORMAT,
    name,
    createdAt: new Date(at).toISOString(),
    status:
      checked.integrity === "ok" && checked.references.problems.length === 0
        ? "ok"
        : "failed",
    sizeBytes: inventory.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    sha256: inventoryDigest(inventory),
    migrations: checked.migrations,
    integrity: checked.integrity,
    references: checked.references.checked,
    unreferenced: inventory.filter(
      ({ path }) => path !== DATABASE_FILE && !checked.referenced.has(path),
    ).length,
    problems: checked.references.problems,
    inventory,
  };
  const recordFile = `${directory}/${BACKUP_RECORD}`;
  writeFileSync(recordFile, `${JSON.stringify(record, null, 2)}\n`, {
    mode: PRIVATE_FILE,
    flag: "wx",
  });
  syncToDisk(recordFile);
  syncToDisk(directory);
  return { directory, record };
}

function isInventoryEntry(value: unknown): value is InventoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.path === "string" &&
    (entry.path === DATABASE_FILE || storedFile(entry.path)) &&
    typeof entry.sizeBytes === "number" &&
    typeof entry.sha256 === "string" &&
    SHA256.test(entry.sha256)
  );
}

function readRecord(directory: string): BackupRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(`${directory}/${BACKUP_RECORD}`, "utf8"));
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const record = parsed as Record<string, unknown>;
  return record.format === BACKUP_FORMAT &&
    (record.status === "ok" || record.status === "failed") &&
    typeof record.sha256 === "string" &&
    Array.isArray(record.inventory) &&
    record.inventory.every(isInventoryEntry)
    ? (parsed as BackupRecord)
    : undefined;
}

// Comprueba que una copia sigue siendo la que se registró: marcada como
// buena, con todos sus ficheros, ninguno de más y las mismas huellas. No
// modifica la copia.
export function verifyBackup(directory: string): BackupVerification {
  const record = readRecord(directory);
  if (record === undefined) {
    return { ok: false, problems: ["La copia no tiene un registro legible."] };
  }
  if (record.status !== "ok") {
    return { ok: false, problems: ["La copia está marcada como fallida."] };
  }
  const problems: string[] = [];
  if (!record.inventory.some(({ path }) => path === DATABASE_FILE)) {
    problems.push("El registro no incluye la base de datos.");
  }
  if (inventoryDigest(record.inventory) !== record.sha256) {
    problems.push("La huella del registro no corresponde a su inventario.");
  }
  const listed = new Set(record.inventory.map(({ path }) => path));
  for (const { path, sizeBytes, sha256 } of record.inventory) {
    const file = `${directory}/${path}`;
    if (!regularFile(file)) {
      problems.push(`Falta ${path}.`);
    } else {
      const content = readFileSync(file);
      if (
        content.length !== sizeBytes ||
        createHash("sha256").update(content).digest("hex") !== sha256
      ) {
        problems.push(`${path} no coincide con su huella.`);
      }
    }
  }
  for (const path of listStoredFiles(directory)) {
    if (!listed.has(path)) {
      problems.push(`${path} no figura en el registro.`);
    }
  }
  return problems.length === 0 ? { ok: true, record } : { ok: false, problems };
}

// Restaura una copia en un directorio limpio y la comprueba: integridad de
// SQLite, claves ajenas, y cada referencia con su fichero y su huella. No
// arranca nada ni toca el directorio de datos del servicio.
//
// Todo se hace en un directorio de trabajo dentro del destino. `finish` recibe
// la base de datos restaurada, aún allí, para aplicar las reglas de las
// operaciones en curso (sesiones y generaciones), y devuelve los problemas
// que encuentre. Solo si no hay ninguno el contenido pasa al destino, con la
// base de datos en último lugar. Si algo falla, o si `finish` lanza un error,
// el directorio de trabajo se borra y el destino queda como estaba: nunca
// queda un directorio a medias que parezca listo para usar. Si el proceso se
// interrumpe, el directorio de trabajo que deja impide abrir la base de datos.
export function restoreBackup(
  backupDirectory: string,
  targetDirectory: string,
  finish: (db: Database) => readonly string[],
): RestoreResult {
  const failed = (
    problems: readonly string[],
    record?: BackupRecord,
  ): RestoreResult => ({
    ok: false,
    problems,
    record,
    integrity: "not_run",
    foreignKeys: "not_run",
    references: 0,
    referenceProblems: [],
  });
  const verification = verifyBackup(backupDirectory);
  if (!verification.ok) {
    return failed(verification.problems);
  }
  const { record } = verification;
  const existed = existsSync(targetDirectory);
  if (
    existed &&
    (!lstatSync(targetDirectory).isDirectory() ||
      readdirSync(targetDirectory).length > 0)
  ) {
    return failed(["El directorio de destino no está vacío."], record);
  }
  mkdirSync(targetDirectory, { recursive: true, mode: PRIVATE_DIRECTORY });
  chmodSync(targetDirectory, PRIVATE_DIRECTORY);
  const work = `${targetDirectory}/${RESTORE_PREFIX}${randomBytes(8).toString("hex")}`;
  mkdirSync(work, { mode: PRIVATE_DIRECTORY });
  const discard = (): void => {
    rmSync(work, { recursive: true, force: true });
    if (!existed) {
      rmSync(targetDirectory, { recursive: true, force: true });
    }
  };

  let result: RestoreResult;
  try {
    for (const { path } of record.inventory) {
      copyPrivate(`${backupDirectory}/${path}`, `${work}/${path}`);
    }
    const db = configure(new DatabaseSync(`${work}/${DATABASE_FILE}`));
    try {
      const integrity = integrityOf(db);
      const foreignKeys =
        db.prepare("PRAGMA foreign_key_check").all().length === 0
          ? "ok"
          : "failed";
      const references = checkFileReferences(db, work);
      const problems = [
        ...(integrity === "ok"
          ? []
          : ["La verificación de integridad de SQLite ha fallado."]),
        ...(foreignKeys === "ok" ? [] : ["Hay claves ajenas sin su fila."]),
        ...references.problems.map(({ path, problem }) =>
          problem === "missing"
            ? `Falta ${path}.`
            : `${path} no coincide con su huella.`,
        ),
      ];
      if (problems.length === 0) {
        problems.push(...finish(db));
      }
      result = {
        ok: problems.length === 0,
        problems,
        record,
        integrity,
        foreignKeys,
        references: references.checked,
        referenceProblems: references.problems,
      };
    } finally {
      db.close();
    }
    if (result.ok) {
      // Ficheros auxiliares de SQLite: tras cerrar no debe quedar ninguno.
      const entries = readdirSync(work);
      const expected = [DATABASE_FILE, ...STORE_DIRECTORIES];
      if (entries.some((name) => !expected.includes(name))) {
        result = {
          ...result,
          ok: false,
          problems: ["La base de datos restaurada no se ha cerrado limpia."],
        };
      }
    }
  } catch (error) {
    discard();
    throw error;
  }
  if (!result.ok) {
    discard();
    return result;
  }
  // Los ficheros primero y la base de datos al final: hasta entonces el
  // destino no tiene nada que pueda abrirse.
  for (const name of [...STORE_DIRECTORIES, DATABASE_FILE]) {
    if (existsSync(`${work}/${name}`)) {
      renameSync(`${work}/${name}`, `${targetDirectory}/${name}`);
    }
  }
  syncToDisk(targetDirectory);
  rmSync(work, { recursive: true, force: true });
  syncToDisk(targetDirectory);
  return result;
}
