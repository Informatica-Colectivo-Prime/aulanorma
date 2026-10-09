// Generación del temario tema a tema (specs/002-boe-scorm-export: T051 y
// T053; FR-016, FR-019, FR-021 y FR-066; SC-005 y SC-032). Índice aprobado y
// vigente, una reserva por tema, temas fallidos sin reintentos automáticos,
// límite de coste y reanudación explícita. El proveedor y sus consumos son
// simulados.
import { beforeEach, describe, expect, test } from "vitest";
import { createSyllabus } from "@/modules/didactic-content";
import type { SyllabusReview } from "@/modules/didactic-content";
import { createBudget, createGeneration } from "@/platform/generation";
import type { ProviderRequest } from "@/platform/generation";
import {
  createOutlineFixture,
  TEACHER,
  topicOutput,
} from "../../support/outline-fixture";
import type { OutlineFixture } from "../../support/outline-fixture";

let fixture: OutlineFixture;
let outlineId: string;

beforeEach(async () => {
  fixture = await createOutlineFixture();
  outlineId = await fixture.approvedOutline();
  fixture.sent.length = 0;
});

function review(): SyllabusReview {
  const current = fixture.syllabus.review(outlineId);
  if (current === undefined) {
    throw new Error("El temario debía existir.");
  }
  return current;
}

function generate() {
  return fixture.syllabus.generate({ ...TEACHER, outlineId });
}

function states(): string[] {
  return review().topics.map(
    (item) => `${item.entry.title}: ${item.topic?.status ?? "sin tema"}`,
  );
}

function titleOf(request: ProviderRequest): string {
  return (request.input as { entryTitle: string }).entryTitle;
}

function topicCalls(): string[] {
  return fixture.sent
    .filter((request) => request.task === "topic")
    .map(titleOf);
}

describe("condiciones para desarrollarlo", () => {
  test("sin un índice aprobado y vigente no se genera nada, y se dice por qué", async () => {
    const other = await createOutlineFixture();
    const proposedId = await other.requestOutline();
    other.sent.length = 0;
    expect(
      await other.syllabus.generate({ ...TEACHER, outlineId: proposedId }),
    ).toEqual({ ok: false, reason: "outline_not_approved" });
    expect(other.sent).toEqual([]);
    expect(other.db.prepare("SELECT COUNT(*) AS n FROM topic").get()?.n).toBe(
      0,
    );
  });

  test("con la aprobación del índice invalidada por una edición, tampoco", async () => {
    const entry = review().topics[0]?.entry;
    fixture.outlines.moveEntry({
      ...TEACHER,
      outlineId,
      revision: 1,
      entryId: entry?.id ?? "",
      direction: "down",
    });
    expect(await generate()).toEqual({
      ok: false,
      reason: "outline_not_approved",
    });
    expect(fixture.sent).toEqual([]);
  });

  test("con la interpretación corregida después de aprobar el índice, tampoco", async () => {
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    fixture.interpretations.editUnit({
      ...TEACHER,
      interpretationId: fixture.interpretationId,
      revision: interpretation?.revision ?? 0,
      unit: {
        unitTitle: "Otra",
        durationHours: null,
        durationSection: "",
        durationPage: null,
        durationQuote: null,
      },
    });
    expect(await generate()).toEqual({
      ok: false,
      reason: "outline_not_approved",
    });
  });

  test("un índice que no existe, o de un documento con sustituto", async () => {
    expect(
      await fixture.syllabus.generate({
        ...TEACHER,
        outlineId: "f".repeat(32),
      }),
    ).toEqual({ ok: false, reason: "not_found" });
    fixture.supersede();
    expect(await generate()).toEqual({ ok: false, reason: "superseded" });
    expect(fixture.sent).toEqual([]);
  });
});

describe("estimación previa", () => {
  test("se conoce antes de pedirlo, sumada por tema, sin enviar ni reservar nada", () => {
    fixture.topicMaxCost = 100;
    expect(review()).toMatchObject({
      cost: { estimatedCost: 0, maxCost: 400 },
      incomplete: false,
    });
    expect(review().toGenerate).toHaveLength(4);
    expect(fixture.sent).toEqual([]);
    expect(
      fixture.budget.list().filter((item) => item.task === "topic"),
    ).toEqual([]);
  });

  test("si las cifras mostradas ya no son las actuales, no se envía nada", async () => {
    fixture.topicMaxCost = 100;
    expect(
      await fixture.syllabus.generate({
        ...TEACHER,
        outlineId,
        shown: { estimatedCost: 0, maxCost: 300 },
      }),
    ).toEqual({ ok: false, reason: "estimate_changed" });
    expect(fixture.sent).toEqual([]);
    expect(
      (
        await fixture.syllabus.generate({
          ...TEACHER,
          outlineId,
          shown: { estimatedCost: 0, maxCost: 400 },
        })
      ).ok,
    ).toBe(true);
  });
});

describe("generación completa", () => {
  test("cada tema es una operación con su reserva, y queda como borrador con sus bloques", async () => {
    fixture.topicMaxCost = 100;
    fixture.topicCost = 60;
    expect(await generate()).toEqual({
      ok: true,
      generated: 4,
      failed: 0,
      notSent: 0,
      discarded: 0,
      invalidated: false,
      incomplete: false,
    });
    expect(topicCalls()).toEqual([
      "Tema 1",
      "Tema 2",
      "Tema 3",
      "Presentación",
    ]);
    expect(states()).toEqual([
      "Tema 1: draft",
      "Tema 2: draft",
      "Tema 3: draft",
      "Presentación: draft",
    ]);
    const reservations = fixture.budget
      .list()
      .filter((item) => item.task === "topic");
    expect(reservations).toHaveLength(4);
    expect(
      reservations.every(
        (item) =>
          item.state === "settled" &&
          item.reservedCost === 100 &&
          item.settledCost === 60,
      ),
    ).toBe(true);
    // Un bloque de requisito por requisito de la entrada y uno de desarrollo.
    const [first] = review().topics;
    expect(
      first?.topic?.blocks.map((block) => [
        block.kind,
        block.requirementIds.length,
        block.content.length,
      ]),
    ).toEqual([
      ["requirement", 1, 0],
      ["requirement", 1, 0],
      ["development", 2, 3],
    ]);
    expect(first?.topic?.revision).toBe(2);
    // Una entrada sin respaldo normativo da un desarrollo sin requisitos.
    expect(
      review().topics[3]?.topic?.blocks.map((block) => [
        block.kind,
        block.requirementIds,
      ]),
    ).toEqual([["development", []]]);
    expect(
      fixture.db
        .prepare("SELECT status FROM generation_run WHERE kind = 'syllabus'")
        .all(),
    ).toEqual([{ status: "succeeded" }]);
  });

  test("lo que se envía de un tema es su entrada y sus requisitos, sin datos de usuarios ni identificadores internos", async () => {
    await generate();
    const [sent] = fixture.sent;
    expect(sent).toMatchObject({
      task: "topic",
      promptVersion: "v1",
      instructions: "Instrucciones del tema.",
    });
    expect(sent?.input).toEqual({
      unitCode: "UX9001",
      unitTitle: "Unidad sintética",
      entryTitle: "Tema 1",
      requirements: [
        { ref: "r1", kind: "capability", code: "C1", text: "Texto de C1" },
        { ref: "r2", kind: "criterion", code: "CE1.1", text: "Texto de CE1.1" },
      ],
    });
    const serialized = JSON.stringify(fixture.sent);
    expect(serialized).not.toContain(TEACHER.actorId);
    expect(serialized).not.toContain(outlineId);
    expect(serialized).not.toContain(fixture.requirement("C1").id);
  });

  test("con todo desarrollado no hay nada más que generar", async () => {
    await generate();
    fixture.sent.length = 0;
    expect(review().toGenerate).toEqual([]);
    expect(await generate()).toEqual({
      ok: false,
      reason: "nothing_to_generate",
    });
    expect(fixture.sent).toEqual([]);
  });
});

describe("temas fallidos (FR-019, SC-005)", () => {
  // Cada causa de fallo, sobre el segundo tema.
  const FAILURES: readonly (readonly [
    string,
    string,
    (r: ProviderRequest) => unknown,
  ])[] = [
    ["la operación termina con error", "provider_error", () => undefined],
    [
      "la propuesta no cumple el formato",
      "invalid_output",
      () => ({ blocks: [] }),
    ],
    [
      "la propuesta cita un requisito que no es de la entrada",
      "rejected_by_domain",
      () => ({ blocks: [{ kind: "requirement", requirementRef: "r9" }] }),
    ],
    [
      "la propuesta desarrolla un requisito que no es de la entrada",
      "rejected_by_domain",
      () => ({
        blocks: [
          {
            kind: "development",
            requirementRefs: ["r1", "r9"],
            content: [{ type: "paragraph", text: "Texto." }],
          },
        ],
      }),
    ],
    [
      "la propuesta cita dos veces el mismo requisito",
      "rejected_by_domain",
      () => ({
        blocks: [
          { kind: "requirement", requirementRef: "r1" },
          { kind: "requirement", requirementRef: "r1" },
        ],
      }),
    ],
  ];

  test.each(FAILURES)(
    "si %s, el tema queda fallido con su motivo, sin guardar el resultado, y los demás siguen",
    async (_name, reason, reply) => {
      fixture.topicReply = (request) =>
        titleOf(request) === "Tema 2" ? reply(request) : topicOutput(request);
      expect(await generate()).toEqual({
        ok: true,
        generated: 3,
        failed: 1,
        notSent: 0,
        discarded: 0,
        invalidated: false,
        incomplete: true,
      });
      expect(states()).toEqual([
        "Tema 1: draft",
        "Tema 2: failed",
        "Tema 3: draft",
        "Presentación: draft",
      ]);
      const failed = review().topics[1]?.topic;
      expect(failed).toMatchObject({
        failure: reason,
        blocks: [],
        revision: 1,
      });
      // Exactamente una operación por tema: ningún reintento automático.
      expect(topicCalls()).toEqual([
        "Tema 1",
        "Tema 2",
        "Tema 3",
        "Presentación",
      ]);
      expect(review().incomplete).toBe(true);
      expect(
        fixture.db
          .prepare("SELECT status FROM generation_run WHERE kind = 'syllabus'")
          .all(),
      ).toEqual([{ status: "incomplete" }]);
      // Un tema fallido no puede aprobarse ni editarse.
      const target = { ...TEACHER, topicId: failed?.id ?? "", revision: 1 };
      expect(fixture.syllabus.approveTopic(target)).toMatchObject({
        ok: false,
        reason: "not_developed",
      });
      expect(
        fixture.syllabus.addDevelopmentBlock({
          ...target,
          block: { text: "Texto.", requirementIds: [] },
        }),
      ).toMatchObject({ ok: false, reason: "not_developed" });
    },
  );

  test("otro intento es explícito: solo procesa el tema fallido, con una reserva nueva, y deja intactos los borradores", async () => {
    fixture.topicMaxCost = 50;
    fixture.topicReply = (request) =>
      titleOf(request) === "Tema 2" ? undefined : topicOutput(request);
    await generate();
    const before = review().topics.map((item) => item.topic);
    fixture.sent.length = 0;

    // Nada ocurre solo: consultar el temario no envía nada.
    review();
    expect(fixture.sent).toEqual([]);
    expect(review().toGenerate.map((entry) => entry.title)).toEqual(["Tema 2"]);
    expect(review().cost).toEqual({ estimatedCost: 0, maxCost: 50 });

    fixture.topicReply = topicOutput;
    expect(await generate()).toEqual({
      ok: true,
      generated: 1,
      failed: 0,
      notSent: 0,
      discarded: 0,
      invalidated: false,
      incomplete: false,
    });
    expect(topicCalls()).toEqual(["Tema 2"]);
    expect(
      fixture.budget.list().filter((item) => item.task === "topic"),
    ).toHaveLength(5);
    const after = review().topics.map((item) => item.topic);
    expect([after[0], after[2], after[3]]).toEqual([
      before[0],
      before[2],
      before[3],
    ]);
    expect(after[1]).toMatchObject({ status: "draft", failure: null });
  });

  test("un borrador válido no se sustituye por un resultado posterior", async () => {
    await generate();
    const [first] = review().topics;
    // Aunque una respuesta llegara para un tema ya desarrollado, no hay
    // operación que la pida: reanudar no lo incluye.
    fixture.topicReply = () => undefined;
    expect(await generate()).toEqual({
      ok: false,
      reason: "nothing_to_generate",
    });
    expect(review().topics[0]?.topic).toEqual(first?.topic);
  });
});

describe("operación de resultado incierto (FR-066)", () => {
  test("su tema queda fallido, la reserva sigue contando y no se reenvía hasta conciliarla", async () => {
    fixture.topicMaxCost = 100;
    fixture.topicReply = (request) => {
      if (titleOf(request) === "Tema 2") {
        throw new Error("sin conexión");
      }
      return topicOutput(request);
    };
    await generate();
    const uncertain = review().topics[1];
    expect(uncertain).toMatchObject({
      awaitingReconciliation: true,
      topic: { status: "failed", failure: "uncertain", blocks: [] },
    });
    expect(fixture.budget.status()).toMatchObject({ uncertain: 100 });

    // Reanudar no lo incluye: no hay nada que enviar.
    fixture.topicReply = topicOutput;
    fixture.sent.length = 0;
    expect(review().toGenerate).toEqual([]);
    expect(await generate()).toEqual({
      ok: false,
      reason: "nothing_to_generate",
    });
    expect(fixture.sent).toEqual([]);

    // Tras la conciliación de un administrador, un intento explícito sí.
    const [reservation] = fixture.budget.list("uncertain");
    fixture.budget.reconcile({
      actorId: "administrador-1",
      correlationId: "conciliación",
      reservationId: reservation?.id ?? "",
      confirmedCost: 80,
      note: "Confirmado con el proveedor.",
    });
    expect(review().topics[1]?.awaitingReconciliation).toBe(false);
    expect(review().toGenerate.map((entry) => entry.title)).toEqual(["Tema 2"]);
    expect((await generate()).ok).toBe(true);
    expect(topicCalls()).toEqual(["Tema 2"]);
    expect(review().incomplete).toBe(false);
  });

  test("un tema terminado cuyo consumo no se confirma conserva su borrador y su reserva incierta", async () => {
    fixture.topicMaxCost = 100;
    fixture.topicCost = null;
    await generate();
    expect(states().every((state) => state.endsWith("draft"))).toBe(true);
    expect(fixture.budget.status()).toMatchObject({ uncertain: 400 });
  });
});

describe("límite de coste (SC-032)", () => {
  test("al alcanzarlo no se inicia ninguna operación más, lo terminado queda como borrador y lo pendiente, identificado", async () => {
    fixture.topicMaxCost = 100;
    fixture.topicCost = 100;
    fixture.budget.setLimit({
      actorId: "administrador-1",
      correlationId: "límite",
      newLimit: 250,
      revision: fixture.budget.status().revision,
    });
    expect(await generate()).toEqual({
      ok: true,
      generated: 2,
      failed: 0,
      notSent: 2,
      discarded: 0,
      invalidated: false,
      incomplete: true,
    });
    // Solo se enviaron las dos operaciones que cabían.
    expect(topicCalls()).toEqual(["Tema 1", "Tema 2"]);
    expect(states()).toEqual([
      "Tema 1: draft",
      "Tema 2: draft",
      "Tema 3: pending",
      "Presentación: pending",
    ]);
    expect(review()).toMatchObject({ incomplete: true });
    expect(review().blockers.undeveloped.map((entry) => entry.title)).toEqual([
      "Tema 3",
      "Presentación",
    ]);
    expect(
      fixture.db
        .prepare("SELECT status FROM generation_run WHERE kind = 'syllabus'")
        .all(),
    ).toEqual([{ status: "incomplete" }]);
    expect(
      fixture.syllabus.approveVersion({
        ...TEACHER,
        outlineId,
        fingerprint: review().fingerprint,
      }),
    ).toMatchObject({ ok: false, reason: "blocked" });
  });

  test("sin presupuesto, reanudar no envía nada; ampliar el límite no reanuda nada por sí solo", async () => {
    fixture.topicMaxCost = 100;
    fixture.topicCost = 100;
    const setLimit = (newLimit: number) =>
      fixture.budget.setLimit({
        actorId: "administrador-1",
        correlationId: "límite",
        newLimit,
        revision: fixture.budget.status().revision,
      });
    setLimit(250);
    await generate();
    fixture.sent.length = 0;

    expect(await generate()).toMatchObject({
      ok: true,
      generated: 0,
      notSent: 2,
      discarded: 0,
      invalidated: false,
      incomplete: true,
    });
    expect(fixture.sent).toEqual([]);

    setLimit(10_000);
    expect(fixture.sent).toEqual([]);
    expect(states().slice(2)).toEqual([
      "Tema 3: pending",
      "Presentación: pending",
    ]);

    // La reanudación explícita solo genera los pendientes.
    const before = review()
      .topics.slice(0, 2)
      .map((item) => item.topic);
    expect(await generate()).toMatchObject({
      ok: true,
      generated: 2,
      incomplete: false,
    });
    expect(topicCalls()).toEqual(["Tema 3", "Presentación"]);
    expect(
      review()
        .topics.slice(0, 2)
        .map((item) => item.topic),
    ).toEqual(before);
  });
});

describe("almacenamiento (T051)", () => {
  test("un tema por entrada, sin borrado, y un bloque de requisito cita exactamente un requisito", async () => {
    await generate();
    const [first] = review().topics;
    const block = first?.topic?.blocks.find(
      (item) => item.kind === "requirement",
    );
    expect(() =>
      fixture.db
        .prepare(
          "INSERT INTO topic (id, outline_entry_id, status, revision, " +
            "created_at) VALUES ('x', ?, 'pending', 1, 0)",
        )
        .run(first?.entry.id ?? ""),
    ).toThrow();
    expect(() =>
      fixture.db
        .prepare(
          "INSERT INTO block_requirement (topic_block_id, requirement_id) " +
            "VALUES (?, 'otro')",
        )
        .run(block?.id ?? ""),
    ).toThrow(/exactly one requirement/);
    expect(() => {
      fixture.db.exec("DELETE FROM topic");
    }).toThrow(/cannot be deleted/);
    expect(() => {
      fixture.db.exec("DELETE FROM topic_block");
    }).toThrow(/cannot be deleted/);
    expect(() => {
      fixture.db.exec("UPDATE topic_block SET kind = 'development'");
    }).toThrow(/kind cannot change/);
    expect(() => {
      fixture.db.exec("UPDATE topic SET status = 'failed'");
    }).toThrow();
    expect(() => {
      fixture.db.exec("UPDATE topic_change SET author = 'x'");
    }).toThrow(/append-only/);
  });
});

describe("generación en curso", () => {
  test("mientras dura, el temario lo indica con su avance, y al terminar deja de estar en curso", async () => {
    const seen: (number | undefined)[] = [];
    fixture.topicReply = (request) => {
      const current = review();
      seen.push(
        current.running === undefined
          ? undefined
          : current.topics.length - current.blockers.undeveloped.length,
      );
      return topicOutput(request);
    };
    expect(review().running).toBeUndefined();
    await generate();
    // Antes de cada tema, los ya terminados.
    expect(seen).toEqual([0, 1, 2, 3]);
    expect(review().running).toBeUndefined();
  });

  test("no se admite otra generación del mismo temario a la vez: ningún tema se envía dos veces", async () => {
    const first = generate();
    expect(await generate()).toEqual({ ok: false, reason: "already_running" });
    expect(await first).toMatchObject({ ok: true, generated: 4 });
    expect(topicCalls()).toHaveLength(4);
    expect(
      fixture.db
        .prepare(
          "SELECT COUNT(*) AS n FROM budget_reservation WHERE task = 'topic'",
        )
        .get()?.n,
    ).toBe(4);
  });

  test("una ejecución que quedó en curso al caer el proceso pasa a incompleta al arrancar, y entonces se puede reanudar", async () => {
    fixture.generation.startRun({
      kind: "syllabus",
      targetId: outlineId,
      requestedBy: TEACHER.actorId,
    });
    expect(await generate()).toEqual({ ok: false, reason: "already_running" });
    expect(fixture.generation.recoverInterruptedRuns()).toBe(1);
    expect(fixture.generation.recoverInterruptedRuns()).toBe(0);
    expect(
      fixture.generation
        .listRuns("syllabus", outlineId)
        .map((run) => run.status),
    ).toEqual(["incomplete"]);
    expect(await generate()).toMatchObject({ ok: true, generated: 4 });
  });
});

// Retiene la respuesta de cada tema hasta que la prueba la suelta, y avisa
// cuando llega cada petición: la operación está enviada y sin respuesta.
function holdTopics() {
  const releases: (() => void)[] = [];
  const arrivals: (() => void)[] = [];
  fixture.topicHold = () =>
    new Promise<void>((resolve) => {
      releases.push(resolve);
      arrivals.shift()?.();
    });
  return {
    // Se cumple cuando hay `count` temas enviados.
    arrived: (count: number) =>
      new Promise<void>((resolve) => {
        if (releases.length >= count) {
          resolve();
        } else {
          arrivals.push(resolve);
        }
      }),
    release: (index: number) => {
      releases[index]?.();
    },
  };
}

function editOutline(): void {
  const current = review();
  const result = fixture.outlines.moveEntry({
    ...TEACHER,
    outlineId,
    revision: current.outline.outline.revision,
    entryId: current.topics[0]?.entry.id ?? "",
    direction: "down",
  });
  expect(result.ok).toBe(true);
}

function editInterpretation(): void {
  const interpretation = fixture.interpretations.get(fixture.interpretationId);
  const result = fixture.interpretations.editUnit({
    ...TEACHER,
    interpretationId: fixture.interpretationId,
    revision: interpretation?.revision ?? 0,
    unit: {
      unitTitle: "Unidad corregida",
      durationHours: null,
      durationSection: "",
      durationPage: null,
      durationQuote: null,
    },
  });
  expect(result.ok).toBe(true);
}

function count(sql: string): unknown {
  return fixture.db.prepare(sql).get()?.n;
}

function lastRunStatus(): string | undefined {
  return fixture.generation.listRuns("syllabus", outlineId).at(-1)?.status;
}

describe("pérdida de vigencia durante la generación (FR-016 y FR-059)", () => {
  test.each([
    ["el índice", editOutline],
    ["la interpretación", editInterpretation],
  ])(
    "si cambia %s con el primer tema en espera, su resultado se descarta, no se envía ningún tema más y la ejecución queda incompleta",
    async (_label, change) => {
      fixture.topicMaxCost = 50;
      fixture.topicCost = 20;
      const hold = holdTopics();
      const pending = generate();
      await hold.arrived(1);
      expect(topicCalls()).toHaveLength(1);

      change();
      expect(review().outline.approval).toBeUndefined();
      hold.release(0);

      expect(await pending).toEqual({
        ok: true,
        generated: 0,
        failed: 0,
        notSent: 3,
        discarded: 1,
        invalidated: true,
        incomplete: true,
      });
      // Ni un envío más que el que ya estaba hecho.
      expect(topicCalls()).toHaveLength(1);
      // El resultado no se guarda y ningún tema cambia de estado.
      expect(count("SELECT COUNT(*) AS n FROM topic_block")).toBe(0);
      expect(
        count("SELECT COUNT(*) AS n FROM topic WHERE status <> 'pending'"),
      ).toBe(0);
      expect(lastRunStatus()).toBe("incomplete");
      expect(review().running).toBeUndefined();
      // La operación enviada se pagó: su consumo queda liquidado, y no hay
      // ninguna otra reserva.
      expect(
        fixture.budget.list().filter((item) => item.task === "topic"),
      ).toMatchObject([{ state: "settled", settledCost: 20 }]);
      expect(fixture.audit.list().at(-1)).toMatchObject({
        action: "syllabus.generate",
        details: { discarded: 1, notSent: 3, invalidated: true },
      });
    },
  );

  test("si la vigencia se pierde a mitad, los temas ya terminados se conservan y los restantes no se envían", async () => {
    const hold = holdTopics();
    const pending = generate();
    await hold.arrived(1);
    hold.release(0);
    await hold.arrived(2);
    editInterpretation();
    hold.release(1);

    expect(await pending).toEqual({
      ok: true,
      generated: 1,
      failed: 0,
      notSent: 2,
      discarded: 1,
      invalidated: true,
      incomplete: true,
    });
    expect(topicCalls()).toHaveLength(2);
    expect(
      count("SELECT COUNT(*) AS n FROM topic WHERE status = 'draft'"),
    ).toBe(1);
    expect(lastRunStatus()).toBe("incomplete");
  });

  test("con la vigencia ya perdida no se envía nada", async () => {
    editOutline();
    expect(await generate()).toEqual({
      ok: false,
      reason: "outline_not_approved",
    });
    expect(topicCalls()).toEqual([]);
  });
});

// Retiene la comprobación previa al envío de cada tema hasta que la prueba
// la resuelve: la reserva está hecha y la operación, sin enviar.
function holdAdmissions() {
  const resolves: ((admitted: boolean) => void)[] = [];
  const arrivals: (() => void)[] = [];
  fixture.topicAdmit = () =>
    new Promise<boolean>((resolve) => {
      resolves.push(resolve);
      arrivals.shift()?.();
    });
  return {
    arrived: (total: number) =>
      new Promise<void>((resolve) => {
        if (resolves.length >= total) {
          resolve();
        } else {
          arrivals.push(resolve);
        }
      }),
    resolve: (index: number, admitted: boolean) => {
      resolves[index]?.(admitted);
    },
  };
}

describe("pérdida de vigencia entre la comprobación previa y el envío", () => {
  test.each([
    ["el índice", editOutline],
    ["la interpretación", editInterpretation],
  ])(
    "si cambia %s con la comprobación previa en espera y esta se resuelve a favor, el tema no se envía, su reserva se libera y la ejecución queda incompleta",
    async (_label, change) => {
      fixture.topicMaxCost = 50;
      fixture.topicCost = 20;
      const hold = holdAdmissions();
      const pending = generate();
      await hold.arrived(1);
      // Reservado y sin enviar.
      expect(
        fixture.budget.list().filter((item) => item.task === "topic"),
      ).toMatchObject([{ state: "reserved", reservedCost: 50 }]);

      change();
      expect(review().outline.approval).toBeUndefined();
      hold.resolve(0, true);

      expect(await pending).toEqual({
        ok: true,
        generated: 0,
        failed: 0,
        notSent: 4,
        discarded: 0,
        invalidated: true,
        incomplete: true,
      });
      // La generación no llega al proveedor, ni para este tema ni para los
      // siguientes, y no hay más comprobaciones previas.
      expect(topicCalls()).toEqual([]);
      await Promise.resolve();
      expect(
        fixture.budget.list().filter((item) => item.task === "topic"),
      ).toMatchObject([{ state: "released", settledCost: null }]);
      expect(fixture.budget.status()).toMatchObject({
        reserved: 0,
        uncertain: 0,
        settled: 0,
      });
      expect(
        count("SELECT COUNT(*) AS n FROM generation_call WHERE task = 'topic'"),
      ).toBe(0);
      expect(
        count("SELECT COUNT(*) AS n FROM topic WHERE status <> 'pending'"),
      ).toBe(0);
      expect(lastRunStatus()).toBe("incomplete");
      // La invalidación queda registrada.
      expect(fixture.audit.list().at(-1)).toMatchObject({
        action: "syllabus.generate",
        details: {
          invalidated: true,
          released: 1,
          notSent: 4,
          discarded: 0,
        },
      });
    },
  );

  test("si la comprobación previa se resuelve en contra, el tema falla sin enviarse y los demás siguen", async () => {
    let first = true;
    fixture.topicAdmit = () => {
      const admitted = !first;
      first = false;
      return Promise.resolve(admitted);
    };
    expect(await generate()).toMatchObject({
      ok: true,
      generated: 3,
      failed: 1,
      invalidated: false,
    });
    expect(topicCalls()).toHaveLength(3);
  });
});

describe("recuperación tras interrumpirse el proceso (FR-021 y FR-066)", () => {
  // Arranque sobre la misma base de datos, como hace el servicio: recupera
  // las reservas y las ejecuciones, con un proveedor que anota lo que recibe.
  function restart() {
    const calls: ProviderRequest[] = [];
    let clock = Date.UTC(2026, 9, 9);
    const now = () => (clock += 1000);
    const budget = createBudget({
      db: fixture.db,
      audit: fixture.audit,
      now,
      maxOperationCost: 1_000_000,
    });
    const recovered = budget.recoverInterrupted();
    const generation = createGeneration({
      db: fixture.db,
      budget,
      now,
      provider: {
        name: "deterministic",
        estimateCost: () => 0,
        maxCost: () => 50,
        generate: (request) => {
          calls.push(request);
          return Promise.resolve({
            ok: true,
            output: topicOutput(request),
            usage: { model: "simulado", tokensIn: 0, tokensOut: 0 },
            cost: 20,
          });
        },
      },
    });
    const runs = generation.recoverInterruptedRuns();
    const syllabus = createSyllabus({
      db: fixture.db,
      audit: fixture.audit,
      interpretations: fixture.interpretations,
      outlines: fixture.outlines,
      generation,
      prompt: { version: "v1", instructions: "Instrucciones del tema." },
      now,
    });
    return { calls, budget, generation, syllabus, recovered, runs };
  }

  test("los temas terminados se conservan, la operación enviada queda incierta, la ejecución incompleta, y al arrancar no se repite ninguna llamada", async () => {
    fixture.topicMaxCost = 50;
    fixture.topicCost = 20;
    const hold = holdTopics();
    // El proceso se interrumpe con el segundo tema enviado y sin respuesta:
    // esta generación no termina nunca.
    void generate();
    await hold.arrived(1);
    hold.release(0);
    await hold.arrived(2);
    const blocks = count("SELECT COUNT(*) AS n FROM topic_block");
    expect(blocks).not.toBe(0);

    const after = restart();
    expect(after.recovered).toEqual({ uncertain: 1, released: 0 });
    expect(after.runs).toBe(1);
    // Nada se envía al arrancar ni al consultar el temario.
    const current = after.syllabus.review(outlineId);
    expect(after.calls).toEqual([]);

    // Temas terminados, conservados.
    expect(
      count("SELECT COUNT(*) AS n FROM topic WHERE status = 'draft'"),
    ).toBe(1);
    expect(count("SELECT COUNT(*) AS n FROM topic_block")).toBe(blocks);
    // Operación enviada sin consumo: incierta, contando por su máximo.
    expect(
      after.budget.list().filter((item) => item.task === "topic"),
    ).toMatchObject([
      { state: "settled", settledCost: 20 },
      { state: "uncertain", reservedCost: 50, callId: null },
    ]);
    expect(after.budget.status()).toMatchObject({
      settled: 20,
      uncertain: 50,
      reserved: 0,
    });
    // Ejecución incompleta, ya no en curso.
    expect(
      after.generation.listRuns("syllabus", outlineId).map((run) => run.status),
    ).toEqual(["incomplete"]);
    expect(current?.running).toBeUndefined();
    expect(current?.incomplete).toBe(true);
    expect(current?.interrupted).toBe(1);
  });

  test("la operación interrumpida no se reenvía al reanudar: hay que conciliarla antes, y entonces solo se genera lo pendiente", async () => {
    fixture.topicMaxCost = 50;
    fixture.topicCost = 20;
    fixture.budget.setLimit({
      newLimit: 1000,
      revision: fixture.budget.status().revision,
      actorId: "administrador-1",
      correlationId: "prueba",
    });
    const hold = holdTopics();
    void generate();
    await hold.arrived(1);
    hold.release(0);
    await hold.arrived(2);

    const after = restart();
    expect(await after.syllabus.generate({ ...TEACHER, outlineId })).toEqual({
      ok: false,
      reason: "awaiting_reconciliation",
    });
    expect(after.calls).toEqual([]);

    const [uncertain] = after.budget.list("uncertain");
    expect(
      after.budget.reconcile({
        reservationId: uncertain?.id ?? "",
        confirmedCost: 20,
        note: "Confirmado con el proveedor.",
        actorId: "administrador-1",
        correlationId: "prueba",
      }),
    ).toEqual({ ok: true });
    // Conciliar no reanuda nada.
    expect(after.calls).toEqual([]);
    expect(after.syllabus.review(outlineId)?.interrupted).toBe(0);

    expect(
      await after.syllabus.generate({ ...TEACHER, outlineId }),
    ).toMatchObject({ ok: true, generated: 3, notSent: 0 });
    expect(after.calls).toHaveLength(3);
  });
});
