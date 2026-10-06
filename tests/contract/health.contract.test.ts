// Contrato del manejador de `src/pages/api/health.ts` (T037), llamado
// directamente con dobles de petición y respuesta (FR-006, FR-008, FR-009;
// contracts/health.openapi.yaml; research.md, R8 y K25). Como las demás
// pruebas escritas antes de la implementación, falla hasta que exista la ruta.
//
// Alcance: el manejador por sí mismo. Las respuestas HTTP reales, con la
// frontera y el servidor, se verifican en T025 y T029. Los errores internos de
// Next.js anteriores a la entrada en el manejador no están cubiertos por el
// 500 cerrado (K25) y esta prueba no los presenta como cubiertos.
//
// - Las áreas de `platform` que usa la ruta (`config`, `health`) se sustituyen
//   con `vi.mock` para provocar cada rama sin configuración real; `version` y
//   `logging` también se sustituyen para comprobar que la ruta no los usa.
// - El doble de respuesta implementa el subconjunto de `ServerResponse` de
//   Node.js que necesita la ruta, con sus mismas guardas (no se cambian
//   cabeceras ni estado tras enviarlas); no ofrece los ayudantes de Next.js
//   (`status`, `json`, `send`), que añadirían cabeceras fuera del contrato.
// - El doble de petición anota cualquier lectura de cabeceras, cookies,
//   consulta, cuerpo o dirección del cliente.
// - La importación se observa como en T022: salida estándar y de error,
//   `process.env` y `node:fs`.
//
// Los datos sintéticos nunca se imprimen: las fugas se informan con etiquetas.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Contrato esperado: el manejador por defecto de una API Route de Next.js.
type Handler = (request: unknown, response: unknown) => unknown;

const doubles = vi.hoisted(() => ({
  readRuntimeConfig: vi.fn<() => unknown>(),
  buildHealthStatus: vi.fn<() => unknown>(),
  getVersion: vi.fn<() => unknown>(),
  createLogger: vi.fn<() => unknown>(),
  logStartupCompleted: vi.fn<() => unknown>(),
  logConfigInvalid: vi.fn<() => unknown>(),
  fsCalls: [] as string[],
}));

const recordFs = vi.hoisted(
  () =>
    (
      name: string,
      actual: Record<string, unknown>,
    ): Record<string, unknown> => {
      const wrap = (source: Record<string, unknown>): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(source).map(([key, value]) => [
            key,
            typeof value === "function"
              ? (...args: unknown[]): unknown => {
                  doubles.fsCalls.push(`${name}.${key}`);
                  return Reflect.apply(value, source, args);
                }
              : value,
          ]),
        );
      const wrapped = wrap(actual);
      const fallback = actual.default;
      if (typeof fallback === "object" && fallback !== null) {
        wrapped.default = wrap(fallback as Record<string, unknown>);
      }
      return wrapped;
    },
);

vi.mock("@/platform/config", () => ({
  readRuntimeConfig: doubles.readRuntimeConfig,
}));
vi.mock("@/platform/health", () => ({
  buildHealthStatus: doubles.buildHealthStatus,
}));
vi.mock("@/platform/version", () => ({ getVersion: doubles.getVersion }));
vi.mock("@/platform/logging", () => ({
  createLogger: doubles.createLogger,
  logStartupCompleted: doubles.logStartupCompleted,
  logConfigInvalid: doubles.logConfigInvalid,
}));
vi.mock("node:fs", async (importOriginal) =>
  recordFs("node:fs", await importOriginal()),
);
vi.mock("fs", async (importOriginal) => recordFs("fs", await importOriginal()));
vi.mock("node:fs/promises", async (importOriginal) =>
  recordFs("node:fs/promises", await importOriginal()),
);
vi.mock("fs/promises", async (importOriginal) =>
  recordFs("fs/promises", await importOriginal()),
);

// La ausencia de la API Route hace fallar la prueba aquí.
await import("@/pages/api/health");

// El espacio de nombres pasa por `unknown` antes de tiparse con el contrato: la
// conversión es necesaria tanto con el módulo ausente como con el real.
async function loadHandler(): Promise<Handler> {
  const namespace: unknown = await import("@/pages/api/health");
  const handler: unknown = Reflect.get(Object(namespace), "default");
  if (typeof handler !== "function") {
    expect.fail("la ruta no exporta un manejador por defecto");
  }
  return handler as Handler;
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_FRAME = `${path.sep}src${path.sep}`;
const VERSION = (
  createRequire(import.meta.url)(path.join(repoRoot, "package.json")) as {
    readonly version: string;
  }
).version;
const ALLOW = "GET, HEAD, OPTIONS";

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const SYNTHETIC_PATH = path.join(
  path.parse(repoRoot).root,
  `aulanorma-sintetico-${RUN}`,
  ".env.production.local",
);
const SYNTHETIC_MESSAGE = `mensaje-sintetico-${RUN}`;
const SYNTHETIC_ERROR_NAME = `FalloSintetico${RUN.replaceAll("-", "")}`;
const SYNTHETIC_FRAME = `marcoSintetico-${RUN}`;

const SECRETS: Readonly<Record<string, string>> = {
  "valor centinela": SENTINEL,
  "ruta sintética": SYNTHETIC_PATH,
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

function leaks(text: string): string[] {
  return Object.entries(SECRETS)
    .filter(([, secret]) => text.includes(secret))
    .map(([label]) => label);
}

// Doble de petición: el método y la ruta; todo lo demás es dato de la
// petición que la ruta no debe leer.
const FORBIDDEN_REQUEST_FIELDS = new Set([
  "headers",
  "headersDistinct",
  "rawHeaders",
  "trailers",
  "rawTrailers",
  "cookies",
  "query",
  "body",
  "previewData",
  "draftMode",
]);

interface RequestDouble {
  readonly request: unknown;
  readonly reads: string[];
  readonly socket: SocketDouble;
}

interface SocketDouble {
  destroyed: boolean;
  readonly proxy: object;
}

function socketDouble(reads: string[]): SocketDouble {
  const state = { destroyed: false };
  const target = {
    remoteAddress: SENTINEL,
    remotePort: 1,
    localAddress: SENTINEL,
    destroy(): void {
      state.destroyed = true;
    },
  };
  const proxy = new Proxy(target, {
    get(object, key) {
      if (key !== "destroy" && key !== "destroyed") {
        reads.push(`socket.${String(key)}`);
      }
      return key === "destroyed"
        ? state.destroyed
        : (Reflect.get(object, key) as unknown);
    },
  });
  return {
    get destroyed() {
      return state.destroyed;
    },
    set destroyed(value: boolean) {
      state.destroyed = value;
    },
    proxy,
  };
}

function requestDouble(method: string): RequestDouble {
  const reads: string[] = [];
  const socket = socketDouble(reads);
  const target = {
    method,
    url: "/api/health",
    httpVersion: "1.1",
    headers: {
      host: "127.0.0.1:3000",
      "user-agent": SENTINEL,
      cookie: `session=${SENTINEL}`,
      authorization: `Bearer ${SENTINEL}`,
      "x-forwarded-for": SENTINEL,
      "x-request-id": SENTINEL,
    },
    rawHeaders: ["User-Agent", SENTINEL],
    cookies: { session: SENTINEL },
    query: { q: SENTINEL },
    body: SENTINEL,
  };
  const request = new Proxy(target, {
    get(object, key) {
      if (key === "socket" || key === "connection") {
        return socket.proxy;
      }
      if (typeof key === "string" && FORBIDDEN_REQUEST_FIELDS.has(key)) {
        reads.push(key);
      }
      return Reflect.get(object, key) as unknown;
    },
  });
  return { request, reads, socket };
}

// Doble de respuesta con las guardas de `ServerResponse`: tras enviar las
// cabeceras (`writeHead`, `flushHeaders`, `write` o `end`) no se pueden
// cambiar cabeceras ni estado.
type Failure = "none" | "first-operation" | "on-commit";

class ResponseDouble {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  writableEnded = false;
  destroyed = false;
  readonly calls: string[] = [];
  readonly chunks: Buffer[] = [];
  committedStatus: number | undefined;
  commits = 0;
  ends = 0;
  readonly socket: object;
  readonly #headers = new Map<string, string>();
  #failure: Failure;

  constructor(failure: Failure, socket: object) {
    this.#failure = failure;
    this.socket = socket;
  }

  #enter(operation: string): void {
    this.calls.push(operation);
    if (this.#failure === "first-operation") {
      this.#failure = "none";
      throw syntheticError();
    }
  }

  #guardHeaders(): void {
    if (this.headersSent) {
      const error = new Error("Cannot set headers after they are sent");
      Object.assign(error, { code: "ERR_HTTP_HEADERS_SENT" });
      throw error;
    }
  }

  #commit(): void {
    if (this.headersSent) {
      return;
    }
    this.headersSent = true;
    this.committedStatus = this.statusCode;
    this.commits += 1;
    if (this.#failure === "on-commit") {
      this.#failure = "none";
      throw syntheticError();
    }
  }

  #store(name: string, value: unknown): void {
    this.#headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? value.map(String).join(", ") : String(value),
    );
  }

  setHeader(name: string, value: unknown): this {
    this.#enter("setHeader");
    this.#guardHeaders();
    this.#store(name, value);
    return this;
  }

  appendHeader(name: string, value: unknown): this {
    this.#enter("appendHeader");
    this.#guardHeaders();
    const previous = this.#headers.get(name.toLowerCase());
    this.#store(
      name,
      previous === undefined ? value : `${previous}, ${String(value)}`,
    );
    return this;
  }

  getHeader(name: string): string | undefined {
    return this.#headers.get(name.toLowerCase());
  }

  getHeaders(): Record<string, string> {
    return Object.fromEntries(this.#headers);
  }

  getHeaderNames(): string[] {
    return [...this.#headers.keys()];
  }

  hasHeader(name: string): boolean {
    return this.#headers.has(name.toLowerCase());
  }

  removeHeader(name: string): void {
    this.#enter("removeHeader");
    this.#guardHeaders();
    this.#headers.delete(name.toLowerCase());
  }

  writeHead(status: number, ...rest: unknown[]): this {
    this.#enter("writeHead");
    this.#guardHeaders();
    this.statusCode = status;
    const [first, second] = rest;
    if (typeof first === "string") {
      this.statusMessage = first;
    }
    const headers = typeof first === "string" ? second : first;
    if (Array.isArray(headers)) {
      for (let index = 0; index + 1 < headers.length; index += 2) {
        this.#store(String(headers[index]), headers[index + 1]);
      }
    } else if (typeof headers === "object" && headers !== null) {
      for (const [name, value] of Object.entries(headers)) {
        this.#store(name, value);
      }
    }
    this.#commit();
    return this;
  }

  flushHeaders(): void {
    this.#enter("flushHeaders");
    this.#commit();
  }

  write(chunk: unknown): boolean {
    this.#enter("write");
    if (this.writableEnded) {
      throw new Error("write after end");
    }
    this.#commit();
    this.#push(chunk);
    return true;
  }

  end(chunk?: unknown): this {
    this.#enter("end");
    this.ends += 1;
    if (this.writableEnded) {
      return this;
    }
    this.#commit();
    this.#push(chunk);
    this.writableEnded = true;
    return this;
  }

  destroy(): this {
    this.calls.push("destroy");
    this.destroyed = true;
    return this;
  }

  #push(chunk: unknown): void {
    if (typeof chunk === "string") {
      this.chunks.push(Buffer.from(chunk, "utf8"));
    } else if (chunk instanceof Uint8Array) {
      this.chunks.push(Buffer.from(chunk));
    }
  }

  body(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  serialized(): string {
    return inspect(
      {
        status: this.committedStatus,
        statusMessage: this.statusMessage,
        headers: this.getHeaders(),
        body: this.body(),
      },
      { depth: null },
    );
  }
}

interface Observation {
  readonly output: string;
  readonly environment: readonly string[];
  readonly fs: readonly string[];
}

// Salida estándar, de error y `console`; accesos a `process.env` desde `src/`;
// y llamadas a `node:fs`.
async function observe<T>(
  action: () => T | Promise<T>,
): Promise<{ readonly value: T; readonly observed: Observation }> {
  const chunks: string[] = [];
  const record = (...args: unknown[]): void => {
    chunks.push(
      args
        .map((arg) => (typeof arg === "string" ? arg : inspect(arg)))
        .join(" "),
    );
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
  const environment: string[] = [];
  const touch = (key: string | symbol): void => {
    if (new Error().stack?.includes(SOURCE_FRAME) === true) {
      environment.push(String(key));
    }
  };
  const originalEnvironment = process.env;
  process.env = new Proxy(originalEnvironment, {
    get(target, key) {
      touch(key);
      return Reflect.get(target, key) as unknown;
    },
    has(target, key) {
      touch(key);
      return Reflect.has(target, key);
    },
    ownKeys(target) {
      touch("*");
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, key) {
      touch(key);
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  doubles.fsCalls.length = 0;
  try {
    const value = await action();
    return {
      value,
      observed: {
        output: chunks.join(""),
        environment: [...environment],
        fs: [...doubles.fsCalls],
      },
    };
  } finally {
    process.env = originalEnvironment;
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
}

function expectQuiet(observed: Observation): void {
  expect(observed.output.length, "sin salida estándar ni de error").toBe(0);
  expect(observed.environment, "sin acceso a process.env").toEqual([]);
  expect(observed.fs, "sin llamadas a node:fs").toEqual([]);
}

function expectNoLogging(): void {
  expect(doubles.createLogger).not.toHaveBeenCalled();
  expect(doubles.logStartupCompleted).not.toHaveBeenCalled();
  expect(doubles.logConfigInvalid).not.toHaveBeenCalled();
}

interface Exchange {
  readonly request: RequestDouble;
  readonly response: ResponseDouble;
  readonly thrown: unknown;
}

// Invoca el manejador y espera su resultado si es una promesa. Registra una
// excepción o un rechazo en lugar de propagarlos.
async function exchange(
  method: string,
  failure: Failure = "none",
): Promise<Exchange> {
  const handler = await loadHandler();
  const request = requestDouble(method);
  const response = new ResponseDouble(failure, request.socket.proxy);
  const { value: thrown, observed } = await observe(async () => {
    try {
      await handler(request.request, response);
    } catch (error: unknown) {
      return error ?? "valor nulo lanzado";
    }
    return undefined;
  });
  expectQuiet(observed);
  expectNoLogging();
  expect(leaks(response.serialized()), "respuesta sin datos sensibles").toEqual(
    [],
  );
  expect(request.reads, "sin datos de la petición").toEqual([]);
  expect(
    doubles.getVersion,
    "la versión solo llega por health",
  ).not.toHaveBeenCalled();
  return { request, response, thrown };
}

// Una única respuesta completa: un envío de cabeceras y un final.
function expectSingleCompleteResponse(response: ResponseDouble): void {
  expect(response.commits, "cabeceras enviadas una vez").toBe(1);
  expect(response.ends, "un único final").toBe(1);
  expect(response.writableEnded, "respuesta terminada").toBe(true);
  expect(response.destroyed, "conexión no destruida").toBe(false);
}

const CLOSED_REJECTION = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

function expectClosedRejection(
  { response, thrown }: Exchange,
  status: 405 | 500,
): void {
  expect(thrown, "el manejador no lanza").toBeUndefined();
  expectSingleCompleteResponse(response);
  expect(response.committedStatus).toBe(status);
  expect(response.getHeaders()).toStrictEqual(
    status === 405 ? { ...CLOSED_REJECTION, allow: ALLOW } : CLOSED_REJECTION,
  );
  expect(response.body(), "cuerpo vacío").toBe("");
  expect(response.serialized()).not.toMatch(/"ok"|<html|<!doctype/i);
}

const VALID_CONFIG = {
  ok: true,
  config: { logLevel: "info", environment: "ci" },
};

beforeEach(() => {
  vi.resetModules();
  for (const spy of [
    doubles.readRuntimeConfig,
    doubles.buildHealthStatus,
    doubles.getVersion,
    doubles.createLogger,
    doubles.logStartupCompleted,
    doubles.logConfigInvalid,
  ]) {
    spy.mockReset();
  }
  doubles.readRuntimeConfig.mockImplementation(() => VALID_CONFIG);
  doubles.buildHealthStatus.mockImplementation(() => ({
    status: "ok",
    version: VERSION,
  }));
  doubles.getVersion.mockImplementation(() => VERSION);
});

describe("módulo de la API Route", () => {
  test("exporta un manejador por defecto", async () => {
    expect(typeof (await loadHandler())).toBe("function");
  });

  test("importarlo no lee configuración, no construye el estado, no registra y no escribe", async () => {
    for (const spy of [
      doubles.readRuntimeConfig,
      doubles.buildHealthStatus,
      doubles.getVersion,
    ]) {
      spy.mockImplementation(() => {
        throw syntheticError();
      });
    }
    const { observed } = await observe(loadHandler);
    expectQuiet(observed);
    expect(doubles.readRuntimeConfig).not.toHaveBeenCalled();
    expect(doubles.buildHealthStatus).not.toHaveBeenCalled();
    expect(doubles.getVersion).not.toHaveBeenCalled();
    expectNoLogging();
  });
});

describe("respuestas satisfactorias", () => {
  const BODY = JSON.stringify({ status: "ok", version: VERSION });
  const SUCCESS_HEADERS = {
    "cache-control": "no-store",
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(BODY)),
  };

  test("GET: 200 con el cuerpo exacto del contrato", async () => {
    const { response, thrown } = await exchange("GET");
    expect(thrown).toBeUndefined();
    expectSingleCompleteResponse(response);
    expect(response.committedStatus).toBe(200);
    expect(response.getHeaders()).toStrictEqual(SUCCESS_HEADERS);
    const body: unknown = JSON.parse(response.body());
    expect(Object.keys(body as object)).toEqual(["status", "version"]);
    expect(body).toStrictEqual({ status: "ok", version: VERSION });
    expect(doubles.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(doubles.buildHealthStatus).toHaveBeenCalledTimes(1);
  });

  test("HEAD: 200 con las mismas cabeceras que GET y sin cuerpo", async () => {
    const { response, thrown } = await exchange("HEAD");
    expect(thrown).toBeUndefined();
    expectSingleCompleteResponse(response);
    expect(response.committedStatus).toBe(200);
    expect(response.getHeaders()).toStrictEqual(SUCCESS_HEADERS);
    expect(response.body()).toBe("");
    expect(doubles.readRuntimeConfig).toHaveBeenCalledTimes(1);
    expect(doubles.buildHealthStatus).toHaveBeenCalledTimes(1);
  });

  test("OPTIONS: 204 de transporte con Allow y sin cuerpo", async () => {
    const { response, thrown } = await exchange("OPTIONS");
    expect(thrown).toBeUndefined();
    expectSingleCompleteResponse(response);
    expect(response.committedStatus).toBe(204);
    expect(response.getHeaders()).toStrictEqual({
      allow: ALLOW,
      "cache-control": "no-store",
    });
    expect(response.body()).toBe("");
  });
});

describe("405 defensivo cerrado", () => {
  test.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "TRACE",
    "CONNECT",
    "PROPFIND",
    "QUERY",
  ])("%s: 405 cerrado con Allow", async (method) => {
    const result = await exchange(method);
    expectClosedRejection(result, 405);
    expect(doubles.buildHealthStatus).not.toHaveBeenCalled();
  });
});

// Fallos forzados dentro del manejador antes de iniciar la respuesta.
const FAILURES: readonly {
  readonly name: string;
  readonly arrange: () => void;
  readonly response?: Failure;
}[] = [
  {
    name: "configuración inválida",
    arrange: () => {
      doubles.readRuntimeConfig.mockImplementation(() => ({
        ok: false,
        problems: [{ key: "AULANORMA_LOG_LEVEL", problem: "invalid_value" }],
      }));
    },
  },
  {
    name: "la lectura de la configuración lanza un Error",
    arrange: () => {
      doubles.readRuntimeConfig.mockImplementation(() => {
        throw syntheticError();
      });
    },
  },
  {
    name: "la lectura de la configuración lanza un valor que no es Error",
    arrange: () => {
      doubles.readRuntimeConfig.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- fallo forzado con cualquier valor
        throw SYNTHETIC_PATH;
      });
    },
  },
  {
    name: "la construcción del estado lanza un Error",
    arrange: () => {
      doubles.buildHealthStatus.mockImplementation(() => {
        throw syntheticError();
      });
    },
  },
  {
    name: "la construcción del estado lanza un valor que no es Error",
    arrange: () => {
      doubles.buildHealthStatus.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- fallo forzado con cualquier valor
        throw SENTINEL;
      });
    },
  },
  {
    name: "la primera operación sobre la respuesta lanza",
    arrange: () => undefined,
    response: "first-operation",
  },
];

describe("500 cerrado ante un fallo dentro del manejador antes de iniciar la respuesta", () => {
  test.each(
    FAILURES.flatMap((failure) =>
      ["GET", "HEAD"].map((method) => ({ method, ...failure })),
    ),
  )(
    "$method, $name: 500 cerrado, sin lanzar y nunca ok",
    async ({ method, arrange, response }) => {
      arrange();
      const result = await exchange(method, response);
      expectClosedRejection(result, 500);
    },
  );

  test("con la configuración inválida no construye el estado", async () => {
    doubles.readRuntimeConfig.mockImplementation(() => ({
      ok: false,
      problems: [{ key: "AULANORMA_ENVIRONMENT", problem: "missing" }],
    }));
    const result = await exchange("GET");
    expectClosedRejection(result, 500);
    expect(doubles.buildHealthStatus).not.toHaveBeenCalled();
  });
});

describe("fallo después de iniciar la respuesta", () => {
  test.each(["GET", "HEAD"])(
    "%s: no escribe un segundo estado, destruye la conexión y no lanza",
    async (method) => {
      const { request, response, thrown } = await exchange(method, "on-commit");
      expect(thrown, "el manejador no lanza").toBeUndefined();
      expect(response.commits, "un único envío de cabeceras").toBe(1);
      expect(response.committedStatus).toBe(200);
      // Tras la operación que falló, solo se admite destruir la conexión.
      const failed = response.calls.findIndex(
        (call) =>
          call !== "setHeader" &&
          call !== "appendHeader" &&
          call !== "removeHeader",
      );
      expect(
        response.calls.slice(failed + 1).filter((call) => call !== "destroy"),
        "ninguna operación de respuesta tras el fallo",
      ).toEqual([]);
      expect(
        response.destroyed || request.socket.destroyed,
        "conexión destruida",
      ).toBe(true);
    },
  );
});
