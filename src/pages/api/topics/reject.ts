// Rechazo de un tema (specs/002-boe-scorm-export: US3, FR-022, FR-063 y
// FR-070). Exige sesión, su testigo y el perfil de docente. El motivo es
// obligatorio. Rechazar conserva el contenido y no inicia ninguna generación.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import { topicProblem, topicView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "topics.reject",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const syllabus = openSyllabus(runtime);
    const topicId = field("topic");
    const revision = field("revision");
    const target = {
      topicId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      actorId: session.user.id,
      correlationId,
    };
    const result = syllabus.rejectTopic({ ...target, reason: field("reason") });
    if (result.ok) {
      return Promise.resolve({
        location: `/topics/${topicId}`,
        notice: "topic_rejected",
      });
    }
    // No se ha registrado nada. La respuesta muestra la versión más reciente
    // del tema, con el motivo.
    const review = syllabus.reviewTopic(topicId);
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.outline.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    return Promise.resolve(
      topicView({
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
            ? `${topicProblem("conflict")} Esta es la versión más reciente: revísala antes de rechazarla.`
            : topicProblem(result.reason),
        reason: field("reason"),
      }),
    );
  },
);
