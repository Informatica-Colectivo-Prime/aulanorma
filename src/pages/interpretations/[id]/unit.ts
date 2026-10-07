// Formulario para corregir los datos de la unidad: denominación y duración
// (specs/002-boe-scorm-export: US1, FR-007 y FR-061). Exige sesión y el
// perfil de docente.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { notFoundPage, protectedPage } from "@/platform/web";
import { unitFormView, unitValuesOf } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "interpretations.unit.view",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const interpretation = openStructuredInterpretation(runtime).get(
      param("id"),
    );
    if (interpretation === undefined) {
      return notFoundPage(session);
    }
    return unitFormView({
      session,
      interpretation,
      values: unitValuesOf(interpretation),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function InterpretationUnit(): null {
  return null;
}
