// Presupuesto de generación (specs/002-boe-scorm-export: T049; FR-021,
// FR-027, FR-028 y FR-066; contracts/generation-provider.md, «Presupuesto»).
// Reserva atómica contra el máximo por operación y el límite acumulado, y
// modificación del límite. Los consumos son simulados: no hay proveedor ni
// precios reales.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import { createBudget, MAX_AMOUNT } from "@/platform/generation";
import type { Budget } from "@/platform/generation";
import {
  migrate,
  openDatabase,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

const ADMIN = { actorId: "administrador-1", correlationId: "correlación-1" };
const MAX_OPERATION = 400;

let db: Database;
let audit: Audit;
let budget: Budget;
let clock = 0;
let directory: string | undefined;

function runIn(database: Database): string {
  const id = `ejecucion-${String((clock += 1))}`;
  database
    .prepare(
      "INSERT INTO generation_run (id, kind, target_id, requested_by, " +
        "requested_at, status, estimated_cost) " +
        "VALUES (?, 'outline', 'objetivo', 'docente-1', 0, 'running', 0)",
    )
    .run(id);
  return id;
}

function setLimit(newLimit: number) {
  return budget.setLimit({
    ...ADMIN,
    newLimit,
    revision: budget.status().revision,
  });
}

function reserve(maxCost: number, target: Budget = budget) {
  return target.reserve({ runId: runIn(db), task: "outline", maxCost });
}

beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  clock = Date.UTC(2026, 9, 7);
  budget = createBudget({
    db,
    audit,
    now: () => (clock += 1000),
    maxOperationCost: MAX_OPERATION,
  });
});

afterEach(() => {
  if (directory !== undefined) {
    rmSync(directory, { recursive: true, force: true });
    directory = undefined;
  }
});

describe("estado inicial", () => {
  test("el límite es cero, la moneda no está fijada y no hay nada comprometido", () => {
    expect(budget.status()).toEqual({
      limit: 0,
      currency: "XXX",
      revision: 1,
      maxOperationCost: MAX_OPERATION,
      settled: 0,
      reserved: 0,
      uncertain: 0,
      available: 0,
    });
  });

  test("sin presupuesto no se reserva ninguna operación con coste", () => {
    expect(reserve(1)).toEqual({ ok: false, reason: "insufficient_budget" });
    expect(budget.list()).toEqual([]);
  });
});

describe("reserva", () => {
  beforeEach(() => {
    setLimit(1000);
  });

  test("una operación que cabe queda reservada y descuenta de lo disponible", () => {
    const result = reserve(300);
    expect(result.ok).toBe(true);
    expect(budget.status()).toMatchObject({ reserved: 300, available: 700 });
    expect(budget.list()).toMatchObject([
      { state: "reserved", reservedCost: 300, settledCost: null },
    ]);
  });

  test("una operación por encima del máximo por operación no se reserva, aunque quepa en lo disponible", () => {
    expect(reserve(MAX_OPERATION + 1)).toEqual({
      ok: false,
      reason: "over_operation_maximum",
    });
    expect(reserve(MAX_OPERATION).ok).toBe(true);
  });

  test("una operación que no cabe en lo disponible no se reserva y no deja rastro", () => {
    expect(reserve(400).ok).toBe(true);
    expect(reserve(400).ok).toBe(true);
    expect(reserve(201)).toEqual({ ok: false, reason: "insufficient_budget" });
    expect(reserve(200).ok).toBe(true);
    expect(budget.status()).toMatchObject({ reserved: 1000, available: 0 });
    expect(budget.list()).toHaveLength(3);
  });

  test("si no puede calcularse un coste máximo válido, no se reserva", () => {
    for (const cost of [-1, 1.5, Number.NaN, Infinity, MAX_AMOUNT + 1]) {
      expect(reserve(cost)).toEqual({ ok: false, reason: "invalid_cost" });
    }
    expect(budget.list()).toEqual([]);
  });

  test("lo liquidado, lo reservado y lo incierto cuentan; lo liberado, no", () => {
    const settled = reserve(100);
    const uncertain = reserve(200);
    const released = reserve(300);
    const pending = reserve(50);
    if (!settled.ok || !uncertain.ok || !released.ok || !pending.ok) {
      throw new Error("Las reservas debían caber.");
    }
    budget.markSent(settled.reservationId);
    budget.settle(settled.reservationId, 40, null);
    budget.markSent(uncertain.reservationId);
    budget.markUncertain(uncertain.reservationId, null);
    budget.release(released.reservationId);
    expect(budget.status()).toMatchObject({
      settled: 40,
      reserved: 50,
      uncertain: 200,
      available: 710,
    });
  });
});

describe("dos operaciones sobre el mismo saldo", () => {
  test("en el mismo proceso, solo una reserva", () => {
    setLimit(500);
    const results = [reserve(300), reserve(300)];
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(budget.status()).toMatchObject({ reserved: 300, available: 200 });
  });

  test("con dos conexiones a la misma base de datos, la segunda ve la reserva de la primera", () => {
    directory = mkdtempSync(path.join(tmpdir(), "aulanorma-budget-"));
    const first = openDatabase(directory);
    migrate(first, PLATFORM_MIGRATIONS);
    const second = openDatabase(directory);
    const budgets = [first, second].map((database) =>
      createBudget({
        db: database,
        audit: createAudit(database),
        now: () => (clock += 1000),
        maxOperationCost: MAX_OPERATION,
      }),
    );
    const [one, two] = budgets;
    if (one === undefined || two === undefined) {
      throw new Error("Faltan los presupuestos.");
    }
    one.setLimit({ ...ADMIN, newLimit: 500, revision: 1 });
    const results = [
      one.reserve({ runId: runIn(first), task: "outline", maxCost: 300 }),
      two.reserve({ runId: runIn(second), task: "outline", maxCost: 300 }),
    ];
    expect(results.map((result) => result.ok)).toEqual([true, false]);
    expect(two.status()).toMatchObject({ reserved: 300, available: 200 });
    first.close();
    second.close();
  });

  test("una transacción de escritura abierta en otra conexión impide reservar a la vez", () => {
    directory = mkdtempSync(path.join(tmpdir(), "aulanorma-budget-"));
    const first = openDatabase(directory);
    migrate(first, PLATFORM_MIGRATIONS);
    const second = openDatabase(directory);
    second.exec("PRAGMA busy_timeout = 0");
    const blocked = createBudget({
      db: second,
      audit: createAudit(second),
      now: () => (clock += 1000),
      maxOperationCost: MAX_OPERATION,
    });
    const runId = runIn(second);
    first.exec("BEGIN IMMEDIATE");
    expect(() =>
      blocked.reserve({ runId, task: "outline", maxCost: 0 }),
    ).toThrow();
    first.exec("COMMIT");
    expect(blocked.reserve({ runId, task: "outline", maxCost: 0 }).ok).toBe(
      true,
    );
    first.close();
    second.close();
  });
});

describe("modificación del límite", () => {
  test("registra actor, fecha, valor anterior y valor nuevo, y lo audita", () => {
    expect(setLimit(1000)).toEqual({ ok: true, revision: 2 });
    expect(setLimit(600)).toEqual({ ok: true, revision: 3 });
    expect(budget.changes()).toMatchObject([
      { actorId: ADMIN.actorId, previousLimit: 0, newLimit: 1000 },
      { actorId: ADMIN.actorId, previousLimit: 1000, newLimit: 600 },
    ]);
    expect(budget.changes().every((change) => change.at > 0)).toBe(true);
    expect(
      audit
        .list()
        .filter((event) => event.action === "budget.limit")
        .map((event) => [event.actorId, event.result, event.details]),
    ).toEqual([
      [ADMIN.actorId, "ok", { previous: 0, next: 1000 }],
      [ADMIN.actorId, "ok", { previous: 1000, next: 600 }],
    ]);
  });

  test("con una revisión que ya no es la actual no cambia nada", () => {
    setLimit(1000);
    expect(budget.setLimit({ ...ADMIN, newLimit: 5, revision: 1 })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(budget.status().limit).toBe(1000);
    expect(budget.changes()).toHaveLength(1);
  });

  test("un límite que no es un importe válido se rechaza", () => {
    for (const newLimit of [-1, 0.5, MAX_AMOUNT + 1]) {
      expect(budget.setLimit({ ...ADMIN, newLimit, revision: 1 })).toEqual({
        ok: false,
        reason: "invalid",
      });
    }
    expect(budget.status().limit).toBe(0);
  });

  test("reducirlo por debajo de lo comprometido no altera las reservas y no deja iniciar nada nuevo", () => {
    setLimit(1000);
    const sent = reserve(400);
    const waiting = reserve(300);
    if (!sent.ok || !waiting.ok) {
      throw new Error("Las reservas debían caber.");
    }
    budget.markSent(sent.reservationId);
    const before = budget.list();
    expect(setLimit(100).ok).toBe(true);
    expect(budget.list()).toEqual(before);
    expect(budget.status()).toMatchObject({
      limit: 100,
      reserved: 700,
      available: -600,
    });
    // Ni siquiera una operación sin coste: no hay presupuesto disponible.
    expect(reserve(0)).toEqual({ ok: false, reason: "insufficient_budget" });
    // La operación ya enviada sigue su curso y se liquida.
    expect(budget.settle(sent.reservationId, 350, null)).toBe(true);
    expect(budget.status()).toMatchObject({ settled: 350, reserved: 300 });
  });

  test("ampliarlo no inicia ni reanuda nada: solo cambia el límite", () => {
    setLimit(100);
    expect(reserve(300)).toEqual({ ok: false, reason: "insufficient_budget" });
    setLimit(1000);
    expect(budget.list()).toEqual([]);
    expect(db.prepare("SELECT status FROM generation_run").all()).toEqual([
      { status: "running" },
    ]);
  });

  test("los cambios del límite son de solo inserción y el presupuesto no se borra", () => {
    setLimit(1000);
    expect(() => {
      db.exec("UPDATE budget_change SET new_limit = 1");
    }).toThrow(/append-only/);
    expect(() => {
      db.exec("DELETE FROM budget_change");
    }).toThrow(/append-only/);
    expect(() => {
      db.exec("DELETE FROM budget");
    }).toThrow(/cannot be deleted/);
    expect(() => {
      db.exec(
        "INSERT INTO budget (id, project_limit, currency, revision) " +
          "VALUES (2, 1, 'XXX', 1)",
      );
    }).toThrow();
  });
});
