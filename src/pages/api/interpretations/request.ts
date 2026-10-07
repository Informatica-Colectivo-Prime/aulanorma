// Petición de la interpretación de una unidad formativa
// (specs/002-boe-scorm-export: US1, FR-005 y FR-006). Exige sesión, su testigo
// y el perfil de docente. La pide una persona de forma explícita: nada la
// inicia automáticamente, tampoco registrar un documento sustituto.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const ID = /^[0-9a-f]{32}$/;
const PAGE = /^[1-9][0-9]{0,4}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "interpretations.request",
    allowPendingPasswordChange: false,
  },
  async ({ field, session, runtime, correlationId }) => {
    const documentId = field("document");
    if (!ID.test(documentId)) {
      return { location: "/documents" };
    }
    const from = field("page_from");
    const to = field("page_to");
    const result = await openStructuredInterpretation(runtime).request({
      documentId,
      unitCode: field("unit_code").trim(),
      pageFrom: PAGE.test(from) ? Number(from) : 0,
      pageTo: PAGE.test(to) ? Number(to) : 0,
      actorId: session.user.id,
      correlationId,
    });
    if (!result.ok) {
      return result.reason === "document_not_found"
        ? { location: "/documents" }
        : {
            location: `/documents/${documentId}`,
            notice: { code: "interpretation_refused", detail: result.reason },
          };
    }
    return {
      location: `/interpretations/${result.interpretationId}`,
      notice: "interpretation_created",
    };
  },
);
