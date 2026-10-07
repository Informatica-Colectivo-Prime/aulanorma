// Frontera HTTP (FR-009; research.md, R1; plan.md, «Frontera HTTP»;
// data-model.md, «Estado de conexión»; contracts/health.openapi.yaml,
// `x-aulanorma-transport-boundary` y `x-aulanorma-rejection-contract`; ADR
// 0004 y specs/002-boe-scorm-export/contracts/http-surface.md). Módulo
// portable: `server.mjs` lo carga directamente con Node.js, así que no importa
// nada en ejecución (de `node:http` y `node:stream` solo toma tipos) y usa
// sintaxis TypeScript borrable.
//
// Decide cada petición antes de Next.js con la precedencia versión → `Host` →
// destino → método → cuerpo, y solo delega los destinos crudos exactos de la
// lista cerrada `ROUTES`, cada uno con sus métodos y su tamaño máximo de
// cuerpo. Lee únicamente `httpVersion`, `method`, `url` y `rawHeaders`, sin
// normalizar ni decodificar nada, y el estado imprescindible de la respuesta y
// del socket. No modifica la petición, no consume el cuerpo y no registra
// nada. No comprueba la sesión ni los permisos: eso lo hace cada ruta de
// producto.
//
// El estado de cada conexión es transitorio y vive solo en memoria, asociado
// a su socket: nunca se comparte entre sockets ni sobrevive a la conexión.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

export type Handle = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

// Métodos que `server.mjs` conecta con los eventos del mismo nombre.
export interface HttpBoundary {
  request(req: IncomingMessage, res: ServerResponse): Promise<void>;
  checkContinue(req: IncomingMessage, res: ServerResponse): Promise<void>;
  checkExpectation(req: IncomingMessage, res: ServerResponse): Promise<void>;
  connect(req: IncomingMessage, socket: Duplex): void;
  upgrade(req: IncomingMessage, socket: Duplex): void;
  clientError(error: Error, socket: Duplex): void;
}

type Headers = Readonly<Record<string, string>>;
type Rejection = 400 | 404 | 405 | 505;

// Lista cerrada de rutas que se delegan. `maxBody` es el tamaño máximo del
// cuerpo en bytes; con 0, la petición no puede llevar cuerpo. Cualquier otro
// destino recibe el 404 cerrado.
//
// Un destino es exacto, salvo por dos clases de segmento con forma cerrada:
// `:id`, un identificador opaco de 32 cifras hexadecimales en minúscula, y
// `:n`, un número de página decimal de 1 a 99999, sin ceros iniciales. No hay
// comodines, parámetros de consulta ni barra final.
export interface Route {
  readonly target: string;
  readonly methods: readonly string[];
  readonly maxBody: number;
}

const FORM_BODY = 4096;
// Formularios con el texto de un requisito y su cita.
const TEXT_FORM_BODY = 65_536;
// Subida de un PDF. El límite configurado, que no puede superar este, lo
// aplica la ruta.
const UPLOAD_BODY = 64 * 1024 * 1024;

const page = (target: string): Route => ({
  target,
  methods: ["GET"],
  maxBody: 0,
});
const action = (target: string, maxBody: number): Route => ({
  target,
  methods: ["POST"],
  maxBody,
});

export const ROUTES: readonly Route[] = Object.freeze([
  { target: "/api/health", methods: ["GET", "HEAD", "OPTIONS"], maxBody: 0 },
  page("/"),
  page("/login"),
  page("/account/password"),
  action("/api/session/sign-in", FORM_BODY),
  action("/api/session/sign-out", FORM_BODY),
  action("/api/account/password", FORM_BODY),
  page("/documents"),
  page("/documents/new"),
  page("/documents/:id"),
  page("/documents/:id/file"),
  page("/documents/:id/pages/:n"),
  page("/interpretations/:id"),
  page("/interpretations/:id/unit"),
  page("/interpretations/:id/requirements/new"),
  page("/interpretations/:id/requirements/:id"),
  page("/outlines/:id"),
  page("/outlines/:id/preview"),
  page("/outlines/:id/entries/new"),
  page("/outlines/:id/entries/:id"),
  page("/syllabus/:id"),
  page("/topics/:id"),
  page("/topics/:id/blocks/new"),
  page("/topics/:id/blocks/:id"),
  page("/budget"),
  action("/api/documents/upload", UPLOAD_BODY),
  action("/api/documents/resolve-page", FORM_BODY),
  action("/api/interpretations/request", FORM_BODY),
  action("/api/interpretations/correct", TEXT_FORM_BODY),
  action("/api/interpretations/validate", FORM_BODY),
  action("/api/interpretations/reject", TEXT_FORM_BODY),
  action("/api/interpretations/resubmit", FORM_BODY),
  action("/api/outlines/request", FORM_BODY),
  action("/api/outlines/edit", TEXT_FORM_BODY),
  action("/api/outlines/approve", FORM_BODY),
  action("/api/outlines/reject", TEXT_FORM_BODY),
  action("/api/outlines/resubmit", FORM_BODY),
  action("/api/syllabus/generate", FORM_BODY),
  action("/api/syllabus/approve", FORM_BODY),
  action("/api/topics/edit", TEXT_FORM_BODY),
  action("/api/topics/approve", FORM_BODY),
  action("/api/topics/reject", TEXT_FORM_BODY),
  action("/api/topics/resubmit", FORM_BODY),
  action("/api/references/check", FORM_BODY),
  action("/api/budget/limit", FORM_BODY),
  action("/api/budget/reconcile", TEXT_FORM_BODY),
]);

const SEGMENTS: Readonly<Record<string, string>> = {
  ":id": "[0-9a-f]{32}",
  ":n": "[1-9][0-9]{0,4}",
};

// Expresión que reconoce exactamente los destinos crudos de una ruta.
function matcher(target: string): RegExp {
  const source = target
    .split("/")
    .map(
      (segment) =>
        SEGMENTS[segment] ?? segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("/");
  return new RegExp(`^${source}$`);
}

const MATCHERS: readonly (readonly [RegExp, Route])[] = ROUTES.map(
  (route) => [matcher(route.target), route] as const,
);

// Ruta de la lista que corresponde a un destino crudo, si la hay.
export function findRoute(url: string | undefined): Route | undefined {
  if (url === undefined) {
    return undefined;
  }
  return MATCHERS.find(([expression]) => expression.test(url))?.[1];
}

// Rechazo cerrado: cuerpo vacío y la conexión se cierra después. `Allow` solo
// acompaña al 405, con los métodos de la ruta.
const CLOSED: Headers = {
  "Cache-Control": "no-store",
  "Content-Length": "0",
  Connection: "close",
};

interface Decision {
  readonly status: Rejection;
  readonly headers: Headers;
}

function rejection(status: Rejection, route?: Route): Decision {
  return {
    status,
    headers:
      status === 405 && route !== undefined
        ? { ...CLOSED, Allow: route.methods.join(", ") }
        : CLOSED,
  };
}

const REASONS: Readonly<Record<Rejection, string>> = {
  400: "Bad Request",
  404: "Not Found",
  405: "Method Not Allowed",
  505: "HTTP Version Not Supported",
};

// Estado de una conexión:
// - `pending`: respuestas delegadas que aún no han terminado ni se han cerrado;
// - `deferred`: rechazo en bruto que espera a que termine la última pendiente;
// - `rejected`: tras un rechazo no se delega, no se responde ni se escribe
//   nada más en el socket;
// - `reset`: el socket ya se destruyó por `ECONNRESET`.
interface Connection {
  pending: number;
  deferred: Decision | undefined;
  rejected: boolean;
  reset: boolean;
}

// Valores de una cabecera, con el nombre en minúsculas, tal como llegaron en
// `rawHeaders`: sin combinar duplicados.
function rawValues(rawHeaders: readonly string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
    const value = rawHeaders[index + 1];
    if (rawHeaders[index]?.toLowerCase() === name && value !== undefined) {
      values.push(value);
    }
  }
  return values;
}

// Un `Host` no vacío, no formado solo por espacios, sin comas y sin caracteres
// de control (`\x00` a `\x1f`, tabulador incluido, y `\x7f`). Se admiten
// obs-text y espacios internos: se valida la estructura, no el formato
// (research.md, K21).
function validHost(value: string): boolean {
  if (value.replaceAll(" ", "") === "") {
    return false;
  }
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f || char === ",") {
      return false;
    }
  }
  return true;
}

// Exactamente un `Host` válido; en HTTP/1.0 también se admite su ausencia.
function hostAdmitted(rawHeaders: readonly string[], version: string): boolean {
  const hosts = rawValues(rawHeaders, "host");
  if (hosts.length === 0) {
    return version === "1.0";
  }
  return hosts.length === 1 && hosts.every(validHost);
}

const DECIMAL = /^(?:0|[1-9]\d{0,8})$/;

// Sin `Transfer-Encoding`. Si la ruta no admite cuerpo, un único
// `Content-Length: 0` o ninguno; si lo admite, exactamente un `Content-Length`
// decimal que no supere su máximo.
function bodyAdmitted(rawHeaders: readonly string[], maxBody: number): boolean {
  if (rawValues(rawHeaders, "transfer-encoding").length > 0) {
    return false;
  }
  const lengths = rawValues(rawHeaders, "content-length");
  if (maxBody === 0) {
    return lengths.length === 0 || (lengths.length === 1 && lengths[0] === "0");
  }
  const length = lengths[0];
  return (
    lengths.length === 1 &&
    length !== undefined &&
    DECIMAL.test(length) &&
    Number(length) <= maxBody
  );
}

// La primera regla incumplida decide el rechazo; sin ninguna, se delega. Un
// túnel (`CONNECT` o `Upgrade`) nunca se delega: pasa por la versión, `Host` y
// el destino y, sobre un destino de la lista, recibe 405.
function decide(req: IncomingMessage, tunnel: boolean): Decision | undefined {
  const version = req.httpVersion;
  if (version !== "1.0" && version !== "1.1") {
    return rejection(505);
  }
  const rawHeaders = req.rawHeaders;
  if (!hostAdmitted(rawHeaders, version)) {
    return rejection(400);
  }
  const route = findRoute(req.url);
  if (route === undefined) {
    return rejection(404);
  }
  const method = req.method;
  if (tunnel || method === undefined || !route.methods.includes(method)) {
    return rejection(405, route);
  }
  if (!bodyAdmitted(rawHeaders, route.maxBody)) {
    return rejection(400);
  }
  return undefined;
}

// Escribe una respuesta completa sin cuerpo con exactamente estas cabeceras:
// antes retira cualquier cabecera fijada previamente.
function respond(res: ServerResponse, status: number, headers: Headers): void {
  for (const name of res.getHeaderNames()) {
    res.removeHeader(name);
  }
  res.writeHead(status, headers);
  res.end();
}

// Destruye la conexión una sola vez, sin lanzar.
function destroy(res: ServerResponse): void {
  try {
    res.destroy();
  } catch {
    // No queda ninguna otra operación posible.
  }
}

// Fallo de `handle`. Si la respuesta no ha empezado, escribe una sola vez el
// 500 cerrado; si ya empezó, o si ese 500 falla, solo destruye la conexión.
function fail(res: ServerResponse): void {
  if (!res.headersSent) {
    try {
      respond(res, 500, CLOSED);
      return;
    } catch {
      // Sin segunda respuesta: se destruye la conexión.
    }
  }
  destroy(res);
}

// Rechazo cerrado escrito directamente en el socket, cuando no hay respuesta:
// errores de análisis, `CONNECT` y `Upgrade`.
function rawRejection({ status, headers }: Decision): string {
  const lines = [
    `HTTP/1.1 ${String(status)} ${REASONS[status]}`,
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
  ];
  return `${lines.join("\r\n")}\r\n\r\n`;
}

function hasCode(error: Error, code: string): boolean {
  return "code" in error && error.code === code;
}

export function createHttpBoundary(handle: Handle): HttpBoundary {
  const connections = new WeakMap<Duplex, Connection>();

  function connectionOf(socket: Duplex): Connection {
    let connection = connections.get(socket);
    if (connection === undefined) {
      connection = {
        pending: 0,
        deferred: undefined,
        rejected: false,
        reset: false,
      };
      connections.set(socket, connection);
    }
    return connection;
  }

  // Escribe el rechazo en bruto y cierra la conexión. Si el socket ya no es
  // escribible, se descarta sin escribir (dropped). En ambos casos la conexión
  // queda rechazada.
  function reject(
    socket: Duplex,
    connection: Connection,
    decision: Decision,
  ): void {
    connection.rejected = true;
    if (socket.destroyed || !socket.writable) {
      return;
    }
    try {
      socket.end(rawRejection(decision), () => {
        socket.destroy();
      });
    } catch {
      socket.destroy();
    }
  }

  // Un rechazo en bruto se escribe al instante si no hay respuestas
  // pendientes; si las hay, se difiere hasta que termine la última. Tras un
  // rechazo o con otro ya diferido, se suprime.
  function rejectInOrder(socket: Duplex, decision: Decision): void {
    const connection = connectionOf(socket);
    if (connection.rejected || connection.deferred !== undefined) {
      return;
    }
    if (connection.pending > 0) {
      connection.deferred = decision;
    } else {
      reject(socket, connection, decision);
    }
  }

  // Cuenta la respuesta como pendiente hasta que termina o se cierra, una sola
  // vez. Al terminar la última, emite el rechazo diferido (flush), salvo que
  // la conexión ya esté rechazada.
  function track(
    socket: Duplex,
    connection: Connection,
    res: ServerResponse,
  ): void {
    connection.pending += 1;
    let settled = false;
    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      connection.pending -= 1;
      const deferred = connection.deferred;
      if (connection.pending === 0 && deferred !== undefined) {
        connection.deferred = undefined;
        if (!connection.rejected) {
          reject(socket, connection, deferred);
        }
      }
    };
    res.once("finish", settle);
    res.once("close", settle);
  }

  // `request`, `checkContinue` y `checkExpectation` siguen la misma decisión:
  // sin respuestas automáticas `100 Continue` ni 417. Siempre se resuelve: ni
  // un rechazo ni un fallo de `handle` llegan al servidor. Una petición
  // admitida se entrega a `handle` con los mismos objetos, sin tocar la
  // respuesta, y se espera a que termine.
  async function admit(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const socket = req.socket;
    const connection = connectionOf(socket);
    if (connection.rejected) {
      return;
    }
    try {
      const decision = decide(req, false);
      if (decision !== undefined) {
        connection.rejected = true;
        respond(res, decision.status, decision.headers);
        return;
      }
    } catch {
      // Un rechazo que no puede escribirse no se sustituye por otra respuesta.
      destroy(res);
      return;
    }
    track(socket, connection, res);
    try {
      await handle(req, res);
    } catch {
      connection.rejected = true;
      fail(res);
    }
  }

  // `CONNECT` y `Upgrade`: rechazo cerrado en bruto, sin delegar ni usar lo
  // que el cliente envió después de las cabeceras. Node.js entrega el socket
  // sin su oyente de errores, así que un error posterior solo lo destruye.
  function tunnel(req: IncomingMessage, socket: Duplex): void {
    socket.on("error", () => {
      socket.destroy();
    });
    let decision: Decision;
    try {
      decision = decide(req, true) ?? rejection(405);
    } catch {
      // Sin decisión no hay rechazo que escribir: se destruye la conexión.
      socket.destroy();
      return;
    }
    rejectInOrder(socket, decision);
  }

  return {
    request: admit,
    checkContinue: admit,
    checkExpectation: admit,
    connect: tunnel,
    upgrade: tunnel,
    // Error de análisis: 400 cerrado en orden. `ECONNRESET` nunca escribe:
    // descarta el diferido y destruye el socket una sola vez.
    clientError(error, socket) {
      if (hasCode(error, "ECONNRESET")) {
        const connection = connectionOf(socket);
        connection.deferred = undefined;
        connection.rejected = true;
        if (!connection.reset) {
          connection.reset = true;
          socket.destroy();
        }
        return;
      }
      rejectInOrder(socket, rejection(400));
    },
  };
}
