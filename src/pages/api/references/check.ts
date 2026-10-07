// Comprobación de una referencia heredada tras un documento sustituto
// (specs/002-boe-scorm-export: FR-067). Exige sesión, su testigo y el perfil
// de docente. La hace una persona, referencia a referencia, con su
// confirmación expresa, y queda registrada. No cambia el índice ni el tema.
import { openOutlines, openSyllabus } from "@/modules/didactic-content";
import { protectedAction } from "@/platform/web";

export const config = { api: { bodyParser: { sizeLimit: "4kb" } } };

const ID = /^[0-9a-f]{32}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "references.check",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const kind = field("kind");
    const targetId = field("target");
    if ((kind !== "outline" && kind !== "topic") || !ID.test(targetId)) {
      return Promise.resolve({ location: "/documents" });
    }
    const input = {
      requirementId: field("requirement"),
      confirmed: field("confirmed") === "yes",
      actorId: session.user.id,
      correlationId,
    };
    const result =
      kind === "outline"
        ? openOutlines(runtime).checkReference({
            ...input,
            outlineId: targetId,
          })
        : openSyllabus(runtime).checkTopicReference({
            ...input,
            topicId: targetId,
          });
    if (!result.ok && result.reason === "not_found") {
      return Promise.resolve({ location: "/documents" });
    }
    return Promise.resolve({
      location: `/${kind === "outline" ? "outlines" : "topics"}/${targetId}`,
      notice: result.ok
        ? ("reference_checked" as const)
        : { code: "reference_refused" as const, detail: result.reason },
    });
  },
);
