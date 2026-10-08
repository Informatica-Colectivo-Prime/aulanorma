// Aprobación de la versión del temario (specs/002-boe-scorm-export: T055;
// FR-023, FR-024, FR-060 y FR-063; SC-025, SC-035 y escenarios 5 a 7 de la
// historia 3). Índice vigente, todos los temas desarrollados y aprobados, y
// cada requisito citado y desarrollado; instantánea inmutable con su huella.
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, test } from "vitest";
import { computeDevelopment } from "@/modules/didactic-content";
import {
  createOutlineFixture,
  TEACHER,
  topicOutput,
} from "../../support/outline-fixture";
import type { OutlineFixture } from "../../support/outline-fixture";
import { syllabusHelpers } from "../../support/syllabus-helpers";
import type { SyllabusHelpers } from "../../support/syllabus-helpers";

let fixture: OutlineFixture;
let outlineId: string;
let h: SyllabusHelpers;

beforeEach(async () => {
  fixture = await createOutlineFixture();
  outlineId = await fixture.approvedOutline();
  await fixture.syllabus.generate({ ...TEACHER, outlineId });
  h = syllabusHelpers(fixture, outlineId);
});

function pendingCodes(): string[] {
  return h.review().development.pending.map((item) => item.requirement.code);
}

function blockOf(title: string, kind: string, code?: string) {
  const id = code === undefined ? undefined : fixture.requirement(code).id;
  const block = h
    .topic(title)
    .blocks.find(
      (item) =>
        item.kind === kind &&
        !item.removed &&
        (id === undefined || item.requirementIds.includes(id)),
    );
  if (block === undefined) {
    throw new Error("El bloque debía existir.");
  }
  return block;
}

describe("desarrollo de cada requisito (FR-060)", () => {
  test("cada requisito del inventario aparece con las entradas que lo citan y las que lo desarrollan", () => {
    const { development } = h.review();
    expect(development.complete).toBe(true);
    expect(
      development.items.map((item) => [
        item.requirement.code,
        item.citedIn.map((entry) => entry.title),
        item.developedIn.map((entry) => entry.title),
      ]),
    ).toEqual([
      ["C1", ["Tema 1"], ["Tema 1"]],
      ["CE1.1", ["Tema 1"], ["Tema 1"]],
      ["K1", ["Tema 2", "Tema 3"], ["Tema 2", "Tema 3"]],
      ["S1", ["Tema 2"], ["Tema 2"]],
      ["S2", ["Tema 3"], ["Tema 3"]],
    ]);
  });

  test("una cita por sí sola no acredita desarrollo", () => {
    const block = blockOf("Tema 1", "development");
    fixture.syllabus.editBlock({
      ...h.target("Tema 1"),
      blockId: block.id,
      block: {
        text: "Solo desarrolla la capacidad.",
        requirementIds: [fixture.requirement("C1").id],
      },
    });
    const pending = h.review().development.pending;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      requirement: { code: "CE1.1" },
      developedIn: [],
    });
    expect(pending[0]?.citedIn.map((entry) => entry.title)).toEqual(["Tema 1"]);
    expect(h.review().development.complete).toBe(false);
  });

  test("un desarrollo sin la cita de la norma tampoco basta", () => {
    fixture.syllabus.removeBlock({
      ...h.target("Tema 1"),
      blockId: blockOf("Tema 1", "requirement", "CE1.1").id,
    });
    expect(pendingCodes()).toEqual(["CE1.1"]);
    expect(h.review().development.pending[0]?.developedIn).toHaveLength(1);
  });

  test("no hay herencia: desarrollar el padre no desarrolla a sus hijos, ni al revés", () => {
    const block = blockOf("Tema 2", "development");
    fixture.syllabus.editBlock({
      ...h.target("Tema 2"),
      blockId: block.id,
      block: {
        text: "Solo el subapartado.",
        requirementIds: [fixture.requirement("S1").id],
      },
    });
    // K1 sigue desarrollado por el tema 3, que lo vincula de forma propia.
    expect(pendingCodes()).toEqual([]);
    fixture.syllabus.editBlock({
      ...h.target("Tema 3"),
      blockId: blockOf("Tema 3", "development").id,
      block: {
        text: "Solo el detalle.",
        requirementIds: [fixture.requirement("S2").id],
      },
    });
    expect(pendingCodes()).toEqual(["K1"]);
  });

  test("un tema pendiente o fallido, un bloque quitado y un desarrollo sin respaldo no cuentan", () => {
    expect(
      computeDevelopment(h.review().outline.interpretation.requirements, [])
        .complete,
    ).toBe(false);
    fixture.syllabus.removeBlock({
      ...h.target("Tema 3"),
      blockId: blockOf("Tema 3", "development").id,
    });
    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 3"),
      block: { text: "Texto sin vínculos.", requirementIds: [] },
    });
    expect(pendingCodes()).toEqual(["S2"]);
  });
});

describe("aprobación de la versión", () => {
  test("con todo aprobado, registra la versión con quién, cuándo y una instantánea con su huella", () => {
    h.approveAllTopics();
    expect(h.review().blockers).toEqual({
      outlineNotApproved: false,
      undeveloped: [],
      unapproved: [],
      development: [],
    });
    const result = h.approveVersion();
    expect(result).toMatchObject({ ok: true, label: "v1" });
    if (!result.ok) {
      return;
    }
    const [version] = h.review().versions;
    expect(version).toMatchObject({
      id: result.versionId,
      label: "v1",
      approvedBy: TEACHER.actorId,
      current: true,
    });
    expect(version?.approvedAt).toBeGreaterThan(0);
    const snapshot = fixture.syllabus.snapshotOf(result.versionId) ?? "";
    expect(version?.contentSha256).toBe(
      createHash("sha256").update(snapshot).digest("hex"),
    );
    const content = JSON.parse(snapshot) as {
      unit: unknown;
      topics: {
        title: string;
        blocks: {
          kind: string;
          requirements: { code: string; text: string; pageFrom: number }[];
        }[];
      }[];
    };
    expect(content.unit).toEqual({ code: "UX9001", title: "Unidad sintética" });
    expect(content.topics.map((topic) => topic.title)).toEqual([
      "Tema 1",
      "Tema 2",
      "Tema 3",
      "Presentación",
    ]);
    // La instantánea lleva el texto y la referencia de cada requisito.
    expect(content.topics[0]?.blocks[0]).toMatchObject({
      kind: "requirement",
      requirements: [{ code: "C1", text: "Texto de C1", pageFrom: 1 }],
    });
    // Ningún dato de usuarios en lo que se exportará.
    expect(snapshot).not.toContain(TEACHER.actorId);
    expect(
      fixture.audit
        .list()
        .filter((event) => event.action === "syllabus.approve")
        .at(-1),
    ).toMatchObject({ result: "ok", details: { version: "v1" } });
  });

  test("la versión y su instantánea son inmutables", () => {
    h.approveAllTopics();
    h.approveVersion();
    for (const table of ["syllabus_version", "syllabus_version_topic"]) {
      expect(() => {
        fixture.db.exec(`UPDATE ${table} SET rowid = rowid`);
      }).toThrow(/append-only/);
      expect(() => {
        fixture.db.exec(`DELETE FROM ${table}`);
      }).toThrow(/append-only/);
    }
  });

  test.each([
    [
      "un tema sin aprobar",
      () => {
        for (const title of ["Tema 1", "Tema 2", "Tema 3"]) {
          h.approveTopic(title);
        }
      },
      { unapproved: ["Presentación"] },
    ],
    [
      "un tema rechazado",
      () => {
        h.approveAllTopics();
        fixture.syllabus.rejectTopic({
          ...h.target("Tema 2"),
          reason: "Hay que rehacerlo.",
        });
      },
      { unapproved: ["Tema 2"] },
    ],
    [
      "un requisito citado pero sin desarrollo",
      () => {
        fixture.syllabus.editBlock({
          ...h.target("Tema 1"),
          blockId: blockOf("Tema 1", "development").id,
          block: {
            text: "Solo la capacidad.",
            requirementIds: [fixture.requirement("C1").id],
          },
        });
        h.approveAllTopics();
      },
      { development: ["CE1.1"] },
    ],
  ])(
    "con %s se impide y se devuelve lo pendiente (SC-035)",
    (_name, prepare, expected) => {
      prepare();
      const result = h.approveVersion();
      expect(result).toMatchObject({ ok: false, reason: "blocked" });
      if (result.ok || result.blockers === undefined) {
        return;
      }
      expect({
        unapproved: result.blockers.unapproved.map((entry) => entry.title),
        development: result.blockers.development.map(
          (item) => item.requirement.code,
        ),
      }).toEqual({ unapproved: [], development: [], ...expected });
      // El pendiente lleva su referencia normativa.
      for (const item of result.blockers.development) {
        expect(item.requirement).toMatchObject({
          section: "Sección sintética",
          pageFrom: 1,
        });
      }
      expect(h.review().versions).toEqual([]);
    },
  );

  test("con un tema sin desarrollar o con el índice sin aprobación vigente, también", async () => {
    const other = await createOutlineFixture();
    const otherId = await other.approvedOutline();
    other.topicReply = (request) =>
      (request.input as { entryTitle: string }).entryTitle === "Tema 3"
        ? undefined
        : topicOutput(request);
    await other.syllabus.generate({ ...TEACHER, outlineId: otherId });
    const o = syllabusHelpers(other, otherId);
    for (const title of ["Tema 1", "Tema 2", "Presentación"]) {
      o.approveTopic(title);
    }
    const result = o.approveVersion();
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
    if (!result.ok) {
      expect(result.blockers?.undeveloped.map((entry) => entry.title)).toEqual([
        "Tema 3",
      ]);
      expect(
        result.blockers?.development.map((item) => item.requirement.code),
      ).toEqual(["S2"]);
    }

    h.approveAllTopics();
    fixture.outlines.reject({
      ...TEACHER,
      outlineId,
      revision: 1,
      reason: "Me lo he pensado.",
    });
    const blocked = h.approveVersion();
    expect(blocked).toMatchObject({ ok: false, reason: "blocked" });
    if (!blocked.ok) {
      expect(blocked.blockers?.outlineNotApproved).toBe(true);
    }
  });

  test("ninguna operación del temario aprueba la versión pese a lo pendiente", () => {
    const forced = {
      ...TEACHER,
      outlineId,
      fingerprint: h.review().fingerprint,
      force: true,
      skipChecks: "yes",
    };
    expect(fixture.syllabus.approveVersion(forced)).toMatchObject({
      ok: false,
      reason: "blocked",
    });
    expect(Object.keys(fixture.syllabus).sort()).toEqual([
      "addDevelopmentBlock",
      "addRequirementBlock",
      "approveTopic",
      "approveVersion",
      "checkTopicReference",
      "editBlock",
      "generate",
      "getTopic",
      "locateVersion",
      "moveBlock",
      "rejectTopic",
      "removeBlock",
      "resubmitTopic",
      "review",
      "reviewTopic",
      "snapshotOf",
    ]);
  });

  test("si algo cambió desde que se abrió la página, la decisión se rechaza y no se registra nada", () => {
    h.approveAllTopics();
    const opened = h.review().fingerprint;
    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 1"),
      block: { text: "De otra sesión.", requirementIds: [] },
    });
    expect(
      fixture.syllabus.approveVersion({
        ...TEACHER,
        outlineId,
        fingerprint: opened,
      }),
    ).toMatchObject({ ok: false, reason: "conflict" });
    expect(h.review().versions).toEqual([]);
    expect(
      fixture.syllabus.approveVersion({
        ...TEACHER,
        outlineId: "f".repeat(32),
        fingerprint: opened,
      }),
    ).toMatchObject({ ok: false, reason: "not_found" });
  });
});

describe("modificación después de aprobar la versión (escenario 6)", () => {
  test("modificar un tema deja sin vigencia su aprobación y la de la versión, que permanece; una versión nueva no altera la anterior", () => {
    h.approveAllTopics();
    const first = h.approveVersion();
    if (!first.ok) {
      throw new Error("La versión debía aprobarse.");
    }
    const snapshot = fixture.syllabus.snapshotOf(first.versionId);

    fixture.syllabus.addDevelopmentBlock({
      ...h.target("Tema 2"),
      block: { text: "Un añadido posterior.", requirementIds: [] },
    });
    expect(h.review().versions).toMatchObject([
      { label: "v1", current: false },
    ]);
    expect(h.review().topics.map((item) => item.approved)).toEqual([
      true,
      false,
      true,
      true,
    ]);
    expect(h.approveVersion()).toMatchObject({ ok: false, reason: "blocked" });

    h.approveTopic("Tema 2");
    const second = h.approveVersion();
    expect(second).toMatchObject({ ok: true, label: "v2" });
    expect(h.review().versions).toMatchObject([
      { label: "v1", current: false },
      { label: "v2", current: true },
    ]);
    // La primera instantánea sigue siendo la misma.
    expect(fixture.syllabus.snapshotOf(first.versionId)).toBe(snapshot);
    if (second.ok) {
      expect(fixture.syllabus.snapshotOf(second.versionId)).toContain(
        "Un añadido posterior.",
      );
      expect(snapshot).not.toContain("Un añadido posterior.");
    }
  });

  test("corregir la interpretación deja sin vigencia el índice, los temas y la versión (SC-029)", () => {
    h.approveAllTopics();
    h.approveVersion();
    const interpretation = fixture.interpretations.get(
      fixture.interpretationId,
    );
    fixture.interpretations.editUnit({
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
    const review = h.review();
    expect(review.outline.approval).toBeUndefined();
    expect(review.topics.every((item) => !item.approved)).toBe(true);
    expect(review.versions).toMatchObject([{ current: false }]);
    expect(review.blockers.outlineNotApproved).toBe(true);
  });
});
