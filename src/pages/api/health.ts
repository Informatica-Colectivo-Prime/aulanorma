// API Route de estado, la única ruta pública (FR-006 y FR-009; plan.md,
// «Frontera HTTP» y «API Route»; contracts/health.openapi.yaml). Solo la
// alcanzan las peticiones que delega la frontera HTTP.
//
// Importar el módulo no hace trabajo falible. La configuración y el estado,
// versión incluida, se obtienen dentro del `try` de cada consulta `GET` o
// `HEAD`; `OPTIONS` y los métodos no admitidos son respuestas de transporte
// que no los necesitan. Escribe con la API pública de `ServerResponse`, sin los
// ayudantes de Next.js, para que cada respuesta tenga exactamente sus
// cabeceras. Solo lee el método de la petición, no registra nada y no genera
// `requestId`.
import type { NextApiRequest, NextApiResponse } from "next";
import { readRuntimeConfig } from "@/platform/config";
import { buildHealthStatus } from "@/platform/health";

type Headers = Readonly<Record<string, string>>;

const ALLOW = "GET, HEAD, OPTIONS";

// Rechazo cerrado: cuerpo vacío y la conexión se cierra después.
const CLOSED: Headers = {
  "Cache-Control": "no-store",
  "Content-Length": "0",
  Connection: "close",
};

// Escribe una respuesta completa con exactamente estas cabeceras: antes retira
// cualquier cabecera fijada previamente.
function respond(
  res: NextApiResponse,
  status: number,
  headers: Headers,
  body?: string,
): void {
  for (const name of res.getHeaderNames()) {
    res.removeHeader(name);
  }
  res.writeHead(status, headers);
  if (body === undefined) {
    res.end();
  } else {
    res.end(body);
  }
}

// Fallo cerrado. Si la respuesta no ha empezado, escribe una sola vez el 500
// sin cuerpo; si ya empezó, o si ese 500 falla, no intenta nada más que
// destruir la conexión. Nunca lanza.
function fail(res: NextApiResponse): void {
  if (!res.headersSent) {
    try {
      respond(res, 500, CLOSED);
      return;
    } catch {
      // Sin segunda respuesta: se destruye la conexión.
    }
  }
  try {
    res.destroy();
  } catch {
    // No queda ninguna otra operación posible.
  }
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  try {
    const method = req.method;
    if (method === "GET" || method === "HEAD") {
      if (!readRuntimeConfig().ok) {
        fail(res);
        return;
      }
      // Solo `status` y `version`, en ese orden: el contrato es cerrado.
      const { status, version } = buildHealthStatus();
      const body = JSON.stringify({ status, version });
      // `HEAD` lleva las mismas cabeceras que `GET`, incluida la longitud del
      // cuerpo que no envía.
      respond(
        res,
        200,
        {
          "Cache-Control": "no-store",
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        },
        method === "GET" ? body : undefined,
      );
    } else if (method === "OPTIONS") {
      respond(res, 204, { Allow: ALLOW, "Cache-Control": "no-store" });
    } else {
      respond(res, 405, { ...CLOSED, Allow: ALLOW });
    }
  } catch {
    fail(res);
  }
}
