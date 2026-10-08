// Exportación de un temario: qué se puede exportar ahora, el formulario de
// exportación y el historial de exportaciones y descargas
// (specs/002-boe-scorm-export: US4, FR-030, FR-031, FR-035 y FR-039). Exige
// sesión y el perfil de docente. El identificador es el del índice.
import { openContentExport } from "@/modules/content-export";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { exportView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "export.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const overview = openContentExport(runtime).overview(param("id"));
    const document =
      overview === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            overview.syllabus.outline.interpretation.documentId,
          );
    if (overview === undefined || document === undefined) {
      return notFoundPage(session);
    }
    return exportView({
      session,
      notice,
      overview,
      document,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function ExportPage(): null {
  return null;
}
