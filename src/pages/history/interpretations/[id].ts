// Historial de una interpretación: correcciones, validaciones, rechazos con
// su motivo y las generaciones de su índice (specs/002-boe-scorm-export:
// T087; FR-028; SC-010 y SC-044).
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedPage } from "@/platform/web";
import {
  HISTORY_ACCESS,
  historyNames,
  historyRuns,
  interpretationHistoryView,
} from "@/views";

export const getServerSideProps = protectedPage(
  { ...HISTORY_ACCESS, operation: "history.interpretation.view" },
  ({ session, runtime, param }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const interpretation = interpretations.get(param("id"));
    if (interpretation === undefined) {
      return notFoundPage(session);
    }
    return interpretationHistoryView({
      session,
      interpretation,
      history: interpretations.history(interpretation.id),
      runs: historyRuns(runtime, "outline", interpretation.id),
      names: historyNames(runtime),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function HistoryPage(): null {
  return null;
}
