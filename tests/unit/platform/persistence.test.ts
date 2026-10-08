// Persistencia (specs/002-boe-scorm-export: T014 y T015; research.md, R1 y
// R11). Base de datos SQLite, migraciones numeradas y almacén de ficheros
// direccionado por huella.
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  hasBlob,
  migrate,
  openDatabase,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
  putBlob,
  readBlob,
  transaction,
} from "@/platform/persistence";
import type { Migration } from "@/platform/persistence";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(path.join(tmpdir(), "aulanorma-persistence-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

const FIRST: Migration = {
  id: "0001_first",
  sql: "CREATE TABLE first (id INTEGER PRIMARY KEY) STRICT;",
};
const SECOND: Migration = {
  id: "0002_second",
  sql: "CREATE TABLE second (id INTEGER PRIMARY KEY) STRICT;",
};

function tables(db: ReturnType<typeof openMemoryDatabase>): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

describe("openDatabase(dataDir)", () => {
  test("crea el directorio de datos solo para la cuenta del proceso y abre en modo WAL", () => {
    const dataDir = path.join(workspace, "datos", "anidado");
    const db = openDatabase(dataDir);
    try {
      expect(statSync(dataDir).mode & 0o777).toBe(0o700);
      expect(db.prepare("PRAGMA journal_mode").get()?.journal_mode).toBe("wal");
      expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
      expect(existsSync(path.join(dataDir, "aulanorma.db"))).toBe(true);
    } finally {
      db.close();
    }
  });

  test("restringe un directorio de datos que ya existía con permisos abiertos", () => {
    const dataDir = path.join(workspace, "abierto");
    openDatabase(dataDir).close();
    rmSync(dataDir, { recursive: true });
    writeFileSync(path.join(workspace, "marca"), "");
    const reopened = openDatabase(dataDir);
    reopened.close();
    expect(statSync(dataDir).mode & 0o777).toBe(0o700);
  });

  test("lo confirmado persiste al cerrar y volver a abrir", () => {
    const dataDir = path.join(workspace, "datos");
    const first = openDatabase(dataDir);
    migrate(first, [FIRST]);
    first.prepare("INSERT INTO first (id) VALUES (7)").run();
    first.close();
    const second = openDatabase(dataDir);
    try {
      expect(second.prepare("SELECT id FROM first").all()).toEqual([{ id: 7 }]);
      expect(migrate(second, [FIRST])).toEqual([]);
    } finally {
      second.close();
    }
  });
});

describe("transaction(db, work)", () => {
  test("confirma el trabajo y devuelve su resultado", () => {
    const db = openMemoryDatabase();
    migrate(db, [FIRST]);
    const result = transaction(db, () => {
      db.prepare("INSERT INTO first (id) VALUES (1)").run();
      return "hecho";
    });
    expect(result).toBe("hecho");
    expect(db.prepare("SELECT COUNT(*) AS n FROM first").get()?.n).toBe(1);
  });

  test("si el trabajo falla, no queda nada y el error se propaga", () => {
    const db = openMemoryDatabase();
    migrate(db, [FIRST]);
    expect(() =>
      transaction(db, () => {
        db.prepare("INSERT INTO first (id) VALUES (1)").run();
        throw new Error("fallo sintético");
      }),
    ).toThrow("fallo sintético");
    expect(db.prepare("SELECT COUNT(*) AS n FROM first").get()?.n).toBe(0);
  });

  test("un segundo escritor no entra mientras hay una transacción de escritura abierta", () => {
    const dataDir = path.join(workspace, "datos");
    const first = openDatabase(dataDir);
    const second = openDatabase(dataDir);
    try {
      migrate(first, [FIRST]);
      second.exec("PRAGMA busy_timeout = 50");
      first.exec("BEGIN IMMEDIATE");
      expect(() => {
        second.exec("BEGIN IMMEDIATE");
      }).toThrow(/locked/);
      first.exec("COMMIT");
      expect(() => {
        transaction(second, () => undefined);
      }).not.toThrow();
    } finally {
      first.close();
      second.close();
    }
  });
});

describe("migrate(db, migrations)", () => {
  test("aplica las pendientes en orden y devuelve sus identificadores", () => {
    const db = openMemoryDatabase();
    expect(migrate(db, [FIRST, SECOND])).toEqual(["0001_first", "0002_second"]);
    expect(tables(db)).toEqual(["first", "schema_migration", "second"]);
    expect(
      db
        .prepare("SELECT position, id FROM schema_migration ORDER BY position")
        .all(),
    ).toEqual([
      { position: 1, id: "0001_first" },
      { position: 2, id: "0002_second" },
    ]);
  });

  test("es repetible: una segunda llamada no aplica nada", () => {
    const db = openMemoryDatabase();
    migrate(db, [FIRST, SECOND]);
    expect(migrate(db, [FIRST, SECOND])).toEqual([]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n,
    ).toBe(2);
  });

  test("aplica solo las nuevas cuando la lista crece", () => {
    const db = openMemoryDatabase();
    migrate(db, [FIRST]);
    expect(migrate(db, [FIRST, SECOND])).toEqual(["0002_second"]);
  });

  test("todas o ninguna: si una falla, no queda ninguna de esa llamada", () => {
    const db = openMemoryDatabase();
    const broken: Migration = { id: "0003_broken", sql: "CREATE TABL nope;" };
    expect(() => migrate(db, [FIRST, SECOND, broken])).toThrow();
    expect(tables(db)).toEqual(["schema_migration"]);
    expect(migrate(db, [FIRST, SECOND])).toEqual(["0001_first", "0002_second"]);
  });

  test.each([
    {
      name: "una migración aplicada cambia de contenido",
      next: [{ ...FIRST, sql: `${FIRST.sql} -- editada` }, SECOND],
    },
    {
      name: "las migraciones aplicadas cambian de orden",
      next: [SECOND, FIRST],
    },
    {
      name: "una migración aplicada cambia de identificador",
      next: [{ ...FIRST, id: "0001_renamed" }, SECOND],
    },
    { name: "la base tiene más migraciones que la lista", next: [FIRST] },
  ])("falla sin aplicar nada si $name", ({ next }) => {
    const db = openMemoryDatabase();
    migrate(db, [FIRST, SECOND]);
    expect(() => migrate(db, next)).toThrow();
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM schema_migration").get()?.n,
    ).toBe(2);
  });
});

describe("PLATFORM_MIGRATIONS", () => {
  test("crea las tablas de cada módulo y sus disparadores", () => {
    const db = openMemoryDatabase();
    expect(migrate(db, PLATFORM_MIGRATIONS)).toEqual([
      "0001_audit_event",
      "0002_identity",
      "0003_normative_source",
      "0004_structured_interpretation",
      "0005_generation",
      "0006_budget",
      "0007_outline",
      "0008_syllabus",
      "0009_content_export",
    ]);
    expect(tables(db)).toEqual([
      "audit_event",
      "block_requirement",
      "budget",
      "budget_change",
      "budget_reservation",
      "correction",
      "document",
      "document_page",
      "entry_requirement",
      "generation_call",
      "generation_run",
      "interpretation",
      "interpretation_rejection",
      "interpretation_validation",
      "outline",
      "outline_approval",
      "outline_change",
      "outline_entry",
      "package_download",
      "package_export",
      "page_resolution",
      "reconciliation",
      "reference_check",
      "rejection",
      "requirement",
      "schema_migration",
      "session",
      "sign_in_throttle",
      "syllabus_version",
      "syllabus_version_topic",
      "topic",
      "topic_approval",
      "topic_block",
      "topic_change",
      "user_account",
    ]);
    const triggers = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name",
      )
      .all()
      .map((row) => row.name);
    // Solo inserción: ni modificar, ni borrar, ni sustituir.
    for (const table of [
      "audit_event",
      "document",
      "document_page",
      "page_resolution",
      "correction",
      "interpretation_validation",
      "interpretation_rejection",
      "generation_call",
      "budget_change",
      "reconciliation",
      "outline_change",
      "outline_approval",
      "rejection",
      "topic_change",
      "topic_approval",
      "syllabus_version",
      "syllabus_version_topic",
      "reference_check",
      "package_export",
      "package_download",
    ]) {
      expect(triggers).toEqual(
        expect.arrayContaining([
          `${table}_no_delete`,
          `${table}_no_replace`,
          `${table}_no_update`,
        ]),
      );
    }
    // Editables, pero sin borrado.
    for (const table of [
      "interpretation",
      "requirement",
      "generation_run",
      "budget",
      "budget_reservation",
      "outline",
      "outline_entry",
      "topic",
      "topic_block",
    ]) {
      expect(triggers).toContain(`${table}_no_delete`);
      expect(triggers).not.toContain(`${table}_no_update`);
    }
    expect(triggers).toHaveLength(74);
    // El presupuesto nace con una única fila, a cero y sin moneda fijada.
    expect(db.prepare("SELECT * FROM budget").all()).toEqual([
      { id: 1, project_limit: 0, currency: "XXX", revision: 1 },
    ]);
  });

  test("la lista y sus elementos están congelados", () => {
    expect(Object.isFrozen(PLATFORM_MIGRATIONS)).toBe(true);
    expect(PLATFORM_MIGRATIONS.every((item) => Object.isFrozen(item))).toBe(
      true,
    );
  });
});

describe("almacén de ficheros por huella", () => {
  const content = Buffer.from("contenido sintético de prueba\n");
  const sha256 = createHash("sha256").update(content).digest("hex");

  function storedFiles(): string[] {
    const root = path.join(workspace, "blobs");
    if (!existsSync(root)) {
      return [];
    }
    return readdirSync(root, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
  }

  test("publica el contenido con su huella como nombre y lo devuelve íntegro", () => {
    expect(hasBlob(workspace, sha256)).toBe(false);
    expect(putBlob(workspace, content)).toBe(sha256);
    expect(hasBlob(workspace, sha256)).toBe(true);
    expect(readBlob(workspace, sha256).equals(content)).toBe(true);
    expect(storedFiles()).toEqual([sha256]);
  });

  test("no deja ficheros temporales y el fichero publicado solo lo lee su cuenta", () => {
    putBlob(workspace, content);
    const file = path.join(workspace, "blobs", sha256.slice(0, 2), sha256);
    expect(storedFiles().filter((name) => name.startsWith(".tmp-"))).toEqual(
      [],
    );
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  test("publicar dos veces el mismo contenido no reescribe el fichero", () => {
    putBlob(workspace, content);
    const file = path.join(workspace, "blobs", sha256.slice(0, 2), sha256);
    const before = statSync(file);
    expect(putBlob(workspace, content)).toBe(sha256);
    const after = statSync(file);
    expect(after.ino).toBe(before.ino);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("detecta un fichero cuyo contenido ya no coincide con su huella", () => {
    putBlob(workspace, content);
    const file = path.join(workspace, "blobs", sha256.slice(0, 2), sha256);
    writeFileSync(file, "contenido alterado");
    expect(() => readBlob(workspace, sha256)).toThrow(/huella/);
  });

  test.each([
    "",
    "abc",
    "../../etc/passwd",
    sha256.toUpperCase(),
    `${sha256}0`,
  ])("rechaza %j como huella, sin tocar el sistema de ficheros", (value) => {
    expect(() => hasBlob(workspace, value)).toThrow(/SHA-256/);
    expect(() => readBlob(workspace, value)).toThrow(/SHA-256/);
  });

  test("no ofrece ninguna operación para borrar ni sobrescribir", async () => {
    const namespace = await import("@/platform/persistence");
    // La copia y la restauración solo escriben en un directorio nuevo o
    // vacío: nunca en el almacén del que leen.
    expect(Object.keys(namespace).sort()).toEqual([
      "BACKUP_RECORD",
      "PACKAGE_DIRECTORY",
      "PLATFORM_MIGRATIONS",
      "checkFileReferences",
      "createBackup",
      "fileReferences",
      "hasBlob",
      "migrate",
      "openDatabase",
      "openMemoryDatabase",
      "putBlob",
      "readBlob",
      "restoreBackup",
      "syncToDisk",
      "transaction",
      "verifyBackup",
    ]);
  });
});
