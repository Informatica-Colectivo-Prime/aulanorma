// Formulario para corregir o retirar un requisito del inventario
// (specs/002-boe-scorm-export: US1, FR-007). Exige sesión y el perfil de
// docente.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedPage } from "@/platform/web";
import { requirementFormView, valuesOf } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "interpretations.requirement.view",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const interpretation = openStructuredInterpretation(runtime).get(
      param("id"),
    );
    const requirement = interpretation?.requirements.find(
      ({ id, withdrawn }) => id === param("rid") && !withdrawn,
    );
    if (interpretation === undefined || requirement === undefined) {
      return notFoundPage(session);
    }
    return requirementFormView({
      session,
      interpretation,
      requirement,
      mode: "edit",
      values: valuesOf(requirement),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function EditRequirement(): null {
  return null;
}
