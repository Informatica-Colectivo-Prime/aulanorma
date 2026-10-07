// Vista previa del índice (specs/002-boe-scorm-export: US2, FR-013 y FR-038).
// No genera ningún fichero. Sin una aprobación vigente o con la cobertura
// incompleta se identifica como borrador no entregable. Exige sesión y el
// perfil de docente.
import { openOutlines } from "@/modules/didactic-content";
import { notFoundPage, protectedPage } from "@/platform/web";
import { outlinePreviewView } from "@/views";

export const getServerSideProps = protectedPage(
  {
    role: "teacher",
    operation: "outlines.preview",
    allowPendingPasswordChange: false,
  },
  ({ session, runtime, param }) => {
    const review = openOutlines(runtime).review(param("id"));
    return review === undefined
      ? notFoundPage(session)
      : outlinePreviewView({ session, review });
  },
);

// La respuesta la escribe `getServerSideProps`; este componente no se
// renderiza.
export default function OutlinePreviewPage(): null {
  return null;
}
