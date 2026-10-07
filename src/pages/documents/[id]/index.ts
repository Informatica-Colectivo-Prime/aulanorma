// Registro de un documento: procedencia, huella, páginas que requieren
// atención e interpretaciones (specs/002-boe-scorm-export: US1, FR-001,
// FR-003 y FR-064). Exige sesión y el perfil de docente.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { documentView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "documents.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const source = openNormativeSource(runtime);
    const document = source.getDocument(param("id"));
    if (document === undefined) {
      return notFoundPage(session);
    }
    return documentView({
      session,
      notice,
      document,
      replaced:
        document.replacesDocumentId === null
          ? undefined
          : source.getDocument(document.replacesDocumentId),
      substitutes: source.substitutesOf(document.id),
      pages: source.listPages(document.id),
      interpretations: openStructuredInterpretation(runtime).listForDocument(
        document.id,
      ),
      budget: runtime.generation.budget.status(),
      provider: runtime.generation.provider,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function DocumentRecord(): null {
  return null;
}
