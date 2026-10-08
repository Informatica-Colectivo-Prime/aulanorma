// Exportación de una versión aprobada (specs/002-boe-scorm-export: US4,
// FR-030, FR-031, FR-037 y FR-039). Exige sesión, su testigo y el perfil de
// docente.
//
// La vigencia de la versión y la cobertura se comprueban en esta petición:
// si falta algo responde 422 con lo pendiente, y no existe ningún parámetro
// ni perfil que lo evite. Cada intento queda registrado. Un fallo no deja
// ningún fichero.
import { openContentExport } from "@/modules/content-export";
import { openNormativeSource } from "@/modules/normative-source";
import { openSyllabus } from "@/modules/didactic-content";
import { notFoundPage, protectedAction } from "@/platform/web";
import { exportProblem, exportView, KIND_NAMES } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

export default protectedAction(
  {
    role: "teacher",
    operation: "export.create",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const service = openContentExport(runtime);
    const versionId = field("version");
    const outlineId = openSyllabus(runtime).locateVersion(versionId)?.outlineId;
    const syllabus =
      outlineId === undefined
        ? undefined
        : openSyllabus(runtime).review(outlineId);
    const document =
      syllabus === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            syllabus.outline.interpretation.documentId,
          );
    const result = service.export({
      versionId,
      documentTitle: document?.title ?? "",
      kindNames: KIND_NAMES,
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok && outlineId !== undefined) {
      return Promise.resolve({
        location: `/export/${outlineId}`,
        notice: "export_created",
      });
    }
    const overview =
      outlineId === undefined ? undefined : service.overview(outlineId);
    if (overview === undefined || document === undefined || result.ok) {
      return Promise.resolve(notFoundPage(session));
    }
    return Promise.resolve(
      exportView({
        session,
        notice: undefined,
        overview,
        document,
        names: new Map(
          runtime.identity.listUsers().map((user) => [user.id, user.username]),
        ),
        status: result.reason === "storage_error" ? 500 : 422,
        problem: exportProblem(result.reason),
      }),
    );
  },
);
