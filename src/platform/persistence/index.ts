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
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

export interface Migration {
  readonly id: string;
  readonly sql: string;
}

const DATABASE_FILE = "aulanorma.db";
const BLOB_DIRECTORY = "blobs";
const PRIVATE_DIRECTORY = 0o700;
const PRIVATE_FILE = 0o600;

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
// Cada tabla pertenece a un único módulo, que es el único que la consulta:
// `audit_event`, a `audit`; el resto, a `identity`.

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

export const PLATFORM_MIGRATIONS: readonly Migration[] = Object.freeze([
  Object.freeze({ id: "0001_audit_event", sql: AUDIT_EVENT }),
  Object.freeze({ id: "0002_identity", sql: IDENTITY }),
]);

// --- Almacén de ficheros direccionado por huella ---

const SHA256 = /^[0-9a-f]{64}$/;

function blobPath(dataDir: string, sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new Error("La huella no es un SHA-256 en hexadecimal.");
  }
  return `${dataDir}/${BLOB_DIRECTORY}/${sha256.slice(0, 2)}/${sha256}`;
}

function syncDirectory(directory: string): void {
  const descriptor = openSync(directory, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

// Publica el contenido y devuelve su huella. El fichero se escribe en un
// temporal del mismo directorio, se sincroniza a disco, se renombra a su
// huella y se sincroniza el directorio: quien después confirme una transacción
// que lo referencia sabe que ya está publicado. Un fichero publicado no se
// reescribe ni se borra.
export function putBlob(dataDir: string, content: Uint8Array): string {
  const sha256 = createHash("sha256").update(content).digest("hex");
  const target = blobPath(dataDir, sha256);
  if (existsSync(target)) {
    return sha256;
  }
  const directory = target.slice(0, target.lastIndexOf("/"));
  mkdirSync(directory, { recursive: true, mode: PRIVATE_DIRECTORY });
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
  syncDirectory(directory);
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
