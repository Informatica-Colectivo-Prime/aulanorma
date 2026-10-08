// Edición de un tema: añadir un bloque de desarrollo o la cita de un
// requisito, editar un bloque, reordenarlo o quitarlo
// (specs/002-boe-scorm-export: US3, FR-022, FR-024 y FR-063). Exige sesión, su
// testigo y el perfil de docente.
//
// El guardado lleva la revisión que el usuario tenía abierta. Si ya no es la
// actual, no se guarda nada: la respuesta es 409, con la versión más reciente
// junto al cambio enviado, que el usuario puede reenviar de forma explícita
// contra ella o descartar. Nada se fusiona ni se reenvía solo. Cualquier
// cambio devuelve el tema a revisión.
import { openSyllabus } from "@/modules/didactic-content";
import type { TopicResult } from "@/modules/didactic-content";
import { openNormativeSource } from "@/modules/normative-source";
import { notFoundPage, protectedAction } from "@/platform/web";
import {
  blockFormView,
  blockRequirementField,
  topicProblem,
  topicView,
} from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const NUMBER = /^[1-9][0-9]{0,5}$/;

export default protectedAction(
  {
    role: "teacher",
    operation: "topics.edit",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const syllabus = openSyllabus(runtime);
    const topicId = field("topic");
    const mode = field("mode");
    const blockId = field("block");
    const revision = field("revision");
    const target = {
      topicId,
      revision: NUMBER.test(revision) ? Number(revision) : 0,
      actorId: session.user.id,
      correlationId,
    };
    // Los requisitos marcados se leen contra los de la entrada del tema: un
    // campo que no corresponda a uno de ellos se ignora.
    const before = syllabus.reviewTopic(topicId);
    const values = {
      text: field("text"),
      requirementIds: (before?.requirements ?? [])
        .filter((item) => field(blockRequirementField(item.id)) === "yes")
        .map((item) => item.id),
    };

    let result: TopicResult;
    if (mode === "add_development") {
      result = syllabus.addDevelopmentBlock({ ...target, block: values });
    } else if (mode === "add_requirement") {
      result = syllabus.addRequirementBlock({
        ...target,
        requirementId: field("requirement"),
      });
    } else if (mode === "edit") {
      result = syllabus.editBlock({ ...target, blockId, block: values });
    } else if (mode === "up" || mode === "down") {
      result = syllabus.moveBlock({ ...target, blockId, direction: mode });
    } else if (mode === "remove") {
      result = syllabus.removeBlock({ ...target, blockId });
    } else {
      return Promise.resolve({ location: "/documents" });
    }
    if (result.ok) {
      return Promise.resolve({
        location: `/topics/${topicId}`,
        notice: "topic_edited",
      });
    }

    // No se ha guardado nada. Se responde con la versión más reciente y, si
    // había un formulario, con lo enviado.
    const review = syllabus.reviewTopic(topicId);
    const document =
      review === undefined
        ? undefined
        : openNormativeSource(runtime).getDocument(
            review.outline.interpretation.documentId,
          );
    if (review === undefined || document === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    const conflict = result.reason === "conflict";
    const status = conflict ? 409 : 422;
    if (
      (mode === "add_development" || mode === "edit") &&
      !review.outline.historical &&
      result.reason !== "not_developed"
    ) {
      return Promise.resolve(
        blockFormView({
          session,
          review,
          document,
          block: review.topic.blocks.find((item) => item.id === blockId),
          mode,
          values,
          status,
          problem: topicProblem(result.reason),
          conflict,
        }),
      );
    }
    return Promise.resolve(
      topicView({
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
          ? `${topicProblem("conflict")} Esta es la versión más reciente: revísala antes de repetir el cambio.`
          : topicProblem(result.reason),
      }),
    );
  },
);
