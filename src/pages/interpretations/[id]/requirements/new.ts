// Formulario para añadir al inventario un requisito que falta
// (specs/002-boe-scorm-export: US1, FR-007). Exige sesión y el perfil de
// docente.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedPage } from "@/platform/web";
import { requirementFormView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "interpretations.requirement.new",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const interpretation = openStructuredInterpretation(runtime).get(
      param("id"),
    );
    if (interpretation === undefined) {
      return notFoundPage(session);
    }
    return requirementFormView({
      session,
      interpretation,
      requirement: undefined,
      mode: "add",
      values: {
        kind: "content",
        parent: "",
        code: "",
        text: "",
        section: "",
        pageFrom: String(interpretation.sectionPageFrom),
        pageTo: String(interpretation.sectionPageFrom),
        quote: "",
      },
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function NewRequirement(): null {
  return null;
}
