// Historial de un índice y de su temario: cambios, aprobaciones y rechazos
// del índice, generaciones del temario, versiones aprobadas, exportaciones y
// descargas (specs/002-boe-scorm-export: T087; FR-028 y FR-039; SC-010).
import { openContentExport } from "@/modules/content-export";
import { openOutlines, openSyllabus } from "@/modules/didactic-content";
import { notFoundPage, protectedPage } from "@/platform/web";
import {
  HISTORY_ACCESS,
  historyNames,
  historyRuns,
  outlineHistoryView,
} from "@/views";

export const getServerSideProps = protectedPage(
  { ...HISTORY_ACCESS, operation: "history.outline.view" },
  ({ session, runtime, param }) => {
    const review = openOutlines(runtime).review(param("id"));
    if (review === undefined) {
      return notFoundPage(session);
    }
    const { outline } = review;
    const syllabus = openSyllabus(runtime).review(outline.id);
    const overview = openContentExport(runtime).overview(outline.id);
    return outlineHistoryView({
      session,
      outline,
      unitCode: review.interpretation.unitCode,
      history: review.history,
      versions: syllabus?.versions ?? [],
      exports: overview?.exports ?? [],
      downloads: overview?.downloads ?? [],
      runs: historyRuns(runtime, "syllabus", outline.id),
      topics: (syllabus?.topics ?? []).flatMap(({ entry, topic }) =>
        topic === undefined ? [] : [{ id: topic.id, title: entry.title }],
      ),
      names: historyNames(runtime),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function HistoryPage(): null {
  return null;
}
