// Configuración del proveedor de generación (specs/002-boe-scorm-export:
// T076; contracts/generation-provider.md). El proveedor es opcional y, sin
// él, se usa el determinista; con `openai`, todas sus claves son
// obligatorias. Ningún problema lleva un valor, tampoco la clave.
import { describe, expect, test } from "vitest";
import { validateConfig } from "@/platform/config";

const BASE = {
  AULANORMA_LOG_LEVEL: "info",
  AULANORMA_ENVIRONMENT: "test",
  AULANORMA_DATA_DIR: "/var/lib/aulanorma-datos",
  AULANORMA_PUBLIC_ORIGIN: "https://aulanorma.example",
  AULANORMA_SESSION_IDLE_MINUTES: "30",
  AULANORMA_SESSION_MAX_HOURS: "12",
  AULANORMA_PDF_MAX_MIB: "32",
  AULANORMA_PDF_MAX_PAGES: "600",
  AULANORMA_GENERATION_MAX_OPERATION_COST: "2000000",
};
// Valor sintético con forma de clave.
const KEY = ["clave", "sintetica", "de", "configuracion", "0002"].join("-");
const OPENAI = {
  AULANORMA_GENERATION_PROVIDER: "openai",
  AULANORMA_OPENAI_API_KEY: KEY,
  AULANORMA_OPENAI_MODEL: "gpt-6.1-sol",
  AULANORMA_OPENAI_REASONING_EFFORT: "medium",
  AULANORMA_OPENAI_REASONING_TOKEN_RESERVE: "16000",
  AULANORMA_OPENAI_TIMEOUT_SECONDS: "300",
  AULANORMA_OPENAI_PRICE_INPUT: "2000000",
  AULANORMA_OPENAI_PRICE_CACHED_INPUT: "100000",
  AULANORMA_OPENAI_PRICE_CACHE_WRITE: "2500000",
  AULANORMA_OPENAI_PRICE_OUTPUT: "10000000",
};

describe("proveedor de generación", () => {
  test("sin indicarlo, o vacío, es el determinista y no hay configuración de OpenAI", () => {
    for (const source of [
      BASE,
      { ...BASE, AULANORMA_GENERATION_PROVIDER: "" },
    ]) {
      expect(validateConfig(source)).toMatchObject({
        ok: true,
        config: { generationProvider: "deterministic", openai: null },
      });
    }
  });

  test("con `openai` y todas sus claves, la configuración las lleva", () => {
    expect(validateConfig({ ...BASE, ...OPENAI })).toMatchObject({
      ok: true,
      config: {
        generationProvider: "openai",
        openai: {
          apiKey: KEY,
          model: "gpt-6.1-sol",
          reasoningEffort: "medium",
          reasoningTokenReserve: 16_000,
          timeoutSeconds: 300,
          priceInput: 2_000_000,
          priceCachedInput: 100_000,
          priceCacheWrite: 2_500_000,
          priceOutput: 10_000_000,
        },
      },
    });
  });

  test("con `openai`, cada clave que falta es un problema, y no arranca con el determinista en su lugar", () => {
    const result = validateConfig({
      ...BASE,
      AULANORMA_GENERATION_PROVIDER: "openai",
    });
    expect(result.ok).toBe(false);
    expect(
      result.ok ? [] : result.problems.map((item) => item.key).sort(),
    ).toEqual(
      Object.keys(OPENAI)
        .filter((key) => key !== "AULANORMA_GENERATION_PROVIDER")
        .sort(),
    );
  });

  test.each([
    ["AULANORMA_GENERATION_PROVIDER", "anthropic"],
    ["AULANORMA_OPENAI_API_KEY", "clave con espacios dentro del valor"],
    ["AULANORMA_OPENAI_API_KEY", "corta"],
    ["AULANORMA_OPENAI_MODEL", "GPT 6"],
    ["AULANORMA_OPENAI_REASONING_EFFORT", "none"],
    ["AULANORMA_OPENAI_REASONING_TOKEN_RESERVE", "100001"],
    ["AULANORMA_OPENAI_TIMEOUT_SECONDS", "29"],
    ["AULANORMA_OPENAI_TIMEOUT_SECONDS", "901"],
    ["AULANORMA_OPENAI_PRICE_INPUT", "2.5"],
    ["AULANORMA_OPENAI_PRICE_OUTPUT", "-1"],
    ["AULANORMA_OPENAI_PRICE_CACHE_WRITE", "1000000001"],
  ])("un valor no válido de %s se rechaza sin mostrarlo", (key, value) => {
    const result = validateConfig({ ...BASE, ...OPENAI, [key]: value });
    expect(result).toEqual({
      ok: false,
      problems: [{ key, problem: "invalid_value" }],
    });
  });

  test("ningún problema lleva la clave", () => {
    const result = validateConfig({
      ...BASE,
      ...OPENAI,
      AULANORMA_OPENAI_MODEL: "GPT 6",
      AULANORMA_OPENAI_DESCONOCIDA: KEY,
    });
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(result).toMatchObject({
      problems: expect.arrayContaining([
        { key: "AULANORMA_OPENAI_DESCONOCIDA", problem: "unknown_key" },
      ]) as unknown,
    });
  });

  test("con el determinista, las claves de OpenAI pueden estar definidas: se validan y no se usan", () => {
    const keys = Object.fromEntries(
      Object.entries(OPENAI).filter(
        ([key]) => key !== "AULANORMA_GENERATION_PROVIDER",
      ),
    );
    expect(validateConfig({ ...BASE, ...keys })).toMatchObject({
      ok: true,
      config: { generationProvider: "deterministic", openai: null },
    });
    expect(
      validateConfig({ ...BASE, ...keys, AULANORMA_OPENAI_MODEL: "GPT 6" }),
    ).toMatchObject({ ok: false });
  });
});

// Dirección de escucha (ADR 0005).
describe("dirección de escucha", () => {
  test("sin indicarla, o vacía, es la local: el servicio no es alcanzable desde otro equipo", () => {
    for (const source of [BASE, { ...BASE, AULANORMA_LISTEN_HOST: "" }]) {
      expect(validateConfig(source)).toMatchObject({
        ok: true,
        config: { listenHost: "127.0.0.1" },
      });
    }
  });

  test.each(["127.0.0.1", "0.0.0.0"])(
    "admite %s, indicada de forma explícita",
    (host) => {
      expect(
        validateConfig({ ...BASE, AULANORMA_LISTEN_HOST: host }),
      ).toMatchObject({ ok: true, config: { listenHost: host } });
    },
  );

  test.each([
    "localhost",
    "::",
    "::1",
    "0.0.0.0:3000",
    "192.168.1.10",
    "10.0.0.1",
    "0",
    " 0.0.0.0",
    "aulanorma.example",
  ])(
    "no admite %s: no hay más direcciones ni un puerto configurable",
    (host) => {
      expect(validateConfig({ ...BASE, AULANORMA_LISTEN_HOST: host })).toEqual({
        ok: false,
        problems: [{ key: "AULANORMA_LISTEN_HOST", problem: "invalid_value" }],
      });
    },
  );

  test("el puerto no es configurable", () => {
    expect(validateConfig({ ...BASE, AULANORMA_LISTEN_PORT: "8080" })).toEqual({
      ok: false,
      problems: [{ key: "AULANORMA_LISTEN_PORT", problem: "unknown_key" }],
    });
  });
});
