// Historial consultable de cada elemento (specs/002-boe-scorm-export: T087;
// FR-028 y FR-039; SC-010 y SC-044). Solo lectura, para las cuentas con el
// perfil de docente o de administración.
//
// Cada página reúne en una sola tabla, por orden de fecha, lo que ya está
// registrado de un elemento: correcciones, validaciones, aprobaciones,
// rechazos con su motivo, generaciones, exportaciones y descargas. No añade
// ningún registro ni permite cambiar nada.
import type { DownloadRecord, ExportRecord } from "@/modules/content-export";
import type {
  Outline,
  OutlineHistory,
  SyllabusVersion,
  TopicHistory,
} from "@/modules/didactic-content";
import type { DocumentRecord, PageSummary } from "@/modules/normative-source";
import type {
  History,
  Interpretation,
} from "@/modules/structured-interpretation";
import { html } from "@/platform/web";
import type { Html, PageReply, Runtime, SessionContext } from "@/platform/web";
import { DOWNLOAD_RESULTS, EXPORT_FAILURES } from "./export";
import { moment, reply, who } from "./shared";
import type { Names } from "./shared";

// Una ejecución de generación con sus llamadas, tal como se muestra.
export interface HistoryRun {
  readonly id: string;
  readonly requestedBy: string;
  readonly requestedAt: number;
  readonly status: "running" | "succeeded" | "failed" | "incomplete";
  readonly calls: readonly {
    readonly at: number;
    readonly task: string;
    readonly provider: string;
    readonly model: string;
    readonly promptVersion: string;
    readonly validationResult: string;
  }[];
}

// Acceso de todas las páginas del historial: docente o administración.
export const HISTORY_ACCESS = {
  role: ["teacher", "admin"],
  allowPendingPasswordChange: false,
} as const;

export function historyNames(runtime: Runtime): Names {
  return new Map(
    runtime.identity.listUsers().map((user) => [user.id, user.username]),
  );
}

// Ejecuciones de generación pedidas para un elemento, con sus llamadas.
export function historyRuns(
  runtime: Runtime,
  kind: "interpretation" | "outline" | "syllabus",
  targetId: string,
): HistoryRun[] {
  const { generation } = runtime;
  return generation.listRuns(kind, targetId).map((run) => ({
    id: run.id,
    requestedBy: run.requestedBy,
    requestedAt: run.requestedAt,
    status: run.status,
    calls: generation.listCalls(run.id),
  }));
}

interface Event {
  readonly at: number;
  // Identificador de la cuenta, o `null` si el hecho no es de una cuenta.
  readonly actor: string | null;
  readonly what: string;
  readonly detail: Html | string;
}

const RUN_STATUSES: Readonly<Record<HistoryRun["status"], string>> = {
  running: "sin terminar",
  succeeded: "completada",
  failed: "fallida",
  incomplete: "incompleta",
};

const CALL_RESULTS: Readonly<Record<string, string>> = {
  valid: "respuesta aceptada",
  invalid_output: "respuesta con formato no válido, descartada",
  provider_error: "error del proveedor",
  rejected_by_domain: "respuesta rechazada por las reglas del contenido",
};

const RUN_NAMES = {
  interpretation: "Generación de la interpretación",
  outline: "Generación del índice",
  syllabus: "Generación del temario",
} as const;

function vigency(current: boolean): Html {
  return current
    ? html`<span class="tag good">Vigente</span>`
    : html`<span class="tag">Sin vigencia</span>`;
}

function providerName(provider: string): string {
  return provider === "deterministic"
    ? "respuestas grabadas (ensayo, sin proveedor real)"
    : provider;
}

function runEvents(
  kind: keyof typeof RUN_NAMES,
  runs: readonly HistoryRun[],
): Event[] {
  return runs.flatMap((run) => [
    {
      at: run.requestedAt,
      actor: run.requestedBy,
      what: `${RUN_NAMES[kind]}, pedida`,
      detail: `Estado: ${RUN_STATUSES[run.status]}. Llamadas registradas: ${String(run.calls.length)}.`,
    },
    ...run.calls.map((call) => ({
      at: call.at,
      actor: null,
      what: `Llamada de generación (${call.task})`,
      detail: `Proveedor: ${providerName(call.provider)}. Modelo: ${call.model}. Versión de las instrucciones: ${call.promptVersion}. Resultado: ${CALL_RESULTS[call.validationResult] ?? call.validationResult}.`,
    })),
  ]);
}

// Tabla con los hechos por orden de fecha. Los de la misma fecha conservan el
// orden en que se han reunido.
function timeline(
  caption: string,
  events: readonly Event[],
  names: Names,
): Html {
  if (events.length === 0) {
    return html`<p class="muted">No hay nada registrado todavía.</p>`;
  }
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => a.event.at - b.event.at || a.index - b.index);
  return html`<table>
    <caption>
      ${caption}
    </caption>
    <thead>
      <tr>
        <th scope="col">Fecha y hora</th>
        <th scope="col">Cuenta</th>
        <th scope="col">Hecho</th>
        <th scope="col">Detalle</th>
      </tr>
    </thead>
    <tbody>
      ${ordered.map(
        ({ event }) =>
          html`<tr>
            <td>${moment(event.at)}</td>
            <td>${event.actor === null ? "—" : who(names, event.actor)}</td>
            <td>${event.what}</td>
            <td>${event.detail}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

const SCOPE_NOTE = html`<p class="hint">
  Esta página es de solo lectura. Muestra correcciones, validaciones,
  aprobaciones, rechazos, generaciones, exportaciones y descargas. Los inicios
  de sesión y los intentos denegados quedan en el registro de auditoría, que no
  se consulta desde aquí.
</p>`;

function page(
  session: SessionContext,
  title: string,
  content: Html,
): PageReply {
  return reply(
    200,
    title,
    session,
    html`<h1>${title}</h1>
      <p><a href="/history">Volver al historial</a></p>
      ${content} ${SCOPE_NOTE}`,
  );
}

// --- Índice del historial ---

export interface HistoryIndexItem {
  readonly document: DocumentRecord;
  readonly interpretations: readonly {
    readonly interpretation: Interpretation;
    readonly outline: Outline | undefined;
    readonly topics: readonly { readonly id: string; readonly title: string }[];
  }[];
}

export function historyIndexView(input: {
  readonly session: SessionContext;
  readonly items: readonly HistoryIndexItem[];
}): PageReply {
  const { items } = input;
  return reply(
    200,
    "Historial",
    input.session,
    html`<h1>Historial</h1>
      <p>
        Elige un elemento para ver lo que hay registrado de él: quién hizo cada
        cosa, cuándo y con qué resultado.
      </p>
      ${
        items.length === 0
          ? html`<p class="muted">
              Todavía no hay ningún documento registrado.
            </p>`
          : html`<ul>
              ${items.map(
                ({ document, interpretations }) =>
                  html`<li>
                    <a href="/history/documents/${document.id}"
                      >Documento: ${document.title}</a
                    >
                    (${document.version})
                    ${
                      interpretations.length === 0
                        ? null
                        : html`<ul>
                            ${interpretations.map(
                              ({ interpretation, outline, topics }) =>
                                html`<li>
                                  <a
                                    href="/history/interpretations/${interpretation.id}"
                                    >Interpretación de
                                    ${interpretation.unitCode}</a
                                  >
                                  ${
                                    outline === undefined
                                      ? null
                                      : html`<ul>
                                          <li>
                                            <a
                                              href="/history/outlines/${outline.id}"
                                              >Índice, temario y
                                              exportaciones</a
                                            >
                                            ${
                                              topics.length === 0
                                                ? null
                                                : html`<ul>
                                                    ${topics.map(
                                                      (topic) =>
                                                        html`<li>
                                                          <a
                                                            href="/history/topics/${topic.id}"
                                                            >Tema:
                                                            ${topic.title}</a
                                                          >
                                                        </li>`,
                                                    )}
                                                  </ul>`
                                            }
                                          </li>
                                        </ul>`
                                  }
                                </li>`,
                            )}
                          </ul>`
                    }
                  </li>`,
              )}
            </ul>`
      }
      ${SCOPE_NOTE}`,
  );
}

// --- Documento ---

export function documentHistoryView(input: {
  readonly session: SessionContext;
  readonly document: DocumentRecord;
  readonly replaced: DocumentRecord | undefined;
  readonly substitutes: readonly DocumentRecord[];
  readonly pages: readonly PageSummary[];
  readonly runs: readonly HistoryRun[];
  readonly names: Names;
}): PageReply {
  const { document, replaced, names } = input;
  const events: Event[] = [
    {
      at: document.registeredAt,
      actor: document.registeredBy,
      what: "Registro del documento",
      detail: html`${document.title}, ${document.version}. Huella SHA-256:
        <code>${document.sha256}</code>.${
          replaced === undefined
            ? ""
            : html` Sustituye a
                <a href="/history/documents/${replaced.id}"
                  >${replaced.title} (${replaced.version})</a
                >.`
        }`,
    },
    ...input.substitutes.map((substitute) => ({
      at: substitute.registeredAt,
      actor: substitute.registeredBy,
      what: "Registro de un documento que sustituye a este",
      detail: html`<a href="/history/documents/${substitute.id}"
        >${substitute.title} (${substitute.version})</a
      >`,
    })),
    ...input.pages.flatMap((item) =>
      item.resolution === null
        ? []
        : [
            {
              at: item.resolution.resolvedAt,
              actor: item.resolution.resolvedBy,
              what: `Página ${String(item.number)} sin texto, revisada`,
              detail: `«${item.resolution.statement}»`,
            },
          ],
    ),
    ...runEvents("interpretation", input.runs),
  ];
  return page(
    input.session,
    `Historial del documento ${document.title}`,
    timeline("Hechos registrados del documento", events, names),
  );
}

// --- Interpretación ---

const CORRECTIONS: Readonly<Record<string, string>> = {
  add: "Corrección: requisito añadido",
  withdraw: "Corrección: requisito retirado",
  unit: "Corrección: datos de la unidad",
  edit: "Corrección: requisito modificado",
};

export function interpretationHistoryView(input: {
  readonly session: SessionContext;
  readonly interpretation: Interpretation;
  readonly history: History;
  readonly runs: readonly HistoryRun[];
  readonly names: Names;
}): PageReply {
  const { interpretation, history, names } = input;
  const events: Event[] = [
    {
      at: interpretation.createdAt,
      actor: interpretation.createdBy,
      what: "Interpretación creada",
      detail: `Unidad ${interpretation.unitCode}.`,
    },
    ...history.corrections.map((item) => ({
      at: item.at,
      actor: item.author,
      what: CORRECTIONS[item.kind] ?? "Corrección",
      detail: `Da lugar a la versión ${String(item.resultingRevision)}.`,
    })),
    ...history.validations.map((item) => ({
      at: item.validatedAt,
      actor: item.validatedBy,
      what: `Validación de la versión ${String(item.revision)}`,
      detail: html`${vigency(item.current)} «${item.inventoryReviewedStatement}»`,
    })),
    ...history.rejections.map((item) => ({
      at: item.rejectedAt,
      actor: item.rejectedBy,
      what: `Rechazo de la versión ${String(item.revision)}`,
      detail: `Motivo: ${item.reason}`,
    })),
    ...runEvents("outline", input.runs),
  ];
  return page(
    input.session,
    `Historial de la interpretación de ${interpretation.unitCode}`,
    html`<p>
        <a href="/history/documents/${interpretation.documentId}"
          >Historial de su documento</a
        >
      </p>
      ${timeline("Hechos registrados de la interpretación", events, names)}`,
  );
}

// --- Índice, temario y exportaciones ---

const OUTLINE_CHANGES: Readonly<Record<string, string>> = {
  add: "Cambio del índice: entrada añadida",
  remove: "Cambio del índice: entrada quitada",
  move: "Cambio del índice: entrada reordenada",
  edit: "Cambio del índice: título o requisitos de una entrada",
};

export function outlineHistoryView(input: {
  readonly session: SessionContext;
  readonly outline: Outline;
  readonly unitCode: string;
  readonly history: OutlineHistory;
  readonly versions: readonly SyllabusVersion[];
  readonly exports: readonly ExportRecord[];
  readonly downloads: readonly DownloadRecord[];
  readonly runs: readonly HistoryRun[];
  readonly topics: readonly { readonly id: string; readonly title: string }[];
  readonly names: Names;
}): PageReply {
  const { outline, history, names } = input;
  const labels = new Map(
    input.versions.map((version) => [version.id, version.label]),
  );
  const exported = new Map(input.exports.map((item) => [item.id, item]));
  const versionOf = (id: string): string => labels.get(id) ?? "desconocida";
  const events: Event[] = [
    {
      at: outline.createdAt,
      actor: outline.createdBy,
      what: "Índice creado",
      detail: `Unidad ${input.unitCode}.`,
    },
    ...history.changes.map((item) => ({
      at: item.at,
      actor: item.author,
      what: OUTLINE_CHANGES[item.kind] ?? "Cambio del índice",
      detail: `Da lugar a la versión ${String(item.resultingRevision)} del índice.`,
    })),
    ...history.approvals.map((item) => ({
      at: item.approvedAt,
      actor: item.approvedBy,
      what: `Aprobación de la versión ${String(item.revision)} del índice`,
      detail: vigency(item.current),
    })),
    ...history.rejections.map((item) => ({
      at: item.rejectedAt,
      actor: item.rejectedBy,
      what: `Rechazo de la versión ${String(item.revision)} del índice`,
      detail: `Motivo: ${item.reason}`,
    })),
    ...runEvents("syllabus", input.runs),
    ...input.versions.map((item) => ({
      at: item.approvedAt,
      actor: item.approvedBy,
      what: `Aprobación de la versión ${item.label} del temario`,
      detail: html`${vigency(item.current)} Huella del contenido:
        <code>${item.contentSha256}</code>.`,
    })),
    ...input.exports.map((item) => ({
      at: item.exportedAt,
      actor: item.exportedBy,
      what:
        item.status === "succeeded"
          ? "Exportación del paquete"
          : "Exportación fallida",
      detail:
        item.sha256 === null
          ? `Versión ${versionOf(item.versionId)} del temario. ${item.failure === null ? "" : EXPORT_FAILURES[item.failure]}`
          : html`Versión ${versionOf(item.versionId)} del temario. Huella
              SHA-256: <code>${item.sha256}</code>.${
                item.trial ? " Paquete de ensayo." : ""
              }`,
    })),
    ...input.downloads.map((item) => {
      const source = exported.get(item.exportId);
      return {
        at: item.downloadedAt,
        actor: item.downloadedBy,
        what:
          item.item === "package"
            ? "Descarga del paquete"
            : "Consulta de las instrucciones",
        detail: html`${DOWNLOAD_RESULTS[item.result] ?? item.result}.
        ${
          source === undefined
            ? ""
            : html`Versión ${versionOf(source.versionId)} del
              temario.${
                source.sha256 === null
                  ? ""
                  : html` Huella del paquete: <code>${source.sha256}</code>.`
              }`
        }`,
      };
    }),
  ];
  return page(
    input.session,
    `Historial del índice y del temario de ${input.unitCode}`,
    html`<p>
        <a href="/history/interpretations/${outline.interpretationId}"
          >Historial de su interpretación</a
        >
      </p>
      ${timeline(
        "Hechos registrados del índice, del temario y de sus exportaciones",
        events,
        names,
      )}
      ${
        input.topics.length === 0
          ? null
          : html`<h2>Temas</h2>
              <ul>
                ${input.topics.map(
                  (topic) =>
                    html`<li>
                      <a href="/history/topics/${topic.id}"
                        >Historial del tema: ${topic.title}</a
                      >
                    </li>`,
                )}
              </ul>`
      }`,
  );
}

// --- Tema ---

const TOPIC_CHANGES: Readonly<Record<string, string>> = {
  generate: "Generación del contenido del tema",
  add: "Cambio del tema: bloque añadido",
  remove: "Cambio del tema: bloque quitado",
  move: "Cambio del tema: bloque reordenado",
  edit: "Cambio del tema: bloque modificado",
};

export function topicHistoryView(input: {
  readonly session: SessionContext;
  readonly title: string;
  readonly outlineId: string;
  readonly history: TopicHistory;
  readonly names: Names;
}): PageReply {
  const { history, names } = input;
  const events: Event[] = [
    ...history.changes.map((item) => ({
      at: item.at,
      actor: item.author,
      what: TOPIC_CHANGES[item.kind] ?? "Cambio del tema",
      detail: `Da lugar a la versión ${String(item.resultingRevision)} del tema.`,
    })),
    ...history.approvals.map((item) => ({
      at: item.approvedAt,
      actor: item.approvedBy,
      what: `Aprobación de la versión ${String(item.revision)} del tema`,
      detail: vigency(item.current),
    })),
    ...history.rejections.map((item) => ({
      at: item.rejectedAt,
      actor: item.rejectedBy,
      what: `Rechazo de la versión ${String(item.revision)} del tema`,
      detail: `Motivo: ${item.reason}`,
    })),
  ];
  return page(
    input.session,
    `Historial del tema ${input.title}`,
    html`<p>
        <a href="/history/outlines/${input.outlineId}"
          >Historial de su índice y de su temario</a
        >
      </p>
      ${timeline("Hechos registrados del tema", events, names)}`,
  );
}
