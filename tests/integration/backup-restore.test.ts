// Copia de seguridad y restauración (specs/002-boe-scorm-export: T070 a T072;
// FR-069 y SC-040; research.md, R11).
//
// Monta un directorio de datos real en disco, con un documento publicado, una
// exportación hecha por el camino real, sesiones abiertas y generaciones en
// curso; lo copia mientras se sigue escribiendo y restaura la copia en un
// directorio limpio con el script de operación. El contenido es sintético y
// las cuentas son de prueba. No acredita el despliegue: que el servicio
// arranque en el servidor de destino sobre un directorio restaurado es T074.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createAudit } from "@/platform/audit";
import {
  createBudget,
  recoverInterruptedReservations,
} from "@/platform/generation";
import { createIdentity, revokeEverySession } from "@/platform/identity";
import type { Identity } from "@/platform/identity";
import {
  BACKUP_RECORD,
  checkFileReferences,
  createBackup,
  fileReferences,
  openDatabase,
  putBlob,
  restoreBackup,
  transaction,
  verifyBackup,
} from "@/platform/persistence";
import type {
  BackupRecord,
  BackupResult,
  Database,
} from "@/platform/persistence";
import { createExportFixture, PRESENTATION } from "../support/export-fixture";
import type { ExportFixture } from "../support/export-fixture";
import { TEACHER } from "../support/outline-fixture";

vi.setConfig({ testTimeout: 120_000 });

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const BACKUP_SCRIPT = path.join(repoRoot, "scripts/ops/backup.mjs");
const RESTORE_SCRIPT = path.join(repoRoot, "scripts/ops/verify-restore.mjs");
const PASSWORD = `inicial-${randomUUID()}`;
const FAST = { N: 1024, r: 8, p: 1 } as const;
const DOCUMENT_BYTES = Buffer.from(`%PDF-sintético ${randomUUID()}\n`);
const SENT_COST = 70;

let root: string;
let dataDir: string;
let copies: string;
let db: Database;
let fixture: ExportFixture;
let identity: Identity;
let cookie: string;
let entryCookie: string;
let documentSha256: string;
let sentId: string;
let reservedId: string;
let settledId: string;

function identityOn(database: Database): Identity {
  const audit = createAudit(database);
  return createIdentity({
    db: database,
    audit: (event) => {
      audit.record(event);
    },
    now: () => Date.now(),
    sessionIdleMs: 30 * 60_000,
    sessionMaxMs: 12 * 3_600_000,
    passwordParams: FAST,
  });
}

function exportOnce(): string {
  const result = fixture.exports.export({
    ...TEACHER,
    ...PRESENTATION,
    versionId: fixture.versionId,
  });
  if (!result.ok) {
    throw new Error(`La exportación debía completarse: ${result.reason}.`);
  }
  return result.record.id;
}

function reserve(maxCost: number): string {
  const runId = fixture.outline.generation.startRun({
    kind: "outline",
    targetId: "objetivo",
    requestedBy: TEACHER.actorId,
  });
  const reserved = fixture.outline.budget.reserve({
    runId,
    task: "outline",
    maxCost,
  });
  if (!reserved.ok) {
    throw new Error("La reserva debía concederse.");
  }
  return reserved.reservationId;
}

function backupNow(
  options: { onStep?: () => void; pagesPerStep?: number } = {},
): Promise<BackupResult> {
  return createBackup({
    dataDir,
    destination: copies,
    now: () => Date.now(),
    ...options,
  });
}

interface Report {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly integrity: string;
  readonly foreignKeys: string;
  readonly references: number;
  readonly sessionsRevoked?: number;
  readonly openSessions?: number;
  readonly markedUncertain?: number;
  readonly released?: number;
  readonly reservationsInProgress?: number;
  readonly uncertain?: number;
  readonly uncertainCost?: number;
}

function run(
  script: string,
  args: readonly string[],
  env: Readonly<Record<string, string>> = {},
): { code: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
    env: {
      PATH: process.env.PATH ?? "",
      ...env,
    } as unknown as NodeJS.ProcessEnv,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function verifyRestore(
  backup: string,
  target: string,
): { code: number | null; report: Report; stderr: string } {
  const result = run(RESTORE_SCRIPT, [backup, target]);
  return {
    code: result.code,
    report: JSON.parse(result.stdout) as Report,
    stderr: result.stderr,
  };
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Reescribe el registro de una copia para que vuelva a cuadrar con sus
// ficheros: así una copia defectuosa supera la primera comprobación y el
// fallo aparece después, con los ficheros ya copiados.
function rewriteRecord(directory: string, record: BackupRecord): void {
  const inventory = record.inventory
    .filter((entry) => existsSync(path.join(directory, entry.path)))
    .map((entry) => {
      const content = readFileSync(path.join(directory, entry.path));
      return {
        path: entry.path,
        sizeBytes: content.length,
        sha256: createHash("sha256").update(content).digest("hex"),
      };
    });
  const digest = createHash("sha256");
  for (const entry of inventory) {
    digest.update(
      `${entry.sha256}  ${String(entry.sizeBytes)}  ${entry.path}\n`,
    );
  }
  writeFileSync(
    path.join(directory, BACKUP_RECORD),
    JSON.stringify({ ...record, inventory, sha256: digest.digest("hex") }),
  );
}

function stateOf(database: Database, reservationId: string): unknown {
  return database
    .prepare("SELECT state FROM budget_reservation WHERE id = ?")
    .get(reservationId)?.state;
}

beforeEach(async () => {
  root = mkdtempSync(path.join(tmpdir(), "aulanorma-backup-"));
  dataDir = path.join(root, "datos");
  copies = path.join(root, "copias");
  db = openDatabase(dataDir);
  fixture = await createExportFixture({ db, dataDir });

  // Un documento registrado, con su fichero publicado antes que su fila.
  documentSha256 = putBlob(dataDir, DOCUMENT_BYTES);
  db.prepare(
    "INSERT INTO document (id, title, issuer, official_reference, source, " +
      "obtained_on, version, sha256, size_bytes, page_count, " +
      "has_signature_field, replaces_document_id, registered_by, " +
      "registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)",
  ).run(
    "a".repeat(32),
    "Documento sintético",
    "Organismo sintético",
    "REF-0001",
    "prueba",
    "2026-10-08",
    "Texto original",
    documentSha256,
    DOCUMENT_BYTES.length,
    1,
    TEACHER.actorId,
    1,
  );
  exportOnce();

  // Una sesión abierta y otra de entrada, aún sin cuenta.
  identity = identityOn(db);
  expect(
    await identity.createUser({
      username: "docente",
      password: PASSWORD,
      roles: ["teacher"],
      correlationId: "alta",
    }),
  ).toEqual({ ok: true });
  const entry = identity.beginEntry();
  const signedIn = await identity.signIn({
    entryCookie: entry.cookie,
    csrfToken: entry.csrfToken,
    username: "docente",
    password: PASSWORD,
    correlationId: "entrada",
  });
  if (!signedIn.ok) {
    throw new Error("La entrada debía concederse.");
  }
  cookie = signedIn.cookie;
  entryCookie = identity.beginEntry().cookie;

  // Tres generaciones: una liquidada, una enviada y sin liquidar, y una
  // reservada que no llegó a enviarse.
  const { budget } = fixture.outline;
  settledId = reserve(30);
  budget.markSent(settledId);
  budget.settle(settledId, 20, null);
  sentId = reserve(SENT_COST);
  budget.markSent(sentId);
  reservedId = reserve(40);
});

afterEach(() => {
  db.close();
  rmSync(root, { recursive: true, force: true });
});

describe("copia de seguridad", () => {
  test("copia la base y después los ficheros, la verifica y la registra", async () => {
    const { directory, record } = await backupNow();

    expect(record.status).toBe("ok");
    expect(record.integrity).toBe("ok");
    expect(record.problems).toEqual([]);
    // El documento y el paquete exportado.
    expect(record.references).toBe(2);
    expect(record.unreferenced).toBe(0);
    expect(record.migrations.length).toBeGreaterThan(0);
    expect(record.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(record.sizeBytes).toBe(
      record.inventory.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    );
    expect(new Date(record.createdAt).toISOString()).toBe(record.createdAt);
    expect(path.basename(directory)).toBe(record.name);

    // El registro escrito es el devuelto, y la copia es privada.
    expect(
      JSON.parse(readFileSync(path.join(directory, BACKUP_RECORD), "utf8")),
    ).toEqual(record);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    for (const { path: file, sha256: expected } of record.inventory) {
      expect(statSync(path.join(directory, file)).mode & 0o777).toBe(0o600);
      expect(sha256(path.join(directory, file))).toBe(expected);
    }
    // Sin ficheros auxiliares de SQLite junto a la instantánea.
    expect(readdirSync(directory).sort()).toEqual(
      ["aulanorma.db", "backup.json", "blobs", "exports"].sort(),
    );
    expect(verifyBackup(directory)).toEqual({ ok: true, record });
  });

  test("un fichero publicado sin referencia y un temporal no la hacen fallar", async () => {
    // Publicado, pero la transacción que iba a referenciarlo no se confirmó.
    const orphan = putBlob(dataDir, Buffer.from("sin referencia"));
    // Una publicación interrumpida a medias.
    const partial = path.join(dataDir, "blobs", orphan.slice(0, 2), ".tmp-a1");
    writeFileSync(partial, "a medias");
    writeFileSync(path.join(dataDir, "exports", "x.zip.abc.tmp"), "a medias");

    const { directory, record } = await backupNow();

    expect(record.status).toBe("ok");
    expect(record.references).toBe(2);
    expect(record.unreferenced).toBe(1);
    const copied = record.inventory.map((entry) => entry.path);
    expect(copied).toContain(`blobs/${orphan.slice(0, 2)}/${orphan}`);
    expect(copied.filter((file) => file.includes("tmp"))).toEqual([]);
    expect(
      existsSync(path.join(directory, "blobs", orphan.slice(0, 2), ".tmp-a1")),
    ).toBe(false);
    expect(verifyRestore(directory, path.join(root, "limpio")).code).toBe(0);
  });

  test("se hace con el servicio escribiendo y queda coherente", async () => {
    // Entre dos pasos de la copia de la base, el servicio exporta otro
    // paquete y registra otro documento.
    let steps = 0;
    let written = "";
    const { directory, record } = await backupNow({
      pagesPerStep: 1,
      onStep: () => {
        steps += 1;
        if (steps === 3) {
          written = exportOnce();
        }
      },
    });

    expect(steps).toBeGreaterThan(3);
    expect(written).not.toBe("");
    expect(record.status).toBe("ok");
    expect(record.problems).toEqual([]);
    // Lo que la instantánea referencia está en la copia; lo demás, si llegó
    // a copiarse, sobra.
    expect(record.references + record.unreferenced).toBe(
      record.inventory.length - 1,
    );
    expect(verifyRestore(directory, path.join(root, "limpio")).code).toBe(0);
    // El servicio sigue con su exportación.
    expect(checkFileReferences(db, dataDir)).toEqual({
      checked: 3,
      problems: [],
    });
  });

  test("falta un fichero referenciado: la copia queda marcada como fallida", async () => {
    rmSync(
      path.join(dataDir, "blobs", documentSha256.slice(0, 2), documentSha256),
    );

    const { directory, record } = await backupNow();

    expect(record.status).toBe("failed");
    expect(record.problems).toEqual([
      {
        kind: "document",
        id: "a".repeat(32),
        path: `blobs/${documentSha256.slice(0, 2)}/${documentSha256}`,
        problem: "missing",
      },
    ]);
    expect(verifyBackup(directory)).toEqual({
      ok: false,
      problems: ["La copia está marcada como fallida."],
    });
    const target = path.join(root, "limpio");
    const restored = verifyRestore(directory, target);
    expect(restored.code).toBe(1);
    expect(restored.report.ok).toBe(false);
    expect(existsSync(target)).toBe(false);
  });

  test("un fichero referenciado con otro contenido: la copia queda fallida", async () => {
    const [reference] = fileReferences(db).filter(
      (item) => item.kind === "package",
    );
    writeFileSync(path.join(dataDir, reference?.path ?? ""), "otro contenido");

    const { record } = await backupNow();

    expect(record.status).toBe("failed");
    expect(record.problems.map((item) => item.problem)).toEqual(["mismatch"]);
  });

  test("no escribe sobre otra copia ni sin base de datos", async () => {
    const at = Date.now();
    const options = { dataDir, destination: copies, now: () => at };
    await createBackup(options);
    await expect(createBackup(options)).rejects.toThrow();
    await expect(
      createBackup({ ...options, dataDir: path.join(root, "vacío") }),
    ).rejects.toThrow("no contiene la base de datos");
  });

  test("el script la hace con la configuración del servicio", () => {
    const env = {
      NODE_ENV: "production",
      AULANORMA_LOG_LEVEL: "silent",
      AULANORMA_ENVIRONMENT: "test",
      AULANORMA_DATA_DIR: dataDir,
      AULANORMA_PUBLIC_ORIGIN: "https://aulanorma.example",
      AULANORMA_SESSION_IDLE_MINUTES: "30",
      AULANORMA_SESSION_MAX_HOURS: "12",
      AULANORMA_PDF_MAX_MIB: "32",
      AULANORMA_PDF_MAX_PAGES: "600",
      AULANORMA_GENERATION_MAX_OPERATION_COST: "1000000",
    };
    const done = run(BACKUP_SCRIPT, [copies], env);
    expect(done.stderr).toBe("");
    expect(done.code).toBe(0);
    const line = JSON.parse(done.stdout) as {
      name: string;
      status: string;
      sha256: string;
      sizeBytes: number;
      references: number;
    };
    expect(line.status).toBe("ok");
    expect(line.references).toBe(2);
    const verified = verifyBackup(path.join(copies, line.name));
    expect(verified.ok && verified.record.sha256).toBe(line.sha256);

    // Nunca dentro del directorio de datos, ni sin modo, ni sin destino.
    const inside = run(BACKUP_SCRIPT, [path.join(dataDir, "copias")], env);
    expect(inside.code).toBe(1);
    expect(existsSync(path.join(dataDir, "copias"))).toBe(false);
    expect(run(BACKUP_SCRIPT, [copies]).code).toBe(1);
    expect(run(BACKUP_SCRIPT, [], env).code).toBe(1);

    // Con un fichero referenciado ausente, termina con error.
    rmSync(
      path.join(dataDir, "blobs", documentSha256.slice(0, 2), documentSha256),
    );
    const failed = run(BACKUP_SCRIPT, [path.join(root, "otras")], env);
    expect(failed.code).toBe(1);
    expect((JSON.parse(failed.stdout) as { status: string }).status).toBe(
      "failed",
    );
  });
});

describe("restauración comprobada", () => {
  test("en un directorio limpio: referencias, huellas, sesiones revocadas y generaciones inciertas (SC-040)", async () => {
    const { directory, record } = await backupNow();
    const target = path.join(root, "restaurado");

    const { code, report, stderr } = verifyRestore(directory, target);

    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(report).toMatchObject({
      ok: true,
      problems: [],
      backup: record.name,
      backupSha256: record.sha256,
      integrity: "ok",
      foreignKeys: "ok",
      references: 2,
      referenceProblems: [],
      migrationsApplied: 0,
      sessionsRevoked: 2,
      openSessions: 0,
      markedUncertain: 1,
      released: 1,
      reservationsInProgress: 0,
      uncertain: 1,
      uncertainCost: SENT_COST,
    });

    const restored = openDatabase(target);
    try {
      // Cada referencia, con su fichero y su huella.
      expect(checkFileReferences(restored, target)).toEqual({
        checked: 2,
        problems: [],
      });
      for (const reference of fileReferences(restored)) {
        expect(sha256(path.join(target, reference.path))).toBe(
          reference.sha256,
        );
      }
      expect(statSync(target).mode & 0o777).toBe(0o700);
      // Solo los datos: ni directorio de trabajo ni auxiliares de SQLite.
      expect(
        readdirSync(target).filter((name) => !name.startsWith("aulanorma.db-")),
      ).toEqual(["aulanorma.db", "blobs", "exports"]);

      // Ninguna sesión anterior sirve; la cuenta sí puede volver a entrar.
      const again = identityOn(restored);
      expect(again.resolveSession(cookie)).toBeNull();
      expect(again.resolveEntry(entryCookie)).toBeNull();
      const entry = again.beginEntry();
      const signedIn = await again.signIn({
        entryCookie: entry.cookie,
        csrfToken: entry.csrfToken,
        username: "docente",
        password: PASSWORD,
        correlationId: "tras restaurar",
      });
      expect(signedIn.ok).toBe(true);

      // La generación enviada figura como incierta y sigue contando; la que
      // no se envió se libera; la liquidada no cambia.
      expect(stateOf(restored, sentId)).toBe("uncertain");
      expect(stateOf(restored, reservedId)).toBe("released");
      expect(stateOf(restored, settledId)).toBe("settled");
      const audit = createAudit(restored);
      const status = createBudget({
        db: restored,
        audit,
        now: () => Date.now(),
        maxOperationCost: 1000,
      }).status();
      expect(status.uncertain).toBe(SENT_COST);
      expect(status.available).toBe(status.limit - 20 - SENT_COST);
      expect(
        audit
          .list()
          .filter((event) => event.action === "restore.verified")
          .map((event) => event.details),
      ).toEqual([
        {
          via: "verify-restore",
          sessionsRevoked: 2,
          markedUncertain: 1,
          released: 1,
        },
      ]);
    } finally {
      restored.close();
    }

    // El servicio de origen no se ha tocado, ni la copia.
    expect(identity.resolveSession(cookie)).not.toBeNull();
    expect(stateOf(db, sentId)).toBe("sent");
    expect(stateOf(db, reservedId)).toBe("reserved");
    expect(verifyBackup(directory)).toEqual({ ok: true, record });
  });

  test("rechaza un destino que no está vacío y no lo modifica", async () => {
    const { directory } = await backupNow();
    const target = path.join(root, "ocupado");
    mkdirSync(target);
    writeFileSync(path.join(target, "nota.txt"), "ya había algo");

    const { code, report } = verifyRestore(directory, target);

    expect(code).toBe(1);
    expect(report.problems).toEqual([
      "El directorio de destino no está vacío.",
    ]);
    expect(readdirSync(target)).toEqual(["nota.txt"]);
    // El directorio de datos del servicio tampoco vale como destino.
    expect(verifyRestore(directory, dataDir).code).toBe(1);
    expect(stateOf(db, sentId)).toBe("sent");
  });

  test("rechaza una copia alterada, incompleta, con ficheros de más o sin registro", async () => {
    const { directory, record } = await backupNow();
    const blob = `blobs/${documentSha256.slice(0, 2)}/${documentSha256}`;
    const target = path.join(root, "limpio");
    const refused = (problem: string): void => {
      const { code, report } = verifyRestore(directory, target);
      expect(code).toBe(1);
      expect(report.ok).toBe(false);
      expect(report.problems).toContain(problem);
      expect(report.integrity).toBe("not_run");
      expect(existsSync(target)).toBe(false);
    };

    const original = readFileSync(path.join(directory, blob));
    writeFileSync(path.join(directory, blob), "alterado");
    refused(`${blob} no coincide con su huella.`);

    rmSync(path.join(directory, blob));
    refused(`Falta ${blob}.`);
    writeFileSync(path.join(directory, blob), original);
    expect(verifyBackup(directory).ok).toBe(true);

    const extra = `exports/${"f".repeat(32)}.zip`;
    writeFileSync(path.join(directory, extra), "añadido");
    refused(`${extra} no figura en el registro.`);
    rmSync(path.join(directory, extra));

    // Un registro retocado para dar por buena otra base de datos.
    const recordFile = path.join(directory, BACKUP_RECORD);
    const inventory = record.inventory.map((entry) =>
      entry.path === "aulanorma.db"
        ? { ...entry, sha256: "0".repeat(64) }
        : entry,
    );
    writeFileSync(recordFile, JSON.stringify({ ...record, inventory }));
    refused("La huella del registro no corresponde a su inventario.");

    // Rutas fuera de la copia en el inventario: el registro no es legible.
    writeFileSync(
      recordFile,
      JSON.stringify({
        ...record,
        inventory: [
          ...record.inventory,
          { path: "../fuera", sizeBytes: 1, sha256: "0".repeat(64) },
        ],
      }),
    );
    refused("La copia no tiene un registro legible.");

    rmSync(recordFile);
    refused("La copia no tiene un registro legible.");
  });

  test("detecta en el directorio restaurado una referencia sin su fichero", async () => {
    const { directory } = await backupNow();
    const target = path.join(root, "restaurado");
    expect(restoreBackup(directory, target, () => []).ok).toBe(true);
    const [reference] = fileReferences(db).filter(
      (item) => item.kind === "package",
    );
    rmSync(path.join(target, reference?.path ?? ""));

    const restored = openDatabase(target);
    try {
      expect(checkFileReferences(restored, target).problems).toEqual(
        [{ ...reference, problem: "missing" }].map(
          ({ kind, id, path: file, problem }) => ({
            kind,
            id,
            path: file,
            problem,
          }),
        ),
      );
    } finally {
      restored.close();
    }
  });

  describe("una restauración fallida no deja nada que parezca listo", () => {
    const blob = (): string =>
      `blobs/${documentSha256.slice(0, 2)}/${documentSha256}`;

    // El destino no existía, o existía vacío: en los dos casos queda igual.
    function expectNothingLeft(directory: string, problem: string): void {
      const fresh = path.join(root, "nuevo");
      const first = verifyRestore(directory, fresh);
      expect(first.code).toBe(1);
      expect(first.report.ok).toBe(false);
      expect(first.report.problems).toContain(problem);
      expect(existsSync(fresh)).toBe(false);

      const empty = path.join(root, "vacío");
      mkdirSync(empty);
      expect(verifyRestore(directory, empty).code).toBe(1);
      expect(readdirSync(empty)).toEqual([]);
    }

    test("falta un fichero referenciado en una copia cuyo registro cuadra", async () => {
      const { directory, record } = await backupNow();
      rmSync(path.join(directory, blob()));
      rewriteRecord(directory, record);
      expect(verifyBackup(directory).ok).toBe(true);

      expectNothingLeft(directory, `Falta ${blob()}.`);
    });

    test("un fichero referenciado con otro contenido en una copia cuyo registro cuadra", async () => {
      const { directory, record } = await backupNow();
      writeFileSync(path.join(directory, blob()), "otro contenido");
      rewriteRecord(directory, record);
      expect(verifyBackup(directory).ok).toBe(true);

      expectNothingLeft(directory, `${blob()} no coincide con su huella.`);
    });

    test("la base de datos de la copia está dañada", async () => {
      const { directory, record } = await backupNow();
      const file = path.join(directory, "aulanorma.db");
      const content = readFileSync(file);
      // Se conserva la cabecera y se destroza el resto.
      content.fill(0x5a, 4096);
      writeFileSync(file, content);
      rewriteRecord(directory, record);
      expect(verifyBackup(directory).ok).toBe(true);

      for (const name of ["nuevo", "vacío"]) {
        const target = path.join(root, name);
        if (name === "vacío") {
          mkdirSync(target);
        }
        const result = run(RESTORE_SCRIPT, [directory, target]);
        expect(result.code).toBe(1);
        expect(result.stderr).not.toBe("");
        expect(existsSync(target) ? readdirSync(target) : []).toEqual([]);
      }
    });

    test("las reglas de las operaciones en curso encuentran un problema o fallan", async () => {
      const { directory } = await backupNow();
      const target = path.join(root, "nuevo");

      const refused = restoreBackup(directory, target, () => [
        "Quedan sesiones sin revocar.",
      ]);
      expect(refused.ok).toBe(false);
      expect(refused.integrity).toBe("ok");
      expect(refused.problems).toEqual(["Quedan sesiones sin revocar."]);
      expect(existsSync(target)).toBe(false);

      expect(() =>
        restoreBackup(directory, target, () => {
          throw new Error("fallo a medias");
        }),
      ).toThrow("fallo a medias");
      expect(existsSync(target)).toBe(false);

      // Lo que la regla llegó a escribir antes de fallar no sobrevive.
      expect(() =>
        restoreBackup(directory, target, (restored) => {
          revokeEverySession(restored, 1);
          throw new Error("fallo tras escribir");
        }),
      ).toThrow("fallo tras escribir");
      expect(existsSync(target)).toBe(false);

      // La misma copia sigue sirviendo.
      expect(verifyRestore(directory, target).code).toBe(0);
    });

    test("interrumpida a medias: el directorio no se abre ni admite otra restauración", async () => {
      const { directory } = await backupNow();
      const target = path.join(root, "interrumpido");
      // Lo que deja un proceso que muere durante la restauración: su
      // directorio de trabajo, con la base de datos dentro.
      const work = path.join(target, ".restore-0123456789abcdef");
      mkdirSync(work, { recursive: true });
      writeFileSync(
        path.join(work, "aulanorma.db"),
        readFileSync(path.join(directory, "aulanorma.db")),
      );

      expect(() => openDatabase(target)).toThrow("restauración sin terminar");
      expect(existsSync(path.join(target, "aulanorma.db"))).toBe(false);
      const again = verifyRestore(directory, target);
      expect(again.code).toBe(1);
      expect(again.report.problems).toEqual([
        "El directorio de destino no está vacío.",
      ]);
    });
  });

  describe("reglas de las operaciones en curso, aplicadas directamente", () => {
    test("revocar todas las sesiones: ninguna anterior sirve y las posteriores sí", async () => {
      expect(identity.resolveSession(cookie)).not.toBeNull();
      expect(identity.resolveEntry(entryCookie)).not.toBeNull();
      // La sesión de entrada con la que se entró ya estaba revocada.
      const earlier = db
        .prepare("SELECT revoked_at FROM session WHERE revoked_at IS NOT NULL")
        .all()
        .map((row) => row.revoked_at);
      expect(earlier).toHaveLength(1);
      const at = Date.now() + 60_000;

      expect(revokeEverySession(db, at)).toBe(2);

      expect(identity.resolveSession(cookie)).toBeNull();
      expect(identity.resolveEntry(entryCookie)).toBeNull();
      expect(
        db
          .prepare("SELECT revoked_at FROM session ORDER BY revoked_at")
          .all()
          .map((row) => row.revoked_at),
      ).toEqual([...earlier, at, at]);
      // No vuelve a tocar las ya revocadas.
      expect(revokeEverySession(db, at + 1)).toBe(0);
      expect(
        db
          .prepare("SELECT count(*) AS n FROM session WHERE revoked_at = ?")
          .get(at)?.n,
      ).toBe(2);
      // Una sesión posterior funciona.
      const entry = identity.beginEntry();
      const signedIn = await identity.signIn({
        entryCookie: entry.cookie,
        csrfToken: entry.csrfToken,
        username: "docente",
        password: PASSWORD,
        correlationId: "después",
      });
      expect(signedIn.ok && identity.resolveSession(signedIn.cookie)).not.toBe(
        false,
      );
      expect(identity.resolveSession(cookie)).toBeNull();
    });

    test("lo enviado sin liquidar queda incierto y sigue contando; lo reservado se libera", () => {
      const { budget } = fixture.outline;
      const before = budget.status();
      expect(before.uncertain).toBe(0);

      expect(
        transaction(db, () => recoverInterruptedReservations(db, Date.now())),
      ).toEqual({ uncertain: 1, released: 1 });

      expect(stateOf(db, sentId)).toBe("uncertain");
      expect(stateOf(db, reservedId)).toBe("released");
      expect(stateOf(db, settledId)).toBe("settled");
      const after = budget.status();
      expect(after.uncertain).toBe(SENT_COST);
      // Solo se recupera lo que no llegó a enviarse.
      expect(after.available).toBe(before.available + 40);
      expect(after.settled).toBe(before.settled);

      // Una incierta no se libera ni se reenvía: solo la cierra una
      // conciliación.
      expect(budget.release(sentId)).toBe(false);
      expect(budget.markSent(sentId)).toBe(false);
      expect(stateOf(db, sentId)).toBe("uncertain");
      // Repetir la regla no cambia nada.
      expect(
        transaction(db, () => recoverInterruptedReservations(db, Date.now())),
      ).toEqual({ uncertain: 0, released: 0 });
      expect(budget.status()).toEqual(after);
    });
  });

  test("sin argumentos, explica el uso y no hace nada", () => {
    const result = run(RESTORE_SCRIPT, []);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Uso:");
  });
});
