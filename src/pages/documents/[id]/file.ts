// El PDF original de un documento registrado, tal como se subió
// (specs/002-boe-scorm-export: US1, FR-008; research.md, R4). Exige sesión y
// el perfil de docente. Se sirve con su tipo exacto y sin que el navegador
// pueda interpretarlo como otra cosa; nunca se convierte ni se ejecuta.
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "documents.file",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const body = openNormativeSource(runtime).readOriginal(param("id"));
    if (body === undefined) {
      return notFoundPage(session);
    }
    return {
      file: {
        body,
        contentType: "application/pdf",
        filename: `documento-${param("id")}.pdf`,
      },
    };
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function DocumentFile(): null {
  return null;
}
