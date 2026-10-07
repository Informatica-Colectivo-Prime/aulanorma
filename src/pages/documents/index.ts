// Documentos registrados (specs/002-boe-scorm-export: US1, FR-001). Exige
// sesión y el perfil de docente.
import { openNormativeSource } from "@/modules/normative-source";
import { protectedPage } from "@/platform/web";
import { documentsView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "documents.list",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime }) =>
    documentsView({
      session,
      notice,
      documents: openNormativeSource(runtime).listDocuments(),
    }),
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function Documents(): null {
  return null;
}
