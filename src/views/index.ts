// Vistas de la historia «documento e interpretación» (specs/002-boe-scorm-
// export: US1; contracts/http-surface.md). Las de la historia del índice
// están en `./outline` y se exportan desde aquí. Las comparten las páginas y las
// acciones de `src/pages`: una acción que no puede guardar (un conflicto, un
// bloqueo o un dato inválido) responde con la misma vista que la página, con
// lo que el usuario envió.
//
// Solo componen HTML con la plantilla de `@/platform/web`, que escapa todo
// valor: el texto del documento y el de la interpretación se muestran siempre
// como texto. No consultan ni modifican nada.
import type {
  DocumentPage,
  DocumentRecord,
  PageSummary,
  PdfLimits,
} from "@/modules/normative-source";
import { PAGE_RESOLUTION_STATEMENT } from "@/modules/normative-source";
import type {
  ChangeRejection,
  History,
  Interpretation,
  Requirement,
  RequirementKind,
} from "@/modules/structured-interpretation";
import {
  INVENTORY_REVIEW_STATEMENT,
  MAX_SECTION_PAGES,
} from "@/modules/structured-interpretation";
import { html, noticeBox } from "@/platform/web";
import type { Html, Notice, PageReply, SessionContext } from "@/platform/web";
import {
  budgetNote,
  KIND_NAMES,
  moment,
  pageLink,
  pageLinks,
  pagesLabel,
  reply,
  who,
} from "./shared";
import type { BudgetFigures, Names } from "./shared";

import { outlineNotice } from "./outline";

export * from "./outline";
export type { BudgetFigures, CostFigures, Names } from "./shared";

// --- Textos ---

const STATUS_NAMES: Readonly<Record<Interpretation["status"], string>> = {
  in_review: "En revisión",
  validated: "Validada",
  rejected: "Rechazada",
};

const CATEGORY_NAMES: Readonly<Record<string, string>> = {
  javascript: "JavaScript",
  xfa: "un formulario XFA",
  automatic_action: "una acción automática",
  launch: "una acción de lanzamiento",
  embedded_file: "un fichero incrustado",
  rich_media: "contenido multimedia",
  action: "una acción no admitida",
  form: "un formulario que no es solo de firma",
};

function megabytes(limits: PdfLimits): string {
  return `${String(Math.round(limits.maxBytes / (1024 * 1024)))} MB`;
}

// Motivo, comprensible, por el que no se registró un documento (FR-002).
function documentRejection(detail: string, limits: PdfLimits): string {
  const [reason = "", categories = ""] = detail.split("__");
  switch (reason) {
    case "empty":
      return "El fichero está vacío.";
    case "too_large":
      return `El fichero supera el tamaño máximo admitido, que es de ${megabytes(limits)}.`;
    case "not_pdf":
      return "El fichero no es un PDF: su contenido no empieza como un documento PDF, tenga la extensión que tenga.";
    case "encrypted":
      return "El PDF está cifrado o protegido con contraseña. Sube una copia sin cifrar.";
    case "damaged":
      return "El PDF está dañado o incompleto: no se ha podido leer su estructura sin errores.";
    case "active_content": {
      const found = categories
        .split("+")
        .map((category) => CATEGORY_NAMES[category])
        .filter((name) => name !== undefined);
      return `El PDF tiene contenido activo, que no se admite${found.length > 0 ? `: ${found.join(", ")}` : ""}.`;
    }
    case "form_not_allowed":
      return "El PDF contiene un formulario. Solo se admite un formulario cuyos campos sean todos de firma digital y no tengan acciones.";
    case "too_many_pages":
      return `El PDF supera el número máximo de páginas admitido, que es de ${String(limits.maxPages)}.`;
    case "duplicate":
      return "Este mismo fichero ya está registrado: su huella coincide con la de un documento existente.";
    case "invalid_metadata":
      return "Faltan datos del documento o alguno no es válido. Revisa los campos y la fecha de obtención.";
    case "unknown_replaced_document":
      return "El documento al que este debía sustituir no existe.";
    default:
      return "No se ha podido comprobar el PDF, así que no se admite. Si el problema continúa, avisa a quien administra AulaNorma.";
  }
}

const REQUEST_REFUSALS: Readonly<Record<string, string>> = {
  superseded:
    "Este documento tiene un sustituto registrado: la interpretación se pide sobre el documento nuevo.",
  invalid_unit:
    "El código de la unidad no es válido. Usa mayúsculas, cifras y guion bajo, como aparece en el documento.",
  invalid_pages: `Las páginas de la sección no son válidas. Indica la primera y la última, dentro del documento, con un máximo de ${String(MAX_SECTION_PAGES)} páginas.`,
  already_exists:
    "Ya existe una interpretación de esa unidad para este documento.",
  provider_error:
    "El servicio de generación no ha devuelto ninguna respuesta para este documento, esta unidad y estas páginas. No se ha guardado nada.",
  invalid_output:
    "La respuesta del servicio de generación no cumple el formato exigido. Se ha rechazado y registrado, y no se ha guardado nada.",
  rejected_by_domain:
    "La respuesta del servicio de generación cita páginas o textos que no están en el documento. Se ha rechazado y registrado, y no se ha guardado nada.",
  budget_exceeded:
    "No hay presupuesto de generación disponible para esta operación, o supera el máximo por operación. No se ha enviado ni guardado nada.",
};

const CHANGE_PROBLEMS: Readonly<Record<ChangeRejection, string>> = {
  not_found: "El elemento ya no existe.",
  superseded:
    "El documento de esta interpretación tiene un sustituto registrado: la interpretación se conserva como histórico y ya no se puede cambiar.",
  conflict:
    "Otra persona u otra sesión ha cambiado esta interpretación desde que la abriste. No se ha guardado nada.",
  invalid:
    "Algún dato no es válido. Revisa que el texto, la sección y las páginas estén completos y que la última página no sea anterior a la primera.",
  invalid_parent:
    "La jerarquía no es válida: un criterio depende de una capacidad; un subapartado, de un contenido o de otro subapartado; y las capacidades y los contenidos no dependen de nada.",
  page_not_found: "La página indicada no existe en el documento.",
  quote_not_found:
    "La cita no aparece en el texto extraído de las páginas indicadas. Cópiala tal como figura en la página o déjala vacía.",
  has_children:
    "Este elemento tiene otros que dependen de él. Retira o mueve primero esos elementos.",
  withdrawn: "Este elemento está retirado del inventario.",
  not_confirmed:
    "Para validar tienes que confirmar que has revisado el inventario contra la sección original.",
  not_in_review:
    "Solo se puede validar una interpretación que está en revisión.",
  empty_inventory:
    "La interpretación no tiene ningún requisito: no hay inventario que validar.",
  unresolved_pages:
    "Hay páginas sin texto extraíble pendientes de resolver. La validación está bloqueada hasta resolverlas.",
  missing_reason: "Para rechazar tienes que escribir el motivo.",
  not_rejected:
    "Solo se puede devolver a revisión una interpretación rechazada.",
};

export function changeProblem(reason: ChangeRejection): string {
  return CHANGE_PROBLEMS[reason];
}

const NOTICES: Readonly<Record<string, readonly ["good" | "bad", string]>> = {
  document_registered: [
    "good",
    "El documento se ha registrado. Comprueba su procedencia y su huella.",
  ],
  page_resolved: ["good", "La página queda resuelta y registrada."],
  page_not_resolved: [
    "bad",
    "La página no se ha resuelto: hace falta tu confirmación expresa, y solo se resuelven páginas sin texto que sigan pendientes.",
  ],
  interpretation_created: [
    "good",
    "La interpretación se ha guardado. Revísala contra el documento antes de validarla.",
  ],
  interpretation_corrected: [
    "good",
    "La corrección queda registrada. La interpretación vuelve a estar en revisión.",
  ],
  interpretation_validated: [
    "good",
    "Has validado la interpretación. Queda registrado quién, cuándo y qué versión.",
  ],
  interpretation_rejected: [
    "good",
    "Has rechazado la interpretación. Su contenido se conserva con el motivo.",
  ],
  interpretation_resubmitted: [
    "good",
    "La interpretación vuelve a estar en revisión.",
  ],
};

function noticeOf(notice: Notice | undefined, limits?: PdfLimits): Html | null {
  if (notice === undefined) {
    return null;
  }
  if (notice.code === "document_rejected" && limits !== undefined) {
    return noticeBox(
      "bad",
      `No se ha registrado nada. ${documentRejection(notice.detail, limits)}`,
    );
  }
  if (notice.code === "interpretation_refused") {
    return noticeBox(
      "bad",
      REQUEST_REFUSALS[notice.detail] ??
        "No se ha podido obtener la interpretación.",
    );
  }
  if (notice.code === "interpretation_blocked") {
    const reason = Object.keys(CHANGE_PROBLEMS).find(
      (key) => key === notice.detail,
    );
    return noticeBox(
      "bad",
      reason === undefined
        ? "No se ha guardado nada."
        : CHANGE_PROBLEMS[reason as ChangeRejection],
    );
  }
  const known = NOTICES[notice.code];
  return known === undefined
    ? outlineNotice(notice)
    : noticeBox(known[0], known[1]);
}

// --- Documentos ---

export function documentsView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly documents: readonly DocumentRecord[];
}): PageReply {
  const { session, documents } = input;
  const superseded = new Set(
    documents.map((document) => document.replacesDocumentId),
  );
  return reply(
    200,
    "Documentos",
    session,
    html`<h1>Documentos</h1>
      ${noticeOf(input.notice)}
      <p><a href="/documents/new">Subir un documento oficial</a></p>
      ${
        documents.length === 0
          ? html`<p class="muted">
              Todavía no hay ningún documento registrado.
            </p>`
          : html`<div class="scroll">
              <table>
                <caption class="muted">
                  Documentos registrados, del más reciente al más antiguo
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Documento</th>
                    <th scope="col">Referencia oficial</th>
                    <th scope="col">Páginas</th>
                    <th scope="col">Registrado</th>
                  </tr>
                </thead>
                <tbody>
                  ${documents.map(
                    (document) =>
                      html`<tr>
                        <td>
                          <a href="/documents/${document.id}"
                            >${document.title}</a
                          >
                          ${
                            superseded.has(document.id)
                              ? html` <span class="tag">Sustituido</span>`
                              : null
                          }
                        </td>
                        <td>${document.officialReference}</td>
                        <td>${document.pageCount}</td>
                        <td>${moment(document.registeredAt)}</td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
      }`,
  );
}

export function uploadView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly limits: PdfLimits;
  readonly documents: readonly DocumentRecord[];
}): PageReply {
  const { session, limits, documents } = input;
  const size = megabytes(limits);
  return reply(
    200,
    "Subir un documento",
    session,
    html`<p class="crumbs"><a href="/documents">Documentos</a></p>
      <h1>Subir un documento oficial</h1>
      ${noticeOf(input.notice, limits)}
      <p>
        Sube el PDF tal como lo publica el boletín oficial. Se comprueba su
        estructura y se extrae su texto página a página; el fichero original se
        conserva sin modificar.
      </p>
      <noscript>
        <div class="notice bad" role="alert">
          <p>Para subir un documento hace falta JavaScript en el navegador.</p>
        </div>
      </noscript>
      <form
        method="post"
        action="/api/documents/upload"
        data-upload
        data-max-bytes="${limits.maxBytes}"
        data-too-large="El fichero supera el tamaño máximo admitido, que es de ${size}."
        data-failed="No se ha podido subir el documento. Comprueba el tamaño del fichero y la conexión, y vuelve a intentarlo."
      >
        <input type="hidden" name="csrf" value="${session.csrfToken}" />
        <label for="file">Fichero PDF</label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          aria-describedby="file-hint"
          required
        />
        <p class="hint" id="file-hint">
          Como máximo ${size} y ${limits.maxPages} páginas. No se admiten PDF
          cifrados, dañados ni con contenido activo.
        </p>
        <fieldset>
          <legend>Procedencia</legend>
          <label for="title">Título</label>
          <input id="title" name="title" maxlength="300" required />
          <label for="issuer">Organismo emisor</label>
          <input id="issuer" name="issuer" maxlength="200" required />
          <label for="official_reference">Referencia oficial</label>
          <input
            id="official_reference"
            name="official_reference"
            maxlength="100"
            aria-describedby="reference-hint"
            required
          />
          <p class="hint" id="reference-hint">
            El identificador de la publicación en el boletín.
          </p>
          <label for="source">Procedencia de obtención</label>
          <input
            id="source"
            name="source"
            maxlength="500"
            aria-describedby="source-hint"
            required
          />
          <p class="hint" id="source-hint">
            De dónde se ha obtenido el fichero; por ejemplo, su dirección en la
            sede del boletín.
          </p>
          <label for="obtained_on">Fecha de obtención</label>
          <input id="obtained_on" name="obtained_on" type="date" required />
          <label for="version">Versión</label>
          <input
            id="version"
            name="version"
            maxlength="100"
            aria-describedby="version-hint"
            required
          />
          <p class="hint" id="version-hint">
            Por ejemplo, «Texto original» o la fecha de un texto consolidado.
          </p>
        </fieldset>
        ${
          documents.length === 0
            ? null
            : html`<label for="replaces">Sustituye a (opcional)</label>
                <select
                  id="replaces"
                  name="replaces"
                  aria-describedby="replaces-hint"
                >
                  <option value="">A ninguno: es un documento nuevo</option>
                  ${documents.map(
                    (document) =>
                      html`<option value="${document.id}">
                        ${document.title} (${document.officialReference})
                      </option>`,
                  )}
                </select>
                <p class="hint" id="replaces-hint">
                  Úsalo solo si este fichero es una fuente legible que sustituye
                  a un documento ya registrado. El anterior se conserva como
                  histórico; la interpretación se pide de nuevo y no hereda
                  ninguna validación.
                </p>`
        }
        <p data-upload-status role="alert" tabindex="-1" class="hint"></p>
        <button type="submit" data-busy="Comprobando el documento…">
          Subir y registrar
        </button>
      </form>`,
  );
}

export function documentView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly document: DocumentRecord;
  readonly replaced: DocumentRecord | undefined;
  readonly substitutes: readonly DocumentRecord[];
  readonly pages: readonly PageSummary[];
  readonly interpretations: readonly Interpretation[];
  readonly names: Names;
  readonly budget: BudgetFigures;
  // Nombre del adaptador de generación en uso.
  readonly provider: string;
}): PageReply {
  const { session, document, pages, interpretations, substitutes } = input;
  const withoutText = pages.filter((page) => !page.hasExtractableText);
  const withImages = pages.filter((page) => page.hasImages);
  const pending = withoutText.filter((page) => page.resolution === null);
  return reply(
    200,
    document.title,
    session,
    html`<p class="crumbs"><a href="/documents">Documentos</a></p>
      <h1>${document.title}</h1>
      ${noticeOf(input.notice)}
      ${
        substitutes.length === 0
          ? null
          : html`<div class="notice" role="status">
              <p>
                Este documento se conserva como histórico. Lo sustituye
                ${substitutes.map(
                  (substitute) =>
                    html`<a href="/documents/${substitute.id}"
                      >${substitute.title}</a
                    > `,
                )}
              </p>
            </div>`
      }
      <h2>Registro y procedencia</h2>
      <dl>
        <dt>Organismo emisor</dt>
        <dd>${document.issuer}</dd>
        <dt>Referencia oficial</dt>
        <dd>${document.officialReference}</dd>
        <dt>Procedencia de obtención</dt>
        <dd>${document.source}</dd>
        <dt>Fecha de obtención</dt>
        <dd>${document.obtainedOn}</dd>
        <dt>Versión</dt>
        <dd>${document.version}</dd>
        <dt>Huella SHA-256 del fichero</dt>
        <dd><code>${document.sha256}</code></dd>
        <dt>Tamaño y páginas</dt>
        <dd>${document.sizeBytes} bytes, ${document.pageCount} páginas</dd>
        <dt>Registrado</dt>
        <dd>
          ${moment(document.registeredAt)}, por
          ${who(input.names, document.registeredBy)}
        </dd>
        <dt>Identificador interno</dt>
        <dd><code>${document.id}</code></dd>
        ${
          input.replaced === undefined
            ? null
            : html`<dt>Sustituye a</dt>
                <dd>
                  <a href="/documents/${input.replaced.id}"
                    >${input.replaced.title}</a
                  >
                </dd>`
        }
      </dl>
      <p>
        <a href="/documents/${document.id}/file" target="_blank" rel="noopener"
          >Abrir el PDF original (pestaña nueva)</a
        >
        ·
        <a href="/documents/${document.id}/pages/1">Ver el texto por página</a>
      </p>
      ${
        document.hasSignatureField
          ? html`<p class="muted">
              El documento tiene un campo de firma digital. Se ha admitido por
              su estructura; la firma no se ha comprobado.
            </p>`
          : null
      }
      <p class="muted">
        Este registro acredita qué fichero se subió y de dónde dijo obtenerse.
        No acredita la vigencia jurídica de la norma ni que el texto extraído
        coincida con el original: eso se revisa en la interpretación.
      </p>

      <h2>Páginas que requieren atención</h2>
      ${
        withoutText.length === 0
          ? html`<p>Todas las páginas tienen texto extraíble.</p>`
          : html`<p>
                ${withoutText.length} páginas no tienen texto extraíble;
                ${pending.length} siguen sin resolver. Mientras quede alguna, no
                se puede validar ninguna interpretación de este documento.
              </p>
              <ul>
                ${withoutText.map(
                  (page) =>
                    html`<li>
                      ${pageLink(document.id, page.number)}:
                      ${
                        page.resolution === null
                          ? html`<span class="tag bad">Sin resolver</span>`
                          : html`<span class="tag good">Resuelta</span> por
                              ${who(input.names, page.resolution.resolvedBy)},
                              el ${moment(page.resolution.resolvedAt)}`
                      }
                    </li>`,
                )}
              </ul>`
      }
      ${
        withImages.length === 0
          ? html`<p>Ninguna página contiene imágenes.</p>`
          : html`<p>
              Estas páginas contienen imágenes, que pueden llevar contenido que
              no es texto:
              ${withImages.map(
                (page) => html`${pageLink(document.id, page.number)} `,
              )}
            </p>`
      }

      <h2>Interpretaciones</h2>
      ${
        interpretations.length === 0
          ? html`<p class="muted">
              Todavía no se ha pedido ninguna interpretación de este documento.
            </p>`
          : html`<ul>
              ${interpretations.map(
                (interpretation) =>
                  html`<li>
                    <a href="/interpretations/${interpretation.id}"
                      >${interpretation.unitCode} ·
                      ${interpretation.unitTitle}</a
                    >
                    <span class="tag"
                      >${STATUS_NAMES[interpretation.status]}</span
                    >
                  </li>`,
              )}
            </ul>`
      }
      ${
        substitutes.length > 0
          ? null
          : html`<form method="post" action="/api/interpretations/request">
              <fieldset>
                <legend>Pedir la interpretación de una unidad formativa</legend>
                <input type="hidden" name="csrf" value="${session.csrfToken}" />
                <input type="hidden" name="document" value="${document.id}" />
                <label for="unit_code">Código de la unidad formativa</label>
                <input
                  id="unit_code"
                  name="unit_code"
                  maxlength="20"
                  autocapitalize="characters"
                  required
                />
                <label for="page_from">Primera página de su sección</label>
                <input
                  id="page_from"
                  name="page_from"
                  type="number"
                  min="1"
                  max="${document.pageCount}"
                  required
                />
                <label for="page_to">Última página de su sección</label>
                <input
                  id="page_to"
                  name="page_to"
                  type="number"
                  min="1"
                  max="${document.pageCount}"
                  aria-describedby="section-hint"
                  required
                />
                <p class="hint" id="section-hint">
                  Páginas del PDF, no del boletín. Solo se envía al servicio de
                  generación el texto de esas páginas, sin ningún dato de
                  usuarios.
                </p>
                ${budgetNote({
                  budget: input.budget,
                  cost: undefined,
                  provider: input.provider,
                })}
                <p class="hint">
                  El coste máximo de esta operación depende de las páginas que
                  indiques: se calcula y se reserva al enviarla.
                </p>
                <button type="submit" data-busy="Obteniendo la interpretación…">
                  Pedir la interpretación
                </button>
              </fieldset>
            </form>`
      }`,
  );
}

export function pageView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly document: DocumentRecord;
  readonly page: DocumentPage;
  readonly names: Names;
}): PageReply {
  const { session, document, page } = input;
  const { number } = page;
  return reply(
    200,
    `Página ${String(number)} · ${document.title}`,
    session,
    html`<p class="crumbs">
        <a href="/documents">Documentos</a> ›
        <a href="/documents/${document.id}">${document.title}</a>
      </p>
      <h1>Página ${number} de ${document.pageCount}</h1>
      ${noticeOf(input.notice)}
      <p class="actions">
        ${
          number > 1
            ? html`<a href="/documents/${document.id}/pages/${number - 1}"
                >← Página anterior</a
              >`
            : null
        }
        ${
          number < document.pageCount
            ? html`<a href="/documents/${document.id}/pages/${number + 1}"
                >Página siguiente →</a
              >`
            : null
        }
        <a
          href="/documents/${document.id}/file#page=${number}"
          target="_blank"
          rel="noopener"
          >Abrir esta página en el PDF original (pestaña nueva)</a
        >
      </p>
      ${
        page.hasImages
          ? html`<div class="notice" role="status">
              <p>
                Esta página contiene imágenes, que pueden llevar contenido que
                no es texto. Compárala con el PDF original.
              </p>
            </div>`
          : null
      }
      <h2>Texto extraído</h2>
      ${
        page.hasExtractableText
          ? html`<pre class="source">${page.text}</pre>
              <p class="muted">
                Es el texto que la extracción ha obtenido de la página. Puede no
                ser todo su contenido ni estar en el orden de lectura: la
                referencia es el PDF original.
              </p>`
          : html`<div class="notice bad" role="status">
                <p>
                  Esta página no tiene texto extraíble. No se descarta: hay que
                  resolverla antes de validar una interpretación.
                </p>
              </div>
              ${
                page.resolution === null
                  ? html`<form
                      method="post"
                      action="/api/documents/resolve-page"
                    >
                      <fieldset>
                        <legend>Resolver esta página</legend>
                        <p>
                          Abre la página en el PDF original y compruébala. Si
                          contiene información necesaria de la unidad, no la
                          resuelvas: hace falta registrar una fuente legible
                          como documento sustituto.
                        </p>
                        <input
                          type="hidden"
                          name="csrf"
                          value="${session.csrfToken}"
                        />
                        <input
                          type="hidden"
                          name="document"
                          value="${document.id}"
                        />
                        <input type="hidden" name="page" value="${number}" />
                        <label class="check" for="confirmed">
                          <input
                            id="confirmed"
                            name="confirmed"
                            type="checkbox"
                            value="yes"
                            required
                          />
                          <span>${PAGE_RESOLUTION_STATEMENT}</span>
                        </label>
                        <button type="submit" data-busy="Registrando…">
                          Registrar mi confirmación
                        </button>
                      </fieldset>
                    </form>`
                  : html`<p>
                      <span class="tag good">Resuelta</span> por
                      ${who(input.names, page.resolution.resolvedBy)}, el
                      ${moment(page.resolution.resolvedAt)}:
                      «${page.resolution.statement}»
                    </p>`
              }`
      }`,
  );
}

// --- Interpretación ---

function requirementItem(
  interpretation: Interpretation,
  requirement: Requirement,
  editable: boolean,
): Html {
  const depth = Math.min(requirement.depth, 4);
  return html`<li class="d${depth}">
    <span class="tag">${KIND_NAMES[requirement.kind]}</span>
    ${requirement.withdrawn ? html`<span class="tag bad">Retirado</span>` : null}
    ${
      requirement.origin === "correction"
        ? html`<span class="tag">Añadido en la revisión</span>`
        : null
    }
    <p class="${requirement.withdrawn ? "gone" : ""}">
      ${
        requirement.code === ""
          ? null
          : html`<strong>${requirement.code}</strong> `
      }<span class="lines">${requirement.text}</span>
    </p>
    <p class="hint">
      ${requirement.section},
      ${pageLinks(
        interpretation.documentId,
        requirement.pageFrom,
        requirement.pageTo,
      )}
      ${
        editable && !requirement.withdrawn
          ? html`·
              <a
                href="/interpretations/${interpretation.id}/requirements/${requirement.id}"
                >Corregir<span class="skip"> ${requirement.code}</span></a
              >`
          : null
      }
    </p>
    ${
      requirement.quote === null
        ? null
        : html`<blockquote>${requirement.quote}</blockquote>`
    }
  </li>`;
}

export function interpretationView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly interpretation: Interpretation;
  readonly document: DocumentRecord;
  readonly history: History;
  readonly unresolvedPages: readonly number[];
  readonly superseded: boolean;
  readonly provider: string;
  readonly names: Names;
  readonly status?: number;
  // Motivo escrito en un rechazo que no llegó a guardarse.
  readonly reason?: string;
  readonly problem?: string;
  // Apartado del índice de esta interpretación (`outlineSection`).
  readonly outlineSection?: Html | null;
}): PageReply {
  const { session, interpretation, document, history, names } = input;
  const { id, revision } = interpretation;
  const editable = !input.superseded;
  const active = interpretation.requirements.filter((item) => !item.withdrawn);
  const count = (kind: RequirementKind): number =>
    active.filter((item) => item.kind === kind).length;
  const section = pageLinks(
    document.id,
    interpretation.sectionPageFrom,
    interpretation.sectionPageTo,
  );
  const hidden = html`<input
      type="hidden"
      name="csrf"
      value="${session.csrfToken}"
    />
    <input type="hidden" name="interpretation" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />`;
  return reply(
    input.status ?? 200,
    `Interpretación de ${interpretation.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/documents">Documentos</a> ›
        <a href="/documents/${document.id}">${document.title}</a>
      </p>
      <h1>${interpretation.unitCode} · ${interpretation.unitTitle}</h1>
      ${
        input.problem === undefined
          ? noticeOf(input.notice)
          : noticeBox("bad", input.problem)
      }
      ${
        input.superseded
          ? html`<div class="notice" role="status">
              <p>
                El documento de esta interpretación tiene un sustituto
                registrado. Se conserva como histórico y ya no se puede corregir
                ni validar.
              </p>
            </div>`
          : null
      }
      <dl>
        <dt>Estado</dt>
        <dd>
          <span
            class="tag ${
              interpretation.status === "validated"
                ? "good"
                : interpretation.status === "rejected"
                  ? "bad"
                  : ""
            }"
            >${STATUS_NAMES[interpretation.status]}</span
          >
          · versión ${revision}
        </dd>
        <dt>Documento</dt>
        <dd>
          <a href="/documents/${document.id}">${document.title}</a>
          (${document.officialReference})
        </dd>
        <dt>Sección original de la unidad</dt>
        <dd>${section}</dd>
        <dt>Origen de la propuesta</dt>
        <dd>
          ${
            input.provider === "deterministic"
              ? "Respuesta grabada del adaptador determinista. No es una generación real y no sirve para aceptar el recorrido."
              : input.provider
          }
        </dd>
      </dl>

      <h2>Duración normativa</h2>
      <p>
        ${
          interpretation.durationHours === null
            ? "No consta."
            : html`${interpretation.durationHours} horas`
        }
        ${
          interpretation.durationPage === null
            ? null
            : html`· ${interpretation.durationSection},
              ${pageLink(document.id, interpretation.durationPage)}`
        }
        ${
          editable
            ? html`·
                <a href="/interpretations/${id}/unit">Corregir la unidad</a>`
            : null
        }
      </p>
      ${
        interpretation.durationQuote === null
          ? null
          : html`<blockquote>${interpretation.durationQuote}</blockquote>`
      }
      <p class="muted">
        La duración es un dato de la unidad, no un requisito de cobertura. El
        producto no exige ni mide ningún tiempo de conexión.
      </p>

      <h2>Inventario de requisitos</h2>
      <p>
        ${count("capability")} capacidades, ${count("criterion")} criterios de
        evaluación, ${count("content")} contenidos y ${count("subcontent")}
        subapartados.
        ${
          editable
            ? html`<a href="/interpretations/${id}/requirements/new"
                >Añadir un requisito que falta</a
              >`
            : null
        }
      </p>
      ${
        interpretation.requirements.length === 0
          ? html`<div class="notice bad" role="status">
              <p>
                La interpretación no contiene ningún requisito. Sin inventario
                no se puede validar.
              </p>
            </div>`
          : html`<ul class="tree">
              ${interpretation.requirements.map((requirement) =>
                requirementItem(interpretation, requirement, editable),
              )}
            </ul>`
      }
      <p class="muted">
        El inventario recoge lo que la extracción ha identificado en la sección.
        No garantiza que sea todo lo que contiene el documento oficial: por eso
        hay que revisarlo contra la sección original antes de validar.
      </p>

      ${
        editable
          ? html`<h2>Validar</h2>
              ${
                input.unresolvedPages.length === 0
                  ? null
                  : html`<div class="notice bad" role="status">
                      <p>
                        La validación está bloqueada: estas páginas del
                        documento no tienen texto extraíble y siguen sin
                        resolver:
                        ${input.unresolvedPages.map(
                          (number) => html`${pageLink(document.id, number)} `,
                        )}
                      </p>
                    </div>`
              }
              ${
                interpretation.status === "validated"
                  ? html`<p>
                      Esta versión está validada. Cualquier corrección la
                      devuelve a revisión y deja sin vigencia la validación.
                    </p>`
                  : interpretation.status === "rejected"
                    ? html`<form
                        method="post"
                        action="/api/interpretations/resubmit"
                      >
                        ${hidden}
                        <p>
                          Esta interpretación está rechazada. Corrígela o
                          devuélvela a revisión para poder validarla.
                        </p>
                        <button type="submit" data-busy="Guardando…">
                          Devolver a revisión
                        </button>
                      </form>`
                    : html`<form
                        method="post"
                        action="/api/interpretations/validate"
                      >
                        ${hidden}
                        <p>
                          Validar es una decisión tuya. Antes, abre la sección
                          original (${section}) y comprueba que el inventario
                          recoge todas sus capacidades, criterios, contenidos y
                          subapartados.
                        </p>
                        <label class="check" for="inventory_reviewed">
                          <input
                            id="inventory_reviewed"
                            name="inventory_reviewed"
                            type="checkbox"
                            value="yes"
                            required
                          />
                          <span>${INVENTORY_REVIEW_STATEMENT}</span>
                        </label>
                        <button type="submit" data-busy="Validando…">
                          Validar la versión ${revision}
                        </button>
                      </form>`
              }
              ${
                interpretation.status === "rejected"
                  ? null
                  : html`<h2>Rechazar</h2>
                      <form method="post" action="/api/interpretations/reject">
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
      ${input.outlineSection ?? null}

      <h2>Registro</h2>
      ${
        history.validations.length +
          history.rejections.length +
          history.corrections.length ===
        0
          ? html`<p class="muted">
              Todavía no hay validaciones, rechazos ni correcciones.
            </p>`
          : html`<ul>
              ${history.validations.map(
                (item) =>
                  html`<li>
                    Validación de la versión ${item.revision} por
                    ${who(names, item.validatedBy)}, el
                    ${moment(item.validatedAt)}.
                    ${
                      item.current
                        ? html`<span class="tag good">Vigente</span>`
                        : html`<span class="tag">Sin vigencia</span>`
                    }
                    «${item.inventoryReviewedStatement}»
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
              ${history.corrections.map(
                (item) =>
                  html`<li>
                    Corrección
                    (${
                      item.kind === "add"
                        ? "requisito añadido"
                        : item.kind === "withdraw"
                          ? "requisito retirado"
                          : item.kind === "unit"
                            ? "datos de la unidad"
                            : "requisito modificado"
                    })
                    por ${who(names, item.author)}, el ${moment(item.at)}: da
                    lugar a la versión ${item.resultingRevision}.
                  </li>`,
              )}
            </ul>`
      }`,
  );
}

// Valores de un formulario de requisito, como texto: lo que hay guardado o lo
// que el usuario envió.
export interface RequirementValues {
  readonly kind: string;
  readonly parent: string;
  readonly code: string;
  readonly text: string;
  readonly section: string;
  readonly pageFrom: string;
  readonly pageTo: string;
  readonly quote: string;
}

export function valuesOf(requirement: Requirement): RequirementValues {
  return {
    kind: requirement.kind,
    parent: requirement.parentId ?? "",
    code: requirement.code,
    text: requirement.text,
    section: requirement.section,
    pageFrom: String(requirement.pageFrom),
    pageTo: String(requirement.pageTo),
    quote: requirement.quote ?? "",
  };
}

function requirementSummary(
  interpretation: Interpretation,
  requirement: Requirement,
): Html {
  const parent = interpretation.requirements.find(
    ({ id }) => id === requirement.parentId,
  );
  return html`<dl>
    <dt>Tipo</dt>
    <dd>${KIND_NAMES[requirement.kind]}</dd>
    <dt>Depende de</dt>
    <dd>
      ${parent === undefined ? "Nada" : `${parent.code} ${parent.text}`.trim()}
    </dd>
    <dt>Código</dt>
    <dd>${requirement.code === "" ? "Sin código" : requirement.code}</dd>
    <dt>Texto</dt>
    <dd>${requirement.text}</dd>
    <dt>Sección y páginas</dt>
    <dd>
      ${requirement.section},
      ${pagesLabel(requirement.pageFrom, requirement.pageTo)}
    </dd>
    <dt>Cita</dt>
    <dd>${requirement.quote ?? "Sin cita"}</dd>
    <dt>Estado</dt>
    <dd>
      ${requirement.withdrawn ? "Retirado del inventario" : "En el inventario"}
    </dd>
  </dl>`;
}

// Formulario para corregir o añadir un requisito. Con `conflict`, es la
// respuesta a un guardado sobre una versión anterior: muestra la versión más
// reciente junto al cambio enviado, que sigue en el formulario, y permite
// reenviarlo de forma explícita contra esa versión o descartarlo (FR-063).
export function requirementFormView(input: {
  readonly session: SessionContext;
  readonly interpretation: Interpretation;
  // El requisito que se corrige; `undefined` al añadir uno nuevo, o si ya no
  // existe.
  readonly requirement: Requirement | undefined;
  readonly mode: "edit" | "add";
  readonly values: RequirementValues;
  readonly status?: number;
  readonly problem?: string;
  readonly conflict?: boolean;
}): PageReply {
  const { session, interpretation, requirement, mode, values } = input;
  const { id, revision } = interpretation;
  const conflict = input.conflict === true;
  const parents = interpretation.requirements.filter(
    (item) =>
      !item.withdrawn &&
      item.id !== requirement?.id &&
      item.kind !== "criterion",
  );
  const back = html`<a href="/interpretations/${id}"
    >${conflict ? "Descartar mi cambio y volver" : "Volver sin guardar"}</a
  >`;
  const form = html`<form method="post" action="/api/interpretations/correct">
    <input type="hidden" name="csrf" value="${session.csrfToken}" />
    <input type="hidden" name="interpretation" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />
    <input type="hidden" name="mode" value="${mode}" />
    <input type="hidden" name="requirement" value="${requirement?.id ?? ""}" />
    <label for="kind">Tipo</label>
    <select id="kind" name="kind" required>
      ${Object.entries(KIND_NAMES).map(
        ([kind, name]) =>
          html`<option
            value="${kind}"
            ${kind === values.kind ? html`selected` : null}
          >
            ${name}
          </option>`,
      )}
    </select>
    <label for="parent">Depende de</label>
    <select id="parent" name="parent" aria-describedby="parent-hint">
      <option value="">Nada: es una capacidad o un contenido</option>
      ${parents.map(
        (item) =>
          html`<option
            value="${item.id}"
            ${item.id === values.parent ? html`selected` : null}
          >
            ${KIND_NAMES[item.kind]}: ${item.code} ${item.text.slice(0, 80)}
          </option>`,
      )}
    </select>
    <p class="hint" id="parent-hint">
      Un criterio depende de una capacidad; un subapartado, de un contenido o de
      otro subapartado.
    </p>
    <label for="code">Código o numeración</label>
    <input id="code" name="code" maxlength="40" value="${values.code}" />
    <label for="text">Texto</label>
    <textarea id="text" name="text" maxlength="4000" required>
${values.text}</textarea>
    <label for="section">Sección del documento</label>
    <input
      id="section"
      name="section"
      maxlength="200"
      value="${values.section}"
      required
    />
    <label for="page_from">Primera página</label>
    <input
      id="page_from"
      name="page_from"
      type="number"
      min="1"
      value="${values.pageFrom}"
      required
    />
    <label for="page_to">Última página</label>
    <input
      id="page_to"
      name="page_to"
      type="number"
      min="1"
      value="${values.pageTo}"
      required
    />
    <label for="quote">Cita literal (opcional)</label>
    <textarea
      id="quote"
      name="quote"
      maxlength="2000"
      aria-describedby="quote-hint"
    >
${values.quote}</textarea>
    <p class="hint" id="quote-hint">
      Si la escribes, debe aparecer tal cual en el texto extraído de esas
      páginas.
    </p>
    <div class="actions">
      <button type="submit" data-busy="Guardando…">
        ${
          conflict
            ? `Guardar mi cambio sobre la versión ${String(revision)}`
            : mode === "add"
              ? "Añadir al inventario"
              : "Guardar la corrección"
        }
      </button>
      ${back}
    </div>
  </form>`;
  const title =
    mode === "add"
      ? "Añadir un requisito"
      : `Corregir ${requirement?.code ?? "un requisito"}`.trim();
  return reply(
    input.status ?? 200,
    title,
    session,
    html`<p class="crumbs">
        <a href="/interpretations/${id}"
          >${interpretation.unitCode} · ${interpretation.unitTitle}</a
        >
      </p>
      <h1>${title}</h1>
      ${input.problem === undefined ? null : noticeBox("bad", input.problem)}
      ${
        conflict
          ? html`<p>
                Hay una versión más reciente de la interpretación: la
                ${revision}. Revísala y decide: puedes volver a guardar tu
                cambio sobre ella, modificándolo si hace falta, o descartarlo.
                Nada se ha fusionado ni se guardará sin que lo pidas.
              </p>
              <div class="cols">
                <section aria-labelledby="latest">
                  <h2 id="latest">Versión más reciente (${revision})</h2>
                  ${
                    requirement === undefined
                      ? html`<p>
                          ${
                            mode === "add"
                              ? "Tu requisito todavía no existe en esta versión."
                              : "Este requisito ya no existe en la versión más reciente."
                          }
                        </p>`
                      : requirementSummary(interpretation, requirement)
                  }
                  <p>
                    <a
                      href="/interpretations/${id}"
                      target="_blank"
                      rel="noopener"
                      >Ver la interpretación completa (pestaña nueva)</a
                    >
                  </p>
                </section>
                <section aria-labelledby="mine">
                  <h2 id="mine">Tu cambio, sin guardar</h2>
                  ${form}
                </section>
              </div>`
          : html`${form}
            ${
              mode === "edit" && requirement !== undefined
                ? html`<h2>Retirar del inventario</h2>
                    <form method="post" action="/api/interpretations/correct">
                      <input
                        type="hidden"
                        name="csrf"
                        value="${session.csrfToken}"
                      />
                      <input
                        type="hidden"
                        name="interpretation"
                        value="${id}"
                      />
                      <input
                        type="hidden"
                        name="revision"
                        value="${revision}"
                      />
                      <input type="hidden" name="mode" value="withdraw" />
                      <input
                        type="hidden"
                        name="requirement"
                        value="${requirement.id}"
                      />
                      <p>
                        Si este elemento no es un requisito de la unidad,
                        retíralo. No se borra: queda registrado como retirado.
                      </p>
                      <button
                        class="secondary"
                        type="submit"
                        data-busy="Guardando…"
                      >
                        Retirar del inventario
                      </button>
                    </form>`
                : null
            }`
      }`,
  );
}

export interface UnitValues {
  readonly unitTitle: string;
  readonly durationHours: string;
  readonly durationSection: string;
  readonly durationPage: string;
  readonly durationQuote: string;
}

export function unitValuesOf(interpretation: Interpretation): UnitValues {
  return {
    unitTitle: interpretation.unitTitle,
    durationHours:
      interpretation.durationHours === null
        ? ""
        : String(interpretation.durationHours),
    durationSection: interpretation.durationSection,
    durationPage:
      interpretation.durationPage === null
        ? ""
        : String(interpretation.durationPage),
    durationQuote: interpretation.durationQuote ?? "",
  };
}

export function unitFormView(input: {
  readonly session: SessionContext;
  readonly interpretation: Interpretation;
  readonly values: UnitValues;
  readonly status?: number;
  readonly problem?: string;
  readonly conflict?: boolean;
}): PageReply {
  const { session, interpretation, values } = input;
  const { id, revision } = interpretation;
  const conflict = input.conflict === true;
  const current = unitValuesOf(interpretation);
  const form = html`<form method="post" action="/api/interpretations/correct">
    <input type="hidden" name="csrf" value="${session.csrfToken}" />
    <input type="hidden" name="interpretation" value="${id}" />
    <input type="hidden" name="revision" value="${revision}" />
    <input type="hidden" name="mode" value="unit" />
    <label for="unit_title">Denominación de la unidad</label>
    <input
      id="unit_title"
      name="unit_title"
      maxlength="300"
      value="${values.unitTitle}"
      required
    />
    <label for="duration_hours">Duración, en horas</label>
    <input
      id="duration_hours"
      name="duration_hours"
      type="number"
      min="1"
      value="${values.durationHours}"
    />
    <label for="duration_section">Sección donde consta la duración</label>
    <input
      id="duration_section"
      name="duration_section"
      maxlength="200"
      value="${values.durationSection}"
    />
    <label for="duration_page">Página donde consta</label>
    <input
      id="duration_page"
      name="duration_page"
      type="number"
      min="1"
      value="${values.durationPage}"
    />
    <label for="duration_quote">Cita literal (opcional)</label>
    <textarea id="duration_quote" name="duration_quote" maxlength="2000">
${values.durationQuote}</textarea>
    <div class="actions">
      <button type="submit" data-busy="Guardando…">
        ${
          conflict
            ? `Guardar mi cambio sobre la versión ${String(revision)}`
            : "Guardar la corrección"
        }
      </button>
      <a href="/interpretations/${id}"
        >${conflict ? "Descartar mi cambio y volver" : "Volver sin guardar"}</a
      >
    </div>
  </form>`;
  return reply(
    input.status ?? 200,
    "Corregir la unidad",
    session,
    html`<p class="crumbs">
        <a href="/interpretations/${id}"
          >${interpretation.unitCode} · ${interpretation.unitTitle}</a
        >
      </p>
      <h1>Corregir los datos de la unidad</h1>
      ${input.problem === undefined ? null : noticeBox("bad", input.problem)}
      ${
        conflict
          ? html`<p>
                Hay una versión más reciente de la interpretación: la
                ${revision}. Revísala y decide: puedes volver a guardar tu
                cambio sobre ella o descartarlo. Nada se ha fusionado ni se
                guardará sin que lo pidas.
              </p>
              <div class="cols">
                <section aria-labelledby="latest">
                  <h2 id="latest">Versión más reciente (${revision})</h2>
                  <dl>
                    <dt>Denominación</dt>
                    <dd>${current.unitTitle}</dd>
                    <dt>Duración</dt>
                    <dd>
                      ${
                        current.durationHours === ""
                          ? "No consta"
                          : `${current.durationHours} horas`
                      }
                    </dd>
                    <dt>Sección y página</dt>
                    <dd>
                      ${current.durationSection}
                      ${
                        current.durationPage === ""
                          ? ""
                          : `, página ${current.durationPage}`
                      }
                    </dd>
                    <dt>Cita</dt>
                    <dd>
                      ${
                        current.durationQuote === ""
                          ? "Sin cita"
                          : current.durationQuote
                      }
                    </dd>
                  </dl>
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
