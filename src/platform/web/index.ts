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
:focus-visible{outline:3px solid #1b1f24;outline-offset:2px;box-shadow:0 0 0 2px #fff}
.skip{position:absolute;left:-999px;top:0;background:#fff;padding:.5rem 1rem}
.skip:focus{left:.5rem;top:.5rem;z-index:1}
.session-warning{border:.25rem solid var(--bad);background:#fff;padding:1rem;margin:0}
.session-warning p{max-width:60rem;margin:0 auto .5rem}
.session-warning form{max-width:60rem;margin:0 auto}
.session-warning button{margin-top:.5rem}
.session-title{font-weight:700;font-size:1.15rem}
.session-warning label{margin-top:.5rem}
.session-error{color:var(--bad);font-weight:600}
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
input[type=checkbox]{display:inline-block;flex:none;width:1.5rem;height:1.5rem;margin:0 .5rem 0 0}
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
// Aviso de caducidad (`#sesion-aviso`): dos minutos antes de que la sesión
// caduque por inactividad, o la mitad del periodo si es más corto, muestra el
// aviso, le lleva el foco y ofrece ampliarla. La ampliación es un envío al
// servidor, que es quien decide; el script no hace ninguna consulta por su
// cuenta, así que una pestaña abierta no mantiene la sesión. Las pestañas se
// avisan entre sí por el almacenamiento local, sin pasar por el servidor: la
// actividad o la ampliación en una retrasa el aviso en las demás, y la salida
// en una lo da por terminado en todas.
//
// Duración máxima: cinco minutos antes de alcanzarla, el aviso pide la
// contraseña y, si el servidor la acepta, sustituye la sesión por otra nueva
// sin salir de la página (`#sesion-renovar`). El testigo nuevo se pone en
// todos los formularios de la página, con lo escrito intacto. A las demás
// pestañas solo se les comunica, por el almacenamiento local, el instante de
// la renovación: cada una pide entonces una página propia y toma de ella su
// testigo. En el almacenamiento local nunca hay contraseñas, cookies ni
// testigos. Un formulario que se envía con un testigo anterior a la
// renovación espera a tener el nuevo. Si el servidor rechaza una ampliación
// o una renovación, antes de dar la sesión por terminada se comprueba si
// sigue viva: otra pestaña ha podido renovarla a la vez.
//
// Formulario de entrada: si lleva abierto más de cinco minutos, al enviarlo
// pide antes un testigo vigente, de modo que su caducidad no obliga a
// repetir nada.
//
// Subida de un PDF (`form[data-upload]`): el fichero se envía como cuerpo
// `application/pdf` y los demás campos, en una cabecera. La respuesta dice a
// qué página ir; si no hay respuesta válida, el formulario lo explica.
const SCRIPT = `
var SESSION_KEY="aulanorma-sesion",RENEWED_KEY="aulanorma-renovada",tokensAt=Date.now();
function busy(button){if(!button||button.disabled){return}button.setAttribute("data-label",button.textContent);button.textContent=button.getAttribute("data-busy")||button.textContent;button.setAttribute("aria-busy","true");setTimeout(function(){button.disabled=true},0)}
function idle(button){if(!button){return}button.disabled=false;button.removeAttribute("aria-busy");button.textContent=button.getAttribute("data-label")||button.textContent}
function encode(text){var bytes=new TextEncoder().encode(text),binary="";bytes.forEach(function(byte){binary+=String.fromCharCode(byte)});return btoa(binary).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
function stored(key){try{return JSON.parse(localStorage.getItem(key))}catch(error){return null}}
function publish(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(error){}}
function setTokens(value){document.querySelectorAll('input[name="csrf"]').forEach(function(input){input.value=value})}
function fetchTokens(url){return fetch(url,{credentials:"same-origin",redirect:"manual"}).then(function(response){if(response.status!==200){return null}return response.text().then(function(body){var page=new DOMParser().parseFromString(body,"text/html"),input=page.querySelector('input[name="csrf"]');if(!input||!input.value){return null}setTokens(input.value);tokensAt=Date.now();return page})}).catch(function(){return null})}
function tokensStale(){var renewed=stored(RENEWED_KEY);return typeof renewed==="number"&&renewed>tokensAt}
function upload(form){var button=form.querySelector("button[type=submit]"),status=form.querySelector("[data-upload-status]"),input=form.querySelector("input[type=file]"),file=input.files[0],fields={},csrf="";function fail(text){idle(button);status.textContent=text;status.focus()}if(!file){fail("Elige un fichero PDF.");return}if(file.size>Number(form.getAttribute("data-max-bytes"))){fail(form.getAttribute("data-too-large"));return}new FormData(form).forEach(function(value,name){if(typeof value==="string"){if(name==="csrf"){csrf=value}else{fields[name]=value}}});status.textContent="";busy(button);fetch(form.action,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/pdf","X-AulaNorma-Csrf":csrf,"X-AulaNorma-Document":encode(JSON.stringify(fields))},body:file}).then(function(response){return response.json()}).then(function(result){if(typeof result.location!=="string"||result.location.charAt(0)!=="/"){throw new Error}window.location.assign(result.location)}).catch(function(){fail(form.getAttribute("data-failed"))})}
function sessionWatch(){var box=document.getElementById("sesion-aviso");if(!box){return{extend:function(){},renew:function(){},end:function(){},resync:function(){return fetchTokens("/account/password").then(function(page){return !!page})}}}
var title=document.getElementById("sesion-titulo"),text=document.getElementById("sesion-texto"),count=document.getElementById("sesion-cuenta"),live=document.getElementById("sesion-estado"),form=document.getElementById("sesion-ampliar"),renewal=document.getElementById("sesion-renovar"),field=document.getElementById("sesion-contrasena"),problem=document.getElementById("sesion-error"),again=document.getElementById("sesion-entrar"),button=form.querySelector("button"),renewButton=renewal.querySelector("button"),idleMs=0,idleAt=0,maxAt=0,state="ok",previous=null,said=0;
function read(source,at){var serverNow=Number(source.getAttribute("data-now"));idleMs=Number(source.getAttribute("data-idle-ms"));idleAt=at+Number(source.getAttribute("data-idle-at"))-serverNow;maxAt=at+Number(source.getAttribute("data-max-at"))-serverNow}
function span(ms){var s=Math.max(1,Math.ceil(ms/1000));if(s>=90){return Math.round(s/60)+" minutos"}if(s>=60){return "1 minuto"}return s+(s===1?" segundo":" segundos")}
function clock(ms){var s=Math.max(0,Math.ceil(ms/1000)),r=s%60;return Math.floor(s/60)+":"+(r<10?"0":"")+r}
function show(kind,left){if(state!==kind){state=kind;said=0;problem.textContent="";if(kind==="idle"){title.textContent="Tu sesión está a punto de caducar";text.textContent="Por inactividad, tu sesión caducará dentro de "+span(left)+". Si caduca, lo que hayas escrito en esta página y no hayas enviado se perderá. Pulsa «Continuar la sesión» para seguir trabajando.";form.hidden=false;renewal.hidden=true}else{title.textContent="Tu sesión está a punto de terminar";text.textContent="Tu sesión termina dentro de "+span(left)+" porque ha alcanzado su duración máxima. Para seguir trabajando sin perder lo que tienes en esta página, escribe tu contraseña y pulsa «Renovar la sesión».";form.hidden=true;renewal.hidden=false}again.hidden=true;if(box.hidden){previous=document.activeElement}box.hidden=false;(kind==="idle"?button:box).focus()}count.textContent="Tiempo restante: "+clock(left);var s=Math.ceil(left/1000),mark=s<=10?10:s<=30?30:s<=60?60:0;if(mark&&mark!==said){said=mark;live.textContent=mark===60?"Queda 1 minuto de sesión.":"Quedan "+mark+" segundos de sesión."}}
function hide(message){if(state==="ok"){return}state="ok";box.hidden=true;field.value="";problem.textContent="";live.textContent=message;if(previous&&document.contains(previous)&&previous.focus){previous.focus()}previous=null}
function end(){if(state==="ended"){return}state="ended";title.textContent="Tu sesión ha terminado";text.textContent="Lo que quedara sin enviar en esta página no se ha guardado. Puedes copiarlo antes de salir de ella. Para seguir trabajando, vuelve a entrar.";count.textContent="";live.textContent="";problem.textContent="";field.value="";form.hidden=true;renewal.hidden=true;again.hidden=false;box.hidden=false;again.querySelector("a").focus()}
function finish(){publish(SESSION_KEY,{ended:true});end()}
function tick(){if(state==="ended"){return}var now=Date.now(),toMax=maxAt-now,toIdle=idleAt-now;if(toMax<=0||toIdle<=0){end()}else if(toMax<=Math.min(300000,idleMs/2)){show("max",Math.min(toMax,toIdle))}else if(toIdle<=Math.min(120000,idleMs/2)){show("idle",toIdle)}else{hide("")}}
function post(target,body){return fetch(target.getAttribute("action"),{method:"POST",credentials:"same-origin",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:body})}
function token(target){return "csrf="+encodeURIComponent(target.querySelector('input[name="csrf"]').value)}
function retry(){live.textContent="No se ha podido ampliar la sesión. Comprueba la conexión y vuelve a intentarlo."}
function extend(){var started=Date.now();busy(button);post(form,token(form)).then(function(response){idle(button);if(response.status===204){idleAt=started+idleMs;publish(SESSION_KEY,{idleAt:idleAt});hide("Sesión ampliada.")}else if(response.status>=500){retry()}else{recover()}},function(){idle(button);retry()})}
function refuse(message){problem.textContent=message;field.value="";field.focus()}
function resync(){return fetchTokens("/account/password").then(function(page){var source=page&&page.getElementById("sesion-aviso");if(!source){return false}read(source,Date.now());return true})}
function renewed(message){hide(message);tick()}
function recover(){return resync().then(function(ok){if(!ok){finish();return}renewed("");if(state==="ok"){live.textContent="La sesión ya se había renovado en otra pestaña. Puedes seguir trabajando."}})}
function renew(){var body=token(renewal)+"&password="+encodeURIComponent(field.value);problem.textContent="";busy(renewButton);post(renewal,body).then(function(response){if(response.status===200){return response.json().then(function(data){var at=Date.now();idle(renewButton);setTokens(data.csrf);tokensAt=at;idleMs=data.idleMs;idleAt=at+data.idleAt-data.now;maxAt=at+data.maxAt-data.now;publish(RENEWED_KEY,at);publish(SESSION_KEY,{idleAt:idleAt});renewed("Sesión renovada. Puedes seguir trabajando.")})}idle(renewButton);if(response.status===422){refuse("La contraseña no es correcta. Vuelve a escribirla.")}else if(response.status===429){refuse("Demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.")}else if(response.status>=500){refuse("No se ha podido renovar la sesión por un error interno. No se ha perdido nada: vuelve a intentarlo.")}else{return recover()}}).catch(function(){idle(renewButton);refuse("No se ha podido renovar la sesión. Comprueba la conexión y vuelve a intentarlo.")})}
window.addEventListener("storage",function(event){if(state==="ended"||!event.newValue){return}if(event.key===RENEWED_KEY){resync().then(function(ok){if(ok){renewed(state==="ok"?"":"La sesión se ha renovado en otra pestaña. Puedes seguir trabajando.")}});return}if(event.key!==SESSION_KEY){return}var value;try{value=JSON.parse(event.newValue)}catch(error){return}if(value&&value.ended){end()}else if(value&&typeof value.idleAt==="number"&&value.idleAt>idleAt){idleAt=Math.min(value.idleAt,Date.now()+idleMs);tick()}});
read(box,tokensAt);publish(SESSION_KEY,{idleAt:idleAt});setInterval(tick,1000);tick();return{extend:extend,renew:renew,end:end,resync:resync}}
var session=sessionWatch();
document.addEventListener("submit",function(event){var form=event.target,action=form.getAttribute("action"),submitter=event.submitter||undefined;if(form.id==="sesion-ampliar"){event.preventDefault();session.extend();return}if(form.id==="sesion-renovar"){event.preventDefault();session.renew();return}if(action==="/api/session/sign-in"){if(Date.now()-tokensAt>300000){event.preventDefault();fetchTokens("/login").then(function(){tokensAt=Date.now();form.requestSubmit(submitter)});return}}else if(form.hasAttribute("data-fresh")){form.removeAttribute("data-fresh")}else if(form.hasAttribute("data-replay")||tokensStale()){event.preventDefault();session.resync().then(function(ok){var note=form.querySelector("[data-replay-status]");if(ok){form.setAttribute("data-fresh","");form.requestSubmit(submitter)}else if(note){note.textContent="No se ha podido continuar con la sesión nueva. Vuelve a entrar y repite el envío."}else{session.end()}});return}if(form.hasAttribute("data-upload")){event.preventDefault();upload(form);return}if(action==="/api/session/sign-out"){publish(SESSION_KEY,{ended:true})}busy(form.querySelector("button[type=submit]"))});
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
  // Solo la subida de un PDF y la ampliación de la sesión usan `fetch`, y
  // solo hacia el propio origen.
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

// Aviso de caducidad de la sesión, oculto hasta que el script lo muestra. Los
// plazos van como instantes del servidor, junto con su hora, para que el
// navegador los traslade a su propio reloj.
function sessionWarning(session: SessionContext | null): Html | null {
  return session === null
    ? null
    : html`<section
          id="sesion-aviso"
          class="session-warning"
          role="alertdialog"
          aria-modal="false"
          aria-labelledby="sesion-titulo"
          aria-describedby="sesion-texto"
          tabindex="-1"
          data-now="${Date.now()}"
          data-idle-at="${session.idleExpiresAt}"
          data-idle-ms="${session.idleMs}"
          data-max-at="${session.expiresAt}"
          hidden
        >
          <p id="sesion-titulo" class="session-title"></p>
          <p id="sesion-texto"></p>
          <p id="sesion-cuenta" aria-hidden="true"></p>
          <form id="sesion-ampliar" method="post" action="/api/session/extend">
            <input type="hidden" name="csrf" value="${session.csrfToken}" />
            <button type="submit" data-busy="Ampliando…">
              Continuar la sesión
            </button>
          </form>
          <form
            id="sesion-renovar"
            method="post"
            action="/api/session/renew"
            hidden
          >
            <input type="hidden" name="csrf" value="${session.csrfToken}" />
            <input
              class="skip"
              type="text"
              name="username"
              autocomplete="username"
              value="${session.user.username}"
              tabindex="-1"
              aria-hidden="true"
              readonly
            />
            <label for="sesion-contrasena">Contraseña</label>
            <input
              id="sesion-contrasena"
              name="password"
              type="password"
              autocomplete="current-password"
              aria-describedby="sesion-error"
              required
            />
            <p id="sesion-error" class="session-error" role="alert"></p>
            <button type="submit" data-busy="Renovando…">
              Renovar la sesión
            </button>
          </form>
          <p id="sesion-entrar" hidden><a href="/login">Volver a entrar</a></p>
        </section>
        <p id="sesion-estado" class="skip" role="status"></p>`;
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
                ? html`<li><a href="/budget">Presupuesto</a></li>
                    <li><a href="/history">Historial</a></li>`
                : null
            }
            ${
              session.user.roles.includes("admin")
                ? html`<li><a href="/metrics">Métricas</a></li>`
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
        ${sessionWarning(session)}
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
  // Sus campos llevan contraseñas: si la petición llega con la sesión o el
  // testigo anteriores a una renovación, no se devuelve lo enviado.
  readonly secretFields?: boolean;
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

// La sesión con la que llegó una página se sustituyó al renovarla.
function renewedPage(): Html {
  return layout({
    title: "Sesión renovada",
    session: null,
    content: html`<h1>Tu sesión se ha renovado</h1>
      <p>
        Esta página se pidió justo mientras renovabas la sesión en otra pestaña.
        No se ha perdido nada: vuelve a cargarla.
      </p>
      <p><a href="/">Ir al inicio</a></p>`,
  });
}

// Lo que se envió con una sesión o un testigo anteriores a una renovación,
// devuelto para repetirlo con la sesión nueva. No lleva testigo: el script lo
// pide con la sesión vigente antes de enviar. Sin esa sesión, no sirve de
// nada.
function replayPage(
  req: NextApiRequest,
  body: unknown,
  options: AccessOptions,
): Html {
  if (options.secretFields === true) {
    // Una contraseña no se escribe en ninguna respuesta: hay que repetirla.
    return layout({
      title: "Envío pendiente",
      session: null,
      content: html`<h1>Tu envío no se ha guardado</h1>
        <p>
          Renovaste la sesión mientras se enviaba este formulario, y llegó con
          la anterior. No se ha guardado nada. Como llevaba una contraseña, no
          se devuelve en esta página: vuelve al formulario y repítelo.
        </p>
        <p><a href="/">Ir al inicio</a></p>`,
    });
  }
  const target = (req.url ?? "").split("?")[0] ?? "";
  const fields =
    typeof body === "object" && body !== null
      ? Object.entries(body as Record<string, unknown>).filter(
          (entry): entry is [string, string] =>
            entry[0] !== "csrf" && typeof entry[1] === "string",
        )
      : [];
  return layout({
    title: "Envío pendiente",
    session: null,
    content: html`<h1>Tu envío no se ha guardado todavía</h1>
      <p>
        Renovaste la sesión mientras se enviaba este formulario, y llegó con la
        anterior. No se ha guardado ni se ha perdido nada: lo que enviaste está
        en esta página.
      </p>
      ${
        ROUTE_TARGET.test(target)
          ? html`<form method="post" action="${target}" data-replay>
              <input type="hidden" name="csrf" value="" />
              ${fields.map(
                ([name, value]) =>
                  html`<input type="hidden" name="${name}" value="${value}" />`,
              )}
              <button type="submit" data-busy="Enviando…">
                Enviar de nuevo
              </button>
              <p class="hint" role="status" data-replay-status></p>
            </form>`
          : null
      }
      <p><a href="/">Ir al inicio sin enviarlo</a></p>`,
  });
}

// Destino de una acción: solo rutas propias de la interfaz de acciones.
const ROUTE_TARGET = /^\/api\/[a-z0-9/-]+$/;

// Página de producto: sin sesión lleva a la entrada; con la contraseña
// inicial pendiente, al cambio de contraseña; sin el perfil exigido, responde
// 403.
export function protectedPage(
  options: AccessOptions,
  render: (context: ProtectedPageContext) => PageReply | FileReply,
): GetServerSideProps {
  return page((req, res, runtime, correlationId, param) => {
    const { config, identity } = runtime;
    const sessionCookie = readCookie(req, config, "session");
    const session = identity.resolveSession(sessionCookie);
    if (session === null) {
      if (identity.wasRenewed(sessionCookie)) {
        // La petición salió antes de que el navegador recibiera la sesión
        // nueva. No se borra la cookie: borraría la nueva.
        sendPage(res, 409, renewedPage(), []);
        return;
      }
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

// Acción que no lleva a otra página: responde 204, sin cuerpo.
export interface DoneReply {
  readonly done: true;
}

// Acción que responde con datos a una petición del script de la página.
export interface DataReply {
  readonly status: number;
  readonly data: Readonly<Record<string, string | number>>;
  // Valor nuevo de la cookie de sesión.
  readonly sessionCookie?: string;
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
  handle: (
    input: ProtectedActionInput,
  ) => Promise<ActionReply | PageReply | DoneReply | DataReply>,
): NextApiHandler {
  return action(async (req, res, runtime, correlationId) => {
    const { config, identity, audit } = runtime;
    if (!admitted(req, res, runtime, options.operation, correlationId)) {
      return;
    }
    const sessionCookie = readCookie(req, config, "session");
    const body: unknown = req.body;
    const denied = (actorId: string | null, reason: string): void => {
      audit.record({
        actorId,
        action: "request.denied",
        targetKind: null,
        targetId: null,
        result: "denied",
        correlationId,
        details: { operation: options.operation, reason },
      });
    };
    // Primero sin anotar actividad: una petición que se va a rechazar no
    // mantiene viva la sesión.
    const found = identity.resolveSession(sessionCookie, { touch: false });
    if (found === null) {
      if (identity.wasRenewed(sessionCookie)) {
        // Salió con la sesión anterior a una renovación. Ni se ejecuta ni se
        // borra la cookie, que ya es la de la sesión nueva: se devuelve lo
        // enviado para repetirlo con ella.
        denied(null, "session_renewed");
        sendPage(res, 409, replayPage(req, body, options), []);
        return;
      }
      seeOther(res, "/login", [
        clearCookie(config, "session"),
        setCookie(config, "notice", "signin_expired", 60),
      ]);
      return;
    }
    const csrf = fieldOf(body, "csrf");
    if (!safeEqual(found.csrfToken, csrf)) {
      if (identity.isPreviousToken(sessionCookie, csrf)) {
        // Un formulario abierto antes de renovar: tampoco se ejecuta.
        denied(found.user.id, "csrf_renewed");
        sendPage(res, 409, replayPage(req, body, options), []);
        return;
      }
      denied(found.user.id, "csrf");
      sendEmpty(res, 403);
      return;
    }
    // Aceptada: ahora sí cuenta como actividad.
    const session = identity.resolveSession(sessionCookie) ?? found;
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
    if ("done" in reply) {
      sendEmpty(res, 204);
    } else if ("data" in reply) {
      const text = JSON.stringify(reply.data);
      send(
        res,
        reply.status,
        {
          "Cache-Control": "no-store",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": String(Buffer.byteLength(text)),
          "X-Content-Type-Options": "nosniff",
          ...(reply.sessionCookie === undefined
            ? {}
            : {
                "Set-Cookie": [
                  setCookie(config, "session", reply.sessionCookie),
                ],
              }),
        },
        text,
      );
    } else if ("page" in reply) {
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
    // Como en las demás acciones: una subida que se rechaza por su testigo
    // no cuenta como actividad.
    const uploadCookie = readCookie(req, config, "session");
    const found = identity.resolveSession(uploadCookie, { touch: false });
    if (found === null) {
      sendEmpty(res, 401);
      return;
    }
    if (!safeEqual(found.csrfToken, header(req, "x-aulanorma-csrf") ?? "")) {
      audit.record({
        actorId: found.user.id,
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
    const session = identity.resolveSession(uploadCookie) ?? found;
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
