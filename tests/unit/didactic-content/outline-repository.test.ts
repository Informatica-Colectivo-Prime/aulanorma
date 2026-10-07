// Almacenamiento del índice (specs/002-boe-scorm-export: T043; data-model.md,
// «Contenido didáctico»; FR-010, FR-012 y FR-052). Estados, entradas,
// vínculos, aprobaciones y rechazos, con lo que la base de datos impone.
import { beforeEach, describe, expect, test } from "vitest";
import {
  createOutlineFixture,
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

function ids(codes: readonly string[]): string[] {
  return codes.map((code) => fixture.requirement(code).id).sort();
}

describe("índice guardado", () => {
  test("conserva estado, revisión, origen y entradas en su orden, con sus vínculos", () => {
    const outline = fixture.outlines.get(outlineId);
    expect(outline).toMatchObject({
      id: outlineId,
      interpretationId: fixture.interpretationId,
      status: "proposed",
      revision: 1,
      createdBy: TEACHER.actorId,
    });
    expect(
      fixture.generation.getRun(outline?.generationRunId ?? ""),
    ).toMatchObject({ kind: "outline", status: "succeeded" });
    expect(
      outline?.entries.map((entry) => [
        entry.position,
        entry.title,
        entry.unsupported,
        entry.removed,
        [...entry.requirementIds].sort(),
      ]),
    ).toEqual([
      [0, "Tema 1", false, false, ids(["C1", "CE1.1"])],
      [1, "Tema 2", false, false, ids(["K1", "S1"])],
      [2, "Tema 3", false, false, ids(["S2", "K1"])],
      [3, "Presentación", true, false, []],
    ]);
  });

  test("se localiza por su identificador y por su interpretación, y un identificador que no lo es no encuentra nada", () => {
    expect(
      fixture.outlines.getForInterpretation(fixture.interpretationId)?.id,
    ).toBe(outlineId);
    expect(fixture.outlines.get("no-es-un-identificador")).toBeUndefined();
    expect(fixture.outlines.get("f".repeat(32))).toBeUndefined();
    expect(fixture.outlines.review("f".repeat(32))).toBeUndefined();
    expect(fixture.outlines.getForInterpretation("x")).toBeUndefined();
  });

  test("hay un único índice por interpretación", () => {
    expect(() =>
      fixture.db
        .prepare(
          "INSERT INTO outline (id, interpretation_id, status, revision, " +
            "generation_run_id, created_by, created_at) " +
            "VALUES (?, ?, 'proposed', 1, 'x', 'x', 0)",
        )
        .run("a".repeat(32), fixture.interpretationId),
    ).toThrow();
  });
});

describe("lo que impone la base de datos", () => {
  test("el estado solo admite sus cuatro valores", () => {
    for (const status of ["proposed", "in_review", "approved", "rejected"]) {
      fixture.db
        .prepare("UPDATE outline SET status = ? WHERE id = ?")
        .run(status, outlineId);
    }
    expect(() =>
      fixture.db
        .prepare("UPDATE outline SET status = 'published' WHERE id = ?")
        .run(outlineId),
    ).toThrow();
  });

  test("una entrada sin respaldo normativo no admite vínculos, ni al añadirlos ni al marcarla", () => {
    const outline = fixture.outlines.get(outlineId);
    const unsupported = outline?.entries.find((entry) => entry.unsupported);
    const supported = outline?.entries.find((entry) => !entry.unsupported);
    expect(() =>
      fixture.db
        .prepare(
          "INSERT INTO entry_requirement (outline_entry_id, requirement_id) " +
            "VALUES (?, ?)",
        )
        .run(unsupported?.id ?? "", fixture.requirement("C1").id),
    ).toThrow(/unsupported entry/);
    expect(() =>
      fixture.db
        .prepare("UPDATE outline_entry SET unsupported = 1 WHERE id = ?")
        .run(supported?.id ?? ""),
    ).toThrow(/unsupported entry/);
  });

  test("ni el índice ni sus entradas se borran", () => {
    expect(() => {
      fixture.db.exec("DELETE FROM outline");
    }).toThrow(/cannot be deleted/);
    expect(() => {
      fixture.db.exec("DELETE FROM outline_entry");
    }).toThrow(/cannot be deleted/);
  });

  test("cambios, aprobaciones y rechazos son de solo inserción", () => {
    const outlines = fixture.outlines;
    const target = { ...TEACHER, outlineId };
    outlines.addEntry({
      ...target,
      revision: 1,
      entry: { title: "Otra", requirementIds: [] },
    });
    outlines.approve({ ...target, revision: 2 });
    outlines.reject({ ...target, revision: 2, reason: "No convence." });
    for (const table of ["outline_change", "outline_approval", "rejection"]) {
      expect(
        fixture.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()?.n,
      ).toBe(1);
      expect(() => {
        fixture.db.exec(`UPDATE ${table} SET id = 'x'`);
      }).toThrow(/append-only/);
      expect(() => {
        fixture.db.exec(`DELETE FROM ${table}`);
      }).toThrow(/append-only/);
      expect(() => {
        fixture.db.exec(
          `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`,
        );
      }).toThrow(/append-only/);
    }
    expect(() => {
      fixture.db.exec("UPDATE rejection SET reason = '' WHERE 1");
    }).toThrow();
  });

  test("un rechazo exige un motivo y solo apunta a un índice o a un tema", () => {
    const insert = (kind: string, reason: string) => () => {
      fixture.db
        .prepare(
          "INSERT INTO rejection (id, target_kind, target_id, " +
            "target_revision, rejected_by, rejected_at, reason) " +
            "VALUES (?, ?, 'x', 1, 'x', 0, ?)",
        )
        .run(`${kind}-${reason}`, kind, reason);
    };
    expect(insert("outline", "  ")).toThrow();
    expect(insert("interpretation", "motivo")).toThrow();
    expect(insert("topic", "motivo")).not.toThrow();
  });
});

describe("revisión completa de un índice", () => {
  test("reúne el índice, su interpretación, la cobertura calculada y el registro", () => {
    const review = fixture.outlines.review(outlineId);
    expect(review?.outline.id).toBe(outlineId);
    expect(review?.interpretation.id).toBe(fixture.interpretationId);
    expect(review?.interpretationValid).toBe(true);
    expect(review?.historical).toBe(false);
    expect(review?.approval).toBeUndefined();
    expect(review?.coverage.complete).toBe(true);
    expect(review?.history).toEqual({
      changes: [],
      approvals: [],
      rejections: [],
    });
    // La propuesta no altera la cobertura: es la misma que la calculada.
    expect(proposal().entries).toHaveLength(
      review?.outline.entries.length ?? 0,
    );
  });
});
