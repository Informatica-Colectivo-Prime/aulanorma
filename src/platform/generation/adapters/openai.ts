// Adaptador de OpenAI (specs/002-boe-scorm-export: T076; FR-019, FR-021 y
// FR-029; contracts/generation-provider.md; research.md, R6;
// specs/002-boe-scorm-export/openai-provider.md).
//
// Es el único fichero de `src/` que importa un SDK de proveedor y el único
// que hace llamadas externas. Usa la Responses API con el SDK oficial y no
// decide nada del dominio: pide una salida estructurada con el esquema de la
// tarea, y devuelve lo que llegó con su consumo. Validar la salida, comprobar
// las citas y aprobar siguen siendo cosa de `Generation`, del dominio y de
// una persona.
//
// - Una petición por operación: sin reintentos del SDK, ni propios.
// - Procesamiento estándar (`service_tier: "default"`), sin caché de prompts
//   y sin guardar la respuesta en el proveedor.
// - El consumo solo se confirma con los datos de uso de la respuesta y si se
//   sirvió con el modelo y el procesamiento a los que corresponden los
//   precios. En cualquier otro caso es `null` y la reserva queda incierta.
// - La clave llega de la configuración. No se registra, no viaja en ninguna
//   respuesta y ningún error del SDK sale de este fichero.
import OpenAI from "openai";
import type { ClientOptions } from "openai";
import { z } from "zod";
import type {
  GenerationProvider,
  ProviderReply,
  ProviderRequest,
  Usage,
} from "../index";

export const OPENAI_PROVIDER = "openai";
// Moneda de los precios de OpenAI y, con este adaptador, del presupuesto.
export const OPENAI_CURRENCY = "USD";

const BASE_URL = "https://api.openai.com/v1";

// Precios del modelo configurado con procesamiento estándar, en millonésimas
// de USD por millón de tokens. Cada token de entrada se factura con una sola
// de las tres tarifas de entrada. Los tokens de razonamiento se facturan como
// salida y ya van incluidos en los tokens de salida del consumo.
export interface OpenAiPrices {
  readonly input: number;
  readonly cachedInput: number;
  readonly cacheWrite: number;
  readonly output: number;
}

export interface OpenAiSettings {
  readonly apiKey: string;
  readonly model: string;
  readonly reasoningEffort: "low" | "medium" | "high" | "xhigh" | "max";
  // Tokens que se añaden al límite de salida de la tarea para el
  // razonamiento: el límite del proveedor cuenta juntos el razonamiento y la
  // salida visible. Se reservan y, si se usan, se facturan como salida.
  readonly reasoningTokenReserve: number;
  readonly prices: OpenAiPrices;
  // Tiempo máximo de la petición, en milisegundos.
  readonly timeoutMs: number;
  // Solo para las pruebas, que no acceden a la red: sustituye al transporte.
  readonly fetch?: ClientOptions["fetch"];
}

// Tarifa de contexto largo de la tabla de precios: por encima del umbral, la
// petición entera multiplica por 2 sus tarifas de entrada y por 1,5 la de
// salida.
const LONG_CONTEXT_INPUT_TOKENS = 272_000;
const LONG_INPUT_FACTOR = 2;
const LONG_OUTPUT_FACTOR = 1.5;

// Margen, en tokens, para lo que el proveedor añade a la entrada.
const INPUT_OVERHEAD_TOKENS = 512;
const MILLION = 1_000_000;

// Consumo que declara una respuesta, con los nombres de este módulo.
export interface OpenAiUsage {
  readonly inputTokens: number;
  readonly cachedTokens: number;
  readonly cacheWriteTokens: number;
  // Incluye los tokens de razonamiento.
  readonly outputTokens: number;
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function priced(
  usage: OpenAiUsage,
  inputPrice: number,
  prices: OpenAiPrices,
  long: boolean,
): number {
  const input =
    (usage.inputTokens - usage.cachedTokens - usage.cacheWriteTokens) *
      inputPrice +
    usage.cachedTokens * prices.cachedInput +
    usage.cacheWriteTokens * prices.cacheWrite;
  const output = usage.outputTokens * prices.output;
  return Math.ceil(
    (long
      ? input * LONG_INPUT_FACTOR + output * LONG_OUTPUT_FACTOR
      : input + output) / MILLION,
  );
}

// Coste de un consumo, en millonésimas de USD, redondeado hacia arriba;
// `null` si el consumo no es coherente.
export function openAiCost(
  usage: OpenAiUsage,
  prices: OpenAiPrices,
): number | null {
  if (
    [
      usage.inputTokens,
      usage.cachedTokens,
      usage.cacheWriteTokens,
      usage.outputTokens,
    ].some((value) => count(value) === undefined) ||
    usage.cachedTokens + usage.cacheWriteTokens > usage.inputTokens
  ) {
    return null;
  }
  return priced(
    usage,
    prices.input,
    prices,
    usage.inputTokens > LONG_CONTEXT_INPUT_TOKENS,
  );
}

// --- Esquema de la salida estructurada ---

type JsonSchema = Record<string, unknown>;

const KEPT_KEYWORDS = [
  "type",
  "enum",
  "pattern",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
] as const;
const DROPPED_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "description",
  "title",
  "default",
]);
const HANDLED_KEYWORDS: ReadonlySet<string> = new Set([
  ...KEPT_KEYWORDS,
  "const",
  "anyOf",
  "oneOf",
  "items",
  "properties",
  "required",
  "additionalProperties",
]);

function isRecord(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function strict(node: unknown): JsonSchema {
  if (!isRecord(node)) {
    throw new Error("unsupported schema");
  }
  for (const key of Object.keys(node)) {
    if (!HANDLED_KEYWORDS.has(key) && !DROPPED_KEYWORDS.has(key)) {
      throw new Error("unsupported schema");
    }
  }
  const result: JsonSchema = {};
  for (const key of KEPT_KEYWORDS) {
    if (node[key] !== undefined) {
      result[key] = node[key];
    }
  }
  if (node.const !== undefined) {
    result.enum = [node.const];
  }
  const alternatives = node.anyOf ?? node.oneOf;
  if (alternatives !== undefined) {
    if (!Array.isArray(alternatives)) {
      throw new Error("unsupported schema");
    }
    result.anyOf = alternatives.map(strict);
  }
  if (node.items !== undefined) {
    result.items = strict(node.items);
  }
  if (node.properties !== undefined) {
    if (!isRecord(node.properties)) {
      throw new Error("unsupported schema");
    }
    const required = new Set(
      Array.isArray(node.required) ? (node.required as unknown[]) : [],
    );
    const kept = Object.entries(node.properties).filter(([key]) =>
      required.has(key),
    );
    result.properties = Object.fromEntries(
      kept.map(([key, value]) => [key, strict(value)]),
    );
    result.required = kept.map(([key]) => key);
    result.additionalProperties = false;
  }
  if (Object.keys(result).length === 0) {
    throw new Error("unsupported schema");
  }
  return result;
}

// Esquema JSON de la salida estructurada, a partir del esquema del producto:
// el subconjunto que admite el modo estricto del proveedor. Todos los objetos
// son cerrados y todos sus campos, obligatorios; un campo opcional del
// producto no se pide. Las longitudes de texto y las transformaciones no
// tienen equivalente: el proveedor no las garantiza y las sigue comprobando
// el esquema del producto, que es el que decide. Lanza un error con un
// esquema que no sabe expresar, en vez de pedir otro más laxo.
export function strictJsonSchema(schema: z.ZodType): JsonSchema {
  const converted = strict(
    z.toJSONSchema(schema, { io: "input", unrepresentable: "throw" }),
  );
  if (converted.type !== "object" || converted.anyOf !== undefined) {
    throw new Error("unsupported schema");
  }
  return converted;
}

// --- Adaptador ---

const encoder = new TextEncoder();

interface Prepared {
  readonly schema: JsonSchema;
  readonly data: string;
  // Cota superior de los tokens de entrada: un token ocupa al menos un octeto
  // del texto, así que no puede haber más tokens que octetos. Supuesto sin
  // garantía del proveedor, por validar con el consumo real.
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createOpenAiProvider(
  settings: OpenAiSettings,
): GenerationProvider {
  const { prices, model } = settings;
  const client = new OpenAI({
    apiKey: settings.apiKey,
    // Nada se toma del entorno del proceso.
    baseURL: BASE_URL,
    organization: null,
    project: null,
    webhookSecret: null,
    // Sin reintentos automáticos: otro intento lo pide una persona (FR-019).
    maxRetries: 0,
    timeout: settings.timeoutMs,
    logLevel: "off",
    ...(settings.fetch === undefined ? {} : { fetch: settings.fetch }),
  });

  const prepare = (request: ProviderRequest): Prepared | undefined => {
    let schema: JsonSchema;
    try {
      schema = strictJsonSchema(request.outputSchema);
    } catch {
      return undefined;
    }
    const data = JSON.stringify(request.input);
    if (
      typeof data !== "string" ||
      count(request.maxOutputTokens) === undefined
    ) {
      return undefined;
    }
    return {
      schema,
      data,
      maxInputTokens:
        encoder.encode(request.instructions).length +
        encoder.encode(data).length +
        encoder.encode(JSON.stringify(schema)).length +
        INPUT_OVERHEAD_TOKENS,
      maxOutputTokens: request.maxOutputTokens + settings.reasoningTokenReserve,
    };
  };

  const unconfirmed = (usage?: Usage): ProviderReply => ({
    ok: false,
    usage: usage ?? { model, tokensIn: 0, tokensOut: 0 },
    cost: null,
  });

  return {
    name: OPENAI_PROVIDER,

    // Orientativa: un token por cada cuatro octetos de entrada y la mitad del
    // límite de salida. No está contrastada con consumos reales.
    estimateCost(request) {
      const prepared = prepare(request);
      if (prepared === undefined) {
        return Number.NaN;
      }
      return priced(
        {
          inputTokens: Math.ceil(prepared.maxInputTokens / 4),
          cachedTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: Math.ceil(prepared.maxOutputTokens / 2),
        },
        prices.input,
        prices,
        false,
      );
    },

    // Lo que se reserva: la cota de la entrada a la tarifa de entrada más
    // cara, y el límite de salida completo, razonamiento incluido. Sin un
    // esquema que se pueda pedir no hay importe, y la operación no se envía.
    maxCost(request) {
      const prepared = prepare(request);
      if (prepared === undefined) {
        return Number.NaN;
      }
      return priced(
        {
          inputTokens: prepared.maxInputTokens,
          cachedTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: prepared.maxOutputTokens,
        },
        Math.max(prices.input, prices.cacheWrite),
        prices,
        prepared.maxInputTokens > LONG_CONTEXT_INPUT_TOKENS,
      );
    },

    async generate(request, options) {
      const prepared = prepare(request);
      if (prepared === undefined) {
        return unconfirmed();
      }
      let response: OpenAI.Responses.Response;
      try {
        response = await client.responses.create(
          {
            model,
            // Las instrucciones y los datos van separados (FR-004).
            instructions: request.instructions,
            input: prepared.data,
            text: {
              format: {
                type: "json_schema",
                name: `aulanorma_${request.task}_${request.promptVersion}`,
                strict: true,
                schema: prepared.schema,
              },
            },
            reasoning: { effort: settings.reasoningEffort },
            max_output_tokens: prepared.maxOutputTokens,
            service_tier: "default",
            // Sin puntos de caché explícitos, la petición no usa la caché de
            // prompts ni escribe en ella.
            prompt_cache_options: { mode: "explicit" },
            store: false,
            stream: false,
          },
          {
            maxRetries: 0,
            timeout: settings.timeoutMs,
            ...(options === undefined ? {} : { signal: options.signal }),
          },
        );
      } catch {
        // Enviada o no, sin respuesta no hay consumo confirmado. El error del
        // SDK no se propaga ni se registra.
        return unconfirmed();
      }

      const reported: unknown = response.usage;
      const details = isRecord(reported) ? reported : {};
      const inputDetails = isRecord(details.input_tokens_details)
        ? details.input_tokens_details
        : {};
      const outputDetails = isRecord(details.output_tokens_details)
        ? details.output_tokens_details
        : {};
      const inputTokens = count(details.input_tokens);
      const outputTokens = count(details.output_tokens);
      const cachedTokens = count(inputDetails.cached_tokens);
      const cacheWriteTokens = count(inputDetails.cache_write_tokens);
      const reasoningTokens = count(outputDetails.reasoning_tokens);
      const servedModel = text(response.model);
      const usage: Usage = {
        model: servedModel === "" ? model : servedModel,
        tokensIn: inputTokens ?? 0,
        tokensOut: outputTokens ?? 0,
      };
      // Los precios son los del modelo configurado con procesamiento
      // estándar: con otro modelo u otro procesamiento no confirman nada.
      const cost =
        inputTokens === undefined ||
        outputTokens === undefined ||
        cachedTokens === undefined ||
        cacheWriteTokens === undefined ||
        reasoningTokens === undefined ||
        reasoningTokens > outputTokens ||
        (servedModel !== model && !servedModel.startsWith(`${model}-`)) ||
        response.service_tier !== "default"
          ? null
          : openAiCost(
              { inputTokens, cachedTokens, cacheWriteTokens, outputTokens },
              prices,
            );

      // Una respuesta incompleta, por ejemplo por agotar el límite de salida
      // en el razonamiento, se factura y no trae una salida utilizable.
      if (response.status !== "completed") {
        return { ok: false, usage, cost };
      }
      const parts: unknown[] = response.output.flatMap((item) =>
        item.type === "message" ? item.content : [],
      );
      if (
        parts.length === 0 ||
        parts.some((part) => !isRecord(part) || part.type !== "output_text")
      ) {
        // Sin texto, o con una negativa del modelo en lugar de la salida.
        return { ok: false, usage, cost };
      }
      const raw = parts.map((part) => (isRecord(part) ? text(part.text) : ""));
      let output: unknown;
      try {
        output = JSON.parse(raw.join(""));
      } catch {
        // No se repara: `Generation` la rechazará como salida inválida.
        output = undefined;
      }
      return { ok: true, output, usage, cost };
    },
  };
}
