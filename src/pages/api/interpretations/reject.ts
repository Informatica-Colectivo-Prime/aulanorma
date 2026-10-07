// Rechazo de una interpretación (specs/002-boe-scorm-export: US1, FR-070 y
// FR-063). Exige sesión, su testigo y el perfil de docente, y un motivo.
// Rechazar conserva el contenido y no inicia ninguna generación.
import { openNormativeSource } from "@/modules/normative-source";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedAction } from "@/platform/web";
import { changeProblem, interpretationView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "interpretations.reject",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const source = openNormativeSource(runtime);
    const interpretationId = field("interpretation");
    const revision = field("revision");
    const result = interpretations.reject({
      interpretationId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      reason: field("reason"),
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/interpretations/${interpretationId}`,
        notice: "interpretation_rejected",
      });
    }
    // No se ha registrado nada. La respuesta muestra la versión más reciente
    // de la interpretación, con el motivo, para que el usuario la revise
    // antes de repetir su decisión.
    const interpretation = interpretations.get(interpretationId);
    const document =
      interpretation === undefined
        ? undefined
        : source.getDocument(interpretation.documentId);
    if (interpretation === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    return Promise.resolve(
      interpretationView({
        session,
        notice: undefined,
        interpretation,
        document,
        history: interpretations.history(interpretation.id),
        unresolvedPages: source.unresolvedPages(document.id),
        superseded: source.substitutesOf(document.id).length > 0,
        provider: runtime.generation.provider,
        names: new Map(
          runtime.identity.listUsers().map((user) => [user.id, user.username]),
        ),
        status: result.reason === "conflict" ? 409 : 422,
        problem:
          result.reason === "conflict"
            ? `${changeProblem("conflict")} Esta es la versión más reciente: revísala antes de rechazarla. Tu motivo sigue en el formulario.`
            : changeProblem(result.reason),
        reason: field("reason"),
      }),
    );
  },
);
