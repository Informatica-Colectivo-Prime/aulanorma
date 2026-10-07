// Cobertura del índice (specs/002-boe-scorm-export: FR-011 a FR-013 y FR-058;
// data-model.md, «Cobertura»).
//
// Se calcula, nunca se almacena ni se declara: contrasta el inventario vigente
// de la interpretación con los vínculos explícitos de las entradas del índice,
// requisito a requisito. Un requisito está cubierto solo si alguna entrada
// vigente lo vincula directamente. No hay herencia en ningún sentido: cubrir
// un elemento no cubre los que dependen de él ni aquel del que depende. Una
// entrada «sin respaldo normativo» no tiene vínculos y no cubre nada, y una
// entrada quitada tampoco.
//
// La cobertura no garantiza que el inventario recoja todo lo que contiene el
// documento oficial: ese límite se declara allí donde se muestra.
import type { Requirement } from "@/modules/structured-interpretation";

// Lo que la cobertura necesita de una entrada del índice.
export interface CoverageEntry {
  readonly id: string;
  readonly unsupported: boolean;
  readonly removed: boolean;
  readonly requirementIds: readonly string[];
}

export interface CoverageItem<Entry extends CoverageEntry> {
  readonly requirement: Requirement;
  // Entradas vigentes que lo vinculan. Vacío: no cubierto.
  readonly entries: readonly Entry[];
}

export interface Coverage<Entry extends CoverageEntry> {
  // Un elemento por requisito del inventario vigente, en su orden.
  readonly items: readonly CoverageItem<Entry>[];
  // Requisitos sin ninguna entrada que los vincule.
  readonly pending: readonly Requirement[];
  // `true` solo si hay inventario y no queda ningún requisito pendiente.
  readonly complete: boolean;
}

export function computeCoverage<Entry extends CoverageEntry>(
  // Inventario de la interpretación. Los requisitos retirados no cuentan.
  inventory: readonly Requirement[],
  entries: readonly Entry[],
): Coverage<Entry> {
  const live = entries.filter((entry) => !entry.removed && !entry.unsupported);
  const items = inventory
    .filter((requirement) => !requirement.withdrawn)
    .map((requirement) => ({
      requirement,
      entries: live.filter((entry) =>
        entry.requirementIds.includes(requirement.id),
      ),
    }));
  const pending = items
    .filter((item) => item.entries.length === 0)
    .map((item) => item.requirement);
  return {
    items,
    pending,
    complete: items.length > 0 && pending.length === 0,
  };
}
