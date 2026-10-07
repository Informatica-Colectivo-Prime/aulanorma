// Formulario para renombrar una entrada del índice o cambiar los requisitos
// en los que se apoya (specs/002-boe-scorm-export: US2, FR-014). Exige sesión
// y el perfil de docente.
import { openOutlines } from "@/modules/didactic-content";
import { notFoundPage, protectedPage } from "@/platform/web";
import { entryFormView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "outlines.edit.view",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const review = openOutlines(runtime).review(param("id"));
    const entry = review?.outline.entries.find(
      (item) => item.id === param("eid") && !item.removed,
    );
    if (review === undefined || review.historical || entry === undefined) {
      return notFoundPage(session);
    }
    return entryFormView({
      session,
      review,
      entry,
      mode: "edit",
      values: { title: entry.title, requirementIds: entry.requirementIds },
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function EntryPage(): null {
  return null;
}
