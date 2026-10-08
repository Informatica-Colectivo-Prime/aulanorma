// Vista previa de lo que se exportaría (specs/002-boe-scorm-export: US4,
// FR-038). Muestra el contenido con el renderizador del paquete; no ejecuta
// su seguimiento y lo dice. Un borrador se identifica como no entregable, y
// de esta página nunca sale un fichero. Exige sesión y el perfil de docente.
import { openContentExport } from "@/modules/content-export";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { exportPreviewView, KIND_NAMES } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "export.preview",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const service = openContentExport(runtime);
    const overview = service.overview(param("id"));
    const document =
      overview === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            overview.syllabus.outline.interpretation.documentId,
          );
    const preview =
      document === undefined
        ? undefined
        : service.preview(param("id"), {
            documentTitle: document.title,
            kindNames: KIND_NAMES,
          });
    if (overview === undefined || preview === undefined) {
      return notFoundPage(session);
    }
    return exportPreviewView({
      session,
      outlineId: param("id"),
      unitCode: overview.syllabus.outline.interpretation.unitCode,
      preview,
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function ExportPreviewPage(): null {
  return null;
}
