// Vistas de la exportación (specs/002-boe-scorm-export: US4, T068; FR-030 a
// FR-041 y FR-062). La vista previa muestra el contenido con el mismo
// renderizador que el paquete, y dice que no acredita el seguimiento.
import {
  NOT_VERIFIED,
  packageTopics,
  SCHEMA_VALIDATION,
  TRIAL_NOTICE,
} from "@/modules/content-export";
import type {
  ExportFailure,
  ExportOverview,
  ExportRecord,
  Preview,
} from "@/modules/content-export";
import type { DocumentRecord } from "@/modules/normative-source";
import { html, noticeBox } from "@/platform/web";
import type { Html, Notice, PageReply, SessionContext } from "@/platform/web";
import { moment, reply, who } from "./shared";
import type { Names } from "./shared";
import { blockersBox } from "./syllabus";

const FAILURES: Readonly<Record<ExportFailure, string>> = {
  not_found: "La versión indicada no existe.",
  not_current:
    "La versión no tiene una aprobación vigente: su índice, su interpretación o alguno de sus temas han cambiado después de aprobarla.",
  incomplete:
    "Hay requisitos obligatorios sin cubrir en este momento. No se exporta nada hasta completarlos.",
  too_many_topics: "El temario supera el máximo de 200 temas por paquete.",
  invalid_snapshot: "La versión guardada no se puede leer.",
  invalid_package:
    "El paquete generado no superó la comprobación al releerlo. No se ha guardado ningún fichero.",
  storage_error:
    "No se pudo guardar el paquete. No ha quedado ningún fichero parcial.",
};

const DOWNLOAD_RESULTS: Readonly<Record<string, string>> = {
  granted: "Entregada",
  not_current: "Denegada: versión sin vigencia",
  incomplete: "Denegada: requisitos sin cubrir",
  unavailable: "Denegada: no hay fichero descargable",
};

export function exportProblem(reason: ExportFailure): string {
  return `No se ha exportado nada. ${FAILURES[reason]}`;
}

export const DOWNLOAD_PROBLEMS = {
  not_current:
    "No se puede descargar: la versión de este paquete ya no tiene una aprobación vigente. El paquete y sus registros se conservan como evidencia.",
  incomplete:
    "No se puede descargar: hay requisitos obligatorios sin cubrir en este momento.",
  unavailable:
    "No se puede descargar: ese intento de exportación no dejó ningún paquete.",
} as const;

function size(bytes: number | null): string {
  return bytes === null ? "—" : `${String(Math.ceil(bytes / 1024))} KB`;
}

function exportRow(
  overview: ExportOverview,
  names: Names,
  record: ExportRecord,
): Html {
  const version = overview.syllabus.versions.find(
    (item) => item.id === record.versionId,
  );
  const downloadable =
    record.status === "succeeded" &&
    overview.deliverability.deliverable &&
    overview.deliverability.version?.id === record.versionId;
  return html`<tr>
    <td>${moment(record.exportedAt)}</td>
    <td>${who(names, record.exportedBy)}</td>
    <td>${version?.label ?? "—"}</td>
    <td>
      ${
        record.status === "succeeded"
          ? html`<span class="tag good">Generado y comprobado</span>`
          : html`<span class="tag bad">Fallido</span>
              <p class="hint">
                ${record.failure === null ? "" : FAILURES[record.failure]}
              </p>`
      }
      ${record.trial ? html`<p class="hint">Paquete de ensayo.</p>` : null}
    </td>
    <td>
      ${
        record.sha256 === null
          ? "—"
          : html`<code>${record.sha256}</code>
              <p class="hint">${size(record.sizeBytes)}</p>`
      }
    </td>
    <td>
      ${
        downloadable
          ? html`<a href="/export/packages/${record.id}">Descargar paquete</a>
              <br />
              <a href="/export/packages/${record.id}/instructions"
                >Descargar instrucciones</a
              >`
          : record.status === "succeeded"
            ? html`<span class="muted"
                >No descargable: su versión no está vigente. Se conserva como
                evidencia.</span
              >`
            : html`<span class="muted">Sin fichero</span>`
      }
    </td>
  </tr>`;
}

export function exportView(input: {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly overview: ExportOverview;
  readonly document: DocumentRecord;
  readonly names: Names;
  readonly status?: number;
  readonly problem?: string;
}): PageReply {
  const { session, overview, document, names } = input;
  const { syllabus, deliverability } = overview;
  const { interpretation } = syllabus.outline;
  const outlineId = syllabus.outline.outline.id;
  const { version } = deliverability;
  return reply(
    input.status ?? 200,
    `Exportación de ${interpretation.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/documents">Documentos</a> ›
        <a href="/documents/${document.id}">${document.title}</a> ›
        <a href="/interpretations/${interpretation.id}"
          >${interpretation.unitCode}</a
        >
        › <a href="/outlines/${outlineId}">Índice</a> ›
        <a href="/syllabus/${outlineId}">Temario</a>
      </p>
      <h1>
        Exportación de ${interpretation.unitCode} · ${interpretation.unitTitle}
      </h1>
      ${
        input.problem !== undefined
          ? noticeBox("bad", input.problem)
          : input.notice?.code === "export_created"
            ? noticeBox(
                "good",
                "Paquete generado y comprobado al releerlo. Descárgalo junto con sus instrucciones y comprueba su huella.",
              )
            : null
      }

      <h2>Qué se puede exportar ahora</h2>
      ${
        deliverability.deliverable && version !== undefined
          ? html`<p>
                <span class="tag good">Entregable</span> Versión
                <strong>${version.label}</strong>, aprobada por
                ${who(names, version.approvedBy)} el
                ${moment(version.approvedAt)}.
              </p>
              <p class="hint">
                Identificador de la versión: <code>${version.id}</code>
              </p>`
          : html`<p>
                <span class="tag bad">Borrador no entregable</span>
                ${
                  deliverability.reason === "incomplete"
                    ? "Hay requisitos obligatorios sin cubrir en este momento."
                    : "No hay ninguna versión del temario con una aprobación vigente."
                }
                No se puede exportar ni descargar nada, y no existe ninguna
                forma de hacerlo así.
              </p>
              ${blockersBox(
                document,
                syllabus.blockers,
                "status",
                "Pendiente para poder exportar:",
              )}
              <p>
                <a href="/syllabus/${outlineId}"
                  >Completa y aprueba el temario</a
                >.
              </p>`
      }
      <p>
        <a href="/export/${outlineId}/preview"
          >Ver la vista previa del contenido</a
        >
      </p>
      ${
        deliverability.deliverable && version !== undefined
          ? html`<form method="post" action="/api/export/create">
              <input type="hidden" name="csrf" value="${session.csrfToken}" />
              <input type="hidden" name="version" value="${version.id}" />
              <button type="submit" data-busy="Generando…">
                Exportar paquete SCORM 1.2
              </button>
            </form>`
          : null
      }

      <h2>Qué acredita un paquete generado</h2>
      <ul>
        <li>
          <strong>Estructura:</strong> se relee el fichero y se comprueba que su
          manifiesto declara todos sus ficheros, que no sobra ninguno, que es un
          único contenido SCORM 1.2 y que no carga nada de fuera.
        </li>
        <li>
          <strong>Esquemas oficiales de SCORM 1.2:</strong> validación no
          ejecutada. ${SCHEMA_VALIDATION.reason}
        </li>
        <li><strong>Moodle:</strong> ${NOT_VERIFIED}</li>
      </ul>

      <h2>Exportaciones</h2>
      ${
        overview.exports.length === 0
          ? html`<p class="muted">Todavía no se ha exportado nada.</p>`
          : html`<table>
              <caption>
                Cada intento, también los fallidos. Nada se borra.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Versión</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Huella SHA-256 y tamaño</th>
                  <th scope="col">Descarga</th>
                </tr>
              </thead>
              <tbody>
                ${overview.exports.map((record) =>
                  exportRow(overview, names, record),
                )}
              </tbody>
            </table>`
      }

      <h2>Descargas</h2>
      ${
        overview.downloads.length === 0
          ? html`<p class="muted">Todavía no hay ninguna descarga.</p>`
          : html`<table>
              <caption>
                Cada intento de descarga, también los denegados.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Qué</th>
                  <th scope="col">Huella del paquete</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                ${overview.downloads.map(
                  (download) =>
                    html`<tr>
                      <td>${moment(download.downloadedAt)}</td>
                      <td>${who(names, download.downloadedBy)}</td>
                      <td>
                        ${
                          download.item === "package"
                            ? "Paquete"
                            : "Instrucciones"
                        }
                      </td>
                      <td>
                        <code
                          >${
                            overview.exports.find(
                              (record) => record.id === download.exportId,
                            )?.sha256 ?? "—"
                          }</code
                        >
                      </td>
                      <td>
                        ${DOWNLOAD_RESULTS[download.result] ?? download.result}
                      </td>
                    </tr>`,
                )}
              </tbody>
            </table>`
      }`,
  );
}

export function exportPreviewView(input: {
  readonly session: SessionContext;
  readonly outlineId: string;
  readonly unitCode: string;
  readonly preview: Preview;
}): PageReply {
  const { session, preview } = input;
  return reply(
    200,
    `Vista previa de ${input.unitCode}`,
    session,
    html`<p class="crumbs">
        <a href="/export/${input.outlineId}">Exportación</a>
      </p>
      <h1>Vista previa de ${input.unitCode}</h1>
      ${
        preview.deliverable
          ? noticeBox(
              "neutral",
              `Contenido de la versión ${preview.source.label}, tal como irá en el paquete.`,
            )
          : noticeBox(
              "bad",
              "Borrador no entregable. No tiene una aprobación vigente o le faltan requisitos por cubrir: de esta vista no sale ningún fichero.",
            )
      }
      ${noticeBox(
        "neutral",
        "Esta vista muestra el contenido. No ejecuta el seguimiento del paquete: no guarda ningún recorrido ni acredita que una plataforma lo guarde.",
      )}
      ${
        preview.source.trial && preview.deliverable
          ? noticeBox("neutral", TRIAL_NOTICE)
          : null
      }
      ${packageTopics(preview.source)}`,
  );
}
