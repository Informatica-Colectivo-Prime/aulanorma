// Fuente normativa (specs/002-boe-scorm-export: FR-001 a FR-004, FR-064 y
// FR-067; data-model.md, «Fuente normativa»). API pública de la capa.
//
// Registra el PDF oficial con su procedencia y su huella, guarda el original
// en el almacén de ficheros y el texto de cada página, y registra la
// resolución de las páginas sin texto. El documento y sus páginas son
// inmutables: no hay ninguna operación que los modifique ni los borre. Una
// fuente que sustituye a otra es un documento nuevo, vinculado al anterior.
//
// Tres cosas están separadas a propósito: la inspección estructural y la
// extracción (`pdf/analyze.ts`), y la revisión humana, que esta capa solo
// registra y nunca sustituye.
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Audit } from "@/platform/audit";
import { putBlob, readBlob, transaction } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";
import { analyzePdf } from "./pdf/analyze.ts";
import type { PdfLimits, PdfRejection } from "./pdf/analyze.ts";
import type { StructureCategory } from "./pdf/policy.ts";

export type { PdfLimits, PdfRejection } from "./pdf/analyze.ts";
export type { StructureCategory } from "./pdf/policy.ts";

export interface DocumentMetadata {
  readonly title: string;
  readonly issuer: string;
  readonly officialReference: string;
  // Procedencia de obtención: de dónde se descargó o quién lo facilitó.
  readonly source: string;
  // Fecha de obtención, `AAAA-MM-DD`.
  readonly obtainedOn: string;
  readonly version: string;
}

export interface DocumentRecord extends DocumentMetadata {
  readonly id: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly pageCount: number;
  readonly hasSignatureField: boolean;
  readonly replacesDocumentId: string | null;
  readonly registeredBy: string;
  readonly registeredAt: number;
}

export interface PageResolution {
  readonly resolvedBy: string;
  readonly resolvedAt: number;
  readonly statement: string;
}

export interface PageSummary {
  readonly number: number;
  readonly hasExtractableText: boolean;
  readonly hasImages: boolean;
  readonly resolution: PageResolution | null;
}

export interface DocumentPage extends PageSummary {
  readonly text: string;
}

export type RegistrationRejection =
  PdfRejection | "invalid_metadata" | "duplicate" | "unknown_replaced_document";

export type RegistrationResult =
  | { readonly ok: true; readonly document: DocumentRecord }
  | {
      readonly ok: false;
      readonly reason: RegistrationRejection;
      readonly categories: readonly StructureCategory[];
    };

export type ResolutionResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        "not_found" | "has_text" | "already_resolved" | "not_confirmed";
    };

export interface NormativeSource {
  readonly limits: PdfLimits;
  registerDocument(input: {
    // Ruta del fichero recibido. No se modifica ni se borra aquí.
    readonly file: string;
    readonly metadata: DocumentMetadata;
    readonly replacesDocumentId: string | null;
    readonly actorId: string;
    readonly correlationId: string;
  }): Promise<RegistrationResult>;
  listDocuments(): readonly DocumentRecord[];
  getDocument(id: string): DocumentRecord | undefined;
  // Documentos registrados como sustitutos de este.
  substitutesOf(id: string): readonly DocumentRecord[];
  listPages(documentId: string): readonly PageSummary[];
  getPage(documentId: string, pageNumber: number): DocumentPage | undefined;
  // Páginas sin texto extraíble que nadie ha resuelto todavía.
  unresolvedPages(documentId: string): readonly number[];
  resolvePage(input: {
    readonly documentId: string;
    readonly pageNumber: number;
    // Confirmación expresa del revisor.
    readonly confirmed: boolean;
    readonly actorId: string;
    readonly correlationId: string;
  }): ResolutionResult;
  // Bytes del PDF original, comprobados contra su huella.
  readOriginal(documentId: string): Buffer | undefined;
}

export interface NormativeSourceOptions {
  readonly db: Database;
  readonly audit: Audit;
  readonly dataDir: string;
  readonly projectRoot: string;
  readonly limits: PdfLimits;
  readonly now: () => number;
}

// Texto que confirma el revisor al resolver una página sin texto (FR-064).
export const PAGE_RESOLUTION_STATEMENT =
  "Confirmo que esta página está en blanco o es ajena a la unidad formativa " +
  "y que no contiene información necesaria para ella.";

const ID = /^[0-9a-f]{32}$/;

function line(max: number) {
  return z
    .string()
    .transform((value) => value.trim())
    .pipe(
      z
        .string()
        .min(1)
        .max(max)
        // Sin caracteres de control.
        .regex(/^[^\p{Cc}]*$/u),
    );
}

function isCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

const METADATA = z.object({
  title: line(300),
  issuer: line(200),
  officialReference: line(100),
  source: line(500),
  obtainedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(isCalendarDate),
  version: line(100),
});

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function documentOf(row: Record<string, unknown>): DocumentRecord {
  return {
    id: text(row.id),
    title: text(row.title),
    issuer: text(row.issuer),
    officialReference: text(row.official_reference),
    source: text(row.source),
    obtainedOn: text(row.obtained_on),
    version: text(row.version),
    sha256: text(row.sha256),
    sizeBytes: integer(row.size_bytes),
    pageCount: integer(row.page_count),
    hasSignatureField: integer(row.has_signature_field) === 1,
    replacesDocumentId:
      typeof row.replaces_document_id === "string"
        ? row.replaces_document_id
        : null,
    registeredBy: text(row.registered_by),
    registeredAt: integer(row.registered_at),
  };
}

function pageOf(row: Record<string, unknown>): DocumentPage {
  return {
    number: integer(row.page_number),
    text: text(row.text),
    hasExtractableText: integer(row.has_extractable_text) === 1,
    hasImages: integer(row.has_images) === 1,
    resolution:
      typeof row.resolved_by === "string"
        ? {
            resolvedBy: row.resolved_by,
            resolvedAt: integer(row.resolved_at),
            statement: text(row.statement),
          }
        : null,
  };
}

const PAGE_COLUMNS =
  "p.page_number, p.has_extractable_text, p.has_images, " +
  "r.resolved_by, r.resolved_at, r.statement";
const PAGE_JOIN =
  "FROM document_page p LEFT JOIN page_resolution r " +
  "ON r.document_id = p.document_id AND r.page_number = p.page_number";

export function createNormativeSource({
  db,
  audit,
  dataDir,
  projectRoot,
  limits,
  now,
}: NormativeSourceOptions): NormativeSource {
  const getDocument = (id: string): DocumentRecord | undefined => {
    if (!ID.test(id)) {
      return undefined;
    }
    const row = db.prepare("SELECT * FROM document WHERE id = ?").get(id);
    return row === undefined ? undefined : documentOf(row);
  };

  const getPage = (
    documentId: string,
    pageNumber: number,
  ): DocumentPage | undefined => {
    if (!ID.test(documentId) || !Number.isSafeInteger(pageNumber)) {
      return undefined;
    }
    const row = db
      .prepare(
        `SELECT p.text, ${PAGE_COLUMNS} ${PAGE_JOIN} ` +
          "WHERE p.document_id = ? AND p.page_number = ?",
      )
      .get(documentId, pageNumber);
    return row === undefined ? undefined : pageOf(row);
  };

  return {
    limits,

    async registerDocument({
      file,
      metadata,
      replacesDocumentId,
      actorId,
      correlationId,
    }) {
      const refuse = (
        reason: RegistrationRejection,
        categories: readonly StructureCategory[] = [],
      ): RegistrationResult => {
        audit.record({
          actorId,
          action: "document.register",
          targetKind: "document",
          targetId: null,
          result: "failed",
          correlationId,
          details: { reason, categories: categories.join(",") },
        });
        return { ok: false, reason, categories };
      };

      const parsed = METADATA.safeParse(metadata);
      if (!parsed.success) {
        return refuse("invalid_metadata");
      }
      if (
        replacesDocumentId !== null &&
        getDocument(replacesDocumentId) === undefined
      ) {
        return refuse("unknown_replaced_document");
      }
      const analysis = await analyzePdf(
        file,
        { projectRoot, workDir: `${dataDir}/tmp` },
        limits,
      );
      if (!analysis.ok) {
        return refuse(analysis.reason, analysis.categories);
      }
      const existing = db
        .prepare("SELECT id FROM document WHERE sha256 = ?")
        .get(analysis.sha256);
      if (existing !== undefined) {
        return refuse("duplicate");
      }

      // El original se publica en el almacén antes de confirmar la
      // transacción que lo referencia.
      const stored = putBlob(dataDir, await readFile(file));
      if (stored !== analysis.sha256) {
        return refuse("not_verifiable");
      }
      const id = randomBytes(16).toString("hex");
      const registeredAt = now();
      transaction(db, () => {
        db.prepare(
          "INSERT INTO document (id, title, issuer, official_reference, " +
            "source, obtained_on, version, sha256, size_bytes, page_count, " +
            "has_signature_field, replaces_document_id, registered_by, " +
            "registered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ).run(
          id,
          parsed.data.title,
          parsed.data.issuer,
          parsed.data.officialReference,
          parsed.data.source,
          parsed.data.obtainedOn,
          parsed.data.version,
          analysis.sha256,
          analysis.sizeBytes,
          analysis.pageCount,
          analysis.hasSignatureField ? 1 : 0,
          replacesDocumentId,
          actorId,
          registeredAt,
        );
        const insertPage = db.prepare(
          "INSERT INTO document_page (document_id, page_number, text, " +
            "has_extractable_text, has_images) VALUES (?, ?, ?, ?, ?)",
        );
        for (const page of analysis.pages) {
          insertPage.run(
            id,
            page.number,
            page.text,
            page.hasExtractableText ? 1 : 0,
            page.hasImages ? 1 : 0,
          );
        }
        audit.record({
          actorId,
          action: "document.register",
          targetKind: "document",
          targetId: id,
          result: "ok",
          correlationId,
          details: {
            sha256: analysis.sha256,
            pages: analysis.pageCount,
            substitute: replacesDocumentId !== null,
          },
        });
      });
      const document = getDocument(id);
      if (document === undefined) {
        throw new Error("El documento registrado no se encuentra.");
      }
      return { ok: true, document };
    },

    listDocuments() {
      return db
        .prepare("SELECT * FROM document ORDER BY registered_at DESC, id")
        .all()
        .map(documentOf);
    },

    getDocument,

    substitutesOf(id) {
      if (!ID.test(id)) {
        return [];
      }
      return db
        .prepare(
          "SELECT * FROM document WHERE replaces_document_id = ? " +
            "ORDER BY registered_at, id",
        )
        .all(id)
        .map(documentOf);
    },

    listPages(documentId) {
      if (!ID.test(documentId)) {
        return [];
      }
      return db
        .prepare(
          `SELECT ${PAGE_COLUMNS} ${PAGE_JOIN} ` +
            "WHERE p.document_id = ? ORDER BY p.page_number",
        )
        .all(documentId)
        .map((row) => {
          const page = pageOf(row);
          return {
            number: page.number,
            hasExtractableText: page.hasExtractableText,
            hasImages: page.hasImages,
            resolution: page.resolution,
          };
        });
    },

    getPage,

    unresolvedPages(documentId) {
      if (!ID.test(documentId)) {
        return [];
      }
      return db
        .prepare(
          `SELECT p.page_number ${PAGE_JOIN} WHERE p.document_id = ? ` +
            "AND p.has_extractable_text = 0 AND r.id IS NULL " +
            "ORDER BY p.page_number",
        )
        .all(documentId)
        .map((row) => integer(row.page_number));
    },

    resolvePage({ documentId, pageNumber, confirmed, actorId, correlationId }) {
      return transaction(db, (): ResolutionResult => {
        const page = getPage(documentId, pageNumber);
        const reason =
          page === undefined
            ? "not_found"
            : page.hasExtractableText
              ? "has_text"
              : page.resolution !== null
                ? "already_resolved"
                : !confirmed
                  ? "not_confirmed"
                  : undefined;
        if (reason !== undefined) {
          audit.record({
            actorId,
            action: "document.page.resolve",
            targetKind: "document",
            targetId: page === undefined ? null : documentId,
            result: "failed",
            correlationId,
            details: { reason, page: pageNumber },
          });
          return { ok: false, reason };
        }
        db.prepare(
          "INSERT INTO page_resolution (id, document_id, page_number, " +
            "resolved_by, resolved_at, statement) VALUES (?, ?, ?, ?, ?, ?)",
        ).run(
          randomBytes(16).toString("hex"),
          documentId,
          pageNumber,
          actorId,
          now(),
          PAGE_RESOLUTION_STATEMENT,
        );
        audit.record({
          actorId,
          action: "document.page.resolve",
          targetKind: "document",
          targetId: documentId,
          result: "ok",
          correlationId,
          details: { page: pageNumber },
        });
        return { ok: true };
      });
    },

    readOriginal(documentId) {
      const document = getDocument(documentId);
      return document === undefined
        ? undefined
        : readBlob(dataDir, document.sha256);
    },
  };
}

// --- Composición ---

// Servicios del proceso que necesita esta capa. Los aporta la entrega.
export interface SourceServices {
  readonly db: Database;
  readonly audit: Audit;
  readonly projectRoot: string;
  readonly config: {
    readonly dataDir: string;
    readonly pdfMaxMib: number;
    readonly pdfMaxPages: number;
  };
}

const opened = new WeakMap<SourceServices, NormativeSource>();

// La fuente normativa de estos servicios: una por proceso.
export function openNormativeSource(services: SourceServices): NormativeSource {
  let source = opened.get(services);
  if (source === undefined) {
    source = createNormativeSource({
      db: services.db,
      audit: services.audit,
      dataDir: services.config.dataDir,
      projectRoot: services.projectRoot,
      limits: {
        maxBytes: services.config.pdfMaxMib * 1024 * 1024,
        maxPages: services.config.pdfMaxPages,
      },
      now: () => Date.now(),
    });
    opened.set(services, source);
  }
  return source;
}
