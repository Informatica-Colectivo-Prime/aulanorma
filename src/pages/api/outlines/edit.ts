// Edición del índice: añadir una entrada, renombrarla o cambiar sus
// requisitos, reordenarla o quitarla (specs/002-boe-scorm-export: US2,
// FR-014, FR-059 y FR-063). Exige sesión, su testigo y el perfil de docente.
//
// El guardado lleva la revisión que el usuario tenía abierta. Si ya no es la
// actual, no se guarda nada: la respuesta es 409, con la versión más reciente
// junto al cambio enviado, que el usuario puede reenviar de forma explícita
// contra ella o descartar. Nada se fusiona ni se reenvía solo. Cualquier
// cambio devuelve el índice a revisión.
import { openOutlines } from "@/modules/didactic-content";
import type { ChangeResult } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import {
  entryFormView,
  outlineProblem,
  outlineView,
  requirementField,
} from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "outlines.edit",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const outlines = openOutlines(runtime);
    const outlineId = field("outline");
    const mode = field("mode");
    const entryId = field("entry");
    const revision = field("revision");
    const target = {
      outlineId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      actorId: session.user.id,
      correlationId,
    };
    // Los requisitos marcados se leen contra el inventario vigente: un campo
    // que no corresponda a uno de sus requisitos se ignora.
    const before = outlines.review(outlineId);
    const values = {
      title: field("title"),
      requirementIds: (before?.interpretation.requirements ?? [])
        .filter(
          (item) =>
            !item.withdrawn && field(requirementField(item.id)) === "yes",
        )
        .map((item) => item.id),
    };

    let result: ChangeResult;
    if (mode === "add") {
      result = outlines.addEntry({ ...target, entry: values });
    } else if (mode === "edit") {
      result = outlines.editEntry({ ...target, entryId, entry: values });
    } else if (mode === "up" || mode === "down") {
      result = outlines.moveEntry({ ...target, entryId, direction: mode });
    } else if (mode === "remove") {
      result = outlines.removeEntry({ ...target, entryId });
    } else {
      return Promise.resolve({ location: "/documents" });
    }
    if (result.ok) {
      return Promise.resolve({
        location: `/outlines/${outlineId}`,
        notice: "outline_edited",
      });
    }

    // No se ha guardado nada. Se responde con la versión más reciente y, si
    // había un formulario, con lo enviado.
    const review = outlines.review(outlineId);
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    const conflict = result.reason === "conflict";
    const status = conflict ? 409 : 422;
    if ((mode === "add" || mode === "edit") && !review.historical) {
      return Promise.resolve(
        entryFormView({
          session,
          review,
          entry: review.outline.entries.find((item) => item.id === entryId),
          mode,
          values,
          status,
          problem: outlineProblem(result.reason),
          conflict,
        }),
      );
    }
    return Promise.resolve(
      outlineView({
        session,
        notice: undefined,
        review,
        document,
        provider: runtime.generation.provider,
        names: new Map(
          runtime.identity.listUsers().map((user) => [user.id, user.username]),
        ),
        status,
        problem: conflict
          ? `${outlineProblem("conflict")} Esta es la versión más reciente: revísala antes de repetir el cambio.`
          : outlineProblem(result.reason),
      }),
    );
  },
);
