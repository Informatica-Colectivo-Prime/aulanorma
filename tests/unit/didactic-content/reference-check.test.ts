// Comprobación de referencias heredadas tras un documento sustituto
// (specs/002-boe-scorm-export: T058; FR-067; SC-038). El índice y los temas
// anteriores se conservan, pero no pueden aprobarse mientras quede alguna
// referencia sin comprobar, una a una y por una persona.
import { beforeEach, describe, expect, test } from "vitest";
import {
  createOutlineFixture,
  OTHER_TEACHER,
  TEACHER,
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
  h.approveAllTopics();
  h.approveVersion();
  fixture.sent.length = 0;
});

function outlineReview() {
  const review = fixture.outlines.review(outlineId);
  if (review === undefined) {
    throw new Error("El índice debía existir.");
  }
  return review;
}

function checkOutline(code: string, actor = TEACHER, confirmed = true) {
  return fixture.outlines.checkReference({
    ...actor,
    outlineId,
    requirementId: fixture.requirement(code).id,
    confirmed,
  });
}

function checkTopic(title: string, code: string, confirmed = true) {
  return fixture.syllabus.checkTopicReference({
    ...TEACHER,
    topicId: h.topic(title).id,
    requirementId: fixture.requirement(code).id,
    confirmed,
  });
}

function approveOutline() {
  return fixture.outlines.approve({
    ...TEACHER,
    outlineId,
    revision: outlineReview().outline.revision,
  });
}

const ALL = ["C1", "CE1.1", "K1", "S1", "S2"];

describe("sin documento sustituto", () => {
  test("no hay referencias que comprobar y no se registra ninguna comprobación", () => {
    expect(outlineReview().referencesPending).toEqual([]);
    expect(h.topicReview("Tema 1").referencesPending).toEqual([]);
    expect(checkOutline("C1")).toMatchObject({
      ok: false,
      reason: "not_historical",
    });
    expect(checkTopic("Tema 1", "C1")).toMatchObject({
      ok: false,
      reason: "not_historical",
    });
    expect(
      fixture.db.prepare("SELECT COUNT(*) AS n FROM reference_check").get()?.n,
    ).toBe(0);
  });
});

describe("tras registrar un documento sustituto", () => {
  beforeEach(() => {
    fixture.supersede();
  });

  test("todo se conserva, nada se genera y las aprobaciones anteriores dejan de estar vigentes", () => {
    const review = h.review();
    expect(review.outline.historical).toBe(true);
    expect(review.outline.outline.status).toBe("approved");
    expect(review.outline.approval).toBeUndefined();
    expect(
      review.topics.every((item) => item.topic?.status === "approved"),
    ).toBe(true);
    expect(review.topics.every((item) => !item.approved)).toBe(true);
    expect(review.versions).toMatchObject([{ label: "v1", current: false }]);
    expect(fixture.sent).toEqual([]);
    expect(
      fixture.db.prepare("SELECT COUNT(*) AS n FROM topic_approval").get()?.n,
    ).toBe(4);
  });

  test("el índice no se aprueba mientras quede una referencia sin comprobar, y se dice cuáles", () => {
    expect(outlineReview().referencesPending.map((item) => item.code)).toEqual(
      ALL,
    );
    const result = approveOutline();
    expect(result).toMatchObject({ ok: false, reason: "unchecked_references" });
    if (!result.ok) {
      expect(result.pending.map((item) => item.code)).toEqual(ALL);
    }
    for (const code of ALL.slice(0, 4)) {
      expect(checkOutline(code).ok).toBe(true);
    }
    const partial = approveOutline();
    expect(partial).toMatchObject({
      ok: false,
      reason: "unchecked_references",
    });
    if (!partial.ok) {
      expect(partial.pending.map((item) => item.code)).toEqual(["S2"]);
    }
    expect(outlineReview().approval).toBeUndefined();
  });

  test("cada comprobación exige confirmación, se hace una sola vez y queda registrada con quién y cuándo", () => {
    expect(checkOutline("C1", TEACHER, false)).toMatchObject({
      ok: false,
      reason: "not_confirmed",
    });
    expect(checkOutline("C1", OTHER_TEACHER).ok).toBe(true);
    expect(checkOutline("C1")).toMatchObject({
      ok: false,
      reason: "already_checked",
    });
    expect(
      fixture.outlines.checkReference({
        ...TEACHER,
        outlineId,
        requirementId: "f".repeat(32),
        confirmed: true,
      }),
    ).toMatchObject({ ok: false, reason: "already_checked" });
    expect(outlineReview().referenceChecks).toMatchObject([
      {
        requirementId: fixture.requirement("C1").id,
        checkedBy: OTHER_TEACHER.actorId,
      },
    ]);
    expect(outlineReview().referenceChecks[0]?.checkedAt).toBeGreaterThan(0);
    // Comprobar no cambia el índice ni su revisión.
    expect(outlineReview().outline).toMatchObject({
      status: "approved",
      revision: 1,
    });
    expect(
      fixture.audit
        .list()
        .filter((event) => event.action === "outline.reference_check")
        .map((event) => event.result),
    ).toEqual(["failed", "ok", "failed", "failed"]);
    expect(() => {
      fixture.db.exec("DELETE FROM reference_check");
    }).toThrow(/append-only/);
    expect(() => {
      fixture.db.exec("UPDATE reference_check SET checked_by = 'x'");
    }).toThrow(/append-only/);
  });

  test("con todas las referencias comprobadas, el índice puede aprobarse de nuevo y esa aprobación es la vigente", () => {
    for (const code of ALL) {
      checkOutline(code);
    }
    expect(outlineReview().referencesPending).toEqual([]);
    // La aprobación anterior al sustituto sigue sin vigencia.
    expect(outlineReview().approval).toBeUndefined();
    expect(approveOutline()).toEqual({ ok: true, revision: 1 });
    expect(
      outlineReview().history.approvals.map((approval) => approval.current),
    ).toEqual([false, true]);
  });

  test("un tema no se aprueba sin sus propias comprobaciones, aunque el índice ya esté aprobado", () => {
    for (const code of ALL) {
      checkOutline(code);
    }
    approveOutline();
    expect(
      h.topicReview("Tema 1").referencesPending.map((item) => item.code),
    ).toEqual(["C1", "CE1.1"]);
    const result = h.approveTopic("Tema 1");
    expect(result).toMatchObject({ ok: false, reason: "unchecked_references" });
    if (!result.ok) {
      expect(result.pending.map((item) => item.code)).toEqual(["C1", "CE1.1"]);
    }
    expect(checkTopic("Tema 1", "C1", false)).toMatchObject({
      ok: false,
      reason: "not_confirmed",
    });
    expect(checkTopic("Tema 1", "C1").ok).toBe(true);
    expect(checkTopic("Tema 1", "C1")).toMatchObject({
      ok: false,
      reason: "already_checked",
    });
    // Un requisito que el tema no usa no es una referencia suya.
    expect(checkTopic("Tema 1", "K1")).toMatchObject({
      ok: false,
      reason: "already_checked",
    });
    expect(h.approveTopic("Tema 1")).toMatchObject({
      ok: false,
      reason: "unchecked_references",
    });
    checkTopic("Tema 1", "CE1.1");
    expect(h.approveTopic("Tema 1")).toEqual({ ok: true, revision: 2 });
    expect(h.topicReview("Tema 1").approval?.current).toBe(true);
    // Un tema sin referencias no necesita ninguna comprobación.
    expect(h.topicReview("Presentación").referencesPending).toEqual([]);
    expect(h.approveTopic("Presentación").ok).toBe(true);
  });

  test("sin el índice aprobado de nuevo, ningún tema se aprueba, ni con sus referencias comprobadas", () => {
    checkTopic("Tema 1", "C1");
    checkTopic("Tema 1", "CE1.1");
    expect(h.approveTopic("Tema 1")).toMatchObject({
      ok: false,
      reason: "outline_not_approved",
    });
  });

  test("comprobar referencias no inicia ninguna generación ni cambia ningún texto", () => {
    const before = h.review().topics.map((item) => item.topic);
    for (const code of ALL) {
      checkOutline(code);
    }
    checkTopic("Tema 1", "C1");
    expect(fixture.sent).toEqual([]);
    expect(h.review().topics.map((item) => item.topic)).toEqual(before);
  });

  test("no se desarrolla temario nuevo sobre el documento sustituido", async () => {
    expect(await fixture.syllabus.generate({ ...TEACHER, outlineId })).toEqual({
      ok: false,
      reason: "superseded",
    });
    expect(fixture.sent).toEqual([]);
  });
});
