// Interpretación de una unidad formativa: inventario con su jerarquía,
// duración como metadato, acceso a cada página de origen, validación y
// rechazo (specs/002-boe-scorm-export: US1, FR-005 a FR-008, FR-057 y
// FR-070), y el acceso a su índice o la petición de una propuesta (US2,
// FR-009 y FR-021). Exige sesión y el perfil de docente.
import { openOutlines } from "@/modules/didactic-content";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { interpretationView, outlineSection } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "interpretations.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const source = openNormativeSource(runtime);
    const interpretation = interpretations.get(param("id"));
    const document =
      interpretation === undefined
        ? undefined
        : source.getDocument(interpretation.documentId);
    if (interpretation === undefined || document === undefined) {
      return notFoundPage(session);
    }
    const outlines = openOutlines(runtime);
    const outline = outlines.getForInterpretation(interpretation.id);
    const superseded = source.substitutesOf(document.id).length > 0;
    return interpretationView({
      session,
      notice,
      interpretation,
      document,
      outlineSection: outlineSection({
        session,
        interpretation,
        outline,
        approved:
          outline !== undefined &&
          outlines.review(outline.id)?.approval !== undefined,
        valid:
          !superseded &&
          interpretations.currentValidation(interpretation.id) !== undefined,
        cost: outlines.estimate(interpretation.id),
        budget: runtime.generation.budget.status(),
        provider: runtime.generation.provider,
      }),
      history: interpretations.history(interpretation.id),
      unresolvedPages: source.unresolvedPages(document.id),
      superseded,
      provider: runtime.generation.provider,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function InterpretationPage(): null {
  return null;
}
