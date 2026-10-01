// Decisión de la frontera HTTP: `request(req, res)` del objeto que devuelve
// `createHttpBoundary(handle)` (T038; FR-009; plan.md, «Frontera HTTP»;
// contracts/health.openapi.yaml). Como las demás pruebas escritas antes de la
// implementación, falla hasta que exista el módulo.
//
// Alcance: destino, método, rechazo cerrado, fallo de `handle`, un caso
// representativo de cada paso de la precedencia y unas pocas cabeceras de
// framework. El detalle de versión, `Host`, cuerpo y framing es de T028; el
// estado por socket, `clientError`, `checkContinue`, `checkExpectation`,
// `CONNECT` y `Upgrade`, de T027 y T040; la matriz TCP, de T029; el cableado
// con `http.createServer`, de T041.
//
// - El módulo se importa de forma dinámica y se tipa con el contrato esperado
//   que declara esta prueba; no hay declaración que oculte su ausencia.
// - El doble de petición solo deja leer `httpVersion`, `method`, `url`,
//   `rawHeaders` y `socket.destroy`; cualquier otra lectura se anota.
// - El doble de respuesta implementa el subconjunto de `ServerResponse` de
//   Node.js que necesita la frontera, con sus guardas y sus eventos `finish` y
//   `close`.
// - `URL`, `decodeURI` y `decodeURIComponent` se observan durante cada manejo.
//
// Los datos sintéticos nunca se imprimen: las fugas se informan con etiquetas.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { inspect } from "node:util";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Contrato esperado (plan.md, «Interfaz de la frontera»).
type Handle = (req: unknown, res: unknown) => Promise<void>;
type RequestListener = (req: unknown, res: unknown) => Promise<void>;

// La ausencia del módulo hace fallar la prueba aquí.
await import("@/platform/http-boundary");

// El espacio de nombres pasa por `unknown` antes de tiparse con el contrato: la
// conversión es necesaria tanto con el módulo ausente como con el real.
async function loadNamespace(): Promise<Record<string, unknown>> {
  const namespace: unknown = await import("@/platform/http-boundary");
  return namespace as Record<string, unknown>;
}

async function boundaryFor(handle: Handle): Promise<RequestListener> {
  const create = (await loadNamespace()).createHttpBoundary;
  if (typeof create !== "function") {
    expect.fail("el módulo no exporta createHttpBoundary");
  }
  const boundary: unknown = Reflect.apply(create, undefined, [handle]);
  const request: unknown = Reflect.get(Object(boundary), "request");
  if (typeof request !== "function") {
    expect.fail("la frontera no tiene un método request");
  }
  return (req, res) =>
    Reflect.apply(request, boundary, [req, res]) as Promise<void>;
}

const ALLOW = "GET, HEAD, OPTIONS";
const HOST = ["Host", "127.0.0.1:3000"];

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const SYNTHETIC_PATH = path.join(
  path.sep,
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

// Doble de petición. Solo se admiten las lecturas de la lista; `socket` solo
// para destruir la conexión.
const READABLE = new Set(["httpVersion", "method", "url", "rawHeaders"]);

interface SocketDouble {
  readonly proxy: object;
  destroys: number;
}

interface RequestDouble {
  readonly proxy: object;
  readonly reads: string[];
  readonly socket: SocketDouble;
  readonly rawHeaders: readonly string[];
}

interface RequestOptions {
  readonly method?: string;
  readonly url?: string;
  readonly httpVersion?: string;
  readonly rawHeaders?: readonly string[];
}

function requestDouble(options: RequestOptions = {}): RequestDouble {
  const reads: string[] = [];
  const socket: SocketDouble = {
    destroys: 0,
    proxy: new Proxy(
      { remoteAddress: SENTINEL, remotePort: 1, localAddress: SENTINEL },
      {
        get(target, key) {
          if (key === "destroy") {
            return () => {
              socket.destroys += 1;
            };
          }
          if (typeof key === "string") {
            reads.push(`socket.${key}`);
          }
          return Reflect.get(target, key) as unknown;
        },
      },
    ),
  };
  const httpVersion = options.httpVersion ?? "1.1";
  // Sin congelar, para que una alteración del contenido sea observable.
  const rawHeaders = [
    ...(options.rawHeaders ?? HOST),
    "User-Agent",
    SENTINEL,
    "Cookie",
    `session=${SENTINEL}`,
  ];
  const headers: Record<string, string> = {};
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    headers[(rawHeaders[index] ?? "").toLowerCase()] =
      rawHeaders[index + 1] ?? "";
  }
  const [major, minor] = httpVersion.split(".").map(Number);
  const target = {
    method: options.method ?? "GET",
    url: options.url ?? "/api/health",
    httpVersion,
    httpVersionMajor: major,
    httpVersionMinor: minor,
    rawHeaders,
    headers,
    body: SENTINEL,
    cookies: { session: SENTINEL },
    query: { q: SENTINEL },
  };
  const proxy = new Proxy(target, {
    get(object, key) {
      if (key === "socket" || key === "connection") {
        if (key === "connection") {
          reads.push("connection");
        }
        return socket.proxy;
      }
      if (typeof key === "string" && !READABLE.has(key) && key !== "then") {
        reads.push(key);
      }
      return Reflect.get(object, key) as unknown;
    },
  });
  return { proxy, reads, socket, rawHeaders };
}

// Doble de respuesta con las guardas de `ServerResponse`: tras enviar las
// cabeceras no se pueden cambiar cabeceras ni estado. Emite `finish` al
// terminar y `close` al terminar o destruirse, como Node.js.
class ResponseDouble extends EventEmitter {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  destroys = 0;
  readonly calls: string[] = [];
  readonly chunks: Buffer[] = [];
  committedStatus: number | undefined;
  commits = 0;
  ends = 0;
  socket: object | null = null;
  readonly #headers = new Map<string, string>();

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
  }

  #store(name: string, value: unknown): void {
    this.#headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? value.map(String).join(", ") : String(value),
    );
  }

  #push(chunk: unknown): void {
    if (typeof chunk === "string") {
      this.chunks.push(Buffer.from(chunk, "utf8"));
    } else if (chunk instanceof Uint8Array) {
      this.chunks.push(Buffer.from(chunk));
    }
  }

  setHeader(name: string, value: unknown): this {
    this.calls.push("setHeader");
    this.#guardHeaders();
    this.#store(name, value);
    return this;
  }

  appendHeader(name: string, value: unknown): this {
    this.calls.push("appendHeader");
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
    this.calls.push("removeHeader");
    this.#guardHeaders();
    this.#headers.delete(name.toLowerCase());
  }

  writeHead(status: number, ...rest: unknown[]): this {
    this.calls.push("writeHead");
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
    this.calls.push("flushHeaders");
    this.#commit();
  }

  write(chunk: unknown): boolean {
    this.calls.push("write");
    if (this.writableEnded) {
      throw new Error("write after end");
    }
    this.#commit();
    this.#push(chunk);
    return true;
  }

  end(chunk?: unknown): this {
    this.calls.push("end");
    this.ends += 1;
    if (this.writableEnded) {
      return this;
    }
    this.#commit();
    this.#push(chunk);
    this.writableEnded = true;
    process.nextTick(() => {
      this.writableFinished = true;
      this.emit("finish");
      this.emit("close");
    });
    return this;
  }

  destroy(): this {
    this.calls.push("destroy");
    this.destroys += 1;
    if (!this.destroyed) {
      this.destroyed = true;
      process.nextTick(() => this.emit("close"));
    }
    return this;
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

interface Exchange {
  readonly request: RequestDouble;
  readonly response: ResponseDouble;
  readonly rejected: boolean;
}

// Ejecuta `request` observando la salida estándar, la de error, `console` y
// las API de URL, y exige que no se haya escrito ni decodificado nada, que no
// se hayan leído datos de la petición y que la respuesta no filtre nada.
async function run(
  handle: Handle,
  options: RequestOptions = {},
  before: (request: RequestDouble, response: ResponseDouble) => void = () =>
    undefined,
): Promise<Exchange> {
  const listener = await boundaryFor(handle);
  const request = requestDouble(options);
  const response = new ResponseDouble();
  response.socket = request.socket.proxy;
  before(request, response);
  const output: string[] = [];
  const record = (...args: unknown[]): void => {
    output.push(args.map((arg) => inspect(arg)).join(" "));
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
  const decoders = [
    vi.spyOn(globalThis, "URL"),
    vi.spyOn(globalThis, "decodeURI"),
    vi.spyOn(globalThis, "decodeURIComponent"),
  ];
  let rejected = false;
  try {
    await listener(request.proxy, response);
  } catch {
    rejected = true;
  } finally {
    for (const spy of [...spies, ...decoders]) {
      spy.mockRestore();
    }
  }
  expect(output.join("").length, "sin salida estándar ni de error").toBe(0);
  expect(
    decoders.map((spy) => spy.mock.calls.length),
    "sin URL, decodeURI ni decodeURIComponent",
  ).toEqual([0, 0, 0]);
  expect(request.reads, "sin datos de la petición").toEqual([]);
  expect(leaks(response.serialized()), "respuesta sin datos sensibles").toEqual(
    [],
  );
  return { request, response, rejected };
}

function destroys({ request, response }: Exchange): number {
  return response.destroys + request.socket.destroys;
}

const CLOSED = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

// Rechazo cerrado: una sola respuesta completa, sin cuerpo, con las cabeceras
// cerradas y `Allow` solo en 405; `request` se resuelve sin rechazar.
function expectClosedRejection(
  result: Exchange,
  status: 400 | 404 | 405 | 500 | 505,
): void {
  const { response, rejected } = result;
  expect(rejected, "request no rechaza").toBe(false);
  expect(response.commits, "cabeceras enviadas una vez").toBe(1);
  expect(response.ends, "un único final").toBe(1);
  expect(response.writableEnded, "respuesta terminada").toBe(true);
  expect(destroys(result), "conexión no destruida").toBe(0);
  expect(response.committedStatus).toBe(status);
  expect(response.getHeaders()).toStrictEqual(
    status === 405 ? { ...CLOSED, allow: ALLOW } : CLOSED,
  );
  expect(response.body(), "cuerpo vacío").toBe("");
  expect(response.serialized()).not.toMatch(/"ok"|<html|<!doctype/i);
}

function neverCalled(): Handle {
  return vi.fn<Handle>(() => Promise.resolve());
}

// `handle` que termina en el siguiente ciclo, para comprobar que `request`
// espera a que termine la delegación.
function completingHandle(): { handle: Handle; finished: () => boolean } {
  let done = false;
  const handle = vi.fn<Handle>(
    () =>
      new Promise((resolve) => {
        setImmediate(() => {
          done = true;
          resolve();
        });
      }),
  );
  return { handle, finished: () => done };
}

beforeEach(() => {
  vi.resetModules();
});

describe("interfaz", () => {
  test("en ejecución exporta únicamente createHttpBoundary, que devuelve un request invocable", async () => {
    const namespace = await loadNamespace();
    expect(Object.keys(namespace)).toEqual(["createHttpBoundary"]);
    const listener = await boundaryFor(neverCalled());
    expect(typeof listener).toBe("function");
  });
});

describe("delegación", () => {
  test.each(["GET", "HEAD", "OPTIONS"])(
    "%s /api/health se delega una vez con los mismos objetos y request espera a que termine",
    async (method) => {
      const { handle, finished } = completingHandle();
      let untouched = false;
      let received: readonly unknown[] = [];
      const observed = vi.fn<Handle>((req, res) => {
        received = [req, res];
        const response = res as ResponseDouble;
        untouched =
          response.calls.length === 0 && response.getHeaderNames().length === 0;
        return handle(req, res);
      });
      const result = await run(observed, { method });
      expect(result.rejected, "request no rechaza").toBe(false);
      expect(observed).toHaveBeenCalledTimes(1);
      expect(received[0]).toBe(result.request.proxy);
      expect(received[1]).toBe(result.response);
      expect(untouched, "la frontera no toca la respuesta delegada").toBe(true);
      expect(finished(), "request se resuelve tras la delegación").toBe(true);
      expect(result.response.calls, "la frontera no escribe").toEqual([]);
      expect(destroys(result)).toBe(0);
    },
  );
});

describe("destino crudo exacto", () => {
  test.each([
    "/",
    "",
    "/foo",
    "/api",
    "/api/",
    "/api/health/",
    "/api/health//",
    "//api/health",
    "/api//health",
    "/api/health/extra",
    "/api/health?",
    "/api/health?x=1",
    "/api/health#x",
    "/api/health.rsc",
    "/api/health.json",
    "/API/HEALTH",
    "/Api/Health",
    "/api/%68ealth",
    "/api/health%2F",
    "/api%2Fhealth",
    "/%61pi/health",
    "/api/./health",
    "/api/x/../health",
    "http://127.0.0.1:3000/api/health",
    "*",
    "/404",
    "/500",
    "/_error",
    "/_not-found",
    "/_next/static/chunk.js",
    "/__nextjs_original-stack-frame",
    "/favicon.ico",
    " /api/health",
    "/api/health ",
  ])("%j recibe 404 cerrado sin delegar", async (url) => {
    const handle = neverCalled();
    const result = await run(handle, { url });
    expectClosedRejection(result, 404);
    expect(handle).not.toHaveBeenCalled();
  });

  test("HEAD sobre otro destino recibe el mismo 404 cerrado", async () => {
    const handle = neverCalled();
    const result = await run(handle, { method: "HEAD", url: "/api/health/" });
    expectClosedRejection(result, 404);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("método", () => {
  test.each([
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "TRACE",
    "PROPFIND",
    "QUERY",
    "get",
    "Head",
    "options",
  ])(
    "%s /api/health recibe 405 cerrado con Allow sin delegar",
    async (method) => {
      const handle = neverCalled();
      const result = await run(handle, { method });
      expectClosedRejection(result, 405);
      expect(handle).not.toHaveBeenCalled();
    },
  );
});

describe("fallo de handle antes de enviar cabeceras", () => {
  const FAILURES: readonly {
    readonly name: string;
    readonly handle: () => Handle;
  }[] = [
    {
      name: "rechazo con un Error",
      handle: () => vi.fn<Handle>(() => Promise.reject(syntheticError())),
    },
    {
      name: "rechazo con un valor que no es Error",
      handle: () =>
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- fallo forzado con cualquier valor
        vi.fn<Handle>(() => Promise.reject(SYNTHETIC_PATH)),
    },
    {
      name: "excepción síncrona",
      handle: () =>
        vi.fn<Handle>(() => {
          throw syntheticError();
        }),
    },
    {
      name: "rechazo tras fijar cabeceras sin enviarlas",
      handle: () =>
        vi.fn<Handle>((_req, res) => {
          const response = res as ResponseDouble;
          response.statusCode = 201;
          response.setHeader("Content-Type", "application/json");
          response.setHeader("X-Detalle", SENTINEL);
          return Promise.reject(syntheticError());
        }),
    },
  ];

  test.each(FAILURES)(
    "$name: 500 cerrado, una sola respuesta y request se resuelve",
    async ({ handle: build }) => {
      const handle = build();
      const result = await run(handle);
      expect(handle).toHaveBeenCalledTimes(1);
      expectClosedRejection(result, 500);
    },
  );
});

describe("fallo de handle con la respuesta ya iniciada", () => {
  const STARTED: readonly {
    readonly name: string;
    readonly handle: (mark: () => void) => Handle;
  }[] = [
    {
      name: "cabeceras enviadas y rechazo asíncrono",
      handle: (mark) =>
        vi.fn<Handle>((_req, res) => {
          const response = res as ResponseDouble;
          response.writeHead(200, { "Content-Type": "application/json" });
          mark();
          return Promise.reject(syntheticError());
        }),
    },
    {
      name: "cuerpo parcial y excepción síncrona",
      handle: (mark) =>
        vi.fn<Handle>((_req, res) => {
          const response = res as ResponseDouble;
          response.setHeader("Content-Type", "application/json");
          response.write('{"status":');
          mark();
          throw syntheticError();
        }),
    },
  ];

  test.each(STARTED)(
    "$name: sin segundo estado ni más operaciones, una destrucción y request se resuelve",
    async ({ handle: build }) => {
      let failedAt = -1;
      let response: ResponseDouble | undefined;
      const handle = build(() => {
        failedAt = response?.calls.length ?? -1;
      });
      const wrapped = vi.fn<Handle>((req, res) => {
        response = res as ResponseDouble;
        return handle(req, res);
      });
      const result = await run(wrapped);
      expect(result.rejected, "request no rechaza").toBe(false);
      expect(wrapped).toHaveBeenCalledTimes(1);
      expect(
        failedAt,
        "el fallo ocurrió con la respuesta iniciada",
      ).toBeGreaterThan(0);
      expect(result.response.commits, "un único envío de cabeceras").toBe(1);
      expect(result.response.committedStatus).toBe(200);
      expect(
        result.response.calls
          .slice(failedAt)
          .filter((call) => call !== "destroy"),
        "ninguna operación de respuesta tras el fallo",
      ).toEqual([]);
      expect(result.response.ends, "sin finalización posterior").toBe(0);
      expect(destroys(result), "exactamente una destrucción").toBe(1);
    },
  );
});

describe("precedencia versión → Host → destino → método → cuerpo", () => {
  test.each([
    {
      // `Host` duplicado: incumple la regla de `Host` en cualquier versión.
      name: "versión antes que Host",
      options: { httpVersion: "2.0", rawHeaders: [...HOST, ...HOST] },
      status: 505,
    },
    {
      name: "Host antes que destino",
      options: { url: "/foo", rawHeaders: [] },
      status: 400,
    },
    {
      name: "destino antes que método",
      options: { url: "/foo", method: "POST" },
      status: 404,
    },
    {
      name: "método antes que cuerpo",
      options: { method: "POST", rawHeaders: [...HOST, "Content-Length", "5"] },
      status: 405,
    },
  ] as const)("$name: responde $status", async ({ options, status }) => {
    const handle = neverCalled();
    const result = await run(handle, options);
    expectClosedRejection(result, status);
    expect(handle).not.toHaveBeenCalled();
  });

  test("un cuerpo en una petición admitida recibe 400 cerrado sin delegar", async () => {
    const handle = neverCalled();
    const result = await run(handle, {
      rawHeaders: [...HOST, "Content-Length", "5"],
    });
    expectClosedRejection(result, 400);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("cabeceras de framework", () => {
  const FRAMEWORK = [
    "x-invoke-path",
    "/api/health",
    "Next-Router-State-Tree",
    SENTINEL,
    "x-forwarded-host",
    "127.0.0.1:3000",
    "x-forwarded-proto",
    "https",
  ];

  test("no convierten un destino no exacto en delegación", async () => {
    const handle = neverCalled();
    const result = await run(handle, {
      url: "/api/health/",
      rawHeaders: [...HOST, ...FRAMEWORK],
    });
    expectClosedRejection(result, 404);
    expect(handle).not.toHaveBeenCalled();
  });

  test("no convierten un método no admitido en delegación", async () => {
    const handle = neverCalled();
    const result = await run(handle, {
      method: "POST",
      rawHeaders: [...HOST, ...FRAMEWORK],
    });
    expectClosedRejection(result, 405);
    expect(handle).not.toHaveBeenCalled();
  });

  test("una petición admitida con ellas se delega una vez, sin cambios", async () => {
    // Estado de la petición y de la respuesta antes de invocar `request`.
    const field = (request: RequestDouble, key: string): unknown =>
      Reflect.get(request.proxy, key);
    let before:
      | {
          readonly method: unknown;
          readonly url: unknown;
          readonly httpVersion: unknown;
          readonly rawHeaders: unknown;
          readonly rawHeadersCopy: readonly unknown[];
          readonly statusCode: number;
        }
      | undefined;
    let received: readonly unknown[] = [];
    const handle = vi.fn<Handle>((req, res) => {
      received = [req, res];
      return Promise.resolve();
    });
    const result = await run(
      handle,
      { rawHeaders: [...HOST, ...FRAMEWORK] },
      (request, response) => {
        const rawHeaders = field(request, "rawHeaders");
        before = {
          method: field(request, "method"),
          url: field(request, "url"),
          httpVersion: field(request, "httpVersion"),
          rawHeaders,
          rawHeadersCopy: Array.isArray(rawHeaders)
            ? (rawHeaders as readonly unknown[]).slice()
            : [],
          statusCode: response.statusCode,
        };
      },
    );
    if (before === undefined) {
      expect.fail("no se capturó el estado previo");
    }
    expect(result.rejected, "request no rechaza").toBe(false);
    expect(handle).toHaveBeenCalledTimes(1);
    expect(received[0], "la misma petición").toBe(result.request.proxy);
    expect(received[1], "la misma respuesta").toBe(result.response);
    const { request, response } = result;
    expect(field(request, "method"), "method sin cambios").toBe(before.method);
    expect(field(request, "url"), "url sin cambios").toBe(before.url);
    expect(field(request, "httpVersion"), "httpVersion sin cambios").toBe(
      before.httpVersion,
    );
    expect(field(request, "rawHeaders"), "misma referencia de rawHeaders").toBe(
      before.rawHeaders,
    );
    expect(
      field(request, "rawHeaders"),
      "mismo contenido y orden de rawHeaders",
    ).toStrictEqual(before.rawHeadersCopy);
    expect(response.calls, "la frontera no escribe").toEqual([]);
    expect(response.getHeaderNames(), "sin cabeceras").toEqual([]);
    expect(response.statusCode, "estado sin cambios").toBe(before.statusCode);
    expect(response.headersSent, "cabeceras sin enviar").toBe(false);
    expect(destroys(result), "conexión no destruida").toBe(0);
  });
});
