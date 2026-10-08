// @ts-check
// Restauración comprobada (specs/002-boe-scorm-export: T071; research.md,
// R11; FR-069 y SC-040).
//
//   node scripts/ops/verify-restore.mjs <copia> <directorio limpio>
//
// Restaura la copia en un directorio que no existe o está vacío y comprueba
// el resultado. No lee la configuración del servicio ni toca su directorio de
// datos: sirve igual para probar una copia en otro equipo que para recuperar
// el servicio, indicando como destino el nuevo directorio de datos.
//
// 1. La copia es la que se registró: marcada como buena, completa y con las
//    mismas huellas.
// 2. La verificación de integridad de SQLite pasa y no hay claves ajenas sin
//    su fila.
// 3. Cada referencia tiene su fichero y su huella coincide.
// 4. Se aplican las migraciones pendientes, como al arrancar el servicio.
// 5. Se revocan todas las sesiones: ninguna anterior a la copia sirve.
// 6. Toda generación que constaba como enviada y sin liquidar queda como
//    incierta y sigue contando contra el presupuesto; lo reservado sin enviar
//    se libera. Se confirma que no queda ninguna en curso.
//
// Escribe un informe en JSON y termina con código 1 si algo falla: un
// directorio cuya comprobación falla no debe ponerse en servicio. Que el
// servicio arranca sobre el directorio restaurado se comprueba aparte, como
// indica `docs/engineering/deployment.md`.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createAudit } from "../../src/platform/audit/index.ts";
import { recoverInterruptedReservations } from "../../src/platform/generation/recovery.ts";
import { revokeEverySession } from "../../src/platform/identity/index.ts";
import {
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
  restoreBackup,
  transaction,
} from "../../src/platform/persistence/index.ts";

/** @param {string} message */
function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} sql
 */
function count(db, sql) {
  return Number(db.prepare(sql).get()?.n ?? 0);
}

function main() {
  const [backup, target, ...rest] = process.argv.slice(2);
  if (backup === undefined || target === undefined || rest.length > 0) {
    fail(
      "Uso: node scripts/ops/verify-restore.mjs <copia> <directorio limpio>",
    );
    return;
  }
  const targetDirectory = path.resolve(target);
  const restored = restoreBackup(path.resolve(backup), targetDirectory);
  /** @type {Record<string, unknown>} */
  const report = {
    backup: restored.record?.name ?? null,
    backupSha256: restored.record?.sha256 ?? null,
    integrity: restored.integrity,
    foreignKeys: restored.foreignKeys,
    references: restored.references,
    referenceProblems: restored.referenceProblems,
  };
  const problems = [...restored.problems];

  if (restored.ok) {
    const db = openDatabase(targetDirectory);
    try {
      const before = count(db, "SELECT count(*) AS n FROM schema_migration");
      migrate(db, PLATFORM_MIGRATIONS);
      report.migrationsApplied =
        count(db, "SELECT count(*) AS n FROM schema_migration") - before;

      const at = Date.now();
      const correlationId = randomUUID();
      const audit = createAudit(db);
      const outcome = transaction(db, () => {
        const sessionsRevoked = revokeEverySession(db, at);
        const reservations = recoverInterruptedReservations(db, at);
        audit.record({
          actorId: null,
          action: "restore.verified",
          targetKind: null,
          targetId: null,
          result: "ok",
          correlationId,
          details: {
            via: "verify-restore",
            sessionsRevoked,
            markedUncertain: reservations.uncertain,
            released: reservations.released,
          },
        });
        return { sessionsRevoked, reservations };
      });
      const openSessions = count(
        db,
        "SELECT count(*) AS n FROM session WHERE revoked_at IS NULL",
      );
      const inProgress = count(
        db,
        "SELECT count(*) AS n FROM budget_reservation " +
          "WHERE state IN ('reserved', 'sent')",
      );
      report.sessionsRevoked = outcome.sessionsRevoked;
      report.openSessions = openSessions;
      report.markedUncertain = outcome.reservations.uncertain;
      report.released = outcome.reservations.released;
      report.reservationsInProgress = inProgress;
      report.uncertain = count(
        db,
        "SELECT count(*) AS n FROM budget_reservation WHERE state = 'uncertain'",
      );
      report.uncertainCost = count(
        db,
        "SELECT coalesce(sum(reserved_cost), 0) AS n FROM budget_reservation " +
          "WHERE state = 'uncertain'",
      );
      if (openSessions !== 0) {
        problems.push("Quedan sesiones sin revocar.");
      }
      if (inProgress !== 0) {
        problems.push("Quedan generaciones en curso sin un estado definido.");
      }
    } finally {
      db.close();
    }
  }

  report.ok = problems.length === 0;
  report.problems = problems;
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (problems.length > 0) {
    fail("La restauración no ha superado la comprobación.");
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Ha fallado la restauración.");
}
