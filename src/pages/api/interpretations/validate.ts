// Validación de una interpretación (specs/002-boe-scorm-export: US1, FR-057,
// FR-063 y FR-064). Exige sesión, su testigo y el perfil de docente. Es
// siempre una decisión humana explícita, sobre la versión que esa persona
// tiene delante y con la confirmación de que ha revisado el inventario contra
// la sección original. Nada valida de forma automática.
import { openNormativeSource } from "@/modules/normative-source";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedAction } from "@/platform/web";
import { changeProblem, interpretationView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "interpretations.validate",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const source = openNormativeSource(runtime);
    const interpretationId = field("interpretation");
    const revision = field("revision");
    const result = interpretations.validate({
      interpretationId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      inventoryReviewed: field("inventory_reviewed") === "yes",
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/interpretations/${interpretationId}`,
        notice: "interpretation_validated",
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
            ? `${changeProblem("conflict")} Esta es la versión más reciente: revísala antes de validarla.`
            : changeProblem(result.reason),
      }),
    );
  },
);
