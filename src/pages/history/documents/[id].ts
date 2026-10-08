// Historial de un documento: su registro, los documentos que lo sustituyen,
// las páginas sin texto revisadas y las generaciones de su interpretación
// (specs/002-boe-scorm-export: T087; FR-028; SC-034 y SC-044).
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import {
  documentHistoryView,
  HISTORY_ACCESS,
  historyNames,
  historyRuns,
} from "@/views";

export const getServerSideProps = protectedPage(
  { ...HISTORY_ACCESS, operation: "history.document.view" },
  ({ session, runtime, param }) => {
    const source = openNormativeSource(runtime);
    const document = source.getDocument(param("id"));
    if (document === undefined) {
      return notFoundPage(session);
    }
    return documentHistoryView({
      session,
      document,
      replaced:
        document.replacesDocumentId === null
          ? undefined
          : source.getDocument(document.replacesDocumentId),
      substitutes: source.substitutesOf(document.id),
      pages: source.listPages(document.id),
      runs: historyRuns(runtime, "interpretation", document.id),
      names: historyNames(runtime),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function HistoryPage(): null {
  return null;
}
