// Formulario de subida de un documento oficial (specs/002-boe-scorm-export:
// US1, FR-001 y FR-002). Exige sesión y el perfil de docente.
import { openNormativeSource } from "@/modules/normative-source";
import { protectedPage } from "@/platform/web";
import { uploadView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "documents.upload.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime }) => {
    const source = openNormativeSource(runtime);
    return uploadView({
      session,
      notice,
      limits: source.limits,
      documents: source.listDocuments(),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function NewDocument(): null {
  return null;
}
