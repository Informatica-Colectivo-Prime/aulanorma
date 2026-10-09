// Transporte simulado para el adaptador de OpenAI. Las pruebas no acceden a
// la red: el SDK oficial recibe esta función en lugar de `fetch`, así que se
// ejercita su código real de petición y de lectura de la respuesta, sin
// ninguna llamada externa ni de pago. Las respuestas imitan la forma de la
// Responses API; no son respuestas grabadas del proveedor.
import type { OpenAiPrices, OpenAiSettings } from "@/platform/generation";

type Transport = NonNullable<OpenAiSettings["fetch"]>;
type TransportInit = Parameters<Transport>[1];

export interface SentRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: Record<string, unknown>;
  readonly signal: AbortSignal | null;
}

// Precios de `gpt-6.1-sol` con procesamiento estándar el 2026-10-09, en
// millonésimas de USD por millón de tokens.
export const PRICES: OpenAiPrices = {
  input: 2_000_000,
  cachedInput: 100_000,
  cacheWrite: 2_500_000,
  output: 10_000_000,
};

export const FAKE_MODEL = "gpt-6.1-sol";
// Valor sintético con forma de clave, generado para estas pruebas.
export const FAKE_KEY = ["clave", "sintetica", "de", "prueba", "0001"].join(
  "-",
);

export const SETTINGS = {
  apiKey: FAKE_KEY,
  model: FAKE_MODEL,
  reasoningEffort: "medium",
  reasoningTokenReserve: 8000,
  prices: PRICES,
  timeoutMs: 5000,
} as const satisfies OpenAiSettings;

export interface FakeUsage {
  readonly input: number;
  readonly cached?: number;
  readonly cacheWrite?: number;
  readonly output: number;
  readonly reasoning?: number;
}

export function usageBody(usage: FakeUsage): Record<string, unknown> {
  return {
    input_tokens: usage.input,
    input_tokens_details: {
      cached_tokens: usage.cached ?? 0,
      cache_write_tokens: usage.cacheWrite ?? 0,
    },
    output_tokens: usage.output,
    output_tokens_details: { reasoning_tokens: usage.reasoning ?? 0 },
    total_tokens: usage.input + usage.output,
  };
}

export const USAGE: FakeUsage = {
  input: 12_000,
  output: 5000,
  reasoning: 3000,
};

// Cuerpo de una respuesta terminada cuyo texto es `text`.
export function completed(
  text: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "resp_simulada",
    object: "response",
    created_at: 0,
    status: "completed",
    model: FAKE_MODEL,
    service_tier: "default",
    output: [
      { type: "reasoning", id: "rs_simulado", summary: [] },
      {
        type: "message",
        id: "msg_simulado",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations: [] }],
      },
    ],
    usage: usageBody(USAGE),
    ...overrides,
  };
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sentOf(url: unknown, init: TransportInit): SentRequest {
  const raw = init?.body;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    body:
      typeof raw === "string"
        ? (JSON.parse(raw) as Record<string, unknown>)
        : {},
    signal: init?.signal ?? null,
  };
}

// Recuento de tokens de entrada que devuelve el proveedor simulado.
export function counted(tokens: number): Response {
  return json({ object: "response.input_tokens", input_tokens: tokens });
}

// Transporte que responde con `respond` a la petición de generación y con
// `count` al recuento previo de tokens de entrada, y anota por separado lo
// que recibe: `sent`, las peticiones de generación; `counts`, los recuentos.
export function fakeTransport(
  respond: (request: SentRequest) => Response | Promise<Response>,
  count: (request: SentRequest) => Response | Promise<Response> = () =>
    counted(64),
): {
  readonly fetch: Transport;
  readonly sent: SentRequest[];
  readonly counts: SentRequest[];
} {
  const sent: SentRequest[] = [];
  const counts: SentRequest[] = [];
  return {
    sent,
    counts,
    fetch: async (url, init) => {
      const request = sentOf(url, init);
      if (request.url.endsWith("/responses/input_tokens")) {
        counts.push(request);
        return count(request);
      }
      sent.push(request);
      return respond(request);
    },
  };
}

// Respuesta que no llega nunca: solo termina, con un error, si quien llama
// cierra la petición.
export function never(request: SentRequest): Promise<Response> {
  return new Promise((_resolve, reject) => {
    request.signal?.addEventListener("abort", () => {
      reject(new DOMException("aborted", "AbortError"));
    });
  });
}
