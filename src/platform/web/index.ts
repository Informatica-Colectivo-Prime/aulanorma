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
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
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
  createBudget,
  createDeterministicProvider,
  createGeneration,
  DETERMINISTIC_PROVIDER,
  loadRecordings,
} from "@/platform/generation";
import type { Generation } from "@/platform/generation";
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
import { html, inlineResource } from "@/platform/markup";
import type { Html } from "@/platform/markup";
import { openDatabase } from "@/platform/persistence";
import type { Database } from "@/platform/persistence";

export { MIN_PASSWORD_LENGTH } from "@/platform/identity";
export type { Role, SessionContext } from "@/platform/identity";

type PageRequest = GetServerSidePropsContext["req"];
type PageResponse = GetServerSidePropsContext["res"];
type AnyRequest = PageRequest | NextApiRequest;
type AnyResponse = PageResponse | NextApiResponse;

// --- Servicios del proceso ---

export interface Runtime {
  readonly config: Config;
  readonly db: Database;
  readonly audit: Audit;
  readonly identity: Identity;
  readonly generation: Generation;
  // Raíz del proyecto: el directorio desde el que arranca el servidor.
  readonly projectRoot: string;
}

// Directorio, dentro del de datos, con las respuestas grabadas del adaptador
// determinista de generación. Es el único adaptador que existe: no hay
// proveedor real seleccionado.
export const RECORDINGS_DIRECTORY = "generation-recordings";

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
  const recordings = `${config.dataDir}/${RECORDINGS_DIRECTORY}`;
  const budget = createBudget({
    db,
    audit,
    now: () => Date.now(),
    maxOperationCost: config.generationMaxOperationCost,
  });
  // Al arrancar, una operación que constaba como enviada y no se liquidó
  // queda como incierta y sigue contando contra el presupuesto.
  budget.recoverInterrupted();
  const runtime: Runtime = {
    config,
    db,
    audit,
    projectRoot: process.cwd(),
    generation: createGeneration({
      db,
      budget,
      // Las grabaciones se leen en cada operación: añadir una no exige
      // reiniciar. El adaptador determinista no cuesta nada.
      provider: {
        name: DETERMINISTIC_PROVIDER,
        estimateCost: () => 0,
        maxCost: () => 0,
        generate: (request) =>
          createDeterministicProvider(loadRecordings(recordings)).generate(
            request,
          ),
      },
      now: () => Date.now(),
    }),
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

// Aviso que una acción deja para la página siguiente, en una cookie de vida
// corta. El código pertenece a una lista cerrada; el detalle, opcional, solo
// admite minúsculas, cifras y los separadores `_` y `+`.
const NOTICE_CODES = [
  "signin_refused",
  "signin_throttled",
  "signin_expired",
  "signed_out",
  "password_changed",
  "password_invalid_current",
  "password_invalid_new",
  "password_unchanged",
  "document_registered",
  "document_rejected",
  "page_resolved",
  "page_not_resolved",
  "interpretation_created",
  "interpretation_refused",
  "interpretation_corrected",
  "interpretation_validated",
  "interpretation_rejected",
  "interpretation_resubmitted",
  "interpretation_blocked",
  "outline_created",
  "outline_refused",
  "outline_edited",
  "outline_approved",
  "outline_rejected",
  "outline_resubmitted",
  "syllabus_generated",
  "syllabus_refused",
  "version_approved",
  "topic_edited",
  "topic_approved",
  "topic_rejected",
  "topic_resubmitted",
  "reference_checked",
  "reference_refused",
  "export_created",
  "budget_limit_changed",
  "budget_reconciled",
  "budget_refused",
] as const;

export type NoticeCode = (typeof NOTICE_CODES)[number];

export interface Notice {
  readonly code: NoticeCode;
  readonly detail: string;
}

const NOTICE_VALUE = /^([a-z_]+)(?:\.([a-z0-9_+]{1,200}))?$/;

function parseNotice(value: string | undefined): Notice | undefined {
  const match = NOTICE_VALUE.exec(value ?? "");
  const code = NOTICE_CODES.find((item) => item === match?.[1]);
  return code === undefined ? undefined : { code, detail: match?.[2] ?? "" };
}

function noticeValue(notice: NoticeCode | Notice): string {
  if (typeof notice === "string") {
    return notice;
  }
  return notice.detail === "" ? notice.code : `${notice.code}.${notice.detail}`;
}

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
  return parseNotice(readCookie(req, config, "notice"));
}

// --- Respuestas ---

type Headers = Record<string, string | string[]>;

function send(
  res: AnyResponse,
  status: number,
  headers: Headers,
  body?: string | Buffer,
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
.bar,main{max-width:60rem}
textarea,select{display:block;font:inherit;width:100%;max-width:40rem;padding:.55rem .65rem;border:1px solid #6b7480;border-radius:.3rem;background:#fff;color:var(--ink)}
textarea{min-height:7rem}
input[type=checkbox]{display:inline-block;width:auto;margin:0 .5rem 0 0}
input[type=file]{border:0;padding:.3rem 0}
label.check{font-weight:400;display:flex;align-items:flex-start;gap:.25rem;max-width:40rem}
fieldset{border:1px solid var(--line);border-radius:.3rem;margin:1.25rem 0;padding:.25rem 1rem 1rem}
legend{font-weight:700;padding:0 .35rem}
table{border-collapse:collapse;width:100%;margin:0 0 1rem}
th,td{text-align:left;vertical-align:top;padding:.45rem .6rem;border-bottom:1px solid var(--line)}
th{font-size:.9rem}
.scroll{overflow-x:auto}
.tag{display:inline-block;font-size:.8rem;font-weight:600;padding:.05rem .45rem;border:1px solid var(--line);border-radius:1rem;background:var(--surface);white-space:nowrap}
.tag.bad{border-color:var(--bad);color:var(--bad)}
.tag.good{border-color:var(--good);color:var(--good)}
.source{white-space:pre-wrap;overflow-wrap:anywhere;font:.95rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface);border:1px solid var(--line);border-radius:.3rem;padding:1rem;margin:0 0 1rem}
blockquote{margin:.25rem 0 0;padding:0 0 0 .75rem;border-left:.25rem solid var(--line);color:var(--muted)}
code{overflow-wrap:anywhere}
ul.tree{list-style:none;margin:0 0 1rem;padding:0}
ul.tree li{border-bottom:1px solid var(--line);padding:.6rem 0}
.d1{margin-left:1.5rem}
.d2{margin-left:3rem}
.d3{margin-left:4.5rem}
.d4{margin-left:6rem}
ol.entries{margin:0 0 1rem;padding:0 0 0 1.75rem}
ol.entries>li{border-bottom:1px solid var(--line);padding:.75rem 0}
ol.entries ul{margin:.25rem 0 .5rem;padding-left:1.1rem}
.banner{border:2px dashed var(--bad);color:var(--bad);font-weight:700;padding:.6rem 1rem;margin:0 0 1.25rem;border-radius:.3rem}
label.check.d1,label.check.d2,label.check.d3,label.check.d4{max-width:none}
.block{border:1px solid var(--line);border-left:.4rem solid var(--muted);border-radius:.3rem;padding:.75rem 1rem;margin:0 0 1rem}
.block.norm{border-left-color:var(--accent);background:var(--surface)}
.block.development{border-left-color:var(--good)}
.block .kind{font-size:.8rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;margin:0 0 .5rem}
.block h3{font-size:1.05rem;margin:.75rem 0 .35rem}
ul.hint{padding-left:1.1rem}
.gone{text-decoration:line-through;color:var(--muted)}
.lines{white-space:pre-line}
.cols{display:grid;gap:1.5rem;grid-template-columns:repeat(auto-fit,minmax(18rem,1fr))}
.crumbs{font-size:.9rem;margin:0 0 1rem}
.actions{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center}
.actions button{margin-top:0}
button.secondary{background:#fff;color:var(--accent)}
`;

// Estado de carga: al enviar un formulario, su botón se desactiva y cambia su
// texto por el de `data-busy`. Al volver con el historial se restaura.
//
// Subida de un PDF (`form[data-upload]`): el fichero se envía como cuerpo
// `application/pdf` y los demás campos, en una cabecera. La respuesta dice a
// qué página ir; si no hay respuesta válida, el formulario lo explica.
const SCRIPT = `
function busy(button){if(!button||button.disabled){return}button.setAttribute("data-label",button.textContent);button.textContent=button.getAttribute("data-busy")||button.textContent;button.setAttribute("aria-busy","true");setTimeout(function(){button.disabled=true},0)}
function idle(button){if(!button){return}button.disabled=false;button.removeAttribute("aria-busy");button.textContent=button.getAttribute("data-label")||button.textContent}
function encode(text){var bytes=new TextEncoder().encode(text),binary="";bytes.forEach(function(byte){binary+=String.fromCharCode(byte)});return btoa(binary).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function upload(form){var button=form.querySelector("button[type=submit]"),status=form.querySelector("[data-upload-status]"),input=form.querySelector("input[type=file]"),file=input.files[0],fields={},csrf="";function fail(text){idle(button);status.textContent=text;status.focus()}if(!file){fail("Elige un fichero PDF.");return}if(file.size>Number(form.getAttribute("data-max-bytes"))){fail(form.getAttribute("data-too-large"));return}new FormData(form).forEach(function(value,name){if(typeof value==="string"){if(name==="csrf"){csrf=value}else{fields[name]=value}}});status.textContent="";busy(button);fetch(form.action,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/pdf","X-AulaNorma-Csrf":csrf,"X-AulaNorma-Document":encode(JSON.stringify(fields))},body:file}).then(function(response){return response.json()}).then(function(result){if(typeof result.location!=="string"||result.location.charAt(0)!=="/"){throw new Error}window.location.assign(result.location)}).catch(function(){fail(form.getAttribute("data-failed"))})}
document.addEventListener("submit",function(event){var form=event.target;if(form.hasAttribute("data-upload")){event.preventDefault();upload(form);return}busy(form.querySelector("button[type=submit]"))});
window.addEventListener("pageshow",function(){document.querySelectorAll("button[aria-busy]").forEach(idle)});
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
  // Solo la subida de un PDF usa `fetch`, y solo hacia el propio origen.
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

// --- HTML ---

// El marcado se compone con la plantilla de `@/platform/markup`, que escapa
// cada valor: aquí no hay ninguna forma de tratar una cadena como HTML.
export { html };
export type { Html };

// El contenido de estas dos etiquetas debe ser, byte a byte, el texto cuya
// huella lleva la política de contenido. Por eso se construyen por
// concatenación y no dentro de la plantilla, cuyo formato puede añadir
// espacios.
const STYLE_ELEMENT = inlineResource("style", STYLE);
const SCRIPT_ELEMENT = inlineResource("script", SCRIPT);

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
            ${
              session.user.roles.includes("teacher")
                ? html`<li><a href="/documents">Documentos</a></li>`
                : null
            }
            ${
              session.user.roles.length > 0
                ? html`<li><a href="/budget">Presupuesto</a></li>`
                : null
            }
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

// Fichero que una página protegida sirve tal cual, con su tipo exacto.
export interface FileReply {
  readonly file: {
    readonly body: Buffer;
    readonly contentType:
      "application/pdf" | "application/zip" | "text/plain; charset=utf-8";
    readonly filename: string;
  };
}

export interface EntryPageContext {
  readonly entry: EntryContext;
  readonly notice: Notice | undefined;
}

export interface ProtectedPageContext {
  readonly session: SessionContext;
  readonly notice: Notice | undefined;
  readonly runtime: Runtime;
  // Segmentos variables del destino, ya acotados por la frontera HTTP.
  readonly param: (name: string) => string;
  // Identificador de la petición, para la auditoría de lo que la página
  // registre.
  readonly correlationId: string;
}

export interface AccessOptions {
  // Perfil exigido; una lista, cualquiera de ellos; `null`, solo una sesión.
  readonly role: Role | readonly Role[] | null;
  // Nombre de la operación en la auditoría de una denegación.
  readonly operation: string;
  // Solo la página y la acción de cambio de contraseña se alcanzan mientras la
  // cuenta tiene pendiente cambiar su contraseña inicial.
  readonly allowPendingPasswordChange: boolean;
}

// Comprueba el perfil exigido, con denegación por defecto y auditada. Con
// una lista basta cualquiera de sus perfiles.
function authorized(
  identity: Identity,
  session: SessionContext,
  options: AccessOptions,
  correlationId: string,
): boolean {
  const required =
    options.role === null || typeof options.role === "string"
      ? options.role
      : (options.role.find((role) => session.user.roles.includes(role)) ??
        options.role[0] ??
        null);
  return identity.authorize(
    session,
    required,
    options.operation,
    correlationId,
  );
}

const EMPTY_PROPS = { props: {} };

function page(
  work: (
    req: PageRequest,
    res: PageResponse,
    runtime: Runtime,
    correlationId: string,
    param: (name: string) => string,
  ) => void,
): GetServerSideProps {
  // La promesa siempre se resuelve: un fallo acaba en el 500 cerrado.
  return ({ req, res, params }) => {
    try {
      work(req, res, getRuntime(), randomUUID(), (name) => {
        const value = params?.[name];
        return typeof value === "string" ? value : "";
      });
    } catch {
      fail(res);
    }
    return Promise.resolve(EMPTY_PROPS);
  };
}

// El PDF original, solo para quien tiene sesión y permiso: con su tipo
// exacto, sin que el navegador pueda interpretarlo como otra cosa, sin caché
// y con una política que no le permite cargar ni ejecutar nada.
function sendFile(res: AnyResponse, { file }: FileReply): void {
  send(
    res,
    200,
    {
      "Cache-Control": "no-store",
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.length),
      // Solo el PDF se muestra en el navegador; lo demás se descarga.
      "Content-Disposition": `${file.contentType === "application/pdf" ? "inline" : "attachment"}; filename="${file.filename}"`,
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'none'; " +
        "frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
    file.body,
  );
}

// Página para lo que no existe o no se puede mostrar a esta cuenta.
export function notFoundPage(session: SessionContext): PageReply {
  return {
    status: 404,
    page: layout({
      title: "No encontrado",
      session,
      content: html`<h1>No encontramos lo que buscas</h1>
        <p>
          Puede que la dirección no sea correcta o que el elemento ya no esté
          disponible.
        </p>
        <p><a href="/">Volver al inicio</a></p>`,
    }),
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
  render: (context: ProtectedPageContext) => PageReply | FileReply,
): GetServerSideProps {
  return page((req, res, runtime, correlationId, param) => {
    const { config, identity } = runtime;
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
    if (!authorized(identity, session, options, correlationId)) {
      logEvent(config, "access.denied", correlationId);
      sendPage(res, 403, forbiddenPage(session), []);
      return;
    }
    const cookies: string[] = [];
    const notice = readNotice(req, config);
    if (notice !== undefined) {
      cookies.push(clearCookie(config, "notice"));
    }
    const reply = render({ session, notice, runtime, param, correlationId });
    if ("file" in reply) {
      sendFile(res, reply);
    } else {
      sendPage(res, reply.status, reply.page, cookies);
    }
  });
}

export interface ActionReply {
  readonly location: string;
  readonly notice?: NoticeCode | Notice;
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
    cookies.push(setCookie(config, "notice", noticeValue(reply.notice), 60));
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
  expectedType: string = FORM,
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
  if (contentType.trim().toLowerCase() !== expectedType) {
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
  handle: (input: ProtectedActionInput) => Promise<ActionReply | PageReply>,
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
    if (!authorized(identity, session, options, correlationId)) {
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
    if ("page" in reply) {
      // Un conflicto o un bloqueo: se explica en una página, sin guardar
      // nada y sin redirigir, para conservar lo que el usuario envió.
      sendPage(res, reply.status, reply.page, []);
    } else {
      finish(res, runtime, correlationId, reply, []);
    }
  });
}

// --- Subida de un fichero ---

export interface UploadInput {
  readonly session: SessionContext;
  readonly runtime: Runtime;
  readonly correlationId: string;
  // Ruta del fichero recibido, que se borra al terminar; `undefined` si el
  // cuerpo superó el tamaño máximo configurado.
  readonly file: string | undefined;
  // Campos que acompañan al fichero, sin validar.
  readonly fields: Readonly<Record<string, unknown>>;
}

export interface UploadReply {
  readonly ok: boolean;
  readonly location: string;
  readonly notice?: NoticeCode | Notice;
}

const PDF = "application/pdf";
const MAX_FIELDS_HEADER = 8192;

function fieldsOf(
  value: string | undefined,
): Readonly<Record<string, unknown>> {
  if (
    value === undefined ||
    value.length > MAX_FIELDS_HEADER ||
    !/^[\w-]+$/.test(value)
  ) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Readonly<Record<string, unknown>>)
      : {};
  } catch {
    return {};
  }
}

// Guarda el cuerpo en `target` hasta `maxBytes`. Si lo supera, deja de
// escribir, termina de leerlo y devuelve `false`.
function receive(
  req: NextApiRequest,
  target: string,
  maxBytes: number,
): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const sink = createWriteStream(target, { flags: "wx", mode: 0o600 });
    let size = 0;
    let exceeded = false;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        exceeded = true;
      } else {
        sink.write(chunk);
      }
    });
    req.on("error", reject);
    sink.on("error", reject);
    req.on("end", () => {
      sink.end(() => {
        resolve(!exceeded);
      });
    });
  });
}

// Acción que recibe un PDF como cuerpo `application/pdf`. Exige lo mismo que
// `protectedAction`; el testigo de la sesión y los demás campos viajan en
// cabeceras, porque el cuerpo es el fichero. Responde con un JSON mínimo que
// indica a qué página ir, y deja el aviso para esa página. La ruta debe
// desactivar el analizador de cuerpos de Next.js.
export function protectedUpload(
  options: AccessOptions,
  handle: (input: UploadInput) => Promise<UploadReply>,
): NextApiHandler {
  return action(async (req, res, runtime, correlationId) => {
    const { config, identity, audit } = runtime;
    if (!admitted(req, res, runtime, options.operation, correlationId, PDF)) {
      return;
    }
    const session = identity.resolveSession(readCookie(req, config, "session"));
    if (session === null) {
      sendEmpty(res, 401);
      return;
    }
    if (!safeEqual(session.csrfToken, header(req, "x-aulanorma-csrf") ?? "")) {
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
      (session.user.mustChangePassword &&
        !options.allowPendingPasswordChange) ||
      !authorized(identity, session, options, correlationId)
    ) {
      logEvent(config, "access.denied", correlationId);
      sendEmpty(res, 403);
      return;
    }
    const directory = `${config.dataDir}/tmp`;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = `${directory}/upload-${randomBytes(8).toString("hex")}.pdf`;
    try {
      const complete = await receive(req, file, config.pdfMaxMib * 1024 * 1024);
      const reply = await handle({
        session,
        runtime,
        correlationId,
        file: complete ? file : undefined,
        fields: fieldsOf(header(req, "x-aulanorma-document")),
      });
      const body = JSON.stringify({ location: reply.location });
      send(
        res,
        reply.ok ? 201 : 422,
        {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(body)),
          "X-Content-Type-Options": "nosniff",
          ...(reply.notice === undefined
            ? {}
            : {
                "Set-Cookie": [
                  setCookie(config, "notice", noticeValue(reply.notice), 60),
                ],
              }),
        },
        body,
      );
    } finally {
      await rm(file, { force: true });
    }
  });
}
