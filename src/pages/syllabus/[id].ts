// Temario de un índice: estimación y lanzamiento de la generación, progreso
// y estado incompleto, reanudación, desarrollo de cada requisito y aprobación
// de la versión con lo pendiente (specs/002-boe-scorm-export: US3, FR-016,
// FR-021, FR-023, FR-060 y FR-066). Exige sesión y el perfil de docente.
import { openSyllabus } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { syllabusView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "syllabus.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const syllabus = openSyllabus(runtime).review(param("id"));
    const document =
      syllabus === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            syllabus.outline.interpretation.documentId,
          );
    if (syllabus === undefined || document === undefined) {
      return notFoundPage(session);
    }
    return syllabusView({
      session,
      notice,
      syllabus,
      document,
      provider: runtime.generation.provider,
      budget: runtime.generation.budget.status(),
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function SyllabusPage(): null {
  return null;
}
