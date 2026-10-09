// Presupuesto de generación (specs/002-boe-scorm-export: FR-021, FR-027,
// FR-028 y FR-066; contracts/generation-provider.md, «Presupuesto»;
// data-model.md, «Plataforma»).
//
// El límite del proyecto es acumulado, sin reinicios, y hay además un máximo
// por operación, que viene de la configuración. Ninguna operación se envía sin
// una reserva de su coste máximo, hecha en una transacción que comprueba ambos
// límites. Lo disponible es el límite menos lo liquidado, lo reservado y lo
// incierto.
//
// Ciclo de una reserva: `reserved → sent → settled`; `reserved → released`
// solo si la operación no llegó a enviarse; `sent → uncertain` si su consumo
// no puede confirmarse; `uncertain → settled` solo con la conciliación de un
// administrador. Una reserva enviada o incierta nunca se libera y sigue
// contando por su importe máximo. Los disparadores de la base de datos
// imponen estas transiciones.
//
// Los importes son enteros, en millonésimas de la moneda del presupuesto.
// Modificar el límite solo cambia el límite: no inicia, reanuda ni cancela
// nada.
import { randomBytes } from "node:crypto";
import type { Audit } from "@/platform/audit";
import { transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import { recoverInterruptedReservations } from "./recovery";

export type ReservationState =
  "reserved" | "sent" | "settled" | "released" | "uncertain";

export interface BudgetStatus {
  readonly limit: number;
  // `XXX` mientras la moneda no esté fijada.
  readonly currency: string;
  readonly revision: number;
  readonly maxOperationCost: number;
  readonly settled: number;
  // Reservado por operaciones en curso, enviadas o no.
  readonly reserved: number;
  readonly uncertain: number;
  // Puede ser negativo si el límite se redujo por debajo de lo comprometido.
  readonly available: number;
}

export interface Reservation {
  readonly id: string;
  readonly runId: string;
  readonly callId: string | null;
  readonly task: string;
  readonly reservedCost: number;
  readonly settledCost: number | null;
  readonly state: ReservationState;
  readonly createdAt: number;
  readonly sentAt: number | null;
  readonly closedAt: number | null;
}

export interface BudgetChange {
  readonly id: string;
  readonly actorId: string;
  readonly at: number;
  readonly previousLimit: number;
  readonly newLimit: number;
}

export type ReserveRefusal =
  // No se pudo calcular un coste máximo válido para la operación.
  "invalid_cost" | "over_operation_maximum" | "insufficient_budget";

export type ReserveResult =
  | { readonly ok: true; readonly reservationId: string }
  | { readonly ok: false; readonly reason: ReserveRefusal };

export type BudgetChangeResult =
  | { readonly ok: true; readonly revision: number }
  | { readonly ok: false; readonly reason: "conflict" | "invalid" };

export type ReconcileResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason: "not_found" | "not_uncertain" | "invalid";
    };

// `amounts_without_currency`: hay un límite o importes anotados cuando la
// moneda aún no estaba fijada, y no se les puede asignar una después.
export type FixCurrencyResult =
  "ok" | "other_currency" | "amounts_without_currency";

interface Actor {
  readonly actorId: string;
  readonly correlationId: string;
}

export interface Budget {
  status(): BudgetStatus;
  // Fija la moneda del presupuesto, que nace sin fijar, cuando se activa un
  // proveedor con precios. Solo con el límite a cero y sin ningún importe
  // anotado; con la moneda ya fijada, solo comprueba que es la misma.
  fixCurrency(currency: string): FixCurrencyResult;
  // Reserva el coste máximo de una operación, o no reserva nada.
  reserve(input: {
    readonly runId: string;
    readonly task: string;
    readonly maxCost: number;
  }): ReserveResult;
  // Anota el envío. Se llama antes de llamar al proveedor.
  markSent(reservationId: string): boolean;
  // Liquida una reserva enviada con el consumo confirmado.
  settle(reservationId: string, cost: number, callId: string | null): boolean;
  // Libera una reserva que consta que no se envió.
  release(reservationId: string): boolean;
  // Deja como incierta una reserva enviada cuyo consumo no se confirma.
  markUncertain(reservationId: string, callId: string | null): boolean;
  // Tras un arranque: lo enviado sin liquidar queda incierto y lo reservado
  // sin enviar se libera. Devuelve cuántas reservas cambió.
  recoverInterrupted(): {
    readonly uncertain: number;
    readonly released: number;
  };
  get(reservationId: string): Reservation | undefined;
  list(state?: ReservationState): readonly Reservation[];
  changes(): readonly BudgetChange[];
  // Solo cambia el límite. Quién puede hacerlo lo decide quien llama.
  setLimit(
    input: Actor & {
      readonly newLimit: number;
      // Revisión del presupuesto que el administrador tenía abierta.
      readonly revision: number;
    },
  ): BudgetChangeResult;
  // Cierra una reserva incierta con el importe que confirma un administrador.
  reconcile(
    input: Actor & {
      readonly reservationId: string;
      readonly confirmedCost: number;
      readonly note: string;
    },
  ): ReconcileResult;
}

// Mil unidades de la moneda, en millonésimas: cota de cualquier importe.
export const MAX_AMOUNT = 1_000_000_000;
const STATES: readonly ReservationState[] = [
  "reserved",
  "sent",
  "settled",
  "released",
  "uncertain",
];

function amount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_AMOUNT;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function optionalInteger(value: unknown): number | null {
  return value === null || value === undefined ? null : integer(value);
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

export function createBudget({
  db,
  audit,
  now,
  maxOperationCost,
}: {
  readonly db: Database;
  readonly audit: Audit;
  readonly now: () => number;
  readonly maxOperationCost: number;
}): Budget {
  const sum = (column: string, states: string): number =>
    integer(
      db
        .prepare(
          `SELECT COALESCE(SUM(${column}), 0) AS total ` +
            `FROM budget_reservation WHERE state IN (${states})`,
        )
        .get()?.total,
    );

  const status = (): BudgetStatus => {
    const row = db.prepare("SELECT * FROM budget WHERE id = 1").get();
    const limit = integer(row?.project_limit);
    const settled = sum("settled_cost", "'settled'");
    const reserved = sum("reserved_cost", "'reserved', 'sent'");
    const uncertain = sum("reserved_cost", "'uncertain'");
    return {
      limit,
      currency: text(row?.currency),
      revision: integer(row?.revision),
      maxOperationCost,
      settled,
      reserved,
      uncertain,
      available: limit - settled - reserved - uncertain,
    };
  };

  const reservationOf = (row: Record<string, unknown>): Reservation => ({
    id: text(row.id),
    runId: text(row.run_id),
    callId: typeof row.call_id === "string" ? row.call_id : null,
    task: text(row.task),
    reservedCost: integer(row.reserved_cost),
    settledCost: optionalInteger(row.settled_cost),
    state: STATES.find((state) => state === row.state) ?? "uncertain",
    createdAt: integer(row.created_at),
    sentAt: optionalInteger(row.sent_at),
    closedAt: optionalInteger(row.closed_at),
  });

  // Cada transición exige el estado de partida: si la reserva ya no está en
  // él, no cambia nada.
  const changed = (result: { changes: number | bigint }): boolean =>
    Number(result.changes) === 1;

  return {
    status,

    fixCurrency(currency) {
      return transaction(db, (): FixCurrencyResult => {
        const current = status();
        if (current.currency === currency) {
          return "ok";
        }
        const result: FixCurrencyResult =
          current.currency !== "XXX" || !/^[A-Z]{3}$/.test(currency)
            ? "other_currency"
            : current.limit !== 0 ||
                current.settled !== 0 ||
                current.reserved !== 0 ||
                current.uncertain !== 0
              ? "amounts_without_currency"
              : "ok";
        // Solo queda registrado el cambio: un intento rechazado se repite en
        // cada petición mientras no se corrija, y no añade nada.
        if (result === "ok") {
          db.prepare("UPDATE budget SET currency = ? WHERE id = 1").run(
            currency,
          );
          audit.record({
            actorId: null,
            action: "budget.currency",
            targetKind: "budget",
            targetId: null,
            result: "ok",
            correlationId: "startup",
            details: { currency },
          });
        }
        return result;
      });
    },

    reserve({ runId, task, maxCost }) {
      // La comprobación y la inserción van en la misma transacción de
      // escritura: dos operaciones no pueden reservar el mismo saldo.
      return transaction(db, (): ReserveResult => {
        if (!amount(maxCost)) {
          return { ok: false, reason: "invalid_cost" };
        }
        if (maxCost > maxOperationCost) {
          return { ok: false, reason: "over_operation_maximum" };
        }
        if (maxCost > status().available) {
          return { ok: false, reason: "insufficient_budget" };
        }
        const reservationId = newId();
        db.prepare(
          "INSERT INTO budget_reservation (id, run_id, task, reserved_cost, " +
            "state, created_at) VALUES (?, ?, ?, ?, 'reserved', ?)",
        ).run(reservationId, runId, task, maxCost, now());
        return { ok: true, reservationId };
      });
    },

    markSent(reservationId) {
      return changed(
        db
          .prepare(
            "UPDATE budget_reservation SET state = 'sent', sent_at = ? " +
              "WHERE id = ? AND state = 'reserved'",
          )
          .run(now(), reservationId),
      );
    },

    settle(reservationId, cost, callId) {
      if (!amount(cost)) {
        return false;
      }
      return changed(
        db
          .prepare(
            "UPDATE budget_reservation SET state = 'settled', " +
              "settled_cost = ?, call_id = ?, closed_at = ? " +
              "WHERE id = ? AND state = 'sent'",
          )
          .run(cost, callId, now(), reservationId),
      );
    },

    release(reservationId) {
      return changed(
        db
          .prepare(
            "UPDATE budget_reservation SET state = 'released', closed_at = ? " +
              "WHERE id = ? AND state = 'reserved'",
          )
          .run(now(), reservationId),
      );
    },

    markUncertain(reservationId, callId) {
      return changed(
        db
          .prepare(
            "UPDATE budget_reservation SET state = 'uncertain', call_id = ? " +
              "WHERE id = ? AND state = 'sent'",
          )
          .run(callId, reservationId),
      );
    },

    recoverInterrupted() {
      return transaction(db, () => recoverInterruptedReservations(db, now()));
    },

    get(reservationId) {
      const row = db
        .prepare("SELECT * FROM budget_reservation WHERE id = ?")
        .get(reservationId);
      return row === undefined ? undefined : reservationOf(row);
    },

    list(state) {
      return (
        state === undefined
          ? db
              .prepare(
                "SELECT * FROM budget_reservation ORDER BY created_at, id",
              )
              .all()
          : db
              .prepare(
                "SELECT * FROM budget_reservation WHERE state = ? " +
                  "ORDER BY created_at, id",
              )
              .all(state)
      ).map(reservationOf);
    },

    changes() {
      return db
        .prepare("SELECT * FROM budget_change ORDER BY at, id")
        .all()
        .map((row) => ({
          id: text(row.id),
          actorId: text(row.actor_id),
          at: integer(row.at),
          previousLimit: integer(row.previous_limit),
          newLimit: integer(row.new_limit),
        }));
    },

    setLimit({ newLimit, revision, actorId, correlationId }) {
      return transaction(db, (): BudgetChangeResult => {
        const current = status();
        const result: BudgetChangeResult = !amount(newLimit)
          ? { ok: false, reason: "invalid" }
          : current.revision !== revision
            ? { ok: false, reason: "conflict" }
            : { ok: true, revision: revision + 1 };
        if (result.ok) {
          db.prepare(
            "UPDATE budget SET project_limit = ?, revision = ? WHERE id = 1",
          ).run(newLimit, result.revision);
          db.prepare(
            "INSERT INTO budget_change (id, actor_id, at, previous_limit, " +
              "new_limit) VALUES (?, ?, ?, ?, ?)",
          ).run(newId(), actorId, now(), current.limit, newLimit);
        }
        audit.record({
          actorId,
          action: "budget.limit",
          targetKind: "budget",
          targetId: null,
          result: result.ok ? "ok" : "failed",
          correlationId,
          details: result.ok
            ? { previous: current.limit, next: newLimit }
            : { reason: result.reason },
        });
        return result;
      });
    },

    reconcile({ reservationId, confirmedCost, note, actorId, correlationId }) {
      return transaction(db, (): ReconcileResult => {
        const row = db
          .prepare("SELECT state FROM budget_reservation WHERE id = ?")
          .get(reservationId);
        const trimmed = note.trim();
        const result: ReconcileResult =
          row === undefined
            ? { ok: false, reason: "not_found" }
            : row.state !== "uncertain"
              ? { ok: false, reason: "not_uncertain" }
              : !amount(confirmedCost) || trimmed.length > 500
                ? { ok: false, reason: "invalid" }
                : { ok: true };
        if (result.ok) {
          db.prepare(
            "UPDATE budget_reservation SET state = 'settled', " +
              "settled_cost = ?, closed_at = ? " +
              "WHERE id = ? AND state = 'uncertain'",
          ).run(confirmedCost, now(), reservationId);
          db.prepare(
            "INSERT INTO reconciliation (id, reservation_id, actor_id, at, " +
              "confirmed_cost, note) VALUES (?, ?, ?, ?, ?, ?)",
          ).run(newId(), reservationId, actorId, now(), confirmedCost, trimmed);
        }
        audit.record({
          actorId,
          action: "budget.reconcile",
          targetKind: "budget_reservation",
          targetId: row === undefined ? null : reservationId,
          result: result.ok ? "ok" : "failed",
          correlationId,
          details: result.ok
            ? { confirmed: confirmedCost }
            : { reason: result.reason },
        });
        return result;
      });
    },
  };
}
