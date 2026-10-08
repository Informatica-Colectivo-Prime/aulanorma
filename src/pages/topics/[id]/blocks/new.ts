// Formulario de un bloque de desarrollo de un tema: añadir uno nuevo
// (specs/002-boe-scorm-export: US3, FR-018 y FR-022). Exige sesión y el
// perfil de docente.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { blockFormView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "topics.edit.view",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const review = openSyllabus(runtime).reviewTopic(param("id"));
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.outline.interpretation.documentId,
          );
    if (
      review === undefined ||
      document === undefined ||
      review.outline.historical ||
      review.topic.status === "pending" ||
      review.topic.status === "failed"
    ) {
      return notFoundPage(session);
    }
    return blockFormView({
      session,
      review,
      document,
      block: undefined,
      mode: "add_development",
      values: { text: "", requirementIds: [] },
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function NewBlockPage(): null {
  return null;
}
