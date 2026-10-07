// Interpretación de una unidad formativa: inventario con su jerarquía,
// duración como metadato, acceso a cada página de origen, validación y
// rechazo (specs/002-boe-scorm-export: US1, FR-005 a FR-008, FR-057 y
// FR-070). Exige sesión y el perfil de docente.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedPage } from "@/platform/web";
import { interpretationView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "interpretations.view",
    allowPendingPasswordChange: false,
  },
  ({ session, notice, runtime, param }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const source = openNormativeSource(runtime);
    const interpretation = interpretations.get(param("id"));
    const document =
      interpretation === undefined
        ? undefined
        : source.getDocument(interpretation.documentId);
    if (interpretation === undefined || document === undefined) {
      return notFoundPage(session);
    }
    return interpretationView({
      session,
      notice,
      interpretation,
      document,
      history: interpretations.history(interpretation.id),
      unresolvedPages: source.unresolvedPages(document.id),
      superseded: source.substitutesOf(document.id).length > 0,
      provider: runtime.generation.provider,
      names: new Map(
        runtime.identity.listUsers().map((user) => [user.id, user.username]),
      ),
    });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function InterpretationPage(): null {
  return null;
}
