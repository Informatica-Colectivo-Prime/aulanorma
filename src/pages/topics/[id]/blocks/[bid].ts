// Formulario de un bloque de desarrollo de un tema: editar su texto y los requisitos que desarrolla
// (specs/002-boe-scorm-export: US3, FR-018 y FR-022). Exige sesión y el
// perfil de docente.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { blockFormView, blockValuesOf } from "@/views";

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
    const block = review?.topic.blocks.find(
      (item) =>
        item.id === param("bid") &&
        !item.removed &&
        item.kind === "development",
    );
    if (
      review === undefined ||
      document === undefined ||
      block === undefined ||
      review.outline.historical
    ) {
      return notFoundPage(session);
    }
    return blockFormView({
      session,
      review,
      document,
      block,
      mode: "edit",
      values: blockValuesOf(block),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function BlockPage(): null {
  return null;
}
