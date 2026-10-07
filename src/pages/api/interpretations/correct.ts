// Corrección de una interpretación: modificar, añadir o retirar un requisito,
// o corregir los datos de la unidad (specs/002-boe-scorm-export: US1, FR-007,
// FR-063 y FR-065). Exige sesión, su testigo y el perfil de docente.
//
// El guardado lleva la revisión que el usuario tenía abierta. Si ya no es la
// actual, no se guarda nada: la respuesta es 409, con la versión más reciente
// junto al cambio enviado, que el usuario puede reenviar de forma explícita
// contra ella o descartar. Nada se fusiona ni se reenvía solo.
import { openStructuredInterpretation } from "@/modules/structured-interpretation";
import type { ChangeResult } from "@/modules/structured-interpretation";
import { notFoundPage, protectedAction } from "@/platform/web";
import { changeProblem, requirementFormView, unitFormView } from "@/views";

export const config = { api: { bodyParser: { sizeLimit: "64kb" } } };

const ID = /^[0-9a-f]{32}$/;
const NUMBER = /^[1-9][0-9]{0,5}$/;

function numberOf(value: string): number {
  return NUMBER.test(value) ? Number(value) : 0;
}

function optionalNumber(value: string): number | null {
  return value.trim() === "" ? null : numberOf(value.trim());
}

export default protectedAction(
  {
    role: "teacher",
    operation: "interpretations.correct",
    allowPendingPasswordChange: false,
  },
  ({ field, session, runtime, correlationId }) => {
    const interpretations = openStructuredInterpretation(runtime);
    const interpretationId = field("interpretation");
    const mode = field("mode");
    const target = {
      interpretationId,
      revision: numberOf(field("revision")),
      actorId: session.user.id,
      correlationId,
    };
    const requirementId = field("requirement");
    const values = {
      kind: field("kind"),
      parent: field("parent"),
      code: field("code"),
      text: field("text"),
      section: field("section"),
      pageFrom: field("page_from"),
      pageTo: field("page_to"),
      quote: field("quote"),
    };
    const unitValues = {
      unitTitle: field("unit_title"),
      durationHours: field("duration_hours"),
      durationSection: field("duration_section"),
      durationPage: field("duration_page"),
      durationQuote: field("duration_quote"),
    };
    const change = {
      kind: values.kind,
      parentId: ID.test(values.parent) ? values.parent : null,
      code: values.code,
      text: values.text,
      section: values.section,
      pageFrom: numberOf(values.pageFrom),
      pageTo: numberOf(values.pageTo),
      quote: values.quote.trim() === "" ? null : values.quote,
    };

    let result: ChangeResult;
    if (mode === "edit") {
      result = interpretations.editRequirement({
        ...target,
        requirementId,
        change,
      });
    } else if (mode === "add") {
      result = interpretations.addRequirement({
        ...target,
        requirement: change,
      });
    } else if (mode === "withdraw") {
      result = interpretations.withdrawRequirement({
        ...target,
        requirementId,
      });
    } else if (mode === "unit") {
      result = interpretations.editUnit({
        ...target,
        unit: {
          unitTitle: unitValues.unitTitle,
          durationHours: optionalNumber(unitValues.durationHours),
          durationSection: unitValues.durationSection,
          durationPage: optionalNumber(unitValues.durationPage),
          durationQuote:
            unitValues.durationQuote.trim() === ""
              ? null
              : unitValues.durationQuote,
        },
      });
    } else {
      return Promise.resolve({ location: "/documents" });
    }
    if (result.ok) {
      return Promise.resolve({
        location: `/interpretations/${interpretationId}`,
        notice: "interpretation_corrected",
      });
    }

    // No se ha guardado nada. Se responde con el formulario, con lo enviado.
    const current = interpretations.get(interpretationId);
    if (current === undefined) {
      return Promise.resolve(notFoundPage(session));
    }
    const conflict = result.reason === "conflict";
    const status = conflict ? 409 : 422;
    const problem = changeProblem(result.reason);
    if (mode === "unit") {
      return Promise.resolve(
        unitFormView({
          session,
          interpretation: current,
          values: unitValues,
          status,
          problem,
          conflict,
        }),
      );
    }
    if (mode === "withdraw" || result.reason === "superseded") {
      return Promise.resolve({
        location: `/interpretations/${interpretationId}`,
        notice: { code: "interpretation_blocked", detail: result.reason },
      });
    }
    return Promise.resolve(
      requirementFormView({
        session,
        interpretation: current,
        requirement: current.requirements.find(
          ({ id }) => id === requirementId,
        ),
        mode,
        values,
        status,
        problem,
        conflict,
      }),
    );
  },
);
