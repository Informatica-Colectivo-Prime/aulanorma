// Moneda del presupuesto (specs/002-boe-scorm-export: T075 y T076;
// contracts/generation-provider.md, «Presupuesto»). El presupuesto nace sin
// moneda; se fija al activar un proveedor con precios, y nunca se le asigna
// una a importes anotados sin ella.
import { beforeEach, describe, expect, test } from "vitest";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import { createBudget } from "@/platform/generation";
import type { Budget } from "@/platform/generation";
import {
  migrate,
  openMemoryDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";

let budget: Budget;
let audit: Audit;

beforeEach(() => {
  const db = openMemoryDatabase();
  migrate(db, PLATFORM_MIGRATIONS);
  audit = createAudit(db);
  let clock = Date.UTC(2026, 9, 9);
  budget = createBudget({
    db,
    audit,
    now: () => (clock += 1),
    maxOperationCost: 2_000_000,
  });
});

function setLimit(newLimit: number): void {
  budget.setLimit({
    newLimit,
    revision: budget.status().revision,
    actorId: "administrador-1",
    correlationId: "prueba",
  });
}

describe("fijar la moneda", () => {
  test("con el presupuesto recién creado se fija, queda registrado y repetirlo no cambia nada", () => {
    expect(budget.status().currency).toBe("XXX");
    expect(budget.fixCurrency("USD")).toBe("ok");
    expect(budget.status()).toMatchObject({ currency: "USD", limit: 0 });
    expect(budget.fixCurrency("USD")).toBe("ok");
    expect(
      audit.list().filter((event) => event.action === "budget.currency"),
    ).toMatchObject([
      { actorId: null, result: "ok", details: { currency: "USD" } },
    ]);
  });

  test("con un límite fijado sin moneda no se le asigna una después", () => {
    setLimit(12_500_000);
    expect(budget.fixCurrency("USD")).toBe("amounts_without_currency");
    expect(budget.status()).toMatchObject({
      currency: "XXX",
      limit: 12_500_000,
    });
    expect(
      audit.list().filter((event) => event.action === "budget.currency"),
    ).toEqual([]);
    // Con el límite de nuevo a cero, sí.
    setLimit(0);
    expect(budget.fixCurrency("USD")).toBe("ok");
  });

  test("con la moneda ya fijada, otra distinta no la sustituye", () => {
    expect(budget.fixCurrency("USD")).toBe("ok");
    setLimit(1_000_000);
    expect(budget.fixCurrency("EUR")).toBe("other_currency");
    expect(budget.status().currency).toBe("USD");
    // La misma, con un límite ya fijado en ella, se da por buena.
    expect(budget.fixCurrency("USD")).toBe("ok");
  });

  test("una moneda que no es un código de tres letras no se fija", () => {
    expect(budget.fixCurrency("dólares")).toBe("other_currency");
    expect(budget.status().currency).toBe("XXX");
  });
});
