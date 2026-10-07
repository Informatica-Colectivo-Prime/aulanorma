// Generación (specs/002-boe-scorm-export: FR-019, FR-029 y FR-055; SC-005 y
// SC-044; contracts/generation-provider.md; research.md, R6; principio IX).
//
// Interfaz propia entre el dominio y cualquier proveedor de IA. El dominio no
// importa ningún SDK: pide una salida estructurada a través de `Generation`,
// que valida la salida con su esquema, aplica la comprobación del dominio y
// registra cada llamada con qué se hizo, su coste estimado y si el resultado
// fue válido. Una salida inválida nunca se repara ni se guarda.
//
// El único adaptador que existe es el determinista, con respuestas grabadas.
// El proveedor real no está seleccionado: no hay ningún SDK instalado ni se
// hace ninguna llamada de pago.
//
// Presupuesto: ninguna operación se envía sin una reserva de su coste máximo
// dentro de los límites (`./budget`). El envío se anota antes de llamar al
// proveedor; con el consumo confirmado la reserva se liquida, y si no puede
// confirmarse (sin datos de consumo, tiempo agotado o fallo) queda incierta y
// sigue contando.
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { Database } from "@/platform/persistence";
import type { Budget, ReserveRefusal } from "./budget";

export { createBudget, MAX_AMOUNT } from "./budget";
export type {
  Budget,
  BudgetChange,
  BudgetChangeResult,
  BudgetStatus,
  ReconcileResult,
  Reservation,
  ReservationState,
  ReserveRefusal,
  ReserveResult,
} from "./budget";

export type GenerationTask = "interpretation" | "outline" | "topic";
export type GenerationRunKind = "interpretation" | "outline" | "syllabus";
export type GenerationRunStatus =
  "running" | "succeeded" | "failed" | "incomplete";
export type CallValidation =
  "valid" | "invalid_output" | "provider_error" | "rejected_by_domain";

// Lo que recibe un proveedor. Las instrucciones y los datos van separados: el
// texto del documento viaja siempre dentro de `input`, como dato. `input` no
// debe llevar datos de usuarios ni secretos de autenticación.
export interface ProviderRequest {
  readonly task: GenerationTask;
  readonly promptVersion: string;
  readonly instructions: string;
  readonly input: unknown;
  readonly maxOutputTokens: number;
}

export interface Usage {
  readonly model: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
}

// `cost` es el consumo confirmado de la operación, en millonésimas de la
// moneda; `null` si el proveedor no lo confirma.
export type ProviderReply =
  | {
      readonly ok: true;
      readonly output: unknown;
      readonly usage: Usage;
      readonly cost: number | null;
    }
  | { readonly ok: false; readonly usage: Usage; readonly cost: number | null };

export interface GenerationProvider {
  readonly name: string;
  // Estimación orientativa del coste de la operación, en millonésimas de la
  // moneda. Es lo que se muestra; no es lo que se reserva.
  estimateCost(request: ProviderRequest): number;
  // Coste máximo de la operación: lo que se reserva antes de enviarla.
  maxCost(request: ProviderRequest): number;
  generate(request: ProviderRequest): Promise<ProviderReply>;
}

export interface CostEstimate {
  readonly estimatedCost: number;
  readonly maxCost: number;
}

export interface GenerationRequest<Output> extends ProviderRequest {
  // Esquema versionado que debe cumplir la salida.
  readonly outputSchema: z.ZodType<Output>;
  // Lo que el esquema no puede comprobar. Si devuelve `false`, la salida se
  // rechaza y se registra, igual que una que no cumple el esquema.
  readonly accept?: (output: Output) => boolean;
}

export type GenerationResult<Output> =
  | { readonly status: "ok"; readonly output: Output }
  | {
      readonly status:
        "invalid_output" | "provider_error" | "rejected_by_domain";
    }
  // No había una reserva posible dentro de los límites: no se envió nada.
  | { readonly status: "budget_exceeded"; readonly reason: ReserveRefusal };

export interface GenerationCall {
  readonly id: string;
  readonly runId: string;
  readonly at: number;
  readonly task: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly latencyMs: number;
  readonly estimatedCost: number;
  readonly validationResult: CallValidation;
}

export interface GenerationRun {
  readonly id: string;
  readonly kind: GenerationRunKind;
  readonly targetId: string;
  readonly requestedBy: string;
  readonly requestedAt: number;
  readonly status: GenerationRunStatus;
  readonly estimatedCost: number;
  readonly finishedAt: number | null;
}

export interface Generation {
  readonly provider: string;
  readonly budget: Budget;
  // Estimación y coste máximo de una operación, sin enviarla ni reservar.
  estimate(request: ProviderRequest): CostEstimate;
  startRun(input: {
    readonly kind: GenerationRunKind;
    readonly targetId: string;
    readonly requestedBy: string;
  }): string;
  call<Output>(
    runId: string,
    request: GenerationRequest<Output>,
  ): Promise<GenerationResult<Output>>;
  finishRun(
    runId: string,
    status: Exclude<GenerationRunStatus, "running">,
  ): void;
  getRun(runId: string): GenerationRun | undefined;
  listCalls(runId: string): readonly GenerationCall[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

const RUN_STATUSES: readonly GenerationRunStatus[] = [
  "running",
  "succeeded",
  "failed",
  "incomplete",
];
const RUN_KINDS: readonly GenerationRunKind[] = [
  "interpretation",
  "outline",
  "syllabus",
];
const VALIDATIONS: readonly CallValidation[] = [
  "valid",
  "invalid_output",
  "provider_error",
  "rejected_by_domain",
];

// Tiempo máximo de espera de una operación, por defecto.
export const DEFAULT_CALL_TIMEOUT_MS = 120_000;

export function createGeneration({
  db,
  provider,
  budget,
  now,
  callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS,
}: {
  readonly db: Database;
  readonly provider: GenerationProvider;
  readonly budget: Budget;
  readonly now: () => number;
  readonly callTimeoutMs?: number;
}): Generation {
  // La respuesta del proveedor, o `null` si falla o agota el tiempo.
  const ask = async (
    request: ProviderRequest,
  ): Promise<ProviderReply | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        provider.generate(request),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            resolve(null);
          }, callTimeoutMs);
        }),
      ]);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  const recordCall = (
    callId: string,
    runId: string,
    request: ProviderRequest,
    usage: Usage,
    latencyMs: number,
    estimatedCost: number,
    validation: CallValidation,
  ): void => {
    db.prepare(
      "INSERT INTO generation_call (id, run_id, at, task, provider, model, " +
        "prompt_version, tokens_in, tokens_out, latency_ms, estimated_cost, " +
        "validation_result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      callId,
      runId,
      now(),
      request.task,
      provider.name,
      usage.model,
      request.promptVersion,
      usage.tokensIn,
      usage.tokensOut,
      latencyMs,
      estimatedCost,
      validation,
    );
    db.prepare(
      "UPDATE generation_run SET estimated_cost = estimated_cost + ? " +
        "WHERE id = ?",
    ).run(estimatedCost, runId);
  };

  return {
    provider: provider.name,
    budget,

    estimate(request) {
      return {
        estimatedCost: provider.estimateCost(request),
        maxCost: provider.maxCost(request),
      };
    },

    startRun({ kind, targetId, requestedBy }) {
      const id = randomBytes(16).toString("hex");
      db.prepare(
        "INSERT INTO generation_run (id, kind, target_id, requested_by, " +
          "requested_at, status, estimated_cost) VALUES (?, ?, ?, ?, ?, ?, 0)",
      ).run(id, kind, targetId, requestedBy, now(), "running");
      return id;
    },

    async call(runId, request) {
      const { outputSchema, accept, ...providerRequest } = request;
      const estimatedCost = provider.estimateCost(providerRequest);
      // Sin reserva dentro de los límites, la operación no se envía.
      const reservation = budget.reserve({
        runId,
        task: request.task,
        maxCost: provider.maxCost(providerRequest),
      });
      if (!reservation.ok) {
        return { status: "budget_exceeded", reason: reservation.reason };
      }
      const { reservationId } = reservation;
      // El envío se anota antes de llamar: si el proceso cae después, la
      // reserva consta como enviada y sigue contando.
      budget.markSent(reservationId);
      const startedAt = now();
      const reply = await ask(providerRequest);
      const latencyMs = Math.max(0, now() - startedAt);
      const callId = randomBytes(16).toString("hex");
      if (reply?.cost === null || reply === null) {
        budget.markUncertain(reservationId, callId);
      } else if (!budget.settle(reservationId, reply.cost, callId)) {
        // Un consumo que no es un importe válido tampoco está confirmado.
        budget.markUncertain(reservationId, callId);
      }
      const record = (validation: CallValidation): void => {
        recordCall(
          callId,
          runId,
          providerRequest,
          reply?.usage ?? { model: "unknown", tokensIn: 0, tokensOut: 0 },
          latencyMs,
          estimatedCost,
          validation,
        );
      };
      if (!reply?.ok) {
        record("provider_error");
        return { status: "provider_error" };
      }
      const parsed = outputSchema.safeParse(reply.output);
      if (!parsed.success) {
        record("invalid_output");
        return { status: "invalid_output" };
      }
      if (accept !== undefined && !accept(parsed.data)) {
        record("rejected_by_domain");
        return { status: "rejected_by_domain" };
      }
      record("valid");
      return { status: "ok", output: parsed.data };
    },

    finishRun(runId, status) {
      db.prepare(
        "UPDATE generation_run SET status = ?, finished_at = ? " +
          "WHERE id = ? AND status = 'running'",
      ).run(status, now(), runId);
    },

    getRun(runId) {
      const row = db
        .prepare("SELECT * FROM generation_run WHERE id = ?")
        .get(runId);
      if (row === undefined) {
        return undefined;
      }
      return {
        id: text(row.id),
        kind: RUN_KINDS.find((kind) => kind === row.kind) ?? "interpretation",
        targetId: text(row.target_id),
        requestedBy: text(row.requested_by),
        requestedAt: integer(row.requested_at),
        status:
          RUN_STATUSES.find((status) => status === row.status) ?? "failed",
        estimatedCost: integer(row.estimated_cost),
        finishedAt: row.finished_at === null ? null : integer(row.finished_at),
      };
    },

    listCalls(runId) {
      return db
        .prepare(
          "SELECT * FROM generation_call WHERE run_id = ? ORDER BY at, id",
        )
        .all(runId)
        .map((row) => ({
          id: text(row.id),
          runId: text(row.run_id),
          at: integer(row.at),
          task: text(row.task),
          provider: text(row.provider),
          model: text(row.model),
          promptVersion: text(row.prompt_version),
          tokensIn: integer(row.tokens_in),
          tokensOut: integer(row.tokens_out),
          latencyMs: integer(row.latency_ms),
          estimatedCost: integer(row.estimated_cost),
          validationResult:
            VALIDATIONS.find((item) => item === row.validation_result) ??
            "provider_error",
        }));
    },
  };
}

// --- Adaptador determinista ---

export interface Recording {
  readonly task: GenerationTask;
  readonly promptVersion: string;
  // Huella de la entrada exacta a la que responde: `inputDigest(input)`.
  readonly inputSha256: string;
  readonly output: unknown;
}

const RECORDING = z.object({
  task: z.enum(["interpretation", "outline", "topic"]),
  promptVersion: z.string().min(1).max(40),
  inputSha256: z.string().regex(/^[0-9a-f]{64}$/),
  output: z.unknown(),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return value === undefined ? "null" : JSON.stringify(value);
}

// Huella de una entrada, independiente del orden de sus claves.
export function inputDigest(input: unknown): string {
  return createHash("sha256").update(canonical(input)).digest("hex");
}

export const DETERMINISTIC_PROVIDER = "deterministic";
export const DETERMINISTIC_MODEL = "recorded";

// Adaptador con respuestas fijas y grabadas. Responde solo a la entrada
// exacta de una grabación; ante cualquier otra, falla como un proveedor que
// no responde. No usa red y no cuesta nada: su estimación, su coste máximo y
// su consumo son cero, y no son precios de ningún proveedor. No acredita la
// calidad ni el coste de una generación real.
export function createDeterministicProvider(
  recordings: readonly Recording[],
): GenerationProvider {
  const usage: Usage = {
    model: DETERMINISTIC_MODEL,
    tokensIn: 0,
    tokensOut: 0,
  };
  return {
    name: DETERMINISTIC_PROVIDER,
    estimateCost: () => 0,
    maxCost: () => 0,
    generate(request) {
      const digest = inputDigest(request.input);
      const recording = recordings.find(
        (item) =>
          item.task === request.task &&
          item.promptVersion === request.promptVersion &&
          item.inputSha256 === digest,
      );
      return Promise.resolve(
        recording === undefined
          ? { ok: false, usage, cost: 0 }
          : { ok: true, output: recording.output, usage, cost: 0 },
      );
    },
  };
}

// Lee las grabaciones de un directorio: un fichero `.json` por grabación. Un
// directorio que no existe no tiene grabaciones; un fichero que no cumple el
// formato es un error.
export function loadRecordings(directory: string): readonly Recording[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) =>
      RECORDING.parse(JSON.parse(readFileSync(`${directory}/${name}`, "utf8"))),
    );
}
