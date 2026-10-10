// Generación (specs/002-boe-scorm-export: FR-019, FR-029 y FR-055; SC-005 y
// SC-044; contracts/generation-provider.md; research.md, R6; principio IX).
//
// Interfaz propia entre el dominio y cualquier proveedor de IA. El dominio no
// importa ningún SDK: pide una salida estructurada a través de `Generation`,
// que valida la salida con su esquema, aplica la comprobación del dominio y
// registra cada llamada con qué se hizo, su coste estimado y si el resultado
// fue válido. Una salida inválida nunca se repara ni se guarda.
//
// Hay dos adaptadores. El determinista, con respuestas grabadas, es el de las
// pruebas y la integración continua, y el que se usa si la configuración no
// dice otra cosa. El de OpenAI (`./adapters/openai`) es el proveedor real: solo
// se activa desde la configuración del servidor y es el único fichero de
// `src/` que importa un SDK de proveedor.
//
// Presupuesto: ninguna operación se envía sin una reserva de su coste máximo
// dentro de los límites (`./budget`). El envío se anota antes de llamar al
// proveedor; con el consumo confirmado la reserva se liquida, y si no puede
// confirmarse (sin datos de consumo, tiempo agotado o fallo) queda incierta y
// sigue contando. Al agotarse el tiempo se avisa al adaptador para que cierre
// la petición; la operación no se reenvía.
import { createHash, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import type { Database } from "@/platform/persistence";
import type { Budget, ReserveRefusal } from "./budget";

export { recoverInterruptedReservations } from "./recovery";

export {
  createOpenAiProvider,
  OPENAI_CURRENCY,
  OPENAI_PROVIDER,
  openAiCost,
  strictJsonSchema,
} from "./adapters/openai";
export type {
  OpenAiPrices,
  OpenAiSettings,
  OpenAiUsage,
} from "./adapters/openai";

export { createBudget, MAX_AMOUNT } from "./budget";
export type {
  Budget,
  BudgetChange,
  BudgetChangeResult,
  BudgetStatus,
  FixCurrencyResult,
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
  // Esquema versionado que debe cumplir la salida. Un adaptador puede usarlo
  // para pedir una salida estructurada; cumplirlo lo comprueba `Generation`,
  // nunca el adaptador.
  readonly outputSchema: z.ZodType;
  // Límite de la salida visible. Un adaptador puede añadir su propia reserva
  // para lo que el proveedor factura además, y la incluye en `maxCost`.
  readonly maxOutputTokens: number;
}

export interface ProviderCallOptions {
  // Se activa cuando se agota el tiempo de espera de la operación.
  readonly signal: AbortSignal;
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
  // Comprobación previa al envío, que no genera nada: `false` si el adaptador no
  // puede sostener que la operación quepa en el coste máximo que declaró.
  // Entonces la operación no se envía y su reserva se libera. Un adaptador
  // cuyo coste máximo no depende de nada externo no la necesita.
  admit?(
    request: ProviderRequest,
    options?: ProviderCallOptions,
  ): Promise<boolean>;
  generate(
    request: ProviderRequest,
    options?: ProviderCallOptions,
  ): Promise<ProviderReply>;
}

export interface CostEstimate {
  readonly estimatedCost: number;
  readonly maxCost: number;
}

export interface GenerationRequest<Output> extends ProviderRequest {
  readonly outputSchema: z.ZodType<Output>;
  // Lo que el esquema no puede comprobar. Si devuelve `false`, la salida se
  // rechaza y se registra, igual que una que no cumple el esquema.
  readonly accept?: (output: Output) => boolean;
  // Lo que autorizó la operación en el dominio, comprobado de nuevo justo
  // antes de anotar el envío, después de cualquier espera previa. Si
  // devuelve `false`, la operación no se envía y su reserva se libera. Es
  // una comprobación del dominio: ningún adaptador la conoce.
  readonly authorized?: () => boolean;
}

// `callId` identifica la llamada registrada. `uncertain` indica que el
// consumo de la operación no pudo confirmarse: su reserva sigue contando hasta
// que se concilie, y la operación no debe reenviarse por su cuenta.
export type GenerationResult<Output> =
  | {
      readonly status: "ok";
      readonly output: Output;
      readonly callId: string;
      readonly uncertain: boolean;
    }
  | {
      readonly status:
        "invalid_output" | "provider_error" | "rejected_by_domain";
      readonly callId: string;
      readonly uncertain: boolean;
    }
  // No había una reserva posible dentro de los límites: no se envió nada.
  | { readonly status: "budget_exceeded"; readonly reason: ReserveRefusal }
  // Lo que autorizaba la operación dejó de cumplirse antes de enviarla: no
  // se envió nada y su reserva quedó liberada.
  | { readonly status: "withdrawn" };

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

// Los tres importes de una ejecución, que no se mezclan: lo estimado, lo
// reservado como máximo y lo confirmado como consumo.
export interface RunCost {
  readonly estimatedCost: number;
  readonly reservedCost: number;
  // Consumo confirmado de las operaciones liquidadas.
  readonly confirmedCost: number;
  // Operaciones cuyo consumo no está confirmado y siguen contando.
  readonly uncertain: number;
}

export interface Generation {
  readonly provider: string;
  readonly budget: Budget;
  // Tiempo máximo de espera de una operación, en milisegundos.
  readonly callTimeoutMs: number;
  // Tras un arranque: una ejecución que constaba en curso no sigue en ningún
  // proceso y queda incompleta. Devuelve cuántas cambió.
  recoverInterruptedRuns(): number;
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
  // Ejecuciones pedidas para un elemento, de la más antigua a la más reciente.
  listRuns(kind: GenerationRunKind, targetId: string): readonly GenerationRun[];
  runCost(runId: string): RunCost;
  listCalls(runId: string): readonly GenerationCall[];
  // Recuento de lo registrado, para las métricas mínimas.
  summary(): GenerationSummary;
}

export interface GenerationSummary {
  readonly runs: Readonly<Record<GenerationRunStatus, number>>;
  readonly calls: number;
  readonly callsByResult: Readonly<Record<CallValidation, number>>;
  // Latencia de las llamadas registradas, en milisegundos; `null` sin
  // llamadas.
  readonly latencyMs: {
    readonly mean: number;
    readonly p95: number;
    readonly max: number;
  } | null;
  readonly providers: readonly string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function integer(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function runOf(row: Record<string, unknown>): GenerationRun {
  return {
    id: text(row.id),
    kind: RUN_KINDS.find((kind) => kind === row.kind) ?? "interpretation",
    targetId: text(row.target_id),
    requestedBy: text(row.requested_by),
    requestedAt: integer(row.requested_at),
    status: RUN_STATUSES.find((status) => status === row.status) ?? "failed",
    estimatedCost: integer(row.estimated_cost),
    finishedAt: row.finished_at === null ? null : integer(row.finished_at),
  };
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
  // Lo que devuelve una llamada al adaptador, o `null` si falla o agota el
  // tiempo; al agotarlo, se le avisa para que cierre la petición.
  const within = async <Result>(
    start: (options: ProviderCallOptions) => Promise<Result>,
  ): Promise<Result | null> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    try {
      return await Promise.race([
        start({ signal: controller.signal }),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
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

  // La respuesta del proveedor. Sin ella, la operación ya se envió: cerrarla
  // no confirma su consumo.
  const ask = (request: ProviderRequest): Promise<ProviderReply | null> =>
    within((options) => provider.generate(request, options));

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
    callTimeoutMs,

    recoverInterruptedRuns() {
      return Number(
        db
          .prepare(
            "UPDATE generation_run SET status = 'incomplete', " +
              "finished_at = ? WHERE status = 'running'",
          )
          .run(now()).changes,
      );
    },

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
      const { accept, authorized, ...providerRequest } = request;
      const { outputSchema } = request;
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
      // Si el adaptador no puede sostener su coste máximo para esta
      // operación, o no puede comprobarlo, no se envía: consta que no se
      // envió y la reserva se libera.
      if (provider.admit !== undefined) {
        const checkedAt = now();
        const admitted = await within((options) =>
          provider.admit === undefined
            ? Promise.resolve(false)
            : provider.admit(providerRequest, options),
        );
        if (admitted !== true) {
          budget.release(reservationId);
          const callId = randomBytes(16).toString("hex");
          recordCall(
            callId,
            runId,
            providerRequest,
            { model: "unknown", tokensIn: 0, tokensOut: 0 },
            Math.max(0, now() - checkedAt),
            estimatedCost,
            "provider_error",
          );
          return { status: "provider_error", callId, uncertain: false };
        }
      }
      // Mientras se esperaba la comprobación previa pudo cambiar lo que
      // autorizó la operación. Se comprueba aquí, sin ninguna espera entre
      // esta línea y el envío: si ya no se cumple, consta que no se envió.
      if (authorized !== undefined && !authorized()) {
        budget.release(reservationId);
        return { status: "withdrawn" };
      }
      // El envío se anota antes de llamar: si el proceso cae después, la
      // reserva consta como enviada y sigue contando.
      budget.markSent(reservationId);
      const startedAt = now();
      const reply = await ask(providerRequest);
      const latencyMs = Math.max(0, now() - startedAt);
      const callId = randomBytes(16).toString("hex");
      // Un consumo ausente, o que no es un importe válido, no está confirmado.
      const confirmedCost = reply?.cost ?? null;
      const uncertain =
        confirmedCost === null ||
        !budget.settle(reservationId, confirmedCost, callId);
      if (uncertain) {
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
        return { status: "provider_error", callId, uncertain };
      }
      const parsed = outputSchema.safeParse(reply.output);
      if (!parsed.success) {
        record("invalid_output");
        return { status: "invalid_output", callId, uncertain };
      }
      if (accept !== undefined && !accept(parsed.data)) {
        record("rejected_by_domain");
        return { status: "rejected_by_domain", callId, uncertain };
      }
      record("valid");
      return { status: "ok", output: parsed.data, callId, uncertain };
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
      return row === undefined ? undefined : runOf(row);
    },

    listRuns(kind, targetId) {
      return db
        .prepare(
          "SELECT * FROM generation_run WHERE kind = ? AND target_id = ? " +
            "ORDER BY requested_at, id",
        )
        .all(kind, targetId)
        .map(runOf);
    },

    runCost(runId) {
      const reservations = budget
        .list()
        .filter((item) => item.runId === runId && item.state !== "released");
      return {
        estimatedCost: integer(
          db
            .prepare("SELECT estimated_cost FROM generation_run WHERE id = ?")
            .get(runId)?.estimated_cost ?? 0,
        ),
        reservedCost: reservations.reduce(
          (total, item) => total + item.reservedCost,
          0,
        ),
        confirmedCost: reservations.reduce(
          (total, item) => total + (item.settledCost ?? 0),
          0,
        ),
        uncertain: reservations.filter((item) => item.state === "uncertain")
          .length,
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

    summary() {
      const countBy = <Key extends string>(
        keys: readonly Key[],
        sql: string,
      ): Record<Key, number> => {
        const counts = Object.fromEntries(
          keys.map((key) => [key, 0]),
        ) as Record<Key, number>;
        for (const row of db.prepare(sql).all()) {
          const key = keys.find((item) => item === row.key);
          if (key !== undefined) {
            counts[key] = integer(row.total);
          }
        }
        return counts;
      };
      const latencies = db
        .prepare("SELECT latency_ms FROM generation_call ORDER BY latency_ms")
        .all()
        .map((row) => integer(row.latency_ms));
      return {
        runs: countBy(
          RUN_STATUSES,
          "SELECT status AS key, count(*) AS total FROM generation_run " +
            "GROUP BY status",
        ),
        calls: latencies.length,
        callsByResult: countBy(
          VALIDATIONS,
          "SELECT validation_result AS key, count(*) AS total " +
            "FROM generation_call GROUP BY validation_result",
        ),
        latencyMs:
          latencies.length === 0
            ? null
            : {
                mean: Math.round(
                  latencies.reduce((sum, value) => sum + value, 0) /
                    latencies.length,
                ),
                // Percentil 95 por rango más cercano.
                p95:
                  latencies[Math.ceil(latencies.length * 0.95) - 1] ??
                  latencies.at(-1) ??
                  0,
                max: latencies.at(-1) ?? 0,
              },
        providers: db
          .prepare(
            "SELECT DISTINCT provider FROM generation_call ORDER BY provider",
          )
          .all()
          .map((row) => text(row.provider)),
      };
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
