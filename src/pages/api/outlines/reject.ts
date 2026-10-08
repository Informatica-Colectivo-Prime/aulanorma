// Rechazo de un índice (specs/002-boe-scorm-export: US2, FR-015, FR-063 y
// FR-070). Exige sesión, su testigo y el perfil de docente. El motivo es
// obligatorio. Rechazar conserva el contenido y no inicia ninguna
// generación.
import { openOutlines } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import { outlineProblem, outlineView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "outlines.reject",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const outlines = openOutlines(runtime);
    const outlineId = field("outline");
    const revision = field("revision");
    const reason = field("reason");
    const result = outlines.reject({
      outlineId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      reason,
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/outlines/${outlineId}`,
        notice: "outline_rejected",
      });
    }
    // No se ha registrado nada: se conserva el motivo escrito.
    const review = outlines.review(outlineId);
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    return Promise.resolve(
      outlineView({
        session,
        notice: undefined,
        review,
        document,
        provider: runtime.generation.provider,
        names: new Map(
          runtime.identity.listUsers().map((user) => [user.id, user.username]),
        ),
        status: result.reason === "conflict" ? 409 : 422,
        problem:
          result.reason === "conflict"
            ? `${outlineProblem("conflict")} Esta es la versión más reciente: revísala antes de rechazarla.`
            : outlineProblem(result.reason),
        reason,
      }),
    );
  },
);
