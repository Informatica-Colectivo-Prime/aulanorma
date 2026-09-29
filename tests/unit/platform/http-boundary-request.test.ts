// Validación de la petición en la frontera HTTP: versión, `Host` sobre
// `rawHeaders`, cuerpo y framing de `request(req, res)` del objeto que devuelve
// `createHttpBoundary(handle)` (T038; FR-006 C2 y FR-009; plan.md, «Frontera
// HTTP»; contracts/health.openapi.yaml, `x-aulanorma-transport-boundary`).
// Como las demás pruebas escritas antes de la implementación, falla hasta que
// exista el módulo.
//
// Alcance: la matriz de versión, `Host`, `Content-Length` y
// `Transfer-Encoding`, el comportamiento vigente ante obs-text y espacios
// internos en `Host` (research.md, K21), la lista cerrada de cabeceras que
// inspecciona la frontera y la precedencia con varias infracciones a la vez.
// Los destinos, los métodos y un caso por cada par consecutivo de la
// precedencia son de T024; el estado por socket, de T027; lo que el analizador
// HTTP de Node.js rechaza antes de la frontera, de la matriz TCP de T029.
//
// Los valores son sintéticos y únicos en cada ejecución, y nunca se imprimen:
// las fugas se informan con etiquetas.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

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
const CLOSED = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

// Valores sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const HOST_VALUE = `host-${RUN}.invalid`;
const SENTINEL = `centinela-${RUN}`;
const HOST = ["Host", HOST_VALUE];

const SECRETS: Readonly<Record<string, string>> = {
  "valor de Host": HOST_VALUE,
  "valor centinela": SENTINEL,
};

function leaks(text: string): string[] {
  return Object.entries(SECRETS)
    .filter(([, secret]) => text.includes(secret))
    .map(([label]) => label);
}

// Doble de petición: solo se admiten las lecturas de la lista y `socket`, y
// cualquier escritura en la petición se anota.
const READABLE = new Set([
  "httpVersion",
  "method",
  "url",
  "rawHeaders",
  "socket",
]);

interface RequestOptions {
  readonly httpVersion?: string;
  readonly method?: string;
  readonly url?: string;
  readonly rawHeaders?: readonly string[];
}

interface RequestDouble {
  readonly proxy: object;
  readonly reads: string[];
  readonly writes: string[];
  readonly rawHeaders: string[];
  readonly rawHeadersCopy: readonly string[];
}

function requestDouble(options: RequestOptions = {}): RequestDouble {
  const reads: string[] = [];
  const writes: string[] = [];
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
    const name = (rawHeaders[index] ?? "").toLowerCase();
    const value = rawHeaders[index + 1] ?? "";
    headers[name] =
      name in headers ? `${headers[name] ?? ""}, ${value}` : value;
  }
  const httpVersion = options.httpVersion ?? "1.1";
  const [major, minor] = httpVersion.split(".").map(Number);
  const socket = new EventEmitter();
  Object.assign(socket, {
    remoteAddress: SENTINEL,
    writable: true,
    destroyed: false,
    destroy: () => socket,
  });
  const target = {
    httpVersion,
    httpVersionMajor: major,
    httpVersionMinor: minor,
    method: options.method ?? "GET",
    url: options.url ?? "/api/health",
    rawHeaders,
    headers,
    headersDistinct: Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [name, [value]]),
    ),
    socket,
    connection: socket,
    body: SENTINEL,
  };
  const proxy = new Proxy(target, {
    get(object, key) {
      if (typeof key === "string" && !READABLE.has(key) && key !== "then") {
        reads.push(key);
      }
      return Reflect.get(object, key) as unknown;
    },
    set(object, key, value) {
      writes.push(String(key));
      return Reflect.set(object, key, value);
    },
    defineProperty(object, key, descriptor) {
      writes.push(String(key));
      return Reflect.defineProperty(object, key, descriptor);
    },
  });
  return {
    proxy,
    reads,
    writes,
    rawHeaders,
    rawHeadersCopy: [...rawHeaders],
  };
}

// Doble de respuesta con las guardas de `ServerResponse`: tras enviar las
// cabeceras no se pueden cambiar cabeceras ni estado. Emite `finish` y `close`
// al terminar.
class ResponseDouble extends EventEmitter {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  destroys = 0;
  commits = 0;
  ends = 0;
  committedStatus: number | undefined;
  readonly calls: string[] = [];
  readonly #chunks: Buffer[] = [];
  readonly #headers = new Map<string, string>();

  #guardHeaders(): void {
    if (this.headersSent) {
      const error = new Error("Cannot set headers after they are sent");
      Object.assign(error, { code: "ERR_HTTP_HEADERS_SENT" });
      throw error;
    }
  }

  #commit(): void {
    if (!this.headersSent) {
      this.headersSent = true;
      this.committedStatus = this.statusCode;
      this.commits += 1;
    }
  }

  #store(name: string, value: unknown): void {
    this.#headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? value.map(String).join(", ") : String(value),
    );
  }

  #push(chunk: unknown): void {
    if (typeof chunk === "string") {
      this.#chunks.push(Buffer.from(chunk, "utf8"));
    } else if (chunk instanceof Uint8Array) {
      this.#chunks.push(Buffer.from(chunk));
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

  writeContinue(): void {
    this.calls.push("writeContinue");
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
    return Buffer.concat(this.#chunks).toString("utf8");
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
  readonly handle: ReturnType<typeof vi.fn<Handle>>;
  // Estado de la respuesta cuando `handle` la recibe.
  readonly delivered: readonly {
    readonly req: unknown;
    readonly res: unknown;
    readonly calls: readonly string[];
    readonly headerNames: readonly string[];
    readonly statusCode: number;
  }[];
}

// Salida estándar, de error y `console` durante cada prueba.
let output: string[] = [];

async function run(options: RequestOptions = {}): Promise<Exchange> {
  const delivered: {
    req: unknown;
    res: unknown;
    calls: readonly string[];
    headerNames: readonly string[];
    statusCode: number;
  }[] = [];
  const handle = vi.fn<Handle>((req, res) => {
    const response = res as ResponseDouble;
    delivered.push({
      req,
      res,
      calls: [...response.calls],
      headerNames: response.getHeaderNames(),
      statusCode: response.statusCode,
    });
    return Promise.resolve();
  });
  const listener = await boundaryFor(handle);
  const request = requestDouble(options);
  const response = new ResponseDouble();
  await listener(request.proxy, response);
  expect(request.reads, "sin datos de la petición").toEqual([]);
  expect(request.writes, "la petición no se modifica").toEqual([]);
  expect(request.rawHeaders, "rawHeaders sin cambios").toStrictEqual(
    request.rawHeadersCopy,
  );
  expect(leaks(response.serialized()), "respuesta sin valores").toEqual([]);
  return { request, response, handle, delivered };
}

// Rechazo cerrado: una sola respuesta completa, sin cuerpo, con las cabeceras
// cerradas y `Allow` solo en 405, sin delegar.
function expectRejected(result: Exchange, status: 400 | 404 | 405 | 505): void {
  const { response, handle } = result;
  expect(handle, "sin delegar").not.toHaveBeenCalled();
  expect(response.committedStatus, "estado").toBe(status);
  expect(response.commits, "cabeceras enviadas una vez").toBe(1);
  expect(response.ends, "un único final").toBe(1);
  expect(response.getHeaders()).toStrictEqual(
    status === 405 ? { ...CLOSED, allow: ALLOW } : CLOSED,
  );
  expect(response.body(), "cuerpo vacío").toBe("");
  expect(response.destroys, "sin destruir").toBe(0);
  expect(response.calls).not.toContain("writeContinue");
}

// Delegación: una única llamada con los mismos objetos, sin que la frontera
// haya escrito, fijado cabeceras o cambiado el estado de la respuesta.
function expectDelegated(result: Exchange): void {
  const { request, response, handle, delivered } = result;
  expect(handle, "una única delegación").toHaveBeenCalledTimes(1);
  const [first] = delivered;
  expect(first?.req, "la misma petición").toBe(request.proxy);
  expect(first?.res, "la misma respuesta").toBe(response);
  expect(first?.calls, "la frontera no escribe").toEqual([]);
  expect(first?.headerNames, "sin cabeceras previas").toEqual([]);
  expect(first?.statusCode, "estado sin cambios").toBe(200);
  expect(response.calls, "sin respuesta de la frontera").toEqual([]);
}

beforeEach(() => {
  vi.resetModules();
  output = [];
  const record = (...args: unknown[]): void => {
    output.push(args.map((arg) => inspect(arg)).join(" "));
  };
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    record(chunk);
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
    record(chunk);
    return true;
  });
  for (const method of [
    "log",
    "info",
    "warn",
    "error",
    "debug",
    "trace",
  ] as const) {
    vi.spyOn(console, method).mockImplementation(record);
  }
});

afterEach(() => {
  const printed = output.join("");
  vi.restoreAllMocks();
  expect(printed.length, "sin salida estándar, de error ni registros").toBe(0);
});

describe("versión", () => {
  test.each(["1.0", "1.1"])(
    "HTTP/%s se admite y se delega",
    async (version) => {
      expectDelegated(await run({ httpVersion: version }));
    },
  );

  test.each(["2.0", "0.9", "1.2", "3.0"])(
    "HTTP/%s, analizada pero no admitida, recibe 505 cerrado",
    async (version) => {
      expectRejected(await run({ httpVersion: version }), 505);
    },
  );
});

describe("Host en HTTP/1.1", () => {
  const INVALID: readonly (readonly [string, readonly string[]])[] = [
    ["ausente", []],
    ["duplicado Host y host", ["Host", HOST_VALUE, "host", HOST_VALUE]],
    ["duplicado HOST y hOsT", ["HOST", HOST_VALUE, "hOsT", HOST_VALUE]],
    ["duplicado con valores distintos", ["Host", HOST_VALUE, "Host", "otro"]],
    [
      "duplicado separado por otra cabecera",
      ["host", HOST_VALUE, "Accept", "*/*", "Host", HOST_VALUE],
    ],
    ["vacío", ["Host", ""]],
    ["solo espacios", ["Host", "   "]],
    ["con coma", ["Host", `${HOST_VALUE},otro`]],
    ["solo una coma", ["Host", ","]],
    ["con \\x00", ["Host", `a\x00${HOST_VALUE}`]],
    ["con \\x01", ["Host", `a\x01${HOST_VALUE}`]],
    ["con tabulador \\x09", ["Host", `a\t${HOST_VALUE}`]],
    ["con \\x0a", ["Host", `a\n${HOST_VALUE}`]],
    ["con \\x1f", ["Host", `a\x1f${HOST_VALUE}`]],
    ["con \\x7f", ["Host", `a\x7f${HOST_VALUE}`]],
  ];

  test.each(INVALID)("%s recibe 400 cerrado", async (_label, rawHeaders) => {
    expectRejected(await run({ rawHeaders }), 400);
  });

  test("uno solo, válido, se admite", async () => {
    expectDelegated(await run({ rawHeaders: ["host", HOST_VALUE] }));
  });
});

describe("Host en HTTP/1.0", () => {
  test("ausente se admite", async () => {
    expectDelegated(await run({ httpVersion: "1.0", rawHeaders: [] }));
  });

  test("presente y válido se admite", async () => {
    expectDelegated(await run({ httpVersion: "1.0" }));
  });

  test.each([
    ["duplicado", ["Host", HOST_VALUE, "HOST", HOST_VALUE]],
    ["vacío", ["Host", ""]],
    ["solo espacios", ["Host", " \t "]],
    ["con coma", ["Host", `${HOST_VALUE},otro`]],
    ["con \\x01", ["Host", `a\x01${HOST_VALUE}`]],
    ["con \\x7f", ["Host", `a\x7f${HOST_VALUE}`]],
  ] as const)("%s recibe 400 cerrado", async (_label, rawHeaders) => {
    expectRejected(await run({ httpVersion: "1.0", rawHeaders }), 400);
  });
});

describe("Host con obs-text o espacios internos (K21: se admite)", () => {
  test.each([
    ["obs-text en HTTP/1.1", "1.1", `aé${HOST_VALUE}`],
    ["obs-text \\xff en HTTP/1.1", "1.1", `${HOST_VALUE}ÿ`],
    ["espacio interno en HTTP/1.1", "1.1", `a ${HOST_VALUE}`],
    ["obs-text en HTTP/1.0", "1.0", `aé${HOST_VALUE}`],
    ["espacio interno en HTTP/1.0", "1.0", `a ${HOST_VALUE}`],
  ] as const)("%s se delega", async (_label, httpVersion, host) => {
    expectDelegated(await run({ httpVersion, rawHeaders: ["Host", host] }));
  });
});

describe("cuerpo y framing", () => {
  test.each([
    ["sin Content-Length ni Transfer-Encoding", []],
    ["Content-Length: 0", ["Content-Length", "0"]],
    ["content-length: 0 en minúsculas", ["content-length", "0"]],
  ] as const)("%s se admite", async (_label, extra) => {
    expectDelegated(await run({ rawHeaders: [...HOST, ...extra] }));
  });

  test.each([
    ["Content-Length: 1", ["Content-Length", "1"]],
    ["Content-Length: 5", ["Content-Length", "5"]],
    ["CONTENT-LENGTH: 42", ["CONTENT-LENGTH", "42"]],
    ["Transfer-Encoding: chunked", ["Transfer-Encoding", "chunked"]],
    ["Transfer-Encoding: identity", ["Transfer-Encoding", "identity"]],
    [
      "Transfer-Encoding: gzip, chunked",
      ["Transfer-Encoding", "gzip, chunked"],
    ],
    ["Transfer-Encoding vacío", ["Transfer-Encoding", ""]],
    ["transfer-encoding en minúsculas", ["transfer-encoding", "chunked"]],
    [
      "Transfer-Encoding con Content-Length: 0",
      ["Transfer-Encoding", "chunked", "Content-Length", "0"],
    ],
    [
      "Transfer-Encoding con un valor sintético",
      ["Transfer-Encoding", SENTINEL],
    ],
  ] as const)("%s recibe 400 cerrado", async (_label, extra) => {
    expectRejected(await run({ rawHeaders: [...HOST, ...extra] }), 400);
  });

  test("en HTTP/1.0, Transfer-Encoding también recibe 400 cerrado", async () => {
    expectRejected(
      await run({
        httpVersion: "1.0",
        rawHeaders: ["Transfer-Encoding", "chunked"],
      }),
      400,
    );
  });

  test("OPTIONS con Content-Length: 5 recibe 400 cerrado", async () => {
    expectRejected(
      await run({
        method: "OPTIONS",
        rawHeaders: [...HOST, "Content-Length", "5"],
      }),
      400,
    );
  });
});

describe("precedencia con varias infracciones", () => {
  const BODY = ["Content-Length", "5"];
  const CASES: readonly {
    readonly name: string;
    readonly options: RequestOptions;
    readonly status: 400 | 404 | 405 | 505;
  }[] = [
    // Las infracciones de `Host` de estos casos (duplicado, coma o vacío)
    // valen en cualquier versión, no solo la ausencia en HTTP/1.1.
    {
      name: "versión, Host con coma, destino, método y cuerpo",
      options: {
        httpVersion: "2.0",
        url: "/otra",
        method: "POST",
        rawHeaders: ["Host", ",", ...BODY],
      },
      status: 505,
    },
    {
      name: "versión y Host vacío",
      options: { httpVersion: "0.9", rawHeaders: ["Host", ""] },
      status: 505,
    },
    {
      name: "versión sin Host",
      options: { httpVersion: "2.0", rawHeaders: [] },
      status: 505,
    },
    {
      name: "Host ausente, destino, método y cuerpo",
      options: { url: "/otra", method: "POST", rawHeaders: [...BODY] },
      status: 400,
    },
    {
      name: "Host duplicado, destino, método y cuerpo",
      options: {
        url: "/otra",
        method: "POST",
        rawHeaders: [...HOST, ...HOST, ...BODY],
      },
      status: 400,
    },
    {
      name: "Host con coma y destino",
      options: { url: "/otra", rawHeaders: ["Host", "a,b"] },
      status: 400,
    },
    {
      name: "Host vacío en HTTP/1.0 y destino",
      options: { httpVersion: "1.0", url: "/otra", rawHeaders: ["Host", ""] },
      status: 400,
    },
    {
      name: "destino, método y cuerpo",
      options: { url: "/otra", method: "POST", rawHeaders: [...HOST, ...BODY] },
      status: 404,
    },
    {
      name: "versión y destino",
      options: { httpVersion: "0.9", url: "/otra" },
      status: 505,
    },
    {
      name: "versión y método",
      options: { httpVersion: "2.0", method: "DELETE" },
      status: 505,
    },
    {
      name: "versión y cuerpo",
      options: { httpVersion: "2.0", rawHeaders: [...HOST, ...BODY] },
      status: 505,
    },
    {
      name: "Host y método",
      options: { method: "POST", rawHeaders: ["Host", ","] },
      status: 400,
    },
    {
      name: "Host duplicado y cuerpo en HTTP/1.0",
      options: {
        httpVersion: "1.0",
        rawHeaders: [...HOST, ...HOST, "Transfer-Encoding", "chunked"],
      },
      status: 400,
    },
    {
      name: "destino y cuerpo",
      options: {
        url: "/api/health/",
        rawHeaders: [...HOST, "Transfer-Encoding", "chunked"],
      },
      status: 404,
    },
    {
      name: "método y Transfer-Encoding",
      options: {
        method: "PUT",
        rawHeaders: [...HOST, "Transfer-Encoding", "chunked"],
      },
      status: 405,
    },
    {
      name: "HTTP/1.0 sin Host con destino no exacto",
      options: { httpVersion: "1.0", url: "/otra", rawHeaders: [] },
      status: 404,
    },
    {
      name: "HTTP/1.0 sin Host con método no admitido",
      options: { httpVersion: "1.0", method: "POST", rawHeaders: [] },
      status: 405,
    },
  ];

  test.each(CASES)("$name: responde $status", async ({ options, status }) => {
    expectRejected(await run(options), status);
  });
});

describe("lista cerrada de cabeceras inspeccionadas", () => {
  test.each([
    [
      "X-HTTP-Method-Override no cambia el método",
      "POST",
      [...HOST, "X-HTTP-Method-Override", "GET"],
      405,
    ],
    [
      "X-Forwarded-Host no sustituye a Host",
      "GET",
      ["X-Forwarded-Host", HOST_VALUE],
      400,
    ],
    [
      "Forwarded no sustituye a Host",
      "GET",
      ["Forwarded", `host=${HOST_VALUE}`],
      400,
    ],
    [":authority no sustituye a Host", "GET", [":authority", HOST_VALUE], 400],
  ] as const)("%s", async (_label, method, rawHeaders, status) => {
    expectRejected(await run({ method, rawHeaders }), status);
  });

  test.each([
    ["X-Transfer-Encoding", ["X-Transfer-Encoding", "chunked"]],
    ["X-Content-Length", ["X-Content-Length", "5"]],
    ["Content-Type", ["Content-Type", "application/json"]],
    ["Content-Encoding", ["Content-Encoding", "gzip"]],
    ["Trailer", ["Trailer", "Content-Length"]],
    ["Accept-Encoding", ["Accept-Encoding", "gzip"]],
    ["X-Forwarded-Host distinto", ["X-Forwarded-Host", "otro.invalid"]],
  ] as const)(
    "%s no interviene: la petición se delega",
    async (_label, extra) => {
      expectDelegated(await run({ rawHeaders: [...HOST, ...extra] }));
    },
  );
});
