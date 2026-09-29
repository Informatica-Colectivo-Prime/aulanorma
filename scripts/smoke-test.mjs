// Prueba de humo de los puntos de entrada admitidos (FR-004, FR-005, FR-006,
// FR-008 y FR-009; plan.md, «Estrategia de pruebas»; research.md, R8).
// Node.js sin dependencias. Se ejecuta desde `npm run check:build`, después de
// `next build`.
//
// Contiene la infraestructura común, el modo producción con `npm start` en el
// repositorio (T025) y, después y nunca a la vez, el modo desarrollo con
// `npm run dev` (T026). T029 añade la matriz negativa por TCP crudo, T030 la
// equivalencia entre modos y T031 la auditoría de registros.
//
// El modo desarrollo se ejecuta en una copia temporal (research.md, R14): los
// ficheros regulares de `git ls-files --cached --others --exclude-standard`,
// sin ficheros ignorados, con sus propias dependencias instaladas mediante
// `npm ci` desde la caché de npm ya poblada. El `npm ci` es el único proceso
// que usa esa caché, y escribe sus registros en el temporal del arnés, no en
// ella; no puede alterar `package-lock.json` ni `package.json`.
// La copia se elimina siempre, y el repositorio original debe quedar idéntico,
// incluido `.next`.
//
// Higiene:
// - el entorno de cada proceso hijo se construye desde cero: del proceso padre
//   solo se conserva `PATH`, para localizar `npm` y `node`; el inicio, los
//   temporales y la caché de npm son directorios propios dentro de un temporal
//   del arnés, que se elimina al terminar; el aviso de actualización de npm se
//   desactiva para no salir a la red, y cada caso añade solo sus variables;
// - solo se usa el puerto fijo 127.0.0.1:3000 de los puntos de entrada, y se
//   comprueba que está libre antes de cada arranque;
// - cada proceso arranca en su propio grupo, que se termina completo al acabar
//   el caso;
// - las esperas dependen de señales observables (salida del proceso, evento
//   `startup.completed` y puerto), siempre con un límite de tiempo y sin dejar
//   temporizadores pendientes;
// - SIGINT o SIGTERM marcan la detención al instante: desde entonces no se
//   arranca ningún proceso, caso, instalación ni copia, se ejecuta una única
//   limpieza y el código de salida es 130 o 143;
// - se niega a ejecutarse si existen ficheros `.env*` de producción;
// - todo lo que imprime pasa antes por `redact`, sin valores sintéticos ni
//   rutas locales.
//
// No arranca `next start` ni `next dev`, que no están admitidos (T032).
// `server.mjs` solo se ejecuta directamente para comprobar su defensa interna,
// y el preflight, para comprobar que rechaza un `NODE_ENV` discordante.
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  accessSync,
  constants,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const HOST = "127.0.0.1";
const PORT = 3000;
const TARGET = "/api/health";
const ALLOW = "GET, HEAD, OPTIONS";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const EXIT_LIMIT_MS = 20_000;
const READY_LIMIT_MS = 60_000;
const STOP_LIMIT_MS = 10_000;
const RESPONSE_LIMIT_MS = 5_000;
const WARMUP_LIMIT_MS = 60_000;
const INSTALL_LIMIT_MS = 300_000;
const POLL_MS = 10;

const PRODUCTION_ENV_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];

const SENTINEL = `centinela-${randomUUID()}`;
const VALID_CONFIG = {
  AULANORMA_LOG_LEVEL: "info",
  AULANORMA_ENVIRONMENT: "ci",
};
const VERSION = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf8"),
).version;

// Redacción de todo lo que se imprime.
function realOrSelf(value) {
  try {
    return realpathSync(value);
  } catch {
    return value;
  }
}

const privateValues = [];

function protect(value, label) {
  if (value.length > 1) {
    privateValues.push([value, label]);
    privateValues.sort(([left], [right]) => right.length - left.length);
  }
}

protect(SENTINEL, "<centinela>");
protect(ROOT, "<repositorio>");
protect(realOrSelf(ROOT), "<repositorio>");
protect(os.tmpdir(), "<temporal>");
protect(realOrSelf(os.tmpdir()), "<temporal>");
protect(os.homedir(), "<inicio>");

function redact(text) {
  let result = String(text);
  for (const [value, label] of privateValues) {
    result = result.split(value).join(label);
  }
  return result;
}

function print(line) {
  process.stdout.write(`${redact(line)}\n`);
}

// Comprobaciones de la salida de un arranque fallido.
const ABSOLUTE_PATH =
  /(?:^|[\s"'(=:])(?:\/(?:Users|home|private|var|tmp|opt|usr|root|Volumes)\/|[A-Za-z]:\\)/m;
const STACK_TRACE = /^\s+at\s/m;
const ENV_FILE_NAME = /\.env\b/;

function leakProblems(output) {
  const problems = [];
  if (output.includes(SENTINEL)) {
    problems.push("la salida contiene el valor centinela");
  }
  if (
    output.includes(ROOT) ||
    output.includes(os.homedir()) ||
    privatePaths.some((value) => output.includes(value)) ||
    ABSOLUTE_PATH.test(output)
  ) {
    problems.push("la salida contiene una ruta absoluta");
  }
  if (ENV_FILE_NAME.test(output)) {
    problems.push("la salida nombra un fichero .env");
  }
  if (STACK_TRACE.test(output)) {
    problems.push("la salida contiene una traza");
  }
  return problems;
}

function hasStartupCompleted(output) {
  return output.split("\n").some((line) => {
    try {
      return JSON.parse(line)?.msg === "startup.completed";
    } catch {
      return false;
    }
  });
}

// Entorno de cada caso, construido desde cero: `PATH` del proceso padre, los
// directorios aislados del temporal del arnés, el aviso de actualización de
// npm desactivado y las variables del caso. Nada más se hereda.
let searchPath;
let sandbox;
let developmentCopy;
const privatePaths = [];

function hidePath(value, label) {
  for (const variant of new Set([value, realOrSelf(value)])) {
    privatePaths.push(variant);
    protect(variant, label);
  }
}

function createSandbox() {
  sandbox = mkdtempSync(path.join(os.tmpdir(), "aulanorma-humo-"));
  hidePath(sandbox, "<temporal del arnés>");
  for (const directory of ["home", "tmp", "npm-cache", "npm-logs"]) {
    mkdirSync(path.join(sandbox, directory));
  }
  hidePath(path.join(sandbox, "npm-logs"), "<registros de npm>");
}

function removeDirectory(directory) {
  if (directory === undefined) {
    return true;
  }
  try {
    rmSync(directory, { recursive: true, force: true });
  } catch {
    // Se informa en la limpieza.
  }
  return !existsSync(directory);
}

function removeTemporaries() {
  return removeDirectory(developmentCopy) && removeDirectory(sandbox);
}

function isolatedEnvironment(npmCache) {
  return {
    PATH: searchPath,
    HOME: path.join(sandbox, "home"),
    TMPDIR: path.join(sandbox, "tmp"),
    npm_config_cache: npmCache,
    npm_config_update_notifier: "false",
  };
}

function caseEnvironment(variables) {
  return {
    ...isolatedEnvironment(path.join(sandbox, "npm-cache")),
    ...variables,
  };
}

// Detención solicitada por una señal. Se marca de forma síncrona en el
// manejador; `throwIfStopping` impide, a partir de ese momento, arrancar
// procesos, casos, la instalación o la copia.
class StopRequested extends Error {}

const STOP_CODES = { SIGINT: 130, SIGTERM: 143 };
let stopSignal;

function stopping() {
  return stopSignal !== undefined;
}

function throwIfStopping() {
  if (stopping()) {
    throw new StopRequested();
  }
}

// Git solo necesita `PATH` y un inicio aislado, sin configuración global.
function gitOutput(args) {
  throwIfStopping();
  return execFileSync("git", args, {
    cwd: ROOT,
    env: {
      PATH: searchPath,
      HOME: path.join(sandbox, "home"),
      TMPDIR: path.join(sandbox, "tmp"),
    },
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 256 * 1024 * 1024,
  });
}

// Procesos: cada uno en su propio grupo, con su salida en memoria. La guarda,
// el arranque y el alta en `launched` son síncronos, así que ninguna señal
// puede dejar un proceso sin registrar.
const launched = new Set();

function launch(command, args, environment, cwd = ROOT) {
  throwIfStopping();
  const child = spawn(command, args, {
    cwd,
    env: environment,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  launched.add(child);
  let output = "";
  let running = true;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve) => {
    child.once("error", () => {
      running = false;
      resolve({ code: null, signal: null, started: false });
    });
    child.once("close", (code, signal) => {
      running = false;
      resolve({ code, signal, started: true });
    });
  });
  return {
    child,
    exited,
    output: () => output,
    running: () => running,
  };
}

function groupAlive(pid) {
  if (pid === undefined) {
    return false;
  }
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function signalGroup(pid, signal) {
  if (pid === undefined) {
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    // El grupo ya no existe.
  }
}

async function waitUntil(condition, limitMs) {
  const deadline = Date.now() + limitMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await delay(POLL_MS);
  }
  return condition();
}

// Termina el grupo completo: primero SIGTERM y, si no basta, SIGKILL.
async function stop(proc) {
  const { pid } = proc.child;
  if (groupAlive(pid)) {
    signalGroup(pid, "SIGTERM");
    const ended = await waitUntil(() => !groupAlive(pid), STOP_LIMIT_MS);
    if (!ended) {
      signalGroup(pid, "SIGKILL");
      await waitUntil(() => !groupAlive(pid), STOP_LIMIT_MS);
    }
  }
  // Nunca espera sin límite: si el grupo sigue vivo, queda registrado para que
  // la limpieza final lo termine y lo cuente como residuo.
  await exitResult(proc);
  if (!groupAlive(pid)) {
    launched.delete(proc.child);
  }
}

// Resultado de salida tras `stop`; si el proceso no terminó, `code` es `null`.
// El temporizador se cancela en cuanto el proceso termina.
async function exitResult(proc) {
  let timer;
  const limit = new Promise((resolve) => {
    timer = setTimeout(
      () => resolve({ code: null, signal: null }),
      STOP_LIMIT_MS,
    );
  });
  try {
    return await Promise.race([proc.exited, limit]);
  } finally {
    clearTimeout(timer);
  }
}

// Puerto.
function portAccepts() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (accepted) => {
      socket.destroy();
      resolve(accepted);
    };
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.setTimeout(1_000, () => finish(false));
  });
}

class FatalError extends Error {}

async function ensurePortFree() {
  throwIfStopping();
  const busy = await portAccepts();
  throwIfStopping();
  if (busy) {
    throw new FatalError(
      `El puerto ${HOST}:${String(PORT)} está ocupado. Libéralo antes de ejecutar la prueba de humo.`,
    );
  }
}

// Observa el puerto durante toda la vida del proceso.
async function watchNeverOpens(proc) {
  const deadline = Date.now() + EXIT_LIMIT_MS;
  let opened = false;
  while (proc.running() && Date.now() < deadline) {
    throwIfStopping();
    if (await portAccepts()) {
      opened = true;
    }
    await delay(POLL_MS);
  }
  throwIfStopping();
  const timedOut = proc.running();
  if (await portAccepts()) {
    opened = true;
  }
  return { opened, timedOut };
}

async function waitReady(proc) {
  const deadline = Date.now() + READY_LIMIT_MS;
  while (Date.now() < deadline) {
    throwIfStopping();
    if (!proc.running()) {
      return "el proceso terminó antes de estar listo";
    }
    if (hasStartupCompleted(proc.output()) && (await portAccepts())) {
      return undefined;
    }
    await delay(POLL_MS);
  }
  return "el proceso no estuvo listo a tiempo";
}

// Cliente TCP crudo: estado, cabeceras en su orden, cuerpo, cierre de la
// conexión y ausencia de respuesta. Las peticiones que deben rechazarse se
// envían como HTTP/1.1 persistente, sin `Connection: close`, para que el cierre
// y su cabecera los decida el servidor y no el cliente. `limitMs` es el tiempo
// total de la petición; al agotarse, la conexión cuenta como no cerrada.
function rawRequest(
  method,
  target,
  { persistent = false, headers = [], limitMs = RESPONSE_LIMIT_MS } = {},
) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;
    const socket = net.connect({ host: HOST, port: PORT });
    const finish = (closed) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(parseResponse(Buffer.concat(chunks), closed));
    };
    const timer = setTimeout(() => finish(false), limitMs);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.once("end", () => finish(true));
    socket.once("close", () => finish(true));
    socket.once("error", () => finish(true));
    socket.once("connect", () => {
      const lines = [
        `${method} ${target} HTTP/1.1`,
        `Host: ${HOST}:${String(PORT)}`,
        ...(persistent ? [] : ["Connection: close"]),
        ...headers,
      ];
      socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    });
  });
}

function parseResponse(raw, closed) {
  const separator = raw.indexOf("\r\n\r\n");
  if (raw.length === 0 || separator === -1) {
    return {
      responded: false,
      closed,
      status: undefined,
      headers: [],
      body: Buffer.alloc(0),
    };
  }
  const [statusLine = "", ...lines] = raw
    .subarray(0, separator)
    .toString("latin1")
    .split("\r\n");
  const headers = lines.map((line) => {
    const colon = line.indexOf(":");
    return [line.slice(0, colon).trim(), line.slice(colon + 1).trim()];
  });
  return {
    responded: true,
    closed,
    status: Number(statusLine.split(" ")[1]),
    headers,
    body: raw.subarray(separator + 4),
  };
}

// Conjunto cerrado de cabeceras: exige las obligatorias con su valor, admite
// las opcionales con su valor permitido y rechaza cualquier otra o repetida.
function headerProblems(response, required, optional) {
  const problems = [];
  const seen = new Set();
  for (const [name, value] of response.headers) {
    const key = name.toLowerCase();
    if (seen.has(key)) {
      problems.push(`cabecera repetida ${name}`);
    }
    seen.add(key);
    if (key in required) {
      if (value !== required[key]) {
        problems.push(`valor inesperado en ${name}`);
      }
    } else if (key in optional) {
      if (!optional[key](value)) {
        problems.push(`valor no admitido en ${name}`);
      }
    } else {
      problems.push(`cabecera no admitida ${name}`);
    }
  }
  for (const key of Object.keys(required)) {
    if (!seen.has(key)) {
      problems.push(`falta la cabecera ${key}`);
    }
  }
  return problems;
}

const anyValue = () => true;
const TRANSPORT = {
  date: anyValue,
  connection: (value) => value === "keep-alive" || value === "close",
  "keep-alive": (value) => value === "timeout=5",
};
const CLOSED_REJECTION = {
  "cache-control": "no-store",
  "content-length": "0",
  connection: "close",
};

function looksLikeHtml(response) {
  return /<html|<!doctype/i.test(response.body.toString("utf8"));
}

function rejectionProblems(response, status) {
  if (!response.responded) {
    return [`sin respuesta (se esperaba ${String(status)})`];
  }
  const problems = [];
  if (response.status !== status) {
    problems.push(
      `estado ${String(response.status)} en lugar de ${String(status)}`,
    );
  }
  problems.push(
    ...headerProblems(
      response,
      status === 405 ? { ...CLOSED_REJECTION, allow: ALLOW } : CLOSED_REJECTION,
      { date: anyValue },
    ),
  );
  if (response.body.length > 0) {
    problems.push("el rechazo tiene cuerpo");
  }
  if (looksLikeHtml(response)) {
    problems.push("el rechazo contiene HTML");
  }
  if (!response.closed) {
    problems.push("la conexión no se cerró");
  }
  return problems;
}

// Calentamiento del modo desarrollo: solo exige una respuesta final y completa
// sobre una conexión que el servidor cierra; su estado y su contrato no se
// evalúan todavía, porque la primera consulta compila la ruta.
function warmupProblems(response) {
  if (!response.responded) {
    return ["el calentamiento no recibió respuesta"];
  }
  const problems = [];
  if (!(response.status >= 200 && response.status <= 599)) {
    problems.push("el calentamiento no recibió una respuesta final");
  }
  const header = (name) =>
    response.headers.find(([key]) => key.toLowerCase() === name)?.[1];
  const length = header("content-length");
  const chunked = /\bchunked\b/i.test(header("transfer-encoding") ?? "");
  if (
    (length !== undefined && response.body.length !== Number(length)) ||
    (length === undefined &&
      chunked &&
      !response.body.toString("latin1").endsWith("0\r\n\r\n"))
  ) {
    problems.push("la respuesta del calentamiento está incompleta");
  }
  if (!response.closed) {
    problems.push("el calentamiento no terminó a tiempo");
  }
  return problems;
}

function successHeaders(bodyLength) {
  return {
    "cache-control": "no-store",
    "content-type": "application/json",
    "content-length": String(bodyLength),
  };
}

function getProblems(response) {
  if (!response.responded) {
    return ["GET sin respuesta"];
  }
  const problems = [];
  if (response.status !== 200) {
    problems.push(`GET respondió ${String(response.status)}`);
  }
  const text = response.body.toString("utf8");
  problems.push(
    ...headerProblems(response, successHeaders(response.body.length), {
      ...TRANSPORT,
      vary: (value) => value === "Accept-Encoding",
    }).map((problem) => `GET: ${problem}`),
  );
  try {
    const body = JSON.parse(text);
    if (
      JSON.stringify(Object.keys(body)) !==
        JSON.stringify(["status", "version"]) ||
      body.status !== "ok" ||
      body.version !== VERSION
    ) {
      problems.push("GET: el cuerpo no es exactamente el del contrato");
    }
  } catch {
    problems.push("GET: el cuerpo no es JSON");
  }
  return problems;
}

async function checkContract() {
  const problems = [];
  const get = await rawRequest("GET", TARGET);
  problems.push(...getProblems(get));

  const head = await rawRequest("HEAD", TARGET);
  if (!head.responded || head.status !== 200) {
    problems.push(`HEAD respondió ${String(head.status)}`);
  } else {
    problems.push(
      ...headerProblems(head, successHeaders(get.body.length), {
        ...TRANSPORT,
        vary: (value) => value === "Accept-Encoding",
      }).map((problem) => `HEAD: ${problem}`),
    );
    if (head.body.length > 0) {
      problems.push("HEAD: la respuesta tiene cuerpo");
    }
  }

  const options = await rawRequest("OPTIONS", TARGET);
  if (!options.responded || options.status !== 204) {
    problems.push(`OPTIONS respondió ${String(options.status)}`);
  } else {
    problems.push(
      ...headerProblems(
        options,
        { allow: ALLOW, "cache-control": "no-store" },
        TRANSPORT,
      ).map((problem) => `OPTIONS: ${problem}`),
    );
    if (options.body.length > 0) {
      problems.push("OPTIONS: la respuesta tiene cuerpo");
    }
  }

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "TRACE"]) {
    const response = await rawRequest(method, TARGET, { persistent: true });
    problems.push(
      ...rejectionProblems(response, 405).map(
        (problem) => `${method}: ${problem}`,
      ),
    );
  }

  for (const target of NON_EXACT_TARGETS) {
    const response = await rawRequest("GET", target, { persistent: true });
    problems.push(
      ...rejectionProblems(response, 404).map(
        (problem) => `GET ${target}: ${problem}`,
      ),
    );
  }
  return problems;
}

const NON_EXACT_TARGETS = [
  "/",
  "/foo",
  "/api",
  "/api/health/",
  "/api/health/extra",
  "/favicon.ico",
  "/404",
  "/500",
  "/_error",
  "/_not-found",
  "/_next/data/compilacion/index.json",
  "/_next/image?url=%2Ffavicon.ico&w=64&q=75",
  "/_next/static/chunks/main.js",
  "/__nextjs_original-stack-frame",
  "/api/health.rsc",
];

// Casos.

// `npm start` o `npm run dev` con una configuración inválida: termina con
// código distinto de 0 en menos de 20 s, el puerto nunca acepta conexiones y
// la salida nombra la clave y el problema sin filtrar nada.
async function invalidStart(
  variables,
  key,
  problem,
  { args = ["start"], cwd = ROOT } = {},
) {
  await ensurePortFree();
  const proc = launch(NPM, args, caseEnvironment(variables), cwd);
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (code === 0) {
    problems.push("terminó con código 0");
  }
  if (!output.includes(key) || !output.includes(problem)) {
    problems.push(`la salida no nombra ${key} y ${problem}`);
  }
  if (hasStartupCompleted(output)) {
    problems.push("se registró startup.completed");
  }
  problems.push(...leakProblems(output));
  return problems;
}

// El preflight con un `NODE_ENV` distinto del modo termina con código 1 y
// nombra `NODE_ENV` y `mode_mismatch` sin el valor recibido.
async function preflightMismatch(
  nodeEnv,
  { mode = "start", cwd = ROOT, variables = VALID_CONFIG } = {},
) {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["scripts/preflight.mjs", mode],
    caseEnvironment({ ...variables, NODE_ENV: nodeEnv }),
    cwd,
  );
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (code !== 1) {
    problems.push(`terminó con código ${String(code)} en lugar de 1`);
  }
  problems.push(...mismatchProblems(output, nodeEnv));
  if (hasStartupCompleted(output)) {
    problems.push("el preflight registró startup.completed");
  }
  problems.push(...leakProblems(output));
  return problems;
}

// Un rechazo por `NODE_ENV` discordante nombra `NODE_ENV` y `mode_mismatch`
// sin mostrar el valor recibido.
function mismatchProblems(output, nodeEnv) {
  const problems = [];
  if (!output.includes("NODE_ENV") || !output.includes("mode_mismatch")) {
    problems.push("la salida no nombra NODE_ENV y mode_mismatch");
  }
  if (new RegExp(`\\b${nodeEnv}\\b`).test(output)) {
    problems.push("la salida contiene el valor recibido");
  }
  return problems;
}

// Defensa interna de `server.mjs`, ejecutado directamente solo para esta
// comprobación: con `NODE_ENV=test` termina con un código distinto de 0, sin
// abrir el puerto, rechazando `NODE_ENV` con `mode_mismatch` y sin filtrar
// nada. Un `server.mjs` ausente no la satisface.
async function serverDefense() {
  await ensurePortFree();
  const proc = launch(
    process.execPath,
    ["server.mjs"],
    caseEnvironment({
      ...VALID_CONFIG,
      NODE_ENV: "test",
      NEXT_TELEMETRY_DISABLED: "1",
    }),
  );
  const problems = [];
  try {
    const { opened, timedOut } = await watchNeverOpens(proc);
    if (timedOut) {
      problems.push("no terminó en menos de 20 s");
    }
    if (opened) {
      problems.push("el puerto aceptó conexiones");
    }
  } finally {
    await stop(proc);
  }
  const { code } = await exitResult(proc);
  const output = proc.output();
  if (typeof code !== "number" || code === 0) {
    problems.push(`terminó con código ${String(code)}`);
  }
  problems.push(...mismatchProblems(output, "test"));
  if (hasStartupCompleted(output)) {
    problems.push("se registró startup.completed");
  }
  problems.push(...leakProblems(output));
  return problems;
}

// `npm start` válido. Con `full`, recorre el contrato completo; si no, solo
// el `GET` del contrato. En ningún caso se registra nada por las consultas.
async function validStart(variables, full) {
  await ensurePortFree();
  const proc = launch(
    NPM,
    ["start"],
    caseEnvironment({ ...VALID_CONFIG, ...variables }),
  );
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      const mark = proc.output().length;
      if (full) {
        problems.push(...(await checkContract()));
      } else {
        problems.push(...getProblems(await rawRequest("GET", TARGET)));
      }
      if (proc.output().slice(mark).trim() !== "") {
        problems.push("se registró algo por las consultas");
      }
    }
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  return problems;
}

// Modo desarrollo (T026), en la copia temporal.
const DEVELOPMENT_TARGETS = [
  "/",
  "/api/health/",
  "/_next/static/chunks/main.js",
  "/__nextjs_original-stack-frame",
  "/__nextjs_source-map",
];
const DEVELOPMENT_RELOAD = "/_next/webpack-hmr";
const TEST_ONLY_KEY = "AULANORMA_SOLO_PARA_TEST";

function envFile(variables) {
  return Object.entries(variables)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
}

function writeDevelopmentConfig(variables) {
  writeFileSync(
    path.join(developmentCopy, ".env.development.local"),
    envFile(variables),
  );
}

function fingerprint(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

// Caché ya poblada para `npm ci`: la que indica npm al proceso o, si no, la
// ruta por defecto de npm. Debe ser un directorio legible.
function sourceNpmCache() {
  const configured = process.env.npm_config_cache;
  const candidate =
    configured !== undefined && configured !== ""
      ? path.resolve(configured)
      : path.join(os.homedir(), ".npm");
  hidePath(candidate, "<caché de npm>");
  try {
    if (!statSync(candidate).isDirectory()) {
      return undefined;
    }
    accessSync(candidate, constants.R_OK | constants.X_OK);
  } catch {
    return undefined;
  }
  return candidate;
}

// Crea la copia con los ficheros regulares que Git no ignora, añade el
// `.env.test` señuelo e instala las dependencias con `npm ci`.
async function prepareDevelopmentCopy() {
  throwIfStopping();
  const cache = sourceNpmCache();
  if (cache === undefined) {
    return {
      ready: false,
      problems: [
        "la caché de npm no existe, no es un directorio o no puede leerse",
      ],
    };
  }
  let files;
  try {
    files = [
      ...new Set(
        gitOutput([
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
        ])
          .toString("utf8")
          .split("\0")
          .filter((name) => name !== ""),
      ),
    ].sort();
  } catch (error) {
    if (error instanceof StopRequested) {
      throw error;
    }
    return {
      ready: false,
      problems: ["no se pudo obtener la lista de ficheros"],
    };
  }
  throwIfStopping();
  try {
    developmentCopy = mkdtempSync(
      path.join(os.tmpdir(), "aulanorma-desarrollo-"),
    );
    hidePath(developmentCopy, "<copia de desarrollo>");
    for (const name of files) {
      const source = path.join(ROOT, name);
      if (!existsSync(source) || !lstatSync(source).isFile()) {
        continue;
      }
      const destination = path.join(developmentCopy, name);
      mkdirSync(path.dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
    writeFileSync(
      path.join(developmentCopy, ".env.test"),
      envFile({ [TEST_ONLY_KEY]: SENTINEL }),
    );
  } catch {
    return { ready: false, problems: ["no se pudo crear la copia"] };
  }
  const manifests = ["package-lock.json", "package.json"].map((name) =>
    path.join(developmentCopy, name),
  );
  let before;
  try {
    before = manifests.map(fingerprint);
  } catch {
    return {
      ready: false,
      problems: ["la copia no contiene package.json y package-lock.json"],
    };
  }
  throwIfStopping();
  // Los registros de `npm ci` van al temporal del arnés, no a la caché real.
  const install = launch(
    NPM,
    ["ci", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund"],
    {
      ...isolatedEnvironment(cache),
      npm_config_logs_dir: path.join(sandbox, "npm-logs"),
    },
    developmentCopy,
  );
  let finished;
  try {
    finished = await waitUntil(
      () => stopping() || !install.running(),
      INSTALL_LIMIT_MS,
    );
  } finally {
    await stop(install);
  }
  throwIfStopping();
  const { code } = await exitResult(install);
  if (!finished) {
    return { ready: false, problems: ["npm ci no terminó a tiempo"] };
  }
  if (code !== 0) {
    return { ready: false, problems: ["npm ci falló"] };
  }
  const problems = [];
  try {
    const after = manifests.map(fingerprint);
    if (after[0] !== before[0]) {
      problems.push("npm ci modificó package-lock.json");
    }
    if (after[1] !== before[1]) {
      problems.push("npm ci modificó package.json");
    }
  } catch {
    problems.push("npm ci eliminó package.json o package-lock.json");
  }
  return { ready: true, problems };
}

// Estado del repositorio original: `git status`, `next-env.d.ts`,
// `tsconfig.json`, los `.env*` de la raíz y un manifiesto completo de `.next`
// (rutas, tipo, tamaño y contenido), sin seguir enlaces simbólicos.
function addEntry(hash, base, relative) {
  const full = path.join(base, relative);
  let stats;
  try {
    stats = lstatSync(full);
  } catch {
    hash.update(`ausente\0${relative}\0`);
    return;
  }
  if (stats.isSymbolicLink()) {
    hash.update(`enlace\0${relative}\0${readlinkSync(full)}\0`);
  } else if (stats.isDirectory()) {
    hash.update(`directorio\0${relative}\0`);
    for (const name of readdirSync(full).sort()) {
      addEntry(hash, base, path.join(relative, name));
    }
  } else if (stats.isFile()) {
    hash.update(`fichero\0${relative}\0${String(stats.size)}\0`);
    hash.update(readFileSync(full));
    hash.update("\0");
  } else {
    hash.update(`otro\0${relative}\0`);
  }
}

function digest(update) {
  const hash = createHash("sha256");
  update(hash);
  return hash.digest("hex");
}

function snapshotOriginal() {
  return {
    "el estado de Git": digest((hash) =>
      hash.update(
        gitOutput([
          "--no-optional-locks",
          "status",
          "--porcelain=v1",
          "-z",
          "--untracked-files=all",
        ]),
      ),
    ),
    "next-env.d.ts": digest((hash) => {
      addEntry(hash, ROOT, "next-env.d.ts");
    }),
    "tsconfig.json": digest((hash) => {
      addEntry(hash, ROOT, "tsconfig.json");
    }),
    "los ficheros .env*": digest((hash) => {
      for (const name of readdirSync(ROOT)
        .filter((entry) => entry.startsWith(".env"))
        .sort()) {
        addEntry(hash, ROOT, name);
      }
    }),
    ".next": digest((hash) => {
      addEntry(hash, ROOT, ".next");
    }),
  };
}

async function developmentInvalidStart(fileVariables, variables, key, problem) {
  writeDevelopmentConfig(fileVariables);
  return invalidStart(variables, key, problem, {
    args: ["run", "dev"],
    cwd: developmentCopy,
  });
}

// `npm run dev` válido: calentamiento con la primera consulta, que compila la
// ruta, y después el `GET` del contrato. Con `full`, también la muestra de
// destinos no exactos y el `Upgrade` de recarga de desarrollo.
async function developmentStart(variables, full) {
  await ensurePortFree();
  writeDevelopmentConfig(VALID_CONFIG);
  const proc = launch(
    NPM,
    ["run", "dev"],
    caseEnvironment(variables),
    developmentCopy,
  );
  const problems = [];
  try {
    const failure = await waitReady(proc);
    if (failure !== undefined) {
      problems.push(failure);
    } else {
      problems.push(
        ...warmupProblems(
          await rawRequest("GET", TARGET, { limitMs: WARMUP_LIMIT_MS }),
        ),
      );
      problems.push(...getProblems(await rawRequest("GET", TARGET)));
      if (full) {
        for (const target of DEVELOPMENT_TARGETS) {
          const response = await rawRequest("GET", target, {
            persistent: true,
          });
          problems.push(
            ...rejectionProblems(response, 404).map(
              (problem) => `GET ${target}: ${problem}`,
            ),
          );
        }
        const upgrade = await rawRequest("GET", DEVELOPMENT_RELOAD, {
          persistent: true,
          headers: [
            "Connection: Upgrade",
            "Upgrade: websocket",
            "Sec-WebSocket-Version: 13",
            `Sec-WebSocket-Key: ${randomBytes(16).toString("base64")}`,
          ],
        });
        problems.push(
          ...rejectionProblems(upgrade, 404).map(
            (problem) => `Upgrade ${DEVELOPMENT_RELOAD}: ${problem}`,
          ),
        );
      }
    }
  } finally {
    await stop(proc);
  }
  if (!(await waitUntil(async () => !(await portAccepts()), STOP_LIMIT_MS))) {
    problems.push("el puerto sigue abierto tras detener el servidor");
  }
  return problems;
}

const DEVELOPMENT_CASES = [
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL fuera de la lista en el fichero",
    () =>
      developmentInvalidStart(
        { AULANORMA_LOG_LEVEL: SENTINEL, AULANORMA_ENVIRONMENT: "ci" },
        {},
        "AULANORMA_LOG_LEVEL",
        "invalid_value",
      ),
  ],
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL ausente del fichero",
    () =>
      developmentInvalidStart(
        { AULANORMA_ENVIRONMENT: "ci" },
        {},
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm run dev inválido: AULANORMA_LOG_LEVEL vacía en el proceso sobre un fichero válido",
    () =>
      developmentInvalidStart(
        VALID_CONFIG,
        { AULANORMA_LOG_LEVEL: "" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "preflight dev con NODE_ENV=test",
    () => {
      writeDevelopmentConfig(VALID_CONFIG);
      return preflightMismatch("test", {
        mode: "dev",
        cwd: developmentCopy,
        variables: {},
      });
    },
  ],
  [
    "npm run dev válido: calentamiento, contrato, destinos y Upgrade",
    () => developmentStart({}, true),
  ],
  [
    "npm run dev con NODE_ENV heredado test",
    () => developmentStart({ NODE_ENV: "test" }, false),
  ],
  [
    "npm run dev con NODE_ENV heredado production",
    () => developmentStart({ NODE_ENV: "production" }, false),
  ],
];

const CASES = [
  [
    "npm start inválido: AULANORMA_LOG_LEVEL ausente",
    () =>
      invalidStart(
        { AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL vacía",
    () =>
      invalidStart(
        { AULANORMA_LOG_LEVEL: "", AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "missing",
      ),
  ],
  [
    "npm start inválido: AULANORMA_LOG_LEVEL con un valor fuera de la lista",
    () =>
      invalidStart(
        { AULANORMA_LOG_LEVEL: SENTINEL, AULANORMA_ENVIRONMENT: "ci" },
        "AULANORMA_LOG_LEVEL",
        "invalid_value",
      ),
  ],
  [
    "npm start inválido: clave AULANORMA_ desconocida",
    () =>
      invalidStart(
        { ...VALID_CONFIG, AULANORMA_CLAVE_DESCONOCIDA: SENTINEL },
        "AULANORMA_CLAVE_DESCONOCIDA",
        "unknown_key",
      ),
  ],
  ["preflight start con NODE_ENV=test", () => preflightMismatch("test")],
  [
    "preflight start con NODE_ENV=development",
    () => preflightMismatch("development"),
  ],
  ["server.mjs directo con NODE_ENV=test", () => serverDefense()],
  [
    "npm start válido: contrato, métodos y destinos",
    () => validStart({}, true),
  ],
  [
    "npm start con NODE_ENV heredado development",
    () => validStart({ NODE_ENV: "development" }, false),
  ],
  [
    "npm start con NODE_ENV heredado test",
    () => validStart({ NODE_ENV: "test" }, false),
  ],
];

// Termina cualquier grupo que siga vivo y comprueba que no queda nada. Revisa
// los grupos registrados hasta que no queda ninguno: cada uno sale de
// `launched` solo cuando se confirma que ya no existe.
async function cleanup() {
  const leftovers = new Set();
  const groupsEnded = await waitUntil(() => {
    for (const child of launched) {
      if (groupAlive(child.pid)) {
        leftovers.add(child.pid);
        signalGroup(child.pid, "SIGKILL");
      } else {
        launched.delete(child);
      }
    }
    return launched.size === 0;
  }, STOP_LIMIT_MS);
  const portClosed = await waitUntil(
    async () => !(await portAccepts()),
    STOP_LIMIT_MS,
  );
  const temporariesRemoved = await waitUntil(removeTemporaries, STOP_LIMIT_MS);
  return {
    leftovers: leftovers.size,
    groupsEnded,
    portClosed,
    temporariesRemoved,
  };
}

// Una única limpieza, compartida por el final de `main` y por las señales.
let cleanupRun;

function cleanupOnce() {
  cleanupRun ??= cleanup();
  return cleanupRun;
}

let failures = 0;

function report(name, problems) {
  if (problems.length === 0) {
    print(`ok  ${name}`);
    return;
  }
  failures += 1;
  print(`ERR ${name}`);
  for (const problem of problems) {
    print(`    - ${problem}`);
  }
}

// Fase de desarrollo: se ejecuta aunque la de producción haya fallado. La
// copia se elimina siempre, y el repositorio original debe quedar idéntico.
async function runDevelopment() {
  throwIfStopping();
  let before;
  try {
    before = snapshotOriginal();
  } catch (error) {
    if (error instanceof StopRequested) {
      throw error;
    }
    before = undefined;
  }
  try {
    const { ready, problems } = await prepareDevelopmentCopy();
    throwIfStopping();
    report("copia de desarrollo: creación, npm ci y manifiestos", problems);
    for (const [name, run] of DEVELOPMENT_CASES) {
      throwIfStopping();
      const caseProblems = ready
        ? await run()
        : ["la copia de desarrollo no está disponible"];
      throwIfStopping();
      report(name, caseProblems);
    }
  } finally {
    removeDirectory(developmentCopy);
  }
  throwIfStopping();
  let integrity;
  if (before === undefined) {
    integrity = ["no se pudo capturar el repositorio original antes"];
  } else {
    try {
      const after = snapshotOriginal();
      integrity = Object.keys(before)
        .filter((item) => before[item] !== after[item])
        .map((item) => `cambió ${item} del repositorio original`);
    } catch (error) {
      if (error instanceof StopRequested) {
        throw error;
      }
      integrity = ["no se pudo capturar el repositorio original después"];
    }
  }
  report("repositorio original intacto durante el modo desarrollo", integrity);
}

async function main() {
  const present = PRODUCTION_ENV_FILES.filter((name) =>
    existsSync(path.join(ROOT, name)),
  );
  if (present.length > 0) {
    print(
      `La prueba de humo se niega a ejecutarse: existen ficheros de entorno de producción (${present.join(", ")}). Elimínalos o muévelos fuera del repositorio.`,
    );
    return 1;
  }
  searchPath = process.env.PATH;
  if (searchPath === undefined || searchPath === "") {
    print(
      "La prueba de humo no puede ejecutarse: falta PATH o está vacío, y sin él no se localizan npm ni node.",
    );
    return 1;
  }
  try {
    throwIfStopping();
    createSandbox();
    for (const [name, run] of CASES) {
      throwIfStopping();
      const problems = await run();
      throwIfStopping();
      report(name, problems);
    }
    throwIfStopping();
    await runDevelopment();
  } catch (error) {
    if (!stopping()) {
      failures += 1;
      print(
        error instanceof FatalError
          ? error.message
          : "La prueba de humo se interrumpió por un error inesperado.",
      );
    }
  } finally {
    const { leftovers, groupsEnded, portClosed, temporariesRemoved } =
      await cleanupOnce();
    // Tras una señal, el grupo del caso en curso sigue vivo por diseño; solo
    // es un fallo si la limpieza no consigue terminarlo.
    if (leftovers > 0 && !stopping()) {
      failures += 1;
      print(`ERR quedaban ${String(leftovers)} grupos de procesos vivos`);
    }
    if (!groupsEnded) {
      failures += 1;
      print(`ERR siguen vivos ${String(launched.size)} grupos de procesos`);
    }
    if (!portClosed) {
      failures += 1;
      print(`ERR el puerto ${HOST}:${String(PORT)} sigue abierto`);
    }
    if (!temporariesRemoved) {
      failures += 1;
      print("ERR no se pudieron eliminar los temporales del arnés");
    }
  }
  if (stopping()) {
    print(`Prueba de humo interrumpida por ${stopSignal}.`);
    return STOP_CODES[stopSignal];
  }
  print(
    failures === 0
      ? `Prueba de humo superada: ${String(CASES.length + DEVELOPMENT_CASES.length)} casos.`
      : `Prueba de humo fallida: ${String(failures)} fallos.`,
  );
  return failures === 0 ? 0 : 1;
}

// La primera señal marca la detención y fija el código; todas comparten la
// misma limpieza. El código de salida se establece cuando esta termina, sin
// `process.exit`, para no interrumpirla.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopSignal ??= signal;
    void cleanupOnce().then(() => {
      process.exitCode = STOP_CODES[stopSignal];
    });
  });
}

process.exitCode = await main();
