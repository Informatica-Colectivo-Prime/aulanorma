// Cliente de pruebas de las rutas de producto. Invoca directamente
// `getServerSideProps` y los manejadores de las acciones con dobles de
// petición y respuesta, sin abrir ningún puerto, y conserva las cookies entre
// llamadas como lo haría un navegador.
//
// Prepara un directorio de datos temporal con las migraciones aplicadas y las
// variables de entorno de la configuración, y lo deshace todo al terminar.
import { mkdtempSync, rmSync } from "node:fs";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import type { GetServerSideProps, NextApiHandler } from "next";
import { getRuntime } from "@/platform/web";
import type { Runtime } from "@/platform/web";
import {
  migrate,
  openDatabase,
  PLATFORM_MIGRATIONS,
} from "@/platform/persistence";

export const ORIGIN = "https://aulanorma.example";
// Origen del modo desarrollo: el único caso en que se admite HTTP.
export const DEVELOPMENT_ORIGIN = "http://127.0.0.1:3000";
const RUNTIME = Symbol.for("aulanorma.web.runtime");

const ENVIRONMENT: Readonly<Record<string, string>> = {
  AULANORMA_LOG_LEVEL: "silent",
  AULANORMA_ENVIRONMENT: "test",
  AULANORMA_PUBLIC_ORIGIN: ORIGIN,
  AULANORMA_SESSION_IDLE_MINUTES: "30",
  AULANORMA_SESSION_MAX_HOURS: "12",
  AULANORMA_PDF_MAX_MIB: "32",
  AULANORMA_PDF_MAX_PAGES: "600",
  AULANORMA_GENERATION_MAX_OPERATION_COST: "1000000",
};

export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[]>>;
  readonly body: string;
  // Cuerpo tal como se envió, para las respuestas que no son texto.
  readonly raw: Buffer;
  readonly location: string | undefined;
  readonly setCookies: readonly string[];
}

class ResponseDouble {
  headersSent = false;
  status = 0;
  headers: Record<string, string | string[]> = {};
  body = "";
  raw: Buffer = Buffer.alloc(0);
  ended = false;
  destroyed = false;
  private pending: Record<string, string | string[]> = {};

  getHeaderNames(): string[] {
    return Object.keys(this.pending);
  }

  removeHeader(name: string): void {
    Reflect.deleteProperty(this.pending, name);
  }

  setHeader(name: string, value: string | string[]): this {
    this.pending[name] = value;
    return this;
  }

  writeHead(status: number, headers: Record<string, string | string[]>): this {
    if (this.headersSent) {
      throw new Error("Las cabeceras ya se enviaron.");
    }
    this.status = status;
    this.headers = Object.fromEntries(
      Object.entries(headers).map(([name, value]) => [
        name.toLowerCase(),
        value,
      ]),
    );
    this.headersSent = true;
    return this;
  }

  end(body?: string | Buffer): this {
    if (this.ended) {
      throw new Error("La respuesta ya terminó.");
    }
    this.raw = Buffer.from(body ?? "");
    this.body = this.raw.toString("utf8");
    this.ended = true;
    return this;
  }

  destroy(): void {
    this.destroyed = true;
  }
}

export interface RequestOptions {
  readonly method?: string;
  // `null` omite la cabecera `Origin`.
  readonly origin?: string | null;
  readonly secFetchSite?: string;
  readonly contentType?: string;
  // Sustituye por completo las cookies del cliente en esta petición.
  readonly cookies?: Readonly<Record<string, string>>;
  // Cabeceras añadidas a la petición, en minúsculas.
  readonly headers?: Readonly<Record<string, string>>;
  // Segmentos variables del destino de una página.
  readonly params?: Readonly<Record<string, string>>;
}

export interface WebClientOptions {
  // Modo desarrollo: `NODE_ENV=development` y el origen HTTP local.
  readonly development?: boolean;
}

export interface WebClient {
  readonly runtime: Runtime;
  readonly dataDir: string;
  readonly cookies: Map<string, string>;
  get(
    page: { getServerSideProps: GetServerSideProps },
    options?: RequestOptions,
  ): Promise<Reply>;
  post(
    action: { default: NextApiHandler },
    fields: Readonly<Record<string, string>>,
    options?: RequestOptions,
  ): Promise<Reply>;
  // Envía un fichero como cuerpo, con el testigo y los demás campos en
  // cabeceras, como hace el formulario de subida.
  upload(
    action: { default: NextApiHandler },
    file: Buffer,
    fields: Readonly<Record<string, string>>,
    options?: RequestOptions & { readonly csrf?: string },
  ): Promise<Reply>;
  // Testigo del formulario de la última página recibida.
  csrfOf(reply: Reply): string;
  // Campos ocultos del formulario de esa página que se envía a `action`,
  // como los enviaría un navegador.
  hiddenFields(reply: Reply, action: string): Record<string, string>;
  dispose(): void;
}

function cookieHeader(cookies: ReadonlyMap<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function createWebClient(options: WebClientOptions = {}): WebClient {
  const origin = options.development === true ? DEVELOPMENT_ORIGIN : ORIGIN;
  const dataDir = mkdtempSync(path.join(tmpdir(), "aulanorma-web-"));
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    ...ENVIRONMENT,
    AULANORMA_PUBLIC_ORIGIN: origin,
    AULANORMA_DATA_DIR: dataDir,
    ...(options.development === true ? { NODE_ENV: "development" } : {}),
  })) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  const holder = globalThis as { [RUNTIME]?: Runtime };
  Reflect.deleteProperty(holder, RUNTIME);
  const database = openDatabase(dataDir);
  migrate(database, PLATFORM_MIGRATIONS);
  database.close();
  const runtime = getRuntime();
  const cookies = new Map<string, string>();

  function finish(response: ResponseDouble): Reply {
    if (!response.ended && !response.destroyed) {
      throw new Error("La ruta no escribió ninguna respuesta.");
    }
    const header = response.headers["set-cookie"];
    const setCookies =
      header === undefined
        ? []
        : typeof header === "string"
          ? [header]
          : header;
    for (const cookie of setCookies) {
      const [pair = ""] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value === "" || /Max-Age=0(?:;|$)/.test(cookie)) {
        cookies.delete(name);
      } else {
        cookies.set(name, value);
      }
    }
    const location = response.headers.location;
    return {
      status: response.status,
      headers: response.headers,
      body: response.body,
      raw: response.raw,
      location: typeof location === "string" ? location : undefined,
      setCookies,
    };
  }

  function headersOf(options: RequestOptions): Record<string, string> {
    const jar =
      options.cookies === undefined
        ? cookies
        : new Map(Object.entries(options.cookies));
    return {
      host: new URL(origin).host,
      ...(jar.size > 0 ? { cookie: cookieHeader(jar) } : {}),
      ...options.headers,
    };
  }

  return {
    runtime,
    dataDir,
    cookies,
    async get(page, options = {}) {
      const response = new ResponseDouble();
      await page.getServerSideProps({
        req: { method: "GET", headers: headersOf(options) },
        res: response,
        params: options.params ?? {},
        query: {},
        resolvedUrl: "/",
      } as never);
      return finish(response);
    },
    async post(action, fields, options = {}) {
      const response = new ResponseDouble();
      const headers: Record<string, string> = {
        ...headersOf(options),
        "content-type":
          options.contentType ?? "application/x-www-form-urlencoded",
      };
      if (options.origin !== null) {
        headers.origin = options.origin ?? origin;
      }
      if (options.secFetchSite !== undefined) {
        headers["sec-fetch-site"] = options.secFetchSite;
      }
      await action.default(
        {
          method: options.method ?? "POST",
          headers,
          body: { ...fields },
        } as never,
        response as never,
      );
      return finish(response);
    },
    async upload(action, file, fields, options = {}) {
      const response = new ResponseDouble();
      const request = Object.assign(Readable.from([file]), {
        method: options.method ?? "POST",
        headers: {
          ...headersOf(options),
          "content-type": options.contentType ?? "application/pdf",
          "content-length": String(file.length),
          ...(options.origin === null
            ? {}
            : { origin: options.origin ?? origin }),
          ...(options.csrf === undefined
            ? {}
            : { "x-aulanorma-csrf": options.csrf }),
          "x-aulanorma-document": Buffer.from(
            JSON.stringify(fields),
            "utf8",
          ).toString("base64url"),
        },
      });
      await action.default(request as never, response as never);
      return finish(response);
    },
    csrfOf(reply) {
      const match = /name="csrf"\s+value="([^"]+)"/.exec(reply.body);
      if (match?.[1] === undefined) {
        throw new Error("La página no contiene ningún testigo.");
      }
      return match[1];
    },
    hiddenFields(reply, action) {
      const start = reply.body.indexOf(`action="${action}"`);
      if (start < 0) {
        throw new Error(`La página no contiene ningún formulario a ${action}.`);
      }
      const form = reply.body.slice(
        start,
        reply.body.indexOf("</form>", start),
      );
      const fields: Record<string, string> = {};
      for (const [input] of form.matchAll(/<input\b[^>]*>/g)) {
        const name = /name="([^"]*)"/.exec(input)?.[1];
        if (input.includes('type="hidden"') && name !== undefined) {
          fields[name] = /value="([^"]*)"/.exec(input)?.[1] ?? "";
        }
      }
      return fields;
    },
    dispose() {
      Reflect.deleteProperty(holder, RUNTIME);
      for (const [key, value] of previous) {
        if (value === undefined) {
          Reflect.deleteProperty(process.env, key);
        } else {
          process.env[key] = value;
        }
      }
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
