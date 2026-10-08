// Edición, aprobación y rechazo de un tema (specs/002-boe-scorm-export: T054;
// FR-017, FR-018, FR-022, FR-024, FR-059, FR-063 y FR-070; SC-028, SC-033 y
// SC-041). Control de revisión, índice aprobado y vigente, vigencia derivada
// y conservación de los textos.
import { beforeEach, describe, expect, test } from "vitest";
import { MAX_BLOCKS } from "@/modules/didactic-content";
import type { TopicResult } from "@/modules/didactic-content";
import {
  createOutlineFixture,
  OTHER_TEACHER,
  TEACHER,
} from "../../support/outline-fixture";
import type { OutlineFixture } from "../../support/outline-fixture";
import { refused, syllabusHelpers } from "../../support/syllabus-helpers";
import type { SyllabusHelpers } from "../../support/syllabus-helpers";

let fixture: OutlineFixture;
let outlineId: string;
let h: SyllabusHelpers;

beforeEach(async () => {
  fixture = await createOutlineFixture();
  outlineId = await fixture.approvedOutline();
  await fixture.syllabus.generate({ ...TEACHER, outlineId });
  h = syllabusHelpers(fixture, outlineId);
  fixture.sent.length = 0;
});

function ids(...codes: string[]): string[] {
  return codes.map((code) => fixture.requirement(code).id);
}

function development(title = "Tema 1") {
  const block = h
    .topic(title)
    .blocks.find((item) => item.kind === "development" && !item.removed);
  if (block === undefined) {
    throw new Error("El tema debía tener un bloque de desarrollo.");
  }
  return block;
}

// Cada tipo de modificación de un tema.
const MODIFICATIONS: readonly (readonly [string, () => TopicResult])[] = [
  [
    "editar el texto de un bloque",
    () =>
      fixture.syllabus.editBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
        block: {
          text: "# Título nuevo\n\nTexto nuevo.",
          requirementIds: development().requirementIds,
        },
      }),
  ],
  [
    "cambiar los requisitos de un bloque",
    () =>
      fixture.syllabus.editBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
        block: { text: "Texto de desarrollo.", requirementIds: ids("C1") },
      }),
  ],
  [
    "añadir un bloque de desarrollo",
    () =>
      fixture.syllabus.addDevelopmentBlock({
        ...h.target("Tema 1"),
        block: { text: "Otro desarrollo.", requirementIds: [] },
      }),
  ],
  [
    "reordenar un bloque",
    () =>
      fixture.syllabus.moveBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
        direction: "up",
      }),
  ],
  [
    "quitar un bloque",
    () =>
      fixture.syllabus.removeBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
      }),
  ],
];

describe("lo que muestra un tema", () => {
  test("separa los bloques de requisito de los de desarrollo, y cada desarrollo declara qué requisitos trabaja", () => {
    const review = h.topicReview("Tema 1");
    expect(review.entry.title).toBe("Tema 1");
    expect(review.requirements.map((item) => item.code)).toEqual([
      "C1",
      "CE1.1",
    ]);
    expect(review.topic.blocks.map((block) => block.kind)).toEqual([
      "requirement",
      "requirement",
      "development",
    ]);
    expect([...development().requirementIds].sort()).toEqual(
      ids("C1", "CE1.1").sort(),
    );
    expect(review.approval).toBeUndefined();
    expect(review.history.changes.map((change) => change.kind)).toEqual([
      "generate",
    ]);
  });
});

describe("edición", () => {
  test("el texto editado se guarda como contenido estructurado, no como marcado", () => {
    const hostile = '<script>alert("x")</script>';
    expect(
      fixture.syllabus.editBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
        block: {
          text: `# Título\n\n${hostile}\n\n- uno\n- dos`,
          requirementIds: ids("C1"),
        },
      }),
    ).toEqual({ ok: true, revision: 3 });
    expect(development().content).toEqual([
      { type: "heading", text: "Título" },
      { type: "paragraph", text: hostile },
      { type: "list", items: ["uno", "dos"] },
    ]);
    expect(development().requirementIds).toEqual(ids("C1"));
    expect(h.topic("Tema 1")).toMatchObject({
      status: "in_review",
      revision: 3,
    });
  });

  test("un desarrollo sin requisitos queda sin respaldo normativo", () => {
    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 1"),
      block: { text: "Texto libre.", requirementIds: [] },
    });
    expect(h.topic("Tema 1").blocks.at(-1)).toMatchObject({
      kind: "development",
      requirementIds: [],
    });
  });

  test.each([
    ["texto vacío", { text: "   ", requirementIds: [] }, "invalid"],
    [
      "párrafo demasiado largo",
      { text: "a".repeat(4001), requirementIds: [] },
      "invalid",
    ],
    [
      "requisito que no es de la entrada",
      { text: "Texto.", requirementIds: ["K1"] },
      "unknown_requirement",
    ],
    [
      "requisito repetido",
      { text: "Texto.", requirementIds: ["C1", "C1"] },
      "unknown_requirement",
    ],
  ])("no guarda un bloque con %s", (_name, block, reason) => {
    const input = {
      text: block.text,
      requirementIds: ids(...block.requirementIds),
    };
    expect(
      refused(
        fixture.syllabus.addDevelopmentBlock({
          ...h.target("Tema 1"),
          block: input,
        }),
      ),
    ).toBe(reason);
    expect(
      refused(
        fixture.syllabus.editBlock({
          ...h.target("Tema 1"),
          blockId: development().id,
          block: input,
        }),
      ),
    ).toBe(reason);
    expect(h.topic("Tema 1")).toMatchObject({ status: "draft", revision: 2 });
  });

  test("un bloque de requisito cita la norma: no se edita su texto, y un requisito no se cita dos veces", () => {
    const citation = h
      .topic("Tema 1")
      .blocks.find((block) => block.kind === "requirement");
    expect(
      refused(
        fixture.syllabus.editBlock({
          ...h.target("Tema 1"),
          blockId: citation?.id ?? "",
          block: { text: "Otro texto.", requirementIds: [] },
        }),
      ),
    ).toBe("invalid");
    const [capability, other] = ids("C1", "K1");
    expect(
      refused(
        fixture.syllabus.addRequirementBlock({
          ...h.target("Tema 1"),
          requirementId: capability ?? "",
        }),
      ),
    ).toBe("already_cited");
    expect(
      refused(
        fixture.syllabus.addRequirementBlock({
          ...h.target("Tema 1"),
          requirementId: other ?? "",
        }),
      ),
    ).toBe("unknown_requirement");
    // Tras quitar la cita, se puede añadir de nuevo.
    fixture.syllabus.removeBlock({
      ...h.target("Tema 1"),
      blockId: citation?.id ?? "",
    });
    expect(
      fixture.syllabus.addRequirementBlock({
        ...h.target("Tema 1"),
        requirementId: capability ?? "",
      }).ok,
    ).toBe(true);
  });

  test("quitar un bloque no lo borra: queda marcado, con su contenido", () => {
    const block = development();
    fixture.syllabus.removeBlock({
      ...h.target("Tema 1"),
      blockId: block.id,
    });
    expect(
      h.topic("Tema 1").blocks.find((item) => item.id === block.id),
    ).toEqual({ ...block, removed: true });
    const attempts = [
      fixture.syllabus.editBlock({
        ...h.target("Tema 1"),
        blockId: block.id,
        block: { text: "X", requirementIds: [] },
      }),
      fixture.syllabus.moveBlock({
        ...h.target("Tema 1"),
        blockId: block.id,
        direction: "up",
      }),
      fixture.syllabus.removeBlock({
        ...h.target("Tema 1"),
        blockId: block.id,
      }),
    ];
    expect(attempts.map(refused)).toEqual(["removed", "removed", "removed"]);
  });

  test("guardar sin cambiar nada no crea una versión nueva, y no se mueve más allá de los extremos", () => {
    const block = development();
    expect(
      refused(
        fixture.syllabus.editBlock({
          ...h.target("Tema 1"),
          blockId: block.id,
          block: {
            text: "# Desarrollo de Tema 1\n\nTexto de desarrollo.\n\n- Primera idea\n- Segunda idea",
            requirementIds: [...block.requirementIds].reverse(),
          },
        }),
      ),
    ).toBe("unchanged");
    expect(
      refused(
        fixture.syllabus.moveBlock({
          ...h.target("Tema 1"),
          blockId: block.id,
          direction: "down",
        }),
      ),
    ).toBe("cannot_move");
    expect(h.topic("Tema 1").revision).toBe(2);
  });

  test("el tema no supera el máximo de bloques", () => {
    for (let count = 3; count < MAX_BLOCKS; count += 1) {
      fixture.syllabus.addDevelopmentBlock({
        ...h.target("Tema 1"),
        block: { text: `Bloque ${String(count)}`, requirementIds: [] },
      });
    }
    expect(
      refused(
        fixture.syllabus.addDevelopmentBlock({
          ...h.target("Tema 1"),
          block: { text: "Uno más", requirementIds: [] },
        }),
      ),
    ).toBe("too_many_blocks");
  });

  test("cada cambio queda registrado con su autor, el antes y el después", () => {
    for (const [, modify] of MODIFICATIONS.slice(0, 3)) {
      expect(modify().ok).toBe(true);
    }
    const { changes } = h.topicReview("Tema 1").history;
    expect(
      changes.map((change) => [change.kind, change.resultingRevision]),
    ).toEqual([
      ["generate", 2],
      ["edit", 3],
      ["edit", 4],
      ["add", 5],
    ]);
    expect(JSON.parse(changes[1]?.before ?? "{}")).toMatchObject({
      content: [{ type: "heading", text: "Desarrollo de Tema 1" }, {}, {}],
    });
    expect(JSON.parse(changes[1]?.after ?? "{}")).toMatchObject({
      content: [{ type: "heading", text: "Título nuevo" }, {}],
    });
  });
});

describe("control de versiones (SC-033)", () => {
  test("con una revisión que ya no es la actual no se guarda ningún cambio ni ninguna decisión", () => {
    const stale = h.target("Tema 1");
    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 1", OTHER_TEACHER),
      block: { text: "De otra sesión.", requirementIds: [] },
    });
    const before = h.topic("Tema 1");
    const attempts: TopicResult[] = [
      fixture.syllabus.addDevelopmentBlock({
        ...stale,
        block: { text: "Mío.", requirementIds: [] },
      }),
      fixture.syllabus.editBlock({
        ...stale,
        blockId: development().id,
        block: { text: "Mío.", requirementIds: [] },
      }),
      fixture.syllabus.moveBlock({
        ...stale,
        blockId: development().id,
        direction: "up",
      }),
      fixture.syllabus.removeBlock({ ...stale, blockId: development().id }),
      fixture.syllabus.approveTopic(stale),
      fixture.syllabus.rejectTopic({ ...stale, reason: "No." }),
      fixture.syllabus.resubmitTopic(stale),
    ];
    expect(attempts.map(refused)).toEqual(Array(7).fill("conflict"));
    // Lo de la otra sesión se conserva tal cual: nada se fusiona.
    expect(h.topic("Tema 1")).toEqual(before);
    expect(h.topicReview("Tema 1").history).toMatchObject({
      approvals: [],
      rejections: [],
    });
  });

  test("tras revisar la versión más reciente, el mismo cambio se guarda de forma explícita contra ella", () => {
    const stale = h.target("Tema 1");
    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 1", OTHER_TEACHER),
      block: { text: "De otra sesión.", requirementIds: [] },
    });
    const mine = { text: "Mío.", requirementIds: [] };
    expect(
      refused(fixture.syllabus.addDevelopmentBlock({ ...stale, block: mine })),
    ).toBe("conflict");
    expect(
      fixture.syllabus.addDevelopmentBlock({
        ...h.target("Tema 1"),
        block: mine,
      }).ok,
    ).toBe(true);
    expect(
      h
        .topic("Tema 1")
        .blocks.slice(-2)
        .map((block) => block.content[0]),
    ).toEqual([
      { type: "paragraph", text: "De otra sesión." },
      { type: "paragraph", text: "Mío." },
    ]);
  });
});

describe("aprobación de un tema", () => {
  test("registra quién, cuándo, la versión y la aprobación del índice en la que se apoya", () => {
    expect(h.approveTopic("Tema 1")).toEqual({ ok: true, revision: 2 });
    const review = h.topicReview("Tema 1");
    expect(review.topic.status).toBe("approved");
    expect(review.approval).toMatchObject({
      revision: 2,
      approvedBy: TEACHER.actorId,
      outlineApprovalId: review.outline.approval?.id,
      current: true,
    });
    expect(review.approval?.approvedAt).toBeGreaterThan(0);
    expect(refused(h.approveTopic("Tema 1"))).toBe("not_reviewable");
  });

  test("exige el índice aprobado y vigente", () => {
    const entry = h.review().topics[3]?.entry;
    fixture.outlines.editEntry({
      ...TEACHER,
      outlineId,
      revision: 1,
      entryId: entry?.id ?? "",
      entry: { title: "Bienvenida", requirementIds: [] },
    });
    expect(refused(h.approveTopic("Tema 1"))).toBe("outline_not_approved");
    expect(h.topic("Tema 1").status).toBe("draft");
  });

  test("un tema sin ningún bloque no se aprueba", () => {
    for (const block of h.topic("Presentación").blocks) {
      fixture.syllabus.removeBlock({
        ...h.target("Presentación"),
        blockId: block.id,
      });
    }
    expect(refused(h.approveTopic("Presentación"))).toBe("empty");
  });

  test.each(MODIFICATIONS)(
    "%s en un tema aprobado lo devuelve a revisión y deja sin vigencia su aprobación, que permanece (FR-024)",
    (_name, modify) => {
      h.approveTopic("Tema 1");
      h.approveTopic("Tema 2");
      const blocks = h.topic("Tema 1").blocks.map((block) => block.id);
      expect(modify().ok).toBe(true);
      const review = h.topicReview("Tema 1");
      expect(review.topic).toMatchObject({ status: "in_review", revision: 3 });
      expect(review.approval).toBeUndefined();
      expect(review.history.approvals).toMatchObject([
        { revision: 2, current: false },
      ]);
      expect(review.topic.blocks.map((block) => block.id)).toEqual(
        expect.arrayContaining(blocks),
      );
      // El otro tema conserva su aprobación.
      expect(h.topicReview("Tema 2").approval?.current).toBe(true);
      expect(fixture.sent).toEqual([]);
    },
  );
});

describe("invalidación por el índice (SC-028)", () => {
  const OUTLINE_EDITS: readonly (readonly [string, () => unknown])[] = [
    [
      "reordenar",
      () =>
        fixture.outlines.moveEntry({
          ...TEACHER,
          outlineId,
          revision: 1,
          entryId: h.review().topics[0]?.entry.id ?? "",
          direction: "down",
        }),
    ],
    [
      "renombrar",
      () =>
        fixture.outlines.editEntry({
          ...TEACHER,
          outlineId,
          revision: 1,
          entryId: h.review().topics[3]?.entry.id ?? "",
          entry: { title: "Bienvenida", requirementIds: [] },
        }),
    ],
    [
      "añadir",
      () =>
        fixture.outlines.addEntry({
          ...TEACHER,
          outlineId,
          revision: 1,
          entry: { title: "Anexo", requirementIds: [] },
        }),
    ],
    [
      "quitar",
      () =>
        fixture.outlines.removeEntry({
          ...TEACHER,
          outlineId,
          revision: 1,
          entryId: h.review().topics[3]?.entry.id ?? "",
        }),
    ],
    [
      "cambiar los requisitos de una entrada",
      () =>
        fixture.outlines.editEntry({
          ...TEACHER,
          outlineId,
          revision: 1,
          entryId: h.review().topics[3]?.entry.id ?? "",
          entry: { title: "Presentación", requirementIds: ids("C1") },
        }),
    ],
  ];

  test.each(OUTLINE_EDITS)(
    "%s en el índice deja sin vigencia todas las aprobaciones de temas y la de la versión, sin borrar ni regenerar nada",
    (_name, edit) => {
      h.approveAllTopics();
      const version = h.approveVersion();
      expect(version.ok).toBe(true);
      const before = h.review().topics.map((item) => item.topic);
      edit();
      const after = h.review();
      expect(after.outline.approval).toBeUndefined();
      expect(after.topics.every((item) => !item.approved)).toBe(true);
      expect(after.versions).toMatchObject([{ label: "v1", current: false }]);
      // Los textos y los estados guardados no cambian, tampoco los del
      // tema de una entrada quitada.
      for (const topic of before) {
        expect(fixture.syllabus.getTopic(topic?.id ?? "")).toEqual(topic);
      }
      expect(fixture.sent).toEqual([]);
      expect(
        fixture.db.prepare("SELECT COUNT(*) AS n FROM topic_approval").get()?.n,
      ).toBe(4);
      // Volver a aprobar el índice no devuelve la vigencia a los temas.
      fixture.outlines.approve({ ...TEACHER, outlineId, revision: 2 });
      expect(h.review().topics.every((item) => !item.approved)).toBe(true);
      expect(h.review().versions[0]?.current).toBe(false);
      // Un tema con la aprobación sin vigencia puede volver a aprobarse.
      expect(h.approveTopic("Tema 1").ok).toBe(true);
      expect(
        h
          .topicReview("Tema 1")
          .history.approvals.map((approval) => approval.current),
      ).toEqual([false, true]);
    },
  );
});

describe("rechazo de un tema (SC-041)", () => {
  test("exige un motivo, conserva el contenido y no inicia ninguna generación", () => {
    for (const reason of ["", "   ", "a".repeat(1001)]) {
      expect(
        refused(
          fixture.syllabus.rejectTopic({ ...h.target("Tema 1"), reason }),
        ),
      ).toBe("missing_reason");
    }
    const before = h.topic("Tema 1");
    expect(
      fixture.syllabus.rejectTopic({
        ...h.target("Tema 1"),
        reason: "  Falta un ejemplo.  ",
      }),
    ).toEqual({ ok: true, revision: 2 });
    const review = h.topicReview("Tema 1");
    expect(review.topic).toEqual({ ...before, status: "rejected" });
    expect(review.history.rejections).toMatchObject([
      { revision: 2, rejectedBy: TEACHER.actorId, reason: "Falta un ejemplo." },
    ]);
    expect(fixture.sent).toEqual([]);
    expect(refused(h.approveTopic("Tema 1"))).toBe("not_reviewable");
  });

  test("vuelve a revisión al presentarlo de nuevo o al editarlo, y rechazar uno aprobado invalida su aprobación", () => {
    expect(refused(fixture.syllabus.resubmitTopic(h.target("Tema 1")))).toBe(
      "not_rejected",
    );
    h.approveTopic("Tema 1");
    fixture.syllabus.rejectTopic({ ...h.target("Tema 1"), reason: "No." });
    expect(h.topicReview("Tema 1").approval).toBeUndefined();
    expect(fixture.syllabus.resubmitTopic(h.target("Tema 1")).ok).toBe(true);
    expect(h.topic("Tema 1").status).toBe("in_review");
    fixture.syllabus.rejectTopic({ ...h.target("Tema 1"), reason: "Aún no." });
    MODIFICATIONS[2]?.[1]();
    expect(h.topic("Tema 1").status).toBe("in_review");
    expect(h.approveTopic("Tema 1").ok).toBe(true);
  });
});

describe("temas que no existen o de un documento con sustituto", () => {
  test("un tema que no existe", () => {
    expect(fixture.syllabus.getTopic("x")).toBeUndefined();
    expect(fixture.syllabus.reviewTopic("f".repeat(32))).toBeUndefined();
    expect(
      refused(
        fixture.syllabus.approveTopic({
          ...TEACHER,
          topicId: "f".repeat(32),
          revision: 1,
        }),
      ),
    ).toBe("not_found");
  });

  test("con un sustituto, el tema se conserva pero no se edita ni se rechaza", () => {
    fixture.supersede();
    const attempts: TopicResult[] = [
      fixture.syllabus.addDevelopmentBlock({
        ...h.target("Tema 1"),
        block: { text: "X", requirementIds: [] },
      }),
      fixture.syllabus.removeBlock({
        ...h.target("Tema 1"),
        blockId: development().id,
      }),
      fixture.syllabus.rejectTopic({ ...h.target("Tema 1"), reason: "No." }),
    ];
    expect(attempts.map(refused)).toEqual(Array(3).fill("superseded"));
    expect(h.topic("Tema 1").revision).toBe(2);
  });
});
