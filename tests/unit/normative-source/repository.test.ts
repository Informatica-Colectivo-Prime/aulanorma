// Fuente normativa (specs/002-boe-scorm-export: T031 y T033; FR-001, FR-003,
// FR-064 y FR-067; SC-034). Registra documentos sintéticos reales, con el
// tratamiento completo del PDF.
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createNormativeSource,
  PAGE_RESOLUTION_STATEMENT,
} from "@/modules/normative-source";
import type {
  DocumentMetadata,
  NormativeSource,
} from "@/modules/normative-source";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import {
  hasBlob,
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

vi.setConfig({ testTimeout: 120_000 });

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const fixture = (name: string): string =>
  path.join(repoRoot, "tests/fixtures/pdf/synthetic", name);
const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

const METADATA: DocumentMetadata = {
  title: "  Documento sintético de prueba  ",
  issuer: "Organismo sintético",
  officialReference: "REF-0001",
  source: "tests/fixtures/pdf/synthetic",
  obtainedOn: "2026-10-07",
  version: "Texto original",
};
const NOW = Date.UTC(2026, 9, 7, 12);

let dataDir = "";
let db: Database;
let audit: Audit;
let source: NormativeSource;

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "aulanorma-source-"));
  db = openDatabase(dataDir);
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  source = createNormativeSource({
    db,
    audit,
    dataDir,
    projectRoot: repoRoot,
    limits: { maxBytes: 32 * 1024 * 1024, maxPages: 600 },
    now: () => NOW,
  });
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function register(
  name: string,
  overrides: Partial<DocumentMetadata> = {},
  replacesDocumentId: string | null = null,
) {
  return source.registerDocument({
    file: fixture(name),
    metadata: { ...METADATA, ...overrides },
    replacesDocumentId,
    actorId: "docente-1",
    correlationId: "correlación",
  });
}

async function registered(name: string, replaces: string | null = null) {
  const result = await register(name, {}, replaces);
  if (!result.ok) {
    expect.fail(`no se registró: ${result.reason}`);
  }
  return result.document;
}

const count = (table: string): number =>
  Number(db.prepare(`SELECT count(*) AS total FROM ${table}`).get()?.total);

describe("registro de un documento", () => {
  test("guarda su procedencia, su huella y una fila por página, y conserva el original", async () => {
    const file = fixture("blank-page.pdf");
    const document = await registered("blank-page.pdf");
    expect(document).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{32}$/) as string,
      title: "Documento sintético de prueba",
      issuer: "Organismo sintético",
      officialReference: "REF-0001",
      source: "tests/fixtures/pdf/synthetic",
      obtainedOn: "2026-10-07",
      version: "Texto original",
      sha256: sha256(file),
      sizeBytes: readFileSync(file).length,
      pageCount: 2,
      hasSignatureField: false,
      replacesDocumentId: null,
      registeredBy: "docente-1",
      registeredAt: NOW,
    });
    expect(source.getDocument(document.id)).toEqual(document);
    expect(source.listDocuments()).toEqual([document]);
    // También la página sin texto tiene su fila.
    expect(source.listPages(document.id)).toEqual([
      {
        number: 1,
        hasExtractableText: true,
        hasImages: false,
        resolution: null,
      },
      {
        number: 2,
        hasExtractableText: false,
        hasImages: false,
        resolution: null,
      },
    ]);
    expect(source.getPage(document.id, 1)?.text).toBe(
      "Synthetic fixture, page 1.\nThis text is extractable.",
    );
    expect(source.getPage(document.id, 2)?.text).toBe("");
    expect(source.getPage(document.id, 3)).toBeUndefined();
    // El original está en el almacén, por su huella, y es idéntico.
    expect(hasBlob(dataDir, document.sha256)).toBe(true);
    expect(source.readOriginal(document.id)).toEqual(readFileSync(file));
    expect(sha256(file)).toBe(document.sha256);
  });

  test("lo audita, sin contenido del documento", async () => {
    const document = await registered("text-two-pages.pdf");
    expect(audit.list()).toMatchObject([
      {
        actorId: "docente-1",
        action: "document.register",
        targetKind: "document",
        targetId: document.id,
        result: "ok",
        correlationId: "correlación",
        details: { sha256: document.sha256, pages: 2, substitute: false },
      },
    ]);
    expect(JSON.stringify(audit.list())).not.toContain("Synthetic");
  });

  test.each([
    ["encrypted.pdf", "encrypted"],
    ["javascript.pdf", "active_content"],
    ["truncated.pdf", "damaged"],
    ["not-a-pdf.pdf", "not_pdf"],
  ])(
    "%s no registra nada y deja constancia del intento",
    async (name, reason) => {
      const result = await register(name);
      expect(result).toMatchObject({ ok: false, reason });
      expect(count("document")).toBe(0);
      expect(count("document_page")).toBe(0);
      expect(hasBlob(dataDir, sha256(fixture(name)))).toBe(false);
      expect(audit.list()).toMatchObject([
        { action: "document.register", result: "failed", details: { reason } },
      ]);
    },
  );

  test.each<[string, Partial<DocumentMetadata>]>([
    ["sin título", { title: "   " }],
    ["con un título demasiado largo", { title: "x".repeat(301) }],
    ["con un carácter de control", { issuer: "Organismo\u0007" }],
    ["con una fecha imposible", { obtainedOn: "2026-02-30" }],
    ["con una fecha en otro formato", { obtainedOn: "07/10/2026" }],
    ["sin versión", { version: "" }],
  ])("%s, no se registra", async (_name, overrides) => {
    expect(await register("text-two-pages.pdf", overrides)).toMatchObject({
      ok: false,
      reason: "invalid_metadata",
    });
    expect(count("document")).toBe(0);
  });

  test("el mismo fichero no se registra dos veces", async () => {
    await registered("text-two-pages.pdf");
    expect(
      await register("text-two-pages.pdf", { title: "Otro título" }),
    ).toMatchObject({ ok: false, reason: "duplicate" });
    expect(count("document")).toBe(1);
  });

  test("un identificador que no existe no devuelve nada", () => {
    expect(source.getDocument("0".repeat(32))).toBeUndefined();
    expect(source.getDocument("no-es-un-id")).toBeUndefined();
    expect(source.listPages("x")).toEqual([]);
    expect(source.readOriginal("0".repeat(32))).toBeUndefined();
  });
});

describe("el documento es inmutable", () => {
  test.each([
    "UPDATE document SET title = 'otro'",
    "DELETE FROM document",
    "UPDATE document_page SET text = 'otro'",
    "DELETE FROM document_page",
    "UPDATE page_resolution SET statement = 'otro'",
    "DELETE FROM page_resolution",
  ])("la base de datos rechaza: %s", async (statement) => {
    const document = await registered("blank-page.pdf");
    source.resolvePage({
      documentId: document.id,
      pageNumber: 2,
      confirmed: true,
      actorId: "docente-1",
      correlationId: "c",
    });
    expect(() => {
      db.exec(statement);
    }).toThrow(/append-only/);
    expect(source.getDocument(document.id)).toEqual(document);
  });

  test("tampoco se puede sustituir una fila con INSERT OR REPLACE", async () => {
    const document = await registered("text-two-pages.pdf");
    expect(() =>
      db
        .prepare(
          "INSERT OR REPLACE INTO document_page (document_id, page_number, " +
            "text, has_extractable_text, has_images) VALUES (?, 1, 'otro', 1, 0)",
        )
        .run(document.id),
    ).toThrow(/append-only/);
    expect(source.getPage(document.id, 1)?.text).toContain("Synthetic");
  });

  test("la API de la capa no ofrece ninguna operación para modificar ni borrar", () => {
    expect(Object.keys(source).sort()).toEqual([
      "getDocument",
      "getPage",
      "limits",
      "listDocuments",
      "listPages",
      "readOriginal",
      "registerDocument",
      "resolvePage",
      "substitutesOf",
      "unresolvedPages",
    ]);
  });
});

describe("páginas sin texto extraíble", () => {
  test("quedan identificadas y pendientes hasta que alguien las resuelve", async () => {
    const document = await registered("image-only-page.pdf");
    expect(source.unresolvedPages(document.id)).toEqual([2]);
    expect(source.listPages(document.id)[1]).toMatchObject({
      hasExtractableText: false,
      hasImages: true,
    });
    expect(
      source.resolvePage({
        documentId: document.id,
        pageNumber: 2,
        confirmed: true,
        actorId: "revisora-1",
        correlationId: "c",
      }),
    ).toEqual({ ok: true });
    expect(source.unresolvedPages(document.id)).toEqual([]);
    // La resolución registra revisor, fecha, hora, página y lo confirmado.
    expect(source.getPage(document.id, 2)?.resolution).toEqual({
      resolvedBy: "revisora-1",
      resolvedAt: NOW,
      statement: PAGE_RESOLUTION_STATEMENT,
    });
    expect(audit.list().at(-1)).toMatchObject({
      action: "document.page.resolve",
      result: "ok",
      actorId: "revisora-1",
      details: { page: 2 },
    });
  });

  test.each([
    ["sin confirmación expresa", 2, false, "not_confirmed"],
    ["de una página con texto", 1, true, "has_text"],
    ["de una página que no existe", 9, true, "not_found"],
  ] as const)(
    "la resolución %s se rechaza y no registra nada",
    async (_name, pageNumber, confirmed, reason) => {
      const document = await registered("blank-page.pdf");
      expect(
        source.resolvePage({
          documentId: document.id,
          pageNumber,
          confirmed,
          actorId: "revisora-1",
          correlationId: "c",
        }),
      ).toEqual({ ok: false, reason });
      expect(count("page_resolution")).toBe(0);
      expect(source.unresolvedPages(document.id)).toEqual([2]);
      expect(audit.list().at(-1)).toMatchObject({
        action: "document.page.resolve",
        result: "failed",
        details: { reason },
      });
    },
  );

  test("una página ya resuelta no se resuelve otra vez", async () => {
    const document = await registered("blank-page.pdf");
    const input = {
      documentId: document.id,
      pageNumber: 2,
      confirmed: true,
      actorId: "revisora-1",
      correlationId: "c",
    };
    expect(source.resolvePage(input)).toEqual({ ok: true });
    expect(source.resolvePage({ ...input, actorId: "otra" })).toEqual({
      ok: false,
      reason: "already_resolved",
    });
    expect(source.getPage(document.id, 2)?.resolution?.resolvedBy).toBe(
      "revisora-1",
    );
  });
});

describe("documento sustituto", () => {
  test("es un documento nuevo vinculado al anterior, que no cambia", async () => {
    const original = await registered("image-only-page.pdf");
    const substitute = await registered("text-two-pages.pdf", original.id);
    expect(substitute.replacesDocumentId).toBe(original.id);
    expect(substitute.id).not.toBe(original.id);
    expect(source.substitutesOf(original.id)).toEqual([substitute]);
    expect(source.substitutesOf(substitute.id)).toEqual([]);
    // El anterior, sus páginas y su pendiente siguen como estaban.
    expect(source.getDocument(original.id)).toEqual(original);
    expect(source.unresolvedPages(original.id)).toEqual([2]);
    expect(source.readOriginal(original.id)).toEqual(
      readFileSync(fixture("image-only-page.pdf")),
    );
    // No se mezclan páginas: cada documento tiene las suyas.
    expect(source.listPages(substitute.id)).toHaveLength(2);
    expect(source.unresolvedPages(substitute.id)).toEqual([]);
    expect(audit.list().at(-1)).toMatchObject({
      action: "document.register",
      details: { substitute: true },
    });
  });

  test("no puede sustituir a un documento que no existe", async () => {
    expect(
      await register("text-two-pages.pdf", {}, "0".repeat(32)),
    ).toMatchObject({ ok: false, reason: "unknown_replaced_document" });
    expect(count("document")).toBe(0);
  });
});
