// Contrato de `src/platform/config` (T033): `validateConfig`, `loadConfig` y
// `readRuntimeConfig` (FR-005; research.md, R8; data-model.md). Como las demás
// pruebas escritas antes de la implementación, falla hasta que exista el módulo.
//
// El módulo se importa de forma dinámica y se tipa con el contrato esperado que
// declara esta prueba; no hay declaración del módulo que oculte su ausencia.
//
// El cargador de `@next/env` se sustituye de dos formas:
// - en este proceso, con `vi.mock`, para observar sus llamadas y forzar los
//   fallos del logger y las excepciones de forma determinista;
// - en procesos separados, con el cargador real redirigido a ficheros `.env*`
//   sintéticos en un directorio temporal fuera del repositorio. El cargador
//   real conserva estado de módulo (la instantánea inicial de `process.env`, la
//   caché y `__NEXT_PROCESSED_ENV`), así que cada caso usa un proceso nuevo.
//
// `@next/env` es CommonJS: importado de forma nativa por Node.js, como hacen
// `server.mjs` y el preflight, solo expone la exportación por defecto. Los dos
// sustitutos reproducen esa forma.
//
// Ninguna comprobación imprime valores sintéticos ni rutas temporales: las
// fugas se informan con etiquetas.
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import type { loadEnvConfig } from "@next/env";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// Contrato esperado (data-model.md, «Interfaz»).
type Mode = "development" | "production";
type ProblemCode =
  | "missing"
  | "invalid_value"
  | "unknown_key"
  | "mode_mismatch"
  | "env_load_failed";
interface ConfigProblem {
  readonly key: string;
  readonly problem: ProblemCode;
}
interface Config {
  readonly logLevel: string;
  readonly environment: string;
}
type ConfigResult =
  | { readonly ok: true; readonly config: Config }
  | { readonly ok: false; readonly problems: readonly ConfigProblem[] };
type ConfigSource = Readonly<Record<string, string | undefined>>;
interface ConfigModule {
  validateConfig(source: ConfigSource): ConfigResult;
  loadConfig(mode: Mode): ConfigResult;
  readRuntimeConfig(): ConfigResult;
}

type LoadEnvConfig = typeof loadEnvConfig;
type Logger = NonNullable<Parameters<LoadEnvConfig>[2]>;

const loader = vi.hoisted(() => vi.fn<LoadEnvConfig>());

vi.mock("@next/env", () => ({ default: { loadEnvConfig: loader } }));

const config = (await import("@/platform/config")) as ConfigModule;

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const CONFIG_MODULE_PATH = path.join(repoRoot, "src/platform/config/index.ts");

const LOG_LEVEL = "AULANORMA_LOG_LEVEL";
const ENVIRONMENT = "AULANORMA_ENVIRONMENT";
const MARKER = "__NEXT_PROCESSED_ENV";
const LOG_LEVELS = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
] as const;
const ENVIRONMENTS = ["development", "test", "ci"] as const;
const MODES: readonly Mode[] = ["development", "production"];

const VALID_SOURCE: ConfigSource = {
  [LOG_LEVEL]: "info",
  [ENVIRONMENT]: "development",
};
const VALID_CONFIG: Config = { logLevel: "info", environment: "development" };

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const SYNTHETIC_DIRECTORY = path.join(
  path.parse(repoRoot).root,
  `aulanorma-sintetico-${RUN}`,
);
const SYNTHETIC_ENV_FILE = ".env.development.local";
const SYNTHETIC_PATH = path.join(SYNTHETIC_DIRECTORY, SYNTHETIC_ENV_FILE);
const SYNTHETIC_MESSAGE = `mensaje-sintetico-${RUN}`;
const SYNTHETIC_ERROR_NAME = `FalloSintetico${RUN.replaceAll("-", "")}`;
const SYNTHETIC_FRAME = `cargadorSintetico-${RUN}`;

const SECRETS: Readonly<Record<string, string>> = {
  "valor centinela": SENTINEL,
  "ruta absoluta sintética": SYNTHETIC_DIRECTORY,
  "nombre de fichero .env": ".env",
  "mensaje del error": SYNTHETIC_MESSAGE,
  "objeto Error": SYNTHETIC_ERROR_NAME,
  traza: SYNTHETIC_FRAME,
};

function syntheticError(): Error {
  const error = new Error(`${SYNTHETIC_MESSAGE} ${SYNTHETIC_PATH} ${SENTINEL}`);
  error.name = SYNTHETIC_ERROR_NAME;
  error.stack = `${SYNTHETIC_ERROR_NAME}: ${SYNTHETIC_MESSAGE}\n    at ${SYNTHETIC_FRAME} (${SYNTHETIC_PATH}:1:1)`;
  return error;
}

const INSPECT_OPTIONS = {
  depth: null,
  showHidden: true,
  getters: true,
} as const;

function serialize(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return inspect(value, INSPECT_OPTIONS);
}

// Devuelve las etiquetas de los datos que aparecen en el texto, nunca los
// datos.
function leaks(
  text: string,
  secrets: Readonly<Record<string, string>> = SECRETS,
): string[] {
  return Object.entries(secrets)
    .filter(([, secret]) => text.includes(secret))
    .map(([label]) => label);
}

function expectNoLeaks(label: string, value: unknown): void {
  expect(leaks(serialize(value)), label).toEqual([]);
}

interface Observed<T> {
  readonly value: T;
  readonly output: string;
}

// Captura todo lo que la acción escribe en la salida estándar, en la salida de
// error y en `console`, sin dejarlo pasar al terminal.
function observe<T>(action: () => T): Observed<T> {
  const chunks: string[] = [];
  const record = (...args: unknown[]): void => {
    chunks.push(args.map(serialize).join(" "));
  };
  const spies = [
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      record(chunk);
      return true;
    }),
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      record(chunk);
      return true;
    }),
    vi.spyOn(console, "log").mockImplementation(record),
    vi.spyOn(console, "info").mockImplementation(record),
    vi.spyOn(console, "warn").mockImplementation(record),
    vi.spyOn(console, "error").mockImplementation(record),
    vi.spyOn(console, "debug").mockImplementation(record),
    vi.spyOn(console, "trace").mockImplementation(record),
  ];
  try {
    return { value: action(), output: chunks.join("\n") };
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
}

function sortProblems(
  problems: readonly ConfigProblem[],
): readonly ConfigProblem[] {
  return [...problems].sort(
    (left, right) =>
      left.key.localeCompare(right.key) ||
      left.problem.localeCompare(right.problem),
  );
}

// Unión discriminada exacta: solo `ok` y `config`, con las dos claves del
// esquema.
function expectSuccess(result: ConfigResult, expected: Config): void {
  expectNoLeaks("resultado", result);
  expect(Object.keys(result).sort()).toEqual(["config", "ok"]);
  if (!result.ok) {
    expect.fail("se esperaba una configuración válida");
  }
  expect(result.ok).toBe(true);
  expect(Object.keys(result.config).sort()).toEqual([
    "environment",
    "logLevel",
  ]);
  expect(result.config).toEqual(expected);
}

// Unión discriminada exacta: solo `ok` y `problems`, cada problema solo con
// `key` y `problem`, en cualquier orden.
function expectFailure(
  result: ConfigResult,
  expected: readonly ConfigProblem[],
): void {
  expectNoLeaks("resultado", result);
  expect(Object.keys(result).sort()).toEqual(["ok", "problems"]);
  if (result.ok) {
    expect.fail("se esperaba una lista de problemas");
  }
  expect(result.ok).toBe(false);
  expect(Array.isArray(result.problems)).toBe(true);
  for (const problem of result.problems) {
    expect(Object.keys(problem).sort()).toEqual(["key", "problem"]);
  }
  expect(sortProblems(result.problems)).toEqual(sortProblems(expected));
}

const MODE_MISMATCH: readonly ConfigProblem[] = [
  { key: "NODE_ENV", problem: "mode_mismatch" },
];
const ENV_LOAD_FAILED: readonly ConfigProblem[] = [
  { key: "environment", problem: "env_load_failed" },
];

// Aislamiento de `process.env`: cada caso parte de un entorno sin claves de
// AulaNorma ni marcador y lo restaura por completo al terminar.
function setVariable(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    process.env[key] = value;
  }
}

function replaceEnvironment(snapshot: ConfigSource): void {
  for (const key of Object.keys(process.env)) {
    if (!Object.hasOwn(snapshot, key)) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  for (const [key, value] of Object.entries(snapshot)) {
    setVariable(key, value);
  }
}

// Nombres de las claves que difieren, sin sus valores.
function isThenable(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "then") === "function"
  );
}

function changedKeys(before: ConfigSource, after: ConfigSource): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]).sort();
}

// Estado del árbol de trabajo: cambios de Git, incluidos los ficheros nuevos no
// ignorados, y los `.env*` de la raíz, que Git ignora.
function workingTreeState(): string {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: repoRoot, encoding: "utf8" },
  );
  const envFiles = readdirSync(repoRoot)
    .filter((name) => name.startsWith(".env"))
    .sort();
  return `${status}\n${envFiles.join("\n")}`;
}

const initialEnvironment: ConfigSource = { ...process.env };
let initialTree = "";
let savedEnvironment: ConfigSource = {};

beforeAll(() => {
  initialTree = workingTreeState();
});

afterAll(() => {
  expect(
    changedKeys(initialEnvironment, { ...process.env }),
    "process.env restaurado",
  ).toEqual([]);
  expect(workingTreeState(), "árbol de trabajo intacto").toBe(initialTree);
});

beforeEach(() => {
  savedEnvironment = { ...process.env };
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("AULANORMA_") || key === MARKER) {
      setVariable(key, undefined);
    }
  }
  loader.mockReset();
});

afterEach(() => {
  replaceEnvironment(savedEnvironment);
});

// Sustituto del cargador que simula una carga correcta: escribe los valores en
// `process.env` y devuelve datos que `loadConfig` no debe devolver ni
// registrar.
function loads(values: ConfigSource): LoadEnvConfig {
  return () => {
    for (const [key, value] of Object.entries(values)) {
      setVariable(key, value);
    }
    return {
      combinedEnv: { ...process.env },
      parsedEnv: { ...values, [LOG_LEVEL]: SENTINEL },
      loadedEnvFiles: [
        {
          path: SYNTHETIC_PATH,
          contents: `${LOG_LEVEL}=${SENTINEL}`,
          env: { [LOG_LEVEL]: SENTINEL },
        },
      ],
    };
  };
}

function loadWithMode(mode: Mode): Observed<ConfigResult> {
  setVariable("NODE_ENV", mode);
  return observe(() => config.loadConfig(mode));
}

function receivedLogger(call = 0): Logger {
  const logger = loader.mock.calls[call]?.[2];
  if (logger === undefined) {
    expect.fail("el cargador no recibió un logger");
  }
  return logger;
}

describe("validateConfig(source)", () => {
  test.each(LOG_LEVELS)("acepta AULANORMA_LOG_LEVEL=%s", (logLevel) => {
    const result = config.validateConfig({
      ...VALID_SOURCE,
      [LOG_LEVEL]: logLevel,
    });
    expectSuccess(result, { ...VALID_CONFIG, logLevel });
  });

  test.each(ENVIRONMENTS)("acepta AULANORMA_ENVIRONMENT=%s", (environment) => {
    const result = config.validateConfig({
      ...VALID_SOURCE,
      [ENVIRONMENT]: environment,
    });
    expectSuccess(result, { ...VALID_CONFIG, environment });
  });

  test("ignora las claves ajenas al esquema, incluido el marcador interno", () => {
    const result = config.validateConfig({
      ...VALID_SOURCE,
      [MARKER]: "true",
      NODE_ENV: "production",
      PATH: SENTINEL,
      NEXT_TELEMETRY_DISABLED: "1",
      OTRA_APP_LOG_LEVEL: SENTINEL,
    });
    expectSuccess(result, VALID_CONFIG);
  });

  test("devuelve una configuración inmutable, independiente de la fuente", () => {
    const source: Record<string, string | undefined> = { ...VALID_SOURCE };
    const result = config.validateConfig(source);
    if (!result.ok) {
      expect.fail("se esperaba una configuración válida");
    }
    expect(Object.isFrozen(result.config)).toBe(true);
    expect(() => {
      Object.assign(result.config, { logLevel: "trace" });
    }).toThrow(TypeError);
    expect(() => {
      Object.defineProperty(result.config, "extra", { value: SENTINEL });
    }).toThrow(TypeError);
    source[LOG_LEVEL] = "trace";
    expect(result.config).toEqual(VALID_CONFIG);
  });

  test.each([
    { name: "AULANORMA_LOG_LEVEL ausente", key: LOG_LEVEL, value: undefined },
    { name: "AULANORMA_LOG_LEVEL vacía", key: LOG_LEVEL, value: "" },
    {
      name: "AULANORMA_ENVIRONMENT ausente",
      key: ENVIRONMENT,
      value: undefined,
    },
    { name: "AULANORMA_ENVIRONMENT vacía", key: ENVIRONMENT, value: "" },
  ])("rechaza con missing: $name", ({ key, value }) => {
    const source: Record<string, string | undefined> = { ...VALID_SOURCE };
    if (value === undefined) {
      Reflect.deleteProperty(source, key);
    } else {
      source[key] = value;
    }
    expectFailure(config.validateConfig(source), [{ key, problem: "missing" }]);
  });

  test("una fuente vacía produce missing para las dos variables", () => {
    expectFailure(config.validateConfig({}), [
      { key: LOG_LEVEL, problem: "missing" },
      { key: ENVIRONMENT, problem: "missing" },
    ]);
  });

  test.each([
    { key: LOG_LEVEL, value: SENTINEL },
    { key: LOG_LEVEL, value: "INFO" },
    { key: LOG_LEVEL, value: "info " },
    { key: LOG_LEVEL, value: "verbose" },
    { key: ENVIRONMENT, value: SENTINEL },
    { key: ENVIRONMENT, value: "production" },
    { key: ENVIRONMENT, value: "CI" },
  ])(
    "rechaza con invalid_value un valor fuera de la lista en $key",
    ({ key, value }) => {
      const { value: result, output } = observe(() =>
        config.validateConfig({ ...VALID_SOURCE, [key]: value }),
      );
      expectNoLeaks("salida", output);
      expectFailure(result, [{ key, problem: "invalid_value" }]);
    },
  );

  test("rechaza con unknown_key una clave desconocida con prefijo AULANORMA_", () => {
    const { value: result, output } = observe(() =>
      config.validateConfig({
        ...VALID_SOURCE,
        AULANORMA_LOGLEVEL: SENTINEL,
      }),
    );
    expectNoLeaks("salida", output);
    expectFailure(result, [
      { key: "AULANORMA_LOGLEVEL", problem: "unknown_key" },
    ]);
  });

  test("informa de todos los problemas a la vez, sin ningún valor", () => {
    const { value: result, output } = observe(() =>
      config.validateConfig({
        [LOG_LEVEL]: SENTINEL,
        AULANORMA_CLAVE_DESCONOCIDA: SENTINEL,
      }),
    );
    expectNoLeaks("salida", output);
    expectFailure(result, [
      { key: LOG_LEVEL, problem: "invalid_value" },
      { key: ENVIRONMENT, problem: "missing" },
      { key: "AULANORMA_CLAVE_DESCONOCIDA", problem: "unknown_key" },
    ]);
  });

  test("es pura: no modifica la fuente y repite el mismo resultado", () => {
    const source = Object.freeze({ ...VALID_SOURCE, [MARKER]: "true" });
    const invalid = Object.freeze({ [LOG_LEVEL]: SENTINEL });
    expect(config.validateConfig(source)).toEqual(
      config.validateConfig(source),
    );
    expect(config.validateConfig(invalid)).toEqual(
      config.validateConfig(invalid),
    );
    expect(source).toEqual({ ...VALID_SOURCE, [MARKER]: "true" });
  });

  test("no lee process.env: una fuente vacía sigue sin configuración", () => {
    setVariable(LOG_LEVEL, "debug");
    setVariable(ENVIRONMENT, "ci");
    expectFailure(config.validateConfig({}), [
      { key: LOG_LEVEL, problem: "missing" },
      { key: ENVIRONMENT, problem: "missing" },
    ]);
  });

  test("no lee process.env: sus claves no alteran una fuente válida", () => {
    setVariable(LOG_LEVEL, SENTINEL);
    setVariable(ENVIRONMENT, "ci");
    setVariable("AULANORMA_CLAVE_DESCONOCIDA", SENTINEL);
    const { value: result, output } = observe(() =>
      config.validateConfig(VALID_SOURCE),
    );
    expectNoLeaks("salida", output);
    expectSuccess(result, VALID_CONFIG);
  });
});

describe("loadConfig(mode): modo explícito", () => {
  test.each([
    { mode: "development", nodeEnv: undefined },
    { mode: "development", nodeEnv: "test" },
    { mode: "development", nodeEnv: "production" },
    { mode: "development", nodeEnv: "Development" },
    { mode: "development", nodeEnv: "" },
    { mode: "development", nodeEnv: SENTINEL },
    { mode: "production", nodeEnv: undefined },
    { mode: "production", nodeEnv: "test" },
    { mode: "production", nodeEnv: "development" },
    { mode: "production", nodeEnv: SENTINEL },
  ] as const)(
    "$mode con otro NODE_ENV devuelve mode_mismatch sin llamar al cargador",
    ({ mode, nodeEnv }) => {
      setVariable("NODE_ENV", nodeEnv);
      loader.mockImplementation(loads(VALID_SOURCE));
      const { value: result, output } = observe(() => config.loadConfig(mode));
      expectNoLeaks("salida", output);
      expectFailure(result, MODE_MISMATCH);
      expect(loader).not.toHaveBeenCalled();
      expect(process.env[LOG_LEVEL]).toBeUndefined();
    },
  );

  test.each(MODES)("con %s, el marcador interno no altera el modo", (mode) => {
    setVariable("NODE_ENV", "test");
    setVariable(MARKER, "true");
    const { value: result, output } = observe(() => config.loadConfig(mode));
    expect(output).not.toContain(MARKER);
    expectFailure(result, MODE_MISMATCH);
    expect(loader).not.toHaveBeenCalled();
  });

  // Además de cadenas, valores que solo llegarían desde una llamada JavaScript
  // sin tipos, simulada con una conversión. El objeto y el array se convierten
  // en "development" con `String()` o con `==`.
  test.each([
    { name: '"test"', mode: "test", nodeEnv: "test" },
    { name: '"ci"', mode: "ci", nodeEnv: "ci" },
    { name: '"staging"', mode: "staging", nodeEnv: "staging" },
    { name: "cadena vacía", mode: "", nodeEnv: "" },
    { name: '"Development"', mode: "Development", nodeEnv: "Development" },
    { name: "centinela", mode: SENTINEL, nodeEnv: SENTINEL },
    { name: "undefined sin NODE_ENV", mode: undefined, nodeEnv: undefined },
    { name: "null", mode: null, nodeEnv: "development" },
    { name: "número", mode: 0, nodeEnv: "development" },
    {
      name: "objeto convertible",
      mode: { toString: () => "development" },
      nodeEnv: "development",
    },
    { name: "array", mode: ["development"], nodeEnv: "development" },
  ] satisfies readonly {
    readonly name: string;
    readonly mode: unknown;
    readonly nodeEnv: string | undefined;
  }[])(
    "el modo no válido $name devuelve mode_mismatch sin lanzar ni llamar al cargador",
    ({ mode, nodeEnv }) => {
      setVariable("NODE_ENV", nodeEnv);
      loader.mockImplementation(loads(VALID_SOURCE));
      const before: ConfigSource = { ...process.env };
      let observed: Observed<unknown> | undefined;
      expect(() => {
        observed = observe(() => config.loadConfig(mode as Mode));
      }).not.toThrow();
      if (observed === undefined) {
        expect.fail("loadConfig no devolvió resultado");
      }
      expect(observed.output.length, "sin salida").toBe(0);
      expect(isThenable(observed.value), "resultado síncrono").toBe(false);
      expectFailure(observed.value as ConfigResult, MODE_MISMATCH);
      expect(loader).not.toHaveBeenCalled();
      expect(
        changedKeys(before, { ...process.env }),
        "process.env sin cambios",
      ).toEqual([]);
    },
  );
});

describe("loadConfig(mode): llamada al cargador", () => {
  test.each([
    { mode: "development", dev: true },
    { mode: "production", dev: false },
  ] as const)(
    "$mode llama una vez al cargador con dev=$dev y forceReload=true",
    ({ mode, dev }) => {
      loader.mockImplementation(loads(VALID_SOURCE));
      const { value: result, output } = loadWithMode(mode);
      expectNoLeaks("salida", output);
      expectSuccess(result, VALID_CONFIG);
      expect(loader).toHaveBeenCalledTimes(1);
      const [dir, receivedDev, logger, forceReload] =
        loader.mock.calls[0] ?? [];
      expect(path.resolve(String(dir))).toBe(path.resolve(repoRoot));
      expect(receivedDev).toBe(dev);
      expect(forceReload).toBe(true);
      expect(typeof logger?.info).toBe("function");
      expect(typeof logger?.error).toBe("function");
    },
  );

  test.each([
    { name: "válida", values: { ...VALID_SOURCE, [LOG_LEVEL]: "trace" } },
    { name: "sin variables", values: {} },
    {
      name: "con una variable vacía",
      values: { ...VALID_SOURCE, [ENVIRONMENT]: "" },
    },
    {
      name: "con un valor inválido",
      values: { ...VALID_SOURCE, [LOG_LEVEL]: SENTINEL },
    },
    {
      name: "con una clave desconocida",
      values: { ...VALID_SOURCE, AULANORMA_CLAVE_DESCONOCIDA: SENTINEL },
    },
  ])(
    "delega en validateConfig tras cargar: configuración $name",
    ({ values }) => {
      loader.mockImplementation(loads(values));
      const { value: result, output } = loadWithMode("development");
      expectNoLeaks("salida", output);
      expectNoLeaks("resultado", result);
      expect(result).toEqual(config.validateConfig({ ...process.env }));
    },
  );

  test("no devuelve lo que devuelve el cargador", () => {
    loader.mockImplementation(loads(VALID_SOURCE));
    const { value: result } = loadWithMode("production");
    expectSuccess(result, VALID_CONFIG);
  });

  test.each(MODES)(
    "con %s y el marcador interno presente, el marcador no entra en config ni altera el modo",
    (mode) => {
      setVariable(MARKER, "true");
      loader.mockImplementation(loads(VALID_SOURCE));
      const { value: result, output } = loadWithMode(mode);
      expect(output).not.toContain(MARKER);
      expect(serialize(result)).not.toContain(MARKER);
      expectSuccess(result, VALID_CONFIG);
      expect(loader.mock.calls[0]?.[1]).toBe(mode === "development");
      expect(loader.mock.calls[0]?.[3]).toBe(true);
    },
  );

  test("dos llamadas consecutivas vuelven a cargar y no reutilizan el resultado", () => {
    loader.mockImplementationOnce(loads(VALID_SOURCE));
    const first = loadWithMode("development").value;
    setVariable(LOG_LEVEL, undefined);
    setVariable(ENVIRONMENT, undefined);
    loader.mockImplementationOnce(
      loads({ [LOG_LEVEL]: "warn", [ENVIRONMENT]: "ci" }),
    );
    const second = loadWithMode("development").value;
    expectSuccess(first, VALID_CONFIG);
    expectSuccess(second, { logLevel: "warn", environment: "ci" });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(loader.mock.calls.map((call) => call[3])).toEqual([true, true]);
  });

  test("crea un logger nuevo en cada llamada", () => {
    loader.mockImplementation(loads(VALID_SOURCE));
    loadWithMode("development");
    loadWithMode("development");
    expect(receivedLogger(1)).not.toBe(receivedLogger(0));
  });
});

describe("loadConfig(mode): logger controlado y errores de carga", () => {
  test("info no conserva ni reenvía argumentos y no provoca un fallo", () => {
    loader.mockImplementation((...args) => {
      const logger = args[2];
      logger?.info(`Loaded env from ${SYNTHETIC_PATH}`, SENTINEL);
      logger?.info(syntheticError());
      return loads(VALID_SOURCE)(...args);
    });
    const { value: result, output } = loadWithMode("development");
    expectNoLeaks("salida", output);
    expectNoLeaks("adaptador", receivedLogger());
    expectSuccess(result, VALID_CONFIG);
  });

  test("error del logger produce solo env_load_failed, sin datos del error", () => {
    loader.mockImplementation((...args) => {
      const logger = args[2];
      logger?.info(`Environments: ${SYNTHETIC_ENV_FILE}`);
      logger?.error(
        `Failed to load env from ${SYNTHETIC_PATH}`,
        syntheticError(),
      );
      return loads(VALID_SOURCE)(...args);
    });
    const { value: result, output } = loadWithMode("development");
    expectNoLeaks("salida", output);
    expectNoLeaks("adaptador", receivedLogger());
    expectFailure(result, ENV_LOAD_FAILED);
  });

  test("error del logger sin argumentos también produce env_load_failed", () => {
    loader.mockImplementation((...args) => {
      args[2]?.error();
      return loads(VALID_SOURCE)(...args);
    });
    expectFailure(loadWithMode("production").value, ENV_LOAD_FAILED);
  });

  test("env_load_failed sustituye a los problemas de validación", () => {
    loader.mockImplementation((...args) => {
      args[2]?.error(`Failed to load env from ${SYNTHETIC_ENV_FILE}`);
      return loads({ [LOG_LEVEL]: SENTINEL })(...args);
    });
    const { value: result, output } = loadWithMode("development");
    expectNoLeaks("salida", output);
    expectFailure(result, ENV_LOAD_FAILED);
  });

  test.each([
    { name: "un objeto Error", thrown: syntheticError },
    { name: "un valor que no es Error", thrown: () => SYNTHETIC_PATH },
  ])(
    "una excepción del cargador con $name produce solo env_load_failed",
    ({ thrown }) => {
      loader.mockImplementation((...args) => {
        args[2]?.info(`Loaded env from ${SYNTHETIC_PATH}`);
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- el cargador sustituido lanza cualquier valor
        throw thrown();
      });
      let observed: Observed<ConfigResult> | undefined;
      expect(() => {
        observed = loadWithMode("development");
      }).not.toThrow();
      if (observed === undefined) {
        expect.fail("loadConfig no devolvió resultado");
      }
      expectNoLeaks("salida", observed.output);
      expectNoLeaks("adaptador", receivedLogger());
      expectFailure(observed.value, ENV_LOAD_FAILED);
    },
  );

  test("un error de carga no persiste en la llamada siguiente", () => {
    loader.mockImplementationOnce((...args) => {
      args[2]?.error(`Failed to load env from ${SYNTHETIC_PATH}`);
      return loads(VALID_SOURCE)(...args);
    });
    loader.mockImplementationOnce(loads(VALID_SOURCE));
    expectFailure(loadWithMode("development").value, ENV_LOAD_FAILED);
    expectSuccess(loadWithMode("development").value, VALID_CONFIG);
  });
});

describe("readRuntimeConfig()", () => {
  test("lee el process.env preparado sin llamar al cargador", () => {
    setVariable(LOG_LEVEL, "debug");
    setVariable(ENVIRONMENT, "ci");
    setVariable("NODE_ENV", "production");
    const { value: result, output } = observe(() => config.readRuntimeConfig());
    expectNoLeaks("salida", output);
    expectSuccess(result, { logLevel: "debug", environment: "ci" });
    expect(loader).not.toHaveBeenCalled();
  });

  test("ignora el marcador interno y las claves ajenas al esquema", () => {
    setVariable(LOG_LEVEL, "warn");
    setVariable(ENVIRONMENT, "test");
    setVariable(MARKER, "true");
    setVariable("OTRA_APP_LOG_LEVEL", SENTINEL);
    const { value: result, output } = observe(() => config.readRuntimeConfig());
    expect(output).not.toContain(MARKER);
    expect(serialize(result)).not.toContain(MARKER);
    expectSuccess(result, { logLevel: "warn", environment: "test" });
    expect(loader).not.toHaveBeenCalled();
  });

  test.each([
    { name: "sin variables", values: {} },
    {
      name: "con una variable vacía",
      values: { ...VALID_SOURCE, [LOG_LEVEL]: "" },
    },
    {
      name: "con un valor inválido",
      values: { ...VALID_SOURCE, [ENVIRONMENT]: SENTINEL },
    },
    {
      name: "con una clave desconocida",
      values: { ...VALID_SOURCE, AULANORMA_CLAVE_DESCONOCIDA: SENTINEL },
    },
  ])(
    "delega en validateConfig y no filtra valores: configuración $name",
    ({ values }) => {
      for (const [key, value] of Object.entries(values)) {
        setVariable(key, value);
      }
      const { value: result, output } = observe(() =>
        config.readRuntimeConfig(),
      );
      expectNoLeaks("salida", output);
      expectNoLeaks("resultado", result);
      expect(result.ok).toBe(false);
      expect(result).toEqual(config.validateConfig({ ...process.env }));
      expect(loader).not.toHaveBeenCalled();
    },
  );

  test("tras loadConfig, devuelve la misma configuración sin volver a cargar", () => {
    loader.mockImplementation(loads(VALID_SOURCE));
    const loaded = loadWithMode("production").value;
    const runtime = config.readRuntimeConfig();
    expectSuccess(runtime, VALID_CONFIG);
    expect(runtime).toEqual(loaded);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

// Casos con el cargador real de `@next/env`, cada uno en un proceso nuevo.
// El proceso registra con `module.registerHooks` un sustituto de `@next/env`
// con la misma forma que el módulo real: anota cada llamada y delega en el
// cargador real con el directorio sintético. El entorno del proceso es
// explícito y no hereda nada de este.

type EnvFiles = Readonly<Record<string, string | null>>;
type Step =
  | { readonly op: "files"; readonly files: EnvFiles }
  | { readonly op: "loop"; readonly name: string }
  | { readonly op: "load"; readonly mode: Mode }
  | { readonly op: "runtime" };
interface LoaderCall {
  readonly dev: unknown;
  readonly forceReload: unknown;
  readonly logger: boolean;
}
interface IsolatedRun {
  readonly results: readonly ConfigResult[];
  readonly calls: readonly LoaderCall[];
}

const RUNNER_SOURCE = `
import { createRequire, registerHooks } from "node:module";
import { rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const { configPath, envDir, steps } = JSON.parse(process.argv[2]);
const configUrl = pathToFileURL(configPath).href;
const realNextEnv = createRequire(configUrl)("@next/env");
const calls = [];
globalThis[Symbol.for("aulanorma.tests.config.next-env")] = {
  ...realNextEnv,
  loadEnvConfig(dir, dev, log, forceReload, ...rest) {
    calls.push({
      dev,
      forceReload,
      logger: typeof log?.info === "function" && typeof log?.error === "function",
    });
    return realNextEnv.loadEnvConfig(envDir, dev, log, forceReload, ...rest);
  },
};
const substitute =
  "data:text/javascript," +
  encodeURIComponent(
    'export default globalThis[Symbol.for("aulanorma.tests.config.next-env")];',
  );
registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "@next/env"
      ? { url: substitute, shortCircuit: true }
      : nextResolve(specifier, context);
  },
});
const config = await import(configUrl);
const results = [];
for (const step of steps) {
  if (step.op === "files") {
    for (const [name, contents] of Object.entries(step.files)) {
      rmSync(path.join(envDir, name), { force: true });
      if (contents !== null) {
        writeFileSync(path.join(envDir, name), contents);
      }
    }
  } else if (step.op === "loop") {
    symlinkSync(step.name, path.join(envDir, step.name));
  } else if (step.op === "load") {
    results.push(config.loadConfig(step.mode));
  } else {
    results.push(config.readRuntimeConfig());
  }
}
process.send({ results, calls }, () => {
  process.disconnect();
});
`;

async function runIsolated(
  environment: Readonly<Record<string, string>>,
  steps: readonly Step[],
): Promise<IsolatedRun> {
  const workspace = mkdtempSync(path.join(tmpdir(), "aulanorma-t020-"));
  const secrets = {
    ...SECRETS,
    "ruta temporal": workspace,
    "ruta temporal real": realpathSync(workspace),
  };
  const redact = (text: string): string =>
    Object.entries(secrets).reduce(
      (current, [label, secret]) => current.replaceAll(secret, `<${label}>`),
      text,
    );
  try {
    const envDir = path.join(workspace, "proyecto");
    mkdirSync(envDir);
    const runner = path.join(workspace, "runner.mjs");
    writeFileSync(runner, RUNNER_SOURCE);
    const plan = JSON.stringify({
      configPath: CONFIG_MODULE_PATH,
      envDir,
      steps,
    });
    const child = spawn(process.execPath, [runner, plan], {
      cwd: repoRoot,
      env: { ...environment },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      timeout: 15_000,
    });
    let output = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    const received = await new Promise<unknown>((resolve, reject) => {
      let message: unknown;
      child.on("message", (value) => {
        message = value;
      });
      child.on("error", reject);
      child.on("close", (code, signal) => {
        if (code === 0 && message !== undefined) {
          resolve(message);
        } else {
          reject(
            new Error(
              `El proceso aislado terminó con código ${String(code)} y señal ${String(signal)}:\n${redact(output)}`,
            ),
          );
        }
      });
    });
    expect(leaks(output, secrets), "salida del proceso aislado").toEqual([]);
    return received as IsolatedRun;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

const ISOLATED_TIMEOUT = 20_000;

// Ficheros de otros modos: si se cargaran, introducirían un valor inválido y
// una clave desconocida.
const DECOY = `${LOG_LEVEL}=${SENTINEL}\nAULANORMA_SENUELO=1\n`;

interface Layer {
  readonly file: string;
  readonly logLevel: string;
}

// Precedencia por modo, de mayor a menor (research.md, R8).
const PRECEDENCE: Readonly<
  Record<
    Mode,
    {
      readonly layers: readonly Layer[];
      readonly environment: string;
      readonly decoys: readonly string[];
    }
  >
> = {
  development: {
    layers: [
      { file: ".env.development.local", logLevel: "debug" },
      { file: ".env.local", logLevel: "info" },
      { file: ".env.development", logLevel: "warn" },
      { file: ".env", logLevel: "error" },
    ],
    environment: "development",
    decoys: [
      ".env.test",
      ".env.test.local",
      ".env.production",
      ".env.production.local",
    ],
  },
  production: {
    layers: [
      { file: ".env.production.local", logLevel: "fatal" },
      { file: ".env.local", logLevel: "info" },
      { file: ".env.production", logLevel: "warn" },
      { file: ".env", logLevel: "error" },
    ],
    environment: "ci",
    decoys: [
      ".env.test",
      ".env.test.local",
      ".env.development",
      ".env.development.local",
    ],
  },
};

// Ficheros a partir de la capa `from`: cada capa fija su nivel y `.env`, la
// última, también fija el entorno.
function layeredFiles(mode: Mode, from: number): Record<string, string> {
  const { layers, environment, decoys } = PRECEDENCE[mode];
  const files: Record<string, string> = {};
  for (const decoy of decoys) {
    files[decoy] = DECOY;
  }
  for (const layer of layers.slice(from)) {
    files[layer.file] = `${LOG_LEVEL}=${layer.logLevel}\n`;
  }
  files[".env"] =
    `${LOG_LEVEL}=${layers.at(-1)?.logLevel ?? ""}\n${ENVIRONMENT}=${environment}\n`;
  return files;
}

const PRECEDENCE_CASES = MODES.flatMap((mode) =>
  PRECEDENCE[mode].layers.map((layer, from) => ({
    mode,
    from,
    file: layer.file,
  })),
);

describe("loadConfig con el cargador real en procesos separados", () => {
  test.each(PRECEDENCE_CASES)(
    "$mode: con $file como fichero de mayor precedencia, se usa su valor",
    async ({ mode, from }) => {
      const { layers, environment } = PRECEDENCE[mode];
      const { results, calls } = await runIsolated({ NODE_ENV: mode }, [
        { op: "files", files: layeredFiles(mode, from) },
        { op: "load", mode },
      ]);
      expect(results).toHaveLength(1);
      expectSuccess(results[0] ?? { ok: false, problems: [] }, {
        logLevel: layers[from]?.logLevel ?? "",
        environment,
      });
      expect(calls).toEqual([
        { dev: mode === "development", forceReload: true, logger: true },
      ]);
    },
    ISOLATED_TIMEOUT,
  );

  test.each(MODES)(
    "%s: una variable del proceso prevalece sobre los ficheros",
    async (mode) => {
      const { results } = await runIsolated(
        { NODE_ENV: mode, [LOG_LEVEL]: "silent" },
        [
          { op: "files", files: layeredFiles(mode, 0) },
          { op: "load", mode },
        ],
      );
      expectSuccess(results[0] ?? { ok: false, problems: [] }, {
        logLevel: "silent",
        environment: PRECEDENCE[mode].environment,
      });
    },
    ISOLATED_TIMEOUT,
  );

  test.each(MODES)(
    "%s: una variable del proceso vacía prevalece y se rechaza con missing",
    async (mode) => {
      const { results } = await runIsolated(
        { NODE_ENV: mode, [LOG_LEVEL]: "" },
        [
          { op: "files", files: layeredFiles(mode, 0) },
          { op: "load", mode },
        ],
      );
      expectFailure(results[0] ?? { ok: true, config: VALID_CONFIG }, [
        { key: LOG_LEVEL, problem: "missing" },
      ]);
    },
    ISOLATED_TIMEOUT,
  );

  test.each(MODES)(
    "%s con NODE_ENV=test nunca carga .env.test",
    async (mode) => {
      const valid = `${LOG_LEVEL}=info\n${ENVIRONMENT}=test\n`;
      const { results, calls } = await runIsolated({ NODE_ENV: "test" }, [
        {
          op: "files",
          files: {
            ".env.test": valid,
            ".env.test.local": valid,
            ".env": valid,
            [`.env.${mode}`]: valid,
          },
        },
        { op: "load", mode },
        { op: "runtime" },
      ]);
      expect(calls).toEqual([]);
      expectFailure(
        results[0] ?? { ok: true, config: VALID_CONFIG },
        MODE_MISMATCH,
      );
      expectFailure(results[1] ?? { ok: true, config: VALID_CONFIG }, [
        { key: LOG_LEVEL, problem: "missing" },
        { key: ENVIRONMENT, problem: "missing" },
      ]);
    },
    ISOLATED_TIMEOUT,
  );

  test(
    "el modo no válido test, igual a NODE_ENV, no carga ningún fichero",
    async () => {
      const invalidMode: unknown = "test";
      const valid = `${LOG_LEVEL}=info\n${ENVIRONMENT}=test\n`;
      const { results, calls } = await runIsolated({ NODE_ENV: "test" }, [
        {
          op: "files",
          files: {
            ".env.test": valid,
            ".env.test.local": valid,
            ".env.development": valid,
            ".env.production": valid,
            ".env": valid,
          },
        },
        { op: "load", mode: invalidMode as Mode },
        { op: "runtime" },
      ]);
      expect(calls).toEqual([]);
      expectFailure(
        results[0] ?? { ok: true, config: VALID_CONFIG },
        MODE_MISMATCH,
      );
      expectFailure(results[1] ?? { ok: true, config: VALID_CONFIG }, [
        { key: LOG_LEVEL, problem: "missing" },
        { key: ENVIRONMENT, problem: "missing" },
      ]);
    },
    ISOLATED_TIMEOUT,
  );

  test.each(MODES)(
    "%s: dos llamadas consecutivas con ficheros distintos no reutilizan la caché",
    async (mode) => {
      const file = `.env.${mode}`;
      const { results, calls } = await runIsolated({ NODE_ENV: mode }, [
        {
          op: "files",
          files: { [file]: `${LOG_LEVEL}=debug\n${ENVIRONMENT}=ci\n` },
        },
        { op: "load", mode },
        {
          op: "files",
          files: { [file]: `${LOG_LEVEL}=warn\n${ENVIRONMENT}=test\n` },
        },
        { op: "load", mode },
      ]);
      expectSuccess(results[0] ?? { ok: false, problems: [] }, {
        logLevel: "debug",
        environment: "ci",
      });
      expectSuccess(results[1] ?? { ok: false, problems: [] }, {
        logLevel: "warn",
        environment: "test",
      });
      expect(calls.map((call) => call.forceReload)).toEqual([true, true]);
    },
    ISOLATED_TIMEOUT,
  );

  test.each(MODES)(
    "%s: con el marcador interno heredado, vuelve a cargar y el marcador no entra en config",
    async (mode) => {
      const { results, calls } = await runIsolated(
        { NODE_ENV: mode, [MARKER]: "true" },
        [
          { op: "files", files: layeredFiles(mode, 0) },
          { op: "load", mode },
          { op: "runtime" },
        ],
      );
      const expected = {
        logLevel: PRECEDENCE[mode].layers[0]?.logLevel ?? "",
        environment: PRECEDENCE[mode].environment,
      };
      expect(serialize(results)).not.toContain(MARKER);
      expectSuccess(results[0] ?? { ok: false, problems: [] }, expected);
      expectSuccess(results[1] ?? { ok: false, problems: [] }, expected);
      expect(calls).toEqual([
        { dev: mode === "development", forceReload: true, logger: true },
      ]);
    },
    ISOLATED_TIMEOUT,
  );

  test(
    "readRuntimeConfig no vuelve a leer los ficheros ni llama al cargador",
    async () => {
      const { results, calls } = await runIsolated(
        { NODE_ENV: "development" },
        [
          {
            op: "files",
            files: {
              ".env.development": `${LOG_LEVEL}=debug\n${ENVIRONMENT}=development\n`,
            },
          },
          { op: "load", mode: "development" },
          {
            op: "files",
            files: {
              ".env.development": `${LOG_LEVEL}=${SENTINEL}\n`,
              ".env.development.local": DECOY,
            },
          },
          { op: "runtime" },
          {
            op: "files",
            files: { ".env.development": null, ".env.development.local": null },
          },
          { op: "runtime" },
        ],
      );
      const expected = { logLevel: "debug", environment: "development" };
      expect(results).toHaveLength(3);
      for (const result of results) {
        expectSuccess(result, expected);
      }
      expect(calls).toHaveLength(1);
    },
    ISOLATED_TIMEOUT,
  );

  test(
    "un fichero .env que el cargador real no puede leer produce solo env_load_failed",
    async () => {
      const { results, calls } = await runIsolated(
        { NODE_ENV: "development" },
        [
          {
            op: "files",
            files: {
              ".env": `${LOG_LEVEL}=info\n${ENVIRONMENT}=development\n`,
            },
          },
          // Un enlace simbólico a sí mismo: el cargador recibe ELOOP al
          // examinarlo, sin depender de permisos.
          { op: "loop", name: ".env.development.local" },
          { op: "load", mode: "development" },
        ],
      );
      expect(calls).toHaveLength(1);
      expectFailure(
        results[0] ?? { ok: true, config: VALID_CONFIG },
        ENV_LOAD_FAILED,
      );
      expect(serialize(results)).not.toContain("ELOOP");
    },
    ISOLATED_TIMEOUT,
  );
});
