// Edición, aprobación y rechazo del índice (specs/002-boe-scorm-export: T046;
// FR-013 a FR-015, FR-059, FR-063, FR-065 y FR-070; SC-006, SC-026, SC-028,
// SC-029, SC-033 y SC-041). Control de revisión, cobertura exigida para
// aprobar, vigencia derivada y conservación de textos e historial.
import { beforeEach, describe, expect, test } from "vitest";
import { MAX_ENTRIES, MAX_TITLE_LENGTH } from "@/modules/didactic-content";
import type {
  ChangeResult,
  Outline,
  OutlineEntry,
} from "@/modules/didactic-content";
import {
  createOutlineFixture,
  OTHER_TEACHER,
  proposal,
  TEACHER,
} from "../../support/outline-fixture";
import type { OutlineFixture } from "../../support/outline-fixture";

let fixture: OutlineFixture;
let outlineId: string;

beforeEach(async () => {
  fixture = await createOutlineFixture();
  outlineId = await fixture.requestOutline();
});

function outline(): Outline {
  const current = fixture.outlines.get(outlineId);
  if (current === undefined) {
    throw new Error("El índice debía existir.");
  }
  return current;
}

function target(actor = TEACHER) {
  return { ...actor, outlineId, revision: outline().revision };
}

function entry(title: string): OutlineEntry {
  const found = outline().entries.find((item) => item.title === title);
  if (found === undefined) {
    throw new Error(`No hay ninguna entrada «${title}».`);
  }
  return found;
}

function ids(...codes: string[]): string[] {
  return codes.map((code) => fixture.requirement(code).id);
}

function titles(): string[] {
  return outline()
    .entries.filter((item) => !item.removed)
    .map((item) => item.title);
}

function pending(): string[] {
  return (
    fixture.outlines
      .review(outlineId)
      ?.coverage.pending.map((item) => item.code) ?? []
  );
}

function refused(result: ChangeResult): string {
  if (result.ok) {
    throw new Error("El cambio debía rechazarse.");
  }
  return result.reason;
}

function approve(): ChangeResult {
  return fixture.outlines.approve(target());
}

// Cada tipo de modificación del índice (SC-028).
const MODIFICATIONS: readonly (readonly [string, () => ChangeResult])[] = [
  [
    "reordenar",
    () =>
      fixture.outlines.moveEntry({
        ...target(),
        entryId: entry("Tema 2").id,
        direction: "up",
      }),
  ],
  [
    "renombrar",
    () =>
      fixture.outlines.editEntry({
        ...target(),
        entryId: entry("Tema 1").id,
        entry: {
          title: "Tema primero",
          requirementIds: entry("Tema 1").requirementIds,
        },
      }),
  ],
  [
    "añadir",
    () =>
      fixture.outlines.addEntry({
        ...target(),
        entry: { title: "Anexo", requirementIds: [] },
      }),
  ],
  [
    "quitar",
    () =>
      fixture.outlines.removeEntry({
        ...target(),
        entryId: entry("Presentación").id,
      }),
  ],
  [
    "cambiar los requisitos de una entrada",
    () =>
      fixture.outlines.editEntry({
        ...target(),
        entryId: entry("Tema 3").id,
        entry: { title: "Tema 3", requirementIds: ids("S2") },
      }),
  ],
];

describe("edición", () => {
  test("añadir una entrada apoyada en varios requisitos la pone al final y pasa el índice a revisión", () => {
    const result = fixture.outlines.addEntry({
      ...target(),
      entry: { title: "  Repaso  ", requirementIds: ids("C1", "K1", "S2") },
    });
    expect(result).toEqual({ ok: true, revision: 2 });
    expect(outline()).toMatchObject({ status: "in_review", revision: 2 });
    expect(titles()).toEqual([
      "Tema 1",
      "Tema 2",
      "Tema 3",
      "Presentación",
      "Repaso",
    ]);
    expect([...entry("Repaso").requirementIds].sort()).toEqual(
      ids("C1", "K1", "S2").sort(),
    );
    expect(entry("Repaso").unsupported).toBe(false);
  });

  test("una entrada sin requisitos queda marcada sin respaldo normativo, y deja de estarlo al vincularla", () => {
    fixture.outlines.addEntry({
      ...target(),
      entry: { title: "Anexo", requirementIds: [] },
    });
    expect(entry("Anexo")).toMatchObject({
      unsupported: true,
      requirementIds: [],
    });
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Anexo").id,
      entry: { title: "Anexo", requirementIds: ids("C1") },
    });
    expect(entry("Anexo")).toMatchObject({
      unsupported: false,
      requirementIds: ids("C1"),
    });
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Anexo").id,
      entry: { title: "Anexo", requirementIds: [] },
    });
    expect(entry("Anexo")).toMatchObject({
      unsupported: true,
      requirementIds: [],
    });
  });

  test("reordenar intercambia la entrada con su vecina y no sale de los extremos", () => {
    const move = (title: string, direction: "up" | "down") =>
      fixture.outlines.moveEntry({
        ...target(),
        entryId: entry(title).id,
        direction,
      });
    expect(move("Tema 3", "up").ok).toBe(true);
    expect(titles()).toEqual(["Tema 1", "Tema 3", "Tema 2", "Presentación"]);
    expect(move("Tema 3", "down").ok).toBe(true);
    expect(titles()).toEqual(["Tema 1", "Tema 2", "Tema 3", "Presentación"]);
    expect(refused(move("Tema 1", "up"))).toBe("cannot_move");
    expect(refused(move("Presentación", "down"))).toBe("cannot_move");
    expect(outline().revision).toBe(3);
  });

  test("quitar una entrada no la borra: queda marcada, con sus vínculos, y deja de cubrir", () => {
    const removed = entry("Tema 1");
    expect(
      fixture.outlines.removeEntry({ ...target(), entryId: removed.id }).ok,
    ).toBe(true);
    expect(titles()).toEqual(["Tema 2", "Tema 3", "Presentación"]);
    expect(entry("Tema 1")).toMatchObject({
      removed: true,
      requirementIds: removed.requirementIds,
    });
    expect(pending()).toEqual(["C1", "CE1.1"]);
    // Reordenar salta la entrada quitada.
    expect(
      refused(
        fixture.outlines.moveEntry({
          ...target(),
          entryId: entry("Tema 2").id,
          direction: "up",
        }),
      ),
    ).toBe("cannot_move");
  });

  test("la cobertura se recalcula con cada cambio de vínculos", () => {
    expect(pending()).toEqual([]);
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Tema 3").id,
      entry: { title: "Tema 3", requirementIds: ids("K1") },
    });
    expect(pending()).toEqual(["S2"]);
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Presentación").id,
      entry: { title: "Presentación", requirementIds: ids("S2") },
    });
    expect(pending()).toEqual([]);
  });

  test.each([
    ["título vacío", { title: "   ", requirementIds: [] }, "invalid"],
    [
      "título demasiado largo",
      { title: "a".repeat(MAX_TITLE_LENGTH + 1), requirementIds: [] },
      "invalid",
    ],
    [
      "título con un salto de línea",
      { title: "Uno\nDos", requirementIds: [] },
      "invalid",
    ],
    [
      "requisito que no existe",
      { title: "T", requirementIds: ["f".repeat(32)] },
      "unknown_requirement",
    ],
  ])("no guarda una entrada con %s", (_name, input, reason) => {
    expect(
      refused(fixture.outlines.addEntry({ ...target(), entry: input })),
    ).toBe(reason);
    expect(
      refused(
        fixture.outlines.editEntry({
          ...target(),
          entryId: entry("Tema 1").id,
          entry: input,
        }),
      ),
    ).toBe(reason);
    expect(outline()).toMatchObject({ status: "proposed", revision: 1 });
  });

  test("no admite un requisito repetido ni uno retirado del inventario", () => {
    const [capability] = ids("C1");
    expect(
      refused(
        fixture.outlines.addEntry({
          ...target(),
          entry: {
            title: "T",
            requirementIds: [capability ?? "", capability ?? ""],
          },
        }),
      ),
    ).toBe("unknown_requirement");
    const withdrawn = fixture.requirement("S2").id;
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    fixture.interpretations.withdrawRequirement({
      ...TEACHER,
      interpretationId: fixture.interpretationId,
      revision: interpretation?.revision ?? 0,
      requirementId: withdrawn,
    });
    expect(
      refused(
        fixture.outlines.addEntry({
          ...target(),
          entry: { title: "T", requirementIds: [withdrawn] },
        }),
      ),
    ).toBe("unknown_requirement");
  });

  test("guardar sin cambiar nada no crea una versión nueva", () => {
    const current = entry("Tema 1");
    expect(
      refused(
        fixture.outlines.editEntry({
          ...target(),
          entryId: current.id,
          entry: {
            title: current.title,
            requirementIds: [...current.requirementIds].reverse(),
          },
        }),
      ),
    ).toBe("unchanged");
    expect(outline().revision).toBe(1);
  });

  test("una entrada quitada o inexistente no se edita, mueve ni quita", () => {
    const removed = entry("Tema 1").id;
    fixture.outlines.removeEntry({ ...target(), entryId: removed });
    const attempts = (entryId: string) => [
      fixture.outlines.editEntry({
        ...target(),
        entryId,
        entry: { title: "X", requirementIds: [] },
      }),
      fixture.outlines.moveEntry({ ...target(), entryId, direction: "down" }),
      fixture.outlines.removeEntry({ ...target(), entryId }),
    ];
    expect(attempts(removed).map(refused)).toEqual([
      "removed",
      "removed",
      "removed",
    ]);
    expect(attempts("f".repeat(32)).map(refused)).toEqual([
      "not_found",
      "not_found",
      "not_found",
    ]);
  });

  test("el índice no supera el máximo de entradas", () => {
    for (let count = titles().length; count < MAX_ENTRIES; count += 1) {
      fixture.outlines.addEntry({
        ...target(),
        entry: { title: `Entrada ${String(count)}`, requirementIds: [] },
      });
    }
    expect(titles()).toHaveLength(MAX_ENTRIES);
    expect(
      refused(
        fixture.outlines.addEntry({
          ...target(),
          entry: { title: "Una más", requirementIds: [] },
        }),
      ),
    ).toBe("too_many_entries");
  });

  test("cada cambio queda registrado con su autor, el antes, el después y la versión a la que da lugar", () => {
    for (const [, modify] of MODIFICATIONS) {
      expect(modify().ok).toBe(true);
    }
    const { changes } = fixture.outlines.review(outlineId)?.history ?? {
      changes: [],
    };
    expect(
      changes.map((change) => [change.kind, change.resultingRevision]),
    ).toEqual([
      ["move", 2],
      ["edit", 3],
      ["add", 4],
      ["remove", 5],
      ["edit", 6],
    ]);
    expect(changes.every((change) => change.author === TEACHER.actorId)).toBe(
      true,
    );
    expect(JSON.parse(changes[1]?.before ?? "{}")).toMatchObject({
      title: "Tema 1",
    });
    expect(JSON.parse(changes[1]?.after ?? "{}")).toMatchObject({
      title: "Tema primero",
    });
    expect(JSON.parse(changes[3]?.after ?? "{}")).toMatchObject({
      removed: true,
    });
    expect(
      fixture.audit
        .list()
        .filter((event) => event.action === "outline.edit")
        .map((event) => event.result),
    ).toEqual(["ok", "ok", "ok", "ok", "ok"]);
  });
});

describe("control de versiones", () => {
  test("con una revisión que ya no es la actual no se guarda ningún cambio ni ninguna decisión", () => {
    const stale = target();
    fixture.outlines.addEntry({
      ...target(OTHER_TEACHER),
      entry: { title: "De otra sesión", requirementIds: [] },
    });
    const before = outline();
    const attempts: ChangeResult[] = [
      fixture.outlines.addEntry({
        ...stale,
        entry: { title: "Mía", requirementIds: [] },
      }),
      fixture.outlines.editEntry({
        ...stale,
        entryId: entry("Tema 1").id,
        entry: { title: "Mía", requirementIds: [] },
      }),
      fixture.outlines.moveEntry({
        ...stale,
        entryId: entry("Tema 1").id,
        direction: "down",
      }),
      fixture.outlines.removeEntry({ ...stale, entryId: entry("Tema 1").id }),
      fixture.outlines.approve(stale),
      fixture.outlines.reject({ ...stale, reason: "No." }),
      fixture.outlines.resubmit(stale),
    ];
    expect(attempts.map(refused)).toEqual(Array(7).fill("conflict"));
    // Lo de la otra sesión se conserva tal cual: nada se fusiona.
    expect(outline()).toEqual(before);
    expect(titles()).toContain("De otra sesión");
    expect(fixture.outlines.review(outlineId)?.history).toMatchObject({
      approvals: [],
      rejections: [],
    });
    expect(
      fixture.audit
        .list()
        .filter((event) => event.details.reason === "conflict"),
    ).toHaveLength(7);
  });

  test("tras revisar la versión más reciente, el mismo cambio se guarda de forma explícita contra ella", () => {
    const stale = target();
    fixture.outlines.addEntry({
      ...target(OTHER_TEACHER),
      entry: { title: "De otra sesión", requirementIds: [] },
    });
    const mine = { title: "Mía", requirementIds: ids("C1") };
    expect(refused(fixture.outlines.addEntry({ ...stale, entry: mine }))).toBe(
      "conflict",
    );
    expect(fixture.outlines.addEntry({ ...target(), entry: mine })).toEqual({
      ok: true,
      revision: 3,
    });
    expect(titles().slice(-2)).toEqual(["De otra sesión", "Mía"]);
  });

  test("un índice que no existe", () => {
    expect(
      refused(
        fixture.outlines.approve({
          ...TEACHER,
          outlineId: "f".repeat(32),
          revision: 1,
        }),
      ),
    ).toBe("not_found");
  });
});

describe("aprobación", () => {
  test("registra quién, cuándo, la versión aprobada y la validación en la que se apoya", () => {
    expect(approve()).toEqual({ ok: true, revision: 1 });
    const review = fixture.outlines.review(outlineId);
    expect(review?.outline.status).toBe("approved");
    expect(review?.history.approvals).toMatchObject([
      {
        revision: 1,
        approvedBy: TEACHER.actorId,
        interpretationValidationId: fixture.interpretations.currentValidation(
          fixture.interpretationId,
        )?.id,
        current: true,
      },
    ]);
    expect(review?.approval?.approvedAt).toBeGreaterThan(0);
    expect(
      fixture.audit
        .list()
        .filter((event) => event.action === "outline.approve"),
    ).toMatchObject([
      { actorId: TEACHER.actorId, result: "ok", details: { revision: 1 } },
    ]);
  });

  test("con un requisito sin cubrir se impide y se devuelven los pendientes con su referencia normativa", () => {
    fixture.outlines.removeEntry({
      ...target(),
      entryId: entry("Tema 2").id,
    });
    fixture.outlines.removeEntry({
      ...target(),
      entryId: entry("Tema 3").id,
    });
    const result = approve();
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toBe("incomplete_coverage");
    expect(
      result.pending.map((item) => [item.code, item.section, item.pageFrom]),
    ).toEqual([
      ["K1", "Sección sintética", 2],
      ["S1", "Sección sintética", 2],
      ["S2", "Sección sintética", 2],
    ]);
    expect(outline().status).toBe("in_review");
    expect(fixture.outlines.review(outlineId)?.history.approvals).toEqual([]);
    expect(
      fixture.audit
        .list()
        .filter((event) => event.action === "outline.approve")
        .at(-1),
    ).toMatchObject({
      result: "failed",
      details: { reason: "incomplete_coverage", pending: 3 },
    });
  });

  test("las entradas sin respaldo normativo no compensan un requisito sin cubrir", () => {
    fixture.outlines.removeEntry({
      ...target(),
      entryId: entry("Tema 1").id,
    });
    for (const title of ["Extra 1", "Extra 2", "Extra 3"]) {
      fixture.outlines.addEntry({
        ...target(),
        entry: { title, requirementIds: [] },
      });
    }
    expect(refused(approve())).toBe("incomplete_coverage");
    expect(pending()).toEqual(["C1", "CE1.1"]);
  });

  test("cubrir solo el padre o solo los hijos no basta", () => {
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Tema 1").id,
      entry: { title: "Tema 1", requirementIds: ids("C1") },
    });
    expect(refused(approve())).toBe("incomplete_coverage");
    expect(pending()).toEqual(["CE1.1"]);
    fixture.outlines.editEntry({
      ...target(),
      entryId: entry("Tema 1").id,
      entry: { title: "Tema 1", requirementIds: ids("CE1.1") },
    });
    expect(refused(approve())).toBe("incomplete_coverage");
    expect(pending()).toEqual(["C1"]);
  });

  test("ninguna operación del índice admite aprobar pese a una cobertura incompleta (SC-026)", () => {
    fixture.outlines.removeEntry({
      ...target(),
      entryId: entry("Tema 1").id,
    });
    // Ni con campos de más en la petición, ni con otra cuenta.
    const forced = {
      ...target(OTHER_TEACHER),
      force: true,
      override: "yes",
      skipCoverage: true,
    };
    expect(refused(fixture.outlines.approve(forced))).toBe(
      "incomplete_coverage",
    );
    expect(Object.keys(fixture.outlines).sort()).toEqual([
      "addEntry",
      "approve",
      "checkReference",
      "editEntry",
      "estimate",
      "get",
      "getForInterpretation",
      "moveEntry",
      "reject",
      "removeEntry",
      "request",
      "resubmit",
      "review",
    ]);
    // Tampoco escribiendo el estado: sin el registro de aprobación no hay
    // aprobación vigente.
    fixture.db
      .prepare("UPDATE outline SET status = 'approved' WHERE id = ?")
      .run(outlineId);
    expect(fixture.outlines.review(outlineId)?.approval).toBeUndefined();
  });

  test("exige que la interpretación siga validada y vigente", () => {
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    fixture.interpretations.reject({
      ...TEACHER,
      interpretationId: fixture.interpretationId,
      revision: interpretation?.revision ?? 0,
      reason: "Hay que revisarla.",
    });
    expect(refused(approve())).toBe("interpretation_not_validated");
    expect(outline().status).toBe("proposed");
  });

  test("un índice con aprobación vigente o rechazado no se aprueba otra vez", () => {
    approve();
    expect(refused(approve())).toBe("not_reviewable");
    fixture.outlines.reject({ ...target(), reason: "No." });
    expect(refused(approve())).toBe("not_reviewable");
    expect(fixture.outlines.review(outlineId)?.history.approvals).toHaveLength(
      1,
    );
  });
});

describe("modificación de un índice aprobado", () => {
  test.each(MODIFICATIONS)(
    "%s lo devuelve a revisión y deja sin vigencia su aprobación, que permanece en el registro (SC-028)",
    (_name, modify) => {
      approve();
      const before = outline();
      expect(modify().ok).toBe(true);
      const review = fixture.outlines.review(outlineId);
      expect(review?.outline).toMatchObject({
        status: "in_review",
        revision: 2,
      });
      expect(review?.approval).toBeUndefined();
      expect(review?.history.approvals).toMatchObject([
        { revision: 1, current: false },
      ]);
      // Nada se borra ni se vuelve a generar: siguen las mismas entradas.
      expect(review?.outline.entries.map((item) => item.id)).toEqual(
        expect.arrayContaining(before.entries.map((item) => item.id)),
      );
      expect(fixture.sent).toHaveLength(1);
    },
  );

  test("un cambio que no altera la cobertura la invalida igualmente, y hay que aprobar la versión nueva", () => {
    approve();
    MODIFICATIONS[0]?.[1]();
    expect(pending()).toEqual([]);
    expect(fixture.outlines.review(outlineId)?.approval).toBeUndefined();
    expect(approve()).toEqual({ ok: true, revision: 2 });
    expect(
      fixture.outlines
        .review(outlineId)
        ?.history.approvals.map((item) => [item.revision, item.current]),
    ).toEqual([
      [1, false],
      [2, true],
    ]);
  });
});

describe("cambios en la interpretación", () => {
  function correct(): void {
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    const result = fixture.interpretations.addRequirement({
      ...TEACHER,
      interpretationId: fixture.interpretationId,
      revision: interpretation?.revision ?? 0,
      requirement: {
        kind: "content",
        parentId: null,
        code: "K2",
        text: "Contenido nuevo",
        section: "Sección sintética",
        pageFrom: 2,
        pageTo: 2,
        quote: null,
      },
    });
    if (!result.ok) {
      throw new Error("La corrección debía guardarse.");
    }
  }

  test("corregirla deja sin vigencia la aprobación del índice sin cambiar el índice (SC-029)", () => {
    approve();
    const before = outline();
    correct();
    const review = fixture.outlines.review(outlineId);
    expect(review?.outline).toEqual(before);
    expect(review?.interpretationValid).toBe(false);
    expect(review?.approval).toBeUndefined();
    expect(review?.history.approvals).toMatchObject([{ current: false }]);
    // El requisito nuevo aparece sin cubrir: no hay cobertura heredada.
    expect(pending()).toEqual(["K2"]);
  });

  test("revalidarla no devuelve la vigencia: la aprobación se apoyaba en la validación anterior", () => {
    approve();
    correct();
    fixture.validate();
    const review = fixture.outlines.review(outlineId);
    expect(review?.interpretationValid).toBe(true);
    expect(review?.approval).toBeUndefined();
    // Y no puede aprobarse hasta cubrir el requisito nuevo.
    expect(refused(approve())).toBe("incomplete_coverage");
    fixture.outlines.addEntry({
      ...target(),
      entry: { title: "Tema 4", requirementIds: ids("K2") },
    });
    expect(approve().ok).toBe(true);
    expect(
      fixture.outlines
        .review(outlineId)
        ?.history.approvals.map((item) => item.current),
    ).toEqual([false, true]);
  });

  test("retirar un requisito deja su vínculo sin efecto y no rompe el índice", () => {
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    fixture.interpretations.withdrawRequirement({
      ...TEACHER,
      interpretationId: fixture.interpretationId,
      revision: interpretation?.revision ?? 0,
      requirementId: fixture.requirement("S2").id,
    });
    const review = fixture.outlines.review(outlineId);
    expect(review?.coverage.items.map((item) => item.requirement.code)).toEqual(
      ["C1", "CE1.1", "K1", "S1"],
    );
    expect(review?.coverage.complete).toBe(true);
    expect(entry("Tema 3").requirementIds).toHaveLength(2);
  });

  test("si el documento tiene un sustituto, el índice se conserva sin poder cambiarse, su aprobación deja de estar vigente y no se aprueba sin comprobar sus referencias", () => {
    approve();
    fixture.supersede();
    const review = fixture.outlines.review(outlineId);
    expect(review?.historical).toBe(true);
    expect(review?.approval).toBeUndefined();
    const attempts: ChangeResult[] = [
      fixture.outlines.addEntry({
        ...target(),
        entry: { title: "X", requirementIds: [] },
      }),
      fixture.outlines.removeEntry({
        ...target(),
        entryId: entry("Tema 1").id,
      }),
      fixture.outlines.reject({ ...target(), reason: "No." }),
    ];
    expect(attempts.map(refused)).toEqual(Array(3).fill("superseded"));
    // Aprobar depende de las referencias heredadas: reference-check.test.ts.
    expect(refused(fixture.outlines.approve(target()))).toBe(
      "unchecked_references",
    );
    expect(outline().revision).toBe(1);
  });
});

describe("rechazo", () => {
  test("exige un motivo y, sin él, no cambia nada", () => {
    for (const reason of ["", "   ", "a".repeat(1001)]) {
      expect(refused(fixture.outlines.reject({ ...target(), reason }))).toBe(
        "missing_reason",
      );
    }
    expect(outline().status).toBe("proposed");
  });

  test("conserva el contenido, registra quién, cuándo y por qué, y no inicia ninguna generación (SC-041)", () => {
    const before = outline();
    expect(
      fixture.outlines.reject({ ...target(), reason: "  Falta un tema.  " }),
    ).toEqual({ ok: true, revision: 1 });
    const review = fixture.outlines.review(outlineId);
    expect(review?.outline).toEqual({ ...before, status: "rejected" });
    expect(review?.history.rejections).toMatchObject([
      { revision: 1, rejectedBy: TEACHER.actorId, reason: "Falta un tema." },
    ]);
    expect(review?.history.rejections[0]?.rejectedAt).toBeGreaterThan(0);
    expect(fixture.sent).toHaveLength(1);
    expect(
      fixture.db.prepare("SELECT COUNT(*) AS n FROM generation_run").get()?.n,
    ).toBe(2);
  });

  test("un índice rechazado no cuenta como aprobado, y rechazar uno aprobado deja sin vigencia su aprobación", () => {
    approve();
    fixture.outlines.reject({ ...target(), reason: "Me lo he pensado." });
    const review = fixture.outlines.review(outlineId);
    expect(review?.approval).toBeUndefined();
    expect(review?.history.approvals).toMatchObject([{ current: false }]);
    expect(
      refused(fixture.outlines.reject({ ...target(), reason: "Otra." })),
    ).toBe("not_reviewable");
  });

  test("vuelve a revisión al presentarlo de nuevo o al editarlo, y entonces puede aprobarse", () => {
    expect(refused(fixture.outlines.resubmit(target()))).toBe("not_rejected");
    fixture.outlines.reject({ ...target(), reason: "Falta un tema." });
    expect(fixture.outlines.resubmit(target())).toEqual({
      ok: true,
      revision: 1,
    });
    expect(outline().status).toBe("in_review");

    fixture.outlines.reject({ ...target(), reason: "Sigue faltando." });
    fixture.outlines.addEntry({
      ...target(),
      entry: { title: "El que faltaba", requirementIds: ids("C1") },
    });
    expect(outline()).toMatchObject({ status: "in_review", revision: 2 });
    expect(approve().ok).toBe(true);
    expect(fixture.outlines.review(outlineId)?.history.rejections).toHaveLength(
      2,
    );
  });
});

describe("la propuesta de partida", () => {
  test("puede aprobarse sin editarla si su cobertura es completa, y nunca de forma automática", async () => {
    expect(outline().status).toBe("proposed");
    expect(fixture.outlines.review(outlineId)?.approval).toBeUndefined();
    expect(approve().ok).toBe(true);
    // Otra propuesta, incompleta, en otra instalación: queda sin aprobar.
    const other = await createOutlineFixture();
    const otherId = await other.requestOutline(
      proposal({
        entries: [
          { title: "Solo uno", unsupported: false, requirementRefs: ["r1"] },
        ],
      }),
    );
    expect(other.outlines.review(otherId)?.history.approvals).toEqual([]);
  });
});
