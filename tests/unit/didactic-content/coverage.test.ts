// Cobertura del índice (specs/002-boe-scorm-export: T044; FR-011, FR-012 y
// FR-058; SC-001, SC-002 y SC-027). Vínculos explícitos, sin herencia entre
// padre e hijos en ningún sentido y sin contar las entradas sin respaldo.
import { describe, expect, test } from "vitest";
import { computeCoverage } from "@/modules/didactic-content";
import type { CoverageEntry } from "@/modules/didactic-content";
import type { Requirement } from "@/modules/structured-interpretation";

function requirement(
  id: string,
  parentId: string | null,
  kind: Requirement["kind"],
  withdrawn = false,
): Requirement {
  return {
    id,
    kind,
    parentId,
    position: 0,
    code: id,
    text: `Texto de ${id}`,
    section: "Sección",
    pageFrom: 1,
    pageTo: 1,
    quote: null,
    origin: "generated",
    withdrawn,
    depth: parentId === null ? 0 : 1,
  };
}

function entry(
  id: string,
  requirementIds: readonly string[],
  flags: Partial<Pick<CoverageEntry, "unsupported" | "removed">> = {},
): CoverageEntry {
  return { id, unsupported: false, removed: false, requirementIds, ...flags };
}

const INVENTORY = [
  requirement("capacidad", null, "capability"),
  requirement("criterio", "capacidad", "criterion"),
  requirement("contenido", null, "content"),
  requirement("subapartado", "contenido", "subcontent"),
  requirement("detalle", "subapartado", "subcontent"),
];
const ALL = INVENTORY.map((item) => item.id);

function pendingOf(entries: readonly CoverageEntry[]): string[] {
  return computeCoverage(INVENTORY, entries).pending.map((item) => item.id);
}

describe("computeCoverage", () => {
  test("cada requisito aparece una vez, en el orden del inventario, con las entradas que lo vinculan", () => {
    const first = entry("a", ["capacidad", "criterio"]);
    const second = entry("b", ["criterio", "contenido"]);
    const coverage = computeCoverage(INVENTORY, [first, second]);
    expect(coverage.items.map((item) => item.requirement.id)).toEqual(ALL);
    expect(coverage.items.map((item) => item.entries)).toEqual([
      [first],
      [first, second],
      [second],
      [],
      [],
    ]);
    expect(coverage.pending.map((item) => item.id)).toEqual([
      "subapartado",
      "detalle",
    ]);
    expect(coverage.complete).toBe(false);
  });

  test("está completa solo cuando cada requisito tiene su propio vínculo", () => {
    expect(computeCoverage(INVENTORY, [entry("a", ALL)]).complete).toBe(true);
    expect(
      computeCoverage(
        INVENTORY,
        ALL.map((id) => entry(`e-${id}`, [id])),
      ).complete,
    ).toBe(true);
    for (const missing of ALL) {
      const coverage = computeCoverage(INVENTORY, [
        entry(
          "a",
          ALL.filter((id) => id !== missing),
        ),
      ]);
      expect(coverage.complete).toBe(false);
      expect(coverage.pending.map((item) => item.id)).toEqual([missing]);
    }
  });

  test("cubrir un elemento no cubre los que dependen de él", () => {
    expect(pendingOf([entry("a", ["capacidad", "contenido"])])).toEqual([
      "criterio",
      "subapartado",
      "detalle",
    ]);
  });

  test("cubrir un elemento no cubre aquel del que depende", () => {
    expect(pendingOf([entry("a", ["criterio", "detalle"])])).toEqual([
      "capacidad",
      "contenido",
      "subapartado",
    ]);
  });

  test("una entrada sin respaldo normativo no cubre nada ni compensa un requisito sin cubrir", () => {
    const entries = [
      entry("a", ALL.slice(0, 4)),
      entry("extra-1", [], { unsupported: true }),
      entry("extra-2", [], { unsupported: true }),
    ];
    const coverage = computeCoverage(INVENTORY, entries);
    expect(coverage.pending.map((item) => item.id)).toEqual(["detalle"]);
    expect(coverage.complete).toBe(false);
    // Ni aunque arrastrase vínculos: marcada sin respaldo, no cuenta.
    expect(pendingOf([entry("a", ALL, { unsupported: true })])).toEqual(ALL);
  });

  test("una entrada quitada deja de cubrir", () => {
    expect(pendingOf([entry("a", ALL, { removed: true })])).toEqual(ALL);
  });

  test("un requisito retirado no forma parte del inventario y un vínculo a un requisito desconocido no cubre nada", () => {
    const inventory = [
      ...INVENTORY,
      requirement("retirado", null, "content", true),
    ];
    const coverage = computeCoverage(inventory, [
      entry("a", [...ALL, "retirado", "desconocido"]),
    ]);
    expect(coverage.items.map((item) => item.requirement.id)).toEqual(ALL);
    expect(coverage.complete).toBe(true);
  });

  test("sin inventario o sin entradas no hay cobertura completa", () => {
    expect(computeCoverage([], [entry("a", ["x"])]).complete).toBe(false);
    expect(computeCoverage(INVENTORY, []).complete).toBe(false);
    expect(pendingOf([])).toEqual(ALL);
  });
});
