// Ciclo de una reserva de presupuesto (specs/002-boe-scorm-export: T050;
// FR-021 y FR-066; contracts/generation-provider.md, «Presupuesto»). El envío
// se anota antes de llamar; con el consumo confirmado se liquida; solo se
// libera lo que no se envió; sin consumo confirmado queda incierto y sigue
// contando hasta que un administrador lo concilia. Los proveedores y sus
// consumos son simulados.
import { beforeEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import { createBudget, createGeneration } from "@/platform/generation";
import type {
  Budget,
  Generation,
  GenerationProvider,
  ProviderReply,
  ProviderRequest,
} from "@/platform/generation";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

const ADMIN = { actorId: "administrador-1", correlationId: "correlación-1" };
const SCHEMA = z.object({ answer: z.string() });
const REQUEST = {
  task: "outline" as const,
  promptVersion: "v1",
  instructions: "Instrucciones de prueba.",
  input: { dato: 1 },
  maxOutputTokens: 100,
  outputSchema: SCHEMA,
};
const USAGE = { model: "simulado", tokensIn: 10, tokensOut: 20 };
const ESTIMATE = 250;
const MAXIMUM = 300;

let db: Database;
let audit: Audit;
let budget: Budget;
let clock = 0;

// Proveedor simulado: estima 250, reserva 300 y responde lo que se le diga.
function provider(
  generate: (request: ProviderRequest) => Promise<ProviderReply>,
): GenerationProvider {
  return {
    name: "simulado",
    estimateCost: () => ESTIMATE,
    maxCost: () => MAXIMUM,
    generate,
  };
}

function ok(cost: number | null): Promise<ProviderReply> {
  return Promise.resolve({
    ok: true,
    output: { answer: "sí" },
    usage: USAGE,
    cost,
  });
}

function generationWith(
  generate: (request: ProviderRequest) => Promise<ProviderReply>,
  callTimeoutMs?: number,
): Generation {
  return createGeneration({
    db,
    budget,
    provider: provider(generate),
    now: () => (clock += 10),
    ...(callTimeoutMs === undefined ? {} : { callTimeoutMs }),
  });
}

function start(generation: Generation): string {
  return generation.startRun({
    kind: "outline",
    targetId: "objetivo",
    requestedBy: "docente-1",
  });
}

function setLimit(newLimit: number): void {
  budget.setLimit({
    ...ADMIN,
    newLimit,
    revision: budget.status().revision,
  });
}

beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  clock = Date.UTC(2026, 9, 7);
  budget = createBudget({
    db,
    audit,
    now: () => (clock += 10),
    maxOperationCost: 500,
  });
  setLimit(1000);
});

describe("una operación con consumo confirmado", () => {
  test("se anota el envío antes de llamar y se liquida con el coste real", async () => {
    const duringCall: string[] = [];
    const generation = generationWith(() => {
      duringCall.push(...budget.list().map((item) => item.state));
      return ok(180);
    });
    const runId = start(generation);
    expect(await generation.call(runId, REQUEST)).toEqual({
      status: "ok",
      output: { answer: "sí" },
    });
    // Al llamar al proveedor, la reserva ya constaba como enviada.
    expect(duringCall).toEqual(["sent"]);
    const [call] = generation.listCalls(runId);
    expect(budget.list()).toMatchObject([
      {
        runId,
        callId: call?.id,
        state: "settled",
        reservedCost: MAXIMUM,
        settledCost: 180,
      },
    ]);
    expect(budget.status()).toMatchObject({
      settled: 180,
      reserved: 0,
      available: 820,
    });
  });

  test("la estimación se registra aparte del coste máximo reservado", async () => {
    const generation = generationWith(() => ok(180));
    expect(generation.estimate(REQUEST)).toEqual({
      estimatedCost: ESTIMATE,
      maxCost: MAXIMUM,
    });
    const runId = start(generation);
    await generation.call(runId, REQUEST);
    expect(generation.listCalls(runId)).toMatchObject([
      { estimatedCost: ESTIMATE },
    ]);
    expect(budget.list()[0]?.reservedCost).toBe(MAXIMUM);
  });

  test("una salida inválida también se liquida: el consumo ocurrió", async () => {
    const generation = generationWith(() =>
      Promise.resolve({
        ok: true,
        output: { otra: 1 },
        usage: USAGE,
        cost: 90,
      }),
    );
    const runId = start(generation);
    expect(await generation.call(runId, REQUEST)).toEqual({
      status: "invalid_output",
    });
    expect(budget.list()).toMatchObject([
      { state: "settled", settledCost: 90 },
    ]);
  });
});

describe("sin presupuesto", () => {
  test("la operación no se envía y no queda ninguna reserva ni llamada", async () => {
    setLimit(200);
    let calls = 0;
    const generation = generationWith(() => {
      calls += 1;
      return ok(1);
    });
    const runId = start(generation);
    expect(await generation.call(runId, REQUEST)).toEqual({
      status: "budget_exceeded",
      reason: "insufficient_budget",
    });
    expect(calls).toBe(0);
    expect(budget.list()).toEqual([]);
    expect(generation.listCalls(runId)).toEqual([]);
  });

  test("por encima del máximo por operación tampoco se envía", async () => {
    budget = createBudget({
      db,
      audit,
      now: () => (clock += 10),
      maxOperationCost: MAXIMUM - 1,
    });
    let calls = 0;
    const generation = generationWith(() => {
      calls += 1;
      return ok(1);
    });
    expect(await generation.call(start(generation), REQUEST)).toEqual({
      status: "budget_exceeded",
      reason: "over_operation_maximum",
    });
    expect(calls).toBe(0);
  });

  test("dos operaciones simultáneas sobre un saldo para una: solo una se envía", async () => {
    setLimit(MAXIMUM + 50);
    let calls = 0;
    const generation = generationWith(async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return ok(MAXIMUM);
    });
    const results = await Promise.all([
      generation.call(start(generation), REQUEST),
      generation.call(start(generation), REQUEST),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      "budget_exceeded",
      "ok",
    ]);
    expect(calls).toBe(1);
    expect(budget.list()).toHaveLength(1);
    expect(budget.status()).toMatchObject({ settled: MAXIMUM, available: 50 });
  });
});

describe("consumo sin confirmar", () => {
  test.each([
    ["respuesta sin datos de consumo", () => ok(null)],
    ["fallo del proveedor", () => Promise.reject(new Error("sin conexión"))],
    ["consumo que no es un importe", () => ok(Number.NaN)],
  ])(
    "%s: la reserva queda incierta y sigue contando",
    async (_name, generate) => {
      const generation = generationWith(generate);
      const runId = start(generation);
      await generation.call(runId, REQUEST);
      expect(budget.list()).toMatchObject([
        { state: "uncertain", reservedCost: MAXIMUM, settledCost: null },
      ]);
      expect(budget.status()).toMatchObject({
        uncertain: MAXIMUM,
        available: 1000 - MAXIMUM,
      });
    },
  );

  test("tiempo agotado: la reserva queda incierta y la llamada, como error", async () => {
    const generation = generationWith(
      () =>
        new Promise<ProviderReply>(() => {
          // No responde nunca.
        }),
      15,
    );
    const runId = start(generation);
    expect(await generation.call(runId, REQUEST)).toEqual({
      status: "provider_error",
    });
    expect(budget.list()).toMatchObject([{ state: "uncertain" }]);
    expect(generation.listCalls(runId)).toMatchObject([
      { validationResult: "provider_error" },
    ]);
  });

  test("lo incierto impide operaciones que ya no caben", async () => {
    setLimit(MAXIMUM + 100);
    const uncertain = generationWith(() => ok(null));
    await uncertain.call(start(uncertain), REQUEST);
    const next = generationWith(() => ok(1));
    expect(await next.call(start(next), REQUEST)).toEqual({
      status: "budget_exceeded",
      reason: "insufficient_budget",
    });
  });
});

describe("caída entre el envío y la liquidación", () => {
  test("al arrancar, lo enviado sin liquidar queda incierto y lo reservado sin enviar se libera", () => {
    const generation = generationWith(() => ok(1));
    const sent = budget.reserve({
      runId: start(generation),
      task: "outline",
      maxCost: 300,
    });
    const neverSent = budget.reserve({
      runId: start(generation),
      task: "outline",
      maxCost: 200,
    });
    if (!sent.ok || !neverSent.ok) {
      throw new Error("Las reservas debían caber.");
    }
    budget.markSent(sent.reservationId);
    // El proceso cae aquí. Otro arranca sobre la misma base de datos.
    const restarted = createBudget({
      db,
      audit,
      now: () => (clock += 10),
      maxOperationCost: 500,
    });
    expect(restarted.recoverInterrupted()).toEqual({
      uncertain: 1,
      released: 1,
    });
    expect(restarted.get(sent.reservationId)?.state).toBe("uncertain");
    expect(restarted.get(neverSent.reservationId)?.state).toBe("released");
    expect(restarted.status()).toMatchObject({
      uncertain: 300,
      reserved: 0,
      available: 700,
    });
    // Repetirlo no cambia nada.
    expect(restarted.recoverInterrupted()).toEqual({
      uncertain: 0,
      released: 0,
    });
  });
});

describe("transiciones", () => {
  function reserved(): string {
    const generation = generationWith(() => ok(1));
    const result = budget.reserve({
      runId: start(generation),
      task: "outline",
      maxCost: 100,
    });
    if (!result.ok) {
      throw new Error("La reserva debía caber.");
    }
    return result.reservationId;
  }

  test("solo se libera lo que no se envió", () => {
    const notSent = reserved();
    expect(budget.release(notSent)).toBe(true);
    expect(budget.get(notSent)?.state).toBe("released");

    const sent = reserved();
    budget.markSent(sent);
    expect(budget.release(sent)).toBe(false);
    expect(budget.get(sent)?.state).toBe("sent");

    budget.markUncertain(sent, null);
    expect(budget.release(sent)).toBe(false);
    expect(budget.get(sent)?.state).toBe("uncertain");
  });

  test("no se liquida ni se da por incierto lo que no consta como enviado", () => {
    const id = reserved();
    expect(budget.settle(id, 10, null)).toBe(false);
    expect(budget.markUncertain(id, null)).toBe(false);
    expect(budget.get(id)?.state).toBe("reserved");
  });

  test("una reserva liquidada o liberada no cambia más", () => {
    const settled = reserved();
    budget.markSent(settled);
    budget.settle(settled, 10, null);
    const released = reserved();
    budget.release(released);
    for (const id of [settled, released]) {
      const before = budget.get(id);
      expect(budget.markSent(id)).toBe(false);
      expect(budget.settle(id, 99, null)).toBe(false);
      expect(budget.release(id)).toBe(false);
      expect(budget.markUncertain(id, null)).toBe(false);
      expect(budget.get(id)).toEqual(before);
    }
  });

  test("la base de datos impide las transiciones no admitidas, borrar una reserva y cambiar su importe", () => {
    const sent = reserved();
    budget.markSent(sent);
    const update = (sql: string) => () => {
      db.prepare(sql).run(sent);
    };
    expect(
      update("UPDATE budget_reservation SET state = 'released' WHERE id = ?"),
    ).toThrow(/transition not allowed/);
    expect(
      update("UPDATE budget_reservation SET state = 'reserved' WHERE id = ?"),
    ).toThrow(/transition not allowed/);
    expect(
      update("UPDATE budget_reservation SET reserved_cost = 1 WHERE id = ?"),
    ).toThrow(/transition not allowed/);
    expect(update("DELETE FROM budget_reservation WHERE id = ?")).toThrow(
      /cannot be deleted/,
    );
    budget.markUncertain(sent, null);
    expect(
      update("UPDATE budget_reservation SET state = 'released' WHERE id = ?"),
    ).toThrow(/transition not allowed/);
    budget.reconcile({
      ...ADMIN,
      reservationId: sent,
      confirmedCost: 5,
      note: "",
    });
    expect(
      update(
        "UPDATE budget_reservation SET state = 'uncertain', " +
          "settled_cost = NULL WHERE id = ?",
      ),
    ).toThrow(/transition not allowed/);
  });
});

describe("conciliación de una operación incierta", () => {
  async function uncertain(): Promise<string> {
    const generation = generationWith(() => ok(null));
    await generation.call(start(generation), REQUEST);
    const id = budget.list("uncertain").at(-1)?.id;
    if (id === undefined) {
      throw new Error("Debía haber una reserva incierta.");
    }
    return id;
  }

  test("la cierra con el importe confirmado y registra actor, fecha e importe", async () => {
    const id = await uncertain();
    expect(
      budget.reconcile({
        ...ADMIN,
        reservationId: id,
        confirmedCost: 120,
        note: "Según la factura del proveedor.",
      }),
    ).toEqual({ ok: true });
    expect(budget.get(id)).toMatchObject({
      state: "settled",
      settledCost: 120,
    });
    expect(budget.status()).toMatchObject({
      settled: 120,
      uncertain: 0,
      available: 880,
    });
    expect(db.prepare("SELECT * FROM reconciliation").all()).toMatchObject([
      {
        reservation_id: id,
        actor_id: ADMIN.actorId,
        confirmed_cost: 120,
        note: "Según la factura del proveedor.",
      },
    ]);
    expect(
      audit.list().filter((event) => event.action === "budget.reconcile"),
    ).toMatchObject([
      { actorId: ADMIN.actorId, result: "ok", details: { confirmed: 120 } },
    ]);
  });

  test("solo se concilia una reserva incierta, y una sola vez", async () => {
    const id = await uncertain();
    const input = { ...ADMIN, reservationId: id, confirmedCost: 1, note: "" };
    expect(budget.reconcile({ ...input, confirmedCost: -1 })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(budget.reconcile({ ...input, reservationId: "no-existe" })).toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(budget.reconcile(input)).toEqual({ ok: true });
    expect(budget.reconcile(input)).toEqual({
      ok: false,
      reason: "not_uncertain",
    });
    expect(db.prepare("SELECT * FROM reconciliation").all()).toHaveLength(1);
    expect(() => {
      db.exec("DELETE FROM reconciliation");
    }).toThrow(/append-only/);
  });
});

describe("reducción del límite con operaciones en curso", () => {
  test("la operación ya enviada no se cancela y se liquida; no se inicia ninguna nueva", async () => {
    let release: (() => void) | undefined;
    const generation = generationWith(async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return ok(280);
    });
    const running = generation.call(start(generation), REQUEST);
    // Con la operación enviada y sin liquidar, el administrador reduce el
    // límite por debajo de lo comprometido.
    expect(budget.list()).toMatchObject([{ state: "sent" }]);
    setLimit(100);
    const refused = generationWith(() => ok(1));
    expect(await refused.call(start(refused), REQUEST)).toMatchObject({
      status: "budget_exceeded",
    });
    release?.();
    expect(await running).toMatchObject({ status: "ok" });
    expect(budget.list()).toMatchObject([
      { state: "settled", settledCost: 280 },
    ]);
    expect(budget.status()).toMatchObject({
      limit: 100,
      settled: 280,
      available: -180,
    });
  });
});
