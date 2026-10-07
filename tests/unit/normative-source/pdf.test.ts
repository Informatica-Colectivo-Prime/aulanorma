// Tratamiento del PDF (specs/002-boe-scorm-export: T032; FR-002, FR-004 y
// FR-064; SC-034 y SC-042). Ejercita los tres pasos reales: qpdf verificado,
// la política propia y la extracción, cada uno en su proceso hijo. Necesita
// `npm run tools:install`: sin la herramienta, todo documento se rechaza.
//
// Hay un caso por cada fichero de `tests/fixtures/pdf/synthetic/`. Ninguno es
// un documento real y su contenido «activo» es inerte.
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import {
  analyzePdf,
  verifiedQpdf,
} from "@/modules/normative-source/pdf/analyze.ts";
import { evaluateStructure } from "@/modules/normative-source/pdf/policy.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const FIXTURES = path.join(repoRoot, "tests/fixtures/pdf/synthetic");
const LIMITS = { maxBytes: 32 * 1024 * 1024, maxPages: 600 };
const TIMEOUT_MS = 120_000;

let work = "";

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), "aulanorma-pdf-"));
});

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

const fixture = (name: string): string => path.join(FIXTURES, name);
const sha256 = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const analyze = (file: string, limits = LIMITS, projectRoot = repoRoot) =>
  analyzePdf(file, { projectRoot, workDir: work }, limits);

interface Accepted {
  readonly pages: number;
  readonly signature?: boolean;
  readonly withoutText?: readonly number[];
  readonly withImages?: readonly number[];
}

const ACCEPTED: Readonly<Record<string, Accepted>> = {
  "text-two-pages.pdf": { pages: 2 },
  "five-pages.pdf": { pages: 5 },
  "blank-page.pdf": { pages: 2, withoutText: [2] },
  "image-only-page.pdf": { pages: 2, withoutText: [2], withImages: [2] },
  "signature-field.pdf": { pages: 1, signature: true },
  "object-streams-allowed.pdf": { pages: 2 },
  "indirect-allowed.pdf": { pages: 1 },
  "incremental-allowed.pdf": { pages: 1 },
  // El objeto de la acción quedó liberado: qpdf no lo incluye, igual que un
  // visor conforme no lo usa. Es un límite declarado del enfoque.
  "incremental-freed-action.pdf": { pages: 1 },
};

const REJECTED: Readonly<Record<string, readonly [string, readonly string[]]>> =
  {
    "not-a-pdf.pdf": ["not_pdf", []],
    "encrypted.pdf": ["encrypted", []],
    "truncated.pdf": ["damaged", []],
    "javascript.pdf": ["active_content", ["javascript"]],
    "open-action-javascript.pdf": [
      "active_content",
      ["automatic_action", "javascript"],
    ],
    "open-action-launch.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    "open-action-launch-escaped-name.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    "page-additional-action.pdf": [
      "active_content",
      ["automatic_action", "javascript"],
    ],
    "embedded-file.pdf": ["active_content", ["embedded_file"]],
    "xfa-form.pdf": ["active_content", ["xfa"]],
    "form-text-field.pdf": ["form_not_allowed", ["form"]],
    "signature-field-with-action.pdf": [
      "active_content",
      ["automatic_action", "form", "javascript"],
    ],
    "signature-field-updated-open-action.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    "object-streams-launch.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    "indirect-action-type.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    "incremental-open-action.pdf": [
      "active_content",
      ["automatic_action", "launch"],
    ],
    // La actualización retira la acción, pero su objeto sigue en el documento.
    "incremental-removed-action.pdf": ["active_content", ["javascript"]],
  };

describe("herramienta verificada", () => {
  test("qpdf está instalado y coincide con las huellas fijadas", async () => {
    expect(await verifiedQpdf(repoRoot)).toBe(
      path.join(repoRoot, ".tools/qpdf/bin/qpdf"),
    );
  });

  test("cada fichero de prueba tiene su caso, y cada caso su fichero", () => {
    expect(readdirSync(FIXTURES).sort()).toEqual(
      [...Object.keys(ACCEPTED), ...Object.keys(REJECTED)].sort(),
    );
  });

  // Una copia del proyecto con la herramienta alterada: sin herramienta
  // verificada, ningún documento se admite.
  const alterations: readonly (readonly [string, (root: string) => void])[] = [
    [
      "falta",
      (root) => {
        rmSync(path.join(root, ".tools"), { recursive: true });
      },
    ],
    [
      "tiene un fichero alterado",
      (root) => {
        appendFileSync(path.join(root, ".tools/qpdf/bin/qpdf"), "x");
      },
    ],
    [
      "tiene un fichero de más",
      (root) => {
        writeFileSync(path.join(root, ".tools/qpdf/lib/extra"), "x");
      },
    ],
    [
      "no tiene fichero de huellas",
      (root) => {
        rmSync(path.join(root, "scripts/tools/tools.lock.json"));
      },
    ],
  ];

  test.each(alterations)(
    "si la herramienta %s, un PDF válido se rechaza como no comprobable",
    async (_name, alter) => {
      const root = mkdtempSync(path.join(work, "proyecto-"));
      mkdirSync(path.join(root, "scripts/tools"), { recursive: true });
      copyFileSync(
        path.join(repoRoot, "scripts/tools/tools.lock.json"),
        path.join(root, "scripts/tools/tools.lock.json"),
      );
      cpSync(
        path.join(repoRoot, ".tools/qpdf"),
        path.join(root, ".tools/qpdf"),
        {
          recursive: true,
        },
      );
      alter(root);
      expect(await verifiedQpdf(root)).toBeUndefined();
      expect(
        await analyze(fixture("text-two-pages.pdf"), LIMITS, root),
      ).toEqual({ ok: false, reason: "not_verifiable", categories: [] });
    },
    TIMEOUT_MS,
  );
});

describe("documentos admitidos", () => {
  test.each(Object.entries(ACCEPTED))(
    "%s se admite, con su texto por página, y conserva su huella",
    async (name, expected) => {
      const file = fixture(name);
      const before = sha256(file);
      const result = await analyze(file);
      if (!result.ok) {
        expect.fail(`rechazado: ${result.reason}`);
      }
      expect(result.sha256).toBe(before);
      expect(sha256(file)).toBe(before);
      expect(result.pageCount).toBe(expected.pages);
      expect(result.pages.map((page) => page.number)).toEqual(
        Array.from({ length: expected.pages }, (_item, index) => index + 1),
      );
      expect(result.hasSignatureField).toBe(expected.signature === true);
      expect(
        result.pages
          .filter((page) => !page.hasExtractableText)
          .map((page) => page.number),
      ).toEqual(expected.withoutText ?? []);
      expect(
        result.pages
          .filter((page) => page.hasImages)
          .map((page) => page.number),
      ).toEqual(expected.withImages ?? []);
      for (const page of result.pages) {
        // Sin umbral: sin texto es no tener ningún carácter que no sea espacio.
        expect(page.hasExtractableText).toBe(page.text.trim() !== "");
      }
    },
    TIMEOUT_MS,
  );

  test("el texto extraído es el de cada página", async () => {
    const result = await analyze(fixture("text-two-pages.pdf"));
    expect(result.ok && result.pages.map((page) => page.text)).toEqual([
      "Synthetic fixture, page 1.\nThis text is extractable.",
      "Synthetic fixture, page 2.\nThis text is extractable.",
    ]);
  });
});

describe("documentos rechazados", () => {
  test.each(Object.entries(REJECTED))(
    "%s se rechaza, con su motivo, y conserva su huella",
    async (name, [reason, categories]) => {
      const file = fixture(name);
      const before = sha256(file);
      expect(await analyze(file)).toEqual({ ok: false, reason, categories });
      expect(sha256(file)).toBe(before);
    },
    TIMEOUT_MS,
  );

  test("el cifrado lo declara qpdf funcionando, no un fallo de la herramienta", async () => {
    // Con la misma herramienta y el mismo entorno, un documento sin cifrar
    // se admite y uno dañado se distingue del cifrado.
    expect((await analyze(fixture("text-two-pages.pdf"))).ok).toBe(true);
    expect(await analyze(fixture("truncated.pdf"))).toMatchObject({
      reason: "damaged",
    });
    expect(await analyze(fixture("encrypted.pdf"))).toMatchObject({
      reason: "encrypted",
    });
  });

  test("un fichero vacío se rechaza", async () => {
    const empty = path.join(work, "vacio.pdf");
    writeFileSync(empty, "");
    expect(await analyze(empty)).toMatchObject({ ok: false, reason: "empty" });
  });

  test("por encima del tamaño máximo se rechaza antes de analizarlo", async () => {
    // Ni siquiera se comprueba que sea un PDF.
    const big = path.join(work, "grande.pdf");
    writeFileSync(big, Buffer.alloc(2048, 0x20));
    expect(await analyze(big, { maxBytes: 2047, maxPages: 600 })).toMatchObject(
      { ok: false, reason: "too_large" },
    );
    expect(await analyze(big, { maxBytes: 2048, maxPages: 600 })).toMatchObject(
      { ok: false, reason: "not_pdf" },
    );
  });

  test("por encima del número máximo de páginas se rechaza; en el límite, no", async () => {
    const file = fixture("five-pages.pdf");
    expect(
      await analyze(file, { maxBytes: LIMITS.maxBytes, maxPages: 4 }),
    ).toMatchObject({ ok: false, reason: "too_many_pages" });
    expect(
      (await analyze(file, { maxBytes: LIMITS.maxBytes, maxPages: 5 })).ok,
    ).toBe(true);
  });

  test("ningún análisis deja temporales", async () => {
    await analyze(fixture("javascript.pdf"));
    await analyze(fixture("text-two-pages.pdf"));
    expect(readdirSync(work).filter((name) => name.startsWith("pdf-"))).toEqual(
      [],
    );
  });
});

describe("política sobre la estructura interpretada", () => {
  const structure = (
    objects: Record<string, unknown>,
    catalog: Record<string, unknown> = {},
  ): unknown => ({
    pages: [{ object: "3 0 R" }],
    qpdf: [
      { jsonversion: 2 },
      {
        trailer: { value: { "/Root": "1 0 R" } },
        "obj:1 0 R": { value: { "/Type": "/Catalog", ...catalog } },
        ...objects,
      },
    ],
  });

  test("una estructura sin nada prohibido se admite", () => {
    expect(evaluateStructure(structure({}))).toEqual({
      accepted: true,
      categories: [],
      signatureField: false,
      pageCount: 1,
      objectCount: 1,
    });
  });

  test.each([
    ["no es un objeto", "texto"],
    ["no tiene la estructura", { pages: [] }],
    ["es de otra versión", { pages: [], qpdf: [{ jsonversion: 1 }, {}] }],
    [
      "no tiene catálogo",
      { pages: [], qpdf: [{ jsonversion: 2 }, { trailer: { value: {} } }] },
    ],
  ])("una salida que %s no es comprobable", (_name, document) => {
    expect(evaluateStructure(document)).toMatchObject({
      accepted: false,
      categories: ["unverifiable"],
    });
  });

  test("una referencia que no se resuelve rechaza el documento", () => {
    expect(
      evaluateStructure(
        structure({ "obj:2 0 R": { value: { "/A": "9 0 R" } } }),
      ),
    ).toMatchObject({ accepted: false });
    expect(
      evaluateStructure(structure({}, { "/AcroForm": "9 0 R" })).categories,
    ).toContain("unverifiable");
  });

  test("una cadena de referencias sin fin rechaza el documento", () => {
    expect(
      evaluateStructure(
        structure({
          "obj:2 0 R": { value: "4 0 R" },
          "obj:4 0 R": { value: "2 0 R" },
          "obj:5 0 R": { value: { "/S": "2 0 R" } },
        }),
      ).categories,
    ).toContain("unverifiable");
  });

  test("la acción de una anotación solo se admite si es un salto interno o un enlace", () => {
    const withAction = (type: string) =>
      evaluateStructure(
        structure({ "obj:2 0 R": { value: { "/A": { "/S": type } } } }),
      );
    expect(withAction("/GoTo").accepted).toBe(true);
    expect(withAction("/URI").accepted).toBe(true);
    expect(withAction("/Launch").categories).toEqual(["action", "launch"]);
    expect(withAction("/Desconocida").categories).toEqual(["action"]);
  });

  test("los atributos del árbol de estructura no son acciones; fuera de él, sí", () => {
    const element = { "/S": "/P", "/A": { "/O": "/Layout" } };
    expect(
      evaluateStructure(
        structure(
          {
            "obj:2 0 R": { value: { "/K": ["4 0 R"] } },
            "obj:4 0 R": { value: element },
          },
          { "/StructTreeRoot": "2 0 R" },
        ),
      ).accepted,
    ).toBe(true);
    expect(
      evaluateStructure(structure({ "obj:4 0 R": { value: element } }))
        .categories,
    ).toEqual(["action"]);
  });

  test("un formulario solo se admite si todos sus campos son de firma y sin acciones", () => {
    const form = (fields: Record<string, unknown>[]) =>
      evaluateStructure(
        structure(
          Object.fromEntries(
            fields.map((field, index) => [
              `obj:${String(index + 10)} 0 R`,
              { value: field },
            ]),
          ),
          {
            "/AcroForm": {
              "/Fields": fields.map(
                (_field, index) => `${String(index + 10)} 0 R`,
              ),
            },
          },
        ),
      );
    expect(form([{ "/FT": "/Sig" }])).toMatchObject({
      accepted: true,
      signatureField: true,
    });
    expect(form([{ "/FT": "/Sig" }, { "/FT": "/Tx" }]).categories).toEqual([
      "form",
    ]);
    expect(form([{ "/FT": "/Sig", "/A": { "/S": "/URI" } }]).accepted).toBe(
      false,
    );
    expect(form([{}]).categories).toEqual(["form"]);
  });
});
