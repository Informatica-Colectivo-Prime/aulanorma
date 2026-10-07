// Vuelta a revisión de un índice rechazado, sin cambiarlo
// (specs/002-boe-scorm-export: US2, FR-063 y FR-070). Exige sesión, su
// testigo y el perfil de docente.
import { openOutlines } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import { outlineProblem, outlineView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "outlines.resubmit",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const outlines = openOutlines(runtime);
    const outlineId = field("outline");
    const revision = field("revision");
    const result = outlines.resubmit({
      outlineId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/outlines/${outlineId}`,
        notice: "outline_resubmitted",
      });
    }
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
        problem: outlineProblem(result.reason),
      }),
    );
  },
);
