// Devolución a revisión de una interpretación rechazada
// (specs/002-boe-scorm-export: US1, FR-070). Exige sesión, su testigo y el
// perfil de docente. No cambia el contenido ni inicia ninguna generación.
import { openNormativeSource } from "@/modules/normative-source";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedAction } from "@/platform/web";
import { changeProblem, interpretationView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "interpretations.resubmit",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const source = openNormativeSource(runtime);
    const interpretationId = field("interpretation");
    const revision = field("revision");
    const result = interpretations.resubmit({
      interpretationId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,

      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/interpretations/${interpretationId}`,
        notice: "interpretation_resubmitted",
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
            ? `${changeProblem("conflict")} Esta es la versión más reciente: revísala antes de devolverla a revisión.`
            : changeProblem(result.reason),
      }),
    );
  },
);
