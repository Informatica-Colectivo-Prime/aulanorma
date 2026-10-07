// Interpretación estructurada (specs/002-boe-scorm-export: T034, T036 y T037;
// FR-005 a FR-007, FR-057, FR-061, FR-063, FR-065 y FR-070; SC-004, SC-005,
// SC-029, SC-033, SC-036 y SC-041).
//
// La fuente normativa es un doble con páginas sintéticas y la generación usa
// el adaptador determinista: no hay documento real, red ni proveedor.
import { beforeEach, describe, expect, test } from "vitest";
import type { NormativeSource } from "@/modules/normative-source";
import {
  createStructuredInterpretation,
  INVENTORY_REVIEW_STATEMENT,
  MAX_SECTION_PAGES,
} from "@/modules/structured-interpretation";
import type {
  ChangeResult,
  Interpretation,
  InterpretationOutput,
  RequirementInput,
  StructuredInterpretation,
} from "@/modules/structured-interpretation";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import {
  createBudget,
  createDeterministicProvider,
  createGeneration,
  inputDigest,
} from "@/platform/generation";
import type { Generation, ProviderRequest } from "@/platform/generation";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

const DOCUMENT = "d".repeat(32);
const OTHER_DOCUMENT = "e".repeat(32);
const UNIT = "UX9001";
const PAGES: Readonly<Record<number, string>> = {
  1: "Unidad sintética.\nDuración: 30 horas.\nC1: Describir   el ejemplo.",
  2: "CE1.1 Reconocer el ejemplo.\n1. Contenido uno\n– Apartado a",
  3: "▫ Detalle del apartado.\nFin de la unidad.",
  4: "",
};
const ACTOR = { actorId: "docente-1", correlationId: "correlación" };

function output(
  overrides: Partial<InterpretationOutput> = {},
): InterpretationOutput {
  return {
    unit: {
      code: UNIT,
      title: "Unidad sintética",
      durationHours: 30,
      durationSection: "Unidad formativa",
      durationPage: 1,
      durationQuote: "Duración: 30 horas.",
    },
    requirements: [
      requirement("C1", null, "capability", 1, "C1: Describir el ejemplo."),
      requirement("CE1.1", "C1", "criterion", 2, "CE1.1 Reconocer el ejemplo."),
      requirement("K1", null, "content", 2, "1. Contenido uno"),
      requirement("S1", "K1", "subcontent", 2, "– Apartado a"),
      requirement("S2", "S1", "subcontent", 3, null),
    ],
    ...overrides,
  };
}

function requirement(
  ref: string,
  parentRef: string | null,
  kind: InterpretationOutput["requirements"][number]["kind"],
  page: number,
  quote: string | null,
): InterpretationOutput["requirements"][number] {
  return {
    ref,
    parentRef,
    kind,
    code: ref,
    text: `Texto de ${ref}`,
    section: "Sección sintética",
    pageFrom: page,
    pageTo: page,
    quote,
  };
}

let db: Database;
let audit: Audit;
let generation: Generation;
let interpretations: StructuredInterpretation;
let recorded: unknown;
let sent: ProviderRequest[];
let superseded: Set<string>;
let unresolved: number[];
let clock = 0;

const source: NormativeSource = {
  limits: { maxBytes: 1, maxPages: 4 },
  registerDocument: () => Promise.reject(new Error("no se usa")),
  listDocuments: () => [],
  getDocument: (id) =>
    id === DOCUMENT || id === OTHER_DOCUMENT
      ? {
          id,
          title: "Documento sintético",
          issuer: "Organismo",
          officialReference: "REF",
          source: "prueba",
          obtainedOn: "2026-10-07",
          version: "v",
          sha256: "0".repeat(64),
          sizeBytes: 1,
          pageCount: 4,
          hasSignatureField: false,
          replacesDocumentId: null,
          registeredBy: "docente-1",
          registeredAt: 0,
        }
      : undefined,
  substitutesOf: (id) =>
    superseded.has(id)
      ? [source.getDocument(OTHER_DOCUMENT)].filter(
          (item) => item !== undefined,
        )
      : [],
  listPages: () => [],
  getPage: (id, number) =>
    id === DOCUMENT && PAGES[number] !== undefined
      ? {
          number,
          text: PAGES[number],
          hasExtractableText: PAGES[number] !== "",
          hasImages: false,
          resolution: null,
        }
      : undefined,
  unresolvedPages: () => unresolved,
  resolvePage: () => ({ ok: true }),
  readOriginal: () => undefined,
};

beforeEach(() => {
  db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  recorded = output();
  sent = [];
  superseded = new Set();
  unresolved = [];
  clock = Date.UTC(2026, 9, 7);
  generation = createGeneration({
    db,
    budget: createBudget({
      db,
      audit,
      now: () => (clock += 1000),
      maxOperationCost: 0,
    }),
    now: () => (clock += 1000),
    // Responde `recorded` a la entrada que le llegue, y la anota.
    provider: {
      name: "deterministic",
      estimateCost: () => 0,
      maxCost: () => 0,
      generate: (request) => {
        sent.push(request);
        return createDeterministicProvider([
          {
            task: "interpretation",
            promptVersion: "v1",
            inputSha256: inputDigest(request.input),
            output: recorded,
          },
        ]).generate(request);
      },
    },
  });
  interpretations = createStructuredInterpretation({
    db,
    audit,
    source,
    generation,
    prompt: { version: "v1", instructions: "Instrucciones." },
    now: () => (clock += 1000),
  });
});

const request = (overrides: Record<string, unknown> = {}) =>
  interpretations.request({
    documentId: DOCUMENT,
    unitCode: UNIT,
    pageFrom: 1,
    pageTo: 3,
    ...ACTOR,
    ...overrides,
  });

async function created(): Promise<Interpretation> {
  const result = await request();
  if (!result.ok) {
    expect.fail(`no se creó: ${result.reason}`);
  }
  return current(result.interpretationId);
}

function current(id: string): Interpretation {
  const interpretation = interpretations.get(id);
  if (interpretation === undefined) {
    throw new Error("La interpretación no existe.");
  }
  return interpretation;
}
const count = (table: string): number =>
  Number(db.prepare(`SELECT count(*) AS total FROM ${table}`).get()?.total);
const target = (
  interpretation: Interpretation,
  revision = interpretation.revision,
) => ({
  interpretationId: interpretation.id,
  revision,
  ...ACTOR,
});
const validate = (
  interpretation: Interpretation,
  reviewed = true,
): ChangeResult =>
  interpretations.validate({
    ...target(interpretation),
    inventoryReviewed: reviewed,
  });
const CHANGE: RequirementInput = {
  kind: "capability",
  parentId: null,
  code: "C1",
  text: "Texto corregido",
  section: "Sección corregida",
  pageFrom: 1,
  pageTo: 1,
  quote: "C1: Describir el ejemplo.",
};

describe("obtener la interpretación", () => {
  test("guarda la unidad, la duración como metadato y el inventario con su jerarquía", async () => {
    const interpretation = await created();
    expect(interpretation).toMatchObject({
      documentId: DOCUMENT,
      unitCode: UNIT,
      unitTitle: "Unidad sintética",
      durationHours: 30,
      durationSection: "Unidad formativa",
      durationPage: 1,
      durationQuote: "Duración: 30 horas.",
      sectionPageFrom: 1,
      sectionPageTo: 3,
      status: "in_review",
      revision: 1,
      createdBy: "docente-1",
    });
    expect(
      interpretation.requirements.map(
        ({ code, kind, depth, pageFrom, origin, withdrawn }) =>
          [code, kind, depth, pageFrom, origin, withdrawn] as const,
      ),
    ).toEqual([
      ["C1", "capability", 0, 1, "generated", false],
      ["CE1.1", "criterion", 1, 2, "generated", false],
      ["K1", "content", 0, 2, "generated", false],
      ["S1", "subcontent", 1, 2, "generated", false],
      ["S2", "subcontent", 2, 3, "generated", false],
    ]);
    const [capability, criterion] = interpretation.requirements;
    expect(criterion?.parentId).toBe(capability?.id);
    // La duración no es un requisito.
    expect(JSON.stringify(interpretation.requirements)).not.toContain(
      "30 horas",
    );
    expect(interpretations.listForDocument(DOCUMENT)).toEqual([interpretation]);
    expect(interpretations.history(interpretation.id)).toEqual({
      corrections: [],
      validations: [],
      rejections: [],
    });
  });

  test("envía solo la unidad y el texto de las páginas de la sección, sin datos de usuarios", async () => {
    await created();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.input).toEqual({
      unitCode: UNIT,
      pages: [1, 2, 3].map((number) => ({ number, text: PAGES[number] })),
    });
    expect(sent[0]?.instructions).toBe("Instrucciones.");
    expect(JSON.stringify(sent)).not.toContain("docente-1");
    expect(JSON.stringify(sent)).not.toContain("correlación");
  });

  test("registra la ejecución y la llamada, y lo audita", async () => {
    const interpretation = await created();
    expect(generation.getRun(interpretation.generationRunId)).toMatchObject({
      kind: "interpretation",
      targetId: DOCUMENT,
      status: "succeeded",
    });
    expect(generation.listCalls(interpretation.generationRunId)).toMatchObject([
      {
        provider: "deterministic",
        promptVersion: "v1",
        validationResult: "valid",
      },
    ]);
    expect(audit.list()).toMatchObject([
      {
        action: "interpretation.request",
        result: "ok",
        targetId: interpretation.id,
        details: { requirements: 5, provider: "deterministic" },
      },
    ]);
  });

  test("una unidad que no está en esas páginas queda sin inventario", async () => {
    recorded = output({ requirements: [] });
    const interpretation = await created();
    expect(interpretation.requirements).toEqual([]);
    expect(validate(interpretation)).toMatchObject({
      ok: false,
      reason: "empty_inventory",
    });
  });

  const invalidOutputs: readonly (readonly [string, () => unknown, string])[] =
    [
      ["no cumple el esquema", () => ({ unit: {} }), "invalid_output"],
      [
        "tiene un tipo desconocido",
        () => ({
          ...output(),
          requirements: [
            { ...requirement("X", null, "capability", 1, null), kind: "otro" },
          ],
        }),
        "invalid_output",
      ],
      [
        "es de otra unidad",
        () => output({ unit: { ...output().unit, code: "UX9002" } }),
        "rejected_by_domain",
      ],
      [
        "cita un texto que no está en su página",
        () =>
          output({
            requirements: [
              requirement("C1", null, "capability", 1, "Este texto no figura."),
            ],
          }),
        "rejected_by_domain",
      ],
      [
        "cita en una página un texto que está en otra",
        () =>
          output({
            requirements: [
              requirement(
                "C1",
                null,
                "capability",
                2,
                "C1: Describir el ejemplo.",
              ),
            ],
          }),
        "rejected_by_domain",
      ],
      [
        "refiere una página fuera de la sección",
        () =>
          output({
            requirements: [requirement("C1", null, "capability", 4, null)],
          }),
        "rejected_by_domain",
      ],
      [
        "refiere una página que no existe",
        () =>
          output({
            requirements: [requirement("C1", null, "capability", 99, null)],
          }),
        "rejected_by_domain",
      ],
      [
        "cuelga un criterio de un contenido",
        () =>
          output({
            requirements: [
              requirement("K1", null, "content", 2, null),
              requirement("CE", "K1", "criterion", 2, null),
            ],
          }),
        "rejected_by_domain",
      ],
      [
        "refiere un padre que no existe",
        () =>
          output({
            requirements: [requirement("CE", "C9", "criterion", 2, null)],
          }),
        "rejected_by_domain",
      ],
      [
        "repite un identificador",
        () =>
          output({
            requirements: [
              requirement("C1", null, "capability", 1, null),
              requirement("C1", null, "capability", 1, null),
            ],
          }),
        "rejected_by_domain",
      ],
      [
        "da una cita de la duración que no está en su página",
        () =>
          output({
            unit: { ...output().unit, durationQuote: "Duración: 90 horas." },
          }),
        "rejected_by_domain",
      ],
    ];

  test.each(invalidOutputs)(
    "una salida que %s se rechaza y se registra, sin guardar nada",
    async (_name, build, reason) => {
      recorded = build();
      expect(await request()).toEqual({ ok: false, reason });
      expect(count("interpretation")).toBe(0);
      expect(count("requirement")).toBe(0);
      const [run] = db.prepare("SELECT * FROM generation_run").all();
      expect(run?.status).toBe("failed");
      expect(
        db.prepare("SELECT validation_result FROM generation_call").all(),
      ).toEqual([{ validation_result: reason }]);
      expect(audit.list().at(-1)).toMatchObject({
        action: "interpretation.request",
        result: "failed",
        details: { reason },
      });
    },
  );

  test("la cita se compara sin distinguir el espaciado, y puede cruzar dos páginas", async () => {
    recorded = output({
      requirements: [
        {
          ...requirement(
            "C1",
            null,
            "capability",
            1,
            "C1:   Describir\nel ejemplo. CE1.1 Reconocer",
          ),
          pageTo: 2,
        },
      ],
    });
    expect((await request()).ok).toBe(true);
  });

  test.each([
    [
      "un documento que no existe",
      { documentId: "f".repeat(32) },
      "document_not_found",
    ],
    ["un código de unidad inválido", { unitCode: "ux 1" }, "invalid_unit"],
    ["páginas invertidas", { pageFrom: 3, pageTo: 1 }, "invalid_pages"],
    ["una página fuera del documento", { pageTo: 5 }, "invalid_pages"],
    ["la página cero", { pageFrom: 0 }, "invalid_pages"],
    ["páginas que no son enteras", { pageFrom: 1.5 }, "invalid_pages"],
  ])(
    "con %s no se envía nada al proveedor",
    async (_name, overrides, reason) => {
      expect(await request(overrides)).toEqual({ ok: false, reason });
      expect(sent).toEqual([]);
      expect(count("generation_run")).toBe(0);
    },
  );

  test("la sección tiene un máximo de páginas", () => {
    expect(MAX_SECTION_PAGES).toBeGreaterThanOrEqual(3);
  });

  test("solo hay una interpretación por documento y unidad", async () => {
    await created();
    expect(await request()).toEqual({ ok: false, reason: "already_exists" });
    expect(sent).toHaveLength(1);
  });

  test("sobre un documento con sustituto no se pide nada", async () => {
    superseded.add(DOCUMENT);
    expect(await request()).toEqual({ ok: false, reason: "superseded" });
    expect(sent).toEqual([]);
  });
});

describe("correcciones", () => {
  test("corregir un requisito lo cambia, lo registra con autor y fecha, y aumenta la revisión", async () => {
    const interpretation = await created();
    const [capability] = interpretation.requirements;
    const result = interpretations.editRequirement({
      ...target(interpretation),
      actorId: "docente-2",
      requirementId: capability?.id ?? "",
      change: CHANGE,
    });
    expect(result).toEqual({ ok: true, revision: 2 });
    const after = current(interpretation.id);
    expect(after.revision).toBe(2);
    expect(after.requirements[0]).toMatchObject({
      id: capability?.id,
      text: "Texto corregido",
      section: "Sección corregida",
      origin: "generated",
    });
    const { corrections } = interpretations.history(interpretation.id);
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toMatchObject({
      requirementId: capability?.id,
      kind: "edit",
      author: "docente-2",
      resultingRevision: 2,
    });
    expect(corrections[0]?.at).toBeGreaterThan(0);
    expect(JSON.parse(corrections[0]?.before ?? "{}")).toMatchObject({
      text: "Texto de C1",
    });
    expect(JSON.parse(corrections[0]?.after ?? "{}")).toMatchObject({
      text: "Texto corregido",
    });
    expect(audit.list().at(-1)).toMatchObject({
      action: "interpretation.correct",
      result: "ok",
      actorId: "docente-2",
      details: { revision: 2 },
    });
  });

  test("añadir un requisito que faltaba lo incorpora al inventario, marcado como añadido", async () => {
    const interpretation = await created();
    const parent = interpretation.requirements.find(
      ({ code }) => code === "C1",
    );
    expect(
      interpretations.addRequirement({
        ...target(interpretation),
        requirement: {
          ...CHANGE,
          kind: "criterion",
          parentId: parent?.id ?? null,
          code: "CE1.2",
          text: "Criterio que faltaba",
          pageFrom: 2,
          pageTo: 2,
          quote: null,
        },
      }),
    ).toEqual({ ok: true, revision: 2 });
    const added = current(interpretation.id).requirements.find(
      ({ code }) => code === "CE1.2",
    );
    expect(added).toMatchObject({
      kind: "criterion",
      parentId: parent?.id,
      origin: "correction",
      depth: 1,
    });
    expect(
      interpretations.history(interpretation.id).corrections,
    ).toMatchObject([{ kind: "add", requirementId: added?.id }]);
  });

  test("retirar un requisito no lo borra: queda marcado y registrado", async () => {
    const interpretation = await created();
    const leaf = interpretation.requirements.find(({ code }) => code === "S2");
    expect(
      interpretations.withdrawRequirement({
        ...target(interpretation),
        requirementId: leaf?.id ?? "",
      }),
    ).toEqual({ ok: true, revision: 2 });
    const after = current(interpretation.id);
    expect(after.requirements).toHaveLength(5);
    expect(
      after.requirements.find(({ id }) => id === leaf?.id)?.withdrawn,
    ).toBe(true);
    expect(count("requirement")).toBe(5);
    expect(() => {
      db.exec("DELETE FROM requirement");
    }).toThrow();
    // Un requisito retirado ya no se corrige ni se retira otra vez.
    expect(
      interpretations.withdrawRequirement({
        ...target(after),
        requirementId: leaf?.id ?? "",
      }),
    ).toMatchObject({ ok: false, reason: "withdrawn" });
    expect(
      interpretations.editRequirement({
        ...target(after),
        requirementId: leaf?.id ?? "",
        change: CHANGE,
      }),
    ).toMatchObject({ ok: false, reason: "withdrawn" });
  });

  test("no se retira un requisito del que dependen otros", async () => {
    const interpretation = await created();
    const parent = interpretation.requirements.find(
      ({ code }) => code === "K1",
    );
    expect(
      interpretations.withdrawRequirement({
        ...target(interpretation),
        requirementId: parent?.id ?? "",
      }),
    ).toMatchObject({ ok: false, reason: "has_children" });
    expect(current(interpretation.id).revision).toBe(1);
  });

  test("corregir la unidad cambia su denominación y su duración, con su referencia", async () => {
    const interpretation = await created();
    expect(
      interpretations.editUnit({
        ...target(interpretation),
        unit: {
          unitTitle: "Unidad sintética corregida",
          durationHours: null,
          durationSection: "",
          durationPage: null,
          durationQuote: null,
        },
      }),
    ).toEqual({ ok: true, revision: 2 });
    expect(current(interpretation.id)).toMatchObject({
      unitTitle: "Unidad sintética corregida",
      durationHours: null,
      durationPage: null,
    });
    expect(
      interpretations.history(interpretation.id).corrections,
    ).toMatchObject([{ kind: "unit", requirementId: null }]);
  });

  const invalidChanges: readonly (readonly [
    string,
    Partial<RequirementInput>,
    string,
  ])[] = [
    ["sin texto", { text: "   " }, "invalid"],
    ["con un tipo desconocido", { kind: "otro" }, "invalid"],
    ["con páginas invertidas", { pageFrom: 2, pageTo: 1 }, "invalid"],
    ["con un carácter de control", { text: "Texto\u0000" }, "invalid"],
    [
      "con una página que no existe",
      { pageFrom: 9, pageTo: 9 },
      "page_not_found",
    ],
    [
      "con una cita que no está en la página",
      { quote: "No figura." },
      "quote_not_found",
    ],
    [
      "con un padre que no existe",
      { parentId: "a".repeat(32) },
      "invalid_parent",
    ],
  ];

  test.each(invalidChanges)(
    "una corrección %s no guarda nada",
    async (_name, overrides, reason) => {
      const interpretation = await created();
      const [capability] = interpretation.requirements;
      expect(
        interpretations.editRequirement({
          ...target(interpretation),
          requirementId: capability?.id ?? "",
          change: { ...CHANGE, ...overrides },
        }),
      ).toMatchObject({ ok: false, reason });
      expect(current(interpretation.id)).toEqual(interpretation);
      expect(count("correction")).toBe(0);
    },
  );

  test("la jerarquía se conserva: ni tipos que no encajan ni ciclos", async () => {
    const interpretation = await created();
    const byCode = (code: string) =>
      interpretation.requirements.find((item) => item.code === code)?.id ?? "";
    const edit = (code: string, change: Partial<RequirementInput>) =>
      interpretations.editRequirement({
        ...target(interpretation),
        requirementId: byCode(code),
        change: { ...CHANGE, quote: null, ...change },
      });
    // Una capacidad con criterios no puede pasar a ser contenido.
    expect(edit("C1", { kind: "content" })).toMatchObject({
      reason: "invalid_parent",
    });
    // Un criterio no cuelga de un contenido.
    expect(
      edit("CE1.1", { kind: "criterion", parentId: byCode("K1") }),
    ).toMatchObject({ reason: "invalid_parent" });
    // Un subapartado no cuelga de sí mismo ni de su descendiente.
    expect(
      edit("S1", { kind: "subcontent", parentId: byCode("S1") }),
    ).toMatchObject({ reason: "invalid_parent" });
    expect(
      edit("S1", { kind: "subcontent", parentId: byCode("S2") }),
    ).toMatchObject({ reason: "invalid_parent" });
    expect(current(interpretation.id).revision).toBe(1);
  });
});

describe("edición simultánea (FR-063, SC-033)", () => {
  test("el segundo guardado sobre la misma revisión se rechaza, no guarda nada y los dos cambios siguen disponibles", async () => {
    const interpretation = await created();
    const [capability, criterion] = interpretation.requirements;
    // Dos sesiones abren la revisión 1.
    const first = interpretations.editRequirement({
      ...target(interpretation, 1),
      actorId: "docente-1",
      requirementId: capability?.id ?? "",
      change: { ...CHANGE, text: "Cambio de la primera sesión" },
    });
    expect(first).toEqual({ ok: true, revision: 2 });
    const secondChange = {
      ...CHANGE,
      kind: "criterion",
      parentId: capability?.id ?? null,
      text: "Cambio de la segunda sesión",
      pageFrom: 2,
      pageTo: 2,
      quote: null,
    };
    const second = interpretations.editRequirement({
      ...target(interpretation, 1),
      actorId: "docente-2",
      requirementId: criterion?.id ?? "",
      change: secondChange,
    });
    expect(second).toEqual({ ok: false, reason: "conflict", pages: [] });

    // El primero está guardado como versión más reciente; el segundo no se
    // ha guardado ni fusionado.
    const latest = current(interpretation.id);
    expect(latest.revision).toBe(2);
    expect(latest.requirements[0]?.text).toBe("Cambio de la primera sesión");
    expect(latest.requirements[1]?.text).toBe("Texto de CE1.1");
    expect(count("correction")).toBe(1);
    expect(audit.list().at(-1)).toMatchObject({
      action: "interpretation.correct",
      result: "failed",
      actorId: "docente-2",
      details: { reason: "conflict", revision: 1 },
    });

    // Solo se guarda si se reenvía de forma explícita contra la versión más
    // reciente.
    expect(
      interpretations.editRequirement({
        ...target(latest),
        actorId: "docente-2",
        requirementId: criterion?.id ?? "",
        change: secondChange,
      }),
    ).toEqual({ ok: true, revision: 3 });
    const merged = current(interpretation.id);
    expect(merged.requirements[0]?.text).toBe("Cambio de la primera sesión");
    expect(merged.requirements[1]?.text).toBe("Cambio de la segunda sesión");
  });

  test.each([
    "validate",
    "reject",
    "resubmit",
    "withdraw",
    "add",
    "unit",
  ] as const)(
    "%s sobre una revisión anterior se rechaza con conflicto",
    async (operation) => {
      const interpretation = await created();
      const [capability] = interpretation.requirements;
      interpretations.editRequirement({
        ...target(interpretation),
        requirementId: capability?.id ?? "",
        change: CHANGE,
      });
      const stale = target(interpretation, 1);
      const result: ChangeResult =
        operation === "validate"
          ? interpretations.validate({ ...stale, inventoryReviewed: true })
          : operation === "reject"
            ? interpretations.reject({ ...stale, reason: "Motivo" })
            : operation === "resubmit"
              ? interpretations.resubmit(stale)
              : operation === "withdraw"
                ? interpretations.withdrawRequirement({
                    ...stale,
                    requirementId: capability?.id ?? "",
                  })
                : operation === "add"
                  ? interpretations.addRequirement({
                      ...stale,
                      requirement: CHANGE,
                    })
                  : interpretations.editUnit({
                      ...stale,
                      unit: {
                        unitTitle: "Otra",
                        durationHours: null,
                        durationSection: "",
                        durationPage: null,
                        durationQuote: null,
                      },
                    });
      expect(result).toMatchObject({ ok: false, reason: "conflict" });
      expect(current(interpretation.id)).toMatchObject({
        revision: 2,
        status: "in_review",
      });
    },
  );
});

describe("validación", () => {
  test("registra quién, cuándo, qué versión y la confirmación de la revisión del inventario", async () => {
    const interpretation = await created();
    expect(
      interpretations.validate({
        ...target(interpretation),
        actorId: "docente-2",
        inventoryReviewed: true,
      }),
    ).toEqual({ ok: true, revision: 1 });
    expect(current(interpretation.id).status).toBe("validated");
    const { validations } = interpretations.history(interpretation.id);
    expect(validations).toHaveLength(1);
    expect(validations[0]).toMatchObject({
      revision: 1,
      validatedBy: "docente-2",
      inventoryReviewedStatement: INVENTORY_REVIEW_STATEMENT,
      current: true,
    });
    expect(validations[0]?.validatedAt).toBeGreaterThan(Date.UTC(2026, 9, 7));
    expect(audit.list().at(-1)).toMatchObject({
      action: "interpretation.validate",
      result: "ok",
      actorId: "docente-2",
    });
  });

  test("sin la confirmación expresa no se valida (SC-036)", async () => {
    const interpretation = await created();
    expect(validate(interpretation, false)).toMatchObject({
      ok: false,
      reason: "not_confirmed",
    });
    expect(current(interpretation.id).status).toBe("in_review");
    expect(count("interpretation_validation")).toBe(0);
  });

  test("con páginas sin texto pendientes de resolver no se valida, y se dice cuáles", async () => {
    const interpretation = await created();
    unresolved = [4, 7];
    expect(validate(interpretation)).toEqual({
      ok: false,
      reason: "unresolved_pages",
      pages: [4, 7],
    });
    expect(count("interpretation_validation")).toBe(0);
    unresolved = [];
    expect(validate(interpretation).ok).toBe(true);
  });

  test("no se valida dos veces la misma versión", async () => {
    const interpretation = await created();
    expect(validate(interpretation).ok).toBe(true);
    expect(validate(current(interpretation.id))).toMatchObject({
      ok: false,
      reason: "not_in_review",
    });
    expect(count("interpretation_validation")).toBe(1);
  });

  test("corregir una interpretación validada deja la validación sin vigencia, sin borrarla (FR-065, SC-029)", async () => {
    const interpretation = await created();
    validate(interpretation);
    const [capability] = interpretation.requirements;
    expect(
      interpretations.editRequirement({
        ...target(current(interpretation.id)),
        requirementId: capability?.id ?? "",
        change: CHANGE,
      }),
    ).toEqual({ ok: true, revision: 2 });
    const after = current(interpretation.id);
    expect(after.status).toBe("in_review");
    const { validations } = interpretations.history(interpretation.id);
    expect(validations).toMatchObject([{ revision: 1, current: false }]);
    // Una nueva validación, de la versión nueva, sí es vigente.
    expect(validate(after).ok).toBe(true);
    expect(
      interpretations.history(interpretation.id).validations,
    ).toMatchObject([
      { revision: 1, current: false },
      { revision: 2, current: true },
    ]);
  });

  test("las validaciones, los rechazos y las correcciones solo se insertan", async () => {
    const interpretation = await created();
    validate(interpretation);
    interpretations.reject({ ...target(interpretation), reason: "Motivo" });
    interpretations.editRequirement({
      ...target(interpretation),
      requirementId: interpretation.requirements[0]?.id ?? "",
      change: CHANGE,
    });
    expect(count("correction")).toBe(1);
    expect(count("interpretation_rejection")).toBe(1);
    for (const statement of [
      "UPDATE interpretation_validation SET interpretation_revision = 9",
      "UPDATE correction SET author = 'otro'",
      "UPDATE interpretation_rejection SET reason = 'otro'",
      "DELETE FROM interpretation_validation",
      "DELETE FROM interpretation",
      "DELETE FROM correction",
      "DELETE FROM interpretation_rejection",
    ]) {
      expect(() => {
        db.exec(statement);
      }).toThrow();
    }
  });

  test("ninguna operación valida por su cuenta: solo existe la acción explícita", async () => {
    const interpretation = await created();
    const [capability] = interpretation.requirements;
    interpretations.editRequirement({
      ...target(interpretation),
      requirementId: capability?.id ?? "",
      change: CHANGE,
    });
    interpretations.resubmit(target(current(interpretation.id)));
    expect(count("interpretation_validation")).toBe(0);
    expect(current(interpretation.id).status).toBe("in_review");
  });
});

describe("rechazo (FR-070, SC-041)", () => {
  test("conserva el contenido, registra quién, cuándo y el motivo, y no inicia ninguna generación", async () => {
    const interpretation = await created();
    const runs = count("generation_run");
    expect(
      interpretations.reject({
        ...target(interpretation),
        actorId: "docente-2",
        reason: "  Falta un criterio.  ",
      }),
    ).toEqual({ ok: true, revision: 1 });
    const after = current(interpretation.id);
    expect(after.status).toBe("rejected");
    expect(after.requirements).toEqual(interpretation.requirements);
    expect(interpretations.history(interpretation.id).rejections).toMatchObject(
      [{ revision: 1, rejectedBy: "docente-2", reason: "Falta un criterio." }],
    );
    expect(count("generation_run")).toBe(runs);
    expect(sent).toHaveLength(1);
    // Rechazada no cuenta como validada, ni se puede validar tal cual.
    expect(validate(after)).toMatchObject({
      ok: false,
      reason: "not_in_review",
    });
  });

  test("sin motivo no se rechaza", async () => {
    const interpretation = await created();
    expect(
      interpretations.reject({ ...target(interpretation), reason: "   " }),
    ).toMatchObject({ ok: false, reason: "missing_reason" });
    expect(current(interpretation.id).status).toBe("in_review");
    expect(count("interpretation_rejection")).toBe(0);
  });

  test("vuelve a revisión al presentarla de nuevo o al corregirla", async () => {
    const interpretation = await created();
    interpretations.reject({ ...target(interpretation), reason: "Motivo" });
    expect(interpretations.resubmit(target(interpretation))).toEqual({
      ok: true,
      revision: 1,
    });
    expect(current(interpretation.id).status).toBe("in_review");
    expect(interpretations.resubmit(target(interpretation))).toMatchObject({
      ok: false,
      reason: "not_rejected",
    });

    interpretations.reject({ ...target(interpretation), reason: "Otro" });
    const [capability] = interpretation.requirements;
    interpretations.editRequirement({
      ...target(interpretation),
      requirementId: capability?.id ?? "",
      change: CHANGE,
    });
    expect(current(interpretation.id)).toMatchObject({
      status: "in_review",
      revision: 2,
    });
    expect(interpretations.history(interpretation.id).rejections).toHaveLength(
      2,
    );
  });

  test("rechazar una interpretación validada deja la validación sin vigencia", async () => {
    const interpretation = await created();
    validate(interpretation);
    interpretations.reject({ ...target(interpretation), reason: "Motivo" });
    expect(
      interpretations.history(interpretation.id).validations,
    ).toMatchObject([{ current: false }]);
  });
});

describe("documento con sustituto (FR-067)", () => {
  test("su interpretación queda como histórico: se consulta, pero no se corrige ni se valida", async () => {
    const interpretation = await created();
    superseded.add(DOCUMENT);
    const [capability] = interpretation.requirements;
    for (const result of [
      interpretations.editRequirement({
        ...target(interpretation),
        requirementId: capability?.id ?? "",
        change: CHANGE,
      }),
      validate(interpretation),
      interpretations.reject({ ...target(interpretation), reason: "Motivo" }),
    ]) {
      expect(result).toMatchObject({ ok: false, reason: "superseded" });
    }
    expect(current(interpretation.id)).toEqual(interpretation);
    expect(interpretations.history(interpretation.id).validations).toEqual([]);
  });
});

describe("lo que no existe", () => {
  test("no devuelve nada ni cambia nada", () => {
    expect(interpretations.get("f".repeat(32))).toBeUndefined();
    expect(interpretations.get("no-es-un-id")).toBeUndefined();
    expect(interpretations.listForDocument("x")).toEqual([]);
    expect(
      interpretations.validate({
        interpretationId: "f".repeat(32),
        revision: 1,
        inventoryReviewed: true,
        ...ACTOR,
      }),
    ).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("estimación previa (FR-021)", () => {
  const section = {
    documentId: DOCUMENT,
    unitCode: UNIT,
    pageFrom: 1,
    pageTo: 3,
  };

  test("devuelve la estimación y el coste máximo sin enviar ni reservar nada", () => {
    expect(interpretations.estimate(section)).toEqual({
      ok: true,
      cost: { estimatedCost: 0, maxCost: 0 },
    });
    expect(sent).toEqual([]);
    expect(generation.budget.list()).toEqual([]);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM generation_run").get()?.n,
    ).toBe(0);
  });

  test("aplica las mismas comprobaciones que la petición", () => {
    expect(interpretations.estimate({ ...section, unitCode: "ux 1" })).toEqual({
      ok: false,
      reason: "invalid_unit",
    });
    expect(interpretations.estimate({ ...section, pageTo: 9 })).toEqual({
      ok: false,
      reason: "invalid_pages",
    });
    expect(
      interpretations.estimate({ ...section, documentId: "f".repeat(32) }),
    ).toEqual({ ok: false, reason: "document_not_found" });
    superseded.add(DOCUMENT);
    expect(interpretations.estimate(section)).toEqual({
      ok: false,
      reason: "superseded",
    });
  });
});
