// Estado de conexión de la frontera HTTP: los seis métodos del objeto que
// devuelve `createHttpBoundary(handle)` (T040; FR-006 C4 y FR-009; plan.md,
// «Frontera HTTP»; data-model.md, «Estado de conexión»;
// contracts/health.openapi.yaml, `connectionState`). Como las demás pruebas
// escritas antes de la implementación, falla hasta que exista el módulo.
//
// Alcance: rechazo terminal por socket, contador de respuestas pendientes,
// `clientError` inmediato, diferido, *flush*, *dropped*, supresión y
// `ECONNRESET`, `checkContinue` y `checkExpectation` por la misma frontera, y
// `CONNECT` y `Upgrade` cerrados. La decisión de cada petición es de T024; la
// matriz de versión, `Host`, cuerpo y framing, de T028; la canalización real
// por TCP, de T029; la equivalencia entre modos, de T030; la auditoría de
// registros, de T031; el cableado con `http.createServer`, de T041.
//
// Reglas fijadas para esta prueba:
// - una respuesta en bruto sobre el socket es el rechazo cerrado del contrato
//   (estado, cuerpo vacío y cabeceras cerradas, con `Date` opcional), y la
//   conexión se cierra después de escribirla, de forma ordenada o con un
//   reinicio (research.md, K19);
// - el 400, el 404, el 405 y el 500 marcan el socket como rechazado; después,
//   las peticiones del socket no se delegan, no se responden y no se destruyen,
//   y un `clientError` se suprime sin escribir ni destruir;
// - `ECONNRESET` nunca escribe: descarta el diferido y destruye el socket una
//   vez, también después de un rechazo;
// - el rechazo en bruto de `CONNECT` y `Upgrade` sigue las mismas reglas que
//   el de `clientError`: se difiere mientras haya respuestas pendientes y se
//   suprime tras un rechazo.
//
// Los dobles son deterministas y no abren sockets reales. Los datos sintéticos
// nunca se imprimen: las fugas se informan con etiquetas.
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Contrato esperado (plan.md, «Interfaz de la frontera»).
type Handle = (req: unknown, res: unknown) => Promise<void>;

interface Boundary {
  request(req: unknown, res: unknown): Promise<void>;
  checkContinue(req: unknown, res: unknown): Promise<void>;
  checkExpectation(req: unknown, res: unknown): Promise<void>;
  connect(req: unknown, socket: unknown, head: unknown): unknown;
  upgrade(req: unknown, socket: unknown, head: unknown): unknown;
  clientError(error: unknown, socket: unknown): unknown;
}

const METHODS = [
  "request",
  "checkContinue",
  "checkExpectation",
  "connect",
  "upgrade",
  "clientError",
] as const;

// La ausencia del módulo hace fallar la prueba aquí.
await import("@/platform/http-boundary");

// El espacio de nombres pasa por `unknown` antes de tiparse con el contrato: la
// conversión es necesaria tanto con el módulo ausente como con el real.
async function loadNamespace(): Promise<Record<string, unknown>> {
  const namespace: unknown = await import("@/platform/http-boundary");
  return namespace as Record<string, unknown>;
}

async function boundaryFor(handle: Handle): Promise<Boundary> {
  const create = (await loadNamespace()).createHttpBoundary;
  if (typeof create !== "function") {
    expect.fail("el módulo no exporta createHttpBoundary");
  }
  const boundary: unknown = Reflect.apply(create, undefined, [handle]);
  const methods = new Map<string, (...args: unknown[]) => unknown>();
  for (const name of METHODS) {
    const method: unknown = Reflect.get(Object(boundary), name);
    if (typeof method !== "function") {
      expect.fail(`la frontera no tiene el método ${name}`);
    }
    methods.set(name, (...args) => Reflect.apply(method, boundary, args));
  }
  const call =
    (name: string) =>
    (...args: unknown[]): unknown =>
      methods.get(name)?.(...args);
  const listener =
    (name: string) =>
    (req: unknown, res: unknown): Promise<void> =>
      call(name)(req, res) as Promise<void>;
  return {
    request: listener("request"),
    checkContinue: listener("checkContinue"),
    checkExpectation: listener("checkExpectation"),
    connect: call("connect"),
    upgrade: call("upgrade"),
    clientError: call("clientError"),
  };
}

const ALLOW = "GET, HEAD, OPTIONS";
const HOST = ["Host", "127.0.0.1:3000"];
const CLOSED = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

// Datos sintéticos únicos en cada ejecución. Nunca se imprimen.
const RUN = randomUUID();
const SENTINEL = `centinela-${RUN}`;
const SYNTHETIC_MESSAGE = `mensaje-sintetico-${RUN}`;

const SECRETS: Readonly<Record<string, string>> = {
  "valor centinela": SENTINEL,
  "mensaje del error": SYNTHETIC_MESSAGE,
};

function leaks(text: string): string[] {
  return Object.entries(SECRETS)
    .filter(([, secret]) => text.includes(secret))
    .map(([label]) => label);
}

// Error de análisis como el que entrega Node.js, con el paquete recibido.
function parseError(code: string): Error {
  const error = new Error(`${SYNTHETIC_MESSAGE} ${SENTINEL}`);
  return Object.assign(error, {
    code,
    rawPacket: Buffer.from(`GET /${SENTINEL} HTTP/1.1\r\n`, "latin1"),
  });
}

// Orden global de lo observable: fin de respuestas y operaciones de socket.
let timeline: string[] = [];
let sockets: SocketDouble[] = [];
let responses: ResponseDouble[] = [];
let requests: RequestDouble[] = [];

function callback(args: readonly unknown[]): (() => void) | undefined {
  const last = args.at(-1);
  if (typeof last !== "function") {
    return undefined;
  }
  return () => {
    Reflect.apply(last, undefined, []);
  };
}

function toBuffer(chunk: unknown, encoding: unknown): Buffer | undefined {
  if (typeof chunk === "string") {
    return Buffer.from(
      chunk,
      typeof encoding === "string" ? (encoding as BufferEncoding) : "utf8",
    );
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  return undefined;
}

// Doble de socket con la semántica de `net.Socket` que usa la frontera: tras
// `end` o `destroy` deja de ser escribible y emite `close`; cuando se cierra,
// las respuestas pendientes asociadas emiten `close` sin `finish`, como en
// Node.js. Registra las operaciones y los bytes aceptados.
class SocketDouble extends EventEmitter {
  writable = true;
  writableEnded = false;
  destroyed = false;
  destroys = 0;
  lateWrites = 0;
  readonly remoteAddress = SENTINEL;
  readonly ops: string[] = [];
  readonly attached: ResponseDouble[] = [];
  readonly #chunks: Buffer[] = [];
  readonly name: string;

  constructor(name: string) {
    super();
    this.name = name;
  }

  #log(op: string): void {
    this.ops.push(op);
    timeline.push(`${this.name}:${op}`);
  }

  #accept(chunk: Buffer | undefined): void {
    if (chunk === undefined || chunk.length === 0) {
      return;
    }
    this.#log("datos");
    if (this.writable) {
      this.#chunks.push(chunk);
    } else {
      this.lateWrites += 1;
    }
  }

  // Como Node.js: `destroyed` cambia al instante; `close` llega después y,
  // tras él, las respuestas asociadas sin terminar emiten su propio `close`.
  #destroyNow(): void {
    if (this.destroyed) {
      return;
    }
    this.writable = false;
    this.destroyed = true;
    process.nextTick(() => {
      this.emit("close", false);
      for (const response of this.attached) {
        response.abort();
      }
    });
  }

  write(chunk: unknown, ...rest: unknown[]): boolean {
    this.#log("write");
    this.#accept(toBuffer(chunk, rest[0]));
    const done = callback(rest);
    if (done !== undefined) {
      process.nextTick(done);
    }
    return this.writable;
  }

  end(...args: unknown[]): this {
    const [chunk, encoding] = args;
    if (typeof chunk !== "function") {
      this.#accept(toBuffer(chunk, encoding));
    }
    this.#log("end");
    const done = callback(args);
    if (!this.writableEnded && !this.destroyed) {
      this.writableEnded = true;
      this.writable = false;
      process.nextTick(() => {
        this.emit("finish");
        this.#destroyNow();
      });
    }
    if (done !== undefined) {
      process.nextTick(done);
    }
    return this;
  }

  destroy(): this {
    this.#log("destroy");
    this.destroys += 1;
    this.#destroyNow();
    return this;
  }

  // El cliente cierra la conexión: no es una operación de la frontera.
  closeByPeer(): void {
    timeline.push(`${this.name}:cerrado por el cliente`);
    this.#destroyNow();
  }

  accepted(): Buffer {
    return Buffer.concat(this.#chunks);
  }

  dataOps(): number {
    return this.ops.filter((op) => op === "datos").length;
  }
}

// Doble de petición. Solo se admiten las lecturas de la lista y `socket`.
const READABLE = new Set([
  "httpVersion",
  "method",
  "url",
  "rawHeaders",
  "socket",
]);

interface RequestDouble {
  readonly proxy: object;
  readonly reads: string[];
}

interface RequestOptions {
  readonly method?: string;
  readonly url?: string;
  readonly rawHeaders?: readonly string[];
}

function requestDouble(
  socket: SocketDouble,
  options: RequestOptions = {},
): RequestDouble {
  const reads: string[] = [];
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
  const target = {
    method: options.method ?? "GET",
    url: options.url ?? "/api/health",
    httpVersion: "1.1",
    httpVersionMajor: 1,
    httpVersionMinor: 1,
    rawHeaders,
    headers,
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
  });
  const request = { proxy, reads };
  requests.push(request);
  return request;
}

// Doble de respuesta con las guardas de `ServerResponse`: tras enviar las
// cabeceras no se pueden cambiar cabeceras ni estado. Emite `finish` y `close`
// al terminar, y solo `close` si se destruye o se cierra su socket antes.
class ResponseDouble extends EventEmitter {
  statusCode = 200;
  statusMessage = "";
  headersSent = false;
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  destroys = 0;
  committedStatus: number | undefined;
  readonly calls: string[] = [];
  readonly #chunks: Buffer[] = [];
  readonly #headers = new Map<string, string>();

  readonly name: string;
  readonly socket: SocketDouble;

  constructor(name: string, socket: SocketDouble) {
    super();
    this.name = name;
    this.socket = socket;
    socket.attached.push(this);
  }

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
    }
  }

  #store(name: string, value: unknown): void {
    this.#headers.set(
      name.toLowerCase(),
      Array.isArray(value) ? value.map(String).join(", ") : String(value),
    );
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

  writeProcessing(): void {
    this.calls.push("writeProcessing");
  }

  writeEarlyHints(): void {
    this.calls.push("writeEarlyHints");
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
    const buffer = toBuffer(chunk, undefined);
    if (buffer !== undefined) {
      this.#chunks.push(buffer);
    }
    return true;
  }

  end(chunk?: unknown): this {
    this.calls.push("end");
    if (this.writableEnded) {
      return this;
    }
    this.#commit();
    const buffer = toBuffer(chunk, undefined);
    if (buffer !== undefined) {
      this.#chunks.push(buffer);
    }
    this.writableEnded = true;
    process.nextTick(() => {
      if (this.destroyed) {
        return;
      }
      this.writableFinished = true;
      timeline.push(`${this.name}:finish`);
      this.emit("finish");
      this.emit("close");
    });
    return this;
  }

  destroy(): this {
    this.calls.push("destroy");
    this.destroys += 1;
    this.abort();
    return this;
  }

  // Cierre sin terminar: por destrucción o porque se cerró el socket.
  abort(): void {
    if (this.destroyed || this.writableFinished) {
      return;
    }
    this.destroyed = true;
    process.nextTick(() => {
      timeline.push(`${this.name}:close`);
      this.emit("close");
    });
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
}

function exchange(socket: SocketDouble, options?: RequestOptions): Exchange {
  const request = requestDouble(socket, options);
  const response = new ResponseDouble(
    `${socket.name}.respuesta${String(socket.attached.length + 1)}`,
    socket,
  );
  responses.push(response);
  return { request, response };
}

function connection(): SocketDouble {
  const socket = new SocketDouble(`socket${String(sockets.length + 1)}`);
  sockets.push(socket);
  return socket;
}

// `handle` controlado: cada delegación queda pendiente hasta que la prueba la
// termina con una respuesta 200 completa.
interface ControlledHandle {
  readonly handle: ReturnType<typeof vi.fn<Handle>>;
  readonly complete: (response: ResponseDouble) => void;
}

// Respuesta 200 completa, como la que escribiría la API Route.
function writeOk(response: ResponseDouble): void {
  const body = '{"status":"ok","version":"0.0.0"}';
  response.writeHead(200, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Content-Length": String(body.length),
  });
  response.end(body);
}

function controlledHandle(): ControlledHandle {
  const pending = new Map<unknown, () => void>();
  const handle = vi.fn<Handle>(
    (_req, res) =>
      new Promise<void>((resolve) => {
        pending.set(res, resolve);
      }),
  );
  return {
    handle,
    complete: (response) => {
      const resolve = pending.get(response);
      if (resolve === undefined) {
        expect.fail(`${response.name} no se delegó`);
      }
      writeOk(response);
      resolve();
    },
  };
}

// `handle` controlado que además puede hacer fallar una delegación pendiente
// antes de enviar cabeceras, para provocar el 500 de la frontera.
interface FailableHandle extends ControlledHandle {
  readonly fail: (response: ResponseDouble) => void;
}

function failableHandle(): FailableHandle {
  const pending = new Map<
    unknown,
    { readonly resolve: () => void; readonly reject: (error: Error) => void }
  >();
  const handle = vi.fn<Handle>(
    (_req, res) =>
      new Promise<void>((resolve, reject) => {
        pending.set(res, { resolve, reject });
      }),
  );
  const delegated = (response: ResponseDouble) => {
    const entry = pending.get(response);
    if (entry === undefined) {
      expect.fail(`${response.name} no se delegó`);
    }
    return entry;
  };
  return {
    handle,
    complete: (response) => {
      const { resolve } = delegated(response);
      writeOk(response);
      resolve();
    },
    fail: (response) => {
      delegated(response).reject(new Error(`${SYNTHETIC_MESSAGE} ${SENTINEL}`));
    },
  };
}

// Deja avanzar los eventos pendientes del ciclo, sin esperas por tiempo.
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

// Respuesta en bruto escrita sobre el socket.
interface RawResponse {
  readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly bodyLength: number;
}

function parseRaw(bytes: Buffer): RawResponse | undefined {
  const text = bytes.toString("latin1");
  const end = text.indexOf("\r\n\r\n");
  if (end === -1) {
    return undefined;
  }
  const [statusLine = "", ...lines] = text.slice(0, end).split("\r\n");
  const match = /^HTTP\/1\.[01] (\d{3})(?: [^\r\n]*)?$/.exec(statusLine);
  if (match === null) {
    return undefined;
  }
  return {
    status: Number(match[1]),
    headers: lines.map((line) => {
      const colon = line.indexOf(":");
      return [
        line.slice(0, colon).trim().toLowerCase(),
        line.slice(colon + 1).trim(),
      ] as const;
    }),
    bodyLength: bytes.length - (end + 4),
  };
}

// Rechazo cerrado en bruto: una única respuesta completa con el estado, sin
// cuerpo, con las cabeceras cerradas (`Date` opcional y `Allow` solo en 405),
// y la conexión cerrada después, sin escrituras tardías.
function expectRawRejection(
  socket: SocketDouble,
  status: 400 | 404 | 405,
): void {
  const raw = parseRaw(socket.accepted());
  if (raw === undefined) {
    expect.fail(`${socket.name} sin una respuesta HTTP completa`);
  }
  expect(raw.status, "estado").toBe(status);
  const names = raw.headers.map(([name]) => name);
  expect(new Set(names).size, "sin cabeceras repetidas").toBe(names.length);
  expect(
    Object.fromEntries(raw.headers.filter(([name]) => name !== "date")),
  ).toStrictEqual(status === 405 ? { ...CLOSED, allow: ALLOW } : CLOSED);
  expect(raw.bodyLength, "sin cuerpo ni una segunda respuesta").toBe(0);
  const lastData = socket.ops.lastIndexOf("datos");
  const closedAt = Math.max(
    socket.ops.lastIndexOf("end"),
    socket.ops.lastIndexOf("destroy"),
  );
  expect(closedAt, "conexión cerrada después de la respuesta").toBeGreaterThan(
    lastData,
  );
  expect(socket.lateWrites, "sin escrituras tras el cierre").toBe(0);
}

// Rechazo cerrado escrito con la API de la respuesta (T024 fija su detalle).
function expectResponseRejection(
  response: ResponseDouble,
  status: 400 | 404 | 405 | 500,
): void {
  expect(response.committedStatus, "estado").toBe(status);
  expect(response.getHeaders()).toStrictEqual(
    status === 405 ? { ...CLOSED, allow: ALLOW } : CLOSED,
  );
  expect(response.body(), "cuerpo vacío").toBe("");
  expect(response.writableEnded, "respuesta terminada").toBe(true);
}

// Sin ninguna operación: ni escritura, ni cierre, ni destrucción.
function expectUntouched(socket: SocketDouble): void {
  expect(socket.ops, `${socket.name} sin operaciones`).toEqual([]);
}

function expectSilent(response: ResponseDouble): void {
  expect(response.calls, `${response.name} sin operaciones`).toEqual([]);
  expect(response.headersSent).toBe(false);
}

function expectNoWrite(socket: SocketDouble): void {
  expect(socket.dataOps(), `${socket.name} sin bytes escritos`).toBe(0);
  expect(socket.lateWrites).toBe(0);
}

function expectAccepted(response: ResponseDouble): void {
  expect(response.committedStatus, `${response.name} con 200`).toBe(200);
  expect(response.destroys, `${response.name} sin destruir`).toBe(0);
  expect(response.calls).not.toContain("writeContinue");
}

function position(entry: string): number {
  const index = timeline.indexOf(entry);
  expect(index, `falta ${entry}`).toBeGreaterThanOrEqual(0);
  return index;
}

// Salida estándar, de error y `console` durante cada prueba.
let output: string[] = [];

beforeEach(() => {
  vi.resetModules();
  timeline = [];
  sockets = [];
  responses = [];
  requests = [];
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
  for (const socket of sockets) {
    expect(
      leaks(socket.accepted().toString("latin1")),
      `${socket.name} sin datos sensibles`,
    ).toEqual([]);
  }
  for (const response of responses) {
    expect(
      leaks(response.serialized()),
      `${response.name} sin datos sensibles`,
    ).toEqual([]);
  }
  for (const request of requests) {
    expect(request.reads, "sin datos de la petición").toEqual([]);
  }
});

describe("interfaz", () => {
  test("la frontera tiene los seis métodos; connect, upgrade y clientError no devuelven nada", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const namespace = await loadNamespace();
    expect(Object.keys(namespace)).toEqual(["createHttpBoundary"]);

    const first = connection();
    const connectResult = boundary.connect(
      requestDouble(first, { method: "CONNECT", url: "destino.invalid:443" })
        .proxy,
      first,
      Buffer.from(SENTINEL),
    );
    const second = connection();
    const upgradeResult = boundary.upgrade(
      requestDouble(second, {
        url: "/otra",
        rawHeaders: [...HOST, "Connection", "Upgrade", "Upgrade", "websocket"],
      }).proxy,
      second,
      Buffer.from(SENTINEL),
    );
    const third = connection();
    const errorResult = boundary.clientError(
      parseError("HPE_INVALID_METHOD"),
      third,
    );
    await settle();
    expect([connectResult, upgradeResult, errorResult]).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("clientError sin respuestas pendientes", () => {
  test.each([
    "HPE_INVALID_METHOD",
    "HPE_HEADER_OVERFLOW",
    "HPE_INVALID_CONSTANT",
  ])("%s produce el 400 cerrado inmediato", async (code) => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    boundary.clientError(parseError(code), socket);
    await settle();
    expectRawRejection(socket, 400);
    expect(handle).not.toHaveBeenCalled();
  });

  test("si el socket ya no es escribible, se descarta sin escribir (dropped)", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    socket.closeByPeer();
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectNoWrite(socket);
  });

  test("un 400 inmediato marca el socket: un segundo clientError se suprime", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    const ops = [...socket.ops];
    boundary.clientError(parseError("HPE_INVALID_CONSTANT"), socket);
    await settle();
    expect(socket.ops, "ninguna operación más").toEqual(ops);
    expectRawRejection(socket, 400);
  });
});

describe("respuestas pendientes y error diferido", () => {
  test("con una respuesta pendiente se difiere y se emite al terminar (flush)", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    expect(handle).toHaveBeenCalledTimes(1);

    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectUntouched(socket);

    complete(first.response);
    await settled;
    await settle();
    expectAccepted(first.response);
    expectRawRejection(socket, 400);
    expect(position("socket1.respuesta1:finish")).toBeLessThan(
      position("socket1:datos"),
    );
  });

  test("con dos pendientes, el 400 espera a la última y se emite una sola vez", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const second = exchange(socket);
    const settledFirst = boundary.request(first.request.proxy, first.response);
    const settledSecond = boundary.request(
      second.request.proxy,
      second.response,
    );
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();

    complete(first.response);
    await settledFirst;
    await settle();
    expectUntouched(socket);

    complete(second.response);
    await settledSecond;
    await settle();
    expectAccepted(first.response);
    expectAccepted(second.response);
    expectRawRejection(socket, 400);
    expect(position("socket1.respuesta2:finish")).toBeLessThan(
      position("socket1:datos"),
    );
  });

  test("cada respuesta descuenta una sola vez: tras terminar una de dos, el error se difiere", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const second = exchange(socket);
    const settledFirst = boundary.request(first.request.proxy, first.response);
    const settledSecond = boundary.request(
      second.request.proxy,
      second.response,
    );
    await settle();
    complete(first.response);
    await settledFirst;
    await settle();

    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectUntouched(socket);

    complete(second.response);
    await settledSecond;
    await settle();
    expectRawRejection(socket, 400);
  });

  test("un clientError duplicado mientras hay un diferido no produce un segundo 400", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    boundary.clientError(parseError("HPE_INVALID_CONSTANT"), socket);
    await settle();
    expectUntouched(socket);

    complete(first.response);
    await settled;
    await settle();
    expectRawRejection(socket, 400);
  });

  test("tras el flush, ni los eventos tardíos ni otro clientError escriben ni destruyen", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    complete(first.response);
    await settled;
    await settle();
    expectRawRejection(socket, 400);
    const ops = [...socket.ops];

    first.response.emit("close");
    first.response.emit("finish");
    boundary.clientError(parseError("HPE_INVALID_CONSTANT"), socket);
    await settle();
    expect(socket.ops, "ninguna operación más").toEqual(ops);
  });

  test("una respuesta que termina sin error pendiente no toca el socket", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    complete(first.response);
    await settled;
    await settle();
    expectAccepted(first.response);
    expectUntouched(socket);
  });
});

describe("dropped", () => {
  test("si el socket se cierra antes de terminar la pendiente, el diferido se descarta sin escribir", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();

    socket.closeByPeer();
    await settle();
    expect(first.response.destroyed, "la pendiente se cerró").toBe(true);
    expectNoWrite(socket);
    expect(handle).toHaveBeenCalledTimes(1);
    void settled;
  });
});

describe("ECONNRESET", () => {
  test("con un diferido: lo descarta, destruye el socket y nunca escribe", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    boundary.clientError(parseError("ECONNRESET"), socket);
    await settle();
    expectNoWrite(socket);
    expect(socket.destroys, "una sola destrucción").toBe(1);
    void settled;
  });

  test("con pendientes y sin diferido: destruye el socket sin escribir, tampoco al cerrarse la pendiente", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    boundary.clientError(parseError("ECONNRESET"), socket);
    await settle();
    expect(first.response.destroyed, "la pendiente se cerró").toBe(true);
    expectNoWrite(socket);
    expect(socket.destroys, "una sola destrucción").toBe(1);
    void settled;
  });

  test("sin pendientes: destruye el socket sin escribir", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    boundary.clientError(parseError("ECONNRESET"), socket);
    await settle();
    expectNoWrite(socket);
    expect(socket.destroys, "una sola destrucción").toBe(1);
  });

  test("después de un rechazo: destruye el socket sin escribir", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, { url: "/otra" });
    await boundary.request(rejected.request.proxy, rejected.response);
    await settle();
    expectResponseRejection(rejected.response, 404);
    boundary.clientError(parseError("ECONNRESET"), socket);
    await settle();
    expectNoWrite(socket);
    expect(socket.destroys, "una sola destrucción").toBe(1);
  });
});

describe("rechazo terminal por socket", () => {
  test("tras un 404, otra petición del socket no se delega, no se responde y no se destruye", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, { url: "/otra" });
    await boundary.request(rejected.request.proxy, rejected.response);
    const later = exchange(socket);
    await boundary.request(later.request.proxy, later.response);
    await settle();
    expectResponseRejection(rejected.response, 404);
    expect(handle).not.toHaveBeenCalled();
    expectSilent(later.response);
    expect(rejected.response.destroys).toBe(0);
    expectUntouched(socket);
  });

  test("tras un 405, un clientError se suprime sin escribir ni destruir", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, { method: "POST" });
    await boundary.request(rejected.request.proxy, rejected.response);
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectResponseRejection(rejected.response, 405);
    expectUntouched(socket);
  });

  test("un rechazo con una pendiente anterior suprime el clientError: no hay flush al terminar", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const settled = boundary.request(first.request.proxy, first.response);
    await settle();
    const rejected = exchange(socket, { url: "/otra" });
    await boundary.request(rejected.request.proxy, rejected.response);
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();

    complete(first.response);
    await settled;
    await settle();
    expectAccepted(first.response);
    expectResponseRejection(rejected.response, 404);
    expect(handle).toHaveBeenCalledTimes(1);
    expectUntouched(socket);
  });

  test("tras un 500 por fallo de handle, otra petición no se delega y un clientError se suprime", async () => {
    const handle = vi.fn<Handle>(() =>
      Promise.reject(new Error(`${SYNTHETIC_MESSAGE} ${SENTINEL}`)),
    );
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const failed = exchange(socket);
    await boundary.request(failed.request.proxy, failed.response);
    await settle();
    expectResponseRejection(failed.response, 500);

    const later = exchange(socket);
    await boundary.request(later.request.proxy, later.response);
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expect(handle).toHaveBeenCalledTimes(1);
    expectSilent(later.response);
    expectUntouched(socket);
  });

  test("un 500 por fallo de handle suprime el diferido: no hay flush al terminar la última pendiente", async () => {
    const { handle, complete, fail } = failableHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const first = exchange(socket);
    const second = exchange(socket);
    const settledFirst = boundary.request(first.request.proxy, first.response);
    const settledSecond = boundary.request(
      second.request.proxy,
      second.response,
    );
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectUntouched(socket);

    fail(second.response);
    await settledSecond;
    await settle();
    expectResponseRejection(second.response, 500);

    complete(first.response);
    await settledFirst;
    await settle();
    expect(handle).toHaveBeenCalledTimes(2);
    expectAccepted(first.response);
    expect(second.response.destroys, "sin destruir la respuesta").toBe(0);
    expectUntouched(socket);
  });

  test("tras un rechazo de checkExpectation, una petición posterior queda en silencio", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, {
      method: "PUT",
      rawHeaders: [...HOST, "Expect", "x-sintetico"],
    });
    await boundary.checkExpectation(rejected.request.proxy, rejected.response);
    const later = exchange(socket);
    await boundary.request(later.request.proxy, later.response);
    await settle();
    expectResponseRejection(rejected.response, 405);
    expect(handle).not.toHaveBeenCalled();
    expectSilent(later.response);
    expectUntouched(socket);
  });
});

describe("checkContinue y checkExpectation", () => {
  const CONTINUE = [...HOST, "Expect", "100-continue"];
  const OTHER = [...HOST, "Expect", "x-sintetico"];

  test("checkContinue admitido se delega una vez, sin 100 Continue", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const admitted = exchange(socket, { rawHeaders: CONTINUE });
    const settled = boundary.checkContinue(
      admitted.request.proxy,
      admitted.response,
    );
    await settle();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle).toHaveBeenCalledWith(
      admitted.request.proxy,
      admitted.response,
    );
    complete(admitted.response);
    await settled;
    await settle();
    expectAccepted(admitted.response);
    expectUntouched(socket);
  });

  test("checkContinue con cuerpo recibe 400 cerrado, sin 100 Continue ni delegación", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, {
      rawHeaders: [...CONTINUE, "Content-Length", "5"],
    });
    await boundary.checkContinue(rejected.request.proxy, rejected.response);
    await settle();
    expectResponseRejection(rejected.response, 400);
    expect(rejected.response.calls).not.toContain("writeContinue");
    expect(handle).not.toHaveBeenCalled();
    expectUntouched(socket);
  });

  test("checkContinue con un método no admitido recibe 405 cerrado, sin 100 Continue", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, {
      method: "POST",
      rawHeaders: CONTINUE,
    });
    await boundary.checkContinue(rejected.request.proxy, rejected.response);
    await settle();
    expectResponseRejection(rejected.response, 405);
    expect(rejected.response.calls).not.toContain("writeContinue");
    expect(handle).not.toHaveBeenCalled();
  });

  test("checkExpectation admitido se delega una vez, sin 417", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const admitted = exchange(socket, { rawHeaders: OTHER });
    const settled = boundary.checkExpectation(
      admitted.request.proxy,
      admitted.response,
    );
    await settle();
    expect(handle).toHaveBeenCalledTimes(1);
    expect(admitted.response.headersSent, "sin respuesta propia").toBe(false);
    complete(admitted.response);
    await settled;
    await settle();
    expectAccepted(admitted.response);
    expectUntouched(socket);
  });

  test("checkExpectation con un método no admitido recibe 405 cerrado, no 417", async () => {
    const { handle } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const rejected = exchange(socket, { method: "DELETE", rawHeaders: OTHER });
    await boundary.checkExpectation(rejected.request.proxy, rejected.response);
    await settle();
    expectResponseRejection(rejected.response, 405);
    expect(handle).not.toHaveBeenCalled();
  });

  test("una petición de checkContinue pendiente difiere el clientError hasta terminar", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const admitted = exchange(socket, { rawHeaders: CONTINUE });
    const settled = boundary.checkContinue(
      admitted.request.proxy,
      admitted.response,
    );
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectUntouched(socket);
    complete(admitted.response);
    await settled;
    await settle();
    expectRawRejection(socket, 400);
  });

  test("una petición de checkExpectation pendiente difiere el clientError hasta terminar", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const socket = connection();
    const admitted = exchange(socket, { rawHeaders: OTHER });
    const settled = boundary.checkExpectation(
      admitted.request.proxy,
      admitted.response,
    );
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), socket);
    await settle();
    expectUntouched(socket);
    complete(admitted.response);
    await settled;
    await settle();
    expectRawRejection(socket, 400);
  });
});

describe("CONNECT y Upgrade", () => {
  const UPGRADE = [...HOST, "Connection", "Upgrade", "Upgrade", "websocket"];

  test.each([
    [
      "CONNECT a otro destino",
      "connect",
      "CONNECT",
      "destino.invalid:443",
      404,
    ],
    ["CONNECT a /api/health", "connect", "CONNECT", "/api/health", 405],
    ["Upgrade a otro destino", "upgrade", "GET", "/_next/webpack-hmr", 404],
    ["Upgrade a /api/health", "upgrade", "GET", "/api/health", 405],
  ] as const)(
    "%s recibe el rechazo cerrado en bruto sin llamar a handle",
    async (_label, method, verb, url, status) => {
      const { handle } = controlledHandle();
      const boundary = await boundaryFor(handle);
      const socket = connection();
      const request = requestDouble(socket, {
        method: verb,
        url,
        rawHeaders: method === "upgrade" ? UPGRADE : HOST,
      });
      boundary[method](
        request.proxy,
        socket,
        Buffer.from(`${SENTINEL}\r\n`, "latin1"),
      );
      await settle();
      expectRawRejection(socket, status);
      expect(handle).not.toHaveBeenCalled();
    },
  );

  // Un túnel es otro rechazo en bruto del mismo socket: respeta el orden de
  // las respuestas pendientes y el rechazo terminal.
  test.each([
    ["CONNECT", "connect", "CONNECT", "destino.invalid:443", 404],
    ["Upgrade", "upgrade", "GET", "/api/health", 405],
  ] as const)(
    "%s con una respuesta pendiente se difiere y se emite una vez al terminar",
    async (_label, method, verb, url, status) => {
      const { handle, complete } = controlledHandle();
      const boundary = await boundaryFor(handle);
      const socket = connection();
      const first = exchange(socket);
      const settled = boundary.request(first.request.proxy, first.response);
      await settle();
      const result = boundary[method](
        requestDouble(socket, {
          method: verb,
          url,
          rawHeaders: method === "upgrade" ? UPGRADE : HOST,
        }).proxy,
        socket,
        Buffer.from(`${SENTINEL}\r\n`, "latin1"),
      );
      await settle();
      expect(result).toBeUndefined();
      expectUntouched(socket);

      complete(first.response);
      await settled;
      await settle();
      expect(handle).toHaveBeenCalledTimes(1);
      expectAccepted(first.response);
      expectRawRejection(socket, status);
      expect(position("socket1.respuesta1:finish")).toBeLessThan(
        position("socket1:datos"),
      );
    },
  );

  test.each([
    ["CONNECT tras un 404", "connect", "CONNECT", { url: "/otra" }],
    ["Upgrade tras un 500", "upgrade", "GET", undefined],
  ] as const)(
    "%s: se suprime sin delegar, escribir, cerrar ni destruir",
    async (_label, method, verb, rejectedOptions) => {
      const { handle, fail } = failableHandle();
      const boundary = await boundaryFor(handle);
      const socket = connection();
      const rejected = exchange(socket, rejectedOptions);
      const settled = boundary.request(
        rejected.request.proxy,
        rejected.response,
      );
      await settle();
      if (rejectedOptions === undefined) {
        fail(rejected.response);
      }
      await settled;
      await settle();
      expectResponseRejection(
        rejected.response,
        rejectedOptions === undefined ? 500 : 404,
      );
      const delegations = handle.mock.calls.length;

      const result = boundary[method](
        requestDouble(socket, {
          method: verb,
          url: "/api/health",
          rawHeaders: method === "upgrade" ? UPGRADE : HOST,
        }).proxy,
        socket,
        Buffer.from(`${SENTINEL}\r\n`, "latin1"),
      );
      await settle();
      expect(result).toBeUndefined();
      expect(handle).toHaveBeenCalledTimes(delegations);
      expect(rejected.response.destroys).toBe(0);
      expectUntouched(socket);
    },
  );
});

describe("independencia entre sockets", () => {
  test("un rechazo en un socket no afecta a otro", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const first = connection();
    const second = connection();
    const rejected = exchange(first, { url: "/otra" });
    await boundary.request(rejected.request.proxy, rejected.response);
    const admitted = exchange(second);
    const settled = boundary.request(admitted.request.proxy, admitted.response);
    await settle();
    expect(handle).toHaveBeenCalledTimes(1);
    complete(admitted.response);
    await settled;
    await settle();
    expectAccepted(admitted.response);
    expectUntouched(second);
  });

  test("las pendientes de un socket no difieren el clientError de otro", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const first = connection();
    const second = connection();
    const pending = exchange(first);
    const settled = boundary.request(pending.request.proxy, pending.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), second);
    await settle();
    expectRawRejection(second, 400);
    expectUntouched(first);

    complete(pending.response);
    await settled;
    await settle();
    expectAccepted(pending.response);
    expectUntouched(first);
  });

  test("dos diferidos se emiten cada uno al terminar su propia pendiente", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const first = connection();
    const second = connection();
    const one = exchange(first);
    const two = exchange(second);
    const settledOne = boundary.request(one.request.proxy, one.response);
    const settledTwo = boundary.request(two.request.proxy, two.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), first);
    boundary.clientError(parseError("HPE_INVALID_METHOD"), second);
    await settle();

    complete(one.response);
    await settledOne;
    await settle();
    expectRawRejection(first, 400);
    expectUntouched(second);

    complete(two.response);
    await settledTwo;
    await settle();
    expectRawRejection(second, 400);
  });

  test("un ECONNRESET en un socket no destruye otro ni descarta su diferido", async () => {
    const { handle, complete } = controlledHandle();
    const boundary = await boundaryFor(handle);
    const first = connection();
    const second = connection();
    const one = exchange(first);
    const two = exchange(second);
    const settledOne = boundary.request(one.request.proxy, one.response);
    const settledTwo = boundary.request(two.request.proxy, two.response);
    await settle();
    boundary.clientError(parseError("HPE_INVALID_METHOD"), second);
    boundary.clientError(parseError("ECONNRESET"), first);
    await settle();
    expect(first.destroys).toBe(1);
    expectUntouched(second);

    complete(two.response);
    await settledTwo;
    await settle();
    expectRawRejection(second, 400);
    void settledOne;
  });
});
