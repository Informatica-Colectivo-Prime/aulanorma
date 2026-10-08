// Historial: índice de los elementos de los que hay algo registrado
// (specs/002-boe-scorm-export: T087; FR-028 y FR-039). Solo lectura, para las
// cuentas con el perfil de docente o de administración.
import { openOutlines, openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { protectedPage } from "@/platform/web";
import { HISTORY_ACCESS, historyIndexView } from "@/views";

export const getServerSideProps = protectedPage(
  { ...HISTORY_ACCESS, operation: "history.view" },
  ({ session, runtime }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const outlines = openOutlines(runtime);
    const syllabus = openSyllabus(runtime);
    return historyIndexView({
      session,
      items: openNormativeSource(runtime)
        .listDocuments()
        .map((document) => ({
          document,
          interpretations: interpretations
            .listForDocument(document.id)
            .map((interpretation) => {
              const outline = outlines.getForInterpretation(interpretation.id);
              return {
                interpretation,
                outline,
                topics:
                  outline === undefined
                    ? []
                    : (syllabus.review(outline.id)?.topics ?? []).flatMap(
                        ({ entry, topic }) =>
                          topic === undefined
                            ? []
                            : [{ id: topic.id, title: entry.title }],
                      ),
              };
            }),
        })),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function HistoryPage(): null {
  return null;
}
