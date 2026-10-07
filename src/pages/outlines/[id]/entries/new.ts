// Formulario para añadir una entrada al índice (specs/002-boe-scorm-export:
// US2, FR-014). Exige sesión y el perfil de docente.
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
    if (review === undefined || review.historical) {
      return notFoundPage(session);
    }
    return entryFormView({
      session,
      review,
      entry: undefined,
      mode: "add",
      values: { title: "", requirementIds: [] },
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function NewEntryPage(): null {
  return null;
}
