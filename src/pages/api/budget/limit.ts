// Modificación del límite de coste del proyecto (specs/002-boe-scorm-export:
// FR-027, FR-028 y FR-066; SC-037). Exige sesión, su testigo y el perfil de
// administración: un docente no puede fijarlo ni aumentarlo. Queda registrado
// quién, cuándo, el valor anterior y el nuevo. Solo cambia el límite: no
// inicia ni reanuda ninguna generación.
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;
const AMOUNT = /^([0-9]{1,4})(?:[.,]([0-9]{1,6}))?$/;

// Cantidad en unidades de la moneda, en millonésimas; `NaN` si no lo es.
function millionths(value: string): number {
  const match = AMOUNT.exec(value.trim());
  return match === null
    ? Number.NaN
    : Number(match[1]) * 1_000_000 + Number((match[2] ?? "").padEnd(6, "0"));
}

export default protectedAction(
  {
    role: "admin",
    operation: "budget.limit",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const revision = field("revision");
    const result = runtime.generation.budget.setLimit({
      newLimit: millionths(field("limit")),
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      actorId: session.user.id,
      correlationId,
    });
    return Promise.resolve({
      location: "/budget",
      notice: result.ok
        ? ("budget_limit_changed" as const)
        : { code: "budget_refused" as const, detail: result.reason },
    });
  },
);
