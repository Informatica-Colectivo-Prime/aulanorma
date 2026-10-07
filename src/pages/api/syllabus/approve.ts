// Aprobación de una versión del temario (specs/002-boe-scorm-export: US3,
// FR-023, FR-025, FR-060 y FR-063). Exige sesión, su testigo y el perfil de
// docente.
//
// Es siempre una decisión humana explícita, sobre el temario tal como esa
// persona lo tiene delante. Exige el índice aprobado y vigente, todos los
// temas desarrollados y aprobados, y cada requisito citado y desarrollado:
// si falta algo responde 422 con lo pendiente, y no existe ningún parámetro
// ni perfil que lo evite.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import { syllabusView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default protectedAction(
  {
    role: "teacher",
    operation: "syllabus.approve",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const service = openSyllabus(runtime);
    const outlineId = field("outline");
    const result = service.approveVersion({
      outlineId,
      fingerprint: field("fingerprint"),
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return Promise.resolve({
        location: `/syllabus/${outlineId}`,
        notice: "version_approved",
      });
    }
    // No se ha registrado nada. La respuesta muestra el temario actual, con
    // el motivo y lo pendiente.
    const syllabus = service.review(outlineId);
    const document =
      syllabus === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            syllabus.outline.interpretation.documentId,
          );
    if (syllabus === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    const conflict = result.reason === "conflict";
    return Promise.resolve(
      syllabusView({
        session,
        notice: undefined,
        syllabus,
        document,
        provider: runtime.generation.provider,
        budget: runtime.generation.budget.status(),
        names: new Map(
          runtime.identity.listUsers().map((user) => [user.id, user.username]),
        ),
        status: conflict ? 409 : 422,
        problem: conflict
          ? "El temario ha cambiado desde que abriste la página. No se ha aprobado nada. Este es su estado más reciente: revísalo antes de repetir la aprobación."
          : "No se puede aprobar la versión: falta completar lo que se indica. No existe ninguna forma de aprobarla así.",
        ...(result.blockers === undefined
          ? {}
          : { blockedBy: result.blockers }),
      }),
    );
  },
);
