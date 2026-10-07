// Tema del temario junto a su fuente normativa: cada bloque identificado como
// requisito del BOE o como desarrollo didáctico, con acceso a la página de
// origen, edición, aprobación y rechazo (specs/002-boe-scorm-export: US3,
// FR-017, FR-018, FR-022 y FR-070). Exige sesión y el perfil de docente.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { topicView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "topics.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const review = openSyllabus(runtime).reviewTopic(param("id"));
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.outline.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return notFoundPage(session);
    }
    return topicView({
      session,
      notice,
      review,
      document,
      provider: runtime.generation.provider,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function TopicPage(): null {
  return null;
}
