// Exportación y descarga del paquete (specs/002-boe-scorm-export: US4, T060
// a T067; FR-030 a FR-041 y FR-062; data-model.md; research.md, R8).
//
// Exportar y descargar comprueban en cada petición que la versión sigue
// vigente y que cada requisito sigue citado y desarrollado: no hay ningún
// parámetro ni perfil que lo evite. Cada intento se registra, también los
// denegados y los fallidos. Un paquete solo se guarda después de releerlo y
// comprobarlo; un fallo no deja ningún fichero. Nada se borra: el paquete de
// una versión invalidada se conserva como evidencia y deja de poder
// descargarse.
import { createHash, randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { openSyllabus } from "@/modules/didactic-content";
import type {
  DevelopmentItem,
  OutlineEntry,
  Syllabus,
  SyllabusReview,
  SyllabusVersion,
} from "@/modules/didactic-content";
import type { Audit } from "@/platform/audit";
import { DETERMINISTIC_PROVIDER } from "@/platform/generation";
import { transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import { buildPackage, manifestIdentifier } from "./build";
import type { PackageAssets } from "./build";
import { checkPackage, SCHEMA_VALIDATION } from "./conformance";
import { instructionsText } from "./instructions/index";
import { packageTitle, SNAPSHOT } from "./package/index";
import type { PackageSource } from "./package/index";

export { buildManifest, buildPackage, escapeXml } from "./build";
export type { BuiltPackage, PackageAssets } from "./build";
export { checkPackage, SCHEMA_VALIDATION } from "./conformance";
export type { ConformanceExpectation, ConformanceResult } from "./conformance";
export { instructionsText, NOT_VERIFIED } from "./instructions/index";
export {
  MAX_TOPICS,
  packageDocument,
  packageTopics,
  SNAPSHOT,
  TRIAL_NOTICE,
} from "./package/index";
export type { PackageSource, Snapshot } from "./package/index";
export { parseXml } from "./xml";

export const EXPORT_FORMAT = "scorm-1.2";
const EXPORT_DIRECTORY = "exports";
const ID = /^[0-9a-f]{32}$/;

export type ExportFailure =
  // La versión no existe.
  | "not_found"
  // La aprobación de la versión, de su índice o de su interpretación ya no
  // está vigente.
  | "not_current"
  // Algún requisito ha dejado de estar citado y desarrollado.
  | "incomplete"
  | "too_many_topics"
  // La instantánea guardada no se puede leer.
  | "invalid_snapshot"
  // El paquete generado no superó la comprobación al releerlo.
  | "invalid_package"
  // No se pudo guardar el fichero.
  | "storage_error";

export interface ExportRecord {
  readonly id: string;
  readonly versionId: string;
  readonly status: "succeeded" | "failed";
  readonly sha256: string | null;
  readonly sizeBytes: number | null;
  // Motivo del fallo, o `null`.
  readonly failure: ExportFailure | null;
  readonly problems: readonly string[];
  // `true` si el contenido procede de respuestas grabadas.
  readonly trial: boolean;
  readonly exportedBy: string;
  readonly exportedAt: number;
}

export type DownloadItem = "package" | "instructions";
export type DownloadOutcome =
  "granted" | "not_current" | "incomplete" | "unavailable";

export interface DownloadRecord {
  readonly id: string;
  readonly exportId: string;
  readonly item: DownloadItem;
  readonly result: DownloadOutcome;
  readonly downloadedBy: string;
  readonly downloadedAt: number;
}

// Lo que impide exportar o descargar ahora, con lo pendiente.
export interface Deliverability {
  readonly deliverable: boolean;
  // Versión vigente, si la hay.
  readonly version: SyllabusVersion | undefined;
  readonly reason: "not_current" | "incomplete" | null;
  readonly undeveloped: readonly OutlineEntry[];
  readonly unapproved: readonly OutlineEntry[];
  readonly requirements: readonly DevelopmentItem[];
}

export interface ExportOverview {
  readonly syllabus: SyllabusReview;
  readonly deliverability: Deliverability;
  readonly exports: readonly ExportRecord[];
  readonly downloads: readonly DownloadRecord[];
}

interface Actor {
  readonly actorId: string;
  readonly correlationId: string;
}

export interface Preview {
  readonly deliverable: boolean;
  readonly source: PackageSource;
}

// Datos de presentación que no están en la instantánea.
export interface Presentation {
  readonly documentTitle: string;
  readonly kindNames: Readonly<Record<string, string>>;
}

export type ExportResult =
  | { readonly ok: true; readonly record: ExportRecord }
  | {
      readonly ok: false;
      readonly reason: ExportFailure;
      readonly outlineId: string | undefined;
      readonly record: ExportRecord | undefined;
    };

export type DownloadResult =
  | {
      readonly ok: true;
      readonly filename: string;
      readonly body: Buffer;
      readonly record: ExportRecord;
    }
  | {
      readonly ok: false;
      readonly reason: "not_found" | Exclude<DownloadOutcome, "granted">;
      readonly outlineId: string | undefined;
    };

export interface ContentExport {
  overview(outlineId: string): ExportOverview | undefined;
  // Lo que se exportaría ahora, para la vista previa: la versión vigente o,
  // si no la hay o falta algo, el borrador actual, que no es entregable y
  // del que nunca sale un fichero (FR-038).
  preview(outlineId: string, presentation: Presentation): Preview | undefined;
  export(
    input: Actor & { readonly versionId: string } & Presentation,
  ): ExportResult;
  download(
    input: Actor & {
      readonly exportId: string;
      readonly item: DownloadItem;
    },
  ): DownloadResult;
  outlineOfExport(exportId: string): string | undefined;
}

export interface ContentExportOptions {
  readonly db: Database;
  readonly audit: Audit;
  readonly syllabus: Syllabus;
  readonly dataDir: string;
  readonly assets: PackageAssets;
  // `true` si el proveedor de generación configurado es el determinista.
  readonly deterministicProvider: boolean;
  // Datos de usuarios que no pueden aparecer en un paquete (FR-033).
  readonly userData: () => readonly string[];
  readonly now: () => number;
  // Solo para pruebas: sustituye la escritura del fichero.
  readonly writeFile?: (path: string, data: Uint8Array) => void;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

function packageFilename(record: ExportRecord): string {
  return `aulanorma-${record.versionId.slice(0, 12)}-scorm12.zip`;
}

export function createContentExport({
  db,
  audit,
  syllabus,
  dataDir,
  assets,
  deterministicProvider,
  userData,
  now,
  writeFile = writeFileSync,
}: ContentExportOptions): ContentExport {
  const directory = `${dataDir}/${EXPORT_DIRECTORY}`;
  const pathOf = (exportId: string): string => `${directory}/${exportId}.zip`;

  const deliverabilityOf = (
    review: SyllabusReview,
    versionId?: string,
  ): Deliverability => {
    const version = review.versions.find(
      (item) =>
        item.current && (versionId === undefined || item.id === versionId),
    );
    const { blockers } = review;
    const incomplete =
      blockers.undeveloped.length > 0 ||
      blockers.unapproved.length > 0 ||
      blockers.development.length > 0 ||
      !review.development.complete;
    const reason =
      version === undefined || blockers.outlineNotApproved
        ? "not_current"
        : incomplete
          ? "incomplete"
          : null;
    return {
      deliverable: reason === null,
      version,
      reason,
      undeveloped: blockers.undeveloped,
      unapproved: blockers.unapproved,
      requirements: blockers.development,
    };
  };

  const recordOf = (row: Record<string, unknown>): ExportRecord => {
    let details: {
      failure?: ExportFailure;
      problems?: string[];
      trial?: boolean;
    } = {};
    try {
      details = JSON.parse(text(row.validation_result)) as typeof details;
    } catch {
      // Un registro ilegible se muestra sin detalle.
    }
    return {
      id: text(row.id),
      versionId: text(row.syllabus_version_id),
      status: row.status === "succeeded" ? "succeeded" : "failed",
      sha256: row.package_sha256 === null ? null : text(row.package_sha256),
      sizeBytes: row.size_bytes === null ? null : integer(row.size_bytes),
      failure: details.failure ?? null,
      problems: details.problems ?? [],
      trial: details.trial === true,
      exportedBy: text(row.exported_by),
      exportedAt: integer(row.exported_at),
    };
  };

  const getExport = (exportId: string): ExportRecord | undefined => {
    if (!ID.test(exportId)) {
      return undefined;
    }
    const row = db
      .prepare("SELECT * FROM package_export WHERE id = ?")
      .get(exportId);
    return row === undefined ? undefined : recordOf(row);
  };

  const sourceOf = (
    version: SyllabusVersion,
    providers: readonly string[],
    presentation: Presentation,
  ): PackageSource | undefined => {
    let raw: unknown;
    try {
      raw = JSON.parse(syllabus.snapshotOf(version.id) ?? "");
    } catch {
      return undefined;
    }
    const snapshot = SNAPSHOT.safeParse(raw);
    return snapshot.success
      ? {
          versionId: version.id,
          label: version.label,
          snapshot: snapshot.data,
          documentTitle: presentation.documentTitle,
          kindNames: presentation.kindNames,
          trial:
            deterministicProvider || providers.includes(DETERMINISTIC_PROVIDER),
        }
      : undefined;
  };

  const insertExport = (
    actor: Actor,
    versionId: string,
    outcome:
      | { readonly sha256: string; readonly sizeBytes: number }
      | { readonly failure: ExportFailure },
    details: { readonly problems: readonly string[]; readonly trial: boolean },
    id = newId(),
  ): ExportRecord => {
    const succeeded = "sha256" in outcome;
    db.prepare(
      "INSERT INTO package_export (id, syllabus_version_id, format, status, " +
        "package_sha256, size_bytes, validation_result, exported_by, " +
        "exported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      id,
      versionId,
      EXPORT_FORMAT,
      succeeded ? "succeeded" : "failed",
      succeeded ? outcome.sha256 : null,
      succeeded ? outcome.sizeBytes : null,
      JSON.stringify({
        ...(succeeded ? {} : { failure: outcome.failure }),
        problems: details.problems,
        trial: details.trial,
        schema: SCHEMA_VALIDATION.status,
      }),
      actor.actorId,
      now(),
    );
    audit.record({
      actorId: actor.actorId,
      action: "export.create",
      targetKind: "export",
      targetId: id,
      result: succeeded ? "ok" : "failed",
      correlationId: actor.correlationId,
      details: succeeded
        ? { version: versionId, sha256: outcome.sha256 }
        : { version: versionId, reason: outcome.failure },
    });
    const record = getExport(id);
    if (record === undefined) {
      throw new Error("La exportación registrada no se puede leer.");
    }
    return record;
  };

  return {
    overview(outlineId) {
      const review = syllabus.review(outlineId);
      if (review === undefined) {
        return undefined;
      }
      const versionIds = review.versions.map((item) => item.id);
      const exports = versionIds.flatMap((versionId) =>
        db
          .prepare(
            "SELECT * FROM package_export WHERE syllabus_version_id = ? " +
              "ORDER BY exported_at DESC, rowid DESC",
          )
          .all(versionId)
          .map(recordOf),
      );
      exports.sort((a, b) => b.exportedAt - a.exportedAt);
      const downloads = exports.flatMap((item) =>
        db
          .prepare(
            "SELECT * FROM package_download WHERE export_id = ? " +
              "ORDER BY downloaded_at DESC, rowid DESC",
          )
          .all(item.id)
          .map((row): DownloadRecord => ({
            id: text(row.id),
            exportId: text(row.export_id),
            item: row.item === "instructions" ? "instructions" : "package",
            result: text(row.result) as DownloadOutcome,
            downloadedBy: text(row.downloaded_by),
            downloadedAt: integer(row.downloaded_at),
          })),
      );
      downloads.sort((a, b) => b.downloadedAt - a.downloadedAt);
      return {
        syllabus: review,
        deliverability: deliverabilityOf(review),
        exports,
        downloads,
      };
    },

    preview(outlineId, presentation) {
      const review = syllabus.review(outlineId);
      if (review === undefined) {
        return undefined;
      }
      const deliverability = deliverabilityOf(review);
      if (deliverability.deliverable && deliverability.version !== undefined) {
        const source = sourceOf(
          deliverability.version,
          syllabus.locateVersion(deliverability.version.id)?.providers ?? [],
          presentation,
        );
        if (source !== undefined) {
          return { deliverable: true, source };
        }
      }
      const { interpretation } = review.outline;
      return {
        deliverable: false,
        source: {
          versionId: "borrador",
          label: "borrador",
          snapshot: {
            format: 1,
            unit: {
              code: interpretation.unitCode,
              title: interpretation.unitTitle,
            },
            topics: review.topics.map(({ entry, topic }) => ({
              title: entry.title,
              blocks: (topic?.blocks ?? [])
                .filter((block) => !block.removed)
                .map((block) => ({
                  kind: block.kind,
                  content: [...block.content],
                  requirements: block.requirementIds.flatMap((id) => {
                    const item = interpretation.requirements.find(
                      (candidate) =>
                        candidate.id === id && !candidate.withdrawn,
                    );
                    return item === undefined
                      ? []
                      : [
                          {
                            id: item.id,
                            kind: item.kind,
                            code: item.code,
                            text: item.text,
                            section: item.section,
                            pageFrom: item.pageFrom,
                            pageTo: item.pageTo,
                            quote: item.quote,
                          },
                        ];
                  }),
                })),
            })),
          },
          documentTitle: presentation.documentTitle,
          kindNames: presentation.kindNames,
          trial: true,
        },
      };
    },

    export({ versionId, documentTitle, kindNames, ...actor }) {
      const location = syllabus.locateVersion(versionId);
      const review =
        location === undefined
          ? undefined
          : syllabus.review(location.outlineId);
      if (location === undefined || review === undefined) {
        audit.record({
          actorId: actor.actorId,
          action: "export.create",
          targetKind: "export",
          targetId: null,
          result: "failed",
          correlationId: actor.correlationId,
          details: { reason: "not_found" },
        });
        return {
          ok: false,
          reason: "not_found",
          outlineId: undefined,
          record: undefined,
        };
      }
      const trial =
        deterministicProvider ||
        location.providers.includes(DETERMINISTIC_PROVIDER);
      const refuse = (
        reason: ExportFailure,
        problems: readonly string[] = [],
      ): ExportResult => ({
        ok: false,
        reason,
        outlineId: location.outlineId,
        record: transaction(db, () =>
          insertExport(
            actor,
            versionId,
            { failure: reason },
            { problems, trial },
          ),
        ),
      });

      // Vigencia y cobertura, comprobadas ahora (FR-031).
      const deliverability = deliverabilityOf(review, versionId);
      if (
        deliverability.reason !== null ||
        deliverability.version === undefined
      ) {
        return refuse(deliverability.reason ?? "not_current");
      }
      const source = sourceOf(deliverability.version, location.providers, {
        documentTitle,
        kindNames,
      });
      if (source === undefined) {
        return refuse("invalid_snapshot");
      }
      const built = buildPackage(source, assets);
      if (!built.ok) {
        return refuse(built.reason);
      }
      // Se valida releyendo el fichero generado, antes de guardarlo (FR-037).
      const conformance = checkPackage(built.built.zip, {
        delivery: true,
        manifestIdentifier: manifestIdentifier(versionId),
        versionId,
        forbidden: userData(),
      });
      if (!conformance.ok) {
        return refuse("invalid_package", conformance.problems);
      }

      const id = newId();
      const target = pathOf(id);
      const temporary = `${target}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        mkdirSync(directory, { recursive: true });
        writeFile(temporary, built.built.zip);
        renameSync(temporary, target);
        const stored = readFileSync(target);
        if (
          createHash("sha256").update(stored).digest("hex") !==
          built.built.sha256
        ) {
          throw new Error("stored package differs");
        }
        const record = transaction(db, () =>
          insertExport(
            actor,
            versionId,
            { sha256: built.built.sha256, sizeBytes: stored.length },
            { problems: [], trial },
            id,
          ),
        );
        return { ok: true, record };
      } catch {
        // Ni fichero parcial ni paquete descargable. La limpieza no puede
        // impedir que el fallo quede registrado.
        for (const leftover of [temporary, target]) {
          try {
            rmSync(leftover, { force: true });
          } catch {
            // No había nada que quitar.
          }
        }
        return refuse("storage_error");
      }
    },

    download({ exportId, item, ...actor }) {
      const record = getExport(exportId);
      const location =
        record === undefined
          ? undefined
          : syllabus.locateVersion(record.versionId);
      const review =
        location === undefined
          ? undefined
          : syllabus.review(location.outlineId);
      if (
        record === undefined ||
        location === undefined ||
        review === undefined
      ) {
        audit.record({
          actorId: actor.actorId,
          action: "export.download",
          targetKind: "export",
          targetId: null,
          result: "failed",
          correlationId: actor.correlationId,
          details: { reason: "not_found", item },
        });
        return { ok: false, reason: "not_found", outlineId: undefined };
      }
      // Vigencia comprobada en cada descarga, también con un enlace antiguo
      // (FR-062).
      const deliverability = deliverabilityOf(review, record.versionId);
      let outcome: DownloadOutcome =
        record.status !== "succeeded" || record.sha256 === null
          ? "unavailable"
          : (deliverability.reason ?? "granted");
      let body: Buffer | undefined;
      if (outcome === "granted") {
        try {
          const stored = existsSync(pathOf(record.id))
            ? readFileSync(pathOf(record.id))
            : undefined;
          // Solo se entrega el fichero cuya huella es la registrada.
          if (
            stored !== undefined &&
            createHash("sha256").update(stored).digest("hex") === record.sha256
          ) {
            body = stored;
          } else {
            outcome = "unavailable";
          }
        } catch {
          outcome = "unavailable";
        }
      }
      transaction(db, () => {
        db.prepare(
          "INSERT INTO package_download (id, export_id, item, result, " +
            "downloaded_by, downloaded_at) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(newId(), record.id, item, outcome, actor.actorId, now());
        audit.record({
          actorId: actor.actorId,
          action: "export.download",
          targetKind: "export",
          targetId: record.id,
          result: outcome === "granted" ? "ok" : "denied",
          correlationId: actor.correlationId,
          details: { item, result: outcome },
        });
      });
      if (outcome !== "granted" || body === undefined) {
        return {
          ok: false,
          reason: outcome === "granted" ? "unavailable" : outcome,
          outlineId: location.outlineId,
        };
      }
      const filename = packageFilename(record);
      if (item === "package") {
        return { ok: true, filename, body, record };
      }
      const snapshot = SNAPSHOT.safeParse(
        JSON.parse(syllabus.snapshotOf(record.versionId) ?? "null"),
      );
      const version = review.versions.find(
        (candidate) => candidate.id === record.versionId,
      );
      return {
        ok: true,
        filename: filename.replace(/\.zip$/, "-instrucciones.txt"),
        body: Buffer.from(
          instructionsText({
            title: snapshot.success
              ? packageTitle({
                  versionId: record.versionId,
                  label: version?.label ?? "",
                  snapshot: snapshot.data,
                  documentTitle: "",
                  kindNames: {},
                  trial: record.trial,
                })
              : "",
            label: version?.label ?? "",
            versionId: record.versionId,
            sha256: record.sha256 ?? "",
            filename,
            trial: record.trial,
          }),
          "utf8",
        ),
        record,
      };
    },

    outlineOfExport(exportId) {
      const record = getExport(exportId);
      return record === undefined
        ? undefined
        : syllabus.locateVersion(record.versionId)?.outlineId;
    },
  };
}

// Los mismos servicios que abre el temario.
type SyllabusServices = Parameters<typeof openSyllabus>[0];

const opened = new WeakMap<ExportServices, ContentExport>();

export interface ExportServices extends SyllabusServices {
  readonly identity: {
    listUsers(): readonly { readonly id: string }[];
  };
}

// La exportación de estos servicios: una por proceso. El estilo y el script
// del paquete son ficheros versionados del repositorio.
export function openContentExport(services: ExportServices): ContentExport {
  let service = opened.get(services);
  if (service === undefined) {
    const assetsDirectory = `${services.projectRoot}/src/modules/content-export/package/assets`;
    service = createContentExport({
      db: services.db,
      audit: services.audit,
      syllabus: openSyllabus(services),
      dataDir: services.config.dataDir,
      assets: {
        script: readFileSync(`${assetsDirectory}/app.js`, "utf8"),
        style: readFileSync(`${assetsDirectory}/style.css`, "utf8"),
      },
      deterministicProvider:
        services.generation.provider === DETERMINISTIC_PROVIDER,
      // Los identificadores son aleatorios y no pueden coincidir con el
      // contenido; un nombre de usuario corto sí podría, y no se usa aquí.
      userData: () => services.identity.listUsers().map((user) => user.id),
      now: () => Date.now(),
    });
    opened.set(services, service);
  }
  return service;
}
