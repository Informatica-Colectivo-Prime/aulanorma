// Vistas de la historia «índice y cobertura» (specs/002-boe-scorm-export:
// US2; contracts/http-surface.md). Las comparten las páginas y las acciones:
// una acción que no puede guardar responde con la misma vista que la página,
// con lo que el usuario envió.
//
// Solo componen HTML con la plantilla de `@/platform/web`, que escapa todo
// valor. No consultan ni modifican nada, y no calculan la cobertura: la
// reciben calculada.
import type {
  ChangeRejection,
  Outline,
  OutlineEntry,
  OutlineReview,
  OutlineStatus,
} from "@/modules/didactic-content";
import { MAX_TITLE_LENGTH } from "@/modules/didactic-content";
import type { DocumentRecord } from "@/modules/normative-source";
import type {
  Interpretation,
  Requirement,
} from "@/modules/structured-interpretation";
import { html, noticeBox } from "@/platform/web";
import type { Html, Notice, PageReply, SessionContext } from "@/platform/web";
import {
  budgetNote,
  runCostNote,
  KIND_NAMES,
  moment,
  pageLinks,
  pagesLabel,
  reply,
  who,
} from "./shared";
import type {
  BudgetFigures,
  CostFigures,
  Names,
  RunCostFigures,
} from "./shared";
import { referencesSection, syllabusLink, syllabusNotice } from "./syllabus";

// --- Textos ---

const STATUS_NAMES: Readonly<Record<OutlineStatus, string>> = {
  proposed: "Propuesto",
  in_review: "En revisión",
  approved: "Aprobado",
  rejected: "Rechazado",
};

const REQUEST_REFUSALS: Readonly<Record<string, string>> = {
  superseded:
    "El documento de esta interpretación tiene un sustituto registrado: el índice se pide sobre la interpretación del documento nuevo.",
  not_validated:
    "El índice solo se propone a partir de una interpretación validada y vigente. Valídala primero.",
  already_exists: "Esta interpretación ya tiene un índice.",
  provider_error:
    "El servicio de generación no ha devuelto ninguna propuesta para este inventario. No se ha guardado nada.",
  invalid_output:
    "La propuesta del servicio de generación no cumple el formato exigido. Se ha rechazado y registrado, y no se ha guardado nada.",
  rejected_by_domain:
    "La propuesta del servicio de generación se apoya en requisitos que no existen en el inventario, o tiene entradas sin requisitos que no están marcadas «sin respaldo normativo». Se ha rechazado y registrado, y no se ha guardado nada.",
  budget_exceeded:
    "No hay presupuesto de generación disponible para esta operación, o supera el máximo por operación. No se ha enviado ni guardado nada.",
  estimate_changed:
    "La estimación o el coste máximo han cambiado desde que los viste, porque el inventario ha cambiado. No se ha enviado nada: revisa las cifras actuales antes de pedir el índice.",
};

const CHANGE_PROBLEMS: Readonly<Record<ChangeRejection, string>> = {
  not_found: "El elemento ya no existe.",
  superseded:
    "El documento de este índice tiene un sustituto registrado: el índice se conserva, pero ya no se puede cambiar ni rechazar.",
  conflict:
    "Otra persona u otra sesión ha cambiado este índice desde que lo abriste. No se ha guardado nada.",
  invalid: `El título no es válido. Escribe un título de una línea, de ${String(MAX_TITLE_LENGTH)} caracteres como máximo.`,
  unknown_requirement:
    "Alguno de los requisitos marcados ya no está en el inventario vigente. Revisa los vínculos.",
  removed: "Esta entrada está quitada del índice.",
  unchanged: "No has cambiado nada: no se ha guardado ninguna versión nueva.",
  cannot_move: "La entrada ya está en ese extremo del índice.",
  too_many_entries: "El índice ya tiene el máximo de entradas admitido.",
  not_reviewable:
    "Este índice no está pendiente de decisión: ya tiene una aprobación vigente o está rechazado.",
  interpretation_not_validated:
    "La interpretación en la que se apoya este índice no está validada y vigente. Valídala antes de aprobar el índice.",
  incomplete_coverage:
    "No se puede aprobar: quedan requisitos obligatorios sin cubrir. No existe ninguna forma de aprobarlo así.",
  missing_reason: "Para rechazar tienes que escribir el motivo.",
  not_rejected: "Solo se puede devolver a revisión un índice rechazado.",
  unchecked_references:
    "No se puede aprobar: quedan referencias de este índice sin comprobar contra el documento sustituto.",
  not_historical:
    "El documento no tiene ningún sustituto: no hay referencias heredadas que comprobar.",
  not_confirmed:
    "Para registrar la comprobación tienes que confirmar que la has hecho.",
  already_checked:
    "Esa referencia ya estaba comprobada o no es de este índice.",
};

export function outlineProblem(reason: ChangeRejection): string {
  return CHANGE_PROBLEMS[reason];
}

const NOTICES: Readonly<Record<string, readonly ["good" | "bad", string]>> = {
  outline_created: [
    "good",
    "La propuesta de índice se ha guardado. Revísala y comprueba la cobertura antes de aprobarla.",
  ],
  outline_edited: [
    "good",
    "El cambio queda registrado. El índice está en revisión y la cobertura se ha recalculado.",
  ],
  outline_approved: [
    "good",
    "Has aprobado el índice. Queda registrado quién, cuándo y qué versión.",
  ],
  outline_rejected: [
    "good",
    "Has rechazado el índice. Su contenido se conserva con el motivo.",
  ],
  outline_resubmitted: ["good", "El índice vuelve a estar en revisión."],
};

// Aviso de una acción del índice; `null` si el aviso no es de esta historia.
export function outlineNotice(notice: Notice | undefined): Html | null {
  if (notice === undefined) {
    return null;
  }
  if (notice.code === "outline_refused") {
    return noticeBox(
      "bad",
      REQUEST_REFUSALS[notice.detail] ?? "No se ha podido obtener el índice.",
    );
  }
  const known = NOTICES[notice.code];
  return known === undefined
    ? syllabusNotice(notice)
    : noticeBox(known[0], known[1]);
}

const DETERMINISTIC_ORIGIN =
  "Respuesta grabada de prueba, sin proveedor de generación. No es una generación real y no sirve para aceptar el recorrido.";

// Límite de la cobertura, que se declara allí donde se muestra (FR-058).
const COVERAGE_LIMIT =
  "La cobertura compara las entradas del índice con el inventario validado, requisito a requisito y solo por sus vínculos explícitos: cubrir un elemento no cubre los que dependen de él ni aquel del que depende. No garantiza que el inventario recoja todo lo que contiene el documento oficial.";

function requirementLabel(requirement: Requirement): Html {
  return html`<span class="tag">${KIND_NAMES[requirement.kind]}</span>
    ${requirement.code === "" ? null : html`<strong>${requirement.code}</strong> `}
    <span class="lines">${requirement.text}</span>`;
}

// Referencia normativa de un requisito: documento, sección y página.
function reference(document: DocumentRecord, requirement: Requirement): Html {
  return html`${document.title}, ${requirement.section},
  ${pageLinks(document.id, requirement.pageFrom, requirement.pageTo)}`;
}

function pendingList(
  document: DocumentRecord,
  pending: readonly Requirement[],
): Html {
  return html`<ul>
    ${pending.map(
      (requirement) =>
        html`<li>
          ${requirementLabel(requirement)}
          <p class="hint">${reference(document, requirement)}</p>
        </li>`,
    )}
  </ul>`;
}

function liveEntries(outline: Outline): readonly OutlineEntry[] {
  return outline.entries.filter((entry) => !entry.removed);
}

// --- Apartado del índice en la página de la interpretación ---

export function outlineSection(input: {
  readonly session: SessionContext;
  readonly interpretation: Interpretation;
  readonly outline: Outline | undefined;
  // `true` si la interpretación está validada, vigente y no es histórico.
  readonly valid: boolean;
  // `true` si el índice tiene una aprobación vigente.
  readonly approved: boolean;
  readonly cost: CostFigures | undefined;
  readonly budget: BudgetFigures;
  readonly provider: string;
}): Html {
  const { session, interpretation, outline } = input;
  if (outline !== undefined) {
    return html`<h2>Índice del temario</h2>
      <p>
        <a href="/outlines/${outline.id}">Abrir el índice y su cobertura</a>
        ${
          outline.status === "approved" && !input.approved
            ? html`<span class="tag bad">Aprobación sin vigencia</span>`
            : html`<span class="tag">${STATUS_NAMES[outline.status]}</span>`
        }
        · versión ${outline.revision}
      </p>`;
  }
  if (!input.valid) {
    return html`<h2>Índice del temario</h2>
      <p class="muted">
        El índice se propone a partir de una interpretación validada y vigente.
        Valida esta interpretación para poder pedirlo.
      </p>`;
  }
  return html`<h2>Índice del temario</h2>
    <form method="post" action="/api/outlines/request">
      <fieldset>
        <legend>Pedir una propuesta de índice</legend>
        <input type="hidden" name="csrf" value="${session.csrfToken}" />
        <input
          type="hidden"
          name="interpretation"
          value="${interpretation.id}"
        />
        <p>
          La propuesta se obtiene del inventario validado. Solo se envía al
          servicio de generación ese inventario, sin ningún dato de usuarios.
          Después la revisas, la corriges y decides si la apruebas.
        </p>
        ${budgetNote({
          budget: input.budget,
          cost: input.cost,
          provider: input.provider,
        })}
        <input
          type="hidden"
          name="shown_estimate"
          value="${input.cost?.estimatedCost ?? ""}"
        />
        <input
          type="hidden"
          name="shown_max"
          value="${input.cost?.maxCost ?? ""}"
        />
        <button type="submit" data-busy="Obteniendo la propuesta…">
          Pedir la propuesta de índice
        </button>
      </fieldset>
    </form>`;
}

// --- Índice ---

function entryItem(
  session: SessionContext,
  review: OutlineReview,
  document: DocumentRecord,
  entry: OutlineEntry,
  editable: boolean,
): Html {
  const { outline, interpretation } = review;
  const live = liveEntries(outline);
  const index = live.findIndex((item) => item.id === entry.id);
  // En el orden del inventario. Un vínculo con un requisito retirado o que
  // ya no existe se muestra aparte.
  const linked = interpretation.requirements.filter(
    (item) => !item.withdrawn && entry.requirementIds.includes(item.id),
  );
  const stale = entry.requirementIds.length - linked.length;
  const button = (mode: string, label: string, busy: string): Html =>
    html`<form method="post" action="/api/outlines/edit">
      <input type="hidden" name="csrf" value="${session.csrfToken}" />
      <input type="hidden" name="outline" value="${outline.id}" />
      <input type="hidden" name="revision" value="${outline.revision}" />
      <input type="hidden" name="entry" value="${entry.id}" />
      <input type="hidden" name="mode" value="${mode}" />
      <button class="plain" type="submit" data-busy="${busy}">
        ${label}<span class="skip"> «${entry.title}»</span>
      </button>
    </form>`;
  return html`<li>
    <strong>${entry.title}</strong>
    ${
      entry.unsupported
        ? html`<span class="tag bad">Sin respaldo normativo</span>`
        : null
    }
    ${
      entry.unsupported
        ? html`<p class="hint">
            No se apoya en ningún requisito y no cuenta para la cobertura.
          </p>`
        : html`<ul>
            ${linked.map(
              (requirement) =>
                html`<li>
                  ${requirementLabel(requirement)}
                  <span class="hint"
                    >· ${requirement.section},
                    ${pageLinks(
                      document.id,
                      requirement.pageFrom,
                      requirement.pageTo,
                    )}</span
                  >
                </li>`,
            )}
            ${
              stale === 0
                ? null
                : html`<li class="muted">
                    ${stale} vínculos con requisitos que ya no están en el
                    inventario vigente: no cuentan para la cobertura.
                  </li>`
            }
          </ul>`
    }
    ${
      editable
        ? html`<div class="actions">
            <a href="/outlines/${outline.id}/entries/${entry.id}"
              >Editar<span class="skip"> «${entry.title}»</span></a
            >
            ${index > 0 ? button("up", "Subir", "Moviendo…") : null}
            ${
              index < live.length - 1
                ? button("down", "Bajar", "Moviendo…")
                : null
            }
            ${button("remove", "Quitar", "Quitando…")}
          </div>`
        : null
    }
  </li>`;
}

export function outlineView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly review: OutlineReview;
  readonly document: DocumentRecord;
  readonly provider: string;
  // Importes de la operación de la que procede.
  readonly cost?: RunCostFigures;
  readonly names: Names;
  readonly status?: number;
  readonly problem?: string;
  // Motivo escrito en un rechazo que no llegó a guardarse.
  readonly reason?: string;
  // Requisitos pendientes que bloquearon un intento de aprobar.
  readonly blockedBy?: readonly Requirement[];
}): PageReply {
  const { session, review, document, names } = input;
  const { outline, interpretation, coverage, history } = review;
  const { id, revision } = outline;
  const editable = !review.historical;
  const live = liveEntries(outline);
  const removed = outline.entries.filter((entry) => entry.removed);
  const stale = outline.status === "approved" && review.approval === undefined;
  const covered = coverage.items.length - coverage.pending.length;
  const hidden = html`<input
      type="hidden"
      name="csrf"
      value="${session.csrfToken}"
    />
    <input type="hidden" name="outline" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />`;
  return reply(
    input.status ?? 200,
    `Índice de ${interpretation.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/documents">Documentos</a> ›
        <a href="/documents/${document.id}">${document.title}</a> ›
        <a href="/interpretations/${interpretation.id}"
          >${interpretation.unitCode}</a
        >
      </p>
      <h1>
        Índice de ${interpretation.unitCode} · ${interpretation.unitTitle}
      </h1>
      ${
        input.problem === undefined
          ? outlineNotice(input.notice)
          : noticeBox("bad", input.problem)
      }
      ${
        input.blockedBy === undefined || input.blockedBy.length === 0
          ? null
          : html`<div class="notice bad" role="alert">
              <p>Requisitos pendientes:</p>
              ${pendingList(document, input.blockedBy)}
            </div>`
      }
      ${
        review.historical
          ? html`<div class="notice" role="status">
              <p>
                El documento de este índice tiene un sustituto registrado. Se
                conserva y ya no se puede cambiar. Para aprobarlo de nuevo hay
                que comprobar antes cada una de sus referencias contra la nueva
                fuente.
              </p>
            </div>`
          : null
      }
      <dl>
        <dt>Estado</dt>
        <dd>
          ${
            stale
              ? html`<span class="tag bad">Aprobación sin vigencia</span>`
              : html`<span
                  class="tag ${
                    outline.status === "approved"
                      ? "good"
                      : outline.status === "rejected"
                        ? "bad"
                        : ""
                  }"
                  >${STATUS_NAMES[outline.status]}</span
                >`
          }
          · versión ${revision}
        </dd>
        <dt>Interpretación en la que se apoya</dt>
        <dd>
          <a href="/interpretations/${interpretation.id}"
            >${interpretation.unitCode} · ${interpretation.unitTitle}</a
          >
          ${
            review.interpretationValid
              ? html`<span class="tag good">Validada y vigente</span>`
              : html`<span class="tag bad">Sin validación vigente</span>`
          }
        </dd>
        <dt>Origen de la propuesta</dt>
        <dd>
          ${
            input.provider === "deterministic"
              ? DETERMINISTIC_ORIGIN
              : input.provider
          }
          ${
            input.cost === undefined
              ? null
              : runCostNote(input.cost, input.provider)
          }
        </dd>
      </dl>
      ${
        stale
          ? html`<div class="notice bad" role="status">
              <p>
                La aprobación de este índice ya no está vigente: la
                interpretación en la que se apoyaba ha cambiado. El índice y su
                historial se conservan; revisa la cobertura y vuelve a
                aprobarlo.
              </p>
            </div>`
          : null
      }

      <h2>Entradas</h2>
      <p>
        ${live.length} entradas.
        ${
          editable
            ? html`<a href="/outlines/${id}/entries/new">Añadir una entrada</a>
                ·`
            : null
        }
        <a href="/outlines/${id}/preview">Vista previa</a>
      </p>
      ${
        live.length === 0
          ? html`<p class="muted">El índice no tiene ninguna entrada.</p>`
          : html`<ol class="entries">
              ${live.map((entry) =>
                entryItem(session, review, document, entry, editable),
              )}
            </ol>`
      }
      ${
        removed.length === 0
          ? null
          : html`<p class="muted">
              Entradas quitadas, que se conservan en el registro:
              ${removed.map((entry) => html`<span class="gone">${entry.title}</span>; `)}
            </p>`
      }

      <h2>Cobertura de los requisitos obligatorios</h2>
      <p>
        ${covered} de ${coverage.items.length} requisitos cubiertos.
        ${
          coverage.complete
            ? html`<span class="tag good">Cobertura completa</span>`
            : html`<span class="tag bad">Cobertura incompleta</span>`
        }
      </p>
      <p class="muted">${COVERAGE_LIMIT}</p>
      <div
        class="scroll"
        tabindex="0"
        role="region"
        aria-label="Cobertura de cada requisito del inventario"
      >
        <table>
          <caption class="skip">
            Cobertura de cada requisito del inventario
          </caption>
          <thead>
            <tr>
              <th scope="col">Requisito</th>
              <th scope="col">Referencia normativa</th>
              <th scope="col">Entradas que lo cubren</th>
            </tr>
          </thead>
          <tbody>
            ${coverage.items.map(
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
                      item.entries.length === 0
                        ? html`<span class="tag bad">No cubierto</span>`
                        : item.entries.map(
                            (entry) => html`<div>${entry.title}</div>`,
                          )
                    }
                  </td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>

      ${syllabusLink({
        outlineId: id,
        approved: review.approval !== undefined,
      })}
      ${
        review.historical
          ? referencesSection({
              session,
              kind: "outline",
              targetId: id,
              document,
              pending: review.referencesPending,
              checked: review.referenceChecks.length,
            })
          : null
      }
      ${
        editable || outline.status !== "rejected"
          ? html`<h2>Aprobar</h2>
              ${
                outline.status === "approved" && !stale
                  ? html`<p>
                      Esta versión está aprobada. Cualquier cambio del índice,
                      también reordenar o renombrar, lo devuelve a revisión y
                      deja sin vigencia esta aprobación y las que dependan de
                      ella. Los textos y el historial se conservan.
                    </p>`
                  : outline.status === "rejected"
                    ? html`<form method="post" action="/api/outlines/resubmit">
                        ${hidden}
                        <p>
                          Este índice está rechazado. Corrígelo o devuélvelo a
                          revisión para poder aprobarlo.
                        </p>
                        <button type="submit" data-busy="Guardando…">
                          Devolver a revisión
                        </button>
                      </form>`
                    : html`${
                          coverage.complete
                            ? null
                            : html`<div class="notice bad" role="status">
                                <p>
                                  Con requisitos sin cubrir puedes seguir
                                  editando, guardar y previsualizar el borrador,
                                  pero no aprobarlo. Pendientes:
                                </p>
                                ${pendingList(document, coverage.pending)}
                              </div>`
                        }
                        <form method="post" action="/api/outlines/approve">
                          ${hidden}
                          <p>
                            Aprobar es una decisión tuya, sobre la versión
                            ${revision} que tienes delante. Exige que todos los
                            requisitos obligatorios estén cubiertos y que la
                            interpretación siga validada.
                          </p>
                          <button type="submit" data-busy="Aprobando…">
                            Aprobar la versión ${revision}
                          </button>
                        </form>`
              }
              ${
                outline.status === "rejected" || review.historical
                  ? null
                  : html`<h2>Rechazar</h2>
                      <form method="post" action="/api/outlines/reject">
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
                          Rechazar la versión ${revision}
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
                    Cambio
                    (${
                      item.kind === "add"
                        ? "entrada añadida"
                        : item.kind === "remove"
                          ? "entrada quitada"
                          : item.kind === "move"
                            ? "entrada reordenada"
                            : "título o requisitos de una entrada"
                    })
                    por ${who(names, item.author)}, el ${moment(item.at)}: da
                    lugar a la versión ${item.resultingRevision}.
                  </li>`,
              )}
            </ul>`
      }`,
  );
}

// --- Formulario de una entrada ---

// Valores del formulario de una entrada: lo guardado o lo que el usuario
// envió.
export interface EntryValues {
  readonly title: string;
  readonly requirementIds: readonly string[];
}

// Nombre del campo que marca un requisito en el formulario de una entrada.
export function requirementField(requirementId: string): string {
  return `req_${requirementId}`;
}

function entrySummary(review: OutlineReview, entry: OutlineEntry): Html {
  const linked = review.interpretation.requirements.filter(
    (item) => !item.withdrawn && entry.requirementIds.includes(item.id),
  );
  return html`<dl>
    <dt>Título</dt>
    <dd>${entry.title}</dd>
    <dt>Requisitos en los que se apoya</dt>
    <dd>
      ${
        entry.removed
          ? "La entrada está quitada del índice."
          : linked.length === 0
            ? "Ninguno: sin respaldo normativo."
            : html`<ul>
                ${linked.map(
                  (requirement) =>
                    html`<li>${requirementLabel(requirement)}</li>`,
                )}
              </ul>`
      }
    </dd>
  </dl>`;
}

export function entryFormView(input: {
  readonly session: SessionContext;
  readonly review: OutlineReview;
  // La entrada que se edita; `undefined` al añadir una nueva, o si ya no
  // existe.
  readonly entry: OutlineEntry | undefined;
  readonly mode: "edit" | "add";
  readonly values: EntryValues;
  readonly status?: number;
  readonly problem?: string;
  readonly conflict?: boolean;
}): PageReply {
  const { session, review, entry, mode, values } = input;
  const { outline, interpretation } = review;
  const { id, revision } = outline;
  const conflict = input.conflict === true;
  const active = interpretation.requirements.filter((item) => !item.withdrawn);
  const form = html`<form method="post" action="/api/outlines/edit">
    <input type="hidden" name="csrf" value="${session.csrfToken}" />
    <input type="hidden" name="outline" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />
    <input type="hidden" name="mode" value="${mode}" />
    <input type="hidden" name="entry" value="${entry?.id ?? ""}" />
    <label for="title">Título de la entrada</label>
    <input
      id="title"
      name="title"
      maxlength="${MAX_TITLE_LENGTH}"
      value="${values.title}"
      required
    />
    <fieldset aria-describedby="links-hint">
      <legend>Requisitos en los que se apoya</legend>
      <p class="hint" id="links-hint">
        Marca cada requisito que esta entrada cubre. Marcar un elemento no marca
        los que dependen de él. Si no marcas ninguno, la entrada queda como «sin
        respaldo normativo» y no cuenta para la cobertura.
      </p>
      ${active.map(
        (requirement) =>
          html`<label
            class="check d${Math.min(requirement.depth, 4)}"
            for="${requirementField(requirement.id)}"
          >
            <input
              id="${requirementField(requirement.id)}"
              name="${requirementField(requirement.id)}"
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
                >· ${pagesLabel(requirement.pageFrom, requirement.pageTo)}</span
              ></span
            >
          </label>`,
      )}
    </fieldset>
    <div class="actions">
      <button type="submit" data-busy="Guardando…">
        ${
          conflict
            ? `Guardar mi cambio sobre la versión ${String(revision)}`
            : mode === "add"
              ? "Añadir al índice"
              : "Guardar la entrada"
        }
      </button>
      <a href="/outlines/${id}"
        >${conflict ? "Descartar mi cambio y volver" : "Volver sin guardar"}</a
      >
    </div>
  </form>`;
  const title =
    mode === "add" ? "Añadir una entrada al índice" : "Editar una entrada";
  return reply(
    input.status ?? 200,
    title,
    session,
    html`<p class="crumbs">
        <a href="/outlines/${id}">Índice de ${interpretation.unitCode}</a>
      </p>
      <h1>${title}</h1>
      ${input.problem === undefined ? null : noticeBox("bad", input.problem)}
      ${
        conflict
          ? html`<p>
                Hay una versión más reciente del índice: la ${revision}.
                Revísala y decide: puedes volver a guardar tu cambio sobre ella,
                modificándolo si hace falta, o descartarlo. Nada se ha fusionado
                ni se guardará sin que lo pidas.
              </p>
              <div class="cols">
                <section aria-labelledby="latest">
                  <h2 id="latest">Versión más reciente (${revision})</h2>
                  ${
                    entry === undefined
                      ? html`<p>
                          ${
                            mode === "add"
                              ? "Tu entrada todavía no existe en esta versión."
                              : "Esta entrada ya no existe en la versión más reciente."
                          }
                        </p>`
                      : entrySummary(review, entry)
                  }
                  <p>
                    <a href="/outlines/${id}" target="_blank" rel="noopener"
                      >Ver el índice completo (pestaña nueva)</a
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

// --- Vista previa ---

// Vista previa del índice. No genera ningún fichero. Sin una aprobación
// vigente o con la cobertura incompleta, se identifica como borrador no
// entregable.
export function outlinePreviewView(input: {
  readonly session: SessionContext;
  readonly review: OutlineReview;
}): PageReply {
  const { session, review } = input;
  const { outline, interpretation, coverage } = review;
  const draft = review.approval === undefined || !coverage.complete;
  return reply(
    200,
    `Vista previa del índice de ${interpretation.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/outlines/${outline.id}"
          >Índice de ${interpretation.unitCode}</a
        >
      </p>
      ${
        draft
          ? html`<p class="banner" role="status">
              Borrador no entregable.
              ${
                coverage.complete
                  ? "El índice no tiene una aprobación vigente."
                  : `Quedan ${String(coverage.pending.length)} requisitos obligatorios sin cubrir.`
              }
            </p>`
          : html`<div class="notice" role="status">
              <p>
                Vista previa de un índice aprobado y vigente. No es un paquete:
                aquí no se genera ni se descarga ningún fichero.
              </p>
            </div>`
      }
      <h1>${interpretation.unitTitle}</h1>
      <p class="muted">
        ${interpretation.unitCode} · versión ${outline.revision} del índice
      </p>
      <ol>
        ${liveEntries(outline).map((entry) => html`<li>${entry.title}</li>`)}
      </ol>`,
  );
}
