// Contrato de `src/platform/logging` (T034): `createLogger`,
// `logStartupCompleted` y `logConfigInvalid` (FR-008; plan.md, «Interfaz de
// registros»; research.md, R9). Como las demás pruebas escritas antes de la
// implementación, falla hasta que exista el módulo.
//
// El módulo se importa de forma dinámica y se tipa con el contrato esperado que
// declara esta prueba; no hay declaración del módulo que oculte su ausencia.
//
// `pino` se sustituye por un envoltorio que delega en el Pino real y solo anota
// cada instancia creada, para comprobar la censura con la semántica real de
// Pino a través de la configuración que usa el módulo: el manejador es opaco y
// los dos eventos no admiten campos arbitrarios. La salida estándar por
// defecto y la importación sin efectos se comprueban en procesos separados,
// con el Pino real.
//
// Los datos sintéticos nunca se imprimen: las fugas se informan con etiquetas.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";

// Contrato esperado (plan.md, «Interfaz de registros»).
type Level = "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
type Mode = "development" | "production";
interface Destination {
  write(chunk: string): void;
}
interface LoggerOptions {
  readonly environment: string;
  readonly level: Level;
  readonly destination?: Destination;
}
interface ProblemInput {
  readonly key: string;
  readonly problem: string;
}
interface LoggingModule {
  createLogger(options: LoggerOptions): unknown;
  logStartupCompleted(logger: unknown): void;
  logConfigInvalid(
    logger: unknown,
    mode: Mode,
    problems: readonly ProblemInput[],
  ): void;
}

interface PinoInstance {
  child(
    bindings: Record<string, unknown>,
    options: { level: string },
  ): { info(record: Record<string, unknown>): void };
}

const created = vi.hoisted(() => {
  const instances: unknown[] = [];
  return instances;
});

vi.mock("pino", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  const real = actual.default as (...args: unknown[]) => unknown;
  const recording = Object.assign((...args: unknown[]): unknown => {
    const instance = real(...args);
    created.push(instance);
    return instance;
  }, real);
  return { ...actual, default: recording, pino: recording };
});

const logging = (await import("@/platform/logging")) as LoggingModule;

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const LOGGING_MODULE_PATH = path.join(
  repoRoot,
  "src/platform/logging/index.ts",
);

const LEVELS: readonly Level[] = [
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
];
const MODES: readonly Mode[] = ["development", "production"];
const ENVIRONMENTS = ["development", "test", "ci"] as const;
const EXPORTS = ["createLogger", "logConfigInvalid", "logStartupCompleted"];
const PINO_MEMBERS = [
  "trace",
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
  "silent",
  "child",
  "level",
  "levels",
  "bindings",
  "setBindings",
  "isLevelEnabled",
  "flush",
  "on",
  "emit",
  "version",
];
const FORBIDDEN_FIELDS = [
  "pid",
  "hostname",
  "requestId",
  "req",
  "res",
  "request",
  "ip",
  "headers",
  "userAgent",
  "cookie",
  "authorization",
];
const REDACTED = "[REDACTED]";
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FIXED_TIME = "2026-01-02T03:04:05.678Z";

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const SYNTHETIC_DIRECTORY = path.join(
  path.parse(repoRoot).root,
  `aulanorma-sintetico-${RUN}`,
);
const SYNTHETIC_PATH = path.join(SYNTHETIC_DIRECTORY, ".env.production.local");
const SYNTHETIC_MESSAGE = `mensaje-sintetico-${RUN}`;
const SYNTHETIC_ERROR_NAME = `FalloSintetico${RUN.replaceAll("-", "")}`;
const SYNTHETIC_FRAME = `marcoSintetico-${RUN}`;

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

function serialize(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("utf8");
  }
  return inspect(value, { depth: null, showHidden: true, getters: true });
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

// Ejecuta la acción capturando la salida estándar, la de error y `console`, y
// exige que no se haya escrito nada en ellas.
function quietly<T>(action: () => T): T {
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
  let value: T;
  try {
    value = action();
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
  expect(chunks.join("").length, "sin salida estándar ni de error").toBe(0);
  return value;
}

interface Memory {
  readonly destination: Destination;
  readonly writes: string[];
}

function memoryDestination(): Memory {
  const writes: string[] = [];
  return {
    destination: {
      write(chunk: string): void {
        writes.push(chunk);
      },
    },
    writes,
  };
}

// Una escritura es exactamente una línea con un único objeto JSON, sin claves
// repetidas: volver a serializarlo reproduce el texto.
function parseLine(write: string): Record<string, unknown> {
  expect(leaks(write), "línea sin datos sensibles").toEqual([]);
  expect(write.endsWith("\n"), "termina en salto de línea").toBe(true);
  expect(write.indexOf("\n"), "una sola línea").toBe(write.length - 1);
  const body = write.slice(0, -1);
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    expect.fail("la línea no es un objeto JSON");
  }
  expect(JSON.stringify(parsed), "JSON canónico sin claves repetidas").toBe(
    body,
  );
  return parsed as Record<string, unknown>;
}

function onlyLine(memory: Memory): Record<string, unknown> {
  expect(memory.writes, "una escritura").toHaveLength(1);
  return parseLine(memory.writes[0] ?? "");
}

// Nombres de los miembros invocables alcanzables desde el manejador: propios,
// heredados (salvo `Object.prototype`) o dentro de sus propiedades.
function exposedMembers(value: unknown, depth = 0): string[] {
  if (
    depth > 3 ||
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return [];
  }
  const found: string[] = [];
  let current: object | null = value;
  while (
    current !== null &&
    current !== Object.prototype &&
    current !== Function.prototype
  ) {
    for (const key of Reflect.ownKeys(current)) {
      if (key === "constructor") {
        continue;
      }
      const name = String(key);
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
      if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
        found.push(name);
        continue;
      }
      const member: unknown = descriptor?.value;
      if (typeof member === "function") {
        found.push(name);
      } else {
        found.push(
          ...exposedMembers(member, depth + 1).map(
            (inner) => `${name}.${inner}`,
          ),
        );
      }
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return found;
}

// Nombres de los miembros invocables de toda la cadena de prototipos, incluido
// `Object.prototype`.
function inheritedFunctions(value: object): string[] {
  const found: string[] = [];
  for (
    let current = Object.getPrototypeOf(value) as object | null;
    current !== null;
    current = Object.getPrototypeOf(current) as object | null
  ) {
    for (const key of Reflect.ownKeys(current)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
      if (
        typeof descriptor?.value === "function" ||
        descriptor?.get !== undefined ||
        descriptor?.set !== undefined
      ) {
        found.push(String(key));
      }
    }
  }
  return found;
}

// Nombres de las claves de entorno que difieren, sin sus valores.
function changedKeys(
  before: Readonly<Record<string, string | undefined>>,
  after: Readonly<Record<string, string | undefined>>,
): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => before[key] !== after[key]).sort();
}

const initialEnvironment = { ...process.env };

afterAll(() => {
  expect(
    changedKeys(initialEnvironment, { ...process.env }),
    "process.env sin cambios",
  ).toEqual([]);
});

beforeEach(() => {
  created.length = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(FIXED_TIME));
});

afterEach(() => {
  vi.useRealTimers();
});

function completedLine(environment: string): Record<string, unknown> {
  return {
    level: "info",
    time: FIXED_TIME,
    service: "aulanorma",
    environment,
    msg: "startup.completed",
  };
}

function configInvalidLine(
  mode: Mode,
  problems: readonly ProblemInput[],
): Record<string, unknown> {
  return {
    level: "fatal",
    time: FIXED_TIME,
    service: "aulanorma",
    environment: mode,
    mode,
    problems,
    msg: "startup.config_invalid",
  };
}

const SAMPLE_PROBLEMS: readonly ProblemInput[] = [
  { key: "AULANORMA_LOG_LEVEL", problem: "invalid_value" },
  { key: "AULANORMA_ENVIRONMENT", problem: "missing" },
];

describe("interfaz pública", () => {
  test("exporta en ejecución únicamente las tres funciones", () => {
    expect(Object.keys(logging).sort()).toEqual(EXPORTS);
    for (const name of EXPORTS) {
      expect(typeof Reflect.get(logging, name), name).toBe("function");
    }
  });

  test.each(LEVELS)(
    "con el nivel %s, createLogger devuelve un manejador opaco sin métodos de Pino",
    (level) => {
      const { destination } = memoryDestination();
      const handle = quietly(() =>
        logging.createLogger({ environment: "ci", level, destination }),
      );
      expect(typeof handle).toBe("object");
      expect(handle).not.toBeNull();
      const opaque = Object(handle) as object;
      expect(Object.getPrototypeOf(opaque), "prototipo nulo").toBeNull();
      expect(Reflect.ownKeys(opaque), "sin claves propias").toEqual([]);
      expect(Object.isFrozen(opaque), "congelado").toBe(true);
      expect(inheritedFunctions(opaque), "miembros heredados").toEqual([]);
      for (const member of PINO_MEMBERS) {
        expect(Reflect.get(opaque, member), member).toBeUndefined();
      }
      expect(exposedMembers(handle), "miembros expuestos").toEqual([]);
    },
  );

  test.each(LEVELS)(
    "con el nivel %s, crear el manejador no escribe nada",
    (level) => {
      const memory = memoryDestination();
      quietly(() =>
        logging.createLogger({
          environment: "development",
          level,
          destination: memory.destination,
        }),
      );
      expect(memory.writes).toEqual([]);
    },
  );

  test("los eventos se escriben solo en el destino inyectado", () => {
    const first = memoryDestination();
    const second = memoryDestination();
    const firstHandle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "info",
        destination: first.destination,
      }),
    );
    quietly(() =>
      logging.createLogger({
        environment: "test",
        level: "info",
        destination: second.destination,
      }),
    );
    quietly(() => {
      logging.logStartupCompleted(firstHandle);
    });
    expect(onlyLine(first)).toEqual(completedLine("ci"));
    expect(second.writes).toEqual([]);
  });
});

describe("startup.completed", () => {
  test.each(
    LEVELS.map((level, index) => ({
      level,
      environment: ENVIRONMENTS[index % ENVIRONMENTS.length] ?? "ci",
    })),
  )(
    "con el nivel operativo $level escribe una línea info exacta",
    ({ level, environment }) => {
      const memory = memoryDestination();
      const handle = quietly(() =>
        logging.createLogger({
          environment,
          level,
          destination: memory.destination,
        }),
      );
      quietly(() => {
        logging.logStartupCompleted(handle);
      });
      expect(onlyLine(memory)).toStrictEqual(completedLine(environment));
    },
  );

  test("cada llamada escribe exactamente una línea", () => {
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "silent",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logStartupCompleted(handle);
      logging.logStartupCompleted(handle);
      logging.logStartupCompleted(handle);
    });
    expect(memory.writes).toHaveLength(3);
    for (const write of memory.writes) {
      expect(parseLine(write)).toStrictEqual(completedLine("ci"));
    }
  });
});

describe("startup.config_invalid", () => {
  test.each(LEVELS.flatMap((level) => MODES.map((mode) => ({ level, mode }))))(
    "con el nivel operativo $level y el modo $mode escribe una línea fatal exacta",
    ({ level, mode }) => {
      const memory = memoryDestination();
      const handle = quietly(() =>
        logging.createLogger({
          environment: "ci",
          level,
          destination: memory.destination,
        }),
      );
      quietly(() => {
        logging.logConfigInvalid(handle, mode, SAMPLE_PROBLEMS);
      });
      expect(onlyLine(memory)).toStrictEqual(
        configInvalidLine(mode, SAMPLE_PROBLEMS),
      );
    },
  );

  test("reconstruye problems solo con key y problem e ignora valores, Error, rutas y trazas", () => {
    const noisy = [
      {
        key: "AULANORMA_LOG_LEVEL",
        problem: "invalid_value",
        value: SENTINEL,
        received: { password: SENTINEL },
        path: SYNTHETIC_PATH,
        stack: syntheticError().stack,
      },
      Object.assign(syntheticError(), {
        key: "environment",
        problem: "env_load_failed",
      }),
      {
        key: "NODE_ENV",
        problem: "mode_mismatch",
        cause: syntheticError(),
        file: ".env.production.local",
      },
    ];
    for (const entry of noisy) {
      Object.freeze(entry);
    }
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "silent",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logConfigInvalid(handle, "production", noisy);
    });
    const line = onlyLine(memory);
    expect(line).toStrictEqual(
      configInvalidLine("production", [
        { key: "AULANORMA_LOG_LEVEL", problem: "invalid_value" },
        { key: "environment", problem: "env_load_failed" },
        { key: "NODE_ENV", problem: "mode_mismatch" },
      ]),
    );
  });

  test("conserva los cinco códigos de problema y su orden", () => {
    const problems: readonly ProblemInput[] = [
      { key: "NODE_ENV", problem: "mode_mismatch" },
      { key: "environment", problem: "env_load_failed" },
      { key: "AULANORMA_LOG_LEVEL", problem: "missing" },
      { key: "AULANORMA_ENVIRONMENT", problem: "invalid_value" },
      { key: "AULANORMA_LOGLEVEL", problem: "unknown_key" },
    ];
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "development",
        level: "fatal",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logConfigInvalid(handle, "development", problems);
    });
    expect(onlyLine(memory)).toStrictEqual(
      configInvalidLine("development", problems),
    );
  });
});

describe("formato común", () => {
  test("ninguna línea contiene pid, hostname, requestId ni campos de petición", () => {
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "trace",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logStartupCompleted(handle);
      logging.logConfigInvalid(handle, "development", SAMPLE_PROBLEMS);
    });
    expect(memory.writes).toHaveLength(2);
    for (const write of memory.writes) {
      const line = parseLine(write);
      for (const field of FORBIDDEN_FIELDS) {
        expect(Object.hasOwn(line, field), field).toBe(false);
      }
      expect(write).not.toMatch(/requestId|hostname|"pid"|health/i);
    }
  });

  test("time es una marca ISO 8601 en UTC con el reloj real", () => {
    vi.useRealTimers();
    const before = Date.now();
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "info",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logStartupCompleted(handle);
    });
    const after = Date.now();
    const { time } = onlyLine(memory);
    if (typeof time !== "string") {
      expect.fail("time no es texto");
    }
    expect(time).toMatch(ISO_TIME);
    expect(new Date(time).toISOString()).toBe(time);
    expect(Date.parse(time)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(time)).toBeLessThanOrEqual(after);
  });
});

// Rutas aprobadas y un registro sintético que las ejercita con la semántica de
// Pino: `*.campo` cubre un único nivel de anidamiento.
const REDACTION_CASES = [
  {
    path: "*.password",
    record: { user: { password: SENTINEL } },
    at: ["user", "password"],
  },
  {
    path: "*.secret",
    record: { client: { secret: SENTINEL } },
    at: ["client", "secret"],
  },
  {
    path: "*.token",
    record: { session: { token: SENTINEL } },
    at: ["session", "token"],
  },
  {
    path: "*.apiKey",
    record: { provider: { apiKey: SENTINEL } },
    at: ["provider", "apiKey"],
  },
  {
    path: "authorization",
    record: { authorization: SENTINEL },
    at: ["authorization"],
  },
  { path: "cookie", record: { cookie: SENTINEL }, at: ["cookie"] },
] as const;

function valueAt(
  line: Record<string, unknown>,
  at: readonly string[],
): unknown {
  return at.reduce<unknown>(
    (current, key) =>
      typeof current === "object" && current !== null
        ? Reflect.get(current, key)
        : undefined,
    line,
  );
}

describe("censura con la configuración real del módulo", () => {
  test.each(REDACTION_CASES)(
    "$path queda como [REDACTED] y el valor original no aparece",
    ({ record, at }) => {
      const memory = memoryDestination();
      const handle = quietly(() =>
        logging.createLogger({
          environment: "ci",
          level: "silent",
          destination: memory.destination,
        }),
      );
      quietly(() => {
        logging.logStartupCompleted(handle);
        logging.logConfigInvalid(handle, "production", SAMPLE_PROBLEMS);
      });
      expect(memory.writes).toHaveLength(2);
      expect(created.length, "instancias de Pino creadas").toBeGreaterThan(0);
      // Cada instancia de Pino que crea el módulo censura la ruta.
      for (const instance of created) {
        memory.writes.length = 0;
        quietly(() => {
          (instance as PinoInstance)
            .child({}, { level: "trace" })
            .info({ ...record });
        });
        const line = onlyLine(memory);
        expect(valueAt(line, at)).toBe(REDACTED);
      }
    },
  );
});

describe("salud y correlación", () => {
  test("no existe función ni evento de consulta de salud ni requestId", () => {
    expect(
      Object.keys(logging).filter((name) =>
        /health|request|correlation/i.test(name),
      ),
    ).toEqual([]);
    const memory = memoryDestination();
    const handle = quietly(() =>
      logging.createLogger({
        environment: "ci",
        level: "trace",
        destination: memory.destination,
      }),
    );
    quietly(() => {
      logging.logStartupCompleted(handle);
      logging.logConfigInvalid(handle, "production", SAMPLE_PROBLEMS);
    });
    const events = memory.writes.map((write) => parseLine(write).msg);
    expect(events).toEqual(["startup.completed", "startup.config_invalid"]);
  });
});

// Procesos separados con el Pino real y sin sustitutos.
function runIsolated(action: "import" | "create" | "event"): {
  readonly stdout: string;
  readonly stderr: string;
} {
  const script = [
    'const { pathToFileURL } = await import("node:url");',
    "const logging = await import(pathToFileURL(process.argv[1]).href);",
    'if (process.argv[2] !== "import") {',
    '  const logger = logging.createLogger({ environment: "ci", level: "silent" });',
    '  if (process.argv[2] === "event") logging.logStartupCompleted(logger);',
    "}",
  ].join("\n");
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", script, LOGGING_MODULE_PATH, action],
    { cwd: repoRoot, env: {}, encoding: "utf8", timeout: 15_000 },
  );
  expect(result.status, "código de salida del proceso aislado").toBe(0);
  return { stdout: result.stdout, stderr: result.stderr };
}

describe("procesos separados", () => {
  test.each(["import", "create"] as const)(
    "%s: importar el módulo y crear el manejador sin destino no escribe nada",
    (action) => {
      const { stdout, stderr } = runIsolated(action);
      expect(stdout.length, "salida estándar vacía").toBe(0);
      expect(stderr.length, "salida de error vacía").toBe(0);
    },
    20_000,
  );

  test("sin destino, startup.completed escribe una línea JSON en la salida estándar", () => {
    const { stdout, stderr } = runIsolated("event");
    expect(stderr.length, "salida de error vacía").toBe(0);
    const line = parseLine(stdout);
    expect(Object.keys(line).sort()).toEqual([
      "environment",
      "level",
      "msg",
      "service",
      "time",
    ]);
    expect(line).toMatchObject({
      level: "info",
      service: "aulanorma",
      environment: "ci",
      msg: "startup.completed",
    });
    expect(line.time).toMatch(ISO_TIME);
  }, 20_000);
});
