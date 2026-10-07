// Subida y registro de un documento oficial (specs/002-boe-scorm-export:
// US1, FR-001 a FR-003 y FR-067; contracts/http-surface.md). Exige sesión, su
// testigo y el perfil de docente. El cuerpo es el PDF; los datos de
// procedencia llegan en una cabecera. Si el fichero no se admite, no se
// registra nada y la página siguiente explica el motivo.
import { openNormativeSource } from "@/modules/normative-source";
import { protectedUpload } from "@/platform/web";

// El cuerpo se recibe tal cual, sin analizarlo.
export const config = { api: { bodyParser: false } };

function field(
  fields: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = fields[name];
  return typeof value === "string" ? value : "";
}

export default protectedUpload(
  {
    role: "teacher",
    operation: "documents.upload",
    allowPendingPasswordChange: false,
  },
  async ({ session, runtime, correlationId, file, fields }) => {
    const refused = (detail: string) => ({
      ok: false,
      location: "/documents/new",
      notice: { code: "document_rejected" as const, detail },
    });
    if (file === undefined) {
      runtime.audit.record({
        actorId: session.user.id,
        action: "document.register",
        targetKind: "document",
        targetId: null,
        result: "failed",
        correlationId,
        details: { reason: "too_large", categories: "" },
      });
      return refused("too_large");
    }
    const replaces = field(fields, "replaces");
    const result = await openNormativeSource(runtime).registerDocument({
      file,
      metadata: {
        title: field(fields, "title"),
        issuer: field(fields, "issuer"),
        officialReference: field(fields, "official_reference"),
        source: field(fields, "source"),
        obtainedOn: field(fields, "obtained_on"),
        version: field(fields, "version"),
      },
      replacesDocumentId: replaces === "" ? null : replaces,
      actorId: session.user.id,
      correlationId,
    });
    if (!result.ok) {
      return refused(
        result.categories.length === 0
          ? result.reason
          : `${result.reason}__${result.categories.join("+")}`,
      );
    }
    return {
      ok: true,
      location: `/documents/${result.document.id}`,
      notice: "document_registered" as const,
    };
  },
);
