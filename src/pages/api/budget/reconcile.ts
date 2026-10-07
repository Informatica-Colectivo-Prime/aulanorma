// Conciliación de una operación de resultado incierto
// (specs/002-boe-scorm-export: FR-021 y FR-028). Exige sesión, su testigo y el
// perfil de administración. Cierra la reserva con el importe que confirma el
// administrador y registra quién, cuándo y cuánto. No reenvía la operación ni
// inicia ninguna generación.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const AMOUNT = /^([0-9]{1,4})(?:[.,]([0-9]{1,6}))?$/;

function millionths(value: string): number {
  const match = AMOUNT.exec(value.trim());
  return match === null
    ? Number.NaN
    : Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
}

export default protectedAction(
  {
    role: "admin",
    operation: "budget.reconcile",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const result = runtime.generation.budget.reconcile({
      reservationId: field("reservation"),
      confirmedCost: millionths(field("cost")),
      note: field("note"),
      actorId: session.user.id,
      correlationId,
    });
    return Promise.resolve({
      location: "/budget",
      notice: result.ok
        ? ("budget_reconciled" as const)
        : { code: "budget_refused" as const, detail: result.reason },
    });
  },
);
