// Frontera HTTP (FR-009; research.md, R1; plan.md, «Frontera HTTP»;
// contracts/health.openapi.yaml, `x-aulanorma-transport-boundary` y
// `x-aulanorma-rejection-contract`). Módulo portable: `server.mjs` lo carga
// directamente con Node.js, así que no importa nada en ejecución (de
// `node:http` solo toma tipos) y usa sintaxis TypeScript borrable.
//
// Decide cada petición antes de Next.js con la precedencia versión → `Host` →
// destino → método → cuerpo, y solo delega el destino crudo exacto
// `/api/health` con `GET`, `HEAD` u `OPTIONS`. Lee únicamente `httpVersion`,
// `method`, `url` y `rawHeaders`, sin normalizar ni decodificar nada, y el
// estado imprescindible de la respuesta. No modifica la petición, no consume
// el cuerpo y no registra nada.
import type { IncomingMessage, ServerResponse } from "node:http";

export type Handle = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<void>;

export interface HttpBoundary {
  request(req: IncomingMessage, res: ServerResponse): Promise<void>;
}

type Headers = Readonly<Record<string, string>>;
type Rejection = 400 | 404 | 405 | 505;

const TARGET = "/api/health";
const ALLOW = "GET, HEAD, OPTIONS";

// Rechazo cerrado: cuerpo vacío y la conexión se cierra después. `Allow` solo
// acompaña al 405.
const CLOSED: Headers = {
  "Cache-Control": "no-store",
  "Content-Length": "0",
  Connection: "close",
};
const METHOD_NOT_ALLOWED: Headers = { ...CLOSED, Allow: ALLOW };

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

// Sin `Transfer-Encoding` y con un único `Content-Length: 0` o ninguno.
function bodyAdmitted(rawHeaders: readonly string[]): boolean {
  if (rawValues(rawHeaders, "transfer-encoding").length > 0) {
    return false;
  }
  const lengths = rawValues(rawHeaders, "content-length");
  return lengths.length === 0 || (lengths.length === 1 && lengths[0] === "0");
}

// La primera regla incumplida decide el rechazo; sin ninguna, se delega.
function decide(req: IncomingMessage): Rejection | undefined {
  const version = req.httpVersion;
  if (version !== "1.0" && version !== "1.1") {
    return 505;
  }
  const rawHeaders = req.rawHeaders;
  if (!hostAdmitted(rawHeaders, version)) {
    return 400;
  }
  if (req.url !== TARGET) {
    return 404;
  }
  const method = req.method;
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    return 405;
  }
  if (!bodyAdmitted(rawHeaders)) {
    return 400;
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

// `request` siempre se resuelve: ni un rechazo ni un fallo de `handle` llegan
// al servidor. Una petición admitida se entrega a `handle` con los mismos
// objetos, sin tocar la respuesta, y `request` espera a que termine.
export function createHttpBoundary(handle: Handle): HttpBoundary {
  return {
    async request(req, res) {
      try {
        const rejection = decide(req);
        if (rejection !== undefined) {
          respond(
            res,
            rejection,
            rejection === 405 ? METHOD_NOT_ALLOWED : CLOSED,
          );
          return;
        }
      } catch {
        // Un rechazo que no puede escribirse no se sustituye por otra respuesta.
        destroy(res);
        return;
      }
      try {
        await handle(req, res);
      } catch {
        fail(res);
      }
    },
  };
}
