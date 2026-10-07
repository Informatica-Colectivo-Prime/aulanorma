// Cliente de pruebas de las rutas de producto. Invoca directamente
// `getServerSideProps` y los manejadores de las acciones con dobles de
// petición y respuesta, sin abrir ningún puerto, y conserva las cookies entre
// llamadas como lo haría un navegador.
//
// Prepara un directorio de datos temporal con las migraciones aplicadas y las
// variables de entorno de la configuración, y lo deshace todo al terminar.
import { mkdtempSync, rmSync } from "node:fs";
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
const RUNTIME = Symbol.for("aulanorma.web.runtime");

const ENVIRONMENT: Readonly<Record<string, string>> = {
  AULANORMA_LOG_LEVEL: "silent",
  AULANORMA_ENVIRONMENT: "test",
  AULANORMA_PUBLIC_ORIGIN: ORIGIN,
  AULANORMA_SESSION_IDLE_MINUTES: "30",
  AULANORMA_SESSION_MAX_HOURS: "12",
};

export interface Reply {
  readonly status: number;
  readonly headers: Readonly<Record<string, string | string[]>>;
  readonly body: string;
  readonly location: string | undefined;
  readonly setCookies: readonly string[];
}

class ResponseDouble {
  headersSent = false;
  status = 0;
  headers: Record<string, string | string[]> = {};
  body = "";
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

  end(body?: string): this {
    if (this.ended) {
      throw new Error("La respuesta ya terminó.");
    }
    this.body = body ?? "";
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
}

export interface WebClient {
  readonly runtime: Runtime;
  readonly dataDir: string;
  readonly cookies: Map<string, string>;
  get(page: { getServerSideProps: GetServerSideProps }): Promise<Reply>;
  post(
    action: { default: NextApiHandler },
    fields: Readonly<Record<string, string>>,
    options?: RequestOptions,
  ): Promise<Reply>;
  // Testigo del formulario de la última página recibida.
  csrfOf(reply: Reply): string;
  dispose(): void;
}

function cookieHeader(cookies: ReadonlyMap<string, string>): string {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

export function createWebClient(): WebClient {
  const dataDir = mkdtempSync(path.join(tmpdir(), "aulanorma-web-"));
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries({
    ...ENVIRONMENT,
    AULANORMA_DATA_DIR: dataDir,
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
      host: "aulanorma.example",
      ...(jar.size > 0 ? { cookie: cookieHeader(jar) } : {}),
    };
  }

  return {
    runtime,
    dataDir,
    cookies,
    async get(page) {
      const response = new ResponseDouble();
      await page.getServerSideProps({
        req: { method: "GET", headers: headersOf({}) },
        res: response,
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
        headers.origin = options.origin ?? ORIGIN;
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
    csrfOf(reply) {
      const match = /name="csrf"\s+value="([^"]+)"/.exec(reply.body);
      if (match?.[1] === undefined) {
        throw new Error("La página no contiene ningún testigo.");
      }
      return match[1];
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
