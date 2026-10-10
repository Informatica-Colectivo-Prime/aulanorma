// Activación del proveedor de generación en los servicios del proceso
// (specs/002-boe-scorm-export: T076; openai-provider.md). Con la configuración
// de OpenAI, el proceso usa su adaptador, con su tiempo máximo y el
// presupuesto en USD; sin ella, el determinista. Aquí no se pide ninguna
// generación: no hay ninguna petición al proveedor.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";
import { getRuntime } from "@/platform/web";

const RUNTIME = Symbol.for("aulanorma.web.runtime");
const BASE = {
  NODE_ENV: "production",
  AULANORMA_LOG_LEVEL: "silent",
  AULANORMA_ENVIRONMENT: "test",
  AULANORMA_PUBLIC_ORIGIN: "https://aulanorma.example",
  AULANORMA_SESSION_IDLE_MINUTES: "30",
  AULANORMA_SESSION_MAX_HOURS: "12",
  AULANORMA_PDF_MAX_MIB: "32",
  AULANORMA_PDF_MAX_PAGES: "600",
  AULANORMA_GENERATION_MAX_OPERATION_COST: "2000000",
};
const OPENAI = {
  AULANORMA_GENERATION_PROVIDER: "openai",
  // Valor sintético con forma de clave.
  AULANORMA_OPENAI_API_KEY: [
    "clave",
    "sintetica",
    "de",
    "arranque",
    "0003",
  ].join("-"),
  AULANORMA_OPENAI_MODEL: "gpt-6.1-sol",
  AULANORMA_OPENAI_REASONING_EFFORT: "medium",
  AULANORMA_OPENAI_REASONING_TOKEN_RESERVE: "16000",
  AULANORMA_OPENAI_TIMEOUT_SECONDS: "300",
  AULANORMA_OPENAI_PRICE_INPUT: "2000000",
  AULANORMA_OPENAI_PRICE_CACHED_INPUT: "100000",
  AULANORMA_OPENAI_PRICE_CACHE_WRITE: "2500000",
  AULANORMA_OPENAI_PRICE_OUTPUT: "10000000",
};

let dataDir: string;

function forget(): void {
  const holder = globalThis as { [RUNTIME]?: { db: { close(): void } } };
  holder[RUNTIME]?.db.close();
  Reflect.deleteProperty(holder, RUNTIME);
}

function start(environment: Readonly<Record<string, string>>) {
  forget();
  for (const key of Object.keys(OPENAI)) {
    vi.stubEnv(key, undefined);
  }
  for (const [key, value] of Object.entries({
    ...BASE,
    ...environment,
    AULANORMA_DATA_DIR: dataDir,
  })) {
    vi.stubEnv(key, value);
  }
  return getRuntime();
}

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "aulanorma-proveedor-"));
  const db = openDatabase(dataDir);
  migrate(db, PLATFORM_MIGRATIONS);
  db.close();
});

afterEach(() => {
  forget();
  vi.unstubAllEnvs();
  rmSync(dataDir, { recursive: true, force: true });
});

describe("proveedor de generación del proceso", () => {
  test("sin configurarlo es el determinista, con la moneda sin fijar", () => {
    const { generation } = start({});
    expect(generation.provider).toBe("deterministic");
    expect(generation.budget.status().currency).toBe("XXX");
    expect(generation.callTimeoutMs).toBe(120_000);
  });

  test("con la configuración de OpenAI es su adaptador, con su tiempo máximo y el presupuesto en USD, todavía a cero", () => {
    const { generation, audit } = start(OPENAI);
    expect(generation.provider).toBe("openai");
    expect(generation.callTimeoutMs).toBe(300_000);
    expect(generation.budget.status()).toMatchObject({
      currency: "USD",
      limit: 0,
      maxOperationCost: 2_000_000,
    });
    expect(
      audit.list().filter((event) => event.action === "budget.currency"),
    ).toHaveLength(1);
    // Arrancar de nuevo no vuelve a fijarla.
    expect(start(OPENAI).generation.budget.status().currency).toBe("USD");
    expect(
      getRuntime()
        .audit.list()
        .filter((event) => event.action === "budget.currency"),
    ).toHaveLength(1);
  });

  test("con el límite a cero, ninguna operación cabe: no se envía nada aunque el proveedor esté activado", () => {
    const { generation } = start(OPENAI);
    const runId = generation.startRun({
      kind: "interpretation",
      targetId: "documento",
      requestedBy: "docente-1",
    });
    expect(
      generation.budget.reserve({ runId, task: "interpretation", maxCost: 1 }),
    ).toEqual({ ok: false, reason: "insufficient_budget" });
  });

  test("con un límite fijado cuando no había moneda, el proceso no atiende y el límite no cambia", () => {
    const { generation } = start({});
    generation.budget.setLimit({
      newLimit: 12_500_000,
      revision: generation.budget.status().revision,
      actorId: "administrador-1",
      correlationId: "prueba",
    });
    expect(() => start(OPENAI)).toThrow();
    expect(start({}).generation.budget.status()).toMatchObject({
      currency: "XXX",
      limit: 12_500_000,
    });
  });
});
