// Entrega web de las rutas de producto (specs/002-boe-scorm-export:
// contracts/http-surface.md; research.md, R2 y R3; ADR 0004). No es un módulo
// portable: solo se usa dentro de Next.js.
//
// Reúne lo que comparten las páginas y las acciones: los servicios del
// proceso, las cookies, el documento HTML y las guardas de acceso. Toda ruta
// de producto se declara con una de las cuatro guardas, que son el único
// camino hacia la sesión:
//
// - `entryPage` y `entryAction`: el formulario de entrada y su envío. Son lo
//   único accesible sin sesión y no conceden acceso a nada más.
// - `protectedPage` y `protectedAction`: exigen sesión y, si se indica, un
//   perfil, comprobados en el servidor con denegación por defecto.
//
// Cada respuesta se escribe completa, con exactamente sus cabeceras, sin los
// ayudantes de Next.js: el HTML no carga ningún recurso externo ni ningún
// script del framework. Las acciones exigen además el origen público y el
// testigo de su sesión.
import { createHash, randomUUID } from "node:crypto";
import type {
  GetServerSideProps,
  GetServerSidePropsContext,
  NextApiHandler,
  NextApiRequest,
  NextApiResponse,
} from "next";
import { createAudit } from "@/platform/audit";
import type { Audit } from "@/platform/audit";
import { readRuntimeConfig } from "@/platform/config";
import type { Config } from "@/platform/config";
import {
  createIdentity,
  DEFAULT_PASSWORD_PARAMS,
  originAllowed,
  safeEqual,
} from "@/platform/identity";
import type {
  EntryContext,
  Identity,
  Role,
  SessionContext,
} from "@/platform/identity";
import { createLogger, logProductEvent } from "@/platform/logging";
import type { AppLogger, ProductEvent } from "@/platform/logging";
import { openDatabase } from "@/platform/persistence";

export { MIN_PASSWORD_LENGTH } from "@/platform/identity";
export type { Role, SessionContext } from "@/platform/identity";

type PageRequest = GetServerSidePropsContext["req"];
type PageResponse = GetServerSidePropsContext["res"];
type AnyRequest = PageRequest | NextApiRequest;
type AnyResponse = PageResponse | NextApiResponse;

// --- Servicios del proceso ---

export interface Runtime {
  readonly config: Config;
  readonly audit: Audit;
  readonly identity: Identity;
}

const RUNTIME = Symbol.for("aulanorma.web.runtime");

// Un único conjunto de servicios por proceso, compartido por todas las rutas.
// Las migraciones las aplica `server.mjs` antes de escuchar: aquí solo se
// abre la base de datos.
export function getRuntime(): Runtime {
  const holder = globalThis as { [RUNTIME]?: Runtime };
  const existing = holder[RUNTIME];
  if (existing !== undefined) {
    return existing;
  }
  const result = readRuntimeConfig();
  if (!result.ok) {
    throw new Error("La configuración no es válida.");
  }
  const { config } = result;
  const db = openDatabase(config.dataDir);
  const audit = createAudit(db);
  const runtime: Runtime = {
    config,
    audit,
    identity: createIdentity({
      db,
      audit: (event) => {
        audit.record(event);
      },
      now: () => Date.now(),
      sessionIdleMs: config.sessionIdleMinutes * 60_000,
      sessionMaxMs: config.sessionMaxHours * 3_600_000,
      passwordParams: DEFAULT_PASSWORD_PARAMS,
    }),
  };
  holder[RUNTIME] = runtime;
  return runtime;
}

// El manejador de registros no se comparte entre los paquetes que genera
// Next.js: cada copia de este módulo crea el suyo, con su propia copia del
// módulo de registros, que es la única que lo reconoce.
let logger: AppLogger | undefined;

function logEvent(
  config: Config,
  event: ProductEvent,
  correlationId: string,
): void {
  logger ??= createLogger({
    environment: config.environment,
    level: config.logLevel,
  });
  logProductEvent(logger, event, correlationId);
}

// --- Cookies ---

export type Notice =
  | "signin_refused"
  | "signin_throttled"
  | "signin_expired"
  | "signed_out"
  | "password_changed"
  | "password_invalid_current"
  | "password_invalid_new"
  | "password_unchanged";

const NOTICES: readonly Notice[] = [
  "signin_refused",
  "signin_throttled",
  "signin_expired",
  "signed_out",
  "password_changed",
  "password_invalid_current",
  "password_invalid_new",
  "password_unchanged",
];

type CookieName = "session" | "entry" | "notice";

// Con HTTPS, las cookies llevan el prefijo `__Host-` y `Secure`. Solo con el
// origen local por HTTP, que la configuración admite para desarrollo, se
// emiten sin ellos, porque no todos los navegadores los aceptan ahí.
function cookieName(config: Config, name: CookieName): string {
  const secure = config.publicOrigin.startsWith("https:");
  return `${secure ? "__Host-" : ""}aulanorma-${name}`;
}

function setCookie(
  config: Config,
  name: CookieName,
  value: string,
  maxAgeSeconds?: number,
): string {
  const secure = config.publicOrigin.startsWith("https:");
  return [
    `${cookieName(config, name)}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    ...(secure ? ["Secure"] : []),
    ...(maxAgeSeconds === undefined
      ? []
      : [`Max-Age=${String(maxAgeSeconds)}`]),
  ].join("; ");
}

function clearCookie(config: Config, name: CookieName): string {
  return setCookie(config, name, "", 0);
}

function readCookie(
  req: AnyRequest,
  config: Config,
  name: CookieName,
): string | undefined {
  const wanted = cookieName(config, name);
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator > 0 && part.slice(0, separator).trim() === wanted) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function readNotice(req: AnyRequest, config: Config): Notice | undefined {
  const value = readCookie(req, config, "notice");
  return NOTICES.find((notice) => notice === value);
}

// --- Respuestas ---

type Headers = Record<string, string | string[]>;

function send(
  res: AnyResponse,
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

// Respuesta sin cuerpo: rechazos y fallos.
function sendEmpty(res: AnyResponse, status: number): void {
  send(res, status, { "Cache-Control": "no-store", "Content-Length": "0" });
}

function fail(res: AnyResponse): void {
  if (!res.headersSent) {
    try {
      sendEmpty(res, 500);
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

function seeOther(res: AnyResponse, location: string, cookies: string[]): void {
  send(res, 303, {
    "Cache-Control": "no-store",
    "Content-Length": "0",
    Location: location,
    ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {}),
  });
}

// --- Estilo y script del documento ---

const STYLE = `
:root{color-scheme:light;--ink:#1b1f24;--muted:#4d5661;--line:#c9d1d9;--accent:#0b5cad;--accent-ink:#fff;--bad:#a4161a;--good:#1a6b3c;--surface:#f6f8fa}
*{box-sizing:border-box}
body{margin:0;font:1rem/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:#fff}
a{color:var(--accent)}
:focus-visible{outline:3px solid #f2a900;outline-offset:2px}
.skip{position:absolute;left:-999px;top:0;background:#fff;padding:.5rem 1rem}
.skip:focus{left:.5rem;top:.5rem;z-index:1}
header{border-bottom:1px solid var(--line);background:var(--surface)}
.bar{max-width:46rem;margin:0 auto;padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;justify-content:space-between}
.brand{font-weight:700;font-size:1.125rem;color:var(--ink);text-decoration:none}
nav ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1rem;align-items:center}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 1rem}
h2{font-size:1.15rem;margin:1.75rem 0 .5rem}
p{margin:0 0 1rem}
label{display:block;font-weight:600;margin:1rem 0 .25rem}
input:not([type=hidden]):not([hidden]){display:block;font:inherit;width:100%;max-width:24rem;padding:.55rem .65rem;border:1px solid #6b7480;border-radius:.3rem;background:#fff;color:var(--ink)}
.hint{color:var(--muted);font-size:.9rem;margin:.25rem 0 0}
button{display:block;font:inherit;font-weight:600;margin-top:1.25rem;padding:.6rem 1.1rem;border:1px solid var(--accent);border-radius:.3rem;background:var(--accent);color:var(--accent-ink);cursor:pointer}
button[disabled]{opacity:.7;cursor:progress}
button.plain{margin:0;padding:.3rem .7rem;background:#fff;color:var(--accent)}
.notice{border:1px solid var(--line);border-left:.35rem solid var(--accent);background:var(--surface);padding:.75rem 1rem;margin:0 0 1.25rem;border-radius:.3rem}
.notice.bad{border-left-color:var(--bad)}
.notice.good{border-left-color:var(--good)}
.notice p{margin:0}
dl{margin:0 0 1rem}
dt{font-weight:600}
dd{margin:0 0 .5rem}
.muted{color:var(--muted)}
`;

// Estado de carga: al enviar un formulario, su botón se desactiva y cambia su
// texto por el de `data-busy`. Al volver con el historial se restaura.
const SCRIPT = `
document.addEventListener("submit",function(event){var button=event.target.querySelector("button[type=submit]");if(!button||button.disabled){return}button.setAttribute("data-label",button.textContent);button.textContent=button.getAttribute("data-busy")||button.textContent;button.setAttribute("aria-busy","true");setTimeout(function(){button.disabled=true},0)});
window.addEventListener("pageshow",function(){document.querySelectorAll("button[aria-busy]").forEach(function(button){button.disabled=false;button.removeAttribute("aria-busy");button.textContent=button.getAttribute("data-label")||button.textContent})});
`;

function sha256Base64(content: string): string {
  return createHash("sha256").update(content).digest("base64");
}

// Sin recursos externos: solo el estilo y el script de este módulo, por su
// huella. Los formularios solo pueden enviarse al propio origen.
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  `style-src 'sha256-${sha256Base64(STYLE)}'`,
  `script-src 'sha256-${sha256Base64(SCRIPT)}'`,
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// --- HTML ---

// Fragmento de HTML ya escapado. Solo lo crea `html`, así que componer
// fragmentos nunca introduce texto sin escapar.
declare const markup: unique symbol;
export interface Html {
  readonly [markup]: true;
  readonly text: string;
}

type HtmlValue = string | number | Html | readonly Html[] | null | undefined;

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function isHtml(value: HtmlValue): value is Html {
  return typeof value === "object" && value !== null && "text" in value;
}

function rawHtml(text: string): Html {
  return Object.freeze({ text }) as Html;
}

// Plantilla de HTML: el texto literal se emite tal cual y cada valor
// interpolado se escapa, salvo que sea otro fragmento creado con `html`.
export function html(
  strings: TemplateStringsArray,
  ...values: readonly HtmlValue[]
): Html {
  let text = "";
  strings.forEach((literal, index) => {
    text += literal;
    const value = values[index];
    if (value === null || value === undefined) {
      return;
    }
    if (typeof value === "string") {
      text += escapeHtml(value);
    } else if (typeof value === "number") {
      text += String(value);
    } else if (isHtml(value)) {
      text += value.text;
    } else {
      text += value.map((item) => item.text).join("");
    }
  });
  return rawHtml(text);
}

// El contenido de estas dos etiquetas debe ser, byte a byte, el texto cuya
// huella lleva la política de contenido. Por eso se construyen por
// concatenación y no dentro de la plantilla, cuyo formato puede añadir
// espacios.
const STYLE_ELEMENT = rawHtml(`<style>${STYLE}</style>`);
const SCRIPT_ELEMENT = rawHtml(`<script>${SCRIPT}</script>`);

export interface LayoutProps {
  readonly title: string;
  readonly session: SessionContext | null;
  readonly content: Html;
}

// Documento común: enlace para saltar al contenido, cabecera con la
// navegación y la salida cuando hay sesión, y un único `main`.
export function layout({ title, session, content }: LayoutProps): Html {
  const navigation =
    session === null
      ? null
      : html`<nav aria-label="Principal">
          <ul>
            <li><a href="/">Inicio</a></li>
            <li><a href="/account/password">Contraseña</a></li>
            <li>
              <form method="post" action="/api/session/sign-out">
                <input type="hidden" name="csrf" value="${session.csrfToken}" />
                <button class="plain" type="submit" data-busy="Saliendo…">
                  Salir
                </button>
              </form>
            </li>
          </ul>
        </nav>`;
  return html`<!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>${title} · AulaNorma</title>
        ${STYLE_ELEMENT}
      </head>
      <body>
        <a class="skip" href="#contenido">Saltar al contenido</a>
        <header>
          <div class="bar">
            <a class="brand" href="${session === null ? "/login" : "/"}"
              >AulaNorma</a
            >
            ${navigation}
          </div>
        </header>
        <main id="contenido">${content}</main>
        ${SCRIPT_ELEMENT}
      </body>
    </html> `;
}

// Aviso con el tono indicado. Los de error se anuncian como alerta.
export function noticeBox(
  tone: "bad" | "good" | "neutral",
  text: string,
): Html {
  const role = tone === "bad" ? "alert" : "status";
  return html`<div class="notice ${tone}" role="${role}"><p>${text}</p></div>`;
}

function sendPage(
  res: AnyResponse,
  status: number,
  page: Html,
  cookies: string[],
): void {
  const body = page.text;
  send(
    res,
    status,
    {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": String(Buffer.byteLength(body)),
      "Content-Security-Policy": CONTENT_SECURITY_POLICY,
      // `same-origin`, no `no-referrer`: con `no-referrer` el navegador envía
      // `Origin: null` al enviar un formulario y la comprobación de origen
      // rechazaría los envíos legítimos. A otros orígenes no se envía nada.
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...(cookies.length > 0 ? { "Set-Cookie": cookies } : {}),
    },
    body,
  );
}

// --- Guardas ---

export interface PageReply {
  readonly status: number;
  readonly page: Html;
}

export interface EntryPageContext {
  readonly entry: EntryContext;
  readonly notice: Notice | undefined;
}

export interface ProtectedPageContext {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
}

export interface AccessOptions {
  // Perfil exigido; `null`, solo una sesión.
  readonly role: Role | null;
  // Nombre de la operación en la auditoría de una denegación.
  readonly operation: string;
  // Solo la página y la acción de cambio de contraseña se alcanzan mientras la
  // cuenta tiene pendiente cambiar su contraseña inicial.
  readonly allowPendingPasswordChange: boolean;
}

const EMPTY_PROPS = { props: {} };

function page(
  work: (
    req: PageRequest,
    res: PageResponse,
    runtime: Runtime,
    correlationId: string,
  ) => void,
): GetServerSideProps {
  // La promesa siempre se resuelve: un fallo acaba en el 500 cerrado.
  return ({ req, res }) => {
    try {
      work(req, res, getRuntime(), randomUUID());
    } catch {
      fail(res);
    }
    return Promise.resolve(EMPTY_PROPS);
  };
}

// Página del formulario de entrada. Con una sesión viva, lleva al inicio. Sin
// ella, emite o reutiliza la sesión previa anónima, cuyo testigo va en el
// formulario.
export function entryPage(
  render: (context: EntryPageContext) => PageReply,
): GetServerSideProps {
  return page((req, res, { config, identity }) => {
    if (identity.resolveSession(readCookie(req, config, "session")) !== null) {
      seeOther(res, "/", []);
      return;
    }
    const cookies: string[] = [];
    let entry = identity.resolveEntry(readCookie(req, config, "entry"));
    if (entry === null) {
      const issued = identity.beginEntry();
      cookies.push(setCookie(config, "entry", issued.cookie));
      entry = { csrfToken: issued.csrfToken };
    }
    const notice = readNotice(req, config);
    if (notice !== undefined) {
      cookies.push(clearCookie(config, "notice"));
    }
    const reply = render({ entry, notice });
    sendPage(res, reply.status, reply.page, cookies);
  });
}

function forbiddenPage(session: SessionContext): Html {
  return layout({
    title: "Sin permiso",
    session,
    content: html`<h1>No tienes permiso para ver esta página</h1>
      <p>
        Tu cuenta no tiene el perfil que hace falta. Si crees que es un error,
        habla con quien administra AulaNorma.
      </p>
      <p><a href="/">Volver al inicio</a></p>`,
  });
}

// Página de producto: sin sesión lleva a la entrada; con la contraseña
// inicial pendiente, al cambio de contraseña; sin el perfil exigido, responde
// 403.
export function protectedPage(
  options: AccessOptions,
  render: (context: ProtectedPageContext) => PageReply,
): GetServerSideProps {
  return page((req, res, { config, identity }, correlationId) => {
    const session = identity.resolveSession(readCookie(req, config, "session"));
    if (session === null) {
      seeOther(res, "/login", [clearCookie(config, "session")]);
      return;
    }
    if (
      session.user.mustChangePassword &&
      !options.allowPendingPasswordChange
    ) {
      seeOther(res, "/account/password", []);
      return;
    }
    if (
      !identity.authorize(
        session,
        options.role,
        options.operation,
        correlationId,
      )
    ) {
      logEvent(config, "access.denied", correlationId);
      sendPage(res, 403, forbiddenPage(session), []);
      return;
    }
    const cookies: string[] = [];
    const notice = readNotice(req, config);
    if (notice !== undefined) {
      cookies.push(clearCookie(config, "notice"));
    }
    const reply = render({ session, notice });
    sendPage(res, reply.status, reply.page, cookies);
  });
}

export interface ActionReply {
  readonly location: string;
  readonly notice?: Notice;
  // Valor nuevo de la cookie de sesión; `null` la borra.
  readonly sessionCookie?: string | null;
  readonly event?: ProductEvent;
}

export interface ActionInput {
  readonly field: (name: string) => string;
  readonly correlationId: string;
  readonly runtime: Runtime;
}

export interface EntryActionInput extends ActionInput {
  readonly entryCookie: string | undefined;
}

export interface ProtectedActionInput extends ActionInput {
  readonly session: SessionContext;
  // Valor de la cookie de la sesión en curso, para poder revocarla.
  readonly sessionCookie: string | undefined;
}

const FORM = "application/x-www-form-urlencoded";

// Campo de un formulario ya analizado: solo se aceptan textos.
function fieldOf(body: unknown, name: string): string {
  if (typeof body === "object" && body !== null && name in body) {
    const value = (body as Record<string, unknown>)[name];
    if (typeof value === "string") {
      return value;
    }
  }
  return "";
}

function header(req: AnyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return typeof value === "string" ? value : undefined;
}

function finish(
  res: NextApiResponse,
  runtime: Runtime,
  correlationId: string,
  reply: ActionReply,
  extraCookies: string[],
): void {
  const { config } = runtime;
  const cookies = [...extraCookies];
  if (reply.sessionCookie === null) {
    cookies.push(clearCookie(config, "session"));
  } else if (reply.sessionCookie !== undefined) {
    cookies.push(setCookie(config, "session", reply.sessionCookie));
  }
  if (reply.notice !== undefined) {
    cookies.push(setCookie(config, "notice", reply.notice, 60));
  }
  if (reply.event !== undefined) {
    logEvent(config, reply.event, correlationId);
  }
  seeOther(res, reply.location, cookies);
}

// Comprobaciones comunes de una acción: método, tipo de contenido y origen.
// Un envío que no las cumple se rechaza sin cuerpo y se audita.
function admitted(
  req: NextApiRequest,
  res: NextApiResponse,
  runtime: Runtime,
  operation: string,
  correlationId: string,
): boolean {
  if (req.method !== "POST") {
    send(res, 405, {
      "Cache-Control": "no-store",
      "Content-Length": "0",
      Allow: "POST",
    });
    return false;
  }
  const contentType = (header(req, "content-type") ?? "").split(";")[0] ?? "";
  if (contentType.trim().toLowerCase() !== FORM) {
    sendEmpty(res, 400);
    return false;
  }
  if (
    !originAllowed(
      runtime.config.publicOrigin,
      header(req, "origin"),
      header(req, "sec-fetch-site"),
    )
  ) {
    runtime.audit.record({
      actorId: null,
      action: "request.denied",
      targetKind: null,
      targetId: null,
      result: "denied",
      correlationId,
      details: { operation, reason: "origin" },
    });
    sendEmpty(res, 403);
    return false;
  }
  return true;
}

function action(
  work: (
    req: NextApiRequest,
    res: NextApiResponse,
    runtime: Runtime,
    correlationId: string,
  ) => Promise<void>,
): NextApiHandler {
  return async (req, res) => {
    try {
      await work(req, res, getRuntime(), randomUUID());
    } catch {
      fail(res);
    }
  };
}

// Envío del formulario de entrada. El testigo de la sesión previa lo
// comprueba `identity.signIn`, junto con las credenciales.
export function entryAction(
  operation: string,
  handle: (input: EntryActionInput) => Promise<ActionReply>,
): NextApiHandler {
  return action(async (req, res, runtime, correlationId) => {
    if (!admitted(req, res, runtime, operation, correlationId)) {
      return;
    }
    const body: unknown = req.body;
    const reply = await handle({
      field: (name) => fieldOf(body, name),
      correlationId,
      runtime,
      entryCookie: readCookie(req, runtime.config, "entry"),
    });
    finish(
      res,
      runtime,
      correlationId,
      reply,
      reply.sessionCookie === undefined
        ? []
        : [clearCookie(runtime.config, "entry")],
    );
  });
}

// Acción de producto: exige sesión, el testigo de esa sesión y, si se indica,
// un perfil.
export function protectedAction(
  options: AccessOptions,
  handle: (input: ProtectedActionInput) => Promise<ActionReply>,
): NextApiHandler {
  return action(async (req, res, runtime, correlationId) => {
    const { config, identity, audit } = runtime;
    if (!admitted(req, res, runtime, options.operation, correlationId)) {
      return;
    }
    const sessionCookie = readCookie(req, config, "session");
    const session = identity.resolveSession(sessionCookie);
    if (session === null) {
      seeOther(res, "/login", [
        clearCookie(config, "session"),
        setCookie(config, "notice", "signin_expired", 60),
      ]);
      return;
    }
    const body: unknown = req.body;
    if (!safeEqual(session.csrfToken, fieldOf(body, "csrf"))) {
      audit.record({
        actorId: session.user.id,
        action: "request.denied",
        targetKind: null,
        targetId: null,
        result: "denied",
        correlationId,
        details: { operation: options.operation, reason: "csrf" },
      });
      sendEmpty(res, 403);
      return;
    }
    if (
      session.user.mustChangePassword &&
      !options.allowPendingPasswordChange
    ) {
      seeOther(res, "/account/password", []);
      return;
    }
    if (
      !identity.authorize(
        session,
        options.role,
        options.operation,
        correlationId,
      )
    ) {
      logEvent(config, "access.denied", correlationId);
      sendEmpty(res, 403);
      return;
    }
    const reply = await handle({
      field: (name) => fieldOf(body, name),
      correlationId,
      runtime,
      session,
      sessionCookie,
    });
    finish(res, runtime, correlationId, reply, []);
  });
}
