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
// 5. Se revocan todas las sesiones, y se comprueba una a una que las que
//    estaban abiertas han quedado revocadas: ninguna anterior a la copia
//    sirve.
// 6. Toda generación que constaba como enviada y sin liquidar queda como
//    incierta y sigue contando contra el presupuesto; lo reservado sin enviar
//    se libera. Se comprueba cada una, que su importe sigue contando y que no
//    queda ninguna en curso.
//
// Todo ocurre en un directorio de trabajo dentro del destino, que solo recibe
// el contenido si los seis pasos pasan. Si algo falla, el destino queda como
// estaba: vacío o sin crear. Escribe un informe en JSON y termina con código 1
// si algo falla. Que el servicio arranca sobre el directorio restaurado se
// comprueba aparte, como indica `docs/engineering/deployment.md`.
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createAudit } from "../../src/platform/audit/index.ts";
import { recoverInterruptedReservations } from "../../src/platform/generation/recovery.ts";
import { revokeEverySession } from "../../src/platform/identity/index.ts";
import {
  migrate,
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

/**
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {string} sql
 * @returns {string[]}
 */
function ids(db, sql) {
  return db
    .prepare(sql)
    .all()
    .map((row) => String(row.id));
}

/**
 * Reglas de las operaciones en curso, con su comprobación directa.
 * @param {import("node:sqlite").DatabaseSync} db
 * @param {Record<string, unknown>} report
 * @returns {string[]}
 */
function settleInProgress(db, report) {
  /** @type {string[]} */
  const problems = [];
  const before = count(db, "SELECT count(*) AS n FROM schema_migration");
  migrate(db, PLATFORM_MIGRATIONS);
  report.migrationsApplied =
    count(db, "SELECT count(*) AS n FROM schema_migration") - before;

  const uncertainCost =
    "SELECT coalesce(sum(reserved_cost), 0) AS n FROM budget_reservation " +
    "WHERE state = 'uncertain'";
  const openBefore = ids(
    db,
    "SELECT id_hash AS id FROM session WHERE revoked_at IS NULL",
  );
  const sentBefore = ids(
    db,
    "SELECT id FROM budget_reservation WHERE state = 'sent'",
  );
  const reservedBefore = ids(
    db,
    "SELECT id FROM budget_reservation WHERE state = 'reserved'",
  );
  const sentCost = count(
    db,
    "SELECT coalesce(sum(reserved_cost), 0) AS n FROM budget_reservation " +
      "WHERE state = 'sent'",
  );
  const uncertainBefore = count(db, uncertainCost);

  const at = Date.now();
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
      correlationId: randomUUID(),
      details: {
        via: "verify-restore",
        sessionsRevoked,
        markedUncertain: reservations.uncertain,
        released: reservations.released,
      },
    });
    return { sessionsRevoked, reservations };
  });

  // Comprobación directa, fila a fila, de lo que estaba en curso.
  const revokedAt = db.prepare(
    "SELECT revoked_at FROM session WHERE id_hash = ?",
  );
  const stateOf = db.prepare(
    "SELECT state FROM budget_reservation WHERE id = ?",
  );
  if (openBefore.some((id) => revokedAt.get(id)?.revoked_at !== at)) {
    problems.push("Una sesión abierta no ha quedado revocada.");
  }
  if (sentBefore.some((id) => stateOf.get(id)?.state !== "uncertain")) {
    problems.push("Una generación enviada no ha quedado como incierta.");
  }
  if (reservedBefore.some((id) => stateOf.get(id)?.state !== "released")) {
    problems.push("Una reserva sin enviar no se ha liberado.");
  }
  const openSessions = count(
    db,
    "SELECT count(*) AS n FROM session WHERE revoked_at IS NULL",
  );
  const inProgress = count(
    db,
    "SELECT count(*) AS n FROM budget_reservation " +
      "WHERE state IN ('reserved', 'sent')",
  );
  const uncertainAfter = count(db, uncertainCost);
  if (openSessions !== 0) {
    problems.push("Quedan sesiones sin revocar.");
  }
  if (inProgress !== 0) {
    problems.push("Quedan generaciones en curso sin un estado definido.");
  }
  if (uncertainAfter !== uncertainBefore + sentCost) {
    problems.push("El importe de lo enviado no sigue contando como incierto.");
  }
  report.sessionsRevoked = outcome.sessionsRevoked;
  report.openSessions = openSessions;
  report.markedUncertain = outcome.reservations.uncertain;
  report.released = outcome.reservations.released;
  report.reservationsInProgress = inProgress;
  report.uncertain = count(
    db,
    "SELECT count(*) AS n FROM budget_reservation WHERE state = 'uncertain'",
  );
  report.uncertainCost = uncertainAfter;
  return problems;
}

function main() {
  const [backup, target, ...rest] = process.argv.slice(2);
  if (backup === undefined || target === undefined || rest.length > 0) {
    fail(
      "Uso: node scripts/ops/verify-restore.mjs <copia> <directorio limpio>",
    );
    return;
  }
  /** @type {Record<string, unknown>} */
  const progress = {};
  const restored = restoreBackup(
    path.resolve(backup),
    path.resolve(target),
    (db) => settleInProgress(db, progress),
  );
  const report = {
    backup: restored.record?.name ?? null,
    backupSha256: restored.record?.sha256 ?? null,
    integrity: restored.integrity,
    foreignKeys: restored.foreignKeys,
    references: restored.references,
    referenceProblems: restored.referenceProblems,
    ...progress,
    // Solo con `true` queda algo en el destino.
    restored: restored.ok,
    ok: restored.ok,
    problems: restored.problems,
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (!restored.ok) {
    fail(
      "La restauración no ha superado la comprobación: no se ha dejado nada en el destino.",
    );
  }
}

try {
  main();
} catch (error) {
  fail(error instanceof Error ? error.message : "Ha fallado la restauración.");
}
