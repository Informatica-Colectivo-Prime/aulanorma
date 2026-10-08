// Las instrucciones de incorporación manual de un paquete (specs/002-boe-scorm-export: US4, FR-035, FR-040 y
// FR-062). Exige sesión y el perfil de docente.
//
// La vigencia de la versión se comprueba en cada petición, también con un
// enlace obtenido antes: si ya no está vigente se deniega, y el intento queda
// registrado igual que una descarga concedida.
import { openContentExport } from "@/modules/content-export";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { DOWNLOAD_PROBLEMS, exportView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "export.download",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param, correlationId }) => {
    const service = openContentExport(runtime);
    const result = service.download({
      exportId: param("id"),
      item: "instructions",
      actorId: session.user.id,
      correlationId,
    });
    if (result.ok) {
      return {
        file: {
          body: result.body,
          contentType: "text/plain; charset=utf-8",
          filename: result.filename,
        },
      };
    }
    const overview =
      result.reason === "not_found" || result.outlineId === undefined
        ? undefined
        : service.overview(result.outlineId);
    const document =
      overview === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            overview.syllabus.outline.interpretation.documentId,
          );
    if (
      result.reason === "not_found" ||
      overview === undefined ||
      document === undefined
    ) {
      return notFoundPage(session);
    }
    return exportView({
      session,
      notice: undefined,
      overview,
      document,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
      status: result.reason === "unavailable" ? 404 : 422,
      problem: DOWNLOAD_PROBLEMS[result.reason],
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function ExportDownloadPage(): null {
  return null;
}
