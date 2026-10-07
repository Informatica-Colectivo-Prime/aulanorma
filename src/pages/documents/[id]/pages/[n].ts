// Una página de un documento: su texto extraído y el acceso a esa página en
// el PDF original (specs/002-boe-scorm-export: US1, FR-004, FR-008 y FR-064).
// Exige sesión y el perfil de docente.
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { pageView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "documents.page.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const source = openNormativeSource(runtime);
    const document = source.getDocument(param("id"));
    const page =
      document === undefined
        ? undefined
        : source.getPage(document.id, Number(param("n")));
    if (document === undefined || page === undefined) {
      return notFoundPage(session);
    }
    return pageView({
      session,
      notice,
      document,
      page,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function DocumentPage(): null {
  return null;
}
