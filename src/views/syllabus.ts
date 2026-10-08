// Vistas de la historia «temario, presupuesto y aprobaciones»
// (specs/002-boe-scorm-export: US3; contracts/http-surface.md). Las comparten
// las páginas y las acciones: una acción que no puede guardar responde con la
// misma vista que la página, con lo que el usuario envió.
//
// Solo componen HTML. El contenido de un tema lo produce el renderizador de
// la capa `didactic-content`, que escapa todo el texto; el resto pasa por la
// plantilla de `@/platform/web`. No consultan ni modifican nada, y no
// calculan el desarrollo de los requisitos: lo reciben calculado.
import { contentToText, renderBlock } from "@/modules/didactic-content";
import type {
  OutlineEntry,
  RenderedRequirement,
  SyllabusReview,
  SyllabusTopic,
  Topic,
  TopicBlock,
  TopicRejection,
  TopicReview,
  VersionBlockers,
} from "@/modules/didactic-content";
import type { DocumentRecord } from "@/modules/normative-source";
import type { Requirement } from "@/modules/structured-interpretation";
import { html, noticeBox } from "@/platform/web";
import type { Html, Notice, PageReply, SessionContext } from "@/platform/web";
import {
  amount,
  budgetNote,
  KIND_NAMES,
  moment,
  pageLinks,
  pagesLabel,
  reply,
  who,
} from "./shared";
import type { BudgetFigures, Names } from "./shared";

// --- Textos ---

const DETERMINISTIC_ORIGIN =
  "Respuestas grabadas del adaptador determinista. No son una generación real: no acreditan la calidad pedagógica del contenido ni sirven para aceptar el recorrido.";

const FAILURES: Readonly<Record<string, string>> = {
  provider_error:
    "la operación terminó con error; el servicio de generación no devolvió ningún resultado",
  invalid_output: "la propuesta no cumplía el formato exigido y se rechazó",
  rejected_by_domain:
    "la propuesta citaba o desarrollaba requisitos que no son de esta entrada, y se rechazó",
  uncertain:
    "no se pudo confirmar el resultado ni el consumo de la operación; su reserva sigue contando",
};

const GENERATE_REFUSALS: Readonly<Record<string, string>> = {
  superseded:
    "El documento de este índice tiene un sustituto registrado: no se desarrolla temario nuevo sobre él.",
  outline_not_approved:
    "El temario solo se desarrolla a partir de un índice aprobado y vigente. Aprueba el índice primero.",
  nothing_to_generate:
    "No hay ningún tema pendiente o fallido que se pueda generar ahora.",
  estimate_changed:
    "La estimación o el coste máximo han cambiado desde que los viste. No se ha enviado nada: revisa las cifras actuales antes de confirmar.",
};

const TOPIC_PROBLEMS: Readonly<Record<TopicRejection, string>> = {
  not_found: "El elemento ya no existe.",
  superseded:
    "El documento de este tema tiene un sustituto registrado: el tema se conserva, pero ya no se puede cambiar ni rechazar.",
  conflict:
    "Otra persona u otra sesión ha cambiado este tema desde que lo abriste. No se ha guardado nada.",
  invalid:
    "El contenido no es válido. Escribe al menos un párrafo de texto plano; cada párrafo admite hasta 4000 caracteres.",
  unknown_requirement:
    "Alguno de los requisitos marcados no es de la entrada de este tema. Revisa los vínculos.",
  already_cited: "Este tema ya cita ese requisito.",
  removed: "Este bloque está quitado del tema.",
  unchanged: "No has cambiado nada: no se ha guardado ninguna versión nueva.",
  cannot_move: "El bloque ya está en ese extremo del tema.",
  too_many_blocks: "El tema ya tiene el máximo de bloques admitido.",
  not_developed:
    "Este tema no tiene contenido: está pendiente o es fallido. No se puede editar ni aprobar.",
  not_reviewable:
    "Este tema no está pendiente de decisión: ya tiene una aprobación vigente o está rechazado.",
  empty: "El tema no tiene ningún bloque: no hay nada que aprobar.",
  outline_not_approved:
    "Un tema solo se aprueba con el índice aprobado y vigente. Aprueba el índice primero.",
  unchecked_references:
    "No se puede aprobar: quedan referencias de este tema sin comprobar contra el documento sustituto.",
  missing_reason: "Para rechazar tienes que escribir el motivo.",
  not_rejected: "Solo se puede devolver a revisión un tema rechazado.",
  not_historical:
    "El documento no tiene ningún sustituto: no hay referencias heredadas que comprobar.",
  not_confirmed:
    "Para registrar la comprobación tienes que confirmar que la has hecho.",
  already_checked:
    "Esa referencia ya estaba comprobada o no es de este elemento.",
};

export function topicProblem(reason: TopicRejection): string {
  return TOPIC_PROBLEMS[reason];
}

const NOTICES: Readonly<Record<string, readonly ["good" | "bad", string]>> = {
  version_approved: [
    "good",
    "Has aprobado la versión del temario. Queda registrado quién, cuándo y qué versión.",
  ],
  topic_edited: [
    "good",
    "El cambio queda registrado. El tema está en revisión.",
  ],
  topic_approved: [
    "good",
    "Has aprobado el tema. Queda registrado quién, cuándo y qué versión.",
  ],
  topic_rejected: [
    "good",
    "Has rechazado el tema. Su contenido se conserva con el motivo.",
  ],
  topic_resubmitted: ["good", "El tema vuelve a estar en revisión."],
  reference_checked: [
    "good",
    "La comprobación de la referencia queda registrada.",
  ],
  budget_limit_changed: [
    "good",
    "El límite se ha modificado y queda registrado. No se ha iniciado ni reanudado ninguna generación.",
  ],
  budget_reconciled: [
    "good",
    "La operación queda conciliada con el importe confirmado.",
  ],
};

const BUDGET_REFUSALS: Readonly<Record<string, string>> = {
  invalid:
    "El importe no es válido. Escribe una cantidad entre 0 y 1000, con seis decimales como máximo.",
  conflict:
    "Otra persona ha modificado el presupuesto desde que abriste la página. No se ha guardado nada: revisa el valor actual.",
  not_found: "Esa operación no existe.",
  not_uncertain: "Esa operación ya no está pendiente de conciliación.",
};

// Aviso de una acción de esta historia; `null` si no es suyo.
export function syllabusNotice(notice: Notice | undefined): Html | null {
  if (notice === undefined) {
    return null;
  }
  if (notice.code === "syllabus_refused") {
    return noticeBox(
      "bad",
      GENERATE_REFUSALS[notice.detail] ??
        "No se ha podido desarrollar el temario.",
    );
  }
  if (notice.code === "syllabus_generated") {
    const [generated = "0", failed = "0", notSent = "0"] =
      notice.detail.split("_");
    const incomplete = failed !== "0" || notSent !== "0";
    return noticeBox(
      incomplete ? "bad" : "good",
      `Temas terminados como borrador: ${generated}. Fallidos: ${failed}. ` +
        `No enviados por falta de presupuesto: ${notSent}.` +
        (incomplete ? " La generación está incompleta." : ""),
    );
  }
  if (notice.code === "reference_refused") {
    const reason = Object.keys(TOPIC_PROBLEMS).find(
      (key) => key === notice.detail,
    );
    return noticeBox(
      "bad",
      reason === undefined
        ? "No se ha registrado nada."
        : TOPIC_PROBLEMS[reason as TopicRejection],
    );
  }
  if (notice.code === "budget_refused") {
    return noticeBox(
      "bad",
      BUDGET_REFUSALS[notice.detail] ?? "No se ha guardado nada.",
    );
  }
  const known = NOTICES[notice.code];
  return known === undefined ? null : noticeBox(known[0], known[1]);
}

function requirementLabel(requirement: Requirement): Html {
  return html`<span class="tag">${KIND_NAMES[requirement.kind]}</span>
    ${requirement.code === "" ? null : html`<strong>${requirement.code}</strong> `}
    <span class="lines">${requirement.text}</span>`;
}

function reference(document: DocumentRecord, requirement: Requirement): Html {
  return html`${document.title}, ${requirement.section},
  ${pageLinks(document.id, requirement.pageFrom, requirement.pageTo)}`;
}

// Estado de un tema tal como lo ve el docente.
function topicState(item: {
  readonly topic: Topic | undefined;
  readonly approved: boolean;
  readonly awaitingReconciliation: boolean;
}): Html {
  const { topic } = item;
  if (topic === undefined || topic.status === "pending") {
    return html`<span class="tag">Pendiente</span>`;
  }
  switch (topic.status) {
    case "failed":
      return html`<span class="tag bad">Fallido</span>
        ${FAILURES[topic.failure ?? ""] ?? ""}${
          item.awaitingReconciliation
            ? ". No se reenvía hasta que un administrador concilie la operación"
            : ""
        }`;
    case "draft":
      return html`<span class="tag">Borrador</span>`;
    case "in_review":
      return html`<span class="tag">En revisión</span>`;
    case "rejected":
      return html`<span class="tag bad">Rechazado</span>`;
    case "approved":
      return item.approved
        ? html`<span class="tag good">Aprobado</span>`
        : html`<span class="tag bad">Aprobación sin vigencia</span>`;
  }
}

function entryList(entries: readonly OutlineEntry[]): Html {
  return html`<ul>
    ${entries.map((entry) => html`<li>${entry.title}</li>`)}
  </ul>`;
}

// Lo que impide aprobar la versión, con la referencia normativa de cada
// requisito pendiente.
export function blockersBox(
  document: DocumentRecord,
  blockers: VersionBlockers,
  role: "alert" | "status",
  heading = "Pendiente para poder aprobar la versión:",
): Html | null {
  if (
    !blockers.outlineNotApproved &&
    blockers.undeveloped.length === 0 &&
    blockers.unapproved.length === 0 &&
    blockers.development.length === 0
  ) {
    return null;
  }
  return html`<div class="notice bad" role="${role}">
    <p>${heading}</p>
    ${
      blockers.outlineNotApproved
        ? html`<p>El índice no tiene una aprobación vigente.</p>`
        : null
    }
    ${
      blockers.undeveloped.length === 0
        ? null
        : html`<p>Temas sin desarrollar, pendientes o fallidos:</p>
            ${entryList(blockers.undeveloped)}`
    }
    ${
      blockers.unapproved.length === 0
        ? null
        : html`<p>Temas sin una aprobación vigente:</p>
            ${entryList(blockers.unapproved)}`
    }
    ${
      blockers.development.length === 0
        ? null
        : html`<p>Requisitos sin cita o sin contenido que los desarrolle:</p>
            <ul>
              ${blockers.development.map(
                (item) =>
                  html`<li>
                    ${requirementLabel(item.requirement)}
                    <p class="hint">
                      ${reference(document, item.requirement)} ·
                      ${
                        item.citedIn.length === 0
                          ? "sin cita"
                          : "citado, pero sin desarrollo"
                      }${
                        item.citedIn.length === 0 &&
                        item.developedIn.length === 0
                          ? " y sin desarrollo"
                          : ""
                      }
                    </p>
                  </li>`,
              )}
            </ul>`
    }
  </div>`;
}

// --- Temario ---

function topicRow(item: SyllabusTopic): Html {
  return html`<tr>
    <td>
      ${
        item.topic === undefined
          ? item.entry.title
          : html`<a href="/topics/${item.topic.id}">${item.entry.title}</a>`
      }
    </td>
    <td>${topicState(item)}</td>
  </tr>`;
}

export function syllabusView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly syllabus: SyllabusReview;
  readonly document: DocumentRecord;
  readonly provider: string;
  readonly budget: BudgetFigures;
  readonly names: Names;
  readonly status?: number;
  readonly problem?: string;
  // Lo que bloqueó un intento de aprobar la versión.
  readonly blockedBy?: VersionBlockers;
}): PageReply {
  const { session, syllabus, document, names } = input;
  const { outline: review, topics, development } = syllabus;
  const { interpretation } = review;
  const outlineId = review.outline.id;
  const started = topics.some((item) => item.topic !== undefined);
  const waiting = topics.filter((item) => item.awaitingReconciliation);
  const developedCount = development.items.length - development.pending.length;
  return reply(
    input.status ?? 200,
    `Temario de ${interpretation.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/documents">Documentos</a> ›
        <a href="/documents/${document.id}">${document.title}</a> ›
        <a href="/interpretations/${interpretation.id}"
          >${interpretation.unitCode}</a
        >
        › <a href="/outlines/${outlineId}">Índice</a>
      </p>
      <h1>
        Temario de ${interpretation.unitCode} · ${interpretation.unitTitle}
      </h1>
      ${
        input.problem === undefined
          ? syllabusNotice(input.notice)
          : noticeBox("bad", input.problem)
      }
      ${
        input.blockedBy === undefined
          ? null
          : blockersBox(document, input.blockedBy, "alert")
      }
      <dl>
        <dt>Índice en el que se apoya</dt>
        <dd>
          <a href="/outlines/${outlineId}"
            >Versión ${review.outline.revision}</a
          >
          ${
            review.approval === undefined
              ? html`<span class="tag bad">Sin aprobación vigente</span>`
              : html`<span class="tag good">Aprobado y vigente</span>`
          }
        </dd>
        <dt>Origen del contenido</dt>
        <dd>
          ${
            input.provider === "deterministic"
              ? DETERMINISTIC_ORIGIN
              : input.provider
          }
        </dd>
      </dl>

      <h2>Generación</h2>
      ${
        syllabus.incomplete
          ? html`<p class="banner" role="status">
              Generación incompleta. Los temas terminados se conservan como
              borradores; quedan temas pendientes o fallidos.
            </p>`
          : null
      }
      ${
        waiting.length === 0
          ? null
          : html`<div class="notice bad" role="status">
              <p>
                Estos temas tienen una operación de resultado incierto. Su
                reserva sigue contando y no se reenvían hasta que un
                administrador la concilie en
                <a href="/budget">Presupuesto</a>:
              </p>
              ${entryList(waiting.map((item) => item.entry))}
            </div>`
      }
      ${
        review.historical
          ? html`<p class="muted">
              El documento de este índice tiene un sustituto registrado: no se
              desarrolla temario nuevo sobre él.
            </p>`
          : review.approval === undefined
            ? html`<div class="notice bad" role="status">
                <p>
                  El temario solo se desarrolla a partir de un índice aprobado y
                  vigente.
                  <a href="/outlines/${outlineId}">Revisa y aprueba el índice</a
                  >.
                </p>
              </div>`
            : syllabus.toGenerate.length === 0
              ? html`<p class="muted">
                  No hay ningún tema pendiente o fallido que se pueda generar
                  ahora.
                </p>`
              : html`<form method="post" action="/api/syllabus/generate">
                  <fieldset>
                    <legend>
                      ${
                        started
                          ? "Reanudar: generar solo lo pendiente o fallido"
                          : "Desarrollar el temario"
                      }
                    </legend>
                    <input
                      type="hidden"
                      name="csrf"
                      value="${session.csrfToken}"
                    />
                    <input type="hidden" name="outline" value="${outlineId}" />
                    <input
                      type="hidden"
                      name="shown_estimate"
                      value="${syllabus.cost.estimatedCost}"
                    />
                    <input
                      type="hidden"
                      name="shown_max"
                      value="${syllabus.cost.maxCost}"
                    />
                    <p>
                      Temas que se generarán, uno a uno y cada uno con su propia
                      reserva de presupuesto: ${syllabus.toGenerate.length}. Los
                      temas ya terminados no se repiten. No hay reintentos
                      automáticos: si un tema falla, queda señalado y puedes
                      pedir otro intento.
                    </p>
                    ${entryList(syllabus.toGenerate)}
                    ${budgetNote({
                      budget: input.budget,
                      cost: syllabus.cost,
                      provider: input.provider,
                    })}
                    <button type="submit" data-busy="Generando los temas…">
                      ${
                        started
                          ? "Confirmar y generar lo pendiente"
                          : "Confirmar y desarrollar el temario"
                      }
                    </button>
                  </fieldset>
                </form>`
      }

      <h2>Temas</h2>
      <div class="scroll">
        <table>
          <caption class="skip">
            Estado de cada tema del temario
          </caption>
          <thead>
            <tr>
              <th scope="col">Tema</th>
              <th scope="col">Estado</th>
            </tr>
          </thead>
          <tbody>
            ${topics.map(topicRow)}
          </tbody>
        </table>
      </div>

      <h2>Desarrollo de los requisitos obligatorios</h2>
      <p>
        ${developedCount} de ${development.items.length} requisitos citados y
        desarrollados.
        ${
          development.complete
            ? html`<span class="tag good">Completo</span>`
            : html`<span class="tag bad">Incompleto</span>`
        }
      </p>
      <p class="muted">
        Cada requisito necesita su cita, en un bloque de requisito, y contenido
        didáctico que lo desarrolle, en un bloque de desarrollo vinculado a él.
        La cita identifica el requisito; por sí sola no acredita que esté
        desarrollado. Que el desarrollo sea suficiente lo decides tú al revisar
        cada tema.
      </p>
      <div class="scroll">
        <table>
          <caption class="skip">
            Cita y desarrollo de cada requisito del inventario
          </caption>
          <thead>
            <tr>
              <th scope="col">Requisito</th>
              <th scope="col">Referencia normativa</th>
              <th scope="col">Citado en</th>
              <th scope="col">Desarrollado en</th>
            </tr>
          </thead>
          <tbody>
            ${development.items.map(
              (item) =>
                html`<tr>
                  <td>
                    <div class="d${Math.min(item.requirement.depth, 4)}">
                      ${requirementLabel(item.requirement)}
                    </div>
                  </td>
                  <td>${reference(document, item.requirement)}</td>
                  <td>
                    ${
                      item.citedIn.length === 0
                        ? html`<span class="tag bad">Sin cita</span>`
                        : item.citedIn.map(
                            (entry) => html`<div>${entry.title}</div>`,
                          )
                    }
                  </td>
                  <td>
                    ${
                      item.developedIn.length === 0
                        ? html`<span class="tag bad">Sin desarrollo</span>`
                        : item.developedIn.map(
                            (entry) => html`<div>${entry.title}</div>`,
                          )
                    }
                  </td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>

      <h2>Aprobar la versión del temario</h2>
      ${
        input.blockedBy === undefined
          ? blockersBox(document, syllabus.blockers, "status")
          : null
      }
      ${
        review.historical
          ? null
          : html`<form method="post" action="/api/syllabus/approve">
              <input type="hidden" name="csrf" value="${session.csrfToken}" />
              <input type="hidden" name="outline" value="${outlineId}" />
              <input
                type="hidden"
                name="fingerprint"
                value="${syllabus.fingerprint}"
              />
              <p>
                Aprobar la versión es una decisión tuya, sobre el temario tal
                como lo tienes delante. Exige el índice aprobado y vigente,
                todos los temas desarrollados y aprobados, y cada requisito
                citado y desarrollado. No existe ninguna forma de aprobarla sin
                ello.
              </p>
              <button type="submit" data-busy="Aprobando…">
                Aprobar esta versión del temario
              </button>
            </form>`
      }

      <h2>Versiones aprobadas</h2>
      <p>
        <a href="/export/${outlineId}"
          >Exportación: vista previa, paquete e instrucciones</a
        >
      </p>
      ${
        syllabus.versions.length === 0
          ? html`<p class="muted">Todavía no hay ninguna versión aprobada.</p>`
          : html`<ul>
              ${syllabus.versions.map(
                (version) =>
                  html`<li>
                    Versión ${version.label}, aprobada por
                    ${who(names, version.approvedBy)} el
                    ${moment(version.approvedAt)}.
                    ${
                      version.current
                        ? html`<span class="tag good">Vigente</span>`
                        : html`<span class="tag">Sin vigencia</span>`
                    }
                    <span class="hint"
                      >Huella del contenido:
                      <code>${version.contentSha256}</code></span
                    >
                  </li>`,
              )}
            </ul>`
      }`,
  );
}

// Enlace al temario desde la página del índice.
export function syllabusLink(input: {
  readonly outlineId: string;
  readonly approved: boolean;
}): Html {
  return html`<h2>Temario</h2>
    <p>
      <a href="/syllabus/${input.outlineId}"
        >Abrir el temario: generación, temas y aprobación de la versión</a
      >
      ${
        input.approved
          ? null
          : html`<span class="hint"
              >· Solo se desarrolla con el índice aprobado y vigente.</span
            >`
      }
    </p>`;
}

// --- Tema ---

function rendered(
  review: TopicReview,
  document: DocumentRecord,
  block: TopicBlock,
): Html {
  const resolve = (id: string): RenderedRequirement | undefined => {
    const requirement = review.outline.interpretation.requirements.find(
      (item) => item.id === id && !item.withdrawn,
    );
    return requirement === undefined
      ? undefined
      : {
          code: requirement.code,
          kindName: KIND_NAMES[requirement.kind],
          text: requirement.text,
          documentTitle: document.title,
          section: requirement.section,
          pageFrom: requirement.pageFrom,
          pageTo: requirement.pageTo,
          quote: requirement.quote,
        };
  };
  const options = {
    pageHref: (page: number) =>
      `/documents/${document.id}/pages/${String(page)}`,
  };
  return block.kind === "requirement"
    ? renderBlock(
        {
          kind: "requirement",
          requirement: resolve(block.requirementIds[0] ?? ""),
        },
        options,
      )
    : renderBlock(
        {
          kind: "development",
          content: block.content,
          // En el orden del inventario.
          requirements: review.requirements
            .filter((item) => block.requirementIds.includes(item.id))
            .flatMap((item) => resolve(item.id) ?? []),
        },
        options,
      );
}

// Formulario de una comprobación de referencia heredada.
export function referenceForm(input: {
  readonly session: SessionContext;
  readonly kind: "outline" | "topic";
  readonly targetId: string;
  readonly document: DocumentRecord;
  readonly requirement: Requirement;
}): Html {
  const { requirement } = input;
  const field = `confirmed_${requirement.id}`;
  return html`<li>
    ${requirementLabel(requirement)}
    <p class="hint">${reference(input.document, requirement)}</p>
    <form method="post" action="/api/references/check">
      <input type="hidden" name="csrf" value="${input.session.csrfToken}" />
      <input type="hidden" name="kind" value="${input.kind}" />
      <input type="hidden" name="target" value="${input.targetId}" />
      <input type="hidden" name="requirement" value="${requirement.id}" />
      <label class="check" for="${field}">
        <input
          id="${field}"
          name="confirmed"
          type="checkbox"
          value="yes"
          required
        />
        <span
          >He comprobado esta referencia contra el documento sustituto.</span
        >
      </label>
      <button class="plain" type="submit" data-busy="Guardando…">
        Registrar la comprobación<span class="skip">
          de ${requirement.code}</span
        >
      </button>
    </form>
  </li>`;
}

// Apartado de referencias heredadas, común al índice y a un tema.
export function referencesSection(input: {
  readonly session: SessionContext;
  readonly kind: "outline" | "topic";
  readonly targetId: string;
  readonly document: DocumentRecord;
  readonly pending: readonly Requirement[];
  readonly checked: number;
}): Html {
  return html`<h2>Referencias heredadas</h2>
    <p>
      El documento de origen tiene un sustituto registrado. Antes de aprobar,
      hay que comprobar cada referencia contra la nueva fuente, una a una. Nada
      se reasigna ni se da por comprobado automáticamente. ${input.checked}
      comprobadas; ${input.pending.length} pendientes.
    </p>
    ${
      input.pending.length === 0
        ? html`<p class="muted">No queda ninguna referencia por comprobar.</p>`
        : html`<ul class="tree">
            ${input.pending.map((requirement) =>
              referenceForm({ ...input, requirement }),
            )}
          </ul>`
    }`;
}

export function topicView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly review: TopicReview;
  readonly document: DocumentRecord;
  readonly provider: string;
  readonly names: Names;
  readonly status?: number;
  readonly problem?: string;
  readonly reason?: string;
  // Referencias que bloquearon un intento de aprobar.
  readonly blockedBy?: readonly Requirement[];
}): PageReply {
  const { session, review, document, names } = input;
  const { topic, entry, history } = review;
  const outlineId = review.outline.outline.id;
  const { id, revision } = topic;
  const hasContent = topic.status !== "pending" && topic.status !== "failed";
  const editable = hasContent && !review.outline.historical;
  const live = topic.blocks.filter((block) => !block.removed);
  const removed = topic.blocks.length - live.length;
  const stale = topic.status === "approved" && review.approval === undefined;
  const uncited = review.requirements.filter(
    (requirement) =>
      !live.some(
        (block) =>
          block.kind === "requirement" &&
          block.requirementIds.includes(requirement.id),
      ),
  );
  const hidden = html`<input
      type="hidden"
      name="csrf"
      value="${session.csrfToken}"
    />
    <input type="hidden" name="topic" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />`;
  const button = (
    block: TopicBlock,
    mode: string,
    label: string,
    busy: string,
  ): Html =>
    html`<form method="post" action="/api/topics/edit">
      ${hidden}
      <input type="hidden" name="block" value="${block.id}" />
      <input type="hidden" name="mode" value="${mode}" />
      <button class="plain" type="submit" data-busy="${busy}">
        ${label}<span class="skip"> el bloque ${block.position + 1}</span>
      </button>
    </form>`;
  return reply(
    input.status ?? 200,
    entry.title,
    session,
    html`<p class="crumbs">
        <a href="/outlines/${outlineId}">Índice</a> ›
        <a href="/syllabus/${outlineId}"
          >Temario de ${review.outline.interpretation.unitCode}</a
        >
      </p>
      <h1>${entry.title}</h1>
      ${
        input.problem === undefined
          ? syllabusNotice(input.notice)
          : noticeBox("bad", input.problem)
      }
      ${
        input.blockedBy === undefined || input.blockedBy.length === 0
          ? null
          : html`<div class="notice bad" role="alert">
              <p>Referencias pendientes de comprobar:</p>
              <ul>
                ${input.blockedBy.map(
                  (requirement) =>
                    html`<li>
                      ${requirementLabel(requirement)}
                      <p class="hint">${reference(document, requirement)}</p>
                    </li>`,
                )}
              </ul>
            </div>`
      }
      <dl>
        <dt>Estado</dt>
        <dd>
          ${topicState({
            topic,
            approved: review.approval !== undefined,
            awaitingReconciliation: review.awaitingReconciliation,
          })}
          · versión ${revision}
        </dd>
        <dt>Índice</dt>
        <dd>
          ${
            review.outline.approval === undefined
              ? html`<span class="tag bad">Sin aprobación vigente</span>`
              : html`<span class="tag good">Aprobado y vigente</span>`
          }
        </dd>
        <dt>Origen del contenido</dt>
        <dd>
          ${
            input.provider === "deterministic"
              ? DETERMINISTIC_ORIGIN
              : input.provider
          }
        </dd>
      </dl>
      ${
        stale
          ? html`<div class="notice bad" role="status">
              <p>
                La aprobación de este tema ya no está vigente: el índice o su
                interpretación han cambiado. El texto y su historial se
                conservan; revísalo y vuelve a aprobarlo.
              </p>
            </div>`
          : null
      }
      ${
        hasContent
          ? null
          : html`<div class="notice bad" role="status">
              <p>
                Este tema no tiene contenido. Un resultado inválido no se guarda
                ni puede aprobarse. Desde el
                <a href="/syllabus/${outlineId}">temario</a> puedes pedir otro
                intento, que comprueba y reserva presupuesto de nuevo.
              </p>
            </div>`
      }

      <h2>Contenido</h2>
      <p class="muted">
        Cada bloque dice qué es: «Requisito extraído del BOE», con su cita y su
        página, o «Desarrollo didáctico generado», con los requisitos que
        desarrolla.
        ${
          removed === 0
            ? null
            : html`Hay ${removed} bloques quitados, que se conservan en el
              registro.`
        }
      </p>
      ${live.map(
        (block, index) =>
          html`${rendered(review, document, block)}
          ${
            editable
              ? html`<div class="actions">
                  ${
                    block.kind === "development"
                      ? html`<a href="/topics/${id}/blocks/${block.id}"
                          >Editar<span class="skip">
                            el bloque ${block.position + 1}</span
                          ></a
                        >`
                      : null
                  }
                  ${index > 0 ? button(block, "up", "Subir", "Moviendo…") : null}
                  ${
                    index < live.length - 1
                      ? button(block, "down", "Bajar", "Moviendo…")
                      : null
                  }
                  ${button(block, "remove", "Quitar", "Quitando…")}
                </div>`
              : null
          }`,
      )}
      ${
        editable
          ? html`<p>
                <a href="/topics/${id}/blocks/new"
                  >Añadir un bloque de desarrollo</a
                >
              </p>
              ${
                uncited.length === 0
                  ? null
                  : html`<form method="post" action="/api/topics/edit">
                      ${hidden}
                      <input
                        type="hidden"
                        name="mode"
                        value="add_requirement"
                      />
                      <label for="requirement"
                        >Añadir la cita de un requisito de esta entrada</label
                      >
                      <select id="requirement" name="requirement" required>
                        ${uncited.map(
                          (requirement) =>
                            html`<option value="${requirement.id}">
                              ${KIND_NAMES[requirement.kind]}:
                              ${requirement.code}
                              ${requirement.text.slice(0, 80)}
                            </option>`,
                        )}
                      </select>
                      <button
                        class="secondary"
                        type="submit"
                        data-busy="Guardando…"
                      >
                        Añadir la cita
                      </button>
                    </form>`
              }`
          : null
      }
      ${
        review.outline.historical && hasContent
          ? referencesSection({
              session,
              kind: "topic",
              targetId: id,
              document,
              pending: review.referencesPending,
              checked: review.referenceChecks.length,
            })
          : null
      }
      ${
        hasContent
          ? html`<h2>Aprobar</h2>
              ${
                topic.status === "approved" && !stale
                  ? html`<p>
                      Esta versión del tema está aprobada. Cualquier cambio lo
                      devuelve a revisión y deja sin vigencia esta aprobación y
                      la de la versión del temario. El texto y el historial se
                      conservan.
                    </p>`
                  : topic.status === "rejected"
                    ? review.outline.historical
                      ? null
                      : html`<form method="post" action="/api/topics/resubmit">
                          ${hidden}
                          <p>
                            Este tema está rechazado. Corrígelo o devuélvelo a
                            revisión para poder aprobarlo.
                          </p>
                          <button type="submit" data-busy="Guardando…">
                            Devolver a revisión
                          </button>
                        </form>`
                    : html`<form method="post" action="/api/topics/approve">
                        ${hidden}
                        <p>
                          Aprobar es una decisión tuya, sobre la versión
                          ${revision} que tienes delante. Antes, comprueba cada
                          requisito contra su página y que el desarrollo es
                          suficiente. Exige el índice aprobado y vigente.
                        </p>
                        <button type="submit" data-busy="Aprobando…">
                          Aprobar la versión ${revision} del tema
                        </button>
                      </form>`
              }
              ${
                topic.status === "rejected" || review.outline.historical
                  ? null
                  : html`<h2>Rechazar</h2>
                      <form method="post" action="/api/topics/reject">
                        ${hidden}
                        <label for="reason">Motivo del rechazo</label>
                        <textarea
                          id="reason"
                          name="reason"
                          maxlength="1000"
                          aria-describedby="reason-hint"
                          required
                        >
${input.reason ?? ""}</textarea>
                        <p class="hint" id="reason-hint">
                          Rechazar conserva el contenido y no inicia ninguna
                          generación. Después se puede corregir y devolver a
                          revisión.
                        </p>
                        <button
                          class="secondary"
                          type="submit"
                          data-busy="Guardando…"
                        >
                          Rechazar la versión ${revision} del tema
                        </button>
                      </form>`
              }`
          : null
      }

      <h2>Registro</h2>
      ${
        history.approvals.length +
          history.rejections.length +
          history.changes.length ===
        0
          ? html`<p class="muted">
              Todavía no hay aprobaciones, rechazos ni cambios.
            </p>`
          : html`<ul>
              ${history.approvals.map(
                (item) =>
                  html`<li>
                    Aprobación de la versión ${item.revision} por
                    ${who(names, item.approvedBy)}, el
                    ${moment(item.approvedAt)}.
                    ${
                      item.current
                        ? html`<span class="tag good">Vigente</span>`
                        : html`<span class="tag">Sin vigencia</span>`
                    }
                  </li>`,
              )}
              ${history.rejections.map(
                (item) =>
                  html`<li>
                    Rechazo de la versión ${item.revision} por
                    ${who(names, item.rejectedBy)}, el
                    ${moment(item.rejectedAt)}. Motivo: ${item.reason}
                  </li>`,
              )}
              ${history.changes.map(
                (item) =>
                  html`<li>
                    ${
                      item.kind === "generate"
                        ? "Generación del contenido, pedida"
                        : item.kind === "add"
                          ? "Bloque añadido"
                          : item.kind === "remove"
                            ? "Bloque quitado"
                            : item.kind === "move"
                              ? "Bloque reordenado"
                              : "Bloque modificado"
                    }
                    por ${who(names, item.author)}, el ${moment(item.at)}: da
                    lugar a la versión ${item.resultingRevision}.
                  </li>`,
              )}
            </ul>`
      }`,
  );
}

// --- Formulario de un bloque de desarrollo ---

export interface BlockValues {
  readonly text: string;
  readonly requirementIds: readonly string[];
}

export function blockValuesOf(block: TopicBlock): BlockValues {
  return {
    text: contentToText(block.content),
    requirementIds: block.requirementIds,
  };
}

// Nombre del campo que marca un requisito en el formulario de un bloque.
export function blockRequirementField(requirementId: string): string {
  return `req_${requirementId}`;
}

export function blockFormView(input: {
  readonly session: SessionContext;
  readonly review: TopicReview;
  readonly document: DocumentRecord;
  // El bloque que se edita; `undefined` al añadir uno, o si ya no existe.
  readonly block: TopicBlock | undefined;
  readonly mode: "edit" | "add_development";
  readonly values: BlockValues;
  readonly status?: number;
  readonly problem?: string;
  readonly conflict?: boolean;
}): PageReply {
  const { session, review, block, mode, values } = input;
  const { topic, entry } = review;
  const { id, revision } = topic;
  const conflict = input.conflict === true;
  const form = html`<form method="post" action="/api/topics/edit">
    <input type="hidden" name="csrf" value="${session.csrfToken}" />
    <input type="hidden" name="topic" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />
    <input type="hidden" name="mode" value="${mode}" />
    <input type="hidden" name="block" value="${block?.id ?? ""}" />
    <label for="text">Texto del desarrollo</label>
    <textarea
      id="text"
      name="text"
      rows="14"
      aria-describedby="text-hint"
      required
    >
${values.text}</textarea>
    <p class="hint" id="text-hint">
      Texto plano. Una línea que empieza por «# » es un encabezado; las líneas
      que empiezan por «- » forman una lista; una línea en blanco separa
      párrafos. Nada se interpreta como HTML: lo que escribas se muestra tal
      cual.
    </p>
    <fieldset aria-describedby="links-hint">
      <legend>Requisitos que desarrolla</legend>
      <p class="hint" id="links-hint">
        Marca cada requisito de esta entrada que este bloque desarrolla. Si no
        marcas ninguno, el bloque queda como «sin respaldo normativo».
      </p>
      ${
        review.requirements.length === 0
          ? html`<p class="muted">
              La entrada de este tema no se apoya en ningún requisito.
            </p>`
          : review.requirements.map(
              (requirement) =>
                html`<label
                  class="check"
                  for="${blockRequirementField(requirement.id)}"
                >
                  <input
                    id="${blockRequirementField(requirement.id)}"
                    name="${blockRequirementField(requirement.id)}"
                    type="checkbox"
                    value="yes"
                    ${
                      values.requirementIds.includes(requirement.id)
                        ? html`checked`
                        : null
                    }
                  />
                  <span
                    >${requirementLabel(requirement)}
                    <span class="hint"
                      >·
                      ${pagesLabel(
                        requirement.pageFrom,
                        requirement.pageTo,
                      )}</span
                    ></span
                  >
                </label>`,
            )
      }
    </fieldset>
    <div class="actions">
      <button type="submit" data-busy="Guardando…">
        ${
          conflict
            ? `Guardar mi cambio sobre la versión ${String(revision)}`
            : mode === "add_development"
              ? "Añadir al tema"
              : "Guardar el bloque"
        }
      </button>
      <a href="/topics/${id}"
        >${conflict ? "Descartar mi cambio y volver" : "Volver sin guardar"}</a
      >
    </div>
  </form>`;
  const title =
    mode === "add_development"
      ? "Añadir un bloque de desarrollo"
      : "Editar un bloque de desarrollo";
  return reply(
    input.status ?? 200,
    title,
    session,
    html`<p class="crumbs"><a href="/topics/${id}">${entry.title}</a></p>
      <h1>${title}</h1>
      ${input.problem === undefined ? null : noticeBox("bad", input.problem)}
      ${
        conflict
          ? html`<p>
                Hay una versión más reciente del tema: la ${revision}. Revísala
                y decide: puedes volver a guardar tu cambio sobre ella,
                modificándolo si hace falta, o descartarlo. Nada se ha fusionado
                ni se guardará sin que lo pidas.
              </p>
              <div class="cols">
                <section aria-labelledby="latest">
                  <h2 id="latest">Versión más reciente (${revision})</h2>
                  ${
                    block === undefined || block.removed
                      ? html`<p>
                          ${
                            mode === "add_development"
                              ? "Tu bloque todavía no existe en esta versión."
                              : "Este bloque ya no existe en la versión más reciente."
                          }
                        </p>`
                      : rendered(review, input.document, block)
                  }
                  <p>
                    <a href="/topics/${id}" target="_blank" rel="noopener"
                      >Ver el tema completo (pestaña nueva)</a
                    >
                  </p>
                </section>
                <section aria-labelledby="mine">
                  <h2 id="mine">Tu cambio, sin guardar</h2>
                  ${form}
                </section>
              </div>`
          : form
      }`,
  );
}

// --- Presupuesto ---

export interface BudgetView {
  readonly limit: number;
  readonly currency: string;
  readonly revision: number;
  readonly maxOperationCost: number;
  readonly settled: number;
  readonly reserved: number;
  readonly uncertain: number;
  readonly available: number;
}

export interface BudgetChangeView {
  readonly actorId: string;
  readonly at: number;
  readonly previousLimit: number;
  readonly newLimit: number;
}

export interface UncertainView {
  readonly id: string;
  readonly task: string;
  readonly reservedCost: number;
  readonly sentAt: number | null;
}

const TASK_NAMES: Readonly<Record<string, string>> = {
  interpretation: "Interpretación",
  outline: "Propuesta de índice",
  topic: "Tema del temario",
};

// Cantidad en unidades de la moneda, para un campo de formulario.
function units(value: number): string {
  return String(value / 1_000_000);
}

export function budgetView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly budget: BudgetView;
  readonly changes: readonly BudgetChangeView[];
  readonly uncertain: readonly UncertainView[];
  readonly provider: string;
  readonly names: Names;
}): PageReply {
  const { session, budget, names } = input;
  const admin = session.user.roles.includes("admin");
  const money = (value: number): string => amount(value, budget.currency);
  return reply(
    200,
    "Presupuesto de generación",
    session,
    html`<h1>Presupuesto de generación</h1>
      ${syllabusNotice(input.notice)}
      <p>
        El límite es acumulado durante todo el piloto, sin reinicios. Ninguna
        operación de generación se envía sin una reserva de su coste máximo que
        quepa en lo disponible y no supere el máximo por operación.
      </p>
      <dl>
        <dt>Límite del proyecto</dt>
        <dd>${money(budget.limit)}</dd>
        <dt>Consumo confirmado</dt>
        <dd>${money(budget.settled)}</dd>
        <dt>Reservado por operaciones en curso</dt>
        <dd>${money(budget.reserved)}</dd>
        <dt>Operaciones de resultado incierto</dt>
        <dd>${money(budget.uncertain)}</dd>
        <dt>Disponible</dt>
        <dd>${money(Math.max(0, budget.available))}</dd>
        <dt>Máximo por operación</dt>
        <dd>${money(budget.maxOperationCost)}</dd>
      </dl>
      ${
        budget.available < 0
          ? html`<div class="notice bad" role="status">
              <p>
                El límite está por debajo de lo ya consumido o comprometido: no
                se inicia ninguna operación nueva. Las ya enviadas no se
                cancelan.
              </p>
            </div>`
          : null
      }
      <p class="hint">
        ${
          input.provider === "deterministic"
            ? "Coste simulado: el adaptador determinista responde con grabaciones y no cuesta nada. Estas cifras no son precios de ningún proveedor, y la moneda no está fijada mientras no haya uno seleccionado."
            : `Proveedor de generación: ${input.provider}.`
        }
      </p>

      <h2>Modificar el límite</h2>
      ${
        admin
          ? html`<form method="post" action="/api/budget/limit">
              <input type="hidden" name="csrf" value="${session.csrfToken}" />
              <input type="hidden" name="revision" value="${budget.revision}" />
              <label for="limit">Límite nuevo, en unidades de la moneda</label>
              <input
                id="limit"
                name="limit"
                inputmode="decimal"
                value="${units(budget.limit)}"
                aria-describedby="limit-hint"
                required
              />
              <p class="hint" id="limit-hint">
                De 0 a 1000, con seis decimales como máximo. Modificar el límite
                solo cambia el límite: no inicia ni reanuda ninguna generación.
                Reducirlo no cancela las operaciones ya enviadas.
              </p>
              <button type="submit" data-busy="Guardando…">
                Guardar el límite
              </button>
            </form>`
          : html`<p class="muted">
              Solo una cuenta con el perfil de administración puede fijar o
              modificar el límite. Con tu perfil puedes consultar el presupuesto
              y lanzar o reanudar generaciones dentro de lo disponible.
            </p>`
      }

      <h2>Operaciones de resultado incierto</h2>
      ${
        input.uncertain.length === 0
          ? html`<p class="muted">No hay ninguna operación por conciliar.</p>`
          : html`<p>
                Son operaciones enviadas cuyo consumo no pudo confirmarse.
                Cuentan por su importe reservado y no se reenvían
                automáticamente.
                ${
                  admin
                    ? "Concilia cada una con el importe que confirme el proveedor."
                    : "Las concilia una cuenta con el perfil de administración."
                }
              </p>
              <ul class="tree">
                ${input.uncertain.map(
                  (item) =>
                    html`<li>
                      <strong>${TASK_NAMES[item.task] ?? item.task}</strong>
                      · reservado ${money(item.reservedCost)}
                      ${
                        item.sentAt === null
                          ? null
                          : html`· enviada el ${moment(item.sentAt)}`
                      }
                      ${
                        admin
                          ? html`<form
                              method="post"
                              action="/api/budget/reconcile"
                            >
                              <input
                                type="hidden"
                                name="csrf"
                                value="${session.csrfToken}"
                              />
                              <input
                                type="hidden"
                                name="reservation"
                                value="${item.id}"
                              />
                              <label for="cost_${item.id}"
                                >Importe confirmado, en unidades de la
                                moneda</label
                              >
                              <input
                                id="cost_${item.id}"
                                name="cost"
                                inputmode="decimal"
                                required
                              />
                              <label for="note_${item.id}"
                                >Nota (opcional)</label
                              >
                              <input
                                id="note_${item.id}"
                                name="note"
                                maxlength="500"
                              />
                              <button
                                class="secondary"
                                type="submit"
                                data-busy="Guardando…"
                              >
                                Conciliar esta operación
                              </button>
                            </form>`
                          : null
                      }
                    </li>`,
                )}
              </ul>`
      }

      <h2>Modificaciones del límite</h2>
      ${
        input.changes.length === 0
          ? html`<p class="muted">El límite no se ha modificado nunca.</p>`
          : html`<div class="scroll">
              <table>
                <caption class="skip">
                  Registro de modificaciones del límite
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Fecha</th>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Valor anterior</th>
                    <th scope="col">Valor nuevo</th>
                  </tr>
                </thead>
                <tbody>
                  ${input.changes.map(
                    (change) =>
                      html`<tr>
                        <td>${moment(change.at)}</td>
                        <td>${who(names, change.actorId)}</td>
                        <td>${money(change.previousLimit)}</td>
                        <td>${money(change.newLimit)}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
      }`,
  );
}
