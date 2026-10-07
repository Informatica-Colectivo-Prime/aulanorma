// Piezas que comparten las vistas: fechas, nombres de cuentas, enlaces a las
// páginas del documento, importes del presupuesto y la respuesta común.
import type { RequirementKind } from "@/modules/structured-interpretation";
import { html, layout } from "@/platform/web";
import type { Html, PageReply, SessionContext } from "@/platform/web";

export const KIND_NAMES: Readonly<Record<RequirementKind, string>> = {
  capability: "Capacidad",
  criterion: "Criterio de evaluación",
  content: "Contenido",
  subcontent: "Subapartado",
};

// Fecha y hora en UTC, sin depender de la configuración regional.
export function moment(at: number): string {
  return `${new Date(at).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export type Names = ReadonlyMap<string, string>;

export function who(names: Names, id: string): string {
  return names.get(id) ?? "cuenta desconocida";
}

export function pagesLabel(from: number, to: number): string {
  return from === to
    ? `página ${String(from)}`
    : `páginas ${String(from)} a ${String(to)}`;
}

export function pageLink(documentId: string, number: number): Html {
  return html`<a href="/documents/${documentId}/pages/${number}"
    >página ${number}</a
  >`;
}

export function pageLinks(documentId: string, from: number, to: number): Html {
  return to === from
    ? pageLink(documentId, from)
    : html`${pageLink(documentId, from)} a ${pageLink(documentId, to)}`;
}

export function reply(
  status: number,
  title: string,
  session: SessionContext,
  content: Html,
): PageReply {
  return { status, page: layout({ title, session, content }) };
}

// Importes del presupuesto de generación, en millonésimas de su moneda.
export interface BudgetFigures {
  readonly available: number;
  readonly maxOperationCost: number;
  readonly currency: string;
}

export interface CostFigures {
  readonly estimatedCost: number;
  readonly maxCost: number;
}

// Importe legible. `XXX` es la moneda sin fijar: no hay proveedor
// seleccionado, así que el importe no es un precio.
export function amount(value: number, currency: string): string {
  const figure = (value / 1_000_000).toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  return currency === "XXX"
    ? `${figure} unidades (moneda sin fijar)`
    : `${figure} ${currency}`;
}

// Lo que se muestra antes de pedir una generación: la estimación, que es
// orientativa, separada del máximo que se reserva, y lo disponible (FR-021).
export function budgetNote(input: {
  readonly budget: BudgetFigures;
  readonly cost: CostFigures | undefined;
  readonly provider: string;
}): Html {
  const { budget, cost } = input;
  const available = Math.max(0, budget.available);
  return html`<dl>
      ${
        cost === undefined
          ? null
          : html`<dt>Estimación del coste (orientativa)</dt>
              <dd>${amount(cost.estimatedCost, budget.currency)}</dd>
              <dt>Coste máximo que se reserva para la operación</dt>
              <dd>${amount(cost.maxCost, budget.currency)}</dd>`
      }
      <dt>Presupuesto disponible</dt>
      <dd>${amount(available, budget.currency)}</dd>
      <dt>Máximo por operación</dt>
      <dd>${amount(budget.maxOperationCost, budget.currency)}</dd>
    </dl>
    <p class="hint">
      ${
        input.provider === "deterministic"
          ? "Coste simulado: estas cifras son del adaptador determinista, que responde con una grabación y no cuesta nada. No son precios de ningún proveedor."
          : "La operación solo se envía si su coste máximo cabe en lo disponible y no supera el máximo por operación."
      }
      Sin una reserva dentro de los límites, no se envía nada.
    </p>`;
}

// Los tres importes de una operación ya hecha, sin mezclarlos.
export interface RunCostFigures {
  readonly estimatedCost: number;
  readonly reservedCost: number;
  readonly confirmedCost: number;
  readonly uncertain: number;
  readonly currency: string;
}

export function runCostNote(cost: RunCostFigures, provider: string): Html {
  return html`<br /><span class="hint"
      >Estimación: ${amount(cost.estimatedCost, cost.currency)} · Reserva
      máxima: ${amount(cost.reservedCost, cost.currency)} · Consumo confirmado:
      ${
        cost.uncertain > 0
          ? "sin confirmar; la reserva sigue contando hasta que se concilie"
          : amount(cost.confirmedCost, cost.currency)
      }${provider === "deterministic" ? " · Coste simulado" : ""}</span
    >`;
}
