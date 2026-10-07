// Petición de la interpretación de una unidad formativa
// (specs/002-boe-scorm-export: US1, FR-005, FR-006 y FR-021). Exige sesión, su
// testigo y el perfil de docente. La pide una persona de forma explícita: nada
// la inicia automáticamente, tampoco registrar un documento sustituto.
//
// Tiene dos pasos. El primero, con la unidad y las páginas, no envía nada:
// responde con la estimación del coste, el máximo que se reserva y el
// presupuesto disponible. El segundo es la confirmación, que lleva las cifras
// que el usuario vio: si ya no son las actuales, tampoco se envía nada y se
// muestran las nuevas.
import { openNormativeSource } from "@/modules/normative-source";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { protectedAction } from "@/platform/web";
import { interpretationConfirmView } from "@/views";

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
    const document = ID.test(documentId)
      ? openNormativeSource(runtime).getDocument(documentId)
      : undefined;
    if (document === undefined) {
      return { location: "/documents" };
    }
    const interpretations = openStructuredInterpretation(runtime);
    const from = field("page_from");
    const to = field("page_to");
    const section = {
      documentId,
      unitCode: field("unit_code").trim(),
      pageFrom: PAGE.test(from) ? Number(from) : 0,
      pageTo: PAGE.test(to) ? Number(to) : 0,
    };
    const refused = (reason: string) => ({
      location: `/documents/${documentId}`,
      notice: { code: "interpretation_refused" as const, detail: reason },
    });
    const estimate = interpretations.estimate(section);
    if (!estimate.ok) {
      return refused(estimate.reason);
    }
    const { cost } = estimate;
    const confirmed = field("confirmed") === "yes";
    const changed =
      confirmed &&
      (field("shown_estimate") !== String(cost.estimatedCost) ||
        field("shown_max") !== String(cost.maxCost));
    if (!confirmed || changed) {
      return interpretationConfirmView({
        session,
        document,
        unitCode: section.unitCode,
        pageFrom: section.pageFrom,
        pageTo: section.pageTo,
        cost,
        budget: runtime.generation.budget.status(),
        provider: runtime.generation.provider,
        changed,
      });
    }
    const result = await interpretations.request({
      ...section,
      actorId: session.user.id,
      correlationId,
    });
    if (!result.ok) {
      return result.reason === "document_not_found"
        ? { location: "/documents" }
        : refused(result.reason);
    }
    return {
      location: `/interpretations/${result.interpretationId}`,
      notice: "interpretation_created",
    };
  },
);
