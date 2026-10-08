// Índice del temario: entradas con sus requisitos, cobertura por requisito
// con su referencia normativa, aprobación y rechazo
// (specs/002-boe-scorm-export: US2, FR-010 a FR-015 y FR-058). Exige sesión y
// el perfil de docente.
import { openOutlines } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { outlineView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "outlines.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const review = openOutlines(runtime).review(param("id"));
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return notFoundPage(session);
    }
    return outlineView({
      session,
      notice,
      review,
      document,
      provider: runtime.generation.provider,
      cost: {
        ...runtime.generation.runCost(review.outline.generationRunId),
        currency: runtime.generation.budget.status().currency,
      },
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function OutlinePage(): null {
  return null;
}
