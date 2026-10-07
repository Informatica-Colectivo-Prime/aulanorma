// Resolución de una página sin texto extraíble (specs/002-boe-scorm-export:
// US1, FR-064). Exige sesión, su testigo y el perfil de docente, y la
// confirmación expresa del revisor.
import { openNormativeSource } from "@/modules/normative-source";
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const ID = /^[0-9a-f]{32}$/;
const PAGE = /^[1-9][0-9]{0,4}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "documents.page.resolve",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const documentId = field("document");
    const page = field("page");
    const valid = ID.test(documentId) && PAGE.test(page);
    const result = openNormativeSource(runtime).resolvePage({
      documentId,
      pageNumber: valid ? Number(page) : 0,
      confirmed: field("confirmed") === "yes",
      actorId: session.user.id,
      correlationId,
    });
    return Promise.resolve({
      location: valid ? `/documents/${documentId}/pages/${page}` : "/documents",
      notice: result.ok ? "page_resolved" : "page_not_resolved",
    });
  },
);
