// Petición de una propuesta de índice (specs/002-boe-scorm-export: US2,
// FR-009 y FR-021). Exige sesión, su testigo y el perfil de docente. La pide
// una persona de forma explícita, a partir de una interpretación validada y
// vigente; sin una reserva de presupuesto dentro de los límites no se envía.
import { openOutlines } from "@/modules/didactic-content";
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const ID = /^[0-9a-f]{32}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "outlines.request",
    allowPendingPasswordChange: false,
  },
  async ({ field, session, runtime, correlationId }) => {
    const interpretationId = field("interpretation");
    if (!ID.test(interpretationId)) {
      return { location: "/documents" };
    }
    const result = await openOutlines(runtime).request({
      interpretationId,
      actorId: session.user.id,
      correlationId,
    });
    if (!result.ok) {
      return result.reason === "interpretation_not_found"
        ? { location: "/documents" }
        : {
            location: `/interpretations/${interpretationId}`,
            notice: { code: "outline_refused", detail: result.reason },
          };
    }
    return {
      location: `/outlines/${result.outlineId}`,
      notice: "outline_created",
    };
  },
);
