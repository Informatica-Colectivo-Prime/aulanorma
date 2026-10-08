// Historial de un tema: su generación, sus cambios, aprobaciones y rechazos
// con su motivo (specs/002-boe-scorm-export: T087; FR-028; SC-010).
import { openSyllabus } from "@/modules/didactic-content";
import { notFoundPage, protectedPage } from "@/platform/web";
import { HISTORY_ACCESS, historyNames, topicHistoryView } from "@/views";

export const getServerSideProps = protectedPage(
  { ...HISTORY_ACCESS, operation: "history.topic.view" },
  ({ session, runtime, param }) => {
    const review = openSyllabus(runtime).reviewTopic(param("id"));
    if (review === undefined) {
      return notFoundPage(session);
    }
    return topicHistoryView({
      session,
      title: review.entry.title,
      outlineId: review.outline.outline.id,
      history: review.history,
      names: historyNames(runtime),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function HistoryPage(): null {
  return null;
}
